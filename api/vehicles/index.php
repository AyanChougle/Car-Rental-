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

    $vehicles = array_map(function($v) {
        $gallery = [];
        if (!empty($v['gallery'])) {
            $gallery = is_string($v['gallery']) ? json_decode($v['gallery'], true) : $v['gallery'];
        }
        return [
            'id' => $v['id'],
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
            'location' => $v['location'],
            'available' => (int)$v['available'],
            'status' => $v['status'],
            'imageUrl' => $gallery[0] ?? 'assets/fleet/BMW.png',
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

    $regNo = strtoupper(trim((string)($input['regNo'] ?? '')));
    $brand = trim((string)($input['brand'] ?? ''));
    $model = trim((string)($input['model'] ?? ''));
    $year = (int)($input['year'] ?? 2024);
    $category = trim((string)($input['category'] ?? 'economy'));
    $transmission = trim((string)($input['transmission'] ?? 'Automatic'));
    $fuel = trim((string)($input['fuel'] ?? 'Petrol'));
    $seats = (int)($input['seats'] ?? 5);
    $priceDay = (float)($input['priceDay'] ?? 2000.00);
    $priceHour = (float)($input['priceHour'] ?? round($priceDay / 24));
    $driverPrice = (float)($input['driverPrice'] ?? 0.00);
    $securityDeposit = (float)($input['securityDeposit'] ?? 0.00);
    $gallery = isset($input['gallery']) ? json_encode($input['gallery']) : '["assets/fleet/BMW.png"]';

    if (!$regNo || !$brand || !$model) {
        sendErrorResponse('Registration number, brand, and model are required.', 400);
    }

    Database::execute(
        "INSERT INTO vehicles (reg_no, brand, model, year, category, transmission, fuel, seats, price_day, price_hour, driver_price, security_deposit, available, status, is_custom_fleet, gallery, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'available', 1, ?, ?)
         ON DUPLICATE KEY UPDATE
            brand = VALUES(brand),
            model = VALUES(model),
            price_day = VALUES(price_day),
            price_hour = VALUES(price_hour),
            category = VALUES(category),
            transmission = VALUES(transmission),
            fuel = VALUES(fuel),
            seats = VALUES(seats),
            available = 1,
            status = 'available',
            gallery = VALUES(gallery)",
        [
            $regNo, $brand, $model, $year, $category, $transmission, $fuel, $seats,
            $priceDay, $priceHour, $driverPrice, $securityDeposit, $gallery, $user['firebase_uid']
        ]
    );

    sendJsonResponse(['success' => true, 'message' => "Vehicle $regNo saved to fleet."]);
}

sendErrorResponse('Method not allowed.', 405);
