<?php
/**
 * api/bookings/cancel.php
 * POST /api/bookings/:id/cancel - Transactional cancellation, refund, coupon release & fleet release
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';

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
$isStaff = in_array($user['role'] ?? '', ['admin', 'super_admin', 'manager', 'executive'], true);

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
    sendErrorResponse("Booking '$bookingId' not found.", 404);
}

if (!$isStaff && ($booking['firebase_uid'] ?? '') !== ($user['firebase_uid'] ?? '')) {
    sendErrorResponse('You do not have permission to cancel this booking.', 403);
}

$bid = $booking['booking_id'] ?: ($booking['booking_number'] ?: (string)$booking['id']);
$bNum = $booking['booking_number'] ?: $bid;

// Idempotent: return success if already cancelled
if (in_array(strtolower($booking['status'] ?? ''), ['cancelled', 'rejected'], true) || strtolower($booking['payment_status'] ?? '') === 'refunded') {
    $paymentData = KpiService::loadDeduplicatedPayments();
    $pAgg = $paymentData['by_booking'][strtoupper(ltrim($bid, '#'))] ?? ($paymentData['by_booking'][strtoupper(ltrim($bNum, '#'))] ?? []);
    $fin = KpiService::computeBookingFinancials($booking, $pAgg);
    sendJsonResponse([
        'success' => true,
        'message' => "Booking {$bid} is already cancelled.",
        'alreadyCancelled' => true,
        'refundAmount' => (float)$fin['refund_amount'],
        'verifiedCollected' => (float)$fin['verified_collected'],
    ]);
}

// Auto-heal table columns outside transaction cleanly with safe defaults
try { Database::execute("ALTER TABLE bookings ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER status"); } catch (Throwable $_) {}
try { Database::execute("ALTER TABLE bookings ADD COLUMN refund_status VARCHAR(64) DEFAULT 'none' AFTER payment_status"); } catch (Throwable $_) {}
try { Database::execute("ALTER TABLE bookings ADD COLUMN refund_amount DECIMAL(10,2) DEFAULT 0.00 AFTER payment_amount_paid"); } catch (Throwable $_) {}
try { Database::execute("ALTER TABLE payments ADD COLUMN refund_amount DECIMAL(10,2) DEFAULT 0.00"); } catch (Throwable $_) {}
try { Database::execute("ALTER TABLE payments ADD COLUMN refund_reason VARCHAR(255) NULL"); } catch (Throwable $_) {}

$reason = trim((string)($input['reason'] ?? $input['cancellationReason'] ?? 'Personal Issue / Schedule Change'));

// Compute authoritative verified payments collected via Unified Financial Engine
// NEVER count unverified pending payments, advance_amount, or total_amount as money collected/refundable
$paymentData = KpiService::loadDeduplicatedPayments();
$pAgg = $paymentData['by_booking'][strtoupper(ltrim($bid, '#'))] ?? ($paymentData['by_booking'][strtoupper(ltrim($bNum, '#'))] ?? []);
$fin = KpiService::computeBookingFinancials($booking, $pAgg);

$verifiedPaid = (float)$fin['verified_collected'];
if ($isStaff && isset($input['refundAmount']) && is_numeric($input['refundAmount'])) {
    $refundAmount = max(0.0, min($verifiedPaid, round((float)$input['refundAmount'], 2)));
} else {
    $refundAmount = $verifiedPaid;
}

$hasRefund = $refundAmount > 0.0;
$newPaymentStatus = $hasRefund ? 'refunded' : 'cancelled';
$newRefundStatus = $hasRefund
    ? ($refundAmount >= ($verifiedPaid - 0.01) ? 'refunded' : 'partial_refund')
    : 'none';

$bookingCols = [];
try {
    foreach (Database::fetchAll("SHOW COLUMNS FROM bookings") as $c) {
        $bookingCols[strtolower((string)$c['Field'])] = true;
    }
} catch (Throwable $_) {}

try {
    Database::transaction(function($pdo) use ($booking, $bid, $bNum, $reason, $refundAmount, $newPaymentStatus, $newRefundStatus, $hasRefund, $bookingCols) {
        // 1. Update booking
        $setParts = [
            "status = 'cancelled'",
            "booking_status = 'cancelled'",
            "payment_status = ?",
            "refund_status = ?",
            "cancellation_reason = ?",
            "remaining_balance = 0.00",
            "remaining_amount = 0.00",
            "updated_at = CURRENT_TIMESTAMP",
        ];
        $setParams = [$newPaymentStatus, $newRefundStatus, $reason];
        if (isset($bookingCols['refund_amount'])) {
            $setParts[] = "refund_amount = ?";
            $setParams[] = $refundAmount;
        }
        if (isset($bookingCols['monthly_revenue_split'])) {
            $setParts[] = "monthly_revenue_split = ?";
            $setParams[] = json_encode([]);
        }
        $setParams[] = $booking['id'];
        $setParams[] = $bid;
        $setParams[] = $bNum;

        $pdo->prepare(
            "UPDATE bookings SET " . implode(', ', $setParts) . " WHERE id = ? OR booking_id = ? OR booking_number = ?"
        )->execute($setParams);

        // 2. Update payment records cleanly:
        //    - Void pending/unverified payment rows as 'rejected' so they never stay in Awaiting Payment Verification
        $pdo->prepare(
            "UPDATE payments SET
                status = 'rejected',
                refund_amount = 0.00,
                refund_reason = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE (booking_id = ? OR booking_id = ?)
               AND LOWER(COALESCE(status, 'pending')) = 'pending'"
        )->execute(["Voided on cancellation: {$reason}", $bid, $bNum]);

        //    - Allocate refund_amount ONLY across verified payment rows without duplicating across multiple rows
        if ($hasRefund) {
            $verifiedStmt = $pdo->prepare(
                "SELECT id, amount FROM payments WHERE (booking_id = ? OR booking_id = ?) AND LOWER(COALESCE(status, '')) = 'verified' ORDER BY id ASC"
            );
            $verifiedStmt->execute([$bid, $bNum]);
            $verifiedRows = $verifiedStmt->fetchAll(PDO::FETCH_ASSOC);
            $remToAllocate = $refundAmount;
            foreach ($verifiedRows as $vr) {
                $rowAmt = max(0.0, (float)($vr['amount'] ?? 0.0));
                $alloc = min($rowAmt, $remToAllocate);
                $remToAllocate = max(0.0, round($remToAllocate - $alloc, 2));
                if ($alloc > 0.0) {
                    $pdo->prepare(
                        "UPDATE payments SET status = 'refunded', refund_amount = ?, refund_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )->execute([$alloc, $reason, (int)$vr['id']]);
                }
            }
        }

        // 3. Free up vehicle availability only if vehicle is not in maintenance/inactive/removed
        $vehicleReg = trim((string)($booking['vehicle_reg'] ?? ''));
        if ($vehicleReg !== '' && $vehicleReg !== 'TBD') {
            $pdo->prepare(
                "UPDATE vehicles
                 SET available = 1, status = 'available', updated_at = CURRENT_TIMESTAMP
                 WHERE reg_no = ? AND LOWER(COALESCE(status, 'available')) NOT IN ('maintenance', 'service', 'repair', 'inactive', 'disabled', 'retired', 'removed')"
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

    // Automated KPI metrics sync into MySQL kpi_metrics & kpi_hub_metrics
    try {
        KpiService::syncMetrics(true, false);
    } catch (Throwable $_) {}

    sendJsonResponse([
        'success' => true,
        'message' => $hasRefund
            ? "Booking {$bid} cancelled. Verified refund of ₹" . number_format($refundAmount, 2) . " recorded and fleet released."
            : "Booking {$bid} cancelled with ₹0.00 refund (no verified payments collected) and fleet released.",
        'paymentStatus' => $newPaymentStatus,
        'refundStatus' => $newRefundStatus,
        'refundAmount' => $refundAmount,
        'verifiedCollected' => $verifiedPaid,
    ]);
} catch (Exception $e) {
    error_log("[Booking Cancel Error] " . $e->getMessage());
    sendErrorResponse('Failed to cancel booking: ' . $e->getMessage(), 500);
}
