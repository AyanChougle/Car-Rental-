<?php
/**
 * api/invoices/update.php
 * POST /api/invoices/update.php - Update invoice details & regenerate PDF
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/InvoicePdfService.php';

Auth::requireRole('admin', 'manager', 'executive');

$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
$bookingId = trim((string)($input['bookingId'] ?? $input['id'] ?? $_GET['id'] ?? ''));

if (!$bookingId) {
    sendErrorResponse('Booking ID or Invoice ID is required.', 400);
}

$booking = Database::fetchOne(
    "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
    [$bookingId, $bookingId]
);

if (!$booking) {
    // Try by invoice_id
    $inv = Database::fetchOne("SELECT * FROM invoices WHERE invoice_id = ? OR invoice_number = ? LIMIT 1", [$bookingId, $bookingId]);
    if ($inv) {
        $booking = Database::fetchOne("SELECT * FROM bookings WHERE booking_id = ? LIMIT 1", [$inv['booking_id']]);
    }
}

if (!$booking) {
    sendErrorResponse("Booking '$bookingId' not found.", 404);
}

$custName = trim((string)($input['customer']['name'] ?? $input['customerName'] ?? $booking['user_name']));
$custEmail = trim((string)($input['customer']['email'] ?? $input['customerEmail'] ?? $booking['user_email']));
$vehicleName = trim((string)($input['vehicle']['name'] ?? $input['vehicleName'] ?? $booking['vehicle_name']));
$vehicleReg = trim((string)($input['vehicle']['registration'] ?? $input['vehicleReg'] ?? $booking['vehicle_reg']));

$rental = (float)($input['charges']['rental'] ?? $input['baseAmount'] ?? $booking['base_amount']);
$discount = (float)($input['charges']['discount'] ?? $input['couponDiscount'] ?? $booking['coupon_discount']);
$deposit = (float)($input['charges']['securityDeposit'] ?? $booking['security_deposit']);
$amountPaid = (float)($input['amountPaid'] ?? $booking['payment_amount_paid']);
$payMode = trim((string)($input['paymentMode'] ?? $booking['payment_mode'] ?? 'UPI'));
$payRef = trim((string)($input['paymentRef'] ?? $booking['payment_ref'] ?? ''));
$notes = trim((string)($input['notes'] ?? ''));

$totalAmount = max(0.00, $rental + $deposit - $discount);
$balanceDue = max(0.00, $totalAmount - $amountPaid);
$status = $balanceDue <= 0.01 ? 'paid' : 'advance_paid';

try {
    // 1. Update bookings table
    Database::execute(
        "UPDATE bookings SET
            user_name = ?,
            user_email = ?,
            vehicle_name = ?,
            vehicle_reg = ?,
            base_amount = ?,
            coupon_discount = ?,
            total_amount = ?,
            final_amount = ?,
            payment_amount_paid = ?,
            advance_amount = ?,
            remaining_balance = ?,
            remaining_amount = ?,
            payment_ref = ?,
            payment_status = ?,
            updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ?",
        [
            $custName, $custEmail, $vehicleName, $vehicleReg,
            $rental, $discount, $totalAmount, $totalAmount,
            $amountPaid, ($status === 'paid' ? 0.00 : $amountPaid),
            $balanceDue, $balanceDue, $payRef, $status,
            $booking['booking_id']
        ]
    );

    // 2. Update or insert in invoices table
    $existingInv = Database::fetchOne("SELECT id FROM invoices WHERE booking_id = ? LIMIT 1", [$booking['booking_id']]);
    if ($existingInv) {
        Database::execute(
            "UPDATE invoices SET
                customer_name = ?,
                customer_email = ?,
                vehicle_name = ?,
                vehicle_reg = ?,
                base_amount = ?,
                coupon_discount = ?,
                total_amount = ?,
                amount_paid = ?,
                balance_due = ?,
                status = 'issued',
                updated_at = CURRENT_TIMESTAMP
             WHERE booking_id = ?",
            [
                $custName, $custEmail, $vehicleName, $vehicleReg,
                $rental, $discount, $totalAmount, $amountPaid,
                $balanceDue,
                $booking['booking_id']
            ]
        );
    } else {
        $invId = 'INV-' . bin2hex(random_bytes(6));
        $invNum = 'INV-' . strtoupper(substr(md5($booking['booking_id']), 0, 8));
        Database::execute(
            "INSERT INTO invoices (invoice_id, invoice_number, booking_id, user_id, firebase_uid, customer_name, customer_email, customer_phone, vehicle_name, vehicle_reg, pickup_date, drop_date, duration, base_amount, coupon_discount, total_amount, amount_paid, balance_due, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')",
            [
                $invId, $invNum, $booking['booking_id'], $booking['user_id'], $booking['firebase_uid'],
                $custName, $custEmail, $booking['user_phone'] ?? '',
                $vehicleName, $vehicleReg,
                $booking['pickup_date'], $booking['drop_date'], $booking['duration'] ?: '1 Day',
                $rental, $discount, $totalAmount, $amountPaid, $balanceDue
            ]
        );
    }

    // 3. Regenerate PDF
    try {
        InvoicePdfService::getOrCreateInvoicePdf($booking['booking_id']);
    } catch (Throwable $pdfErr) {
        error_log("[Invoice PDF Warning] " . $pdfErr->getMessage());
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'Invoice updated successfully.',
        'invoice' => [
            'id' => $booking['booking_id'],
            'invoiceId' => $booking['booking_id'],
            'invoiceNumber' => 'INV-' . strtoupper(substr(md5($booking['booking_id']), 0, 8)),
            'bookingId' => $booking['booking_id'],
            'customer' => ['name' => $custName, 'email' => $custEmail],
            'vehicle' => ['name' => $vehicleName, 'registration' => $vehicleReg],
            'charges' => ['rental' => $rental, 'discount' => $discount, 'securityDeposit' => $deposit],
            'total' => $totalAmount,
            'amountPaid' => $amountPaid,
            'balanceDue' => $balanceDue,
            'paymentMode' => $payMode,
            'paymentRef' => $payRef,
            'notes' => $notes
        ]
    ]);
} catch (Throwable $e) {
    error_log("[Invoice Update Error] " . $e->getMessage());
    sendErrorResponse('Failed to update invoice: ' . $e->getMessage(), 500);
}
