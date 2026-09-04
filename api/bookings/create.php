<?php
/**
 * api/bookings/create.php
 * POST /api/bookings - Create a reservation transactionally
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$bookingId = trim((string)($input['bookingId'] ?? $input['bookingNumber'] ?? ''));
if (!$bookingId) {
    $bookingId = 'BK-' . strtoupper(bin2hex(random_bytes(5)));
}
$bookingNumber = $bookingId;

$vehicleReg = strtoupper(trim((string)($input['vehicleReg'] ?? $input['carId'] ?? '')));
$pickupDate = date('Y-m-d H:i:s', strtotime((string)($input['pickupDate'] ?? 'now')));
$dropDate = date('Y-m-d H:i:s', strtotime((string)($input['dropDate'] ?? '+1 day')));
$duration = trim((string)($input['duration'] ?? '1 Day'));
$days = (int)($input['days'] ?? $input['durationDays'] ?? 1);
$hours = (int)($input['hours'] ?? ($days * 24));
$withDriver = (int)($input['withDriver'] ?? 0);
$baseAmount = (float)($input['baseAmount'] ?? $input['rentalTotal'] ?? 0.00);
$totalAmount = (float)($input['totalAmount'] ?? $input['finalAmount'] ?? $baseAmount);
$advanceAmount = (float)($input['advanceAmount'] ?? 0.00);
$remainingBalance = (float)($input['remainingBalance'] ?? $input['remainingAmount'] ?? ($totalAmount - $advanceAmount));
$securityDeposit = (float)($input['securityDeposit'] ?? 0.00);
$couponCode = trim((string)($input['couponCode'] ?? ''));
$couponDiscount = (float)($input['couponDiscount'] ?? 0.00);
$paymentPlan = trim((string)($input['paymentPlan'] ?? 'full'));
$paymentStatus = trim((string)($input['paymentStatus'] ?? 'pending_payment'));
$status = trim((string)($input['status'] ?? 'pending_payment'));
$location = trim((string)($input['location'] ?? 'Gavson Business Park, Ghansoli'));

// Fetch vehicle
$vehicle = Database::fetchOne("SELECT * FROM vehicles WHERE reg_no = ? LIMIT 1", [$vehicleReg]);
$vehicleId = $vehicle['id'] ?? null;
$vehicleName = $vehicle ? ($vehicle['brand'] . ' ' . $vehicle['model']) : ($input['vehicleName'] ?? 'Vehicle');
$vehicleCategory = $vehicle ? $vehicle['category'] : ($input['vehicleCategory'] ?? 'Sedan');

try {
    Database::transaction(function($pdo) use (
        $bookingId, $bookingNumber, $user, $vehicleId, $vehicleReg, $vehicleName, $vehicleCategory,
        $pickupDate, $dropDate, $duration, $days, $hours, $withDriver, $baseAmount, $couponCode,
        $couponDiscount, $totalAmount, $advanceAmount, $remainingBalance, $paymentPlan, $paymentStatus,
        $status, $location, $securityDeposit, $input
    ) {
        // 1. Insert or update booking
        $stmt = $pdo->prepare(
            "INSERT INTO bookings (
                booking_id, booking_number, user_id, firebase_uid, user_name, user_email, user_phone,
                vehicle_id, vehicle_reg, vehicle_name, vehicle_category, pickup_date, drop_date,
                duration, days, hours, with_driver, base_amount, coupon_code, coupon_discount,
                total_amount, final_amount, advance_amount, remaining_balance, remaining_amount,
                payment_plan, payment_status, status, booking_status, location, security_deposit,
                payment_screenshot_url
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            ) ON DUPLICATE KEY UPDATE
                payment_status = VALUES(payment_status),
                status = VALUES(status),
                advance_amount = VALUES(advance_amount),
                remaining_balance = VALUES(remaining_balance),
                payment_screenshot_url = COALESCE(VALUES(payment_screenshot_url), payment_screenshot_url),
                updated_at = CURRENT_TIMESTAMP"
        );

        $stmt->execute([
            $bookingId, $bookingNumber, $user['id'], $user['firebase_uid'], $user['name'] ?: $user['email'],
            $user['email'], $user['phone'], $vehicleId, $vehicleReg, $vehicleName, $vehicleCategory,
            $pickupDate, $dropDate, $duration, $days, $hours, $withDriver, $baseAmount, $couponCode ?: null,
            $couponDiscount, $totalAmount, $totalAmount, $advanceAmount, $remainingBalance, $remainingBalance,
            $paymentPlan, $paymentStatus, $status, $status, $location, $securityDeposit,
            $input['paymentScreenshotUrl'] ?? $input['screenshotUrl'] ?? null
        ]);

        // 2. If coupon applied, record coupon_usage
        if ($couponCode && $couponDiscount > 0) {
            $coupon = Database::fetchOne("SELECT id FROM coupons WHERE code = ? LIMIT 1", [$couponCode]);
            if ($coupon) {
                $pdo->prepare(
                    "INSERT INTO coupon_usage (coupon_id, coupon_code, user_id, firebase_uid, booking_id, discount_applied)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE discount_applied = VALUES(discount_applied)"
                )->execute([$coupon['id'], $couponCode, $user['id'], $user['firebase_uid'], $bookingId, $couponDiscount]);

                $pdo->prepare("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?")->execute([$coupon['id']]);
            }
        }
    });

    sendJsonResponse([
        'success' => true,
        'message' => 'Booking reservation created successfully.',
        'bookingId' => $bookingId,
        'bookingNumber' => $bookingNumber
    ], 201);
} catch (Exception $e) {
    error_log("[Booking Create Error] " . $e->getMessage());
    sendErrorResponse('Failed to create booking: ' . $e->getMessage(), 500);
}
