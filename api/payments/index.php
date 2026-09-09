<?php
/**
 * api/payments/index.php
 * GET /api/payments - List payments for admin/manager/executive review
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive', 'accountant'], true);

// Auto-heal any payments that do not yet have a corresponding booking row
try {
    $orphanPayments = Database::fetchAll(
        "SELECT p.*, u.name as u_name, u.email as u_email, u.phone as u_phone, u.id as u_id
         FROM payments p
         LEFT JOIN bookings b ON (
             p.booking_id = b.booking_id 
             OR p.booking_id = b.booking_number 
             OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_id, '#', '')
             OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_number, '#', '')
         )
         LEFT JOIN users u ON p.firebase_uid = u.firebase_uid
         WHERE b.id IS NULL"
    );

    foreach ($orphanPayments as $op) {
        $bid = $op['booking_id'];
        if (!$bid) continue;
        $maxRow = Database::fetchOne("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM bookings");
        $nextId = (int)($maxRow['next_id'] ?? 1);
        $amount = (float)$op['amount'];
        $plan = $amount <= 500 ? 'advance' : 'full';
        $pStatus = $op['status'] === 'verified' ? ($plan === 'advance' ? 'advance_paid' : 'paid') : ($op['status'] === 'rejected' ? 'rejected' : 'pending_verification');
        $bStatus = $op['status'] === 'verified' ? 'confirmed' : ($op['status'] === 'rejected' ? 'cancelled' : 'pending_verification');
        
        $vReg = 'BMW-320D';
        $vName = 'BMW 3 Series';
        $vCat = 'Luxury Sedan';
        $vRow = Database::fetchOne("SELECT id, brand, model, category, reg_no FROM vehicles LIMIT 1");
        if ($vRow) {
            $vReg = $vRow['reg_no'];
            $vName = $vRow['brand'] . ' ' . $vRow['model'];
            $vCat = $vRow['category'];
        }

        $createdAt = $op['created_at'] ?: date('Y-m-d H:i:s');
        $dropAt = date('Y-m-d H:i:s', strtotime($createdAt . ' +1 day'));

        Database::execute(
            "INSERT INTO bookings (
                id, booking_id, booking_number, user_id, firebase_uid, user_name, user_email, user_phone,
                vehicle_reg, vehicle_name, vehicle_category, pickup_date, drop_date,
                duration, days, hours, with_driver, base_amount, total_amount, final_amount,
                advance_amount, remaining_balance, remaining_amount, payment_plan, payment_status,
                status, booking_status, location, security_deposit, payment_ref, payment_screenshot_url, created_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '1 Day', 1, 24, 0,
                ?, ?, ?, ?, 0.00, 0.00, ?, ?, ?, ?, 'Gavson Business Park, Ghansoli', 0.00, ?, ?, ?
            ) ON DUPLICATE KEY UPDATE payment_status = VALUES(payment_status), status = VALUES(status)",
            [
                $nextId, $bid, $bid, $op['u_id'] ?: null, $op['firebase_uid'], $op['u_name'] ?: 'Customer', $op['u_email'] ?: '', $op['u_phone'] ?: null,
                $vReg, $vName, $vCat, $createdAt, $dropAt,
                $amount, $amount, $amount, $amount, $plan, $pStatus, $bStatus, $bStatus, $op['utr'] ?: $op['payment_ref'], $op['screenshot_url'], $createdAt
            ]
        );
    }
} catch (Throwable $_) {}

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
                b.pickup_date, b.drop_date
         FROM payments p
         LEFT JOIN bookings b ON (
             p.booking_id = b.booking_id 
             OR p.booking_id = b.booking_number 
             OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_id, '#', '')
             OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_number, '#', '')
         )
         LEFT JOIN users u ON (p.firebase_uid = u.firebase_uid OR (b.firebase_uid IS NOT NULL AND b.firebase_uid = u.firebase_uid))
         LEFT JOIN vehicles v ON (b.vehicle_id = v.id OR b.vehicle_reg = v.reg_no)
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
                b.pickup_date, b.drop_date,
                COALESCE(
                    NULLIF(p.screenshot_url, ''),
                    NULLIF(b.payment_screenshot_url, ''),
                    (SELECT CONCAT('/api/media/file.php?id=', m.media_id) FROM media m WHERE (m.related_id = p.booking_id OR m.related_id = p.payment_id) AND m.category IN ('payment_proof', 'payment_screenshot') ORDER BY m.id DESC LIMIT 1)
                ) AS effective_screenshot_url
         FROM payments p
         LEFT JOIN (
             SELECT booking_id, booking_number, user_name, user_email, user_phone, vehicle_id, vehicle_name, vehicle_reg, total_amount, pickup_date, drop_date, payment_screenshot_url, firebase_uid
             FROM bookings
             GROUP BY COALESCE(NULLIF(booking_id, ''), booking_number)
         ) b ON (
             p.booking_id IS NOT NULL AND p.booking_id != '' AND (
                 p.booking_id = b.booking_id 
                 OR p.booking_id = b.booking_number 
                 OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_id, '#', '')
                 OR REPLACE(p.booking_id, '#', '') = REPLACE(b.booking_number, '#', '')
             )
         )
         LEFT JOIN (
             SELECT firebase_uid, MAX(name) AS name, MAX(email) AS email, MAX(phone) AS phone
             FROM users
             GROUP BY firebase_uid
         ) u ON (p.firebase_uid = u.firebase_uid OR (b.firebase_uid IS NOT NULL AND b.firebase_uid = u.firebase_uid))
         LEFT JOIN (
             SELECT id, reg_no, model
             FROM vehicles
             WHERE status != 'removed'
             GROUP BY COALESCE(NULLIF(reg_no, ''), id)
         ) v ON (
             (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND b.vehicle_id = v.id)
             OR (b.vehicle_reg IS NOT NULL AND TRIM(b.vehicle_reg) != '' AND b.vehicle_reg != 'TBD' AND b.vehicle_reg = v.reg_no)
         )
         ORDER BY p.created_at DESC"
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

