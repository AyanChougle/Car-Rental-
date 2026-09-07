<?php
/**
 * api/payments/index.php
 * GET /api/payments - List payments for admin/manager/executive review
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);

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
         ORDER BY p.created_at DESC"
    );
}

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
        'screenshotUrl' => $p['screenshot_url'],
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

