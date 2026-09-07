<?php
/**
 * api/bookings/detail.php
 * GET / PUT / POST /api/bookings/:id
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$bookingId = trim((string)($_GET['id'] ?? $_GET['bookingId'] ?? ''));
if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $b = Database::fetchOne(
        "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
        [$bookingId, $bookingId]
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

    sendJsonResponse([
        'success' => true,
        'booking' => [
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
            'createdAt' => $b['created_at'],
            'updatedAt' => $b['updated_at']
        ]
    ]);
}

if ($method === 'PUT' || $method === 'POST') {
    Auth::requireRole('admin', 'manager', 'executive');
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

    $existing = Database::fetchOne(
        "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
        [$bookingId, $bookingId]
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
        $updates[] = "vehicle_reg = ?";
        $params[] = (string)$input['vehicleReg'];
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

    $updates[] = "return_inspection = ?";
    $params[] = json_encode($existingInspection);

    if (!empty($updates)) {
        $params[] = $bookingId;
        $params[] = $bookingId;
        Database::execute(
            "UPDATE bookings SET " . implode(', ', $updates) . ", updated_at = CURRENT_TIMESTAMP WHERE booking_id = ? OR booking_number = ?",
            $params
        );
    }

    sendJsonResponse(['success' => true, 'message' => 'Booking updated successfully.']);
}

sendErrorResponse('Method not allowed.', 405);
