<?php
/**
 * api/invoices/get.php
 * GET /api/invoices/:bookingId - Fetch invoice details
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
$bookingId = trim((string)($_GET['bookingId'] ?? $_GET['id'] ?? $_GET['booking_id'] ?? $input['bookingId'] ?? $input['id'] ?? ''));

if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);

$invoice = Database::fetchOne(
    "SELECT * FROM invoices WHERE booking_id = ? OR invoice_number = ? OR invoice_id = ? LIMIT 1",
    [$bookingId, $bookingId, $bookingId]
);

$booking = null;
if (!$invoice) {
    // If not in invoices table, fetch from bookings and generate record
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
} else {
    $booking = Database::fetchOne("SELECT * FROM bookings WHERE booking_id = ? LIMIT 1", [$invoice['booking_id']]);
}

if (!$invoice) {
    sendErrorResponse("Could not load invoice record.", 404);
}

if (!$isStaff && $invoice['firebase_uid'] !== $user['firebase_uid']) {
    sendErrorResponse('Access denied.', 403);
}

$balance = (float)$invoice['balance_due'];
$isFull = ($balance <= 0.01);

sendJsonResponse([
    'success' => true,
    'invoice' => [
        'id' => $invoice['invoice_id'],
        'invoiceId' => $invoice['invoice_id'],
        'invoiceNumber' => $invoice['invoice_number'],
        'bookingId' => $invoice['booking_id'],
        'customer' => [
            'name' => $invoice['customer_name'] ?: ($booking['user_name'] ?? 'Customer'),
            'email' => $invoice['customer_email'] ?: ($booking['user_email'] ?? ''),
            'phone' => $invoice['customer_phone'] ?: ($booking['user_phone'] ?? '')
        ],
        'vehicle' => [
            'name' => $invoice['vehicle_name'] ?: ($booking['vehicle_name'] ?? ''),
            'registration' => $invoice['vehicle_reg'] ?: ($booking['vehicle_reg'] ?? '')
        ],
        'charges' => [
            'rental' => (float)$invoice['base_amount'],
            'driver' => 0.00,
            'extraKm' => 0.00,
            'lateFee' => 0.00,
            'fuel' => 0.00,
            'damage' => 0.00,
            'discount' => (float)$invoice['coupon_discount'],
            'securityDeposit' => (float)$invoice['security_deposit']
        ],
        'taxRate' => 0,
        'notes' => $booking['notes'] ?? '',
        'total' => (float)$invoice['total_amount'],
        'subtotal' => (float)$invoice['total_amount'],
        'amountPaid' => (float)$invoice['amount_paid'],
        'balanceDue' => $balance,
        'status' => $invoice['status'],
        'paymentPlan' => $booking['payment_plan'] ?? ($isFull ? 'full' : 'advance'),
        'paymentStatus' => $isFull ? 'paid' : ($booking['payment_status'] ?? 'advance_paid'),
        'payment' => [
            'mode' => $booking['payment_mode'] ?? 'UPI',
            'reference' => $booking['payment_ref'] ?? ''
        ],
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
        'emailStatus' => $invoice['email_status'],
        'createdAt' => $invoice['created_at']
    ]
]);
