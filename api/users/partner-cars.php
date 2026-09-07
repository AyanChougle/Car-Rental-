<?php
/**
 * api/users/partner-cars.php
 * GET /api/users/partner-cars - List host listings (customer gets their own, staff gets all)
 * POST /api/users/partner-cars - Submit new host car listing / update status
 * PUT /api/users/partner-cars - Update host listing status (admin/manager)
 * DELETE /api/users/partner-cars - Delete host listing
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);
$method = $_SERVER['REQUEST_METHOD'];

// Ensure partner_cars table exists
try {
    Database::execute("
        CREATE TABLE IF NOT EXISTS partner_cars (
            id INT AUTO_INCREMENT PRIMARY KEY,
            car_id VARCHAR(64) UNIQUE,
            user_id INT NULL,
            firebase_uid VARCHAR(128) NULL,
            user_name VARCHAR(128) NULL,
            user_phone VARCHAR(32) NULL,
            user_email VARCHAR(128) NULL,
            brand VARCHAR(64) NOT NULL,
            model VARCHAR(64) NOT NULL,
            year INT DEFAULT 2024,
            reg_no VARCHAR(32) NOT NULL,
            transmission VARCHAR(32) DEFAULT 'Automatic',
            fuel VARCHAR(32) DEFAULT 'Petrol',
            city VARCHAR(128) DEFAULT 'Navi Mumbai',
            expected_price DECIMAL(10,2) DEFAULT 0.00,
            status VARCHAR(32) DEFAULT 'pending_approval',
            photos TEXT NULL,
            rejection_reason TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_partner_fb (firebase_uid),
            INDEX idx_partner_email (user_email),
            INDEX idx_partner_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
} catch (Throwable $_) {}

if ($method === 'GET') {
    // Auto-heal missing car_id in partner_cars
    try {
        $missing = Database::fetchAll("SELECT id FROM partner_cars WHERE car_id IS NULL OR car_id = ''");
        foreach ($missing as $m) {
            $genId = 'HC-' . strtoupper(bin2hex(random_bytes(4)));
            Database::execute("UPDATE partner_cars SET car_id = ? WHERE id = ?", [$genId, $m['id']]);
        }
    } catch (Throwable $_) {}

    if ($isStaff) {
        $rows = Database::fetchAll("SELECT * FROM partner_cars ORDER BY created_at DESC");
    } else {
        $uid = trim((string)($user['firebase_uid'] ?? ''));
        $email = trim((string)($user['email'] ?? ''));
        $dbId = (int)($user['id'] ?? 0);
        $rows = Database::fetchAll(
            "SELECT * FROM partner_cars 
             WHERE (firebase_uid IS NOT NULL AND firebase_uid != '' AND firebase_uid = ?) 
                OR (user_email IS NOT NULL AND user_email != '' AND user_email = ?) 
                OR (user_id IS NOT NULL AND user_id > 0 AND user_id = ?) 
             ORDER BY created_at DESC", 
            [$uid, $email, $dbId]
        );
    }

    $partnerCars = array_map(function($c) {
        $photos = [];
        if (!empty($c['photos'])) {
            $photos = is_string($c['photos']) ? json_decode($c['photos'], true) : $c['photos'];
            if (!is_array($photos)) $photos = [];
        }
        $identifier = !empty($c['car_id']) ? (string)$c['car_id'] : (!empty($c['id']) ? (string)$c['id'] : 'HC-' . ($c['reg_no'] ?? 'TEMP'));
        return [
            'id' => $identifier,
            'carId' => $identifier,
            'dbId' => $c['id'],
            'userId' => $c['firebase_uid'],
            'firebaseUid' => $c['firebase_uid'],
            'dbUserId' => $c['user_id'],
            'user_id' => $c['user_id'],
            'userName' => $c['user_name'],
            'userPhone' => $c['user_phone'],
            'userEmail' => $c['user_email'],
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
        Database::execute("DELETE FROM partner_cars WHERE (id = ? OR car_id = ?) AND (firebase_uid = ? OR user_email = ?)", [$id, $id, $uid, $email]);
    }
    sendJsonResponse(['success' => true, 'message' => 'Partner car deleted.']);
}

sendErrorResponse('Method not allowed.', 405);
