<?php
/**
 * api/bookings/index.php
 * GET /api/bookings - List all bookings (Staff)
 * POST /api/bookings - Create booking
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';




$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    require_once __DIR__ . '/create.php';
    exit;
}

if ($method === 'GET') {
    $user = Auth::requireRole('admin', 'super_admin', 'manager', 'executive', 'accountant', 'accounts');

    $status = trim((string)($_GET['status'] ?? ''));
    $search = trim((string)($_GET['search'] ?? ''));
    $hubId = isset($_GET['hub_id']) && $_GET['hub_id'] !== '' ? (int)$_GET['hub_id'] : 0;

    $sql = "SELECT b.*,
                   COALESCE(NULLIF(b.user_name, ''), NULLIF(u.name, ''), u.email, 'Customer') AS resolved_user_name,
                   COALESCE(NULLIF(b.user_email, ''), NULLIF(u.email, ''), '') AS resolved_user_email,
                   COALESCE(NULLIF(b.user_phone, ''), NULLIF(u.phone, ''), '') AS resolved_user_phone,
                   COALESCE(NULLIF(b.vehicle_name, ''), NULLIF(v.model, ''), 'Vehicle') AS resolved_vehicle_name,
                   v.hub_id AS v_hub_id,
                   v.reg_no AS v_reg_no,
                   ph.name AS pickup_hub_name,
                   dh.name AS drop_hub_name
            FROM bookings b
            LEFT JOIN users u ON u.firebase_uid = b.firebase_uid
            LEFT JOIN vehicles v ON (
                (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND v.id = b.vehicle_id)
                OR (b.vehicle_reg IS NOT NULL AND TRIM(b.vehicle_reg) <> '' AND b.vehicle_reg <> 'TBD' AND v.reg_no = b.vehicle_reg)
            )
            LEFT JOIN hubs ph ON ph.id = b.pickup_hub_id
            LEFT JOIN hubs dh ON dh.id = COALESCE(b.drop_hub_id, b.pickup_hub_id)
            WHERE 1=1";
    $params = [];

    if ($hubId > 0) {
        $sql .= " AND (b.pickup_hub_id = ? OR b.drop_hub_id = ?)";
        $params[] = $hubId;
        $params[] = $hubId;
    }

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

    $paymentData = KpiService::loadDeduplicatedPayments();
    $paymentsByBooking = $paymentData['by_booking'] ?? [];
    $registeredHubs = KpiService::getRegisteredHubsMap();

    $bookings = array_map(function($b) use ($paymentsByBooking, $registeredHubs) {
        $status = $b['status'];
        $inspection = [];
        if (!empty($b['return_inspection'])) {
            $inspection = is_string($b['return_inspection']) ? json_decode($b['return_inspection'], true) : $b['return_inspection'];
            if (!is_array($inspection)) {
                $inspection = [];
            }
        }

        $hasPhysicalPickup = !empty($b['pickup_at']) ||
                             !empty($b['start_odometer']) ||
                             (!empty($inspection['pickupStatus']) && $inspection['pickupStatus'] === 'picked_up');

        $isPickedUp = $hasPhysicalPickup ||
                      ($status === 'in_trip') ||
                      ($status === 'completed');

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

        $rawBId = trim((string)($b['booking_id'] ?? ''));
        $rawBNum = trim((string)($b['booking_number'] ?? ''));
        $rowId = (int)($b['id'] ?? 1);
        $bId = ($rawBId !== '') ? $rawBId : (($rawBNum !== '') ? $rawBNum : ('KRZ-BOOK-' . str_pad((string)$rowId, 3, '0', STR_PAD_LEFT)));
        $bNum = ($rawBNum !== '') ? $rawBNum : $bId;

        $bkLookup = strtoupper(ltrim($bId, '#'));
        $bkNumLookup = strtoupper(ltrim($bNum, '#'));
        $pAgg = $paymentsByBooking[$bkLookup] ?? ($paymentsByBooking[$bkNumLookup] ?? []);

        $fin = KpiService::computeBookingFinancials($b, $pAgg);
        $dates = KpiService::getBookingDates($b);
        $hubAttr = KpiService::resolveHubAttribution($b, $registeredHubs);
        $split = KpiService::calculateMonthlyRevenueSplit($b, $fin);
        if (empty($split) && !empty($b['monthly_revenue_split']) && !$fin['is_cancelled']) {
            $decodedSplit = is_string($b['monthly_revenue_split']) ? json_decode($b['monthly_revenue_split'], true) : $b['monthly_revenue_split'];
            if (is_array($decodedSplit)) {
                $split = $decodedSplit;
            }
        }

        return [
            'id' => $bId,
            'bookingId' => $bId,
            'bookingNumber' => $bNum,
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
            'hubId' => $hubAttr['reporting_hub_id'] ?: null,
            'hub_id' => $hubAttr['reporting_hub_id'] ?: null,
            'pickupHubId' => $hubAttr['pickup_hub_id'] ?: null,
            'dropHubId' => $hubAttr['drop_hub_id'] ?: null,
            'reportingHubId' => $hubAttr['reporting_hub_id'] ?: null,
            'pickupHubName' => $b['pickup_hub_name'] ?? ($hubAttr['pickup_hub_id'] ? $hubAttr['pickup_hub_name'] : null),
            'dropHubName' => $b['drop_hub_name'] ?? ($hubAttr['drop_hub_id'] ? $hubAttr['drop_hub_name'] : null),
            'reportingHubName' => $hubAttr['reporting_hub_name'],
            'isCrossHubReturn' => $hubAttr['is_cross_hub_return'],
            'pickupDate' => $b['pickup_date'],
            'dropDate' => $b['drop_date'],
            'duration' => $b['duration'],
            'days' => $dates['days'],
            'hours' => $dates['hours'],
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
            'paymentAmountPaid' => $fin['verified_collected'],
            'netCollections' => $fin['net_collections'],
            'refundAmount' => $fin['refund_amount'],
            'refundStatus' => $b['refund_status'] ?? ($fin['refund_amount'] > 0 ? 'refunded' : 'none'),
            'outstandingAmount' => $fin['outstanding_amount'],
            'remainingBalance' => $fin['outstanding_amount'],
            'securityDeposit' => $fin['security_deposit'],
            'couponCode' => $b['coupon_code'],
            'couponDiscount' => $fin['coupon_discount'],
            'paymentPlan' => $b['payment_plan'],
            'paymentStatus' => $b['payment_status'],
            'isCancelled' => $fin['is_cancelled'],
            'isPaid' => $fin['is_paid'],
            'hasPendingVerification' => $fin['has_pending_verification'],
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
            'monthlyRevenueSplit' => $split,
            'monthly_revenue_split' => $split,
            'createdAt' => $b['created_at'],
            'updatedAt' => $b['updated_at']
        ];
    }, $rows);

    sendJsonResponse(['success' => true, 'count' => count($bookings), 'bookings' => $bookings]);
}

sendErrorResponse('Method not allowed.', 405);
