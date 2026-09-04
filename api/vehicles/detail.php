<?php
/**
 * api/vehicles/detail.php
 * GET / PUT / DELETE /api/vehicles/:regNo
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$regNo = strtoupper(trim((string)($_GET['regNo'] ?? $_GET['id'] ?? '')));

if (!$regNo) {
    sendErrorResponse('Vehicle registration number is required.', 400);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $v = Database::fetchOne("SELECT * FROM vehicles WHERE reg_no = ? LIMIT 1", [$regNo]);
    if (!$v) {
        sendErrorResponse("Vehicle '$regNo' not found.", 404);
    }

    $gallery = [];
    if (!empty($v['gallery'])) {
        $gallery = is_string($v['gallery']) ? json_decode($v['gallery'], true) : $v['gallery'];
    }

    sendJsonResponse([
        'success' => true,
        'vehicle' => [
            'id' => $v['id'],
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
            'available' => (int)$v['available'],
            'status' => $v['status'],
            'imageUrl' => $gallery[0] ?? 'assets/fleet/BMW.png',
            'gallery' => $gallery
        ]
    ]);
}

if ($method === 'PUT' || $method === 'POST') {
    Auth::requireRole('admin', 'manager');
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    $updates = [];
    $params = [];

    if (isset($input['available'])) {
        $updates[] = "available = ?";
        $params[] = (int)$input['available'];
    }
    if (isset($input['status'])) {
        $updates[] = "status = ?";
        $params[] = (string)$input['status'];
    }
    if (isset($input['priceDay'])) {
        $updates[] = "price_day = ?";
        $params[] = (float)$input['priceDay'];
        $updates[] = "price_hour = ?";
        $params[] = round((float)$input['priceDay'] / 24);
    }
    if (isset($input['brand'])) {
        $updates[] = "brand = ?";
        $params[] = (string)$input['brand'];
    }
    if (isset($input['model'])) {
        $updates[] = "model = ?";
        $params[] = (string)$input['model'];
    }
    if (isset($input['gallery'])) {
        $updates[] = "gallery = ?";
        $params[] = is_array($input['gallery']) ? json_encode($input['gallery']) : $input['gallery'];
    }

    if ($updates) {
        $params[] = $regNo;
        Database::execute(
            "UPDATE vehicles SET " . implode(', ', $updates) . ", updated_at = CURRENT_TIMESTAMP WHERE reg_no = ?",
            $params
        );
    }

    sendJsonResponse(['success' => true, 'message' => "Vehicle $regNo updated."]);
}

if ($method === 'DELETE') {
    Auth::requireRole('admin', 'manager');
    Database::execute(
        "UPDATE vehicles SET available = 0, status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE reg_no = ?",
        [$regNo]
    );
    sendJsonResponse(['success' => true, 'message' => "Vehicle $regNo removed from active fleet."]);
}

sendErrorResponse('Method not allowed.', 405);
