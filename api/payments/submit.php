<?php
/**
 * api/payments/submit.php
 * POST /api/payments/submit - Customer UPI / Bank Transfer payment proof submission
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/FileStorageService.php';
require_once __DIR__ . '/../services/KpiService.php';

$user = Auth::requireAuth();
$isStaff = in_array(strtolower((string)($user['role'] ?? '')), ['admin', 'super_admin', 'manager', 'executive', 'accountant', 'accounts'], true);

// Support multipart/form-data and JSON
$input = $_POST;
if (empty($input)) {
    $raw = json_decode((string)file_get_contents('php://input'), true);
    if (is_array($raw)) {
        $input = $raw;
    }
}

$bookingId = trim((string)($input['bookingId'] ?? $input['bookingNumber'] ?? ''));
$amount = round((float)($input['amount'] ?? $input['paymentAmount'] ?? 0.00), 2);
$method = trim((string)($input['paymentMethod'] ?? $input['method'] ?? 'upi'));
$utr = trim((string)($input['transactionReference'] ?? $input['utr'] ?? $input['paymentRef'] ?? ''));

if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$cleanId = ltrim($bookingId, '#');
$bk = Database::fetchOne(
    "SELECT * FROM bookings
     WHERE booking_id = ? OR booking_number = ? OR id = ? OR REPLACE(booking_id, '#', '') = ? OR REPLACE(booking_number, '#', '') = ?
     LIMIT 1",
    [$bookingId, $bookingId, is_numeric($cleanId) ? (int)$cleanId : 0, $cleanId, $cleanId]
);

// Do NOT silently invent a synthetic booking record when the target booking doesn't exist
if (!$bk) {
    sendErrorResponse("Booking '$bookingId' not found.", 404);
}
if (!$isStaff && ($bk['firebase_uid'] ?? '') !== ($user['firebase_uid'] ?? '')) {
    sendErrorResponse('You do not have permission to submit payment for this booking.', 403);
}
if (in_array(strtolower((string)($bk['status'] ?? '')), ['cancelled', 'rejected'], true)
    || in_array(strtolower((string)($bk['payment_status'] ?? '')), ['cancelled', 'rejected', 'refunded'], true)) {
    sendErrorResponse('Cannot submit payment for a cancelled or refunded booking.', 400);
}

$canonicalBookingId = (string)($bk['booking_id'] ?: $bk['booking_number'] ?: $bookingId);
if ($amount <= 0) {
    $fin = KpiService::computeBookingFinancials($bk);
    $amount = ($bk['payment_plan'] === 'advance' && (float)$bk['advance_amount'] > 0 && $fin['verified_collected'] <= 0.0)
        ? (float)$bk['advance_amount']
        : (float)$fin['outstanding_amount'];
}
if ($amount <= 0) {
    sendErrorResponse('Valid positive payment amount is required.', 400);
}

// Prevent duplicate payment submissions for the same booking and UTR
if ($utr !== '') {
    $dupPayment = Database::fetchOne(
        "SELECT id, payment_id, status FROM payments
         WHERE (booking_id = ? OR REPLACE(booking_id, '#', '') = ?)
           AND UPPER(TRIM(COALESCE(utr, payment_ref, ''))) = UPPER(?)
           AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'verified')
         LIMIT 1",
        [$canonicalBookingId, $cleanId, $utr]
    );
    if ($dupPayment) {
        sendErrorResponse("Payment reference '$utr' was already submitted for booking $canonicalBookingId.", 409);
    }
}

// Handle screenshot upload if sent directly in files
$screenshotUrl = trim((string)($input['screenshotUrl'] ?? $input['paymentScreenshotUrl'] ?? ''));
$screenshotMediaId = trim((string)($input['screenshotMediaId'] ?? ''));

if (isset($_FILES['screenshot']) && $_FILES['screenshot']['error'] === UPLOAD_ERR_OK) {
    try {
        $uploadResult = FileStorageService::handleUpload($_FILES['screenshot'], $user['firebase_uid'], 'payment_proof', $canonicalBookingId);
        $screenshotUrl = $uploadResult['url'];
        $screenshotMediaId = $uploadResult['mediaId'];
    } catch (Exception $e) {
        sendErrorResponse('Screenshot upload failed: ' . $e->getMessage(), 400);
    }
}

$paymentId = 'PAY-' . strtoupper(bin2hex(random_bytes(6)));

try {
    Database::transaction(function($pdo) use ($paymentId, $canonicalBookingId, $bk, $user, $amount, $method, $utr, $screenshotUrl, $screenshotMediaId, $input) {
        $maxRow = Database::fetchOne("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM payments");
        $nextId = (int)($maxRow['next_id'] ?? 1);

        // 1. Insert pending proof into payments table (remains unverified until admin/accounts approval)
        $stmt = $pdo->prepare(
            "INSERT INTO payments (id, payment_id, booking_id, firebase_uid, amount, method, utr, payment_ref, screenshot_url, screenshot_media_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
        );
        $stmt->execute([
            $nextId, $paymentId, $canonicalBookingId, $user['firebase_uid'], $amount, $method, $utr, $utr,
            $screenshotUrl ?: null, $screenshotMediaId ?: null
        ]);

        // 2. Flag booking as pending_verification WITHOUT zeroing remaining_balance before verification
        $plan = trim((string)($input['paymentPlan'] ?? $bk['payment_plan'] ?? ''));
        if (!$plan) {
            $plan = $amount <= 500 ? 'advance' : 'full';
        }
        $updateFields = [
            "payment_status = 'pending_verification'",
            "payment_ref = COALESCE(NULLIF(?, ''), payment_ref)",
            "payment_screenshot_url = COALESCE(?, payment_screenshot_url)",
            "updated_at = CURRENT_TIMESTAMP"
        ];
        $params = [$utr, $screenshotUrl ?: null];
        if ($plan === 'full' || $plan === 'advance') {
            $updateFields[] = "payment_plan = ?";
            $params[] = $plan;
        }
        $params[] = $bk['id'];
        $stmt2 = $pdo->prepare("UPDATE bookings SET " . implode(", ", $updateFields) . " WHERE id = ?");
        $stmt2->execute($params);
    });

    // Automated KPI metrics sync into MySQL kpi_metrics table
    try {
        KpiService::syncMetrics();
    } catch (Throwable $_) {}

    sendJsonResponse([
        'success' => true,
        'message' => 'Payment receipt submitted successfully. Awaiting admin verification.',
        'paymentId' => $paymentId,
        'status' => 'pending'
    ], 201);
} catch (Exception $e) {
    error_log("[Payment Submit Error] " . $e->getMessage());
    sendErrorResponse('Failed to submit payment: ' . $e->getMessage(), 500);
}
