<?php
/**
 * api/bookings/cancel.php
 * POST /api/bookings/:id/cancel - Transactional cancellation, refund, coupon release & fleet release
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

// Extract booking identifier from GET or request body
$bookingId = trim((string)($_GET['id'] ?? $_GET['bookingId'] ?? ''));
$rawBody = (string)file_get_contents('php://input');
$bodyData = json_decode($rawBody, true);
$input = is_array($bodyData) ? $bodyData : $_POST;

if (!$bookingId) {
    $bookingId = trim((string)($input['bookingId'] ?? $input['id'] ?? $input['bookingNumber'] ?? ''));
}

if (!$bookingId) {
    if (preg_match('#bookings/([^/]+)/cancel#i', $_SERVER['REQUEST_URI'] ?? '', $m)) {
        $bookingId = trim(urldecode($m[1]));
    }
}

if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager'], true);

// Fetch booking matching booking_id, booking_number, or primary key id
$cleanId = trim(ltrim($bookingId, '#'));
$booking = Database::fetchOne(
    "SELECT * FROM bookings 
     WHERE booking_id = ? 
        OR booking_number = ? 
        OR id = ? 
        OR booking_id = ? 
        OR booking_number = ? 
        OR UPPER(COALESCE(booking_id, '')) = UPPER(?) 
        OR UPPER(COALESCE(booking_number, '')) = UPPER(?) 
        OR UPPER(COALESCE(booking_id, '')) = UPPER(?) 
        OR UPPER(COALESCE(booking_number, '')) = UPPER(?) 
     LIMIT 1",
    [$bookingId, $bookingId, is_numeric($bookingId) ? (int)$bookingId : 0, $cleanId, $cleanId, $bookingId, $bookingId, $cleanId, $cleanId]
);

if (!$booking) {
    sendErrorResponse("Booking '$bookingId' not found.", 400);
}

if (!$isStaff && ($booking['firebase_uid'] ?? '') !== ($user['firebase_uid'] ?? '')) {
    sendErrorResponse('You do not have permission to cancel this booking.', 403);
}

$bid = $booking['booking_id'] ?: ($booking['booking_number'] ?: (string)$booking['id']);
$bNum = $booking['booking_number'] ?? '';

// Idempotent: return success if already cancelled
if (in_array(strtolower($booking['status'] ?? ''), ['cancelled', 'rejected'], true) || strtolower($booking['payment_status'] ?? '') === 'refunded') {
    sendJsonResponse([
        'success' => true,
        'message' => "Booking {$bid} is already cancelled and marked as refunded.",
        'alreadyCancelled' => true,
        'refundAmount' => (float)($booking['payment_amount_paid'] ?? $booking['advance_amount'] ?? $booking['final_amount'] ?? 0.0)
    ]);
}

// Auto-heal table columns outside transaction to prevent implicit commit
try { Database::execute("ALTER TABLE bookings ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER status"); } catch (Throwable $_) {}
try { Database::execute("ALTER TABLE bookings ADD COLUMN refund_status VARCHAR(64) DEFAULT 'refunded' AFTER payment_status"); } catch (Throwable $_) {}
try { Database::execute("ALTER TABLE payments ADD COLUMN refund_amount DECIMAL(10,2) DEFAULT 0.00"); } catch (Throwable $_) {}
try { Database::execute("ALTER TABLE payments ADD COLUMN refund_reason VARCHAR(255) NULL"); } catch (Throwable $_) {}

$reason = trim((string)($input['reason'] ?? $input['cancellationReason'] ?? 'Personal Issue / Schedule Change'));
$bid = $booking['booking_id'] ?: ($booking['booking_number'] ?: (string)$booking['id']);
$bNum = $booking['booking_number'] ?? '';

// Determine refund amount accurately
$paymentRow = Database::fetchOne(
    "SELECT amount FROM payments WHERE booking_id = ? OR booking_id = ? ORDER BY id DESC LIMIT 1",
    [$bid, $bNum]
);
$refundAmount = $paymentRow ? (float)$paymentRow['amount'] : (float)($booking['payment_amount_paid'] ?? $booking['advance_amount'] ?? $booking['final_amount'] ?? $booking['total_amount'] ?? 0.0);

try {
    Database::transaction(function($pdo) use ($booking, $bid, $bNum, $reason, $refundAmount) {
        // 1. Update booking
        $pdo->prepare(
            "UPDATE bookings SET
                status = 'cancelled',
                booking_status = 'cancelled',
                payment_status = 'refunded',
                refund_status = 'refunded',
                cancellation_reason = ?,
                remaining_balance = 0.00,
                remaining_amount = 0.00,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ? OR booking_id = ? OR booking_number = ?"
        )->execute([$reason, $booking['id'], $bid, $bNum]);

        // 2. Update payment records
        $pdo->prepare(
            "UPDATE payments SET
                status = 'refunded',
                refund_amount = ?,
                refund_reason = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE booking_id = ? OR booking_id = ?"
        )->execute([$refundAmount, $reason, $bid, $bNum]);

        // 3. Free up vehicle availability
        $vehicleReg = $booking['vehicle_reg'] ?? '';
        if (!empty($vehicleReg)) {
            $pdo->prepare(
                "UPDATE vehicles SET available = 1, status = 'available', updated_at = CURRENT_TIMESTAMP WHERE reg_no = ?"
            )->execute([$vehicleReg]);
        }

        // 4. Release coupon usage
        if (!empty($booking['coupon_code'])) {
            $pdo->prepare("DELETE FROM coupon_usage WHERE booking_id = ? OR booking_id = ?")->execute([$bid, $bNum]);
            $pdo->prepare("UPDATE coupons SET used_count = GREATEST(0, used_count - 1) WHERE code = ?")->execute([$booking['coupon_code']]);
        }

        // 5. Update invoice
        $pdo->prepare(
            "UPDATE invoices SET status = 'cancelled', balance_due = 0.00, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ? OR booking_id = ?"
        )->execute([$bid, $bNum]);
    });

    // Automated KPI metrics sync into MySQL kpi_metrics table
    try {
        require_once __DIR__ . '/../services/KpiService.php';
        KpiService::syncMetrics();
    } catch (Throwable $_) {}

    sendJsonResponse([
        'success' => true,
        'message' => "Booking {$bid} cancelled. Status marked as Refunded and fleet inventory released.",
        'refundAmount' => $refundAmount
    ]);
} catch (Exception $e) {
    error_log("[Booking Cancel Error] " . $e->getMessage());
    sendErrorResponse('Failed to cancel booking: ' . $e->getMessage(), 500);
}
