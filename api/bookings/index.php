<?php
/**
 * api/bookings/index.php
 * GET /api/bookings - List all bookings (Staff)
 * POST /api/bookings - Create booking
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    require_once __DIR__ . '/create.php';
    exit;
}

if ($method === 'GET') {
    Auth::requireRole('admin', 'manager', 'executive');

    $status = trim((string)($_GET['status'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));

    $sql = "SELECT * FROM bookings WHERE 1=1";
    $params = [];

    if ($status && $status !== 'all') {
        $sql .= " AND (status = ? OR booking_status = ? OR payment_status = ?)";
        $params[] = $status;
        $params[] = $status;
        $params[] = $status;
    }

    if ($search) {
        $sql .= " AND (booking_id LIKE ? OR user_name LIKE ? OR user_email LIKE ? OR vehicle_name LIKE ? OR payment_ref LIKE ?)";
        $pat = "%$search%";
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
    }

    $sql .= " ORDER BY created_at DESC";

    $rows = Database::fetchAll($sql, $params);

    $bookings = array_map(function($b) {
        $status = $b['status'];
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
            'userId' => $b['firebase_uid'],
            'firebaseUid' => $b['firebase_uid'],
            'userName' => $b['user_name'],
            'userEmail' => $b['user_email'],
            'userPhone' => $b['user_phone'],
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
            'paymentScreenshotUrl' => $b['payment_screenshot_url'],
            'createdAt' => $b['created_at'],
            'updatedAt' => $b['updated_at']
        ];
    }, $rows);

    sendJsonResponse(['success' => true, 'count' => count($bookings), 'bookings' => $bookings]);
}

sendErrorResponse('Method not allowed.', 405);
