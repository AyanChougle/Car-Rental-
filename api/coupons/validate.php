<?php
/**
 * api/coupons/validate.php
 * POST /api/coupons/validate - Server-Side Coupon Validation & Single-Use Enforcement
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::optionalAuth();
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$code = strtoupper(trim((string)($input['code'] ?? $input['couponCode'] ?? '')));
$orderTotal = (float)($input['orderTotal'] ?? $input['bookingAmount'] ?? $input['baseAmount'] ?? $input['totalAmount'] ?? 0.00);

if (!$code) {
    sendErrorResponse('Coupon code is required.', 400);
}

$coupon = Database::fetchOne(
    "SELECT * FROM coupons WHERE UPPER(code) = ? LIMIT 1",
    [$code]
);

if (!$coupon || (int)$coupon['active'] !== 1 || $coupon['status'] !== 'active') {
    sendErrorResponse("Invalid or inactive coupon code '$code'.", 400);
}

if (!empty($coupon['expires_at']) && strtotime($coupon['expires_at']) < time()) {
    sendErrorResponse("Coupon '$code' has expired.", 400);
}

if ($orderTotal > 0 && $orderTotal < (float)$coupon['min_order']) {
    sendErrorResponse("Coupon '$code' requires a minimum booking amount of ₹" . number_format((float)$coupon['min_order'], 2) . ".", 400);
}

// Single-use per user enforcement if authenticated
if ($user && !empty($user['firebase_uid'])) {
    $alreadyUsed = Database::fetchOne(
        "SELECT id FROM coupon_usage WHERE UPPER(coupon_code) = ? AND firebase_uid = ? LIMIT 1",
        [$code, $user['firebase_uid']]
    );

    if ($alreadyUsed) {
        sendErrorResponse("You have already used coupon '$code'. Coupons can only be applied once per user account.", 400);
    }
}

// Calculate discount
$discount = 0.00;
$normType = ($coupon['discount_type'] === 'percentage' || $coupon['discount_type'] === 'percent') ? 'percent' : 'flat';

if ($normType === 'percent') {
    $discount = ($orderTotal * (float)$coupon['discount_value']) / 100;
    if (!empty($coupon['max_discount']) && (float)$coupon['max_discount'] > 0) {
        $discount = min($discount, (float)$coupon['max_discount']);
    }
} else {
    $discount = $orderTotal > 0 ? min((float)$coupon['discount_value'], $orderTotal) : (float)$coupon['discount_value'];
}

$finalTotal = max(0.00, $orderTotal - $discount);
$label = $coupon['label'] ?: ($normType === 'percent' ? "{$coupon['discount_value']}% Off" : "₹{$coupon['discount_value']} Flat Off");
$description = $coupon['description'] ?: 'Coupon applied successfully.';

$couponData = [
    'id' => $coupon['id'] ?? null,
    'code' => $coupon['code'],
    'discountType' => $normType,
    'discount_type' => $normType,
    'discountValue' => (float)$coupon['discount_value'],
    'discount_value' => (float)$coupon['discount_value'],
    'minOrder' => (float)$coupon['min_order'],
    'min_order' => (float)$coupon['min_order'],
    'maxDiscount' => !empty($coupon['max_discount']) ? (float)$coupon['max_discount'] : null,
    'max_discount' => !empty($coupon['max_discount']) ? (float)$coupon['max_discount'] : null,
    'label' => $label,
    'description' => $description,
    'discountAmount' => round($discount, 2)
];

sendJsonResponse([
    'success' => true,
    'valid' => true,
    'code' => $coupon['code'],
    'discountType' => $normType,
    'discount_type' => $normType,
    'discountValue' => (float)$coupon['discount_value'],
    'discount_value' => (float)$coupon['discount_value'],
    'discountAmount' => round($discount, 2),
    'discount' => round($discount, 2),
    'finalTotal' => round($finalTotal, 2),
    'label' => $label,
    'description' => $description,
    'coupon' => $couponData
]);
