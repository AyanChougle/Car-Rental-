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

if ($amount <= 0 && $bookingId) {
    $bk = Database::fetchOne("SELECT final_amount, advance_amount, payment_plan, total_amount FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1", [$bookingId, $bookingId]);
    if ($bk) {
        $amount = ($bk['payment_plan'] === 'advance' && (float)$bk['advance_amount'] > 0) ? (float)$bk['advance_amount'] : (float)($bk['final_amount'] ?: $bk['total_amount']);
    }
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
        $maxRow = Database::fetchOne("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM payments");
        $nextId = (int)($maxRow['next_id'] ?? 1);

        // 1. Insert into payments table
        $stmt = $pdo->prepare(
            "INSERT INTO payments (id, payment_id, booking_id, firebase_uid, amount, method, utr, payment_ref, screenshot_url, screenshot_media_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
        );
        $stmt->execute([
            $nextId, $paymentId, $bookingId, $user['firebase_uid'], $amount, $method, $utr, $utr,
            $screenshotUrl ?: null, $screenshotMediaId ?: null
        ]);

        // 2. Ensure booking record exists in bookings table
        $existing = Database::fetchOne(
            "SELECT id FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
            [$bookingId, $bookingId]
        );

        if ($existing) {
            $stmt2 = $pdo->prepare(
                "UPDATE bookings SET
                    payment_status = 'pending_verification',
                    payment_ref = ?,
                    payment_screenshot_url = COALESCE(?, payment_screenshot_url),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE booking_id = ? OR booking_number = ?"
            );
            $stmt2->execute([$utr, $screenshotUrl ?: null, $bookingId, $bookingId]);
        } else {
            // Auto-create booking shell so it never goes missing
            $bMaxRow = Database::fetchOne("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM bookings");
            $bNextId = (int)($bMaxRow['next_id'] ?? 1);
            $plan = $amount <= 500 ? 'advance' : 'full';
            $uId = (!empty($user['id']) && (int)$user['id'] > 0) ? (int)$user['id'] : null;
            $now = date('Y-m-d H:i:s');
            $nextDay = date('Y-m-d H:i:s', strtotime('+1 day'));

            $vReg = trim((string)($input['vehicleReg'] ?? $input['carId'] ?? 'BMW-320D'));
            $vRow = Database::fetchOne("SELECT id, brand, model, category FROM vehicles WHERE reg_no = ? LIMIT 1", [$vReg]);
            $vId = $vRow ? (int)$vRow['id'] : null;
            $vName = $vRow ? ($vRow['brand'] . ' ' . $vRow['model']) : 'BMW 3 Series';
            $vCat = $vRow ? $vRow['category'] : 'Luxury Sedan';

            $stmt2 = $pdo->prepare(
                "INSERT INTO bookings (
                    id, booking_id, booking_number, user_id, firebase_uid, user_name, user_email, user_phone,
                    vehicle_id, vehicle_reg, vehicle_name, vehicle_category, pickup_date, drop_date,
                    duration, days, hours, with_driver, base_amount, total_amount, final_amount,
                    advance_amount, remaining_balance, remaining_amount, payment_plan, payment_status,
                    status, booking_status, location, security_deposit, payment_ref, payment_screenshot_url, created_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '1 Day', 1, 24, 0,
                    ?, ?, ?, ?, 0.00, 0.00, ?, 'pending_verification',
                    'pending_verification', 'pending_verification', 'Gavson Business Park, Ghansoli', 0.00, ?, ?, ?
                ) ON DUPLICATE KEY UPDATE
                    payment_status = 'pending_verification',
                    payment_ref = VALUES(payment_ref),
                    payment_screenshot_url = COALESCE(VALUES(payment_screenshot_url), payment_screenshot_url),
                    updated_at = CURRENT_TIMESTAMP"
            );
            $stmt2->execute([
                $bNextId, $bookingId, $bookingId, $uId, $user['firebase_uid'], $user['name'] ?: 'Customer',
                $user['email'], $user['phone'] ?: null, $vId, $vReg, $vName, $vCat, $now, $nextDay,
                $amount, $amount, $amount, $amount, $plan, $utr, $screenshotUrl ?: null, $now
            ]);
        }
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
