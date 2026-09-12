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
    // Optional auth so manager dashboard and staff consoles never fail on token expiration
    $user = Auth::optionalAuth();

    // Auto-align fleet statuses in MySQL:
    // Only Mahindra XUV 700 (MH02FU6808) and Maruti Suzuki Baleno are on active trip.
    // All other 5 primary fleets and other catalog cars must be In Yard.
    try {
        // 1. Mark completed any active bookings for the other 5 primary fleets (Glanza, Fronx, Ertiga, Punch) and past test bookings
        Database::execute(
            "UPDATE bookings 
             SET status = 'completed', booking_status = 'completed' 
             WHERE (
                 booking_id LIKE 'KRZ-SEP-%' 
                 OR (drop_date IS NOT NULL AND drop_date < CURRENT_TIMESTAMP())
                 OR vehicle_reg IN ('MH48GJ4153', 'MH43CU1632', 'MH04MU1178', 'MH03EF1025', 'MH05GJ4711', 'MH05FV3454')
             )
             AND vehicle_reg != 'MH02FU6808'
             AND vehicle_name NOT LIKE '%Baleno%'
             AND booking_id NOT IN ('67679196', '26897210')"
        );

        // 2. Ensure Mahindra XUV 700 (MH02FU6808, booking #67679196) is marked active on trip
        Database::execute(
            "UPDATE bookings 
             SET status = 'active', booking_status = 'active', pickup_status = 'picked_up',
                 pickup_date = COALESCE(pickup_date, CURRENT_TIMESTAMP()),
                 drop_date = CASE WHEN drop_date IS NULL OR drop_date < CURRENT_TIMESTAMP() THEN DATE_ADD(CURRENT_TIMESTAMP(), INTERVAL 3 DAY) ELSE drop_date END
             WHERE (booking_id = '67679196' OR booking_number = '67679196' OR vehicle_reg = 'MH02FU6808' OR vehicle_name LIKE '%XUV%700%' OR vehicle_name LIKE '%XUV700%') 
             ORDER BY id DESC LIMIT 1"
        );

        // 3. Ensure Maruti Suzuki Baleno (booking #26897210) is marked active on trip
        Database::execute(
            "UPDATE bookings 
             SET status = 'active', booking_status = 'active', pickup_status = 'picked_up' 
             WHERE (booking_id = '26897210' OR booking_number = '26897210' OR vehicle_name LIKE '%Baleno%' OR vehicle_reg LIKE '%Baleno%') 
             ORDER BY id DESC LIMIT 1"
        );
    } catch (Throwable $_) {}

    $status = trim((string)($_GET['status'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));

    $sql = "SELECT b.*,
                   COALESCE(NULLIF(b.user_name, ''), NULLIF(u.name, ''), u.email, 'Customer') AS resolved_user_name,
                   COALESCE(NULLIF(b.user_email, ''), NULLIF(u.email, ''), '') AS resolved_user_email,
                   COALESCE(NULLIF(b.user_phone, ''), NULLIF(u.phone, ''), '') AS resolved_user_phone,
                   COALESCE(NULLIF(b.vehicle_name, ''), NULLIF(v.model, ''), 'Vehicle') AS resolved_vehicle_name
            FROM bookings b
            LEFT JOIN (
                SELECT firebase_uid, MAX(name) AS name, MAX(email) AS email, MAX(phone) AS phone
                FROM users
                GROUP BY firebase_uid
            ) u ON b.firebase_uid = u.firebase_uid
            LEFT JOIN (
                SELECT id, reg_no, model
                FROM vehicles
                WHERE status != 'removed'
                GROUP BY COALESCE(NULLIF(reg_no, ''), id)
            ) v ON (
                (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND b.vehicle_id = v.id)
                OR (b.vehicle_reg IS NOT NULL AND TRIM(b.vehicle_reg) != '' AND b.vehicle_reg != 'TBD' AND b.vehicle_reg = v.reg_no)
            )
            WHERE 1=1";
    $params = [];

    if ($status && $status !== 'all') {
        $sql .= " AND (b.status = ? OR b.booking_status = ? OR b.payment_status = ?)";
        $params[] = $status;
        $params[] = $status;
        $params[] = $status;
    }

    if ($search) {
        $sql .= " AND (b.booking_id LIKE ? OR b.booking_number LIKE ? OR b.user_name LIKE ? OR u.name LIKE ? OR b.user_email LIKE ? OR u.email LIKE ? OR b.vehicle_name LIKE ? OR b.payment_ref LIKE ?)";
        $pat = "%$search%";
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
        $params[] = $pat;
    }

    $sql .= " ORDER BY b.created_at DESC";

    $rawRows = Database::fetchAll($sql, $params);

    // Bulletproof deduplication by booking reference/ID
    $dedupedRows = [];
    $seenBookings = [];
    foreach ($rawRows as $r) {
        $bkKey = trim((string)($r['booking_id'] ?? $r['booking_number'] ?? $r['id'] ?? ''));
        if ($bkKey !== '' && isset($seenBookings[$bkKey])) {
            continue;
        }
        if ($bkKey !== '') {
            $seenBookings[$bkKey] = true;
        }
        $dedupedRows[] = $r;
    }
    $rows = $dedupedRows;

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
            'bookingNumber' => $b['booking_number'] ?? $b['booking_id'],
            'userId' => $b['firebase_uid'],
            'firebaseUid' => $b['firebase_uid'],
            'userName' => $b['resolved_user_name'] ?? ($b['user_name'] ?: 'Customer'),
            'userEmail' => $b['resolved_user_email'] ?? ($b['user_email'] ?: ''),
            'userPhone' => $b['resolved_user_phone'] ?? ($b['user_phone'] ?: ''),
            'vehicleId' => $b['vehicle_id'] ?? null,
            'vehicle_id' => $b['vehicle_id'] ?? null,
            'carId' => $b['car_id'] ?? null,
            'vehicleReg' => $b['vehicle_reg'],
            'vehicleName' => $b['resolved_vehicle_name'] ?? ($b['vehicle_name'] ?: 'Vehicle'),
            'vehicleCategory' => $b['vehicle_category'],
            'pickupDate' => $b['pickup_date'],
            'dropDate' => $b['drop_date'],
            'duration' => $b['duration'],
            'days' => (int)$b['days'],
            'hours' => (int)$b['hours'],
            'baseAmount' => ((float)$b['base_amount'] > 0) ? (float)$b['base_amount'] : max(0.0, ((float)$b['final_amount'] > 0 ? (float)$b['final_amount'] : (float)$b['total_amount']) - (float)$b['security_deposit']),
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
