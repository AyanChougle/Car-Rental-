<?php
/**
 * api/bookings/detail.php
 * GET / PUT / POST /api/bookings/:id
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';

$bookingId = trim((string)($_GET['id'] ?? $_GET['bookingId'] ?? ''));
if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'super_admin', 'manager', 'executive', 'accountant', 'accounts'], true);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $b = Database::fetchOne(
        "SELECT b.*, v.hub_id AS v_hub_id
         FROM bookings b
         LEFT JOIN vehicles v ON (
             (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND v.id = b.vehicle_id)
             OR (b.vehicle_reg IS NOT NULL AND TRIM(b.vehicle_reg) <> '' AND b.vehicle_reg <> 'TBD' AND v.reg_no = b.vehicle_reg)
         )
         WHERE b.booking_id = ? OR b.booking_number = ? OR b.id = ? LIMIT 1",
        [$bookingId, $bookingId, $bookingId]
    );

    if (!$b) {
        sendErrorResponse("Booking '$bookingId' not found.", 404);
    }

    if (!$isStaff && $b['firebase_uid'] !== $user['firebase_uid']) {
        sendErrorResponse('Access denied.', 403);
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
                  in_array($b['status'], ['active', 'in_trip', 'completed'], true) ||
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

    $registeredHubs = KpiService::getRegisteredHubsMap();
    $hubAttr = KpiService::resolveHubAttribution($b, $registeredHubs);
    $paymentData = KpiService::loadDeduplicatedPayments();
    $paymentsByBooking = $paymentData['by_booking'] ?? [];
    $bkKey1 = strtoupper(ltrim((string)($b['booking_id'] ?? ''), '#'));
    $bkKey2 = strtoupper(ltrim((string)($b['booking_number'] ?? ''), '#'));
    $pAgg = $paymentsByBooking[$bkKey1] ?? ($paymentsByBooking[$bkKey2] ?? []);
    $fin = KpiService::computeBookingFinancials($b, $pAgg);
    $dates = KpiService::getBookingDates($b);
    $split = KpiService::calculateMonthlyRevenueSplit($b, $fin);

    $pickupHubName = $hubAttr['pickup_hub_id'] ? $hubAttr['pickup_hub_name'] : null;
    $dropHubName = $hubAttr['drop_hub_id'] ? $hubAttr['drop_hub_name'] : null;

    sendJsonResponse([
        'success' => true,
        'booking' => [
            'pickupHubId' => $hubAttr['pickup_hub_id'] ?: null,
            'dropHubId' => $hubAttr['drop_hub_id'] ?: null,
            'reportingHubId' => $hubAttr['reporting_hub_id'] ?: null,
            'pickupHubName' => $pickupHubName,
            'dropHubName' => $dropHubName ?: $pickupHubName,
            'reportingHubName' => $hubAttr['reporting_hub_name'],
            'isCrossHubReturn' => $hubAttr['is_cross_hub_return'],
            'pickupLocation' => $pickupHubName ?: ($b['location'] ?? null),
            'dropLocation' => $dropHubName ?: $pickupHubName ?: ($b['location'] ?? null),
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
            'status' => $b['status'],
            'bookingStatus' => $b['booking_status'],
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
        ]
    ]);
}

if ($method === 'PUT' || $method === 'POST') {
    Auth::requireRole('admin', 'super_admin', 'manager', 'executive');
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    $existing = Database::fetchOne(
        "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? OR id = ? LIMIT 1",
        [$bookingId, $bookingId, $bookingId]
    );

    if (!$existing) {
        sendErrorResponse("Booking '$bookingId' not found.", 404);
    }

    $existingInspection = [];
    if (!empty($existing['return_inspection'])) {
        $existingInspection = is_string($existing['return_inspection'])
            ? json_decode($existing['return_inspection'], true)
            : $existing['return_inspection'];
        if (!is_array($existingInspection)) {
            $existingInspection = [];
        }
    }

    $updates = [];
    $params = [];

    // Vehicle info updates
    if (isset($input['vehicleName'])) {
        $updates[] = "vehicle_name = ?";
        $params[] = (string)$input['vehicleName'];
    }
    if (isset($input['vehicleReg'])) {
        $vReg = trim((string)$input['vehicleReg']);
        $updates[] = "vehicle_reg = ?";
        $params[] = $vReg;

        if ($vReg !== '' && $vReg !== 'TBD') {
            try {
                $vRow = Database::fetchOne("SELECT id, brand, model, category FROM vehicles WHERE reg_no = ? LIMIT 1", [$vReg]);
                if ($vRow) {
                    $updates[] = "vehicle_id = ?";
                    $params[] = (int)$vRow['id'];
                    if (empty($input['vehicleName'])) {
                        $updates[] = "vehicle_name = ?";
                        $params[] = trim($vRow['brand'] . ' ' . $vRow['model']);
                    }
                    if (empty($input['vehicleCategory'])) {
                        $updates[] = "vehicle_category = ?";
                        $params[] = (string)$vRow['category'];
                    }
                }
            } catch (Throwable $_) {}
        }
    }
    if (isset($input['vehicleCategory'])) {
        $updates[] = "vehicle_category = ?";
        $params[] = (string)$input['vehicleCategory'];
    }

    // Status updates
    $newStatus = $input['status'] ?? $input['bookingStatus'] ?? null;
    $pickupStatusVal = $input['pickupStatus'] ?? null;

    if ($pickupStatusVal === 'picked_up' && !$newStatus) {
        $newStatus = 'active';
    }

    if ($newStatus) {
        $updates[] = "status = ?";
        $updates[] = "booking_status = ?";
        $params[] = (string)$newStatus;
        $params[] = (string)$newStatus;
    }

    // Pickup timestamp & handler
    if (isset($input['pickupAt']) || $pickupStatusVal === 'picked_up') {
        $pickupAtVal = !empty($input['pickupAt']) ? date('Y-m-d H:i:s', strtotime((string)$input['pickupAt'])) : date('Y-m-d H:i:s');
        $updates[] = "pickup_at = ?";
        $params[] = $pickupAtVal;
        $existingInspection['pickupAt'] = $pickupAtVal;
    }
    if (isset($input['pickupHandledBy'])) {
        $updates[] = "pickup_handled_by = ?";
        $params[] = (string)$input['pickupHandledBy'];
        $existingInspection['pickupHandledBy'] = (string)$input['pickupHandledBy'];
    }

    if (isset($input['paymentStatus'])) {
        $updates[] = "payment_status = ?";
        $params[] = (string)$input['paymentStatus'];
    }
    if (isset($input['paymentPlan'])) {
        $updates[] = "payment_plan = ?";
        $params[] = (string)$input['paymentPlan'];
    }
    if (isset($input['paymentRef'])) {
        $updates[] = "payment_ref = ?";
        $params[] = (string)$input['paymentRef'];
    }
    if (isset($input['paymentAmountPaid'])) {
        $updates[] = "payment_amount_paid = ?";
        $params[] = (float)$input['paymentAmountPaid'];
    }
    if (isset($input['advanceAmount'])) {
        $updates[] = "advance_amount = ?";
        $params[] = (float)$input['advanceAmount'];
    }
    if (isset($input['remainingBalance']) || isset($input['remainingAmount'])) {
        $updates[] = "remaining_balance = ?";
        $params[] = (float)($input['remainingBalance'] ?? $input['remainingAmount']);
    }

    // Odometers and FASTag
    if (isset($input['startOdometer']) || isset($input['pickupOdometer']) || isset($input['odometerStart'])) {
        $val = (string)($input['startOdometer'] ?? $input['pickupOdometer'] ?? $input['odometerStart']);
        $updates[] = "start_odometer = ?";
        $params[] = $val;
        $existingInspection['pickupOdometer'] = $val;
    }
    if (isset($input['endOdometer']) || isset($input['returnOdometer']) || isset($input['odometerEnd'])) {
        $val = (string)($input['endOdometer'] ?? $input['returnOdometer'] ?? $input['odometerEnd']);
        $updates[] = "end_odometer = ?";
        $params[] = $val;
        $existingInspection['returnOdometer'] = $val;
    }
    if (isset($input['startFastag']) || isset($input['pickupFastagBalance']) || isset($input['fastagStart'])) {
        $val = (string)($input['startFastag'] ?? $input['pickupFastagBalance'] ?? $input['fastagStart']);
        $updates[] = "start_fastag = ?";
        $params[] = $val;
        $existingInspection['pickupFastagBalance'] = $val;
    }
    if (isset($input['returnFastag']) || isset($input['returnFastagBalance']) || isset($input['fastagReturn'])) {
        $val = (string)($input['returnFastag'] ?? $input['returnFastagBalance'] ?? $input['fastagReturn']);
        $updates[] = "return_fastag = ?";
        $params[] = $val;
        $existingInspection['returnFastagBalance'] = $val;
    }

    // Inspection merge
    if (isset($input['pickupStatus'])) {
        $existingInspection['pickupStatus'] = (string)$input['pickupStatus'];
    }
    if (isset($input['pickupNotes'])) {
        $existingInspection['pickupNotes'] = (string)$input['pickupNotes'];
    }
    if (isset($input['pickupFuelLevel']) || isset($input['fuelLevel'])) {
        $existingInspection['pickupFuelLevel'] = (string)($input['pickupFuelLevel'] ?? $input['fuelLevel']);
    }
    if (isset($input['pickupPhotoMediaIds']) && is_array($input['pickupPhotoMediaIds'])) {
        $existingInspection['pickupPhotoMediaIds'] = $input['pickupPhotoMediaIds'];
    }
    if (isset($input['pickupPhotos']) && is_array($input['pickupPhotos'])) {
        $existingInspection['pickupPhotos'] = $input['pickupPhotos'];
    }
    if (isset($input['returnInspection'])) {
        $incomingInsp = is_array($input['returnInspection']) ? $input['returnInspection'] : json_decode((string)$input['returnInspection'], true);
        if (is_array($incomingInsp)) {
            $existingInspection = array_merge($existingInspection, $incomingInsp);
        }
    }
    if (isset($input['damagePhotos']) && is_array($input['damagePhotos'])) {
        $existingInspection['returnPhotoMediaIds'] = $input['damagePhotos'];
    }
    if (isset($input['returnNotes']) || isset($input['invoiceNotes'])) {
        $existingInspection['invoiceNotes'] = (string)($input['returnNotes'] ?? $input['invoiceNotes']);
    }
    if (isset($input['totalDeductions'])) {
        $existingInspection['totalDeductions'] = (float)$input['totalDeductions'];
    }
    if (isset($input['refundableAmount'])) {
        $existingInspection['refundableAmount'] = (float)$input['refundableAmount'];
    }
    if (isset($input['returnedAt']) || isset($input['completedAt'])) {
        $existingInspection['completedAt'] = (string)($input['returnedAt'] ?? $input['completedAt']);
    }
    if (isset($input['returnedBy']) || isset($input['inspectedBy'])) {
        $existingInspection['inspectedBy'] = (string)($input['returnedBy'] ?? $input['inspectedBy']);
    }

    // Date & Timeline updates (strict validation using Unified Date Engine; never turns invalid dates into 24h)
    $hasPickupEdit = isset($input['pickupDate']) || isset($input['pickup_date']);
    $hasDropEdit = isset($input['dropDate']) || isset($input['drop_date']) || isset($input['returnDate']);
    if ($hasPickupEdit || $hasDropEdit) {
        $candPickup = $hasPickupEdit ? ($input['pickupDate'] ?? $input['pickup_date']) : ($existing['pickup_date'] ?? null);
        $candDrop = $hasDropEdit ? ($input['dropDate'] ?? $input['drop_date'] ?? $input['returnDate']) : ($existing['drop_date'] ?? null);
        $expDays = isset($input['days']) && is_numeric($input['days']) && (int)$input['days'] > 0
            ? (int)$input['days']
            : null;

        $dateVal = KpiService::validateBookingDates($candPickup, $candDrop, true, $expDays);
        if (empty($dateVal['valid'])) {
            sendErrorResponse((string)($dateVal['error'] ?? 'Invalid pickup or return date/time.'), 400);
        }

        $updates[] = "pickup_date = ?";
        $params[] = (string)$dateVal['pickup_sql'];
        $updates[] = "drop_date = ?";
        $params[] = (string)$dateVal['drop_sql'];
        $updates[] = "days = ?";
        $params[] = (int)$dateVal['days'];
        $updates[] = "hours = ?";
        $params[] = (int)$dateVal['hours'];
        $updates[] = "duration = ?";
        $params[] = (string)$dateVal['duration'];
    } else {
        if (isset($input['days'])) {
            $dInt = (int)$input['days'];
            if ($dInt <= 0) {
                sendErrorResponse('Booking days must be at least 1.', 400);
            }
            $updates[] = "days = ?";
            $params[] = $dInt;
        }
        if (isset($input['hours'])) {
            $hInt = (int)$input['hours'];
            if ($hInt <= 0) {
                sendErrorResponse('Booking hours must be greater than 0.', 400);
            }
            $updates[] = "hours = ?";
            $params[] = $hInt;
        }
        if (isset($input['duration'])) {
            $updates[] = "duration = ?";
            $params[] = (string)$input['duration'];
        }
    }

    // Validate hub edits strictly against DB registered hubs if supplied
    if (isset($input['pickup_hub_id']) || isset($input['pickupHubId'])) {
        $newPHub = (int)($input['pickup_hub_id'] ?? $input['pickupHubId']);
        $registeredHubs = KpiService::getRegisteredHubsMap();
        if ($newPHub > 0 && !isset($registeredHubs[$newPHub])) {
            sendErrorResponse("Invalid pickup hub ID ($newPHub).", 400);
        }
        $updates[] = "pickup_hub_id = ?";
        $params[] = $newPHub > 0 ? $newPHub : null;
    }
    if (isset($input['drop_hub_id']) || isset($input['dropHubId'])) {
        $newDHub = (int)($input['drop_hub_id'] ?? $input['dropHubId']);
        $registeredHubs = KpiService::getRegisteredHubsMap();
        if ($newDHub > 0 && !isset($registeredHubs[$newDHub])) {
            sendErrorResponse("Invalid return hub ID ($newDHub).", 400);
        }
        $updates[] = "drop_hub_id = ?";
        $params[] = $newDHub > 0 ? $newDHub : null;
    }
    if (isset($input['location'])) {
        $updates[] = "location = ?";
        $params[] = (string)$input['location'];
    }

    // Customer info updates
    if (isset($input['userName']) || isset($input['user_name'])) {
        $updates[] = "user_name = ?";
        $params[] = (string)($input['userName'] ?? $input['user_name']);
    }
    if (isset($input['userEmail']) || isset($input['user_email'])) {
        $updates[] = "user_email = ?";
        $params[] = (string)($input['userEmail'] ?? $input['user_email']);
    }
    if (isset($input['userPhone']) || isset($input['user_phone'])) {
        $updates[] = "user_phone = ?";
        $params[] = (string)($input['userPhone'] ?? $input['user_phone']);
    }
    // Financials updates (security deposit strictly excluded from net rental total)
    $existingCols = [];
    try {
        foreach (Database::fetchAll("SHOW COLUMNS FROM bookings") as $colRow) {
            $existingCols[strtolower((string)$colRow['Field'])] = true;
        }
    } catch (Throwable $_) {}

    $depositVal = isset($input['securityDeposit']) || isset($input['security_deposit'])
        ? max(0.0, round((float)($input['securityDeposit'] ?? $input['security_deposit']), 2))
        : (float)($existing['security_deposit'] ?? 0.0);
    if (isset($input['securityDeposit']) || isset($input['security_deposit'])) {
        $updates[] = "security_deposit = ?";
        $params[] = $depositVal;
    }

    $hasBaseInput = isset($input['baseAmount']) || isset($input['base_amount']);
    $hasDriverInput = isset($input['driverCharges']) || isset($input['driver_charges']);
    $hasExtraInput = isset($input['extraCharges']) || isset($input['extra_charges']);
    $hasDiscInput = isset($input['couponDiscount']) || isset($input['coupon_discount']);
    $hasTotalInput = isset($input['totalAmount']) || isset($input['total_amount']);

    $driverVal = $hasDriverInput
        ? max(0.0, round((float)($input['driverCharges'] ?? $input['driver_charges']), 2))
        : max(0.0, round((float)($existing['driver_charges'] ?? 0.0), 2));
    $extraVal = $hasExtraInput
        ? max(0.0, round((float)($input['extraCharges'] ?? $input['extra_charges']), 2))
        : max(0.0, round((float)($existing['extra_charges'] ?? 0.0), 2));
    $discVal = $hasDiscInput
        ? max(0.0, round((float)($input['couponDiscount'] ?? $input['coupon_discount']), 2))
        : max(0.0, round((float)($existing['coupon_discount'] ?? 0.0), 2));

    if ($hasDriverInput && isset($existingCols['driver_charges'])) {
        $updates[] = "driver_charges = ?";
        $params[] = $driverVal;
    }
    if ($hasExtraInput && isset($existingCols['extra_charges'])) {
        $updates[] = "extra_charges = ?";
        $params[] = $extraVal;
    }
    if ($hasDiscInput) {
        $updates[] = "coupon_discount = ?";
        $params[] = $discVal;
    }

    $baseAmt = $hasBaseInput
        ? max(0.0, round((float)($input['baseAmount'] ?? $input['base_amount']), 2))
        : max(0.0, round((float)($existing['base_amount'] ?? 0.0), 2));

    if ($hasBaseInput) {
        $updates[] = "base_amount = ?";
        $params[] = $baseAmt;
    } elseif ($hasTotalInput) {
        $tot = max(0.0, round((float)($input['totalAmount'] ?? $input['total_amount']), 2));
        $baseAmt = max(0.0, round($tot + $discVal - $driverVal - $extraVal, 2));
        $updates[] = "base_amount = ?";
        $params[] = $baseAmt;
    }

    if ($hasTotalInput || $hasBaseInput || $hasDriverInput || $hasExtraInput || $hasDiscInput) {
        $netTotal = $hasTotalInput
            ? max(0.0, round((float)($input['totalAmount'] ?? $input['total_amount']), 2))
            : max(0.0, round($baseAmt + $driverVal + $extraVal - $discVal, 2));
        $updates[] = "total_amount = ?";
        $updates[] = "final_amount = ?";
        $params[] = $netTotal;
        $params[] = $netTotal;
    }

    if ($newStatus && in_array(strtolower((string)$newStatus), ['cancelled', 'rejected'], true)) {
        if (!isset($input['paymentStatus']) && max(0.0, (float)($existing['payment_amount_paid'] ?? 0.0)) <= 0.0) {
            $updates[] = "payment_status = ?";
            $params[] = "cancelled";
        }
        $updates[] = "remaining_balance = ?";
        $params[] = 0.00;
        if (isset($existingCols['remaining_amount'])) {
            $updates[] = "remaining_amount = ?";
            $params[] = 0.00;
        }
        try {
            $canonId = $existing['booking_id'] ?: ($existing['booking_number'] ?: (string)$existing['id']);
            Database::execute(
                "UPDATE payments SET status = 'rejected', refund_reason = 'Voided when booking marked cancelled', updated_at = CURRENT_TIMESTAMP WHERE (booking_id = ? OR booking_id = ?) AND status = 'pending'",
                [$canonId, (string)($existing['booking_number'] ?? $canonId)]
            );
        } catch (Throwable $_) {}
    }

    $updates[] = "return_inspection = ?";
    $params[] = json_encode($existingInspection);

    if (!empty($updates)) {
        require_once __DIR__ . '/../services/KpiService.php';
        $params[] = $bookingId;
        $params[] = $bookingId;
        $params[] = $bookingId;
        Database::execute(
            "UPDATE bookings SET " . implode(', ', $updates) . ", updated_at = CURRENT_TIMESTAMP WHERE booking_id = ? OR booking_number = ? OR id = ?",
            $params
        );

        $updated = Database::fetchOne(
            "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? OR id = ? LIMIT 1",
            [$bookingId, $bookingId, $bookingId]
        );

        if ($updated) {
            // Update monthly_revenue_split on updated booking
            try {
                $split = KpiService::calculateMonthlyRevenueSplit($updated);
                Database::execute(
                    "UPDATE bookings SET monthly_revenue_split = ? WHERE id = ?",
                    [json_encode($split), (int)$updated['id']]
                );
            } catch (Throwable $_) {}
        }
    }

    // Automated KPI metrics sync into MySQL via delta-aware sync (preserves manual DB edits)
    try {
        require_once __DIR__ . '/../services/KpiService.php';
        KpiService::syncMetrics(true, false);
    } catch (Throwable $_) {}

    // Dispatch approval or cancellation email & WhatsApp notification
    $notificationResult = null;
    if ($newStatus === 'confirmed' || !empty($input['sendApprovalNotification'])) {
        try {
            require_once __DIR__ . '/../services/BookingNotificationService.php';
            $notificationResult = BookingNotificationService::sendBookingApprovalNotification($bookingId);
        } catch (Throwable $t) {
            error_log("[Approval Notification Warning] " . $t->getMessage());
        }
    } elseif ($newStatus === 'cancelled' || $newStatus === 'rejected') {
        try {
            require_once __DIR__ . '/../services/BookingNotificationService.php';
            $reason = trim((string)($input['cancellationReason'] ?? $input['cancellation_reason'] ?? $input['reason'] ?? ''));
            $notificationResult = BookingNotificationService::sendBookingCancellationNotification($bookingId, $reason);
        } catch (Throwable $t) {
            error_log("[Cancellation Notification Warning] " . $t->getMessage());
        }
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'Booking updated successfully.',
        'notification' => $notificationResult
    ]);
}

if ($method === 'DELETE') {
    if (!$isStaff) {
        sendErrorResponse('Access denied. Staff only.', 403);
    }

    Database::execute(
        "DELETE FROM bookings WHERE booking_id = ? OR booking_number = ? OR id = ?",
        [$bookingId, $bookingId, $bookingId]
    );
    // Also clean up any associated payment records if needed
    try {
        Database::execute(
            "DELETE FROM payments WHERE booking_id = ? OR booking_id = (SELECT booking_id FROM bookings WHERE id = ? LIMIT 1)",
            [$bookingId, $bookingId]
        );
    } catch (\Throwable $e) {}

    // Automated KPI metrics sync into MySQL via delta-aware sync (preserves manual DB edits)
    try {
        require_once __DIR__ . '/../services/KpiService.php';
        KpiService::syncMetrics(true, false);
    } catch (Throwable $_) {}

    sendJsonResponse(['success' => true, 'message' => "Booking '$bookingId' removed successfully."]);
}

sendErrorResponse('Method not allowed.', 405);
