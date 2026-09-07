<?php
/**
 * api/coupons/index.php
 * GET /api/coupons - List active coupons (or all coupons for admin)
 * POST /api/coupons - Create coupon (admin only)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $user = Auth::optionalAuth();
    $isStaff = $user && in_array($user['role'] ?? '', ['admin', 'manager'], true);

    $sql = $isStaff ? "SELECT * FROM coupons ORDER BY created_at DESC" : "SELECT * FROM coupons WHERE active = 1 AND status = 'active' ORDER BY created_at DESC";
    $rows = Database::fetchAll($sql);

    $coupons = array_map(function($c) {
        $normType = ($c['discount_type'] === 'percentage' || $c['discount_type'] === 'percent') ? 'percent' : 'flat';
        return [
            'id' => $c['id'],
            'code' => $c['code'],
            'type' => $normType,
            'discountType' => $normType,
            'discount_type' => $normType,
            'discountValue' => (float)$c['discount_value'],
            'val' => (float)$c['discount_value'],
            'minOrder' => (float)$c['min_order'],
            'maxDiscount' => $c['max_discount'] ? (float)$c['max_discount'] : null,
            'label' => $c['label'] ?: ($normType === 'percent' ? "{$c['discount_value']}% Off" : "₹{$c['discount_value']} Flat Off"),
            'description' => $c['description'] ?: "Enjoy discount on your booking",
            'active' => (bool)$c['active'],
            'status' => $c['status'],
            'usedCount' => (int)$c['used_count'],
            'expiresAt' => $c['expires_at'],
            'createdAt' => $c['created_at']
        ];
    }, $rows);

    sendJsonResponse(['success' => true, 'count' => count($coupons), 'coupons' => $coupons]);
}

if ($method === 'POST') {
    Auth::requireRole('admin', 'manager');
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    $code = strtoupper(trim((string)($input['code'] ?? '')));
    $rawType = strtolower(trim((string)($input['discountType'] ?? $input['type'] ?? 'flat')));
    $discountType = ($rawType === 'percent' || $rawType === 'percentage') ? 'percentage' : 'flat';
    $discountValue = (float)($input['discountValue'] ?? $input['val'] ?? 0.00);
    $minOrder = (float)($input['minOrder'] ?? $input['minimumBookingAmount'] ?? 0.00);
    $maxDiscount = isset($input['maxDiscount']) ? (float)$input['maxDiscount'] : null;
    $label = trim((string)($input['label'] ?? ''));
    $description = trim((string)($input['description'] ?? ''));
    $active = isset($input['active']) ? (int)(bool)$input['active'] : 1;
    $status = trim((string)($input['status'] ?? ($active ? 'active' : 'inactive')));

    if (!$code || $discountValue <= 0) {
        sendErrorResponse('Coupon code and valid discount value are required.', 400);
    }

    Database::execute(
        "INSERT INTO coupons (code, discount_type, discount_value, min_order, max_discount, label, description, active, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            discount_type = VALUES(discount_type),
            discount_value = VALUES(discount_value),
            min_order = VALUES(min_order),
            max_discount = VALUES(max_discount),
            label = VALUES(label),
            description = VALUES(description),
            active = VALUES(active),
            status = VALUES(status)",
        [$code, $discountType, $discountValue, $minOrder, $maxDiscount, $label, $description, $active, $status]
    );

    sendJsonResponse(['success' => true, 'message' => "Coupon $code saved successfully."]);
}

sendErrorResponse('Method not allowed.', 405);
