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

    if (!empty($input['newCode']) || (!empty($input['code']) && strtoupper(trim((string)$input['code'])) !== $code)) {
        $newCode = strtoupper(trim((string)($input['newCode'] ?? $input['code'])));
        if ($newCode) {
            $updates[] = "code = ?";
            $params[] = $newCode;
        }
    }
    if (isset($input['active'])) {
        $updates[] = "active = ?";
        $params[] = (int)(bool)$input['active'];
    }
    if (isset($input['status'])) {
        $updates[] = "status = ?";
        $params[] = (string)$input['status'];
    }
    if (isset($input['discountType']) || isset($input['type'])) {
        $rawType = strtolower(trim((string)($input['discountType'] ?? $input['type'])));
        $updates[] = "discount_type = ?";
        $params[] = ($rawType === 'percent' || $rawType === 'percentage') ? 'percentage' : 'flat';
    }
    if (isset($input['discountValue']) || isset($input['val'])) {
        $updates[] = "discount_value = ?";
        $params[] = (float)($input['discountValue'] ?? $input['val']);
    }
    if (isset($input['minOrder']) || isset($input['minimumBookingAmount'])) {
        $updates[] = "min_order = ?";
        $params[] = (float)($input['minOrder'] ?? $input['minimumBookingAmount']);
    }
    if (isset($input['label'])) {
        $updates[] = "label = ?";
        $params[] = trim((string)$input['label']);
    }
    if (isset($input['description'])) {
        $updates[] = "description = ?";
        $params[] = trim((string)$input['description']);
    }

    if ($updates) {
        $params[] = $code;
        $params[] = is_numeric($code) ? (int)$code : 0;
        Database::execute(
            "UPDATE coupons SET " . implode(', ', $updates) . ", updated_at = CURRENT_TIMESTAMP WHERE code = ? OR id = ?",
            $params
        );
    }

    sendJsonResponse(['success' => true, 'message' => "Coupon $code updated successfully."]);
}

if ($method === 'DELETE') {
    $numericId = is_numeric($code) ? (int)$code : 0;
    Database::execute("DELETE FROM coupons WHERE code = ? OR id = ?", [$code, $numericId]);
    sendJsonResponse(['success' => true, 'message' => "Coupon $code deleted successfully."]);
}

sendErrorResponse('Method not allowed.', 405);
