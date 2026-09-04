<?php
/**
 * api/payments/verify.php
 * POST /api/payments/:id/verify - Admin payment verification (Approve / Reject)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/InvoicePdfService.php';

$admin = Auth::requireRole('admin', 'manager');
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$id = trim((string)($_GET['id'] ?? $input['id'] ?? $input['paymentId'] ?? $input['bookingId'] ?? ''));
$action = strtolower(trim((string)($input['action'] ?? 'approve')));
$reason = trim((string)($input['reason'] ?? $input['rejectionReason'] ?? ''));

if (!$id) {
    sendErrorResponse('Payment ID or Booking ID is required.', 400);
}

try {
    Database::transaction(function($pdo) use ($id, $action, $reason, $admin) {
        $now = date('Y-m-d H:i:s');

        if ($action === 'approve') {
            // Update payment record
            $pdo->prepare(
                "UPDATE payments SET
                    status = 'verified',
                    verified_by = ?,
                    verified_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE payment_id = ? OR booking_id = ?"
            )->execute([$admin['firebase_uid'], $now, $id, $id]);

            // Update booking status
            $booking = Database::fetchOne(
                "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
                [$id, $id]
            );

            if ($booking) {
                $isAdvance = ($booking['payment_plan'] === 'advance');
                $newPayStatus = $isAdvance ? 'advance_paid' : 'paid';

                $pdo->prepare(
                    "UPDATE bookings SET
                        status = 'confirmed',
                        booking_status = 'confirmed',
                        payment_status = ?,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE booking_id = ?"
                )->execute([$newPayStatus, $booking['booking_id']]);

                // Create invoice & generate PDF
                try {
                    InvoicePdfService::getOrCreateInvoicePdf($booking['booking_id']);
                } catch (Throwable $t) {
                    error_log("[Invoice Auto-Gen Warning] " . $t->getMessage());
                }
            }
        } elseif ($action === 'reject') {
            $pdo->prepare(
                "UPDATE payments SET
                    status = 'rejected',
                    rejection_reason = ?,
                    verified_by = ?,
                    verified_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE payment_id = ? OR booking_id = ?"
            )->execute([$reason ?: 'Payment receipt could not be verified.', $admin['firebase_uid'], $now, $id, $id]);

            $pdo->prepare(
                "UPDATE bookings SET
                    payment_status = 'rejected',
                    updated_at = CURRENT_TIMESTAMP
                 WHERE booking_id = ? OR booking_number = ?"
            )->execute([$id, $id]);
        } else {
            throw new Exception("Invalid action '$action'. Must be 'approve' or 'reject'.");
        }
    });

    sendJsonResponse([
        'success' => true,
        'message' => "Payment successfully marked as " . ($action === 'approve' ? 'Approved & Confirmed' : 'Rejected') . "."
    ]);
} catch (Exception $e) {
    error_log("[Payment Verify Error] " . $e->getMessage());
    sendErrorResponse('Failed to verify payment: ' . $e->getMessage(), 500);
}
