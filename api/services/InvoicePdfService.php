<?php
/**
 * api/services/InvoicePdfService.php
 * 
 * Standalone Pure PHP PDF Invoice Generator for KRUIZLY.
 * Creates standard PDF documents without external binaries or node dependencies.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';

class InvoicePdfService {
    /**
     * Generates or fetches an existing invoice PDF for a booking
     * @param string $bookingId
     * @return string Absolute file path to the generated PDF
     */
    public static function getOrCreateInvoicePdf(string $bookingId): string {
        $booking = Database::fetchOne(
            "SELECT * FROM bookings WHERE booking_id = ? OR booking_number = ? LIMIT 1",
            [$bookingId, $bookingId]
        );

        if (!$booking) {
            throw new Exception("Booking '$bookingId' not found.");
        }

        $invoiceDir = STORAGE_ROOT . '/invoices/' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $booking['booking_id']);
        if (!is_dir($invoiceDir)) {
            mkdir($invoiceDir, 0755, true);
        }

        $pdfPath = $invoiceDir . '/invoice.pdf';

        // Check or create record in invoices table
        $invoice = Database::fetchOne(
            "SELECT * FROM invoices WHERE booking_id = ? LIMIT 1",
            [$booking['booking_id']]
        );

        $invoiceNumber = $invoice['invoice_number'] ?? ('INV-' . strtoupper(substr(md5($booking['booking_id']), 0, 8)));
        $total = (float)$booking['total_amount'];
        $advance = (float)($booking['payment_amount_paid'] ?: $booking['advance_amount'] ?: 0);
        $balance = (float)$booking['remaining_balance'];

        if (!$invoice) {
            $invoiceId = 'INV-' . bin2hex(random_bytes(6));
            Database::execute(
                "INSERT INTO invoices (invoice_id, invoice_number, booking_id, user_id, firebase_uid, customer_name, customer_email, customer_phone, vehicle_name, vehicle_reg, pickup_date, drop_date, duration, base_amount, coupon_discount, gst_amount, security_deposit, total_amount, amount_paid, balance_due, status, pdf_path)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)",
                [
                    $invoiceId, $invoiceNumber, $booking['booking_id'], $booking['user_id'], $booking['firebase_uid'],
                    $booking['user_name'] ?: 'Customer', $booking['user_email'] ?: 'customer@kruizly.com', $booking['user_phone'],
                    $booking['vehicle_name'], $booking['vehicle_reg'], $booking['pickup_date'], $booking['drop_date'], $booking['duration'],
                    $booking['base_amount'], $booking['coupon_discount'], 0.00, $booking['security_deposit'],
                    $total, $advance, $balance, $pdfPath
                ]
            );
        }

        // Generate PDF
        self::renderPdfToFile($booking, $invoiceNumber, $pdfPath);

        return $pdfPath;
    }

    /**
     * Minimal pure-PHP vector PDF generator for high-speed server execution
     */
    private static function renderPdfToFile(array $b, string $invoiceNumber, string $outputPath): void {
        $customerName = htmlspecialchars($b['user_name'] ?: 'Valued Customer');
        $customerEmail = htmlspecialchars($b['user_email'] ?: '');
        $customerPhone = htmlspecialchars($b['user_phone'] ?: 'N/A');
        $vehicle = htmlspecialchars($b['vehicle_name'] . " (" . $b['vehicle_reg'] . ")");
        $pickup = date('d M Y, h:i A', strtotime($b['pickup_date']));
        $drop = date('d M Y, h:i A', strtotime($b['drop_date']));
        $duration = htmlspecialchars($b['duration'] ?: '1 Day');
        $total = number_format((float)$b['total_amount'], 2);
        $paid = number_format((float)($b['payment_amount_paid'] ?: $b['advance_amount'] ?: 0), 2);
        $balance = number_format((float)$b['remaining_balance'], 2);
        $discount = number_format((float)$b['coupon_discount'], 2);
        $deposit = number_format((float)$b['security_deposit'], 2);
        $dateStr = date('d-M-Y');

        // Construct PostScript-like pure PDF 1.4 document
        $lines = [
            "BT /F1 20 Tf 50 780 Td (KRUIZLY CAR RENTALS) Tj ET",
            "BT /F2 10 Tf 50 765 Td (Premium Self-Drive Car Rental Service) Tj ET",
            "BT /F2 9 Tf 50 750 Td (Gavson Business Park, Ghansoli, Navi Mumbai | support@kruizly.com) Tj ET",
            "0.2 g 50 735 500 1 re f 0 g", // Horizontal rule

            "BT /F1 14 Tf 50 710 Td (TAX INVOICE / RENTAL RECEIPT) Tj ET",
            "BT /F2 10 Tf 50 690 Td (Invoice Number: $invoiceNumber) Tj ET",
            "BT /F2 10 Tf 50 675 Td (Date: $dateStr) Tj ET",
            "BT /F2 10 Tf 350 690 Td (Booking Ref: #" . $b['booking_number'] . ") Tj ET",
            "BT /F2 10 Tf 350 675 Td (Payment Status: " . strtoupper($b['payment_status']) . ") Tj ET",

            "0.95 g 50 600 500 55 re f 0 g", // Customer Box
            "BT /F1 10 Tf 60 640 Td (BILLED TO:) Tj ET",
            "BT /F2 10 Tf 60 625 Td (Name: $customerName) Tj ET",
            "BT /F2 10 Tf 60 610 Td (Email: $customerEmail  |  Phone: $customerPhone) Tj ET",

            "0.95 g 50 515 500 70 re f 0 g", // Ride Details Box
            "BT /F1 10 Tf 60 565 Td (RENTAL ITINERARY) Tj ET",
            "BT /F2 10 Tf 60 550 Td (Vehicle: $vehicle) Tj ET",
            "BT /F2 10 Tf 60 535 Td (Pickup: $pickup) Tj ET",
            "BT /F2 10 Tf 60 520 Td (Drop:   $drop  (Duration: $duration)) Tj ET",

            // Table Header
            "0.85 g 50 470 500 20 re f 0 g",
            "BT /F1 10 Tf 60 476 Td (Item Description) Tj ET",
            "BT /F1 10 Tf 450 476 Td (Amount (INR)) Tj ET",

            // Table Rows
            "BT /F2 10 Tf 60 450 Td (Vehicle Base Rental Charges ($duration)) Tj ET",
            "BT /F2 10 Tf 450 450 Td (Rs. " . number_format((float)$b['base_amount'], 2) . ") Tj ET",
            "0.8 g 50 440 500 0.5 re f 0 g",

            "BT /F2 10 Tf 60 425 Td (Refundable Security Deposit) Tj ET",
            "BT /F2 10 Tf 450 425 Td (Rs. $deposit) Tj ET",
            "0.8 g 50 415 500 0.5 re f 0 g",

            "BT /F2 10 Tf 60 400 Td (Promotional Coupon Discount" . ($b['coupon_code'] ? " (" . $b['coupon_code'] . ")" : "") . ") Tj ET",
            "BT /F2 10 Tf 450 400 Td (-Rs. $discount) Tj ET",
            "0.8 g 50 390 500 0.5 re f 0 g",

            // Summary Totals
            "0.95 g 300 290 250 85 re f 0 g",
            "BT /F1 11 Tf 315 355 Td (Total Amount:) Tj 450 355 Td (Rs. $total) Tj ET",
            "BT /F2 10 Tf 315 335 Td (Advance Paid:) Tj 450 335 Td (Rs. $paid) Tj ET",
            "BT /F1 11 Tf 315 310 Td (Balance Due:) Tj 450 310 Td (Rs. $balance) Tj ET",

            // Footer
            "0.8 g 50 120 500 0.5 re f 0 g",
            "BT /F2 8 Tf 50 100 Td (Thank you for choosing KRUIZLY! For roadside assistance call +91 91671 64547 or email support@kruizly.com) Tj ET",
            "BT /F2 8 Tf 50 85 Td (This is a computer-generated invoice and does not require a physical signature.) Tj ET"
        ];

        $streamContent = implode("\n", $lines);
        $streamLen = strlen($streamContent);

        $objects = [];
        $objects[] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj";
        $objects[] = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj";
        $objects[] = "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj";
        $objects[] = "4 0 obj\n<< /Length $streamLen >>\nstream\n$streamContent\nendstream\nendobj";
        $objects[] = "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj";
        $objects[] = "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj";

        $pdf = "%PDF-1.4\n";
        $offsets = [];

        foreach ($objects as $obj) {
            $offsets[] = strlen($pdf);
            $pdf .= $obj . "\n";
        }

        $xrefOffset = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";

        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n$xrefOffset\n%%EOF";

        file_put_contents($outputPath, $pdf);
    }
}
