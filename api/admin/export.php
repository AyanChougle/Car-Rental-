<?php
/**
 * api/admin/export.php
 * GET /api/admin/export - Export MySQL database tables as JSON or CSV
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin', 'manager');

$format = strtolower((string)($_GET['format'] ?? 'json'));

// Fetch all database tables
$users = Database::fetchAll("SELECT id, firebase_uid, email, name, phone, age, role, status, license_status, aadhar_status, pan_status, created_at FROM users");
$vehicles = Database::fetchAll("SELECT reg_no, brand, model, year, category, transmission, fuel, seats, price_day, price_hour, security_deposit, available, status FROM vehicles");

// Fetch bookings with odometer and FASTag / Fasttrack metrics
$rawBookings = Database::fetchAll("SELECT * FROM bookings ORDER BY id DESC");
$bookings = [];
foreach ($rawBookings as $b) {
    $insp = [];
    if (!empty($b['return_inspection'])) {
        $insp = is_string($b['return_inspection']) ? json_decode($b['return_inspection'], true) : $b['return_inspection'];
        if (!is_array($insp)) $insp = [];
    }

    $startOdo = $b['start_odometer'] ?? ($insp['pickupOdometer'] ?? $insp['startOdometer'] ?? null);
    $endOdo = $b['end_odometer'] ?? ($insp['returnOdometer'] ?? $insp['endOdometer'] ?? null);
    $startFastag = $b['start_fastag'] ?? ($insp['pickupFastagBalance'] ?? $insp['startFastag'] ?? $insp['pickupFastag'] ?? null);
    $returnFastag = $b['return_fastag'] ?? ($insp['returnFastagBalance'] ?? $insp['returnFastag'] ?? null);

    $distanceKm = (is_numeric($startOdo) && is_numeric($endOdo) && (float)$endOdo >= (float)$startOdo)
        ? ((float)$endOdo - (float)$startOdo)
        : '';
    $fastagUsed = (is_numeric($startFastag) && is_numeric($returnFastag) && (float)$startFastag >= (float)$returnFastag)
        ? ((float)$startFastag - (float)$returnFastag)
        : '';

    $bookings[] = [
        'Booking #' => $b['booking_number'] ?? $b['booking_id'] ?? ('#' . ($b['id'] ?? '')),
        'Customer Name' => $b['user_name'] ?? '',
        'Customer Phone' => $b['user_phone'] ?? '',
        'Customer Email' => $b['user_email'] ?? '',
        'Vehicle Name' => $b['vehicle_name'] ?? '',
        'Vehicle Reg' => $b['vehicle_reg'] ?? '',
        'Pickup Date' => $b['pickup_date'] ?? '',
        'Drop Date' => $b['drop_date'] ?? '',
        'Duration' => $b['duration'] ?? (($b['days'] ?? 1) . ' days'),
        'Start Odometer (KM)' => $startOdo ?? '',
        'End Odometer (KM)' => $endOdo ?? '',
        'Distance Driven (KM)' => $distanceKm,
        'Start FASTag (₹)' => $startFastag ?? '',
        'Return FASTag (₹)' => $returnFastag ?? '',
        'FASTag Used (₹)' => $fastagUsed,
        'Total Amount (₹)' => (float)($b['total_amount'] ?? 0),
        'Advance Paid (₹)' => (float)($b['payment_amount_paid'] ?? $b['advance_amount'] ?? 0),
        'Remaining Balance (₹)' => (float)($b['remaining_balance'] ?? 0),
        'Payment Status' => strtoupper((string)($b['payment_status'] ?? '')),
        'Trip Status' => strtoupper((string)($b['status'] ?? $b['booking_status'] ?? '')),
        'Created At' => $b['created_at'] ?? '',
        'start_odometer' => $startOdo ?? '',
        'end_odometer' => $endOdo ?? '',
        'start_fastag' => $startFastag ?? '',
        'return_fastag' => $returnFastag ?? '',
    ];
}

$payments = Database::fetchAll("SELECT payment_id, booking_id, firebase_uid, amount, method, utr, status, verified_by, verified_at, created_at FROM payments");
$coupons = Database::fetchAll("SELECT code, discount_type, discount_value, min_order, active, used_count, expires_at FROM coupons");
$verification = Database::fetchAll("SELECT verification_id, firebase_uid, full_name, phone, license_number, license_status, aadhar_number, aadhar_status, pan_number, pan_status, overall_status FROM verification");

if ($format === 'json' || (!isset($_GET['format']) && !isset($_GET['csv']))) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'success',
        'data' => [
            'bookings' => $bookings ?: [],
            'payments' => $payments ?: [],
            'users' => $users ?: [],
            'vehicles' => $vehicles ?: [],
            'coupons' => $coupons ?: [],
            'verification' => $verification ?: []
        ],
        'exported_at' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// If CSV requested
$filename = "KRUIZLY_Database_Export_" . date('Y-m-d_His') . ".csv";
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Pragma: no-cache');
header('Expires: 0');

$out = fopen('php://output', 'w');
fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));

function writeSection($out, string $title, array $rows) {
    fputcsv($out, ["=== $title ==="]);
    if (!empty($rows)) {
        fputcsv($out, array_keys($rows[0]));
        foreach ($rows as $row) {
            fputcsv($out, array_values($row));
        }
    } else {
        fputcsv($out, ["No records found."]);
    }
    fputcsv($out, []);
}

writeSection($out, "BOOKINGS", $bookings);
writeSection($out, "PAYMENTS", $payments);
writeSection($out, "USERS", $users);
writeSection($out, "FLEET VEHICLES", $vehicles);
writeSection($out, "COUPONS", $coupons);
writeSection($out, "VERIFICATION (KYC)", $verification);

fclose($out);
exit;
