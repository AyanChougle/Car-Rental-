<?php
/**
 * api/bookings/cancel.php
 * POST /api/bookings/:id/cancel - Transactional cancellation, refund, coupon release & fleet release
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$bookingId = trim((string)($_GET['id'] ?? $_GET['bookingId'] ?? ''));
if (!$bookingId) {
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
    $bookingId = trim((string)($input['bookingId'] ?? ''));
}

if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager'], true);

$booking = Database::fetchOne(
    "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
    [$bookingId, $bookingId]
);

if (!$booking) {
    sendErrorResponse("Booking '$bookingId' not found.", 404);
}

if (!$isStaff && $booking['firebase_uid'] !== $user['firebase_uid']) {
    sendErrorResponse('You do not have permission to cancel this booking.', 403);
}

try {
    Database::transaction(function($pdo) use ($booking, $user) {
        $bid = $booking['booking_id'];
        $refundAmount = (float)($booking['payment_amount_paid'] ?: $booking['advance_amount'] ?: $booking['total_amount'] ?: 0.00);

        // 1. Update booking
        $pdo->prepare(
            "UPDATE bookings SET
                status = 'cancelled',
                booking_status = 'cancelled',
                payment_status = 'refunded',
                remaining_balance = 0.00,
                remaining_amount = 0.00,
                updated_at = CURRENT_TIMESTAMP
             WHERE booking_id = ?"
        )->execute([$bid]);

        // 2. Update/insert payment record
        $pdo->prepare(
            "UPDATE payments SET
                status = 'refunded',
                refund_amount = ?,
                refund_reason = 'Booking cancelled by user/admin',
                updated_at = CURRENT_TIMESTAMP
             WHERE booking_id = ?"
        )->execute([$refundAmount, $bid]);

        // 3. Free up vehicle availability
        if (!empty($booking['vehicle_reg'])) {
            $pdo->prepare(
                "UPDATE vehicles SET available = 1, status = 'available', updated_at = CURRENT_TIMESTAMP WHERE reg_no = ?"
            )->execute([$booking['vehicle_reg']]);
        }

        // 4. Release coupon usage
        if (!empty($booking['coupon_code'])) {
            $pdo->prepare("DELETE FROM coupon_usage WHERE booking_id = ?")->execute([$bid]);
            $pdo->prepare("UPDATE coupons SET used_count = GREATEST(0, used_count - 1) WHERE code = ?")->execute([$booking['coupon_code']]);
        }

        // 5. Update invoice
        $pdo->prepare("UPDATE invoices SET status = 'cancelled', balance_due = 0.00, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?")->execute([$bid]);
    });

    sendJsonResponse([
        'success' => true,
        'message' => "Booking $bookingId cancelled. Status marked as Refunded and fleet inventory released."
    ]);
} catch (Exception $e) {
    error_log("[Booking Cancel Error] " . $e->getMessage());
    sendErrorResponse('Failed to cancel booking: ' . $e->getMessage(), 500);
}
