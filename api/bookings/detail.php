<?php
/**
 * api/bookings/detail.php
 * GET / PUT /api/bookings/:id
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
    }

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
            'startOdometer' => $b['start_odometer'],
            'endOdometer' => $b['end_odometer'],
            'startFastag' => $b['start_fastag'],
            'returnFastag' => $b['return_fastag'],
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

    $updates = [];
    $params = [];

    if (isset($input['status'])) {
        $updates[] = "status = ?";
        $updates[] = "booking_status = ?";
        $params[] = (string)$input['status'];
        $params[] = (string)$input['status'];
    }
    if (isset($input['paymentStatus'])) {
        $updates[] = "payment_status = ?";
        $params[] = (string)$input['paymentStatus'];
    }
    if (isset($input['startOdometer']) || isset($input['odometerStart'])) {
        $updates[] = "start_odometer = ?";
        $params[] = (string)($input['startOdometer'] ?? $input['odometerStart']);
    }
    if (isset($input['endOdometer']) || isset($input['odometerEnd'])) {
        $updates[] = "end_odometer = ?";
        $params[] = (string)($input['endOdometer'] ?? $input['odometerEnd']);
    }
    if (isset($input['startFastag']) || isset($input['fastagStart'])) {
        $updates[] = "start_fastag = ?";
        $params[] = (string)($input['startFastag'] ?? $input['fastagStart']);
    }
    if (isset($input['returnFastag']) || isset($input['fastagReturn'])) {
        $updates[] = "return_fastag = ?";
        $params[] = (string)($input['returnFastag'] ?? $input['fastagReturn']);
    }
    if (isset($input['returnInspection'])) {
        $updates[] = "return_inspection = ?";
        $params[] = is_array($input['returnInspection']) ? json_encode($input['returnInspection']) : (string)$input['returnInspection'];
    }

    if ($updates) {
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
