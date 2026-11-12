<?php
/**
 * KRUIZLY - Active Fleet Roster API
 * Manages the custom manager-selected active fleet roster for display & booking.
 * GET  /api/vehicles/active-fleet.php -> returns active fleet roster + all vehicles
 * POST /api/vehicles/active-fleet.php -> update active fleet roster (add/remove/toggle/reset/set)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function normalizeActiveReg(string $reg): string {
    return KpiService::normalizeRegKey($reg);
}

if ($method === 'GET') {
    $hubId = isset($_GET['hub_id']) && $_GET['hub_id'] !== '' ? (int)$_GET['hub_id'] : 0;
    // 1. Fetch current active fleet list from settings
    $setting = null;
    try {
        $setting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'manager_active_fleets' ORDER BY updated_at DESC LIMIT 1");
    } catch (Throwable $_) {
        $setting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'manager_active_fleets' LIMIT 1");
    }
    $activeRegs = [];

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
    $allDbVehicles = $hubId > 0
        ? Database::fetchAll("SELECT v.*, h.name AS hub_name, h.code AS hub_code FROM vehicles v LEFT JOIN hubs h ON h.id = v.hub_id WHERE v.status != 'removed' AND v.hub_id = ? ORDER BY v.brand ASC, v.model ASC", [$hubId])
        : Database::fetchAll("SELECT v.*, h.name AS hub_name, h.code AS hub_code FROM vehicles v LEFT JOIN hubs h ON h.id = v.hub_id WHERE v.status != 'removed' ORDER BY v.brand ASC, v.model ASC");

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

        $isSynthetic = (bool)preg_match('/^MH04KR01\d{2}$/i', $rawReg);
        $effectiveReg = ($rawReg !== '' && $rawReg !== 'TBD' && !$isSynthetic) ? $rawReg : '';
        $displayReg = $effectiveReg !== '' ? $effectiveReg : ($cleanCarId !== '' ? $cleanCarId : 'CAT-' . $id);

        $item = [
            'id' => $v['id'],
            'carId' => $v['car_id'] ?? null,
            'regNo' => $effectiveReg,
            'brand' => $v['brand'],
            'model' => $v['model'],
            'year' => (int)$v['year'],
            'category' => $v['category'],
            'transmission' => $v['transmission'],
            'fuel' => $v['fuel'],
            'seats' => (int)$v['seats'],
            'priceDay' => (float)$v['price_day'],
            'priceHour' => (float)$v['price_hour'],
            'hub' => $v['hub'] ?? ($v['location'] ?? null),
            'hubId' => (int)($v['hub_id'] ?? 0),
            'hub_id' => (int)($v['hub_id'] ?? 0),
            'hubName' => $v['hub_name'] ?? null,
            'hubCode' => $v['hub_code'] ?? null,
            'acquisitionType' => $v['acquisition_type'] ?? 'Partner',
            'ownerName' => $v['owner_name'] ?? null,
            'acquisitionDate' => $v['acquisition_date'] ?? null,
            'available' => (int)$v['available'],
            'status' => $v['status'],
            'imageUrl' => $img,
            'isActiveFleet' => !empty($v['is_active_fleet'])
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

    // If no explicit manager_active_fleets setting exists, honor DB vehicles marked is_active_fleet = 1 (never dump catalog-only cars into operational roster).
    if ((!$setting || empty($setting['value'])) && empty($activeRegs)) {
        foreach ($allDbVehicles as $v) {
            if (empty($v['is_active_fleet'])) {
                continue;
            }
            $reg = strtoupper(trim((string)($v['reg_no'] ?? '')));
            $carId = strtoupper(trim((string)($v['car_id'] ?? '')));
            $activeRegs[] = ($reg !== '' && $reg !== 'TBD') ? normalizeActiveReg($reg) : ($carId !== '' ? $carId : 'CAT-' . (int)$v['id']);
        }
        $activeRegs = array_values(array_unique(array_filter($activeRegs)));
    }

    // Build operational fleet roster strictly from database matches
    $activeFleetList = [];
    $seenKeys = [];

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
                $matchedVeh['isActiveFleet'] = true;
                $activeFleetList[] = $matchedVeh;
                $seenKeys[$mKey] = true;
            }
        }
    }

    foreach ($vehiclesById as $vid => $vItem) {
        $mKey = $vItem['id'] ?? $vItem['carId'] ?? $vItem['regNo'];
        $vehiclesById[$vid]['isActiveFleet'] = !empty($seenKeys[$mKey]);
    }

    sendJsonResponse([
        'success' => true,
        'activeCount' => count($activeFleetList),
        'activeRegs' => $activeRegs,
        'activeFleet' => $activeFleetList,
        'fleets' => $activeFleetList,
        'debugSetting' => $setting['value'] ?? null,
        'allVehicles' => array_values($vehiclesById)
    ]);
}

if ($method === 'POST') {
    // Only Admin, Super Admin or Manager can modify active fleet roster
    $user = Auth::requireRole('admin', 'super_admin', 'manager');

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

    // Fetch existing settings; if missing, seed from current DB rows marked is_active_fleet = 1 (never from hardcoded arrays)
    $setting = null;
    try {
        $setting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'manager_active_fleets' ORDER BY updated_at DESC LIMIT 1");
    } catch (Throwable $_) {
        $setting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'manager_active_fleets' LIMIT 1");
    }
    $currentActiveRegs = [];

    if ($setting && !empty($setting['value'])) {
        $decoded = json_decode($setting['value'], true);
        if (is_array($decoded)) {
            $currentActiveRegs = array_values(array_unique(array_filter(array_map('normalizeActiveReg', $decoded))));
        }
    } else {
        $flaggedRows = Database::fetchAll("SELECT id, car_id, reg_no FROM vehicles WHERE is_active_fleet = 1 AND status != 'removed'");
        foreach ($flaggedRows as $fv) {
            $r = strtoupper(trim((string)($fv['reg_no'] ?? '')));
            $c = strtoupper(trim((string)($fv['car_id'] ?? '')));
            $currentActiveRegs[] = ($r !== '' && $r !== 'TBD') ? normalizeActiveReg($r) : ($c !== '' ? $c : ('CAT-' . (int)$fv['id']));
        }
        $currentActiveRegs = array_values(array_unique(array_filter($currentActiveRegs)));
    }

    if ($action === 'reset') {
        $currentActiveRegs = [];
        $flaggedRows = Database::fetchAll("SELECT id, car_id, reg_no FROM vehicles WHERE is_active_fleet = 1 AND status != 'removed'");
        foreach ($flaggedRows as $fv) {
            $r = strtoupper(trim((string)($fv['reg_no'] ?? '')));
            $c = strtoupper(trim((string)($fv['car_id'] ?? '')));
            $currentActiveRegs[] = ($r !== '' && $r !== 'TBD') ? normalizeActiveReg($r) : ($c !== '' ? $c : ('CAT-' . (int)$fv['id']));
        }
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

    // Save to settings table cleanly: delete old entries first to ensure 100% single canonical record
    $jsonValue = json_encode($currentActiveRegs);
    $saveAffected = 0;
    $saveError = null;
    try {
        Database::execute("DELETE FROM settings WHERE `key` = 'manager_active_fleets'");
        $saveAffected = Database::execute(
            "INSERT INTO settings (`key`, `value`, `updated_at`)
             VALUES ('manager_active_fleets', ?, NOW())",
            [$jsonValue]
        );
    } catch (Throwable $e) {
        $saveError = $e->getMessage();
        try {
            Database::execute("DELETE FROM settings WHERE `key` = 'manager_active_fleets'");
            $saveAffected = Database::execute(
                "INSERT INTO settings (`key`, `value`)
                 VALUES ('manager_active_fleets', ?)",
                [$jsonValue]
            );
        } catch (Throwable $e2) {
            $saveError .= ' | ' . $e2->getMessage();
        }
    }

    // Update is_active_fleet flag in vehicles table for consistency (safe against schema differences)
    try {
        Database::execute("UPDATE vehicles SET is_active_fleet = 0 WHERE status != 'removed'");
        if (count($currentActiveRegs) > 0) {
            $inPlaceholders = implode(',', array_fill(0, count($currentActiveRegs), '?'));
            Database::execute(
                "UPDATE vehicles SET is_active_fleet = 1 
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
                Database::execute("UPDATE vehicles SET is_active_fleet = 1 WHERE id IN ($numPlaceholders)", $numericIds);
            }
        }
    } catch (Throwable $_) {
        // Safe fallback if column is not yet present on live DB
    }

    try {
        Database::execute("UPDATE vehicles SET is_custom_fleet = 0 WHERE status != 'removed'");
        if (count($currentActiveRegs) > 0) {
            $inPlaceholders = implode(',', array_fill(0, count($currentActiveRegs), '?'));
            Database::execute(
                "UPDATE vehicles SET is_custom_fleet = 1 
                 WHERE UPPER(reg_no) IN ($inPlaceholders) 
                    OR UPPER(car_id) IN ($inPlaceholders)",
                array_merge($currentActiveRegs, $currentActiveRegs)
            );
        }
    } catch (Throwable $_) {}

    try {
        KpiService::syncMetrics(true, false);
    } catch (Throwable $_) {}

    sendJsonResponse([
        'success' => true,
        'message' => 'Active fleet roster updated successfully.',
        'activeCount' => count($currentActiveRegs),
        'activeRegs' => $currentActiveRegs,
        'saveAffected' => $saveAffected,
        'saveError' => $saveError
    ]);
}

sendErrorResponse('Method not allowed.', 405);
