<?php
/**
 * api/bookings/create.php
 * POST /api/bookings - Create a reservation transactionally
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$pickupDate = date('Y-m-d H:i:s', strtotime((string)($input['pickupDate'] ?? 'now')));
$monthCode = strtoupper(date('M', strtotime($pickupDate)));
$prefix = 'KRZ-' . $monthCode . '-';

$incomingId = trim((string)($input['bookingId'] ?? $input['bookingNumber'] ?? ''));
if (!$incomingId || !preg_match('/^KRZ-[A-Z]{3}-\d+$/i', $incomingId)) {
    // Determine the next sequence number for this month in MySQL
    $latestRow = Database::fetchOne(
        "SELECT booking_number FROM bookings 
         WHERE (booking_number LIKE ? OR booking_id LIKE ?) 
         ORDER BY CAST(SUBSTRING(COALESCE(booking_number, booking_id), 9) AS UNSIGNED) DESC, booking_number DESC 
         LIMIT 1",
        [$prefix . '%', $prefix . '%']
    );

    $nextSeq = 1;
    if ($latestRow && preg_match('/KRZ-[A-Z]{3}-(\d+)/i', (string)($latestRow['booking_number'] ?? ''), $m)) {
        $nextSeq = ((int)$m[1]) + 1;
    }
    $bookingId = sprintf("KRZ-%s-%03d", $monthCode, $nextSeq);
} else {
    $bookingId = strtoupper($incomingId);
}
$bookingNumber = $bookingId;

$vehicleReg = strtoupper(trim((string)($input['vehicleReg'] ?? $input['carId'] ?? '')));
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
$vehicle = $vehicleReg ? Database::fetchOne("SELECT * FROM vehicles WHERE reg_no = ? LIMIT 1", [$vehicleReg]) : null;
$vehicleId = $vehicle && !empty($vehicle['id']) ? (int)$vehicle['id'] : null;
$vehicleName = $vehicle ? ($vehicle['brand'] . ' ' . $vehicle['model']) : ($input['vehicleName'] ?? 'Vehicle');
$vehicleCategory = $vehicle ? $vehicle['category'] : ($input['vehicleCategory'] ?? 'Sedan');

$dbUserId = null;
if (!empty($user['id']) && (int)$user['id'] > 0) {
    $dbUserId = (int)$user['id'];
}
if (!$dbUserId && !empty($user['firebase_uid'])) {
    $uRow = Database::fetchOne("SELECT id FROM users WHERE firebase_uid = ? LIMIT 1", [$user['firebase_uid']]);
    if ($uRow && !empty($uRow['id'])) {
        $dbUserId = (int)$uRow['id'];
    }
}

$userName = trim((string)($input['userName'] ?? $input['name'] ?? $input['customerName'] ?? $user['name'] ?? ''));
$userPhone = trim((string)($input['userPhone'] ?? $input['phone'] ?? $input['customerPhone'] ?? $user['phone'] ?? ''));
$userEmail = trim((string)($input['userEmail'] ?? $input['email'] ?? $input['customerEmail'] ?? $user['email'] ?? ''));
$userAge = isset($input['age']) ? (int)$input['age'] : (isset($input['userAge']) ? (int)$input['userAge'] : (isset($input['customerAge']) ? (int)$input['customerAge'] : (isset($user['age']) ? (int)$user['age'] : null)));

Database::autoHealTable('bookings');
$maxRow = Database::fetchOne("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM bookings");
$nextId = (int)($maxRow['next_id'] ?? 1);

try {
    Database::transaction(function($pdo) use (
        $nextId, $bookingId, $bookingNumber, $user, $dbUserId, $vehicleId, $vehicleReg, $vehicleName, $vehicleCategory,
        $pickupDate, $dropDate, $duration, $days, $hours, $withDriver, $baseAmount, $couponCode,
        $couponDiscount, $totalAmount, $advanceAmount, $remainingBalance, $paymentPlan, $paymentStatus,
        $status, $location, $securityDeposit, $userName, $userEmail, $userPhone, $userAge, $input
    ) {
        // 1. Insert or update booking
        $stmt = $pdo->prepare(
            "INSERT INTO bookings (
                id, booking_id, booking_number, user_id, firebase_uid, user_name, user_email, user_phone,
                vehicle_id, vehicle_reg, vehicle_name, vehicle_category, pickup_date, drop_date,
                duration, days, hours, with_driver, base_amount, coupon_code, coupon_discount,
                total_amount, final_amount, advance_amount, remaining_balance, remaining_amount,
                payment_plan, payment_status, status, booking_status, location, security_deposit,
                payment_screenshot_url
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            ) ON DUPLICATE KEY UPDATE
                id = COALESCE(id, VALUES(id)),
                user_id = COALESCE(VALUES(user_id), user_id),
                vehicle_id = COALESCE(VALUES(vehicle_id), vehicle_id),
                vehicle_reg = COALESCE(NULLIF(VALUES(vehicle_reg), ''), vehicle_reg),
                vehicle_name = COALESCE(NULLIF(VALUES(vehicle_name), ''), vehicle_name),
                vehicle_category = COALESCE(NULLIF(VALUES(vehicle_category), ''), vehicle_category),
                pickup_date = VALUES(pickup_date),
                drop_date = VALUES(drop_date),
                duration = VALUES(duration),
                days = VALUES(days),
                hours = VALUES(hours),
                with_driver = VALUES(with_driver),
                base_amount = VALUES(base_amount),
                total_amount = VALUES(total_amount),
                final_amount = VALUES(final_amount),
                advance_amount = VALUES(advance_amount),
                remaining_balance = VALUES(remaining_balance),
                remaining_amount = VALUES(remaining_amount),
                payment_plan = VALUES(payment_plan),
                location = VALUES(location),
                security_deposit = VALUES(security_deposit),
                user_name = COALESCE(NULLIF(VALUES(user_name), ''), user_name),
                user_email = COALESCE(NULLIF(VALUES(user_email), ''), user_email),
                user_phone = COALESCE(NULLIF(VALUES(user_phone), ''), user_phone),
                payment_status = VALUES(payment_status),
                status = VALUES(status),
                booking_status = VALUES(booking_status),
                payment_screenshot_url = COALESCE(VALUES(payment_screenshot_url), payment_screenshot_url),
                updated_at = CURRENT_TIMESTAMP"
        );

        $stmt->execute([
            $nextId, $bookingId, $bookingNumber, $dbUserId, $user['firebase_uid'], $userName ?: ($user['name'] ?: $user['email']),
            $userEmail ?: ($user['email'] ?: 'customer@kruizly.com'), $userPhone ?: ($user['phone'] ?: null), $vehicleId, $vehicleReg ?: 'TBD', $vehicleName, $vehicleCategory,
            $pickupDate, $dropDate, $duration, $days, $hours, $withDriver, $baseAmount, $couponCode ?: null,
            $couponDiscount, $totalAmount, $totalAmount, $advanceAmount, $remainingBalance, $remainingBalance,
            $paymentPlan, $paymentStatus, $status, $status, $location, $securityDeposit,
            $input['paymentScreenshotUrl'] ?? $input['screenshotUrl'] ?? null
        ]);

        // 2. Sync phone, name, age back to users table if available
        $uFields = [];
        $uParams = [];
        if ($userName) {
            $uFields[] = "name = COALESCE(NULLIF(?, ''), name)";
            $uParams[] = $userName;
        }
        if ($userPhone) {
            $uFields[] = "phone = COALESCE(NULLIF(?, ''), phone)";
            $uParams[] = $userPhone;
        }
        if ($userAge !== null) {
            $uFields[] = "age = COALESCE(?, age)";
            $uParams[] = $userAge;
        }
        if (!empty($uFields)) {
            $uParams[] = $user['firebase_uid'];
            $pdo->prepare("UPDATE users SET " . implode(', ', $uFields) . ", updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?")->execute($uParams);
        }

        // 3. If coupon applied, record coupon_usage (supports single and multi-coupon codes)
        if ($couponCode && $couponDiscount > 0) {
            $codes = array_filter(array_map('trim', explode(',', $couponCode)));
            foreach ($codes as $singleCode) {
                $coupon = Database::fetchOne("SELECT id FROM coupons WHERE UPPER(code) = ? LIMIT 1", [strtoupper($singleCode)]);
                if ($coupon && !empty($coupon['id'])) {
                    try {
                        $pdo->prepare(
                            "INSERT INTO coupon_usage (coupon_id, coupon_code, user_id, firebase_uid, booking_id, discount_applied)
                             VALUES (?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE discount_applied = VALUES(discount_applied)"
                        )->execute([(int)$coupon['id'], strtoupper($singleCode), $dbUserId, $user['firebase_uid'], $bookingId, $couponDiscount]);

                        $pdo->prepare("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?")->execute([(int)$coupon['id']]);
                    } catch (Throwable $_) {}
                }
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
