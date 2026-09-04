<?php
/**
 * api/payments/index.php
 * GET /api/payments - List payments for admin/manager review
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);

if (!$isStaff) {
    // Return customer's own payments
    $rows = Database::fetchAll(
        "SELECT * FROM payments WHERE firebase_uid = ? ORDER BY created_at DESC",
        [$user['firebase_uid']]
    );
} else {
    $rows = Database::fetchAll(
        "SELECT p.*, b.user_name, b.user_email, b.user_phone, b.vehicle_name, b.vehicle_reg, b.total_amount, b.booking_number
         FROM payments p
         LEFT JOIN bookings b ON (p.booking_id = b.booking_id OR p.booking_id = b.booking_number)
         ORDER BY p.created_at DESC"
    );
}

$payments = array_map(function($p) {
    return [
        'id' => $p['payment_id'],
        'paymentId' => $p['payment_id'],
        'bookingId' => $p['booking_id'],
        'bookingNumber' => $p['booking_number'] ?? $p['booking_id'],
        'userId' => $p['firebase_uid'],
        'userName' => $p['user_name'] ?? 'Customer',
        'userEmail' => $p['user_email'] ?? '',
        'userPhone' => $p['user_phone'] ?? '',
        'vehicleName' => $p['vehicle_name'] ?? '',
        'vehicleReg' => $p['vehicle_reg'] ?? '',
        'amount' => (float)$p['amount'],
        'currency' => $p['currency'],
        'method' => $p['method'],
        'utr' => $p['utr'],
        'transactionReference' => $p['utr'],
        'paymentRef' => $p['payment_ref'],
        'screenshotUrl' => $p['screenshot_url'],
        'screenshotMediaId' => $p['screenshot_media_id'],
        'status' => $p['status'],
        'rejectionReason' => $p['rejection_reason'],
        'refundAmount' => (float)$p['refund_amount'],
        'verifiedBy' => $p['verified_by'],
        'verifiedAt' => $p['verified_at'],
        'createdAt' => $p['created_at']
    ];
}, $rows);

sendJsonResponse(['success' => true, 'count' => count($payments), 'payments' => $payments]);
