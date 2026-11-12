<?php
/**
 * api/payments/verify.php
 * POST /api/payments/:id/verify - Admin payment verification (Approve / Reject)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/InvoicePdfService.php';
require_once __DIR__ . '/../services/KpiService.php';

$admin = Auth::requireRole('admin', 'super_admin', 'manager', 'executive', 'accountant', 'accounts');
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$id = trim((string)($_GET['id'] ?? $input['id'] ?? $input['paymentId'] ?? $input['bookingId'] ?? ''));
$rawAction = strtolower(trim((string)($input['action'] ?? $input['status'] ?? 'approve')));
if (in_array($rawAction, ['verified', 'approved', 'approve'], true)) {
    $action = 'approve';
} elseif (in_array($rawAction, ['refund', 'refunded'], true)) {
    $action = 'refund';
} else {
    $action = 'reject';
}
$reason = trim((string)($input['reason'] ?? $input['rejectionReason'] ?? ''));

if (!$id) {
    sendErrorResponse('Payment ID or Booking ID is required.', 400);
}

$verifiedByInput = trim((string)($input['verifiedBy'] ?? $input['verified_by'] ?? ''));
$verifiedBy = $verifiedByInput ?: ($admin['name'] ?? $admin['email'] ?? $admin['firebase_uid']);

try {
    $targetBookingIdForNotify = $id;
    Database::transaction(function($pdo) use ($id, $action, $reason, $admin, $verifiedBy, $input, &$targetBookingIdForNotify) {
        $now = date('Y-m-d H:i:s');
        $cleanId = ltrim($id, '#');
        $numId = is_numeric($id) ? (int)$id : 0;

        // Locate payment row if ID refers to payment_id or payments.id
        $paymentRow = Database::fetchOne(
            "SELECT * FROM payments
             WHERE payment_id = ? OR booking_id = ? OR id = ? OR REPLACE(booking_id, '#', '') = ? OR REPLACE(payment_id, '#', '') = ?
             ORDER BY id DESC LIMIT 1",
            [$id, $id, $numId, $cleanId, $cleanId]
        );
        $bookingLookupKey = $paymentRow && !empty($paymentRow['booking_id']) ? (string)$paymentRow['booking_id'] : $id;
        $bookingLookupClean = ltrim($bookingLookupKey, '#');
        $bookingLookupNum = is_numeric($bookingLookupKey) ? (int)$bookingLookupKey : $numId;

        $booking = Database::fetchOne(
            "SELECT * FROM bookings
             WHERE booking_id = ? OR booking_number = ? OR id = ?
                OR REPLACE(booking_id, '#', '') = ? OR REPLACE(booking_number, '#', '') = ?
             LIMIT 1",
            [$bookingLookupKey, $bookingLookupKey, $bookingLookupNum, $bookingLookupClean, $bookingLookupClean]
        );

        if ($booking && !empty($booking['booking_id'])) {
            $targetBookingIdForNotify = (string)$booking['booking_id'];
        }

        if ($action === 'approve') {
            if ($booking && in_array(strtolower((string)($booking['status'] ?? '')), ['cancelled', 'rejected'], true)) {
                throw new Exception('Cannot approve payment for a cancelled or rejected booking.');
            }

            // Approve the targeted payment record (or all pending payment records for that booking if called by bookingId)
            $pdo->prepare(
                "UPDATE payments SET
                    status = 'verified',
                    verified_by = ?,
                    verified_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE payment_id = ?
                    OR booking_id = ?
                    OR id = ?
                    OR REPLACE(booking_id, '#', '') = ?
                    OR REPLACE(payment_id, '#', '') = ?"
            )->execute([$verifiedBy, $now, $id, $id, $numId, $cleanId, $cleanId]);

            if ($booking) {
                $paymentData = KpiService::loadDeduplicatedPayments();
                $pAgg = $paymentData['by_booking'][strtoupper(ltrim((string)$booking['booking_id'], '#'))]
                    ?? ($paymentData['by_booking'][strtoupper(ltrim((string)($booking['booking_number'] ?? ''), '#'))] ?? []);
                $fin = KpiService::computeBookingFinancials($booking, $pAgg);

                $verifiedSum = (float)$fin['verified_collected'];
                if ($verifiedSum <= 0.0) {
                    // Fallback when verifying a booking directly with no row in `payments`
                    if (isset($input['amount']) && is_numeric($input['amount']) && (float)$input['amount'] > 0) {
                        $verifiedSum = round((float)$input['amount'], 2);
                    } elseif ($booking['payment_plan'] === 'advance' && (float)($booking['advance_amount'] ?? 0) > 0) {
                        $verifiedSum = round((float)$booking['advance_amount'], 2);
                    } else {
                        $verifiedSum = (float)$fin['net_rental_before_refund'];
                    }
                }

                $netPayable = (float)$fin['net_rental_before_refund'];
                $remaining = max(0.0, round($netPayable - $verifiedSum, 2));
                $newPayStatus = $remaining <= 0.01 ? 'paid' : 'advance_paid';

                // Preserve active/in_trip/completed status if booking is already running or completed!
                $curStatus = strtolower(trim((string)($booking['status'] ?? 'pending_payment')));
                $newBookingStatus = in_array($curStatus, ['active', 'in_trip', 'ongoing', 'started', 'completed'], true)
                    ? $curStatus
                    : 'confirmed';

                $pdo->prepare(
                    "UPDATE bookings SET
                        status = ?,
                        booking_status = ?,
                        payment_status = ?,
                        payment_amount_paid = ?,
                        remaining_balance = ?,
                        remaining_amount = ?,
                        verified_by = ?,
                        verified_at = ?,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?"
                )->execute([$newBookingStatus, $newBookingStatus, $newPayStatus, $verifiedSum, $remaining, $remaining, $verifiedBy, $now, (int)$booking['id']]);

                try {
                    InvoicePdfService::getOrCreateInvoicePdf($booking['booking_id']);
                } catch (Throwable $t) {
                    error_log("[Invoice Auto-Gen Warning] " . $t->getMessage());
                }
            }
        } elseif ($action === 'refund') {
            $refundReq = isset($input['refundAmount']) && is_numeric($input['refundAmount'])
                ? max(0.0, round((float)$input['refundAmount'], 2))
                : null;
            $verifiedAmt = 0.0;
            if ($booking) {
                $paymentData = KpiService::loadDeduplicatedPayments();
                $pAgg = $paymentData['by_booking'][strtoupper(ltrim((string)$booking['booking_id'], '#'))] ?? [];
                $fin = KpiService::computeBookingFinancials($booking, $pAgg);
                $verifiedAmt = (float)$fin['verified_collected'];
            } elseif ($paymentRow) {
                $verifiedAmt = max(0.0, (float)($paymentRow['amount'] ?? 0.0));
            }
            $refundAmt = $refundReq !== null ? min($verifiedAmt, $refundReq) : $verifiedAmt;

            $pdo->prepare(
                "UPDATE payments SET
                    status = 'refunded',
                    refund_amount = ?,
                    refund_reason = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE (payment_id = ? OR booking_id = ? OR id = ? OR REPLACE(booking_id, '#', '') = ?)
                   AND LOWER(COALESCE(status, '')) = 'verified'"
            )->execute([$refundAmt, $reason ?: 'Refund issued by admin', $id, $id, $numId, $cleanId]);

            if ($booking) {
                $pdo->prepare(
                    "UPDATE bookings SET
                        payment_status = 'refunded',
                        refund_status = ?,
                        refund_amount = ?,
                        remaining_balance = 0.00,
                        remaining_amount = 0.00,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?"
                )->execute([$refundAmt >= ($verifiedAmt - 0.01) ? 'refunded' : 'partial_refund', $refundAmt, (int)$booking['id']]);
            }
        } elseif ($action === 'reject') {
            $pdo->prepare(
                "UPDATE payments SET
                    status = 'rejected',
                    rejection_reason = ?,
                    verified_by = ?,
                    verified_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE payment_id = ?
                    OR booking_id = ?
                    OR id = ?
                    OR REPLACE(booking_id, '#', '') = ?
                    OR REPLACE(payment_id, '#', '') = ?"
            )->execute([$reason ?: 'Payment receipt could not be verified.', $verifiedBy, $now, $id, $id, $numId, $cleanId, $cleanId]);

            if ($booking) {
                $curStat = strtolower((string)($booking['status'] ?? ''));
                $shouldCancelBooking = !in_array($curStat, ['confirmed', 'active', 'in_trip', 'completed'], true);
                if ($shouldCancelBooking) {
                    $pdo->prepare(
                        "UPDATE bookings SET
                            status = 'cancelled',
                            booking_status = 'cancelled',
                            payment_status = 'rejected',
                            remaining_balance = 0.00,
                            remaining_amount = 0.00,
                            updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?"
                    )->execute([(int)$booking['id']]);
                } else {
                    $paymentData = KpiService::loadDeduplicatedPayments();
                    $pAgg = $paymentData['by_booking'][strtoupper(ltrim((string)$booking['booking_id'], '#'))] ?? [];
                    $fin = KpiService::computeBookingFinancials($booking, $pAgg);
                    $verifiedPaid = (float)$fin['verified_collected'];
                    $remaining = (float)$fin['outstanding_amount'];
                    $newPayStat = $verifiedPaid > 0 ? ($remaining <= 0.01 ? 'paid' : 'advance_paid') : 'rejected';
                    $pdo->prepare(
                        "UPDATE bookings SET
                            payment_status = ?,
                            payment_amount_paid = ?,
                            remaining_balance = ?,
                            remaining_amount = ?,
                            updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?"
                    )->execute([$newPayStat, $verifiedPaid, $remaining, $remaining, (int)$booking['id']]);
                }
            }
        } else {
            throw new Exception("Invalid action '$action'. Must be 'approve', 'reject', or 'refund'.");
        }
    });

    // Automated KPI metrics sync into MySQL kpi_metrics table
    try {
        KpiService::syncMetrics();
    } catch (Throwable $_) {}

    // Dispatch approval or cancellation email & WhatsApp notification
    $notificationResult = null;
    try {
        require_once __DIR__ . '/../services/BookingNotificationService.php';
        if ($action === 'approve') {
            $notificationResult = BookingNotificationService::sendBookingApprovalNotification($targetBookingIdForNotify);
        } elseif ($action === 'reject') {
            $notificationResult = BookingNotificationService::sendBookingCancellationNotification($targetBookingIdForNotify, $reason);
        }
    } catch (Throwable $t) {
        error_log("[Verification Notification Error] " . $t->getMessage());
    }

    sendJsonResponse([
        'success' => true,
        'message' => "Payment successfully marked as " . ($action === 'approve' ? 'Approved & Confirmed' : ($action === 'refund' ? 'Refunded' : 'Rejected')) . ".",
        'notification' => $notificationResult
    ]);
} catch (Exception $e) {
    error_log("[Payment Verify Error] " . $e->getMessage());
    sendErrorResponse('Failed to verify payment: ' . $e->getMessage(), 500);
}
