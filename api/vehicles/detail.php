<?php
/**
 * api/vehicles/detail.php
 * GET / PUT / DELETE /api/vehicles/:regNo
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$identifier = strtoupper(trim((string)($_GET['regNo'] ?? $_GET['id'] ?? '')));

if (!$identifier) {
    sendErrorResponse('Vehicle registration number or ID is required.', 400);
}

$idNum = is_numeric($identifier) ? (int)$identifier : 0;
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $v = Database::fetchOne(
        "SELECT * FROM vehicles WHERE reg_no = ? OR car_id = ? OR id = ? LIMIT 1", 
        [$identifier, $identifier, $idNum]
    );
    if (!$v) {
        sendErrorResponse("Vehicle '$identifier' not found.", 404);
    }

    $gallery = [];
    if (!empty($v['gallery'])) {
        $gallery = is_string($v['gallery']) ? json_decode($v['gallery'], true) : $v['gallery'];
    }

    sendJsonResponse([
        'success' => true,
        'vehicle' => [
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
            'driverPrice' => (float)$v['driver_price'],
            'securityDeposit' => (float)$v['security_deposit'],
            'location' => $v['location'],
            'hubId' => (int)($v['hub_id'] ?? 0),
            'hub' => $v['hub'] ?? null,
            'ownerName' => $v['owner_name'] ?? null,
            'acquisitionType' => $v['acquisition_type'] ?? 'Partner',
            'acquisitionDate' => $v['acquisition_date'] ?? null,
            'available' => (int)$v['available'],
            'status' => $v['status'],
            'isActiveFleet' => (int)($v['is_active_fleet'] ?? 1),
            'imageUrl' => $gallery[0] ?? ('assets/fleet/' . $v['brand'] . ' ' . $v['model'] . '.png'),
            'gallery' => $gallery
        ]
    ]);
}

if ($method === 'PUT' || $method === 'POST') {
    Auth::requireRole('admin', 'manager');
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    $updates = [];
    $params = [];

    if (isset($input['regNo']) || isset($input['newRegNo'])) {
        $updates[] = "reg_no = ?";
        $params[] = strtoupper(trim((string)($input['regNo'] ?? $input['newRegNo'])));
    }
    if (isset($input['carId']) || isset($input['car_id'])) {
        $updates[] = "car_id = ?";
        $params[] = strtoupper(trim((string)($input['carId'] ?? $input['car_id'])));
    }
    if (isset($input['available'])) {
        $updates[] = "available = ?";
        $params[] = (int)$input['available'];
    }
    if (isset($input['status'])) {
        $updates[] = "status = ?";
        $params[] = (string)$input['status'];
    }
    if (isset($input['priceDay']) || isset($input['price_day'])) {
        $pDay = (float)($input['priceDay'] ?? $input['price_day']);
        $updates[] = "price_day = ?";
        $params[] = $pDay;
        $updates[] = "price_hour = ?";
        $params[] = round($pDay / 24);
    }
    if (isset($input['priceHour']) || isset($input['price_hour'])) {
        $updates[] = "price_hour = ?";
        $params[] = (float)($input['priceHour'] ?? $input['price_hour']);
    }
    if (isset($input['brand'])) {
        $updates[] = "brand = ?";
        $params[] = trim((string)$input['brand']);
    }
    if (isset($input['model'])) {
        $updates[] = "model = ?";
        $params[] = trim((string)$input['model']);
    }
    if (isset($input['year'])) {
        $updates[] = "year = ?";
        $params[] = (int)$input['year'];
    }
    if (isset($input['category'])) {
        $updates[] = "category = ?";
        $params[] = trim((string)$input['category']);
    }
    if (isset($input['transmission'])) {
        $updates[] = "transmission = ?";
        $params[] = trim((string)$input['transmission']);
    }
    if (isset($input['fuel'])) {
        $updates[] = "fuel = ?";
        $params[] = trim((string)$input['fuel']);
    }
    if (isset($input['seats'])) {
        $updates[] = "seats = ?";
        $params[] = (int)$input['seats'];
    }
    if (isset($input['driverPrice'])) {
        $updates[] = "driver_price = ?";
        $params[] = (float)$input['driverPrice'];
    }
    if (isset($input['securityDeposit'])) {
        $updates[] = "security_deposit = ?";
        $params[] = (float)$input['securityDeposit'];
    }
    if (isset($input['hubId']) || isset($input['hub_id'])) {
        $hId = (int)($input['hubId'] ?? $input['hub_id']);
        $updates[] = "hub_id = ?";
        $params[] = $hId > 0 ? $hId : null;
    }
    if (isset($input['hub'])) {
        $updates[] = "hub = ?";
        $params[] = trim((string)$input['hub']);
    }
    if (isset($input['location'])) {
        $updates[] = "location = ?";
        $params[] = trim((string)$input['location']);
    }
    if (isset($input['ownerName']) || isset($input['owner_name'])) {
        $updates[] = "owner_name = ?";
        $params[] = trim((string)($input['ownerName'] ?? $input['owner_name']));
    }
    if (isset($input['acquisitionType']) || isset($input['acquisition_type'])) {
        $updates[] = "acquisition_type = ?";
        $params[] = trim((string)($input['acquisitionType'] ?? $input['acquisition_type']));
    }
    if (isset($input['acquisitionDate']) || isset($input['acquisition_date'])) {
        $updates[] = "acquisition_date = ?";
        $params[] = !empty($input['acquisitionDate']) ? trim((string)$input['acquisitionDate']) : null;
    }
    if (isset($input['isActiveFleet']) || isset($input['is_active_fleet'])) {
        $updates[] = "is_active_fleet = ?";
        $params[] = (int)(bool)($input['isActiveFleet'] ?? $input['is_active_fleet']);
    }
    if (isset($input['gallery'])) {
        $updates[] = "gallery = ?";
        $params[] = is_array($input['gallery']) ? json_encode($input['gallery']) : $input['gallery'];
    }

    if ($updates) {
        $params[] = $identifier;
        $params[] = $identifier;
        $params[] = $idNum;
        Database::execute(
            "UPDATE vehicles SET " . implode(', ', $updates) . ", updated_at = CURRENT_TIMESTAMP WHERE reg_no = ? OR car_id = ? OR id = ?",
            $params
        );
    }

    sendJsonResponse(['success' => true, 'message' => "Vehicle '$identifier' updated successfully in database."]);
}

if ($method === 'DELETE') {
    Auth::requireRole('admin', 'manager');
    Database::execute(
        "UPDATE vehicles SET available = 0, status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE reg_no = ? OR car_id = ? OR id = ?",
        [$identifier, $identifier, $idNum]
    );
    sendJsonResponse(['success' => true, 'message' => "Vehicle '$identifier' removed from active fleet."]);
}

sendErrorResponse('Method not allowed.', 405);
