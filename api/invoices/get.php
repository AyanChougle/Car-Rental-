<?php
/**
 * api/invoices/get.php
 * GET /api/invoices/:bookingId - Fetch invoice details
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$bookingId = trim((string)($_GET['bookingId'] ?? $_GET['id'] ?? ''));
if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);

$invoice = Database::fetchOne(
    "SELECT * FROM invoices WHERE booking_id = ? OR invoice_number = ? LIMIT 1",
    [$bookingId, $bookingId]
);

if (!$invoice) {
    // If not in invoices table, try fetching from bookings and generating record
    $booking = Database::fetchOne(
        "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
        [$bookingId, $bookingId]
    );

    if (!$booking) {
        sendErrorResponse("Invoice for booking '$bookingId' not found.", 404);
    }

    if (!$isStaff && $booking['firebase_uid'] !== $user['firebase_uid']) {
        sendErrorResponse('Access denied.', 403);
    }

    require_once __DIR__ . '/../services/InvoicePdfService.php';
    InvoicePdfService::getOrCreateInvoicePdf($booking['booking_id']);
    $invoice = Database::fetchOne("SELECT * FROM invoices WHERE booking_id = ? LIMIT 1", [$booking['booking_id']]);
}

if (!$isStaff && $invoice['firebase_uid'] !== $user['firebase_uid']) {
    sendErrorResponse('Access denied.', 403);
}

sendJsonResponse([
    'success' => true,
    'invoice' => [
        'id' => $invoice['invoice_id'],
        'invoiceNumber' => $invoice['invoice_number'],
        'bookingId' => $invoice['booking_id'],
        'customerName' => $invoice['customer_name'],
        'customerEmail' => $invoice['customer_email'],
        'customerPhone' => $invoice['customer_phone'],
        'vehicleName' => $invoice['vehicle_name'],
        'vehicleReg' => $invoice['vehicle_reg'],
        'pickupDate' => $invoice['pickup_date'],
        'dropDate' => $invoice['drop_date'],
        'duration' => $invoice['duration'],
        'baseAmount' => (float)$invoice['base_amount'],
        'couponDiscount' => (float)$invoice['coupon_discount'],
        'securityDeposit' => (float)$invoice['security_deposit'],
        'totalAmount' => (float)$invoice['total_amount'],
        'amountPaid' => (float)$invoice['amount_paid'],
        'balanceDue' => (float)$invoice['balance_due'],
        'status' => $invoice['status'],
        'emailStatus' => $invoice['email_status'],
        'createdAt' => $invoice['created_at']
    ]
]);
