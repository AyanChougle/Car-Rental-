<?php
/**
 * api/users/partner-cars.php
 * GET /api/users/partner-cars - List host listings (customer gets their own, staff gets all)
 * POST /api/users/partner-cars - Submit new host car listing
 * PUT /api/users/partner-cars - Update host listing status (admin/manager)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if ($isStaff) {
        $rows = Database::fetchAll("SELECT * FROM partner_cars ORDER BY created_at DESC");
    } else {
        $rows = Database::fetchAll("SELECT * FROM partner_cars WHERE firebase_uid = ? ORDER BY created_at DESC", [$user['firebase_uid']]);
    }

    $partnerCars = array_map(function($c) {
        $photos = [];
        if (!empty($c['photos'])) {
            $photos = is_string($c['photos']) ? json_decode($c['photos'], true) : $c['photos'];
        }
        return [
            'id' => $c['car_id'] ?: $c['id'],
            'carId' => $c['car_id'] ?: $c['id'],
            'dbId' => $c['id'],
            'userId' => $c['firebase_uid'],
            'firebaseUid' => $c['firebase_uid'],
            'userName' => $c['user_name'],
            'userPhone' => $c['user_phone'],
            'userEmail' => $c['user_email'],
            'brand' => $c['brand'],
            'model' => $c['model'],
            'year' => (int)$c['year'],
            'regNo' => $c['reg_no'],
            'transmission' => $c['transmission'],
            'fuel' => $c['fuel'],
            'city' => $c['city'],
            'expectedPrice' => (float)$c['expected_price'],
            'status' => $c['status'],
            'photos' => $photos,
            'rejectionReason' => $c['rejection_reason'],
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
    $year = (int)($input['year'] ?? 2024);
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
            $carId, $user['id'], $user['firebase_uid'], $userName, $userPhone, $userEmail,
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

sendErrorResponse('Method not allowed.', 405);
