<?php
/**
 * api/payments/submit.php
 * POST /api/payments/submit - Customer UPI / Bank Transfer payment proof submission
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/FileStorageService.php';

$user = Auth::requireAuth();

// Support multipart/form-data and JSON
$input = $_POST;
if (empty($input)) {
    $raw = json_decode((string)file_get_contents('php://input'), true);
    if (is_array($raw)) {
        $input = $raw;
    }
}

$bookingId = trim((string)($input['bookingId'] ?? $input['bookingNumber'] ?? ''));
$amount = (float)($input['amount'] ?? $input['paymentAmount'] ?? 0.00);
$method = trim((string)($input['paymentMethod'] ?? $input['method'] ?? 'upi'));
$utr = trim((string)($input['transactionReference'] ?? $input['utr'] ?? $input['paymentRef'] ?? ''));

if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

// Handle screenshot upload if sent directly in files
$screenshotUrl = trim((string)($input['screenshotUrl'] ?? $input['paymentScreenshotUrl'] ?? ''));
$screenshotMediaId = trim((string)($input['screenshotMediaId'] ?? ''));

if (isset($_FILES['screenshot']) && $_FILES['screenshot']['error'] === UPLOAD_ERR_OK) {
    try {
        $uploadResult = FileStorageService::handleUpload($_FILES['screenshot'], $user['firebase_uid'], 'payment_proof', $bookingId);
        $screenshotUrl = $uploadResult['url'];
        $screenshotMediaId = $uploadResult['mediaId'];
    } catch (Exception $e) {
        sendErrorResponse('Screenshot upload failed: ' . $e->getMessage(), 400);
    }
}

$paymentId = 'PAY-' . strtoupper(bin2hex(random_bytes(6)));

try {
    Database::transaction(function($pdo) use ($paymentId, $bookingId, $user, $amount, $method, $utr, $screenshotUrl, $screenshotMediaId) {
        // 1. Insert into payments table
        $stmt = $pdo->prepare(
            "INSERT INTO payments (payment_id, booking_id, firebase_uid, amount, method, utr, payment_ref, screenshot_url, screenshot_media_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
        );
        $stmt->execute([
            $paymentId, $bookingId, $user['firebase_uid'], $amount, $method, $utr, $utr,
            $screenshotUrl ?: null, $screenshotMediaId ?: null
        ]);

        // 2. Update booking payment status
        $stmt2 = $pdo->prepare(
            "UPDATE bookings SET
                payment_status = 'pending_verification',
                payment_ref = ?,
                payment_screenshot_url = COALESCE(?, payment_screenshot_url),
                updated_at = CURRENT_TIMESTAMP
             WHERE booking_id = ? OR booking_number = ?"
        );
        $stmt2->execute([$utr, $screenshotUrl ?: null, $bookingId, $bookingId]);
    });

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
