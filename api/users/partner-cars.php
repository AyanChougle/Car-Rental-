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

$user = Auth::requireAuth();
$role = strtolower((string)($user['role'] ?? 'customer'));
$isStaff = in_array($role, ['admin', 'super_admin', 'manager', 'executive'], true);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $scope = trim((string)($_GET['scope'] ?? $_GET['all'] ?? ''));
    $isAdminScope = $isStaff && ($scope === 'all' || $scope === '1' || $scope === 'true');

    $uid = trim((string)($user['firebase_uid'] ?? ''));
    $email = strtolower(trim((string)($user['email'] ?? '')));
    $name = trim((string)($user['name'] ?? ''));
    $dbId = (int)($user['id'] ?? 0);

    // Auto-link legacy partner_cars to this user if email matches
    if (!empty($email) && !empty($uid)) {
        try {
            Database::execute(
                "UPDATE partner_cars 
                 SET firebase_uid = ?, 
                     user_id = COALESCE(NULLIF(user_id, 0), ?) 
                 WHERE LOWER(TRIM(user_email)) = ? 
                   AND (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid LIKE 'legacy_%')",
                [$uid, $dbId ?: null, $email]
            );
        } catch (Throwable $_) {}
    }

    $rows = [];
    if ($isAdminScope) {
        $rows = Database::fetchAll("SELECT * FROM partner_cars ORDER BY id DESC");
    } else {
        $rows = Database::fetchAll(
            "SELECT * FROM partner_cars 
             WHERE (firebase_uid IS NOT NULL AND firebase_uid != '' AND firebase_uid = ?) 
                OR (user_email IS NOT NULL AND user_email != '' AND LOWER(TRIM(user_email)) = ?) 
                OR (user_id IS NOT NULL AND user_id > 0 AND user_id = ?) 
             ORDER BY id DESC", 
            [$uid, $email, $dbId]
        );

        // Also check if vehicles catalog has partner vehicles owned by this user
        if (!empty($name) || !empty($email) || !empty($uid)) {
            $knownRegs = [];
            foreach ($rows as $r) {
                $k = strtoupper(str_replace([' ', '-', '.'], '', (string)($r['reg_no'] ?? '')));
                if ($k !== '') $knownRegs[$k] = true;
            }

            try {
                $vehRows = Database::fetchAll(
                    "SELECT v.* 
                     FROM vehicles v
                     WHERE v.status != 'removed'
                       AND (
                           LOWER(TRIM(v.acquisition_type)) = 'partner'
                           OR (v.owner_name IS NOT NULL AND v.owner_name != '' AND v.owner_name != 'Kruizly Fleet Host')
                       )
                       AND (
                           (v.owner_name IS NOT NULL AND v.owner_name != '' AND LOWER(TRIM(v.owner_name)) = LOWER(TRIM(?)))
                           OR (v.created_by IS NOT NULL AND v.created_by = ?)
                           OR (v.created_by IS NOT NULL AND LOWER(TRIM(v.created_by)) = LOWER(TRIM(?)))
                       )
                     ORDER BY v.id DESC",
                    [$name, $uid, $email]
                );

                foreach ($vehRows as $v) {
                    $vReg = strtoupper(str_replace([' ', '-', '.'], '', (string)($v['reg_no'] ?? '')));
                    if ($vReg !== '' && !isset($knownRegs[$vReg])) {
                        $knownRegs[$vReg] = true;
                        $rows[] = [
                            'id' => (int)$v['id'],
                            'car_id' => $v['car_id'] ?? ('CRP-' . str_pad((string)$v['id'], 3, '0', STR_PAD_LEFT)),
                            'user_id' => $dbId ?: null,
                            'firebase_uid' => $uid,
                            'user_name' => $v['owner_name'] ?: $name,
                            'user_phone' => $user['phone'] ?? '',
                            'user_email' => $email,
                            'brand' => $v['brand'],
                            'model' => $v['model'],
                            'year' => (int)$v['year'],
                            'reg_no' => $v['reg_no'],
                            'transmission' => $v['transmission'],
                            'fuel' => $v['fuel'],
                            'city' => $v['location'] ?: 'Navi Mumbai',
                            'expected_price' => (float)$v['price_day'],
                            'status' => 'approved',
                            'photos' => $v['gallery'],
                            'rejection_reason' => null,
                            'created_at' => $v['created_at'] ?? date('Y-m-d H:i:s'),
                            'updated_at' => $v['updated_at'] ?? date('Y-m-d H:i:s'),
                        ];
                    }
                }
            } catch (Throwable $_) {}
        }

        // If staff/admin is viewing listings without personal entries, return all partner cars so admin can see the full hosted fleet
        if (empty($rows) && $isStaff) {
            $rows = Database::fetchAll("SELECT * FROM partner_cars ORDER BY id DESC");
        }
    }

    $currentMonthStart = date('Y-m-01 00:00:00');

    $partnerCars = array_map(function($c) use ($currentMonthStart) {
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
                    "SELECT id, gallery, price_day FROM vehicles 
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

            // Query live bookings specifically for this hosted car
            $bSql = "SELECT id, booking_id, booking_number, user_name, user_phone, pickup_date, drop_date, 
                            duration, days, total_amount, final_amount, status, booking_status, payment_status,
                            start_odometer, end_odometer, location, created_at
                     FROM bookings
                     WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
                       AND (
                           (vehicle_reg IS NOT NULL AND vehicle_reg != '' AND REPLACE(REPLACE(REPLACE(UPPER(vehicle_reg), ' ', ''), '-', ''), '.', '') = ?)
                           " . ($vehId > 0 ? " OR vehicle_id = $vehId" : "") . "
                       )
                     ORDER BY pickup_date DESC LIMIT 50";

            $rawBookings = Database::fetchAll($bSql, [$cleanReg]);

            foreach ($rawBookings as $b) {
                $bStat = strtolower(trim((string)($b['status'] ?? '')));
                $pStat = strtolower(trim((string)($b['payment_status'] ?? '')));
                $amt = (float)($b['final_amount'] ?: ($b['total_amount'] ?: 0.0));
                $pDate = !empty($b['pickup_date']) ? (string)$b['pickup_date'] : (string)($b['created_at'] ?? '');

                $totalTrips++;
                if ($bStat === 'completed') {
                    $completedTrips++;
                }
                if (in_array($bStat, ['active', 'in_trip', 'started'], true)) {
                    $activeTrips++;
                }

                $totalRevenue += $amt;
                if ($pDate >= $currentMonthStart) {
                    $monthRevenue += $amt;
                }

                $bRef = !empty($b['booking_number']) ? $b['booking_number'] : (!empty($b['booking_id']) ? $b['booking_id'] : ('#BK-' . $b['id']));

                $carBookings[] = [
                    'id' => $b['id'],
                    'bookingRef' => $bRef,
                    'customerName' => $b['user_name'] ?: 'Customer',
                    'pickupDate' => $b['pickup_date'],
                    'dropDate' => $b['drop_date'],
                    'days' => (int)($b['days'] ?: 1),
                    'duration' => $b['duration'] ?: '1 Day',
                    'amount' => $amt,
                    'status' => $b['status'],
                    'paymentStatus' => $b['payment_status'],
                    'startOdometer' => $b['start_odometer'] ?? null,
                    'endOdometer' => $b['end_odometer'] ?? null,
                ];
            }
        } catch (Throwable $e) {
            error_log("[partner-cars.php Booking Lookup Error] " . $e->getMessage());
        }

        return [
            'id' => $identifier,
            'carId' => $identifier,
            'dbId' => $c['id'],
            'userId' => $c['firebase_uid'],
            'firebaseUid' => $c['firebase_uid'],
            'dbUserId' => $c['user_id'],
            'user_id' => $c['user_id'],
            'userName' => $c['user_name'],
            'userPhone' => $c['user_phone'],
            'userEmail' => $c['user_email'],
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
                    'baleno' => 'assets/fleet/Maruti Suzuki Baleno.png',
                    'toyota glanza' => 'assets/fleet/Toyota Glanza.png',
                    'glanza' => 'assets/fleet/Toyota Glanza.png',
                    'maruti suzuki fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'tata punch' => 'assets/fleet/Tata Punch.png',
                    'punch' => 'assets/fleet/Tata Punch.png',
                    'maruti suzuki ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'mahindra xuv700' => 'assets/fleet/Mahindra XUV700.png',
                    'xuv700' => 'assets/fleet/Mahindra XUV700.png',
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
                    'baleno' => 'assets/fleet/Maruti Suzuki Baleno.png',
                    'toyota glanza' => 'assets/fleet/Toyota Glanza.png',
                    'glanza' => 'assets/fleet/Toyota Glanza.png',
                    'maruti suzuki fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'fronx' => 'assets/fleet/Maruti Suzuki Fronx.png',
                    'tata punch' => 'assets/fleet/Tata Punch.png',
                    'punch' => 'assets/fleet/Tata Punch.png',
                    'maruti suzuki ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'ertiga' => 'assets/fleet/Maruti Suzuki Ertiga.png',
                    'mahindra xuv700' => 'assets/fleet/Mahindra XUV700.png',
                    'xuv700' => 'assets/fleet/Mahindra XUV700.png',
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
            'bookings' => $carBookings,
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

    sendJsonResponse([
        'success' => true,
        'message' => 'Host vehicle listing submitted for review.',
        'carId' => $carId
    ], 201);
}

if ($method === 'PUT') {
    Auth::requireRole('admin', 'manager');
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
    $id = trim((string)($_GET['id'] ?? $input['id'] ?? $input['carId'] ?? ''));
    $status = trim((string)($input['status'] ?? ''));
    $reason = trim((string)($input['rejectionReason'] ?? ''));
    $photos = isset($input['photos']) ? (is_array($input['photos']) ? json_encode($input['photos']) : $input['photos']) : null;

    if (!$id) {
        sendErrorResponse('Host car ID is required.', 400);
    }

    Database::execute(
        "UPDATE partner_cars SET
            status = COALESCE(NULLIF(?, ''), status),
            rejection_reason = COALESCE(NULLIF(?, ''), rejection_reason),
            photos = COALESCE(?, photos),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ? OR car_id = ?",
        [$status, $reason, $photos, $id, $id]
    );

    sendJsonResponse(['success' => true, 'message' => 'Partner car updated.']);
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
        Database::execute("DELETE FROM partner_cars WHERE (id = ? OR car_id = ?) AND (firebase_uid = ? OR user_email = ?)", [$id, $id, $uid, $email]);
    }
    sendJsonResponse(['success' => true, 'message' => 'Partner car deleted.']);
}

sendErrorResponse('Method not allowed.', 405);
