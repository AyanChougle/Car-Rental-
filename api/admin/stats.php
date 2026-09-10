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
    $user = Auth::optionalAuth();

    // 1. Calculate live database statistics using DISTINCT to prevent duplicate counts
    $totalUsers = (int)(Database::fetchOne("SELECT COUNT(DISTINCT firebase_uid) as c FROM users")['c'] ?? 0);
    $totalBookings = (int)(Database::fetchOne("SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) as c FROM bookings")['c'] ?? 0);
    
    $pendingDocs = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT firebase_uid) as c FROM users WHERE license_status = 'pending' OR aadhar_status = 'pending' OR pan_status = 'pending'"
    )['c'] ?? 0);

    $pendingPayments = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(payment_id, ''), booking_id, id)) as c FROM payments WHERE status = 'pending'"
    )['c'] ?? 0);

    if ($pendingPayments === 0) {
        $pendingPayments = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) as c FROM bookings WHERE payment_status = 'pending_verification' OR (payment_ref IS NOT NULL AND payment_status NOT IN ('paid','advance_paid','rejected'))"
        )['c'] ?? 0);
    }

    $paidBookings = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) as c FROM bookings WHERE payment_status IN ('paid', 'advance_paid')"
    )['c'] ?? 0);

    $verifiedPaymentsSum = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(amount), 0) as s FROM (SELECT DISTINCT payment_id, amount FROM payments WHERE status = 'verified') t"
    )['s'] ?? 0.0);

    $paidBookingsSum = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(total_amount), 0) as s FROM (
            SELECT COALESCE(NULLIF(booking_id, ''), booking_number, id) as bid, MAX(total_amount) as total_amount 
            FROM bookings 
            WHERE payment_status IN ('paid', 'advance_paid') 
            GROUP BY COALESCE(NULLIF(booking_id, ''), booking_number, id)
        ) t"
    )['s'] ?? 0.0);

    $totalRevenue = max($verifiedPaymentsSum, $paidBookingsSum);

    $currentMonthRevenue = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(amount), 0) as s FROM (
            SELECT DISTINCT payment_id, amount 
            FROM payments 
            WHERE status = 'verified' AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())
        ) t"
    )['s'] ?? 0.0);

    if ($currentMonthRevenue <= 0 && $totalRevenue > 0) {
        $currentMonthRevenue = (float)(Database::fetchOne(
            "SELECT COALESCE(SUM(total_amount), 0) as s FROM (
                SELECT COALESCE(NULLIF(booking_id, ''), booking_number, id) as bid, MAX(total_amount) as total_amount 
                FROM bookings 
                WHERE payment_status IN ('paid', 'advance_paid') AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())
                GROUP BY COALESCE(NULLIF(booking_id, ''), booking_number, id)
            ) t"
        )['s'] ?? 0.0);
    }

    $avgBooking = $paidBookings > 0 ? round($totalRevenue / $paidBookings, 2) : 0.0;

    // Fleet & Operational Yard Statistics
    $totalFleetDb = (int)(Database::fetchOne("SELECT COUNT(DISTINCT reg_no) as c FROM vehicles WHERE status != 'removed'")['c'] ?? 0);
    $totalFleet = max(7, $totalFleetDb);

    $onRoadFleet = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(vehicle_reg, ''), vehicle_id)) as c FROM bookings 
         WHERE status IN ('active', 'in_trip', 'started') 
           AND status NOT IN ('completed', 'cancelled', 'rejected', 'returned')"
    )['c'] ?? 0);


    $availableInYard = max(0, $totalFleet - $onRoadFleet);
    $fleetUtilization = $totalFleet > 0 ? round(($onRoadFleet / $totalFleet) * 100) : 0;

    $liveStats = [
        'total_users' => $totalUsers,
        'total_bookings' => $totalBookings,
        'pending_docs' => $pendingDocs,
        'pending_payments' => $pendingPayments,
        'total_revenue' => $totalRevenue,
        'month_revenue' => $currentMonthRevenue,
        'paid_bookings' => $paidBookings,
        'avg_booking' => $avgBooking,
        'total_fleet' => $totalFleet,
        'fleet_count' => $totalFleet,
        'on_road_fleet' => $onRoadFleet,
        'active_rentals' => $onRoadFleet,
        'available_fleet' => $availableInYard,
        'available_in_yard' => $availableInYard,
        'fleet_utilization' => $fleetUtilization,
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

    // 4. Auto-create and sync kpi_metrics table in MySQL database
    try {
        Database::execute("
            CREATE TABLE IF NOT EXISTS kpi_metrics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                metric_date DATE NOT NULL UNIQUE,
                day_sales DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                week_sales DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                month_sales DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                total_bookings INT NOT NULL DEFAULT 0,
                paid_bookings INT NOT NULL DEFAULT 0,
                active_trips INT NOT NULL DEFAULT 0,
                completed_trips INT NOT NULL DEFAULT 0,
                total_fleet INT NOT NULL DEFAULT 7,
                on_road_fleet INT NOT NULL DEFAULT 0,
                in_yard_fleet INT NOT NULL DEFAULT 7,
                occupancy_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
                total_users INT NOT NULL DEFAULT 0,
                pending_payments INT NOT NULL DEFAULT 0,
                pending_docs INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        $todaySales = (float)(Database::fetchOne("
            SELECT COALESCE(SUM(amount), 0) as s FROM (
                SELECT DISTINCT payment_id, amount 
                FROM payments 
                WHERE status = 'verified' AND DATE(created_at) = CURRENT_DATE()
            ) t
        ")['s'] ?? 0.0);

        $weekSales = (float)(Database::fetchOne("
            SELECT COALESCE(SUM(amount), 0) as s FROM (
                SELECT DISTINCT payment_id, amount 
                FROM payments 
                WHERE status = 'verified' 
                  AND created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL (DAYOFWEEK(CURRENT_DATE()) - 1) DAY)
                  AND created_at <= DATE_ADD(DATE_SUB(CURRENT_DATE(), INTERVAL (DAYOFWEEK(CURRENT_DATE()) - 1) DAY), INTERVAL 6 DAY)
            ) t
        ")['s'] ?? 0.0);

        $completedTrips = (int)(Database::fetchOne("
            SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) as c 
            FROM bookings 
            WHERE status = 'completed'
        ")['c'] ?? 0);

        Database::execute("
            INSERT INTO kpi_metrics (
                metric_date, day_sales, week_sales, month_sales, total_revenue,
                total_bookings, paid_bookings, active_trips, completed_trips,
                total_fleet, on_road_fleet, in_yard_fleet, occupancy_pct,
                total_users, pending_payments, pending_docs
            ) VALUES (
                CURRENT_DATE(), ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?
            ) ON DUPLICATE KEY UPDATE
                day_sales = VALUES(day_sales),
                week_sales = VALUES(week_sales),
                month_sales = VALUES(month_sales),
                total_revenue = VALUES(total_revenue),
                total_bookings = VALUES(total_bookings),
                paid_bookings = VALUES(paid_bookings),
                active_trips = VALUES(active_trips),
                completed_trips = VALUES(completed_trips),
                total_fleet = VALUES(total_fleet),
                on_road_fleet = VALUES(on_road_fleet),
                in_yard_fleet = VALUES(in_yard_fleet),
                occupancy_pct = VALUES(occupancy_pct),
                total_users = VALUES(total_users),
                pending_payments = VALUES(pending_payments),
                pending_docs = VALUES(pending_docs),
                updated_at = CURRENT_TIMESTAMP
        ", [
            $todaySales,
            $weekSales,
            $currentMonthRevenue,
            $totalRevenue,
            $totalBookings,
            $paidBookings,
            $onRoadFleet,
            $completedTrips,
            $totalFleet,
            $onRoadFleet,
            $availableInYard,
            $fleetUtilization,
            $totalUsers,
            $pendingPayments,
            $pendingDocs
        ]);
    } catch (Throwable $_) {}

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