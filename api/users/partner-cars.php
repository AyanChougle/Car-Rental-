<?php
/**
 * api/users/partner-cars.php
 * GET /api/users/partner-cars - List host listings with live trip counts and revenue from bookings
 * POST /api/users/partner-cars - Submit new host car listing / update status
 * PUT /api/users/partner-cars - Update host listing status (admin/manager)
 * DELETE /api/users/partner-cars - Delete host listing
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';

$user = Auth::requireAuth();
$role = strtolower((string)($user['role'] ?? 'customer'));
$isStaff = in_array($role, ['admin', 'super_admin', 'manager', 'executive'], true);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $scope = trim((string)($_GET['scope'] ?? $_GET['all'] ?? ''));
    $isAdminScope = $isStaff && in_array(strtolower($scope), ['all', '1', 'true', 'fleet'], true);

    $uid = trim((string)($user['firebase_uid'] ?? ''));
    $email = strtolower(trim((string)($user['email'] ?? '')));
    $dbId = (int)($user['id'] ?? 0);
    $systemEmails = ['carrentpedatabase@gmail.com', 'admin@kruizly.com', 'currentpedatabase@gmail.com', 'ayan@kruizly.com', 'host@kruizly.com'];
    $isSystemEmail = ($email !== '' && in_array($email, $systemEmails, true));

    $rows = [];
    if ($isAdminScope) {
        $rows = Database::fetchAll("SELECT * FROM partner_cars ORDER BY id DESC");
    } else {
        // Strict ownership isolation: match ONLY explicit DB UID, DB user_id, or exact unlinked email.
        // Never use fuzzy LIKE/substring/first-name matching or vehicles.owner_name fallbacks so unrelated
        // users (including admin/accountant/customer logins) never see another host's cars.
        $queryConditions = [];
        $queryParams = [];

        if (!empty($uid) && !str_starts_with($uid, 'host_') && !str_starts_with($uid, 'legacy_') && $uid !== 'kruizly_fleet_host') {
            $queryConditions[] = "firebase_uid = ?";
            $queryParams[] = $uid;
        }
        if ($dbId > 0) {
            $queryConditions[] = "(user_id IS NOT NULL AND user_id > 0 AND user_id = ?)";
            $queryParams[] = $dbId;
        }
        if (!empty($email) && !$isSystemEmail) {
            $queryConditions[] = "(user_email IS NOT NULL AND user_email != '' AND LOWER(TRIM(user_email)) = ? AND (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid LIKE 'host_%' OR firebase_uid LIKE 'legacy_%'))";
            $queryParams[] = $email;
        }

        if (!empty($queryConditions)) {
            $whereClause = implode(" OR ", $queryConditions);
            $rows = Database::fetchAll("SELECT * FROM partner_cars WHERE $whereClause ORDER BY id DESC", $queryParams);
        }
    }

    $currentMonthStart = date('Y-m-01');
    $paymentAggs = KpiService::loadDeduplicatedPayments();

    $partnerCars = array_map(function($c) use ($currentMonthStart, $paymentAggs, $isAdminScope) {
        $photos = [];
        if (!empty($c['photos'])) {
            $photos = is_string($c['photos']) ? json_decode($c['photos'], true) : $c['photos'];
            if (!is_array($photos)) $photos = [];
        }
        $identifier = !empty($c['car_id']) ? (string)$c['car_id'] : (!empty($c['id']) ? (string)$c['id'] : 'HC-' . ($c['reg_no'] ?? 'TEMP'));
        $rawReg = trim((string)($c['reg_no'] ?? ''));
        $cleanReg = strtoupper(str_replace([' ', '-', '.'], '', $rawReg));

        $totalRevenue = 0.0;
        $monthRevenue = 0.0;
        $completedTrips = 0;
        $activeTrips = 0;
        $totalTrips = 0;
        $carBookings = [];

        try {
            // Find corresponding vehicle record in catalog
            $vehId = 0;
            if ($cleanReg !== '') {
                $vRow = Database::fetchOne(
                    "SELECT id, gallery, price_day, acquisition_type, owner_name, payout_model, fixed_monthly_amount FROM vehicles 
                     WHERE REPLACE(REPLACE(REPLACE(UPPER(reg_no), ' ', ''), '-', ''), '.', '') = ? 
                     LIMIT 1",
                    [$cleanReg]
                );
                if ($vRow) {
                    $vehId = (int)$vRow['id'];
                    if (empty($photos) && !empty($vRow['gallery'])) {
                        $photos = is_string($vRow['gallery']) ? json_decode($vRow['gallery'], true) : $vRow['gallery'];
                        if (!is_array($photos)) $photos = [];
                    }
                }
            }

            // Payout Model strictly fetched from database row (partner_cars or vehicles table)
            $dbPayout = !empty($c['payout_model']) ? strtolower(trim((string)$c['payout_model'])) : (!empty($vRow['payout_model']) ? strtolower(trim((string)$vRow['payout_model'])) : 'revenue_share');
            $fixedMonthlyAmount = (float)(isset($c['fixed_monthly_amount']) && $c['fixed_monthly_amount'] !== null && $c['fixed_monthly_amount'] !== '' ? $c['fixed_monthly_amount'] : ($vRow['fixed_monthly_amount'] ?? 0.0));
            $isFixedMonthly = ($dbPayout === 'fixed_monthly');
            $revSharePct = (!$isFixedMonthly && !empty($c['revenue_share_pct']) && (float)$c['revenue_share_pct'] > 0)
                ? (float)$c['revenue_share_pct']
                : 60.0;
            $companySharePct = max(0.0, 100.0 - $revSharePct);

            // Query live bookings specifically for this hosted car using unified Financial Engine
            $bSql = "SELECT *
                     FROM bookings
                     WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
                       AND (
                           (vehicle_reg IS NOT NULL AND vehicle_reg != '' AND REPLACE(REPLACE(REPLACE(UPPER(vehicle_reg), ' ', ''), '-', ''), '.', '') = ?)
                           " . ($vehId > 0 ? " OR vehicle_id = $vehId" : "") . "
                       )
                     ORDER BY pickup_date DESC LIMIT 100";

            $rawBookings = Database::fetchAll($bSql, [$cleanReg]);

            foreach ($rawBookings as $b) {
                $bidKey = (string)($b['id'] ?? '');
                $fin = KpiService::computeBookingFinancials($b, $paymentAggs[$bidKey] ?? []);
                if ($fin['is_cancelled']) {
                    continue;
                }
                $bStat = strtolower(trim((string)($b['status'] ?? '')));
                $dt = KpiService::getBookingDates($b);
                $amt = $fin['net_rental_revenue'];

                $totalTrips++;
                if ($bStat === 'completed') {
                    $completedTrips++;
                }
                if (in_array($bStat, ['active', 'in_trip', 'ongoing', 'started'], true)) {
                    $activeTrips++;
                }

                // Only verified paid bookings contribute to partner/host revenue (excludes deposits & unverified pending rows)
                if ($fin['is_paid']) {
                    $pDate = $dt['pickup_ymd'] ?: substr((string)($b['created_at'] ?? ''), 0, 10);
                    $totalRevenue += $amt;
                    if ($pDate >= $currentMonthStart) {
                        $monthRevenue += $amt;
                    }
                }

                $bRef = !empty($b['booking_number']) ? $b['booking_number'] : (!empty($b['booking_id']) ? $b['booking_id'] : ('#BK-' . $b['id']));
                $hostTripShare = $isFixedMonthly ? 0.0 : round($amt * ($revSharePct / 100.0), 2);
                $companyTripShare = $isFixedMonthly ? $amt : round($amt * ($companySharePct / 100.0), 2);

                $carBookings[] = [
                    'id' => $b['id'],
                    'bookingRef' => $bRef,
                    'customerName' => $b['user_name'] ?: 'Customer',
                    'pickupDate' => $b['pickup_date'],
                    'dropDate' => $b['drop_date'],
                    'days' => $dt['days'],
                    'duration' => $b['duration'] ?: ($dt['days'] . ' Days'),
                    'amount' => round($amt, 2),
                    'hostShare' => $hostTripShare,
                    'companyShare' => $companyTripShare,
                    'hostSharePct' => $isFixedMonthly ? 0 : $revSharePct,
                    'companySharePct' => $isFixedMonthly ? 100 : $companySharePct,
                    'status' => $b['status'],
                    'paymentStatus' => $b['payment_status'],
                    'isPaid' => $fin['is_paid'],
                    'startOdometer' => $b['start_odometer'] ?? null,
                    'endOdometer' => $b['end_odometer'] ?? null,
                ];
            }
        } catch (Throwable $e) {
            error_log("[partner-cars.php Booking Lookup Error] " . $e->getMessage());
        }

        if ($isFixedMonthly) {
            $payoutModel = 'fixed_monthly';
            $payoutModelLabel = 'Fixed Monthly Payout';

            $carCreated = !empty($c['created_at']) ? strtotime((string)$c['created_at']) : time();
            $currTime = time();
            $yearsDiff = (int)date('Y', $currTime) - (int)date('Y', $carCreated);
            $monthsDiff = (int)date('n', $currTime) - (int)date('n', $carCreated);
            $elapsedMonths = max(1, ($yearsDiff * 12) + $monthsDiff + 1);

            $hostMonthEarnings = $fixedMonthlyAmount;
            $hostTotalEarnings = round($fixedMonthlyAmount * $elapsedMonths, 2);
            $companyMonthRevenue = round($monthRevenue - $fixedMonthlyAmount, 2);
            $companyTotalRevenue = round($totalRevenue - $hostTotalEarnings, 2);
            $revSharePct = 0.0;
            $companySharePct = 100.0;
        } else {
            // Module A: Trip-based revenue share (default 60% host / 40% company)
            $payoutModel = 'revenue_share';
            $payoutModelLabel = round($revSharePct) . '% Host / ' . round($companySharePct) . '% Company';
            $hostMonthEarnings = round($monthRevenue * ($revSharePct / 100.0), 2);
            $hostTotalEarnings = round($totalRevenue * ($revSharePct / 100.0), 2);
            $companyMonthRevenue = round($monthRevenue * ($companySharePct / 100.0), 2);
            $companyTotalRevenue = round($totalRevenue * ($companySharePct / 100.0), 2);
        }

        // Host identity strictly taken from partner_cars row
        $rawHostName = trim((string)($c['user_name'] ?? ''));
        $rawHostPhone = trim((string)($c['user_phone'] ?? ''));
        $rawHostEmail = trim((string)($c['user_email'] ?? ''));

        // If partner_cars has blank email or phone, look up user by user_id or firebase_uid
        if (empty($rawHostEmail) || empty($rawHostPhone)) {
            try {
                $uProfile = null;
                if (!empty($c['user_id']) && $c['user_id'] > 0) {
                    $uProfile = Database::fetchOne("SELECT id, firebase_uid, email, phone, name FROM users WHERE id = ?", [(int)$c['user_id']]);
                }
                if (!$uProfile && !empty($c['firebase_uid']) && !str_starts_with($c['firebase_uid'], 'host_')) {
                    $uProfile = Database::fetchOne("SELECT id, firebase_uid, email, phone, name FROM users WHERE firebase_uid = ?", [$c['firebase_uid']]);
                }
                if ($uProfile) {
                    if (empty($rawHostEmail) && !empty($uProfile['email'])) {
                        $rawHostEmail = strtolower(trim((string)$uProfile['email']));
                    }
                    if (empty($rawHostPhone) && !empty($uProfile['phone'])) {
                        $rawHostPhone = trim((string)$uProfile['phone']);
                    }
                    if (empty($rawHostName) && !empty($uProfile['name'])) {
                        $rawHostName = trim((string)$uProfile['name']);
                    }
                }
            } catch (Throwable $_) {}
        }

        return [
            'id' => $identifier,
            'carId' => $identifier,
            'dbId' => $c['id'],
            'userId' => $c['firebase_uid'],
            'firebaseUid' => $c['firebase_uid'],
            'dbUserId' => $c['user_id'],
            'user_id' => $c['user_id'],
            'userName' => $rawHostName,
            'ownerName' => $rawHostName,
            'userPhone' => $rawHostPhone,
            'userEmail' => $rawHostEmail,
            'payoutModel' => $payoutModel,
            'payoutModelLabel' => $payoutModelLabel,
            'isFixedMonthly' => $isFixedMonthly,
            'fixedMonthlyAmount' => $fixedMonthlyAmount,
            'revenueSharePct' => $revSharePct,
            'companySharePct' => $companySharePct,
            'grossMonthRevenue' => $monthRevenue,
            'grossTotalRevenue' => $totalRevenue,
            'hostMonthEarnings' => $hostMonthEarnings,
            'hostTotalEarnings' => $hostTotalEarnings,
            'companyMonthRevenue' => $companyMonthRevenue,
            'companyTotalRevenue' => $companyTotalRevenue,
            'monthRevenue' => $hostMonthEarnings,
            'totalRevenue' => $hostTotalEarnings,
            'brand' => $c['brand'],
            'model' => $c['model'],
            'year' => (int)$c['year'],
            'regNo' => $c['reg_no'],
            'regNumber' => $c['reg_no'],
            'transmission' => $c['transmission'],
            'fuel' => $c['fuel'],
            'city' => $c['city'],
            'location' => $c['city'],
            'expectedPrice' => (float)$c['expected_price'],
            'status' => $c['status'],
            'photos' => (function() use ($photos, $c) {
                $brandModel = strtolower(trim(($c['brand'] ?? '') . ' ' . ($c['model'] ?? '')));
                $imgMap = [
                    'toyota taisor' => 'assets/fleet/Toyota Taisor.png',
                    'urban cruiser taisor' => 'assets/fleet/Toyota Taisor.png',
                    'toyota urban cruiser taisor' => 'assets/fleet/Toyota Taisor.png',
                    'taisor' => 'assets/fleet/Toyota Taisor.png',
                    'mahindra thar roxx' => 'assets/fleet/thar roxx.png',
                    'thar roxx' => 'assets/fleet/thar roxx.png',
                    'mg hector' => 'assets/fleet/MG hector.jpg',
                    'mg hector plus' => 'assets/fleet/MG hector.jpg',
                    'maruti suzuki baleno' => 'assets/fleet/Maruti Suzuki Baleno.png',
                    'suzuki baleno' => 'assets/fleet/Maruti Suzuki Baleno.png',
                    'baleno' => 'assets/fleet/Maruti Suzuki Baleno.png',
                    'toyota glanza' => 'assets/fleet/Toyota Glanza.png',
                    'glanza' => 'assets/fleet/Toyota Glanza.png',
                    'maruti suzuki fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'suzuki fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'tata punch' => 'assets/fleet/Tata Punch.png',
                    'punch' => 'assets/fleet/Tata Punch.png',
                    'maruti suzuki ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'suzuki ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'mahindra xuv700' => 'assets/fleet/Mahindra XUV700.png',
                    'mahindra xuv 700' => 'assets/fleet/Mahindra XUV700.png',
                    'xuv700' => 'assets/fleet/Mahindra XUV700.png',
                    'xuv 700' => 'assets/fleet/Mahindra XUV700.png',
                    'toyota innova crysta' => 'assets/fleet/Toyota Innova Crysta.png',
                    'innova crysta' => 'assets/fleet/Toyota Innova Crysta.png',
                    'mahindra scorpio n' => 'assets/fleet/Mahindra Scorpio N.png',
                    'mahindra 7xo' => 'assets/fleet/Mahindra 7XO.png',
                    'tata safari' => 'assets/fleet/Tata Safari.png',
                ];
                $cleanImg = $imgMap[$brandModel] ?? null;
                if (!$cleanImg) {
                    foreach ($imgMap as $k => $v) {
                        if (str_contains($brandModel, $k)) { $cleanImg = $v; break; }
                    }
                }
                if (!$cleanImg) {
                    $cleanImg = 'assets/fleet/' . trim(($c['brand'] ?? 'Car') . ' ' . ($c['model'] ?? '')) . '.png';
                }
                $p0 = !empty($photos[0]) ? (is_string($photos[0]) ? $photos[0] : ($photos[0]['url'] ?? '')) : '';
                if (!$p0 || str_contains($p0, 'MED-') || str_contains($p0, '/api/media/')) {
                    $p0 = $cleanImg;
                }
                return [$p0];
            })(),
            'imageUrl' => (function() use ($photos, $c) {
                $brandModel = strtolower(trim(($c['brand'] ?? '') . ' ' . ($c['model'] ?? '')));
                $imgMap = [
                    'toyota taisor' => 'assets/fleet/Toyota Taisor.png',
                    'urban cruiser taisor' => 'assets/fleet/Toyota Taisor.png',
                    'toyota urban cruiser taisor' => 'assets/fleet/Toyota Taisor.png',
                    'taisor' => 'assets/fleet/Toyota Taisor.png',
                    'mahindra thar roxx' => 'assets/fleet/thar roxx.png',
                    'thar roxx' => 'assets/fleet/thar roxx.png',
                    'mg hector' => 'assets/fleet/MG hector.jpg',
                    'mg hector plus' => 'assets/fleet/MG hector.jpg',
                    'maruti suzuki baleno' => 'assets/fleet/Maruti Suzuki Baleno.png',
                    'suzuki baleno' => 'assets/fleet/Maruti Suzuki Baleno.png',
                    'baleno' => 'assets/fleet/Maruti Suzuki Baleno.png',
                    'toyota glanza' => 'assets/fleet/Toyota Glanza.png',
                    'glanza' => 'assets/fleet/Toyota Glanza.png',
                    'maruti suzuki fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'suzuki fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'tata punch' => 'assets/fleet/Tata Punch.png',
                    'punch' => 'assets/fleet/Tata Punch.png',
                    'maruti suzuki ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'suzuki ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'mahindra xuv700' => 'assets/fleet/Mahindra XUV700.png',
                    'mahindra xuv 700' => 'assets/fleet/Mahindra XUV700.png',
                    'xuv700' => 'assets/fleet/Mahindra XUV700.png',
                    'xuv 700' => 'assets/fleet/Mahindra XUV700.png',
                    'toyota innova crysta' => 'assets/fleet/Toyota Innova Crysta.png',
                    'innova crysta' => 'assets/fleet/Toyota Innova Crysta.png',
                    'mahindra scorpio n' => 'assets/fleet/Mahindra Scorpio N.png',
                    'mahindra 7xo' => 'assets/fleet/Mahindra 7XO.png',
                    'tata safari' => 'assets/fleet/Tata Safari.png',
                ];
                $cleanImg = $imgMap[$brandModel] ?? null;
                if (!$cleanImg) {
                    foreach ($imgMap as $k => $v) {
                        if (str_contains($brandModel, $k)) { $cleanImg = $v; break; }
                    }
                }
                if (!$cleanImg) {
                    $cleanImg = 'assets/fleet/' . trim(($c['brand'] ?? 'Car') . ' ' . ($c['model'] ?? '')) . '.png';
                }
                $p0 = !empty($photos[0]) ? (is_string($photos[0]) ? $photos[0] : ($photos[0]['url'] ?? '')) : '';
                if (!$p0 || str_contains($p0, 'MED-') || str_contains($p0, '/api/media/')) {
                    $p0 = $cleanImg;
                }
                return $p0;
            })(),
            'rejectionReason' => $c['rejection_reason'],
            'totalRevenue' => round($totalRevenue, 2),
            'monthRevenue' => round($monthRevenue, 2),
            'completedTrips' => $completedTrips,
            'activeTrips' => $activeTrips,
            'totalTrips' => $totalTrips,
            'bookings' => $isAdminScope ? $carBookings : [],
            'createdAt' => $c['created_at'],
            'updatedAt' => $c['updated_at']
        ];
    }, $rows);

    sendJsonResponse(['success' => true, 'count' => count($partnerCars), 'partnerCars' => $partnerCars]);
}

if ($method === 'POST') {
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    // Check if this is an admin status update
    if (isset($input['status']) && !isset($input['brand'])) {
        Auth::requireRole('admin', 'manager');
        $id = trim((string)($_GET['id'] ?? $input['id'] ?? $input['carId'] ?? ''));
        $status = trim((string)$input['status']);
        $reason = trim((string)($input['rejectionReason'] ?? ''));

        Database::execute(
            "UPDATE partner_cars SET
                status = COALESCE(NULLIF(?, ''), status),
                rejection_reason = COALESCE(NULLIF(?, ''), rejection_reason),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ? OR car_id = ?",
            [$status, $reason, $id, $id]
        );

        sendJsonResponse(['success' => true, 'message' => 'Partner car updated.']);
    }

    // Creating a new partner car listing
    $carId = 'HC-' . strtoupper(bin2hex(random_bytes(5)));
    $brand = trim((string)($input['brand'] ?? ''));
    $model = trim((string)($input['model'] ?? ''));
    $year = (int)($input['year'] ?? 2026);
    $regNo = strtoupper(trim((string)($input['regNo'] ?? $input['regNumber'] ?? '')));
    $transmission = trim((string)($input['transmission'] ?? 'Automatic'));
    $fuel = trim((string)($input['fuel'] ?? 'Petrol'));
    $city = trim((string)($input['city'] ?? $input['location'] ?? 'Navi Mumbai'));
    $expectedPrice = (float)($input['expectedPrice'] ?? $input['expectedEarnings'] ?? 0.00);
    $payoutModelRaw = strtolower(trim((string)($input['payoutModel'] ?? $input['payout_model'] ?? 'revenue_share')));
    $payoutModel = in_array($payoutModelRaw, ['fixed_monthly', 'revenue_share'], true) ? $payoutModelRaw : 'revenue_share';
    $fixedMonthlyAmount = $payoutModel === 'fixed_monthly'
        ? max(0.0, (float)($input['fixedMonthlyAmount'] ?? $input['fixed_monthly_amount'] ?? $expectedPrice))
        : 0.0;
    $revenueSharePct = $payoutModel === 'revenue_share' ? 60.00 : 0.00;

    $userName = trim((string)($input['userName'] ?? $user['name'] ?? 'Partner Host'));
    $userPhone = trim((string)($input['userPhone'] ?? $user['phone'] ?? ''));
    $userEmail = trim((string)($input['userEmail'] ?? $user['email'] ?? ''));

    $photos = [];
    if (isset($input['photos'])) {
        $photos = is_array($input['photos']) ? json_encode($input['photos']) : (string)$input['photos'];
    } else {
        $photos = '[]';
    }

    if (!$brand || !$model || !$regNo) {
        sendErrorResponse('Brand, model, and registration number are required.', 400);
    }

    $userId = !empty($user['id']) ? (int)$user['id'] : null;
    $uid = trim((string)($user['firebase_uid'] ?? ''));

    try {
        Database::execute(
            "INSERT INTO partner_cars (
                car_id, user_id, firebase_uid, user_name, user_phone, user_email,
                brand, model, year, reg_no, transmission, fuel, city, expected_price,
                payout_model, fixed_monthly_amount, revenue_share_pct,
                status, photos
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?,
                'pending_approval', ?
            )",
            [
                $carId, $userId, $uid, $userName, $userPhone, $userEmail,
                $brand, $model, $year, $regNo, $transmission, $fuel, $city, $expectedPrice,
                $payoutModel, $fixedMonthlyAmount, $revenueSharePct,
                $photos
            ]
        );
    } catch (Throwable $colErr) {
        Database::execute(
            "INSERT INTO partner_cars (
                car_id, user_id, firebase_uid, user_name, user_phone, user_email,
                brand, model, year, reg_no, transmission, fuel, city, expected_price,
                status, photos
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                'pending_approval', ?
            )",
            [
                $carId, $userId, $uid, $userName, $userPhone, $userEmail,
                $brand, $model, $year, $regNo, $transmission, $fuel, $city, $expectedPrice,
                $photos
            ]
        );
    }

    // Update user role to host if currently customer
    if ($role === 'customer' && !empty($uid)) {
        try {
            Database::execute("UPDATE users SET role = 'host' WHERE firebase_uid = ? OR id = ?", [$uid, $userId]);
        } catch (Throwable $_) {}
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'Host vehicle listing submitted for review.',
        'carId' => $carId
    ], 201);
}

if ($method === 'PUT') {
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
    $id = trim((string)($_GET['id'] ?? $input['id'] ?? $input['carId'] ?? ''));
    if (!$id) {
        sendErrorResponse('Host car ID is required.', 400);
    }

    $cleanIdReg = strtoupper(str_replace([' ', '-', '.'], '', $id));
    $existingCar = Database::fetchOne(
        "SELECT * FROM partner_cars 
         WHERE id = ? OR car_id = ? 
            OR REPLACE(REPLACE(REPLACE(UPPER(reg_no), ' ', ''), '-', ''), '.', '') = ?
         LIMIT 1", 
        [$id, $id, $cleanIdReg]
    );

    if (!$existingCar) {
        sendErrorResponse('Listing not found.', 404);
    }

    // Strict ownership verification: only staff or exact owner (UID / user_id / unclaimed email)
    $uid = trim((string)($user['firebase_uid'] ?? ''));
    $email = strtolower(trim((string)($user['email'] ?? '')));
    $dbId = (int)($user['id'] ?? 0);
    $carEmail = strtolower(trim((string)($existingCar['user_email'] ?? '')));
    $carUid = trim((string)($existingCar['firebase_uid'] ?? ''));

    $isOwner = (
        (!empty($uid) && !str_starts_with($uid, 'host_') && !str_starts_with($uid, 'legacy_') && $carUid === $uid) ||
        (!empty($dbId) && (int)$existingCar['user_id'] === $dbId) ||
        (!empty($email) && $carEmail === $email && ($carUid === '' || str_starts_with($carUid, 'host_') || str_starts_with($carUid, 'legacy_')))
    );

    if (!$isStaff && !$isOwner) {
        sendErrorResponse('Permission denied.', 403);
    }

    // Both host owner and staff can set/update payout model; only staff can change approval status/reason
    $rawPayoutModel = isset($input['payout_model'])
        ? strtolower(trim((string)$input['payout_model']))
        : (isset($input['payoutModel']) ? strtolower(trim((string)$input['payoutModel'])) : null);
    $payoutModel = ($rawPayoutModel !== null && in_array($rawPayoutModel, ['revenue_share', 'fixed_monthly'], true)) ? $rawPayoutModel : null;
    $fixedMonthlyAmount = isset($input['fixed_monthly_amount'])
        ? max(0.0, (float)$input['fixed_monthly_amount'])
        : (isset($input['fixedMonthlyAmount']) ? max(0.0, (float)$input['fixedMonthlyAmount']) : null);
    
    $city = isset($input['city']) ? trim((string)$input['city']) : (isset($input['location']) ? trim((string)$input['location']) : null);
    $expectedPrice = isset($input['expected_price']) ? (float)$input['expected_price'] : (isset($input['expectedPrice']) ? (float)$input['expectedPrice'] : null);
    $userPhone = isset($input['user_phone']) ? trim((string)$input['user_phone']) : (isset($input['userPhone']) ? trim((string)$input['userPhone']) : null);
    $userEmail = isset($input['user_email']) ? trim((string)$input['user_email']) : (isset($input['userEmail']) ? trim((string)$input['userEmail']) : null);
    $status = $isStaff && isset($input['status']) ? trim((string)$input['status']) : null;
    $reason = $isStaff && isset($input['rejectionReason']) ? trim((string)$input['rejectionReason']) : null;
    $photos = isset($input['photos']) ? (is_array($input['photos']) ? json_encode($input['photos']) : $input['photos']) : null;

        Database::execute(
            "UPDATE partner_cars SET
                payout_model = COALESCE(NULLIF(?, ''), payout_model),
                fixed_monthly_amount = COALESCE(?, fixed_monthly_amount),
                city = COALESCE(NULLIF(?, ''), city),
                expected_price = COALESCE(?, expected_price),
                user_phone = COALESCE(NULLIF(?, ''), user_phone),
                user_email = COALESCE(NULLIF(?, ''), user_email),
                status = COALESCE(NULLIF(?, ''), status),
                rejection_reason = COALESCE(NULLIF(?, ''), rejection_reason),
                photos = COALESCE(?, photos),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ? OR car_id = ? OR reg_no = ?",
            [
                $payoutModel,
                $fixedMonthlyAmount,
                $city,
                $expectedPrice,
                $userPhone,
                $userEmail,
                $status,
                $reason,
                $photos,
                $existingCar['id'],
                $existingCar['car_id'],
                $existingCar['reg_no']
            ]
        );

    // Sync to vehicles table if reg_no exists
    if (!empty($existingCar['reg_no'])) {
        try {
            Database::execute(
                "UPDATE vehicles SET
                    payout_model = COALESCE(NULLIF(?, ''), payout_model),
                    fixed_monthly_amount = COALESCE(?, fixed_monthly_amount),
                    location = COALESCE(NULLIF(?, ''), location),
                    price_day = COALESCE(?, price_day),
                    owner_phone = COALESCE(NULLIF(?, ''), owner_phone),
                    owner_email = COALESCE(NULLIF(?, ''), owner_email)
                 WHERE reg_no = ?",
                [
                    $payoutModel,
                    $fixedMonthlyAmount,
                    $city,
                    $expectedPrice,
                    $userPhone,
                    $userEmail,
                    $existingCar['reg_no']
                ]
            );
        } catch (Throwable $_) {}
    }

    sendJsonResponse(['success' => true, 'message' => 'Partner car updated successfully.']);
}

if ($method === 'DELETE') {
    $id = trim((string)($_GET['id'] ?? ''));
    if (!$id) {
        sendErrorResponse('Host car ID is required.', 400);
    }
    if ($isStaff) {
        Database::execute("DELETE FROM partner_cars WHERE id = ? OR car_id = ?", [$id, $id]);
    } else {
        $uid = trim((string)($user['firebase_uid'] ?? ''));
        $email = trim((string)($user['email'] ?? ''));
        $dbId = (int)($user['id'] ?? 0);
        Database::execute("DELETE FROM partner_cars WHERE (id = ? OR car_id = ?) AND (firebase_uid = ? OR user_email = ? OR user_id = ?)", [$id, $id, $uid, $email, $dbId]);
    }
    sendJsonResponse(['success' => true, 'message' => 'Partner car deleted.']);
}

sendErrorResponse('Method not allowed.', 405);
