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
    $user = Auth::optionalAuth();

    /*
     * KRUIZLY KPI SOURCE OF TRUTH
     *
     * Reporting period supplied by the business:
     * July 2026    = 50,540
     * August 2026  = 281,857
     * September 2026 = 143,816 (current reporting month)
     * October 2026 is intentionally excluded until October revenue is recorded.
     *
     * Overall KPI revenue is the SUM of these saved monthly KPI records.
     * This intentionally does NOT use MAX(verified payments, paid bookings),
     * because those are different accounting sources and caused the previous
     * ₹133,816 / ₹124,316 mismatch.
     */
    $monthlyRevenue = [
        '2026-07-01' => 50540.00,
        '2026-08-01' => 281857.00,
        '2026-09-01' => 143816.00,
    ];

    // Live operational counts.
    $totalUsers = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT firebase_uid) AS c FROM users"
    )['c'] ?? 0);

    $totalBookings = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
         FROM bookings
         WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
           AND LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled', 'rejected')"
    )['c'] ?? 0);

    $pendingDocs = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT firebase_uid) AS c
         FROM users
         WHERE license_status = 'pending'
            OR aadhar_status = 'pending'
            OR pan_status = 'pending'"
    )['c'] ?? 0);

    $pendingPayments = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(payment_id, ''), booking_id, id)) AS c
         FROM payments
         WHERE status = 'pending'"
    )['c'] ?? 0);

    if ($pendingPayments === 0) {
        $pendingPayments = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
             FROM bookings
             WHERE payment_status = 'pending_verification'
                OR (payment_ref IS NOT NULL
                    AND payment_status NOT IN ('paid','advance_paid','rejected','cancelled'))"
        )['c'] ?? 0);
    }

    $paidBookings = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
         FROM bookings
         WHERE payment_status IN ('paid', 'advance_paid')"
    )['c'] ?? 0);

    $completedTrips = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
         FROM bookings
         WHERE status = 'completed'"
    )['c'] ?? 0);

    $totalFleetDb = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT reg_no) AS c FROM vehicles WHERE status != 'removed'"
    )['c'] ?? 0);
    $totalFleet = max(7, $totalFleetDb);

    $onRoadFleet = (int)(Database::fetchOne(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(vehicle_reg, ''), vehicle_id)) AS c
         FROM bookings
         WHERE status IN ('active', 'in_trip', 'started')"
    )['c'] ?? 0);

    $availableInYard = max(0, $totalFleet - $onRoadFleet);
    $fleetUtilization = $totalFleet > 0
        ? round(($onRoadFleet / $totalFleet) * 100)
        : 0;

    // Create the KPI history table if it is not present yet.
    Database::execute("CREATE TABLE IF NOT EXISTS kpi_metrics (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Remove invalid/stale KPI rows. October is not part of the current reporting ledger.
    try {
        Database::execute("DELETE FROM kpi_metrics WHERE metric_date = '0000-00-00'");
        Database::execute("DELETE FROM kpi_metrics WHERE metric_date = '2026-10-01'");
    } catch (Throwable $_) {}

    $monthlyRows = [];
    foreach ($monthlyRevenue as $monthStart => $revenue) {
        $monthEnd = date('Y-m-t', strtotime($monthStart));

        $bookingMonthSql = "COALESCE(pickup_date, created_at) >= ?
                            AND COALESCE(pickup_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)";

        $monthBookings = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
             FROM bookings
             WHERE {$bookingMonthSql}
               AND LOWER(COALESCE(status, '')) NOT IN ('cancelled','rejected')
               AND LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled','rejected')",
            [$monthStart, $monthEnd]
        )['c'] ?? 0);

        $monthPaidBookings = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
             FROM bookings
             WHERE {$bookingMonthSql}
               AND payment_status IN ('paid','advance_paid')",
            [$monthStart, $monthEnd]
        )['c'] ?? 0);

        $monthCompletedTrips = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
             FROM bookings
             WHERE status = 'completed'
               AND COALESCE(drop_date, updated_at, created_at) >= ?
               AND COALESCE(drop_date, updated_at, created_at) < DATE_ADD(?, INTERVAL 1 DAY)",
            [$monthStart, $monthEnd]
        )['c'] ?? 0);

        $monthUsers = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT firebase_uid) AS c
             FROM users
             WHERE created_at < DATE_ADD(?, INTERVAL 1 DAY)",
            [$monthEnd]
        )['c'] ?? 0);

        // Operational fleet fields are a snapshot. Historical trip status is not reconstructable
        // from the current bookings table, so only the current reporting month uses live status.
        $isCurrentMonth = ($monthStart === date('Y-m-01'));
        $rowOnRoad = $isCurrentMonth ? $onRoadFleet : 0;
        $rowYard = max(0, $totalFleet - $rowOnRoad);
        $rowOccupancy = $totalFleet > 0 ? round(($rowOnRoad / $totalFleet) * 100, 2) : 0;
        $rowActive = $isCurrentMonth ? $onRoadFleet : 0;
        $rowPendingPayments = $isCurrentMonth ? $pendingPayments : 0;
        $rowPendingDocs = $isCurrentMonth ? $pendingDocs : 0;
        $rowUsers = $isCurrentMonth ? $totalUsers : $monthUsers;

        Database::execute(
            "INSERT INTO kpi_metrics (
                metric_date, day_sales, week_sales, month_sales, total_revenue,
                total_bookings, paid_bookings, active_trips, completed_trips,
                total_fleet, on_road_fleet, in_yard_fleet, occupancy_pct,
                total_users, pending_payments, pending_docs
            ) VALUES (?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
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
                updated_at = CURRENT_TIMESTAMP",
            [
                $monthStart,
                $revenue,
                $revenue,
                $monthBookings,
                $monthPaidBookings,
                $rowActive,
                $monthCompletedTrips,
                $totalFleet,
                $rowOnRoad,
                $rowYard,
                $rowOccupancy,
                $rowUsers,
                $rowPendingPayments,
                $rowPendingDocs,
            ]
        );

        $monthlyRows[$monthStart] = [
            'metric_date' => $monthStart,
            'month_sales' => (float)$revenue,
            'total_revenue' => (float)$revenue,
            'total_bookings' => $monthBookings,
            'paid_bookings' => $monthPaidBookings,
            'active_trips' => $rowActive,
            'completed_trips' => $monthCompletedTrips,
            'total_fleet' => $totalFleet,
            'on_road_fleet' => $rowOnRoad,
            'in_yard_fleet' => $rowYard,
            'occupancy_pct' => $rowOccupancy,
            'total_users' => $rowUsers,
            'pending_payments' => $rowPendingPayments,
            'pending_docs' => $rowPendingDocs,
        ];
    }

    $overallRevenue = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(month_sales), 0) AS s
         FROM kpi_metrics
         WHERE metric_date IN ('2026-07-01','2026-08-01','2026-09-01')"
    )['s'] ?? 0.0);

    $currentMonthKey = date('Y-m-01');
    $previousMonthKey = date('Y-m-01', strtotime('-1 month'));
    $currentMonthRevenue = (float)($monthlyRows[$currentMonthKey]['month_sales'] ?? 0.0);
    $lastMonthRevenue = (float)($monthlyRows[$previousMonthKey]['month_sales'] ?? 0.0);

    $avgBooking = $paidBookings > 0 ? round($overallRevenue / $paidBookings, 2) : 0.0;

    $liveStats = [
        'total_users' => $totalUsers,
        'total_bookings' => $totalBookings,
        'pending_docs' => $pendingDocs,
        'pending_payments' => $pendingPayments,
        'total_revenue' => $overallRevenue,
        'month_revenue' => $currentMonthRevenue,
        'last_month_revenue' => $lastMonthRevenue,
        'paid_bookings' => $paidBookings,
        'avg_booking' => $avgBooking,
        'active_trips' => $onRoadFleet,
        'completed_trips' => $completedTrips,
        'total_fleet' => $totalFleet,
        'fleet_count' => $totalFleet,
        'on_road_fleet' => $onRoadFleet,
        'active_rentals' => $onRoadFleet,
        'available_fleet' => $availableInYard,
        'available_in_yard' => $availableInYard,
        'fleet_utilization' => $fleetUtilization,
    ];

    // Load optional admin overrides. Revenue is deliberately excluded from override handling
    // so the saved monthly KPI ledger remains the single source of truth.
    $overrideSetting = Database::fetchOne(
        "SELECT `value` FROM settings WHERE `key` = 'kpi_stats_override' LIMIT 1"
    );
    $overrides = null;
    if ($overrideSetting && !empty($overrideSetting['value'])) {
        $decoded = json_decode($overrideSetting['value'], true);
        if (is_array($decoded) && ($decoded['enabled'] ?? false)) {
            $overrides = $decoded;
        }
    }

    $effectiveStats = $liveStats;
    if ($overrides) {
        foreach ($liveStats as $k => $v) {
            // Revenue remains ledger-controlled; all other supported values can still be overridden.
            if (in_array($k, ['total_revenue','month_revenue','last_month_revenue'], true)) continue;
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
            'is_overridden' => $overrides !== null,
            'monthly' => $monthlyRows,
            'reporting_month' => $currentMonthKey,
            'previous_month' => $previousMonthKey,
            'revenue_ledger' => $monthlyRevenue,
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