<?php
/**
 * KRUIZLY - Active Fleet Roster API
 * Manages the custom manager-selected active fleet roster for display & booking.
 * GET  /api/vehicles/active-fleet.php -> returns active fleet roster + all vehicles
 * POST /api/vehicles/active-fleet.php -> update active fleet roster (add/remove/toggle/reset/set)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Canonical 7 Kruizly Fleet vehicles
$defaultActiveRegs = [
    'MH03EL1025',
    'MH05GJ4711',
    'MH48GJ4153',
    'MH04MU1178',
    'MH05FV3454',
    'MH43CU1632',
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

function normalizeActiveReg(string $reg): string {
    $r = strtoupper(trim($reg));
    $map = [
        'MH03EF1025' => 'MH03EL1025',
        'MH48CJ4153' => 'MH48GJ4153',
        'MH43CY1632' => 'MH43CU1632'
    ];
    return $map[$r] ?? $r;
}

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
            $normalized = array_values(array_unique(array_map('normalizeActiveReg', $cleaned)));
            if (count($normalized) > 0) {
                $activeRegs = $normalized;
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
        $vehiclesMap['CAT-' . $id] = $item;
        $vehiclesMap['CAT-' . str_pad((string)$id, 3, '0', STR_PAD_LEFT)] = $item;
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
        
        $catNum = -1;
        if (is_numeric($regUpper)) {
            $catNum = (int)$regUpper;
        } elseif (preg_match('/^CAT-?(\d+)$/i', $regUpper, $m)) {
            $catNum = (int)$m[1];
        }

        $matchedVeh = $vehiclesMap[$regUpper] ?? $vehiclesMap[$simp] ?? $vehiclesByCarId[$regUpper] ?? ($catNum > 0 ? ($vehiclesById[$catNum] ?? null) : null);

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
    $targetReg = normalizeActiveReg($targetReg);

    // Resolve vehicle from DB if needed
    $targetVeh = null;
    if ($targetReg !== '') {
        $numId = -1;
        if (is_numeric($targetReg)) {
            $numId = (int)$targetReg;
        } elseif (preg_match('/^CAT-?(\d+)$/i', $targetReg, $m)) {
            $numId = (int)$m[1];
        }

        $targetVeh = Database::fetchOne(
            "SELECT * FROM vehicles WHERE UPPER(reg_no) = ? OR UPPER(car_id) = ? OR id = ? LIMIT 1",
            [$targetReg, $targetReg, $numId]
        );
    }

    // Determine canonical identifier for this target
    $identifier = $targetReg;
    if ($targetVeh) {
        $vehReg = strtoupper(trim((string)($targetVeh['reg_no'] ?? '')));
        $vehCarId = strtoupper(trim((string)($targetVeh['car_id'] ?? '')));
        if ($vehReg !== '' && $vehReg !== 'TBD') {
            $identifier = normalizeActiveReg($vehReg);
        } elseif ($vehCarId !== '') {
            $identifier = $vehCarId;
        } else {
            $identifier = 'CAT-' . $targetVeh['id'];
        }
    }

    // Build list of all possible aliases for removal/matching
    $targetAliases = array_values(array_unique(array_filter([$targetReg, $identifier])));
    if ($targetVeh) {
        if (!empty($targetVeh['reg_no'])) {
            $rawPl = strtoupper(trim((string)$targetVeh['reg_no']));
            $targetAliases[] = $rawPl;
            $targetAliases[] = normalizeActiveReg($rawPl);
        }
        if (!empty($targetVeh['car_id'])) {
            $targetAliases[] = strtoupper(trim((string)$targetVeh['car_id']));
        }
        $targetAliases[] = (string)$targetVeh['id'];
        $targetAliases[] = 'CAT-' . $targetVeh['id'];
    }
    $targetAliases = array_values(array_unique(array_filter($targetAliases)));

    // Fetch existing settings
    $setting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'manager_active_fleets' LIMIT 1");
    $currentActiveRegs = $defaultActiveRegs;

    if ($setting && !empty($setting['value'])) {
        $decoded = json_decode($setting['value'], true);
        if (is_array($decoded) && count($decoded) > 0) {
            $currentActiveRegs = array_values(array_unique(array_map('normalizeActiveReg', $decoded)));
        }
    }

    if ($action === 'reset') {
        $currentActiveRegs = $defaultActiveRegs;
    } elseif ($action === 'set' && isset($input['activeRegs']) && is_array($input['activeRegs'])) {
        $currentActiveRegs = array_values(array_unique(array_filter(array_map(function($r) {
            return normalizeActiveReg(strtoupper(trim((string)$r)));
        }, $input['activeRegs']))));
    } elseif ($action === 'add' && $identifier !== '') {
        if (!in_array($identifier, $currentActiveRegs, true)) {
            $currentActiveRegs[] = $identifier;
        }
    } elseif ($action === 'remove' && !empty($targetAliases)) {
        $currentActiveRegs = array_values(array_filter($currentActiveRegs, function($r) use ($targetAliases) {
            return !in_array($r, $targetAliases, true);
        }));
    } elseif ($action === 'toggle' && $identifier !== '') {
        $isCurrentlyActive = false;
        foreach ($targetAliases as $alias) {
            if (in_array($alias, $currentActiveRegs, true)) {
                $isCurrentlyActive = true;
                break;
            }
        }

        if ($isCurrentlyActive) {
            $currentActiveRegs = array_values(array_filter($currentActiveRegs, function($r) use ($targetAliases) {
                return !in_array($r, $targetAliases, true);
            }));
        } else {
            $currentActiveRegs[] = $identifier;
        }
    } else {
        sendErrorResponse('Invalid action or target registration number / identifier.', 400);
    }

    // Normalize active fleet roster
    $currentActiveRegs = array_values(array_unique(array_map('normalizeActiveReg', $currentActiveRegs)));

    // Save to settings table
    $jsonValue = json_encode($currentActiveRegs);
    try {
        Database::execute(
            "INSERT INTO settings (`key`, `value`, `updated_at`)
             VALUES ('manager_active_fleets', ?, NOW())
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW()",
            [$jsonValue]
        );
    } catch (Throwable $e) {
        // Fallback for schemas without updated_at column
        Database::execute(
            "INSERT INTO settings (`key`, `value`)
             VALUES ('manager_active_fleets', ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
            [$jsonValue]
        );
    }

    // Update is_custom_fleet flag in vehicles table for consistency
    Database::execute("UPDATE vehicles SET is_custom_fleet = 0 WHERE status != 'removed'");
    if (count($currentActiveRegs) > 0) {
        $inPlaceholders = implode(',', array_fill(0, count($currentActiveRegs), '?'));
        Database::execute(
            "UPDATE vehicles SET is_custom_fleet = 1 
             WHERE UPPER(reg_no) IN ($inPlaceholders) 
                OR UPPER(car_id) IN ($inPlaceholders)",
            array_merge($currentActiveRegs, $currentActiveRegs)
        );

        $numericIds = [];
        foreach ($currentActiveRegs as $r) {
            if (is_numeric($r)) {
                $numericIds[] = (int)$r;
            } elseif (preg_match('/^CAT-?(\d+)$/i', $r, $m)) {
                $numericIds[] = (int)$m[1];
            }
        }
        $numericIds = array_values(array_unique($numericIds));
        if (count($numericIds) > 0) {
            $numPlaceholders = implode(',', array_fill(0, count($numericIds), '?'));
            Database::execute("UPDATE vehicles SET is_custom_fleet = 1 WHERE id IN ($numPlaceholders)", $numericIds);
        }
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'Active fleet roster updated successfully.',
        'activeCount' => count($currentActiveRegs),
        'activeRegs' => $currentActiveRegs
    ]);
}

sendErrorResponse('Method not allowed.', 405);
