<?php
/**
 * api/admin/export.php
 * GET /api/admin/export/excel - Export MySQL database tables as an Excel workbook
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin');

$type = strtolower((string)($_GET['type'] ?? 'excel'));

// Fetch all database tables
$users = Database::fetchAll("SELECT id, firebase_uid, email, name, phone, age, role, status, license_status, aadhar_status, pan_status, created_at FROM users");
$vehicles = Database::fetchAll("SELECT reg_no, brand, model, year, category, transmission, fuel, seats, price_day, price_hour, security_deposit, available, status FROM vehicles");
$bookings = Database::fetchAll("SELECT booking_id, booking_number, firebase_uid, user_name, user_email, vehicle_name, vehicle_reg, pickup_date, drop_date, duration, base_amount, total_amount, advance_amount, remaining_balance, coupon_code, payment_status, status, created_at FROM bookings");
$payments = Database::fetchAll("SELECT payment_id, booking_id, firebase_uid, amount, method, utr, status, verified_by, verified_at, created_at FROM payments");
$coupons = Database::fetchAll("SELECT code, discount_type, discount_value, min_order, active, used_count, expires_at FROM coupons");
$verification = Database::fetchAll("SELECT verification_id, firebase_uid, full_name, phone, license_number, license_status, aadhar_number, aadhar_status, pan_number, pan_status, overall_status FROM verification");

$filename = "KRUIZLY_Database_Export_" . date('Y-m-d_His') . ".csv";

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Pragma: no-cache');
header('Expires: 0');

$out = fopen('php://output', 'w');

// Write BOM for UTF-8 Excel opening
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
    fputcsv($out, []); // Blank separator line
}

writeSection($out, "BOOKINGS", $bookings);
writeSection($out, "PAYMENTS", $payments);
writeSection($out, "USERS", $users);
writeSection($out, "FLEET VEHICLES", $vehicles);
writeSection($out, "COUPONS", $coupons);
writeSection($out, "VERIFICATION (KYC)", $verification);

fclose($out);
exit;
