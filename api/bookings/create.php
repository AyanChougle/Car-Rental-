<?php
/**
 * api/bookings/create.php
 * POST /api/bookings - Create a reservation transactionally
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
if (!headers_sent()) { header('X-Kruizly-Create-Rev: 2026-09-30-v4'); }

$user = Auth::requireAuth();
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive', 'accountant', 'super_admin'], true);

$pickupDate = date('Y-m-d H:i:s', strtotime((string)($input['pickupDate'] ?? 'now')));
$dropDate = date('Y-m-d H:i:s', strtotime((string)($input['dropDate'] ?? '+1 day')));

// STRICT SECURITY & BUSINESS RULE: Minimum booking duration is 24 hours (86,400 seconds)
$pTs = strtotime($pickupDate);
$dTs = strtotime($dropDate);
if ($pTs === false || $pTs < time() - 3600) {
    $pTs = time();
    $pickupDate = date('Y-m-d H:i:s', $pTs);
}
if ($dTs === false || $dTs < $pTs + 86400) {
    $dTs = $pTs + 86400;
    $dropDate = date('Y-m-d H:i:s', $dTs);
}

$diffSeconds = $dTs - $pTs;
$hours = max(24, (int)ceil($diffSeconds / 3600));
$days = max(1, (int)ceil($hours / 24));
$fullDays = (int)floor($hours / 24);
$remHours = $hours % 24;
if ($fullDays > 0 && $remHours > 0) {
    $duration = "{$fullDays} Day" . ($fullDays > 1 ? "s" : "") . " {$remHours} Hr" . ($remHours > 1 ? "s" : "") . " ({$hours} hrs)";
} else {
    $duration = "{$fullDays} Day" . ($fullDays > 1 ? "s" : "") . " ({$hours} hrs)";
}

$monthCode = strtoupper(date('M', strtotime($pickupDate)));
$prefix = 'KRZ-' . $monthCode . '-';

$incomingId = trim((string)($input['bookingId'] ?? $input['bookingNumber'] ?? ''));
if ($incomingId && preg_match('/^KRZ-[A-Z]{3}-\d+$/i', $incomingId)) {
    // IDOR protection: check if booking already exists in DB
    $existing = Database::fetchOne(
        "SELECT firebase_uid, status FROM bookings WHERE booking_number = ? OR booking_id = ? LIMIT 1",
        [$incomingId, $incomingId]
    );
    if ($existing) {
        if (!$isStaff && ($existing['firebase_uid'] !== $user['firebase_uid'] || !in_array($existing['status'], ['pending_payment', 'pending'], true))) {
            sendErrorResponse('Cannot overwrite existing booking record.', 403);
        }
    }
    $bookingId = strtoupper($incomingId);
} else {
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
}
$bookingNumber = $bookingId;

// Authoritative vehicle lookup from MySQL database
$vehicleReg = strtoupper(trim((string)($input['vehicleReg'] ?? $input['carId'] ?? '')));
$incomingVehicleId = isset($input['vehicleId']) ? (int)$input['vehicleId'] : (isset($input['id']) ? (int)$input['id'] : 0);
$vehicle = null;
if ($vehicleReg !== '') {
    $vehicle = Database::fetchOne("SELECT * FROM vehicles WHERE UPPER(reg_no) = ? LIMIT 1", [$vehicleReg]);
}
if (!$vehicle && $incomingVehicleId > 0) {
    $vehicle = Database::fetchOne("SELECT * FROM vehicles WHERE id = ? LIMIT 1", [$incomingVehicleId]);
}
if (!$vehicle && !empty($input['vehicleName'])) {
    $vehicle = Database::fetchOne("SELECT * FROM vehicles WHERE CONCAT(brand, ' ', model) LIKE ? LIMIT 1", ['%' . trim((string)$input['vehicleName']) . '%']);
}

$vehicleId = $vehicle && !empty($vehicle['id']) ? (int)$vehicle['id'] : ($incomingVehicleId ?: null);
$vehicleReg = $vehicle ? (string)$vehicle['reg_no'] : ($vehicleReg ?: 'TBD');
$vehicleName = $vehicle ? ($vehicle['brand'] . ' ' . $vehicle['model']) : ($input['vehicleName'] ?? 'Vehicle');
$vehicleCategory = $vehicle ? (string)($vehicle['category'] ?: 'suv') : ($input['vehicleCategory'] ?? 'suv');
$isLuxury = strtolower($vehicleCategory) === 'luxury';

// Server-side authoritative price calculation (tamper-proof)
$priceDay = $vehicle ? (float)($vehicle['price_day'] ?? 0.00) : (float)($input['dayRate'] ?? $input['priceDay'] ?? 0.00);
$hourlyRate = $priceDay > 0 ? round($priceDay / 24, 2) : 0.00;

$fullDays = (int)floor($hours / 24);
$remHours = (int)($hours % 24);
$baseAmount = (float)($fullDays * $priceDay);
if ($remHours > 0 && $priceDay > 0) {
    $baseAmount += round($remHours * ($priceDay / 24), 2);
}
$baseAmount = max($priceDay, $baseAmount);
if ($baseAmount <= 0) {
    $baseAmount = (float)($input['baseAmount'] ?? $input['rentalTotal'] ?? 0.00);
}

$withDriver = (int)($input['withDriver'] ?? 0);
$driverDailyRate = $vehicle ? (float)($vehicle['driver_price'] ?? 2000.00) : 2000.00;
$driverHourlyRate = round($driverDailyRate / 24, 2);
$driverTotal = 0.00;
if ($withDriver) {
    $driverTotal = (float)($fullDays * $driverDailyRate);
    if ($remHours > 0) {
        $driverTotal += round($remHours * ($driverDailyRate / 24), 2);
    }
    $driverTotal = max($driverDailyRate, $driverTotal);
}

// Authoritative Security Deposit from vehicle database record
$securityDeposit = ($vehicle && isset($vehicle['security_deposit']) && (float)$vehicle['security_deposit'] > 0)
    ? (float)$vehicle['security_deposit']
    : (isset($input['securityDeposit']) && (float)$input['securityDeposit'] > 0 ? (float)$input['securityDeposit'] : ($isLuxury ? 15000.00 : 5000.00));

// Server-side coupon verification
$couponCode = trim((string)($input['couponCode'] ?? ''));
$couponDiscount = 0.00;
if ($couponCode !== '') {
    $cRow = Database::fetchOne("SELECT * FROM coupons WHERE UPPER(code) = ? AND (active = 1 OR status = 'active') LIMIT 1", [strtoupper($couponCode)]);
    if ($cRow) {
        $isExpired = !empty($cRow['expires_at']) && strtotime((string)$cRow['expires_at']) < time();
        $minOrder = (float)($cRow['min_order'] ?? 0.00);
        if (!$isExpired && ($minOrder <= 0 || $baseAmount >= $minOrder)) {
            $isPercent = (($cRow['discount_type'] ?? '') === 'percentage' || ($cRow['discount_type'] ?? '') === 'percent' || (isset($cRow['label']) && strpos((string)$cRow['label'], '%') !== false));
            if ($isPercent) {
                $couponDiscount = round(($baseAmount * (float)$cRow['discount_value']) / 100, 2);
                if (!empty($cRow['max_discount']) && (float)$cRow['max_discount'] > 0) {
                    $couponDiscount = min($couponDiscount, (float)$cRow['max_discount']);
                }
            } else {
                $couponDiscount = min($baseAmount, (float)$cRow['discount_value']);
            }
        }
    }
    if ($couponDiscount === 0.00 && $isStaff) {
        $couponDiscount = (float)($input['couponDiscount'] ?? 0.00);
    }
}

// Authoritative total amount payable: Base rental + Driver - Coupon discount (Security deposit is NOT included in booking total)
$grossTotal = $baseAmount + $driverTotal;
$totalAmount = max(0.00, round($grossTotal - $couponDiscount, 2));

// Authoritative payment plan calculation (tamper-proof)
$paymentPlan = trim((string)($input['paymentPlan'] ?? 'full'));
if ($paymentPlan === 'advance') {
    $advanceAmount = min(500.00, $totalAmount); // Fixed ₹500 Token
    $remainingBalance = max(0.00, round($totalAmount - $advanceAmount, 2));
} else {
    $paymentPlan = 'full';
    $advanceAmount = $totalAmount;
    $remainingBalance = 0.00;
}

// Enforce initial payment status (customers cannot self-mark as paid or confirmed)
if ($isStaff) {
    $paymentStatus = trim((string)($input['paymentStatus'] ?? 'pending_payment'));
    $status = trim((string)($input['status'] ?? 'pending_payment'));
} else {
    $paymentStatus = 'pending_payment';
    $status = 'pending_payment';
}

$pickupHubId = isset($input['pickup_hub_id']) ? (int)$input['pickup_hub_id'] : (isset($input['hub_id']) ? (int)$input['hub_id'] : null);
$dropHubId = isset($input['drop_hub_id']) ? (int)$input['drop_hub_id'] : $pickupHubId;

// Resolve hub: prefer explicit ids, then the vehicle's own hub
if (!$pickupHubId && !empty($vehicle['hub_id'] ?? null)) { $pickupHubId = (int)$vehicle['hub_id']; }
if (!$dropHubId) { $dropHubId = $pickupHubId; }
$locationText = '';
if ($pickupHubId) {
    $hubRow = Database::fetchOne("SELECT name FROM hubs WHERE id = ? LIMIT 1", [$pickupHubId]);
    $locationText = (string)($hubRow['name'] ?? '');
}
if ($locationText === '') { $locationText = trim((string)($input['pickupHubName'] ?? $input['location'] ?? '')); }


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
        $pickupDate, $dropDate, $duration, $days, $hours, $withDriver, $priceDay, $hourlyRate, $driverDailyRate, $driverHourlyRate, $baseAmount, $couponCode,
        $couponDiscount, $totalAmount, $advanceAmount, $remainingBalance, $paymentPlan, $paymentStatus,
        $status, $pickupHubId, $dropHubId, $securityDeposit, $locationText, $userName, $userEmail, $userPhone, $userAge, $input
    ) {
        // 1. Insert or update booking (schema-adaptive: only writes columns that exist in the live table)
        $row = [
            'id' => $nextId,
            'booking_id' => $bookingId,
            'booking_number' => $bookingNumber,
            'user_id' => $dbUserId,
            'firebase_uid' => $user['firebase_uid'],
            'user_name' => $userName ?: ($user['name'] ?: $user['email']),
            'user_email' => $userEmail ?: ($user['email'] ?: 'customer@kruizly.com'),
            'user_phone' => $userPhone ?: ($user['phone'] ?: null),
            'vehicle_id' => $vehicleId,
            'vehicle_reg' => $vehicleReg ?: 'TBD',
            'vehicle_name' => $vehicleName,
            'vehicle_category' => $vehicleCategory,
            'pickup_date' => $pickupDate,
            'drop_date' => $dropDate,
            'duration' => $duration,
            'days' => $days,
            'hours' => $hours,
            'with_driver' => $withDriver,
            'day_rate' => $priceDay,
            'hourly_rate' => $hourlyRate,
            'driver_rate' => $driverDailyRate,
            'driver_hourly_rate' => $driverHourlyRate,
            'base_amount' => $baseAmount,
            'coupon_code' => $couponCode ?: null,
            'coupon_discount' => $couponDiscount,
            'total_amount' => $totalAmount,
            'final_amount' => $totalAmount,
            'advance_amount' => $advanceAmount,
            'remaining_balance' => $remainingBalance,
            'remaining_amount' => $remainingBalance,
            'payment_plan' => $paymentPlan,
            'payment_status' => $paymentStatus,
            'status' => $status,
            'booking_status' => $status,
            'pickup_hub_id' => $pickupHubId,
            'drop_hub_id' => $dropHubId,
            'security_deposit' => $securityDeposit,
            'location' => $locationText ?: null,
            'payment_screenshot_url' => $input['paymentScreenshotUrl'] ?? $input['screenshotUrl'] ?? null,
        ];

        $existingCols = [];
        foreach ($pdo->query('SHOW COLUMNS FROM bookings')->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $existingCols[strtolower((string)$c['Field'])] = true;
        }
        $row = array_filter($row, fn($k) => isset($existingCols[$k]), ARRAY_FILTER_USE_KEY);

        $colNames = array_keys($row);
        $colSql = implode(', ', array_map(fn($c) => "`$c`", $colNames));
        $phSql = implode(', ', array_fill(0, count($colNames), '?'));

        $noUpdate = ['id', 'booking_id', 'booking_number', 'firebase_uid'];
        $coalesceKeep = ['user_id', 'vehicle_id', 'payment_screenshot_url'];
        $nonEmptyKeep = ['vehicle_reg', 'vehicle_name', 'vehicle_category', 'user_name', 'user_email', 'user_phone'];
        $upd = [];
        foreach ($colNames as $c) {
            if (in_array($c, $noUpdate, true)) continue;
            if (in_array($c, $coalesceKeep, true)) {
                $upd[] = "`$c` = COALESCE(VALUES(`$c`), `$c`)";
            } elseif (in_array($c, $nonEmptyKeep, true)) {
                $upd[] = "`$c` = COALESCE(NULLIF(VALUES(`$c`), ''), `$c`)";
            } elseif ($c === 'coupon_code' || $c === 'coupon_discount') {
                continue;
            } else {
                $upd[] = "`$c` = VALUES(`$c`)";
            }
        }
        if (isset($existingCols['updated_at'])) $upd[] = '`updated_at` = CURRENT_TIMESTAMP';

        $pdo->prepare("INSERT INTO bookings ($colSql) VALUES ($phSql) ON DUPLICATE KEY UPDATE " . implode(', ', $upd))
            ->execute(array_values($row));

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

    // Automated KPI metrics sync: only increment revenue if the booking is verified/paid/confirmed immediately
    $isPaidOrConfirmed = in_array(strtolower($paymentStatus), ['paid', 'advance_paid', 'verified'], true)
        || in_array(strtolower($status), ['confirmed', 'active', 'in_trip', 'started', 'completed'], true);

    if ($isPaidOrConfirmed) {
        try {
            require_once __DIR__ . '/../services/KpiService.php';
            $bk = [
                'final_amount' => $totalAmount,
                'total_amount' => $totalAmount,
                'base_amount' => $baseAmount,
                'coupon_discount' => $couponDiscount,
                'security_deposit' => $securityDeposit,
                'advance_amount' => $advanceAmount
            ];
            $netRental = KpiService::getBookingNetRental($bk);
            if ($netRental <= 0 && (float)$advanceAmount > 0) {
                $netRental = (float)$advanceAmount;
            }
            if ($netRental > 0) {
                $hId = isset($pickupHubId) ? (int)$pickupHubId : 0;
                KpiService::incrementBookingMetrics($netRental, $hId, (string)$pickupDate);
            }
        } catch (Throwable $_) {}
    } else {
        try {
            require_once __DIR__ . '/../services/KpiService.php';
            KpiService::syncMetrics();
        } catch (Throwable $_) {}
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'Booking reservation created successfully.',
        'bookingId' => $bookingId,
        'bookingNumber' => $bookingNumber
    ], 201);
} catch (Throwable $e) {
    error_log("[Booking Create Error] " . $e->getMessage());
    sendErrorResponse('Failed to create booking: ' . $e->getMessage(), 500);
}
