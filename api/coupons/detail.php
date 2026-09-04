<?php
/**
 * api/coupons/detail.php
 * PUT / DELETE /api/coupons/:code
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin', 'manager');

$code = strtoupper(trim((string)($_GET['code'] ?? $_GET['id'] ?? '')));
if (!$code) {
    sendErrorResponse('Coupon code is required.', 400);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'PUT' || $method === 'POST') {
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    $updates = [];
    $params = [];

    if (isset($input['active'])) {
        $updates[] = "active = ?";
        $updates[] = "status = ?";
        $params[] = (int)(bool)$input['active'];
        $params[] = $input['active'] ? 'active' : 'inactive';
    }
    if (isset($input['discountValue'])) {
        $updates[] = "discount_value = ?";
        $params[] = (float)$input['discountValue'];
    }
    if (isset($input['minOrder'])) {
        $updates[] = "min_order = ?";
        $params[] = (float)$input['minOrder'];
    }

    if ($updates) {
        $params[] = $code;
        Database::execute(
            "UPDATE coupons SET " . implode(', ', $updates) . ", updated_at = CURRENT_TIMESTAMP WHERE code = ?",
            $params
        );
    }

    sendJsonResponse(['success' => true, 'message' => "Coupon $code updated."]);
}

if ($method === 'DELETE') {
    Database::execute("DELETE FROM coupons WHERE code = ?", [$code]);
    sendJsonResponse(['success' => true, 'message' => "Coupon $code deleted."]);
}

sendErrorResponse('Method not allowed.', 405);
