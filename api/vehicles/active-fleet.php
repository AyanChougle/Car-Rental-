<?php
/**
 * api/vehicles/active-fleet.php
 * GET  - Get the list of active fleet vehicles shown in Manager Summary
 * POST - (Admin / Manager) Add, remove, or toggle active fleet vehicles
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Default 7 Kruizly Fleet vehicles (supporting both DB variations e.g. GJ/CJ, CU/CY, EF/EL)
$defaultActiveRegs = [
    'MH03EF1025',
    'MH03EL1025',
    'MH05GJ4711',
    'MH48GJ4153',
    'MH48CJ4153',
    'MH04MU1178',
    'MH05FV3454',
    'MH43CU1632',
    'MH43CY1632',
    'MH02FU6808'
];

$canonicalFleetCarIds = [
    'CRP-002',
    'CRP-003',
    'CRP-005',
    'CRP-006',
    'CRP-007',
    'CRP-008',
    'CRP-009'
];

if ($method === 'GET') {
    // 1. Fetch current active fleet list from settings
    $setting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'manager_active_fleets' LIMIT 1");
    $activeRegs = $defaultActiveRegs;

    if ($setting && !empty($setting['value'])) {
        $decoded = json_decode($setting['value'], true);
        if (is_array($decoded) && count($decoded) > 0) {
            $cleaned = array_values(array_filter($decoded, function($r) {
                return !str_starts_with(strtoupper(trim((string)$r)), 'ZIP');
            }));
            if (count($cleaned) >= 7) {
                $activeRegs = array_values(array_unique(array_map(function($r) {
                    return strtoupper(trim((string)$r));
                }, $cleaned)));
            }
        }
    }

    // 2. Fetch all vehicles from database
    $allDbVehicles = Database::fetchAll("SELECT * FROM vehicles WHERE status != 'removed' ORDER BY brand ASC, model ASC");

    $vehiclesMap = [];
    $vehiclesByCarId = [];
    $vehiclesById = [];
    foreach ($allDbVehicles as $v) {
        $cleanReg = strtoupper(trim(preg_replace('/[^A-Z0-9]/', '', (string)$v['reg_no'])));
        $rawReg = strtoupper(trim((string)$v['reg_no']));
        $cleanCarId = strtoupper(trim((string)($v['car_id'] ?? '')));
        $id = (int)$v['id'];
        $gallery = [];
        if (!empty($v['gallery'])) {
            $gallery = is_string($v['gallery']) ? json_decode($v['gallery'], true) : $v['gallery'];
        }
        $img = (is_array($gallery) && !empty($gallery[0])) ? $gallery[0] : 'assets/fleet/' . $v['brand'] . ' ' . $v['model'] . '.png';

        $displayReg = ($rawReg !== '' && $rawReg !== 'TBD') ? $rawReg : ($cleanCarId !== '' ? $cleanCarId : 'CAT-' . $id);

        $item = [
            'id' => $v['id'],
            'carId' => $v['car_id'] ?? null,
            'regNo' => $displayReg,
            'brand' => $v['brand'],
            'model' => $v['model'],
            'year' => (int)$v['year'],
            'category' => $v['category'],
            'transmission' => $v['transmission'],
            'fuel' => $v['fuel'],
            'seats' => (int)$v['seats'],
            'priceDay' => (float)$v['price_day'],
            'priceHour' => (float)$v['price_hour'],
            'hub' => $v['hub'] ?? 'Gavson Business Park, Ghansoli',
            'acquisitionType' => $v['acquisition_type'] ?? 'Partner',
            'ownerName' => $v['owner_name'] ?? null,
            'acquisitionDate' => $v['acquisition_date'] ?? null,
            'available' => (int)$v['available'],
            'status' => $v['status'],
            'imageUrl' => $img,
            'isActiveFleet' => true
        ];

        if ($cleanReg !== '') {
            $vehiclesMap[$cleanReg] = $item;
            $simpReg = str_replace(['C', 'G'], 'C', str_replace(['U', 'Y'], 'U', str_replace(['F', 'L'], 'F', $cleanReg)));
            $vehiclesMap[$simpReg] = $item;
        }
        if ($rawReg !== '') {
            $vehiclesMap[$rawReg] = $item;
        }
        if ($cleanCarId !== '') {
            $vehiclesByCarId[$cleanCarId] = $item;
            $vehiclesMap[$cleanCarId] = $item;
        }
        $vehiclesById[$id] = $item;
        $vehiclesMap[(string)$id] = $item;
    }

    // Default metadata for the 7 standard Kruizly fleets
    $standardFleetMeta = [
        'MH03EF1025' => ['carId' => 'CRP-002', 'brand' => 'Suzuki', 'model' => 'Fronx', 'year' => 2026, 'category' => 'compact-suv', 'transmission' => 'Automatic', 'fuel' => 'Petrol', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Aditi Lotankar', 'acquisitionDate' => '2026-07-20', 'priceDay' => 3500, 'image' => 'assets/fleet/Suzuki Fronx.png'],
        'MH03EL1025' => ['carId' => 'CRP-002', 'brand' => 'Suzuki', 'model' => 'Fronx', 'year' => 2026, 'category' => 'compact-suv', 'transmission' => 'Automatic', 'fuel' => 'Petrol', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Aditi Lotankar', 'acquisitionDate' => '2026-07-20', 'priceDay' => 3500, 'image' => 'assets/fleet/Suzuki Fronx.png'],
        'MH05GJ4711' => ['carId' => 'CRP-003', 'brand' => 'Suzuki', 'model' => 'Ertiga', 'year' => 2026, 'category' => 'mpv', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 7, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Viren Gupta', 'acquisitionDate' => '2026-07-24', 'priceDay' => 4000, 'image' => 'assets/fleet/Suzuki Ertiga.png'],
        'MH48GJ4153' => ['carId' => 'CRP-005', 'brand' => 'Toyota', 'model' => 'Glanza', 'year' => 2026, 'category' => 'hatchback', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Ajay Vishwakarma', 'acquisitionDate' => '2026-07-29', 'priceDay' => 3000, 'image' => 'assets/fleet/Toyota Glanza.png'],
        'MH48CJ4153' => ['carId' => 'CRP-005', 'brand' => 'Toyota', 'model' => 'Glanza', 'year' => 2026, 'category' => 'hatchback', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Ajay Vishwakarma', 'acquisitionDate' => '2026-07-29', 'priceDay' => 3000, 'image' => 'assets/fleet/Toyota Glanza.png'],
        'MH04MU1178' => ['carId' => 'CRP-006', 'brand' => 'Toyota', 'model' => 'Glanza', 'year' => 2026, 'category' => 'hatchback', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Kundan Singh', 'acquisitionDate' => '2026-08-04', 'priceDay' => 3000, 'image' => 'assets/fleet/Toyota Glanza.png'],
        'MH05FV3454' => ['carId' => 'CRP-007', 'brand' => 'Tata', 'model' => 'Punch', 'year' => 2026, 'category' => 'compact-suv', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Tai Phad', 'acquisitionDate' => '2026-08-13', 'priceDay' => 3000, 'image' => 'assets/fleet/Tata Punch.png'],
        'MH43CU1632' => ['carId' => 'CRP-008', 'brand' => 'Suzuki', 'model' => 'Fronx', 'year' => 2026, 'category' => 'compact-suv', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Amol Gole', 'acquisitionDate' => '2026-08-19', 'priceDay' => 3200, 'image' => 'assets/fleet/Suzuki Fronx.png'],
        'MH43CY1632' => ['carId' => 'CRP-008', 'brand' => 'Suzuki', 'model' => 'Fronx', 'year' => 2026, 'category' => 'compact-suv', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Amol Gole', 'acquisitionDate' => '2026-08-19', 'priceDay' => 3200, 'image' => 'assets/fleet/Suzuki Fronx.png'],
        'MH02FU6808' => ['carId' => 'CRP-009', 'brand' => 'Mahindra', 'model' => 'XUV 700', 'year' => 2026, 'category' => 'suv', 'transmission' => 'Automatic', 'fuel' => 'Petrol', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Saif Feroz Shaikh', 'acquisitionDate' => '2026-08-01', 'priceDay' => 5500, 'image' => 'assets/fleet/Mahindra XUV 700.png'],
    ];

    // Build active fleet roster
    $activeFleetList = [];
    $seenKeys = [];

    // Resolve vehicles from activeRegs setting
    foreach ($activeRegs as $reg) {
        $regUpper = strtoupper(trim((string)$reg));
        $simp = str_replace(['C', 'G'], 'C', str_replace(['U', 'Y'], 'U', str_replace(['F', 'L'], 'F', preg_replace('/[^A-Z0-9]/', '', $regUpper))));
        $matchedVeh = $vehiclesMap[$regUpper] ?? $vehiclesMap[$simp] ?? $vehiclesByCarId[$regUpper] ?? (is_numeric($regUpper) ? ($vehiclesById[(int)$regUpper] ?? null) : null);

        if ($matchedVeh) {
            $mKey = $matchedVeh['id'] ?? $matchedVeh['carId'] ?? $matchedVeh['regNo'];
            if (empty($seenKeys[$mKey])) {
                $activeFleetList[] = $matchedVeh;
                $seenKeys[$mKey] = true;
            }
        } elseif (isset($standardFleetMeta[$regUpper])) {
            $m = $standardFleetMeta[$regUpper];
            if (empty($seenKeys[$m['carId']])) {
                $activeFleetList[] = [
                    'id' => null,
                    'carId' => $m['carId'],
                    'regNo' => $regUpper,
                    'brand' => $m['brand'],
                    'model' => $m['model'],
                    'year' => $m['year'],
                    'category' => $m['category'],
                    'transmission' => $m['transmission'],
                    'fuel' => $m['fuel'],
                    'seats' => $m['seats'],
                    'priceDay' => (float)$m['priceDay'],
                    'priceHour' => round($m['priceDay'] / 24),
                    'available' => 1,
                    'status' => 'available',
                    'imageUrl' => $m['image'],
                    'isActiveFleet' => true
                ];
                $seenKeys[$m['carId']] = true;
            }
        }
    }

    // Include canonical partner fleets (CRP-002 to CRP-009) if not already added
    foreach ($canonicalFleetCarIds as $cId) {
        if (isset($vehiclesByCarId[$cId])) {
            $cVeh = $vehiclesByCarId[$cId];
            $cKey = $cVeh['id'] ?? $cId;
            if (empty($seenKeys[$cKey])) {
                if (in_array($cId, $activeRegs, true) || in_array($cVeh['regNo'], $activeRegs, true) || count($activeFleetList) < 7) {
                    $activeFleetList[] = $cVeh;
                    $seenKeys[$cKey] = true;
                }
            }
        }
    }

    sendJsonResponse([
        'success' => true,
        'activeCount' => count($activeFleetList),
        'activeRegs' => $activeRegs,
        'activeFleet' => $activeFleetList,
        'fleets' => $activeFleetList,
        'allVehicles' => array_values($vehiclesMap)
    ]);
}

if ($method === 'POST') {
    // Only Admin or Manager can modify active fleet roster
    $user = Auth::requireRole('admin', 'manager');

    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
    $action = trim((string)($input['action'] ?? 'toggle'));
    $rawTarget = trim((string)($input['regNo'] ?? $input['reg_no'] ?? $input['carId'] ?? $input['car_id'] ?? $input['id'] ?? ''));
    $targetReg = strtoupper($rawTarget);

    // If identifier looks like a registration plate with spaces, normalize it
    if (preg_match('/^[A-Z]{2}\s*\d{1,2}\s*[A-Z]{0,3}\s*\d{1,4}$/i', $targetReg)) {
        $targetReg = preg_replace('/[^A-Z0-9]/', '', $targetReg);
    }

    // Resolve vehicle from DB if needed
    $targetVeh = null;
    if ($targetReg !== '') {
        $targetVeh = Database::fetchOne(
            "SELECT * FROM vehicles WHERE UPPER(reg_no) = ? OR UPPER(car_id) = ? OR id = ? LIMIT 1",
            [$targetReg, $targetReg, is_numeric($targetReg) ? (int)$targetReg : -1]
        );
    }

    // Fetch existing settings
    $setting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'manager_active_fleets' LIMIT 1");
    $currentActiveRegs = $defaultActiveRegs;

    if ($setting && !empty($setting['value'])) {
        $decoded = json_decode($setting['value'], true);
        if (is_array($decoded) && count($decoded) > 0) {
            $currentActiveRegs = array_values(array_unique(array_map(function($r) {
                return strtoupper(trim((string)$r));
            }, $decoded)));
        }
    }

    if ($action === 'reset') {
        $currentActiveRegs = $defaultActiveRegs;
    } elseif ($action === 'set' && isset($input['activeRegs']) && is_array($input['activeRegs'])) {
        $currentActiveRegs = array_values(array_unique(array_filter(array_map(function($r) {
            return strtoupper(trim((string)$r));
        }, $input['activeRegs']))));
    } elseif ($action === 'add' && $targetReg !== '') {
        if (!in_array($targetReg, $currentActiveRegs, true)) {
            $currentActiveRegs[] = $targetReg;
        }
        if ($targetVeh) {
            $vehReg = strtoupper(trim((string)($targetVeh['reg_no'] ?? '')));
            $vehCarId = strtoupper(trim((string)($targetVeh['car_id'] ?? '')));
            if ($vehReg !== '' && !in_array($vehReg, $currentActiveRegs, true)) {
                $currentActiveRegs[] = $vehReg;
            }
            if ($vehCarId !== '' && !in_array($vehCarId, $currentActiveRegs, true)) {
                $currentActiveRegs[] = $vehCarId;
            }
        }
    } elseif ($action === 'remove' && $targetReg !== '') {
        $removeTargets = [$targetReg];
        if ($targetVeh) {
            $vehReg = strtoupper(trim((string)($targetVeh['reg_no'] ?? '')));
            $vehCarId = strtoupper(trim((string)($targetVeh['car_id'] ?? '')));
            if ($vehReg !== '') $removeTargets[] = $vehReg;
            if ($vehCarId !== '') $removeTargets[] = $vehCarId;
        }
        $currentActiveRegs = array_values(array_diff($currentActiveRegs, $removeTargets));
    } elseif ($action === 'toggle' && $targetReg !== '') {
        $isCurrentlyActive = in_array($targetReg, $currentActiveRegs, true);
        if ($targetVeh) {
            $vehReg = strtoupper(trim((string)($targetVeh['reg_no'] ?? '')));
            $vehCarId = strtoupper(trim((string)($targetVeh['car_id'] ?? '')));
            if (($vehReg !== '' && in_array($vehReg, $currentActiveRegs, true)) ||
                ($vehCarId !== '' && in_array($vehCarId, $currentActiveRegs, true))) {
                $isCurrentlyActive = true;
            }
        }

        if ($isCurrentlyActive) {
            $removeTargets = [$targetReg];
            if ($targetVeh) {
                $vehReg = strtoupper(trim((string)($targetVeh['reg_no'] ?? '')));
                $vehCarId = strtoupper(trim((string)($targetVeh['car_id'] ?? '')));
                if ($vehReg !== '') $removeTargets[] = $vehReg;
                if ($vehCarId !== '') $removeTargets[] = $vehCarId;
            }
            $currentActiveRegs = array_values(array_diff($currentActiveRegs, $removeTargets));
        } else {
            $currentActiveRegs[] = $targetReg;
        }
    } else {
        sendErrorResponse('Invalid action or target registration number / identifier.', 400);
    }

    // Save to settings table
    $jsonValue = json_encode(array_values(array_unique($currentActiveRegs)));
    Database::execute(
        "INSERT INTO settings (`key`, `value`, `updated_at`)
         VALUES ('manager_active_fleets', ?, NOW())
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW()",
        [$jsonValue]
    );

    // Update is_custom_fleet flag in vehicles table for consistency
    if (count($currentActiveRegs) > 0) {
        $inPlaceholders = implode(',', array_fill(0, count($currentActiveRegs), '?'));
        Database::execute("UPDATE vehicles SET is_custom_fleet = 0 WHERE status != 'removed'");
        Database::execute(
            "UPDATE vehicles SET is_custom_fleet = 1 
             WHERE UPPER(reg_no) IN ($inPlaceholders) 
                OR UPPER(car_id) IN ($inPlaceholders)
                OR id IN ($inPlaceholders)",
            array_merge($currentActiveRegs, $currentActiveRegs, $currentActiveRegs)
        );
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'Active fleet roster updated successfully.',
        'activeCount' => count($currentActiveRegs),
        'activeRegs' => array_values(array_unique($currentActiveRegs))
    ]);
}

sendErrorResponse('Method not allowed.', 405);
