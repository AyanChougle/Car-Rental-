<?php
/**
 * api/invoices/pdf.php
 * GET /api/invoices/:bookingId/pdf - Generate and stream PDF invoice
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/InvoicePdfService.php';

$bookingId = trim((string)($_GET['bookingId'] ?? $_GET['id'] ?? ''));
if (!$bookingId) {
    sendErrorResponse('Booking ID is required.', 400);
}

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);

$booking = Database::fetchOne(
    "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
    [$bookingId, $bookingId]
);

if (!$booking) {
    sendErrorResponse("Booking '$bookingId' not found.", 404);
}

if (!$isStaff && $booking['firebase_uid'] !== $user['firebase_uid']) {
    sendErrorResponse('Access denied.', 403);
}

try {
    $pdfPath = InvoicePdfService::getOrCreateInvoicePdf($booking['booking_id']);

    if (!file_exists($pdfPath)) {
        sendErrorResponse('Failed to locate generated invoice PDF.', 500);
    }

    header('Content-Type: application/pdf');
    header('Content-Length: ' . filesize($pdfPath));
    header('Content-Disposition: inline; filename="KRUIZLY_Invoice_' . $booking['booking_number'] . '.pdf"');
    header('Cache-Control: private, max-age=3600');

    readfile($pdfPath);
    exit;
} catch (Exception $e) {
    error_log("[Invoice PDF Error] " . $e->getMessage());
    sendErrorResponse('Failed to generate PDF: ' . $e->getMessage(), 500);
}
