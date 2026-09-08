<?php
/**
 * api/payments/verify.php
 * POST /api/payments/:id/verify - Admin payment verification (Approve / Reject)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/InvoicePdfService.php';

$admin = Auth::requireRole('admin', 'manager', 'executive');
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$id = trim((string)($_GET['id'] ?? $input['id'] ?? $input['paymentId'] ?? $input['bookingId'] ?? ''));
$rawAction = strtolower(trim((string)($input['action'] ?? $input['status'] ?? 'approve')));
$action = ($rawAction === 'verified' || $rawAction === 'approved' || $rawAction === 'approve') ? 'approve' : 'reject';
$reason = trim((string)($input['reason'] ?? $input['rejectionReason'] ?? ''));

if (!$id) {
    sendErrorResponse('Payment ID or Booking ID is required.', 400);
}

$verifiedByInput = trim((string)($input['verifiedBy'] ?? $input['verified_by'] ?? ''));
$verifiedBy = $verifiedByInput ?: ($admin['name'] ?? $admin['email'] ?? $admin['firebase_uid']);

try {
    Database::transaction(function($pdo) use ($id, $action, $reason, $admin, $verifiedBy) {
        $now = date('Y-m-d H:i:s');

        if ($action === 'approve') {
            // Update payment record
            $cleanId = ltrim($id, '#');
            $numId = is_numeric($id) ? (int)$id : 0;
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

            // Update booking status
            $booking = Database::fetchOne(
                "SELECT * FROM bookings 
                 WHERE booking_id = ? 
                    OR booking_number = ? 
                    OR id = ? 
                    OR REPLACE(booking_id, '#', '') = ? 
                    OR REPLACE(booking_number, '#', '') = ? 
                 LIMIT 1",
                [$id, $id, $numId, $cleanId, $cleanId]
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
            $cleanId = ltrim($id, '#');
            $numId = is_numeric($id) ? (int)$id : 0;
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

            $pdo->prepare(
                "UPDATE bookings SET
                    status = 'cancelled',
                    booking_status = 'cancelled',
                    payment_status = 'rejected',
                    updated_at = CURRENT_TIMESTAMP
                 WHERE booking_id = ? 
                    OR booking_number = ? 
                    OR id = ? 
                    OR REPLACE(booking_id, '#', '') = ? 
                    OR REPLACE(booking_number, '#', '') = ?"
            )->execute([$id, $id, $numId, $cleanId, $cleanId]);
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
