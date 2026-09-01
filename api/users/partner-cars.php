<?php
/**
 * api/users/partner-cars.php
 * GET /api/users/partner-cars - List host listings
 * PUT /api/users/partner-cars - Update host listing status
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin', 'manager');

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $rows = Database::fetchAll("SELECT * FROM partner_cars ORDER BY created_at DESC");
    $partnerCars = array_map(function($c) {
        $photos = [];
        if (!empty($c['photos'])) {
            $photos = is_string($c['photos']) ? json_decode($c['photos'], true) : $c['photos'];
        }
        return [
            'id' => $c['id'],
            'carId' => $c['car_id'],
            'userId' => $c['firebase_uid'],
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

if ($method === 'PUT' || $method === 'POST') {
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
