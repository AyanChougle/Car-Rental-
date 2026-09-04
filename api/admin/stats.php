<?php
/**
 * api/admin/stats.php
 * GET  - Get live and overridden KPI stats for admin, manager, and executive panels
 * POST - (Admin only) Set or clear custom KPI stat overrides to reflect across all panels
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method === 'GET') {
    // Accessible to logged-in staff (admin, manager, executive) or authenticated users
    $user = Auth::authenticate();

    // 1. Calculate live database statistics
    $totalUsers = (int)(Database::fetchOne("SELECT COUNT(*) as c FROM users")['c'] ?? 0);
    $totalBookings = (int)(Database::fetchOne("SELECT COUNT(*) as c FROM bookings")['c'] ?? 0);
    
    $pendingDocs = (int)(Database::fetchOne(
        "SELECT COUNT(*) as c FROM users WHERE license_status = 'pending' OR aadhar_status = 'pending' OR pan_status = 'pending'"
    )['c'] ?? 0);

    $pendingPayments = (int)(Database::fetchOne(
        "SELECT COUNT(*) as c FROM payments WHERE status = 'pending'"
    )['c'] ?? 0);

    if ($pendingPayments === 0) {
        $pendingPayments = (int)(Database::fetchOne(
            "SELECT COUNT(*) as c FROM bookings WHERE payment_status = 'pending_verification' OR (payment_ref IS NOT NULL AND payment_status NOT IN ('paid','advance_paid','rejected'))"
        )['c'] ?? 0);
    }

    $paidBookings = (int)(Database::fetchOne(
        "SELECT COUNT(*) as c FROM bookings WHERE payment_status IN ('paid', 'advance_paid')"
    )['c'] ?? 0);

    $verifiedPaymentsSum = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE status = 'verified'"
    )['s'] ?? 0.0);

    $paidBookingsSum = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(total_amount), 0) as s FROM bookings WHERE payment_status IN ('paid', 'advance_paid')"
    )['s'] ?? 0.0);

    $totalRevenue = max($verifiedPaymentsSum, $paidBookingsSum);

    $currentMonthRevenue = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE status = 'verified' AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())"
    )['s'] ?? 0.0);

    if ($currentMonthRevenue <= 0 && $totalRevenue > 0) {
        $currentMonthRevenue = (float)(Database::fetchOne(
            "SELECT COALESCE(SUM(total_amount), 0) as s FROM bookings WHERE payment_status IN ('paid', 'advance_paid') AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())"
        )['s'] ?? 0.0);
    }

    $avgBooking = $paidBookings > 0 ? round($totalRevenue / $paidBookings, 2) : 0.0;

    $liveStats = [
        'total_users' => $totalUsers,
        'total_bookings' => $totalBookings,
        'pending_docs' => $pendingDocs,
        'pending_payments' => $pendingPayments,
        'total_revenue' => $totalRevenue,
        'month_revenue' => $currentMonthRevenue,
        'paid_bookings' => $paidBookings,
        'avg_booking' => $avgBooking,
    ];

    // 2. Load overrides from settings table
    $overrideSetting = Database::fetchOne("SELECT `value` FROM settings WHERE `key` = 'kpi_stats_override' LIMIT 1");
    $overrides = null;
    if ($overrideSetting && !empty($overrideSetting['value'])) {
        $decoded = json_decode($overrideSetting['value'], true);
        if (is_array($decoded) && ($decoded['enabled'] ?? false)) {
            $overrides = $decoded;
        }
    }

    // 3. Form effective stats (overrides take precedence if present and enabled)
    $effectiveStats = $liveStats;
    if ($overrides) {
        foreach ($liveStats as $k => $v) {
            if (isset($overrides[$k]) && $overrides[$k] !== '' && $overrides[$k] !== null) {
                $effectiveStats[$k] = is_numeric($overrides[$k]) ? (float)$overrides[$k] : $overrides[$k];
            }
        }
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'success',
        'data' => [
            'live' => $liveStats,
            'overrides' => $overrides,
            'effective' => $effectiveStats,
            'is_overridden' => $overrides !== null
        ]
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    // Only Admin can modify KPI overrides
    $user = Auth::requireRole('admin');

    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?? [];

    $enabled = !empty($input['enabled']);
    $overrides = [
        'enabled' => $enabled,
        'total_users' => isset($input['total_users']) && $input['total_users'] !== '' ? (int)$input['total_users'] : null,
        'total_bookings' => isset($input['total_bookings']) && $input['total_bookings'] !== '' ? (int)$input['total_bookings'] : null,
        'pending_docs' => isset($input['pending_docs']) && $input['pending_docs'] !== '' ? (int)$input['pending_docs'] : null,
        'pending_payments' => isset($input['pending_payments']) && $input['pending_payments'] !== '' ? (int)$input['pending_payments'] : null,
        'total_revenue' => isset($input['total_revenue']) && $input['total_revenue'] !== '' ? (float)$input['total_revenue'] : null,
        'month_revenue' => isset($input['month_revenue']) && $input['month_revenue'] !== '' ? (float)$input['month_revenue'] : null,
        'paid_bookings' => isset($input['paid_bookings']) && $input['paid_bookings'] !== '' ? (int)$input['paid_bookings'] : null,
        'avg_booking' => isset($input['avg_booking']) && $input['avg_booking'] !== '' ? (float)$input['avg_booking'] : null,
        'updated_by' => $user['email'] ?? 'admin',
        'updated_at' => date('Y-m-d H:i:s')
    ];

    $jsonVal = json_encode($overrides, JSON_UNESCAPED_UNICODE);

    // Save to settings table
    Database::execute(
        "INSERT INTO settings (`key`, `value`) VALUES ('kpi_stats_override', ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = CURRENT_TIMESTAMP",
        [$jsonVal]
    );

    // Log admin audit activity if table exists
    try {
        Database::execute(
            "INSERT INTO audit_logs (firebase_uid, action, resource_type, resource_id, details, ip_address) 
             VALUES (?, 'update_kpi_stats', 'settings', 'kpi_stats_override', ?, ?)",
            [
                $user['firebase_uid'] ?? 'admin',
                $jsonVal,
                $_SERVER['REMOTE_ADDR'] ?? null
            ]
        );
    } catch (Throwable $_) {}

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'success',
        'message' => $enabled ? 'KPI metrics customized successfully.' : 'Reset to live database calculation.',
        'data' => $overrides
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);