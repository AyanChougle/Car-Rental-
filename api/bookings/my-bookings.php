<?php
/**
 * api/bookings/my-bookings.php
 * GET /api/bookings/my-bookings - List customer bookings
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';

$user = Auth::requireAuth();

$uid = trim((string)($user['firebase_uid'] ?? ''));
$email = strtolower(trim((string)($user['email'] ?? '')));
$name = trim((string)($user['name'] ?? ''));
$phone = trim((string)($user['phone'] ?? ''));
$cleanPhone = preg_replace('/\D/', '', $phone);
if (strlen($cleanPhone) === 12 && str_starts_with($cleanPhone, '91')) {
    $cleanPhone = substr($cleanPhone, 2);
}
$dbId = (int)($user['id'] ?? 0);



$whereClauses = ["(firebase_uid IS NOT NULL AND firebase_uid != '' AND firebase_uid = ?)"];
$params = [$uid];

if (!empty($email)) {
    $whereClauses[] = "(user_email IS NOT NULL AND user_email != '' AND LOWER(user_email) = ?)";
    $params[] = $email;
}

if ($dbId > 0) {
    $whereClauses[] = "(user_id IS NOT NULL AND user_id > 0 AND user_id = ?)";
    $params[] = $dbId;
}

if (!empty($cleanPhone)) {
    $whereClauses[] = "(user_phone IS NOT NULL AND user_phone != '' AND (user_phone = ? OR REPLACE(REPLACE(user_phone, '+91', ''), ' ', '') = ?))";
    $params[] = $phone;
    $params[] = $cleanPhone;
}

$sql = "SELECT * FROM bookings WHERE " . implode(" OR ", $whereClauses) . " ORDER BY created_at DESC";
$rows = Database::fetchAll($sql, $params);
$paymentAggs = KpiService::loadDeduplicatedPayments();

$bookings = array_map(function($b) use ($paymentAggs) {
    $bidKey = (string)($b['id'] ?? '');
    $fin = KpiService::computeBookingFinancials($b, $paymentAggs[$bidKey] ?? []);
    $dt = KpiService::getBookingDates($b);

    $status = strtolower(trim((string)($b['status'] ?? '')));
    if ($fin['is_cancelled'] || (($b['payment_status'] ?? '') === 'rejected' && in_array($status, ['pending_verification', 'pending_payment'], true))) {
        $status = 'cancelled';
    }

    $inspection = [];
    if (!empty($b['return_inspection'])) {
        $inspection = is_string($b['return_inspection']) ? json_decode($b['return_inspection'], true) : $b['return_inspection'];
        if (!is_array($inspection)) {
            $inspection = [];
        }
    }

    $isPickedUp = !empty($b['pickup_at']) ||
                  !empty($b['start_odometer']) ||
                  in_array($status, ['active', 'in_trip', 'ongoing', 'started', 'completed'], true) ||
                  (!empty($inspection['pickupStatus']) && $inspection['pickupStatus'] === 'picked_up');

    $pickupStatus = $isPickedUp ? 'picked_up' : ($inspection['pickupStatus'] ?? 'awaiting pickup');
    $pickupAt = $b['pickup_at'] ?? ($inspection['pickupAt'] ?? null);
    $pickupHandledBy = $b['pickup_handled_by'] ?? ($inspection['pickupHandledBy'] ?? null);
    $pickupOdometer = $b['start_odometer'] ?? ($inspection['pickupOdometer'] ?? null);
    $returnOdometer = $b['end_odometer'] ?? ($inspection['returnOdometer'] ?? null);
    $pickupFastag = $b['start_fastag'] ?? ($inspection['pickupFastagBalance'] ?? $inspection['pickupFastag'] ?? null);
    $returnFastag = $b['return_fastag'] ?? ($inspection['returnFastagBalance'] ?? $inspection['returnFastag'] ?? null);
    $pickupFuelLevel = $inspection['pickupFuelLevel'] ?? $inspection['fuelLevel'] ?? null;
    $pickupNotes = $inspection['pickupNotes'] ?? null;
    $pickupPhotoMediaIds = $inspection['pickupPhotoMediaIds'] ?? [];
    $pickupPhotos = $inspection['pickupPhotos'] ?? [];

    return [
        'id' => $b['booking_id'] ?: ($b['booking_number'] ?: (string)$b['id']),
        'bookingId' => $b['booking_id'] ?: ($b['booking_number'] ?: (string)$b['id']),
        'bookingNumber' => $b['booking_number'] ?: ($b['booking_id'] ?: (string)$b['id']),
        'vehicleReg' => $b['vehicle_reg'],
        'vehicleName' => $b['vehicle_name'],
        'vehicleCategory' => $b['vehicle_category'],
        'pickupDate' => $b['pickup_date'],
        'dropDate' => $b['drop_date'],
        'duration' => $b['duration'] ?: ($dt['days'] . ' Days'),
        'days' => $dt['days'],
        'hours' => $dt['hours'],
        'withDriver' => (int)$b['with_driver'],
        'baseAmount' => $fin['base_rental'],
        'baseRental' => $fin['base_rental'],
        'driverCharges' => $fin['driver_charges'],
        'extraCharges' => $fin['extra_charges'],
        'totalAmount' => $fin['net_rental_before_refund'],
        'finalAmount' => $fin['net_rental_before_refund'],
        'netRentalBeforeRefund' => $fin['net_rental_before_refund'],
        'netRentalRevenue' => $fin['net_rental_revenue'],
        'grossCustomerPayable' => $fin['gross_customer_payable'],
        'advanceAmount' => (float)$b['advance_amount'],
        'verifiedCollected' => $fin['verified_collected'],
        'refundAmount' => $fin['refund_amount'],
        'remainingBalance' => $fin['outstanding_amount'],
        'outstandingAmount' => $fin['outstanding_amount'],
        'securityDeposit' => $fin['security_deposit'],
        'couponCode' => $b['coupon_code'],
        'couponDiscount' => $fin['coupon_discount'],
        'paymentPlan' => $b['payment_plan'],
        'paymentStatus' => $fin['is_cancelled'] ? ($fin['refund_amount'] > 0 ? 'refunded' : 'cancelled') : $b['payment_status'],
        'status' => $status,
        'bookingStatus' => $b['booking_status'] ?? $status,
        'cancellationReason' => $b['cancellation_reason'] ?? null,
        'cancellation_reason' => $b['cancellation_reason'] ?? null,
        'refundStatus' => $b['refund_status'] ?? null,
        'refund_status' => $b['refund_status'] ?? null,
        'paymentRef' => $b['payment_ref'],
        'location' => $b['location'],
        'pickupStatus' => $pickupStatus,
        'pickup_status' => $pickupStatus,
        'pickupAt' => $pickupAt,
        'pickupHandledBy' => $pickupHandledBy,
        'pickupOdometer' => $pickupOdometer,
        'startOdometer' => $pickupOdometer,
        'returnOdometer' => $returnOdometer,
        'endOdometer' => $returnOdometer,
        'pickupFastagBalance' => $pickupFastag,
        'startFastag' => $pickupFastag,
        'returnFastag' => $returnFastag,
        'returnFastagBalance' => $returnFastag,
        'pickupFuelLevel' => $pickupFuelLevel,
        'pickupNotes' => $pickupNotes,
        'pickupPhotoMediaIds' => $pickupPhotoMediaIds,
        'pickupPhotos' => $pickupPhotos,
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
