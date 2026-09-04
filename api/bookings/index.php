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
        if ($b['payment_status'] === 'rejected' && ($status === 'pending_verification' || $status === 'pending_payment')) {
            $status = 'cancelled';
        }

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
            'bookingStatus' => $status,
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
        ];
    }, $rows);

    sendJsonResponse(['success' => true, 'count' => count($bookings), 'bookings' => $bookings]);
}

sendErrorResponse('Method not allowed.', 405);
