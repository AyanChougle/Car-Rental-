<?php
/**
 * api/bookings/my-bookings.php
 * GET /api/bookings/my-bookings - List customer bookings
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();

$rows = Database::fetchAll(
    "SELECT * FROM bookings WHERE firebase_uid = ? ORDER BY created_at DESC",
    [$user['firebase_uid']]
);

$bookings = array_map(function($b) {
    $inspection = [];
    if (!empty($b['return_inspection'])) {
        $inspection = is_string($b['return_inspection']) ? json_decode($b['return_inspection'], true) : $b['return_inspection'];
    }
    return [
        'id' => $b['booking_id'],
        'bookingId' => $b['booking_id'],
        'bookingNumber' => $b['booking_number'],
        'vehicleReg' => $b['vehicle_reg'],
        'vehicleName' => $b['vehicle_name'],
        'vehicleCategory' => $b['vehicle_category'],
        'pickupDate' => $b['pickup_date'],
        'dropDate' => $b['drop_date'],
        'duration' => $b['duration'],
        'days' => (int)$b['days'],
        'hours' => (int)$b['hours'],
        'withDriver' => (int)$b['with_driver'],
        'baseAmount' => (float)$b['base_amount'],
        'totalAmount' => (float)$b['total_amount'],
        'finalAmount' => (float)$b['final_amount'],
        'advanceAmount' => (float)$b['advance_amount'],
        'remainingBalance' => (float)$b['remaining_balance'],
        'securityDeposit' => (float)$b['security_deposit'],
        'couponCode' => $b['coupon_code'],
        'couponDiscount' => (float)$b['coupon_discount'],
        'paymentPlan' => $b['payment_plan'],
        'paymentStatus' => $b['payment_status'],
        'status' => $b['status'],
        'bookingStatus' => $b['booking_status'],
        'paymentRef' => $b['payment_ref'],
        'location' => $b['location'],
        'returnInspection' => $inspection,
        'createdAt' => $b['created_at'],
        'updatedAt' => $b['updated_at']
    ];
}, $rows);

sendJsonResponse([
    'success' => true,
    'count' => count($bookings),
    'bookings' => $bookings
]);
