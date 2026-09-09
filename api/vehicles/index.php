<?php
/**
 * api/vehicles/index.php
 * GET /api/vehicles - List all fleet vehicles (public)
 * POST /api/vehicles - Create a vehicle (staff only)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $category = trim((string)($_GET['category'] ?? ''));
    $availableOnly = isset($_GET['available']) ? (bool)$_GET['available'] : false;

    $sql = "SELECT * FROM vehicles WHERE status != 'removed'";
    $params = [];

    if ($category) {
        $sql .= " AND category = ?";
        $params[] = $category;
    }
    if ($availableOnly) {
        $sql .= " AND available = 1";
    }

    $sql .= " ORDER BY price_day ASC";

    $rows = Database::fetchAll($sql, $params);

    // Bulletproof deduplication by reg_no or car_id
    $deduped = [];
    $seen = [];
    foreach ($rows as $v) {
        $reg = strtoupper(trim((string)($v['reg_no'] ?? '')));
        $carId = strtoupper(trim((string)($v['car_id'] ?? '')));
        $key = ($reg !== '' && $reg !== 'TBD') ? $reg : ($carId ?: (string)$v['id']);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $deduped[] = $v;
    }
    $rows = $deduped;

    $vehicles = array_map(function($v) {
        $gallery = [];
        if (!empty($v['gallery'])) {
            $gallery = is_string($v['gallery']) ? json_decode($v['gallery'], true) : $v['gallery'];
        }
        return [
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
            'bags' => (int)$v['bags'],
            'priceDay' => (float)$v['price_day'],
            'priceHour' => (float)$v['price_hour'],
            'driverPrice' => (float)$v['driver_price'],
            'securityDeposit' => (float)$v['security_deposit'],
            'freeKm' => (int)$v['free_km'],
            'extraKm' => (float)$v['extra_km'],
            'hub' => $v['hub'] ?? ($v['location'] ?? 'Gavson Business Park, Ghansoli'),
            'location' => $v['location'],
            'acquisitionType' => $v['acquisition_type'] ?? 'Partner',
            'ownerName' => $v['owner_name'] ?? null,
            'acquisitionDate' => $v['acquisition_date'] ?? null,
            'available' => (int)$v['available'],
            'status' => $v['status'],
            'isActiveFleet' => (int)($v['is_active_fleet'] ?? 1),
            'imageUrl' => $gallery[0] ?? 'assets/fleet/' . $v['brand'] . ' ' . $v['model'] . '.png',
            'gallery' => $gallery,
            'createdAt' => $v['created_at'],
            'updatedAt' => $v['updated_at']
        ];
    }, $rows);

    sendJsonResponse(['success' => true, 'count' => count($vehicles), 'vehicles' => $vehicles]);
}

if ($method === 'POST') {
    $user = Auth::requireRole('admin', 'manager');
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    $carId = strtoupper(trim((string)($input['carId'] ?? $input['car_id'] ?? '')));
    $regNo = strtoupper(trim((string)($input['regNo'] ?? $input['reg_no'] ?? '')));
    $brand = trim((string)($input['brand'] ?? ''));
    $model = trim((string)($input['model'] ?? ''));
    $year = (int)($input['year'] ?? 2026);
    $category = trim((string)($input['category'] ?? 'economy'));
    $transmission = trim((string)($input['transmission'] ?? 'Manual'));
    $fuel = trim((string)($input['fuel'] ?? 'Petrol'));
    $seats = (int)($input['seats'] ?? 5);
    $priceDay = (float)($input['priceDay'] ?? $input['price_day'] ?? 3000.00);
    $priceHour = (float)($input['priceHour'] ?? $input['price_hour'] ?? round($priceDay / 24));
    $driverPrice = (float)($input['driverPrice'] ?? 0.00);
    $securityDeposit = (float)($input['securityDeposit'] ?? 3000.00);
    $hub = trim((string)($input['hub'] ?? 'Gavson Business Park, Ghansoli'));
    $acquisitionType = trim((string)($input['acquisitionType'] ?? $input['acquisition_type'] ?? 'Partner'));
    $ownerName = trim((string)($input['ownerName'] ?? $input['owner_name'] ?? ''));
    $acquisitionDate = !empty($input['acquisitionDate']) ? trim((string)$input['acquisitionDate']) : null;
    $isActiveFleet = isset($input['isActiveFleet']) ? ((bool)$input['isActiveFleet'] ? 1 : 0) : 1;
    $gallery = isset($input['gallery']) ? (is_array($input['gallery']) ? json_encode($input['gallery']) : $input['gallery']) : json_encode(["assets/fleet/$brand $model.png"]);

    if (!$regNo || !$brand || !$model) {
        sendErrorResponse('Registration number (RC), brand, and model are required.', 400);
    }

    Database::execute(
        "INSERT INTO vehicles (car_id, reg_no, brand, model, year, category, transmission, fuel, seats, price_day, price_hour, driver_price, security_deposit, hub, location, acquisition_type, owner_name, acquisition_date, available, status, is_active_fleet, is_custom_fleet, gallery, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'available', ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
            car_id = COALESCE(VALUES(car_id), car_id),
            brand = VALUES(brand),
            model = VALUES(model),
            year = VALUES(year),
            price_day = VALUES(price_day),
            price_hour = VALUES(price_hour),
            category = VALUES(category),
            transmission = VALUES(transmission),
            fuel = VALUES(fuel),
            seats = VALUES(seats),
            hub = VALUES(hub),
            location = VALUES(location),
            acquisition_type = VALUES(acquisition_type),
            owner_name = VALUES(owner_name),
            acquisition_date = VALUES(acquisition_date),
            is_active_fleet = VALUES(is_active_fleet),
            available = 1,
            status = 'available',
            gallery = VALUES(gallery)",
        [
            $carId ?: null, $regNo, $brand, $model, $year, $category, $transmission, $fuel, $seats,
            $priceDay, $priceHour, $driverPrice, $securityDeposit, $hub, $hub, $acquisitionType, $ownerName ?: null, $acquisitionDate,
            $isActiveFleet, $gallery, $user['firebase_uid']
        ]
    );

    sendJsonResponse(['success' => true, 'message' => "Vehicle $regNo saved to fleet.", 'regNo' => $regNo]);
}

sendErrorResponse('Method not allowed.', 405);
