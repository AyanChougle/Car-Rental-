<?php
/**
 * api/invoices/update.php
 * POST /api/invoices/update.php - Update invoice details & regenerate PDF
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/InvoicePdfService.php';
require_once __DIR__ . '/../services/KpiService.php';

Auth::requireRole('admin', 'super_admin', 'manager', 'executive', 'accountant', 'accounts');

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

$rental = max(0.00, round((float)($input['charges']['rental'] ?? $input['baseAmount'] ?? $booking['base_amount'] ?? 0), 2));
$driver = max(0.00, round((float)($input['charges']['driver'] ?? $input['driverCharges'] ?? $booking['driver_charges'] ?? 0), 2));
$extraSum = isset($input['charges']['extraKm']) || isset($input['charges']['lateFee']) || isset($input['charges']['fuel']) || isset($input['charges']['damage'])
    ? ((float)($input['charges']['extraKm'] ?? 0) + (float)($input['charges']['lateFee'] ?? 0) + (float)($input['charges']['fuel'] ?? 0) + (float)($input['charges']['damage'] ?? 0))
    : (float)($input['extraCharges'] ?? $booking['extra_charges'] ?? 0);
$extra = max(0.00, round($extraSum, 2));
$discount = max(0.00, round((float)($input['charges']['discount'] ?? $input['couponDiscount'] ?? $booking['coupon_discount'] ?? 0), 2));
$deposit = max(0.00, round((float)($input['charges']['securityDeposit'] ?? $input['securityDeposit'] ?? $booking['security_deposit'] ?? 0), 2));
$amountPaid = max(0.00, round((float)($input['amountPaid'] ?? $booking['payment_amount_paid'] ?? 0), 2));
$payMode = trim((string)($input['paymentMode'] ?? $booking['payment_mode'] ?? 'UPI'));
$payRef = trim((string)($input['paymentRef'] ?? $booking['payment_ref'] ?? ''));
$notes = trim((string)($input['notes'] ?? ''));

// Authoritative Net Rental Total strictly EXCLUDES refundable Security Deposit
$totalAmount = max(0.00, round($rental + $driver + $extra - $discount, 2));
$balanceDue = max(0.00, round($totalAmount - $amountPaid, 2));
$status = $amountPaid <= 0.00 ? 'pending_payment' : ($balanceDue <= 0.01 ? 'paid' : 'advance_paid');
$grossPayable = round($totalAmount + $deposit, 2);

$bookingCols = [];
try {
    foreach (Database::fetchAll("SHOW COLUMNS FROM bookings") as $colRow) {
        $bookingCols[strtolower((string)$colRow['Field'])] = true;
    }
} catch (Throwable $_) {}

try {
    // 1. Update bookings table without embedding refundable security deposit inside total_amount / final_amount
    $setClauses = [
        "user_name = ?",
        "user_email = ?",
        "vehicle_name = ?",
        "vehicle_reg = ?",
        "base_amount = ?",
        "coupon_discount = ?",
        "security_deposit = ?",
        "total_amount = ?",
        "final_amount = ?",
        "payment_amount_paid = ?",
        "remaining_balance = ?",
        "remaining_amount = ?",
        "payment_ref = ?",
        "payment_status = ?",
        "updated_at = CURRENT_TIMESTAMP",
    ];
    $bParams = [
        $custName, $custEmail, $vehicleName, $vehicleReg,
        $rental, $discount, $deposit, $totalAmount, $totalAmount,
        $amountPaid, $balanceDue, $balanceDue, $payRef, $status,
    ];
    if (isset($bookingCols['driver_charges'])) {
        $setClauses[] = "driver_charges = ?";
        $bParams[] = $driver;
    }
    if (isset($bookingCols['extra_charges'])) {
        $setClauses[] = "extra_charges = ?";
        $bParams[] = $extra;
    }
    if (isset($bookingCols['monthly_revenue_split'])) {
        $splitRow = array_merge($booking, [
            'base_amount' => $rental,
            'driver_charges' => $driver,
            'extra_charges' => $extra,
            'coupon_discount' => $discount,
            'security_deposit' => $deposit,
            'total_amount' => $totalAmount,
            'final_amount' => $totalAmount,
            'payment_amount_paid' => $amountPaid,
            'payment_status' => $status,
        ]);
        $split = KpiService::calculateMonthlyRevenueSplit($splitRow);
        $setClauses[] = "monthly_revenue_split = ?";
        $bParams[] = json_encode($split);
    }
    $bParams[] = $booking['booking_id'];
    Database::execute("UPDATE bookings SET " . implode(', ', $setClauses) . " WHERE booking_id = ?", $bParams);

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
                security_deposit = ?,
                total_amount = ?,
                amount_paid = ?,
                balance_due = ?,
                status = 'issued',
                updated_at = CURRENT_TIMESTAMP
             WHERE booking_id = ?",
            [
                $custName, $custEmail, $vehicleName, $vehicleReg,
                $rental, $discount, $deposit, $totalAmount, $amountPaid,
                $balanceDue,
                $booking['booking_id']
            ]
        );
    } else {
        $invId = 'INV-' . bin2hex(random_bytes(6));
        $invNum = 'INV-' . strtoupper(substr(md5($booking['booking_id']), 0, 8));
        Database::execute(
            "INSERT INTO invoices (invoice_id, invoice_number, booking_id, user_id, firebase_uid, customer_name, customer_email, customer_phone, vehicle_name, vehicle_reg, pickup_date, drop_date, duration, base_amount, coupon_discount, security_deposit, total_amount, amount_paid, balance_due, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')",
            [
                $invId, $invNum, $booking['booking_id'], $booking['user_id'], $booking['firebase_uid'],
                $custName, $custEmail, $booking['user_phone'] ?? '',
                $vehicleName, $vehicleReg,
                $booking['pickup_date'], $booking['drop_date'], $booking['duration'] ?: '1 Day',
                $rental, $discount, $deposit, $totalAmount, $amountPaid, $balanceDue
            ]
        );
    }

    // 3. Regenerate PDF
    try {
        InvoicePdfService::getOrCreateInvoicePdf($booking['booking_id']);
    } catch (Throwable $pdfErr) {
        error_log("[Invoice PDF Warning] " . $pdfErr->getMessage());
    }

    // Automated KPI metrics sync into MySQL kpi_metrics table
    try {
        KpiService::syncMetrics();
    } catch (Throwable $_) {}

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
            'charges' => [
                'rental' => $rental,
                'driver' => $driver,
                'extraCharges' => $extra,
                'discount' => $discount,
                'securityDeposit' => $deposit,
            ],
            'total' => $totalAmount,
            'grossCustomerPayable' => $grossPayable,
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
