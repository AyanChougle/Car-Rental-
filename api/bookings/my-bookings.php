<?php
/**
 * api/bookings/my-bookings.php
 * GET /api/bookings/my-bookings - List customer bookings
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

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

// Link any unlinked bookings that match user's email or phone to this user's firebase_uid
if ($uid) {
    if (!empty($email) && !empty($cleanPhone)) {
        try {
            Database::execute(
                "UPDATE bookings SET firebase_uid = ?, user_id = COALESCE(NULLIF(user_id, 0), ?) 
                 WHERE (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid != ?) 
                   AND (user_email = ? OR user_phone = ? OR REPLACE(REPLACE(user_phone, '+91', ''), ' ', '') = ?)",
                [$uid, $dbId ?: null, $uid, $email, $phone, $cleanPhone]
            );
        } catch (Throwable $_) {}
    } elseif (!empty($email)) {
        try {
            Database::execute(
                "UPDATE bookings SET firebase_uid = ?, user_id = COALESCE(NULLIF(user_id, 0), ?) 
                 WHERE (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid != ?) 
                   AND user_email = ?",
                [$uid, $dbId ?: null, $uid, $email]
            );
        } catch (Throwable $_) {}
    } elseif (!empty($cleanPhone)) {
        try {
            Database::execute(
                "UPDATE bookings SET firebase_uid = ?, user_id = COALESCE(NULLIF(user_id, 0), ?) 
                 WHERE (firebase_uid IS NULL OR firebase_uid = '' OR firebase_uid != ?) 
                   AND (user_phone = ? OR REPLACE(REPLACE(user_phone, '+91', ''), ' ', '') = ?)",
                [$uid, $dbId ?: null, $uid, $phone, $cleanPhone]
            );
        } catch (Throwable $_) {}
    }

    try {
        Database::execute(
            "UPDATE payments p 
             JOIN bookings b ON (p.booking_id = b.booking_id OR p.booking_id = b.booking_number)
             SET p.firebase_uid = ?
             WHERE b.firebase_uid = ? AND (p.firebase_uid IS NULL OR p.firebase_uid = '' OR p.firebase_uid != ?)",
            [$uid, $uid, $uid]
        );
    } catch (Throwable $_) {}
}

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

$bookings = array_map(function($b) {
    $status = $b['status'];
    if ($b['payment_status'] === 'rejected' && ($status === 'pending_verification' || $status === 'pending_payment')) {
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
                  in_array($status, ['active', 'in_trip', 'completed'], true) ||
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
        'status' => $status,
        'bookingStatus' => $b['booking_status'] ?? $status,
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
