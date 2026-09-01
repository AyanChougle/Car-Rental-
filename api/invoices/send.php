<?php
/**
 * api/invoices/send.php
 * POST /api/invoices/:bookingId/send - Send tax invoice PDF via SMTP email
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/InvoicePdfService.php';
require_once __DIR__ . '/../services/MailService.php';

Auth::requireRole('admin', 'manager', 'executive');

$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
$bookingId = trim((string)($_GET['bookingId'] ?? $input['bookingId'] ?? ''));

if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$booking = Database::fetchOne(
    "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
    [$bookingId, $bookingId]
);

if (!$booking) {
    sendErrorResponse("Booking '$bookingId' not found.", 404);
}

$recipientEmail = trim((string)($input['recipientEmail'] ?? $booking['user_email'] ?? ''));
if (!$recipientEmail) {
    sendErrorResponse('Customer email is missing for this booking.', 400);
}

try {
    // 1. Generate / retrieve PDF
    $pdfPath = InvoicePdfService::getOrCreateInvoicePdf($booking['booking_id']);
    $fileName = "KRUIZLY_Invoice_" . $booking['booking_number'] . ".pdf";

    // 2. Format HTML email
    $customerName = htmlspecialchars($booking['user_name'] ?: 'Valued Customer');
    $vehicleName = htmlspecialchars($booking['vehicle_name']);
    $totalAmount = number_format((float)$booking['total_amount'], 2);

    $htmlBody = <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#222;background:#f9f9f9;padding:20px;">
  <div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:30px;border:1px solid #e0e0e0;">
    <h2 style="color:#0071e3;margin-top:0;">KRUIZLY Car Rentals</h2>
    <p>Dear <strong>{$customerName}</strong>,</p>
    <p>Thank you for choosing KRUIZLY! Your rental reservation <strong>#{$booking['booking_number']}</strong> has been confirmed.</p>
    <div style="background:#f4f7fb;padding:16px;border-radius:8px;margin:20px 0;">
      <p style="margin:4px 0;"><strong>Vehicle:</strong> {$vehicleName} ({$booking['vehicle_reg']})</p>
      <p style="margin:4px 0;"><strong>Total Amount:</strong> ₹{$totalAmount}</p>
      <p style="margin:4px 0;"><strong>Status:</strong> Confirmed &amp; Verified</p>
    </div>
    <p>Please find attached your official Tax Invoice and Rental Receipt (PDF).</p>
    <p style="font-size:12px;color:#777;margin-top:30px;">For any questions, reach out to support@kruizly.com or call +91 91671 64547.</p>
  </div>
</body>
</html>
HTML;

    // 3. Send email with PDF attachment
    $subject = "Tax Invoice & Booking Confirmation #" . $booking['booking_number'] . " — KRUIZLY";
    $sent = MailService::sendMail($recipientEmail, $subject, $htmlBody, $pdfPath, $fileName);

    if ($sent) {
        Database::execute(
            "UPDATE invoices SET
                email_status = 'sent',
                email_sent_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
             WHERE booking_id = ?",
            [$booking['booking_id']]
        );

        sendJsonResponse([
            'success' => true,
            'message' => "Invoice email sent successfully to $recipientEmail."
        ]);
    } else {
        Database::execute(
            "UPDATE invoices SET email_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?",
            [$booking['booking_id']]
        );

        sendErrorResponse("Failed to send email. Please check SMTP settings.", 500);
    }
} catch (Exception $e) {
    error_log("[Invoice Send Error] " . $e->getMessage());
    Database::execute(
        "UPDATE invoices SET email_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?",
        [$booking['booking_id']]
    );
    sendErrorResponse("Could not dispatch invoice email: " . $e->getMessage(), 500);
}
