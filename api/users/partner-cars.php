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
    $phone = preg_replace('/\D/', '', (string)($user['phone'] ?? ''));
    $phone10 = strlen($phone) >= 10 ? substr($phone, -10) : $phone;

    // Helper to resolve genuine host information for any partner car directly from database
    if (!function_exists('resolveHostInfo')) {
        function resolveHostInfo(?string $ownerName, ?string $carReg = ''): array {
            $cleanName = trim((string)$ownerName);
            $cleanReg = strtoupper(trim((string)$carReg));

            if ($cleanName === '' || in_array($cleanName, ['Kruizly Fleet Host', 'Fleet Catalog', 'KRUIZLY', 'User', 'Kruizly User'])) {
                return [
                    'name' => 'Kruizly Fleet Host',
                    'email' => 'host@kruizly.com',
                    'phone' => '+91 93240 21200',
                    'uid' => 'kruizly_fleet_host',
                    'user_id' => null
                ];
            }

            // 1. Check partner_cars table for this vehicle or host
            try {
                if ($cleanReg !== '') {
                    $pcRow = Database::fetchOne(
                        "SELECT user_name, user_email, user_phone, user_id, firebase_uid 
                         FROM partner_cars 
                         WHERE (reg_no = ? OR car_id = ?) 
                           AND user_email IS NOT NULL AND user_email != ''
                           AND LOWER(TRIM(user_email)) NOT IN ('carrentpedatabase@gmail.com', 'admin@kruizly.com', 'ayan@kruizly.com', 'currentpedatabase@gmail.com')
                         LIMIT 1",
                        [$cleanReg, $cleanReg]
                    );
                    if ($pcRow && (!empty($pcRow['user_email']) || !empty($pcRow['user_phone']))) {
                        return [
                            'name' => $pcRow['user_name'] ?: $cleanName,
                            'email' => $pcRow['user_email'] ?: '',
                            'phone' => $pcRow['user_phone'] ?: '',
                            'uid' => $pcRow['firebase_uid'] ?: ('host_' . md5($cleanName)),
                            'user_id' => !empty($pcRow['user_id']) ? (int)$pcRow['user_id'] : null
                        ];
                    }
                }
            } catch (Throwable $_) {}

            // 2. Check vehicles table for owner_email and owner_phone columns
            try {
                $vRow = Database::fetchOne(
                    "SELECT owner_name, owner_email, owner_phone 
                     FROM vehicles 
                     WHERE (reg_no = ? OR LOWER(TRIM(owner_name)) = LOWER(TRIM(?)))
                       AND owner_email IS NOT NULL AND owner_email != ''
                       AND LOWER(TRIM(owner_email)) NOT IN ('carrentpedatabase@gmail.com', 'admin@kruizly.com', 'ayan@kruizly.com', 'currentpedatabase@gmail.com')
                     LIMIT 1",
                    [$cleanReg, $cleanName]
                );
                if ($vRow && (!empty($vRow['owner_email']) || !empty($vRow['owner_phone']))) {
                    return [
                        'name' => $vRow['owner_name'] ?: $cleanName,
                        'email' => $vRow['owner_email'] ?: '',
                        'phone' => $vRow['owner_phone'] ?: '',
                        'uid' => 'host_' . md5($cleanName),
                        'user_id' => null
                    ];
                }
            } catch (Throwable $_) {}

            // 3. Match against users table (strictly excluding admin emails)
            try {
                $uRow = Database::fetchOne(
                    "SELECT id, firebase_uid, email, phone, name 
                     FROM users 
                     WHERE (LOWER(TRIM(name)) = LOWER(TRIM(?)) OR (name LIKE ? AND LENGTH(name) > 3))
                       AND LOWER(TRIM(email)) NOT IN ('carrentpedatabase@gmail.com', 'admin@kruizly.com', 'ayan@kruizly.com', 'currentpedatabase@gmail.com')
                     ORDER BY CASE WHEN LOWER(TRIM(name)) = LOWER(TRIM(?)) THEN 1 ELSE 2 END, id DESC 
                     LIMIT 1",
                    [$cleanName, '%' . $cleanName . '%', $cleanName]
                );
                if ($uRow && (!empty($uRow['email']) || !empty($uRow['phone']))) {
                    return [
                        'name' => $uRow['name'] ?: $cleanName,
                        'email' => $uRow['email'] ?: '',
                        'phone' => $uRow['phone'] ?: '',
                        'uid' => $uRow['firebase_uid'] ?: ('host_' . md5($cleanName)),
                        'user_id' => (int)$uRow['id']
                    ];
                }
            } catch (Throwable $_) {}

            return [
                'name' => $cleanName,
                'email' => '',
                'phone' => '',
                'uid' => 'host_' . md5($cleanName),
                'user_id' => null
            ];
        }
    }

    // Auto-heal vehicles table schema: ensure owner_email and owner_phone columns exist
    try {
        $cols = Database::fetchAll("SHOW COLUMNS FROM vehicles");
        $colNames = array_map(fn($c) => strtolower((string)$c['Field']), $cols);
        if (!in_array('owner_email', $colNames, true)) {
            Database::execute("ALTER TABLE vehicles ADD COLUMN `owner_email` VARCHAR(191) DEFAULT NULL AFTER `owner_name`");
        }
        if (!in_array('owner_phone', $colNames, true)) {
            Database::execute("ALTER TABLE vehicles ADD COLUMN `owner_phone` VARCHAR(32) DEFAULT NULL AFTER `owner_email`");
        }

        // Sync host emails into vehicles table if null, linking by users table
        Database::execute(
            "UPDATE vehicles v
             JOIN users u ON (
                 LOWER(TRIM(u.name)) = LOWER(TRIM(v.owner_name))
                 OR (v.owner_name LIKE '% %' AND u.name LIKE CONCAT('%', SUBSTRING_INDEX(v.owner_name, ' ', 1), '%'))
             )
             SET v.owner_email = COALESCE(NULLIF(v.owner_email, ''), u.email),
                 v.owner_phone = COALESCE(NULLIF(v.owner_phone, ''), u.phone)
             WHERE (v.owner_email IS NULL OR v.owner_email = '' OR v.owner_email IN ('carrentpedatabase@gmail.com', 'admin@kruizly.com'))
               AND u.email NOT IN ('carrentpedatabase@gmail.com', 'admin@kruizly.com', 'ayan@kruizly.com')"
        );

        // Auto-heal partner_leads table if empty
        $leadsTableExists = Database::fetchOne("SHOW TABLES LIKE 'partner_leads'");
        if ($leadsTableExists) {
            $leadsCount = (int)Database::fetchValue("SELECT COUNT(*) FROM partner_leads");
            if ($leadsCount === 0) {
                Database::execute(
                    "INSERT INTO partner_leads (name, phone, email, status, priority, source, city, car_owned, purchase_year, remark, created_at)
                     SELECT 
                         v.owner_name,
                         COALESCE(NULLIF(v.owner_phone, ''), u.phone, '9867539466'),
                         COALESCE(NULLIF(v.owner_email, ''), u.email, 'partner@kruizly.com'),
                         'active_partner', 'high', 'fleet_partner', 
                         COALESCE(NULLIF(v.location, ''), 'Navi Mumbai'),
                         CONCAT(v.brand, ' ', v.model),
                         COALESCE(NULLIF(v.year, 0), 2026),
                         'Active fleet host partner', NOW()
                     FROM vehicles v
                     LEFT JOIN users u ON LOWER(TRIM(u.name)) = LOWER(TRIM(v.owner_name))
                     WHERE LOWER(TRIM(v.acquisition_type)) IN ('partner', 'host', 'hosted')
                        OR (v.owner_name IS NOT NULL AND v.owner_name != '' AND v.owner_name NOT IN ('Fleet Catalog', 'KRUIZLY'))
                     GROUP BY v.owner_name"
                );
            }
        }
    } catch (Throwable $_) {}

    // Auto-seed partner_cars table if empty from catalog vehicles
    try {
        $tableExists = Database::fetchOne("SHOW TABLES LIKE 'partner_cars'");
        if ($tableExists) {
            $pcCount = (int)Database::fetchValue("SELECT COUNT(*) FROM partner_cars");
            if ($pcCount === 0) {
                $vPartners = Database::fetchAll(
                    "SELECT * FROM vehicles 
                     WHERE status != 'removed' 
                       AND (
                           LOWER(TRIM(acquisition_type)) IN ('partner', 'host', 'hosted')
                           OR (owner_name IS NOT NULL AND owner_name != '' AND owner_name NOT IN ('Fleet Catalog', 'KRUIZLY'))
                       )
                     ORDER BY id ASC"
                );
                foreach ($vPartners as $vp) {
                    $hostInfo = resolveHostInfo($vp['owner_name'], $vp['reg_no'] ?? '');
                    $cId = !empty($vp['car_id']) ? $vp['car_id'] : ('CRP-' . str_pad((string)$vp['id'], 3, '0', STR_PAD_LEFT));
                    Database::execute(
                        "INSERT INTO partner_cars (
                            car_id, user_id, firebase_uid, user_name, user_phone, user_email,
                            brand, model, year, reg_no, transmission, fuel, city, expected_price,
                            status, photos, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, NOW(), NOW())
                        ON DUPLICATE KEY UPDATE 
                            user_name = VALUES(user_name),
                            user_phone = COALESCE(NULLIF(VALUES(user_phone), ''), user_phone),
                            user_email = COALESCE(NULLIF(VALUES(user_email), ''), user_email),
                            brand = VALUES(brand),
                            model = VALUES(model),
                            photos = VALUES(photos)",
                        [
                            $cId,
                            $hostInfo['user_id'] ?? null,
                            $hostInfo['uid'],
                            $hostInfo['name'],
                            $hostInfo['phone'],
                            $hostInfo['email'],
                            $vp['brand'],
                            $vp['model'],
                            (int)($vp['year'] ?: 2026),
                            $vp['reg_no'],
                            $vp['transmission'] ?: 'Manual',
                            $vp['fuel'] ?: 'Petrol',
                            $vp['location'] ?: 'Navi Mumbai',
                            (float)($vp['price_day'] ?: 3000),
                            $vp['gallery']
                        ]
                    );
                }
            }
        }
    } catch (Throwable $_) {}

    // Auto-link legacy / unlinked partner_cars to this user if email or phone matches
    if (!empty($uid)) {
        if (!empty($email) && !in_array($email, ['carrentpedatabase@gmail.com', 'admin@kruizly.com', 'currentpedatabase@gmail.com', 'ayan@kruizly.com'], true)) {
            try {
                Database::execute(
                    "UPDATE partner_cars 
                     SET firebase_uid = ?, 
                         user_id = COALESCE(NULLIF(user_id, 0), ?) 
                     WHERE LOWER(TRIM(user_email)) = ? 
                       AND (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid LIKE 'legacy_%' OR firebase_uid LIKE 'host_%')",
                    [$uid, $dbId ?: null, $email]
                );
            } catch (Throwable $_) {}
        }
        if (!empty($phone10) && $phone10 !== '7208533219') {
            try {
                Database::execute(
                    "UPDATE partner_cars 
                     SET firebase_uid = ?, 
                         user_id = COALESCE(NULLIF(user_id, 0), ?) 
                     WHERE user_phone IS NOT NULL AND user_phone != '' 
                       AND REPLACE(REPLACE(REPLACE(user_phone, ' ', ''), '-', ''), '+91', '') LIKE ?
                       AND (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid LIKE 'legacy_%' OR firebase_uid LIKE 'host_%')",
                    [$uid, $dbId ?: null, '%' . $phone10]
                );
            } catch (Throwable $_) {}
        }
        if (!empty($name) && !in_array(strtolower($name), ['user', 'kruizly user', 'car database', 'admin', 'kruizly fleet host'], true)) {
            try {
                Database::execute(
                    "UPDATE partner_cars 
                     SET firebase_uid = ?, 
                         user_id = COALESCE(NULLIF(user_id, 0), ?) 
                     WHERE user_name IS NOT NULL AND user_name != '' 
                       AND LOWER(TRIM(user_name)) = LOWER(TRIM(?))
                       AND (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid LIKE 'legacy_%' OR firebase_uid LIKE 'host_%')",
                    [$uid, $dbId ?: null, $name]
                );
            } catch (Throwable $_) {}
        }
    }

    $rows = [];
    if ($isAdminScope || $isStaff) {
        $rows = Database::fetchAll("SELECT * FROM partner_cars ORDER BY id DESC");
        // If partner_cars is still empty, synthesize directly from vehicles table
        if (empty($rows)) {
            try {
                $vehAll = Database::fetchAll(
                    "SELECT v.* FROM vehicles v
                     WHERE v.status != 'removed'
                       AND (
                           LOWER(TRIM(v.acquisition_type)) IN ('partner', 'host', 'hosted')
                           OR (v.owner_name IS NOT NULL AND v.owner_name != '' AND v.owner_name NOT IN ('Fleet Catalog', 'KRUIZLY'))
                       )
                     ORDER BY v.id DESC"
                );
                foreach ($vehAll as $v) {
                    $vReg = strtoupper(str_replace([' ', '-', '.'], '', (string)($v['reg_no'] ?? '')));
                    $hInfo = resolveHostInfo($v['owner_name'] ?? '', $vReg);
                    $rows[] = [
                        'id' => (int)$v['id'],
                        'car_id' => $v['car_id'] ?? ('CRP-' . str_pad((string)$v['id'], 3, '0', STR_PAD_LEFT)),
                        'user_id' => $hInfo['user_id'] ?? null,
                        'firebase_uid' => $hInfo['uid'],
                        'user_name' => $hInfo['name'],
                        'user_phone' => $hInfo['phone'],
                        'user_email' => $hInfo['email'],
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
                        'created_at' => $v['created_at'] ?? ($v['acquisition_date'] ? ($v['acquisition_date'] . ' 00:00:00') : date('Y-m-d H:i:s')),
                        'updated_at' => $v['updated_at'] ?? date('Y-m-d H:i:s'),
                    ];
                }
            } catch (Throwable $_) {}
        }
    } else {
        // Fetch matching partner_cars rows for this host user
        $queryConditions = [];
        $queryParams = [];

        if (!empty($uid)) {
            $queryConditions[] = "firebase_uid = ?";
            $queryParams[] = $uid;
        }
        if (!empty($email)) {
            $queryConditions[] = "(user_email IS NOT NULL AND user_email != '' AND LOWER(TRIM(user_email)) = ?)";
            $queryParams[] = $email;
        }
        if ($dbId > 0) {
            $queryConditions[] = "user_id = ?";
            $queryParams[] = $dbId;
        }
        if (!empty($phone10)) {
            $queryConditions[] = "(user_phone IS NOT NULL AND user_phone != '' AND REPLACE(REPLACE(REPLACE(user_phone, ' ', ''), '-', ''), '+91', '') LIKE ?)";
            $queryParams[] = '%' . $phone10;
        }
        if (!empty($name) && !in_array(strtolower($name), ['user', 'kruizly user', 'car database'], true)) {
            $queryConditions[] = "(user_name IS NOT NULL AND user_name != '' AND LOWER(TRIM(user_name)) = LOWER(TRIM(?)))";
            $queryParams[] = $name;
        }

        if (!empty($queryConditions)) {
            $whereClause = implode(" OR ", $queryConditions);
            $rows = Database::fetchAll("SELECT * FROM partner_cars WHERE $whereClause ORDER BY id DESC", $queryParams);
        }

        // Also check if vehicles catalog has partner vehicles owned by this host
        $knownRegs = [];
        foreach ($rows as $r) {
            $k = strtoupper(str_replace([' ', '-', '.'], '', (string)($r['reg_no'] ?? '')));
            if ($k !== '') $knownRegs[$k] = true;
        }

        try {
            $vConditions = [];
            $vParams = [];

            if (!empty($name) && !in_array(strtolower($name), ['user', 'kruizly user'], true)) {
                $vConditions[] = "LOWER(TRIM(v.owner_name)) = LOWER(TRIM(?))";
                $vParams[] = $name;
                $vConditions[] = "LOWER(v.owner_name) LIKE ?";
                $vParams[] = '%' . strtolower($name) . '%';
            }

            if (!empty($vConditions)) {
                $vWhere = implode(" OR ", $vConditions);
                $vehRows = Database::fetchAll(
                    "SELECT v.* 
                     FROM vehicles v
                     WHERE v.status != 'removed'
                       AND (
                           LOWER(TRIM(v.acquisition_type)) IN ('partner', 'host', 'hosted')
                           OR (v.owner_name IS NOT NULL AND v.owner_name != '' AND v.owner_name NOT IN ('Kruizly Fleet Host', 'Fleet Catalog', 'KRUIZLY'))
                       )
                       AND ($vWhere)
                     ORDER BY v.id DESC",
                    $vParams
                );

                foreach ($vehRows as $v) {
                    $vReg = strtoupper(str_replace([' ', '-', '.'], '', (string)($v['reg_no'] ?? '')));
                    if ($vReg !== '' && !isset($knownRegs[$vReg])) {
                        $knownRegs[$vReg] = true;
                        $hInfo = resolveHostInfo($v['owner_name'] ?: $name, $vReg);
                        $rows[] = [
                            'id' => (int)$v['id'],
                            'car_id' => $v['car_id'] ?? ('CRP-' . str_pad((string)$v['id'], 3, '0', STR_PAD_LEFT)),
                            'user_id' => $hInfo['user_id'] ?? ($dbId ?: null),
                            'firebase_uid' => $hInfo['uid'] ?: $uid,
                            'user_name' => $hInfo['name'],
                            'user_phone' => $hInfo['phone'] ?: ($user['phone'] ?? ''),
                            'user_email' => $hInfo['email'] ?: $email,
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
                            'created_at' => $v['created_at'] ?? ($v['acquisition_date'] ? ($v['acquisition_date'] . ' 00:00:00') : date('Y-m-d H:i:s')),
                            'updated_at' => $v['updated_at'] ?? date('Y-m-d H:i:s'),
                        ];
                    }
                }
            }
        } catch (Throwable $_) {}
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
                    "SELECT id, gallery, price_day, acquisition_type, owner_name FROM vehicles 
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

            // Determine Acquisition Payout Model:
            // 1) Fixed Monthly: Company gives a fixed monthly payout (e.g. ₹25,000/mo)
            // 2) Revenue Share (Default): 60% of each trip booking goes to user, 40% to company
            $rawAcquisition = strtolower(trim((string)($c['payout_model'] ?? $vRow['acquisition_type'] ?? $c['acquisition_type'] ?? 'partner')));
            $isFixedMonthly = str_contains($rawAcquisition, 'fixed') || !empty($c['fixed_monthly_amount']);
            $fixedMonthlyAmount = (float)($c['fixed_monthly_amount'] ?? 25000.0);
            if ($fixedMonthlyAmount <= 0) $fixedMonthlyAmount = 25000.0;

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
                $hostTripShare = round($amt * 0.60, 2);
                $companyTripShare = round($amt * 0.40, 2);

                $carBookings[] = [
                    'id' => $b['id'],
                    'bookingRef' => $bRef,
                    'customerName' => $b['user_name'] ?: 'Customer',
                    'pickupDate' => $b['pickup_date'],
                    'dropDate' => $b['drop_date'],
                    'days' => (int)($b['days'] ?: 1),
                    'duration' => $b['duration'] ?: '1 Day',
                    'amount' => $amt,
                    'hostShare' => $hostTripShare,
                    'companyShare' => $companyTripShare,
                    'hostSharePct' => 60,
                    'companySharePct' => 40,
                    'status' => $b['status'],
                    'paymentStatus' => $b['payment_status'],
                    'startOdometer' => $b['start_odometer'] ?? null,
                    'endOdometer' => $b['end_odometer'] ?? null,
                ];
            }
        } catch (Throwable $e) {
            error_log("[partner-cars.php Booking Lookup Error] " . $e->getMessage());
        }

        // Calculate host vs company earnings based on acquisition model
        if ($isFixedMonthly) {
            $payoutModel = 'fixed_monthly';
            $payoutModelLabel = 'Fixed Monthly Payout';
            $hostMonthEarnings = $fixedMonthlyAmount;
            $hostTotalEarnings = max($fixedMonthlyAmount, round($totalRevenue * 0.60, 2));
            $companyMonthRevenue = max(0.0, round($monthRevenue - $fixedMonthlyAmount, 2));
            $companyTotalRevenue = max(0.0, round($totalRevenue - $hostTotalEarnings, 2));
        } else {
            // Module A: Trip-based 60% to host, 40% to company
            $payoutModel = 'revenue_share';
            $payoutModelLabel = '60% Host / 40% Company';
            $hostMonthEarnings = round($monthRevenue * 0.60, 2);
            $hostTotalEarnings = round($totalRevenue * 0.60, 2);
            $companyMonthRevenue = round($monthRevenue * 0.40, 2);
            $companyTotalRevenue = round($totalRevenue * 0.40, 2);
        }

        $rawHostName = trim((string)($c['user_name'] ?? ''));
        $rawHostPhone = trim((string)($c['user_phone'] ?? ''));
        $rawHostEmail = trim((string)($c['user_email'] ?? ''));

        // Look up the host's exact profile record from users table to get their saved profile email and phone
        try {
            $uProfile = null;
            if (!empty($c['user_id']) && $c['user_id'] > 0) {
                $uProfile = Database::fetchOne("SELECT id, firebase_uid, email, phone, name FROM users WHERE id = ?", [(int)$c['user_id']]);
            }
            if (!$uProfile && !empty($c['firebase_uid']) && !str_starts_with($c['firebase_uid'], 'host_')) {
                $uProfile = Database::fetchOne("SELECT id, firebase_uid, email, phone, name FROM users WHERE firebase_uid = ?", [$c['firebase_uid']]);
            }
            if (!$uProfile && !empty($rawHostName) && !in_array($rawHostName, ['Kruizly Fleet Host', 'Fleet Catalog', 'KRUIZLY', 'User'])) {
                $uProfile = Database::fetchOne(
                    "SELECT id, firebase_uid, email, phone, name FROM users 
                     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
                        OR (name LIKE ? AND LENGTH(name) > 3)
                     ORDER BY CASE WHEN LOWER(TRIM(name)) = LOWER(TRIM(?)) THEN 1 ELSE 2 END, id DESC LIMIT 1",
                    [$rawHostName, '%' . $rawHostName . '%', $rawHostName]
                );
            }
            if ($uProfile) {
                $pEmail = strtolower(trim((string)($uProfile['email'] ?? '')));
                if (!empty($pEmail) && !in_array($pEmail, ['carrentpedatabase@gmail.com', 'admin@kruizly.com', 'currentpedatabase@gmail.com'])) {
                    $rawHostEmail = $pEmail;
                }
                $pPhone = trim((string)($uProfile['phone'] ?? ''));
                if (!empty($pPhone) && $pPhone !== '7208533219') {
                    $rawHostPhone = $pPhone;
                }
                if (!empty($uProfile['name'])) {
                    $rawHostName = $uProfile['name'];
                }
            }
        } catch (Throwable $_) {}

        // Fallback to resolveHostInfo if still empty or contaminated by admin viewer
        $adminContaminated = in_array(strtolower($rawHostEmail), ['carrentpedatabase@gmail.com', 'admin@kruizly.com', 'currentpedatabase@gmail.com', 'ayan@kruizly.com'], true);
        if (empty($rawHostEmail) || empty($rawHostPhone) || $adminContaminated) {
            $hostResolved = resolveHostInfo($rawHostName, $cleanReg);
            if (!empty($hostResolved['email']) && ($adminContaminated || empty($rawHostEmail))) {
                $rawHostEmail = $hostResolved['email'];
            }
            if (!empty($hostResolved['phone']) && ($rawHostPhone === '7208533219' || empty($rawHostPhone))) {
                $rawHostPhone = $hostResolved['phone'];
            }
            if (empty($rawHostName) || $rawHostName === 'User' || $rawHostName === 'Kruizly User') {
                $rawHostName = $hostResolved['name'];
            }
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
            'revenueSharePct' => 60,
            'companySharePct' => 40,
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
        $dbId = (int)($user['id'] ?? 0);
        Database::execute("DELETE FROM partner_cars WHERE (id = ? OR car_id = ?) AND (firebase_uid = ? OR user_email = ? OR user_id = ?)", [$id, $id, $uid, $email, $dbId]);
    }
    sendJsonResponse(['success' => true, 'message' => 'Partner car deleted.']);
}

sendErrorResponse('Method not allowed.', 405);
