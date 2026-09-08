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

// Default 7 Kruizly Fleet vehicles
$defaultActiveRegs = [
    'MH03EL1025',
    'MH05GJ4711',
    'MH48CJ4153',
    'MH04MU1178',
    'MH05FV3454',
    'MH43CY1632',
    'MH02FU6808'
];

if ($method === 'GET') {
    // 1. Fetch current active fleet list from settings
    $setting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'manager_active_fleets' LIMIT 1");
    $activeRegs = $defaultActiveRegs;

    if ($setting && !empty($setting['value'])) {
        $decoded = json_decode($setting['value'], true);
        if (is_array($decoded) && count($decoded) > 0) {
            $activeRegs = array_values(array_unique(array_map(function($r) {
                return strtoupper(trim((string)$r));
            }, $decoded)));
        }
    }

    // 2. Fetch all vehicles from database
    $allDbVehicles = Database::fetchAll("SELECT * FROM vehicles WHERE status != 'removed' ORDER BY brand ASC, model ASC");

    $vehiclesMap = [];
    foreach ($allDbVehicles as $v) {
        $cleanReg = strtoupper(trim((string)$v['reg_no']));
        $gallery = [];
        if (!empty($v['gallery'])) {
            $gallery = is_string($v['gallery']) ? json_decode($v['gallery'], true) : $v['gallery'];
        }
        $img = (is_array($gallery) && !empty($gallery[0])) ? $gallery[0] : 'assets/fleet/' . $v['brand'] . ' ' . $v['model'] . '.png';

        $vehiclesMap[$cleanReg] = [
            'id' => $v['id'],
            'carId' => $v['car_id'] ?? null,
            'regNo' => $v['reg_no'],
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
            'isActiveFleet' => in_array($cleanReg, $activeRegs, true)
        ];
    }

    // Default metadata for the 7 standard Kruizly fleets
    $standardFleetMeta = [
        'MH03EL1025' => ['carId' => 'CRP-002', 'brand' => 'Suzuki', 'model' => 'Fronx', 'year' => 2026, 'category' => 'compact-suv', 'transmission' => 'Automatic', 'fuel' => 'Petrol', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Aditi Lotankar', 'acquisitionDate' => '2026-07-20', 'priceDay' => 3500, 'image' => 'assets/fleet/Suzuki Fronx.png'],
        'MH05GJ4711' => ['carId' => 'CRP-003', 'brand' => 'Suzuki', 'model' => 'Ertiga', 'year' => 2026, 'category' => 'mpv', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 7, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Viren Gupta', 'acquisitionDate' => '2026-07-24', 'priceDay' => 4000, 'image' => 'assets/fleet/Suzuki Ertiga.png'],
        'MH48CJ4153' => ['carId' => 'CRP-005', 'brand' => 'Toyota', 'model' => 'Glanza', 'year' => 2026, 'category' => 'hatchback', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Ajay Vishwakarma', 'acquisitionDate' => '2026-07-29', 'priceDay' => 3000, 'image' => 'assets/fleet/Toyota Glanza.png'],
        'MH04MU1178' => ['carId' => 'CRP-006', 'brand' => 'Toyota', 'model' => 'Glanza', 'year' => 2026, 'category' => 'hatchback', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Kundan Singh', 'acquisitionDate' => '2026-08-04', 'priceDay' => 3000, 'image' => 'assets/fleet/Toyota Glanza.png'],
        'MH05FV3454' => ['carId' => 'CRP-007', 'brand' => 'Tata', 'model' => 'Punch', 'year' => 2026, 'category' => 'compact-suv', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Tai Phad', 'acquisitionDate' => '2026-08-13', 'priceDay' => 3000, 'image' => 'assets/fleet/Tata Punch.png'],
        'MH43CY1632' => ['carId' => 'CRP-008', 'brand' => 'Suzuki', 'model' => 'Fronx', 'year' => 2026, 'category' => 'compact-suv', 'transmission' => 'Manual', 'fuel' => 'Petrol + CNG', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Amol Gole', 'acquisitionDate' => '2026-08-19', 'priceDay' => 3200, 'image' => 'assets/fleet/Suzuki Fronx.png'],
        'MH02FU6808' => ['carId' => 'CRP-009', 'brand' => 'Mahindra', 'model' => 'XUV 700', 'year' => 2026, 'category' => 'suv', 'transmission' => 'Automatic', 'fuel' => 'Petrol', 'seats' => 5, 'hub' => 'Gavson Business Park, Ghansoli', 'acquisitionType' => 'Partner', 'ownerName' => 'Saif Feroz Shaikh', 'acquisitionDate' => '2026-08-01', 'priceDay' => 5500, 'image' => 'assets/fleet/Mahindra XUV 700.png'],
    ];

    // Build active fleet roster
    $activeFleetList = [];
    foreach ($activeRegs as $reg) {
        if (isset($vehiclesMap[$reg])) {
            $activeFleetList[] = $vehiclesMap[$reg];
        } elseif (isset($standardFleetMeta[$reg])) {
            $m = $standardFleetMeta[$reg];
            $activeFleetList[] = [
                'id' => null,
                'regNo' => $reg,
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
        } else {
            $activeFleetList[] = [
                'id' => null,
                'regNo' => $reg,
                'brand' => 'Kruizly',
                'model' => 'Fleet Vehicle',
                'year' => 2025,
                'category' => 'Fleet',
                'transmission' => 'Manual',
                'fuel' => 'Diesel',
                'seats' => 5,
                'priceDay' => 4500,
                'priceHour' => 188,
                'available' => 1,
                'status' => 'available',
                'imageUrl' => 'assets/fleet/Kia Carens.png',
                'isActiveFleet' => true
            ];
        }
    }

    sendJsonResponse([
        'success' => true,
        'activeCount' => count($activeFleetList),
        'activeRegs' => $activeRegs,
        'activeFleet' => $activeFleetList,
        'allVehicles' => array_values($vehiclesMap)
    ]);
}

if ($method === 'POST') {
    // Only Admin or Manager can modify active fleet roster
    $user = Auth::requireRole('admin', 'manager');

    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
    $action = trim((string)($input['action'] ?? 'toggle'));
    $targetReg = strtoupper(trim((string)($input['regNo'] ?? '')));

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
    } elseif ($action === 'add' && $targetReg) {
        if (!in_array($targetReg, $currentActiveRegs, true)) {
            $currentActiveRegs[] = $targetReg;
        }
    } elseif ($action === 'remove' && $targetReg) {
        $currentActiveRegs = array_values(array_diff($currentActiveRegs, [$targetReg]));
    } elseif ($action === 'toggle' && $targetReg) {
        if (in_array($targetReg, $currentActiveRegs, true)) {
            $currentActiveRegs = array_values(array_diff($currentActiveRegs, [$targetReg]));
        } else {
            $currentActiveRegs[] = $targetReg;
        }
    } else {
        sendErrorResponse('Invalid action or target registration number.', 400);
    }

    // Save to settings table
    $jsonValue = json_encode($currentActiveRegs);
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
        Database::execute("UPDATE vehicles SET is_custom_fleet = 1 WHERE UPPER(reg_no) IN ($inPlaceholders)", $currentActiveRegs);
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'Active fleet roster updated successfully.',
        'activeCount' => count($currentActiveRegs),
        'activeRegs' => $currentActiveRegs
    ]);
}
