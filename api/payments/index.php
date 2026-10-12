<?php
/**
 * api/payments/index.php
 * GET /api/payments - List payments for admin/manager/executive review
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive', 'accountant'], true);
$hubIdFilter = isset($_GET['hub_id']) && $_GET['hub_id'] !== '' ? (int)$_GET['hub_id'] : 0;


if (!$isStaff) {
    // Return customer's own payments
    $rows = Database::fetchAll(
        "SELECT p.*, 
                COALESCE(NULLIF(b.user_name, ''), NULLIF(u.name, ''), u.email, 'Customer') AS matched_user_name,
                COALESCE(NULLIF(b.user_email, ''), NULLIF(u.email, ''), '') AS matched_user_email,
                COALESCE(NULLIF(b.user_phone, ''), NULLIF(u.phone, ''), '') AS matched_user_phone,
                COALESCE(NULLIF(b.vehicle_name, ''), NULLIF(v.model, ''), 'Vehicle') AS matched_vehicle_name,
                COALESCE(NULLIF(b.vehicle_reg, ''), NULLIF(v.reg_no, ''), '') AS matched_vehicle_reg,
                b.total_amount, 
                COALESCE(b.booking_number, b.booking_id, p.booking_id) AS matched_booking_number,
                b.pickup_date, b.drop_date, b.pickup_hub_id, b.drop_hub_id
         FROM payments p
         LEFT JOIN bookings b ON (
             p.booking_id = b.booking_id 
             OR p.booking_id = b.booking_number 
             OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_id, '#', '')
             OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_number, '#', '')
         )
         LEFT JOIN users u ON u.firebase_uid = COALESCE(b.firebase_uid, p.firebase_uid)
         LEFT JOIN vehicles v ON (
             (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND v.id = b.vehicle_id)
             OR (b.vehicle_reg IS NOT NULL AND TRIM(b.vehicle_reg) <> '' AND b.vehicle_reg <> 'TBD' AND v.reg_no = b.vehicle_reg)
         )
         WHERE p.firebase_uid = ? 
         ORDER BY p.created_at DESC",
        [$user['firebase_uid']]
    );
} else {
    $rows = Database::fetchAll(
        "SELECT p.*, 
                COALESCE(NULLIF(b.user_name, ''), NULLIF(u.name, ''), u.email, 'Customer') AS matched_user_name,
                COALESCE(NULLIF(b.user_email, ''), NULLIF(u.email, ''), '') AS matched_user_email,
                COALESCE(NULLIF(b.user_phone, ''), NULLIF(u.phone, ''), '') AS matched_user_phone,
                COALESCE(NULLIF(b.vehicle_name, ''), NULLIF(v.model, ''), 'Vehicle') AS matched_vehicle_name,
                COALESCE(NULLIF(b.vehicle_reg, ''), NULLIF(v.reg_no, ''), '') AS matched_vehicle_reg,
                b.total_amount,
                COALESCE(b.booking_number, b.booking_id, p.booking_id) AS matched_booking_number,
                b.pickup_date, b.drop_date, b.pickup_hub_id, b.drop_hub_id,
                COALESCE(
                    NULLIF(p.screenshot_url, ''),
                    NULLIF(b.payment_screenshot_url, ''),
                    (SELECT CONCAT('/api/media/file.php?id=', m.media_id) FROM media m WHERE (m.related_id = p.booking_id OR m.related_id = p.payment_id) AND m.category IN ('payment_proof', 'payment_screenshot') ORDER BY m.id DESC LIMIT 1)
                ) AS effective_screenshot_url
         FROM payments p
         LEFT JOIN bookings b ON (
             p.booking_id IS NOT NULL AND p.booking_id <> '' AND (
                 p.booking_id = b.booking_id
                 OR p.booking_id = b.booking_number
                 OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_id, '#', '')
                 OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_number, '#', '')
             )
         )
         LEFT JOIN users u ON u.firebase_uid = COALESCE(b.firebase_uid, p.firebase_uid)
         LEFT JOIN vehicles v ON (
             (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND v.id = b.vehicle_id)
             OR (b.vehicle_reg IS NOT NULL AND TRIM(b.vehicle_reg) <> '' AND b.vehicle_reg <> 'TBD' AND v.reg_no = b.vehicle_reg)
         )
         WHERE (? = 0 OR b.pickup_hub_id = ? OR b.drop_hub_id = ?)
           AND LOWER(COALESCE(b.status, '')) NOT IN ('cancelled', 'rejected')
           AND LOWER(COALESCE(p.status, '')) NOT IN ('refunded', 'cancelled', 'rejected')
         ORDER BY p.created_at DESC",
        [$hubIdFilter, $hubIdFilter, $hubIdFilter]
    );
}

// Bulletproof deduplication by payment_id or id
$dedupedPayments = [];
$seenPayments = [];
foreach ($rows as $r) {
    $payKey = trim((string)($r['payment_id'] ?? $r['id'] ?? ''));
    if ($payKey !== '' && isset($seenPayments[$payKey])) {
        continue;
    }
    if ($payKey !== '') {
        $seenPayments[$payKey] = true;
    }
    $dedupedPayments[] = $r;
}
$rows = $dedupedPayments;

$payments = array_map(function($p) {
    return [
        'id' => $p['payment_id'],
        'paymentId' => $p['payment_id'],
        'bookingId' => $p['booking_id'],
        'bookingNumber' => $p['matched_booking_number'] ?? $p['booking_id'],
        'hubId' => (int)($p['pickup_hub_id'] ?? 0),
        'hub_id' => (int)($p['pickup_hub_id'] ?? 0),
        'pickupHubId' => (int)($p['pickup_hub_id'] ?? 0),
        'dropHubId' => (int)($p['drop_hub_id'] ?? $p['pickup_hub_id'] ?? 0),
        'userId' => $p['firebase_uid'],
        'userName' => $p['matched_user_name'] ?? 'Customer',
        'userEmail' => $p['matched_user_email'] ?? '',
        'userPhone' => $p['matched_user_phone'] ?? '',
        'vehicleName' => $p['matched_vehicle_name'] ?? 'Vehicle',
        'vehicleReg' => $p['matched_vehicle_reg'] ?? '',
        'amount' => (float)$p['amount'],
        'currency' => $p['currency'] ?? 'INR',
        'method' => $p['method'],
        'utr' => $p['utr'],
        'transactionReference' => $p['utr'],
        'paymentRef' => $p['payment_ref'],
        'screenshotUrl' => $p['effective_screenshot_url'] ?? $p['screenshot_url'] ?? null,
        'screenshotMediaId' => $p['screenshot_media_id'],
        'status' => $p['status'],
        'rejectionReason' => $p['rejection_reason'],
        'refundAmount' => (float)($p['refund_amount'] ?? 0),
        'verifiedBy' => $p['verified_by'],
        'verifiedAt' => $p['verified_at'],
        'createdAt' => $p['created_at'],
        'date' => $p['created_at'] ?? $p['pickup_date'] ?? ''
    ];
}, $rows);

sendJsonResponse(['success' => true, 'count' => count($payments), 'payments' => $payments]);

