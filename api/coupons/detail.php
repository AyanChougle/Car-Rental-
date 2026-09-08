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
    sendErrorResponse('Coupon code or ID is required.', 400);
}

// Find existing coupon
$target = is_numeric($code)
    ? Database::fetchOne("SELECT * FROM coupons WHERE id = ? LIMIT 1", [(int)$code])
    : Database::fetchOne("SELECT * FROM coupons WHERE UPPER(code) = ? LIMIT 1", [$code]);

if (!$target) {
    sendErrorResponse("Coupon '$code' not found.", 404);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'PUT' || $method === 'POST') {
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    $updates = [];
    $params = [];

    $incomingCode = strtoupper(trim((string)($input['newCode'] ?? $input['code'] ?? '')));
    if ($incomingCode && $incomingCode !== strtoupper((string)$target['code'])) {
        // Check if code is already in use by another coupon
        $conflict = Database::fetchOne("SELECT id FROM coupons WHERE UPPER(code) = ? AND id != ? LIMIT 1", [$incomingCode, $target['id']]);
        if ($conflict) {
            sendErrorResponse("Cannot rename coupon: Code '$incomingCode' is already used by another coupon (ID: #{$conflict['id']}).", 409);
        }
        $updates[] = "code = ?";
        $params[] = $incomingCode;
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
        $params[] = $target['id'];
        Database::execute(
            "UPDATE coupons SET " . implode(', ', $updates) . ", updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            $params
        );
    }

    sendJsonResponse([
        'success' => true,
        'message' => "Coupon #{$target['id']} ({$target['code']}) updated successfully.",
        'id' => $target['id']
    ]);
}

if ($method === 'DELETE') {
    Database::execute("DELETE FROM coupons WHERE id = ?", [$target['id']]);
    sendJsonResponse([
        'success' => true,
        'message' => "Coupon #{$target['id']} ({$target['code']}) deleted successfully."
    ]);
}

sendErrorResponse('Method not allowed.', 405);
