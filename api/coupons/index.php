<?php
/**
 * api/coupons/index.php
 * GET /api/coupons - List active coupons (or all coupons for admin)
 * POST /api/coupons - Create coupon (admin only)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

// Auto-heal / ensure coupons table exists
try {
    Database::execute("
        CREATE TABLE IF NOT EXISTS coupons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(64) NOT NULL UNIQUE,
            discount_type VARCHAR(32) NOT NULL DEFAULT 'flat',
            discount_value DECIMAL(10,2) NOT NULL,
            min_order DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            max_discount DECIMAL(10,2) DEFAULT NULL,
            label VARCHAR(128) DEFAULT NULL,
            description VARCHAR(255) DEFAULT NULL,
            active TINYINT(1) NOT NULL DEFAULT 1,
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            used_count INT NOT NULL DEFAULT 0,
            max_uses INT DEFAULT NULL,
            expires_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_coupons_code (code),
            INDEX idx_coupons_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
} catch (Throwable $_) {}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $user = Auth::optionalAuth();
    $isStaff = $user && in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);
    $showAll = $isStaff || isset($_GET['all']) || (isset($_GET['admin']) && $_GET['admin'] == '1');

    // Auto-heal empty or invalid discount_type in coupons table
    try {
        Database::execute("UPDATE coupons SET discount_type = 'percentage' WHERE (discount_type = '' OR discount_type IS NULL OR discount_type = 'flat') AND label LIKE '%\\%%'");
    } catch (Throwable $_) {}

    $sql = $showAll ? "SELECT * FROM coupons ORDER BY created_at DESC" : "SELECT * FROM coupons WHERE active = 1 AND status = 'active' ORDER BY created_at DESC";
    $rows = Database::fetchAll($sql);

    // Bulletproof deduplication by coupon code
    $dedupedCoupons = [];
    $seenCodes = [];
    foreach ($rows as $c) {
        $code = strtoupper(trim((string)($c['code'] ?? '')));
        if ($code !== '' && isset($seenCodes[$code])) {
            continue;
        }
        if ($code !== '') {
            $seenCodes[$code] = true;
        }
        $dedupedCoupons[] = $c;
    }
    $rows = $dedupedCoupons;

    $coupons = array_map(function($c) {
        $isPercent = ($c['discount_type'] === 'percentage' || $c['discount_type'] === 'percent' || (isset($c['label']) && strpos((string)$c['label'], '%') !== false));
        $normType = $isPercent ? 'percent' : 'flat';
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
            'status' => $c['status'] ?? ($c['active'] ? 'active' : 'inactive'),
            'usedCount' => (int)($c['used_count'] ?? 0),
            'expiresAt' => $c['expires_at'] ?? null,
            'createdAt' => $c['created_at'] ?? null
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
    $maxDiscount = isset($input['maxDiscount']) && $input['maxDiscount'] !== '' ? (float)$input['maxDiscount'] : null;
    $label = trim((string)($input['label'] ?? ''));
    if (!$label) {
        $label = $discountType === 'percentage' ? "{$discountValue}% Off" : "₹{$discountValue} Flat Off";
    }
    $description = trim((string)($input['description'] ?? ''));
    if (!$description) {
        $description = "Enjoy discount on your booking";
    }
    $active = isset($input['active']) ? (int)(bool)$input['active'] : 1;
    $status = trim((string)($input['status'] ?? ($active ? 'active' : 'inactive')));

    if (!$code || $discountValue <= 0) {
        sendErrorResponse('Coupon code and valid discount value are required.', 400);
    }

    // If coupon already exists, seamlessly update it instead of throwing a blocking 409 conflict
    $existing = Database::fetchOne("SELECT id, code FROM coupons WHERE UPPER(code) = ? LIMIT 1", [$code]);
    if ($existing) {
        Database::execute(
            "UPDATE coupons SET discount_type = ?, discount_value = ?, min_order = ?, max_discount = ?, label = ?, description = ?, active = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [$discountType, $discountValue, $minOrder, $maxDiscount, $label, $description, $active, $status, $existing['id']]
        );

        sendJsonResponse([
            'success' => true,
            'message' => "Coupon $code updated successfully.",
            'coupon' => [
                'id' => (int)$existing['id'],
                'code' => $code,
                'type' => $discountType === 'percentage' ? 'percent' : 'flat',
                'discountValue' => $discountValue,
                'label' => $label,
                'minOrder' => $minOrder,
                'active' => (bool)$active,
                'status' => $status
            ]
        ]);
        exit;
    }

    Database::execute(
        "INSERT INTO coupons (code, discount_type, discount_value, min_order, max_discount, label, description, active, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [$code, $discountType, $discountValue, $minOrder, $maxDiscount, $label, $description, $active, $status]
    );

    $newId = (int)Database::lastInsertId();

    sendJsonResponse([
        'success' => true,
        'message' => "Coupon $code created successfully.",
        'coupon' => [
            'id' => $newId,
            'code' => $code,
            'type' => $discountType === 'percentage' ? 'percent' : 'flat',
            'discountValue' => $discountValue,
            'label' => $label,
            'minOrder' => $minOrder,
            'active' => (bool)$active,
            'status' => $status
        ]
    ]);
}

sendErrorResponse('Method not allowed.', 405);
