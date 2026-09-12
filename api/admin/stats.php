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
    try {
        $user = Auth::optionalAuth();

    // 1. Live operational counts.
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

    // Operational on-road fleet: count vehicles currently on active trip or confirmed within operational dates
    $onRoadFleet = 0;
    try {
        $onRoadFleet = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT COALESCE(NULLIF(b.vehicle_reg, ''), b.vehicle_id, v.reg_no)) AS c
             FROM bookings b
             LEFT JOIN vehicles v ON (b.vehicle_id = v.id)
             WHERE (
                 b.status IN ('active', 'in_trip', 'started')
                 OR (b.status = 'confirmed' AND CURRENT_TIMESTAMP >= b.pickup_date AND CURRENT_TIMESTAMP <= b.drop_date)
             )
             AND LOWER(COALESCE(b.status, '')) NOT IN ('completed', 'cancelled', 'rejected')"
        )['c'] ?? 0);
    } catch (Throwable $_) {
        $onRoadFleet = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT COALESCE(NULLIF(vehicle_reg, ''), vehicle_id)) AS c
             FROM bookings
             WHERE status IN ('active', 'in_trip', 'started')"
        )['c'] ?? 0);
    }
    $onRoadFleet = max(0, $onRoadFleet);

    $availableInYard = max(0, $totalFleet - $onRoadFleet);
    $fleetUtilization = $totalFleet > 0
        ? round(($onRoadFleet / $totalFleet) * 100)
        : 0;

    // Calculate today's Day Sales
    $daySales = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM payments
         WHERE status = 'verified' AND DATE(created_at) = CURRENT_DATE()"
    )['s'] ?? 0.0);
    if ($daySales <= 0) {
        $daySales = (float)(Database::fetchOne(
            "SELECT COALESCE(SUM(
                CASE WHEN payment_status = 'advance_paid' THEN COALESCE(advance_amount, 500)
                     ELSE COALESCE(final_amount, total_amount, base_amount, 0) END
            ), 0) AS s FROM bookings
            WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
              AND LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled', 'rejected')
              AND (payment_status IN ('paid', 'advance_paid', 'verified') OR status IN ('completed', 'active', 'confirmed', 'in_trip'))
              AND DATE(COALESCE(created_at, pickup_date)) = CURRENT_DATE()"
        )['s'] ?? 0.0);
    }

    // Calculate this week's Week Sales
    $weekSales = (float)(Database::fetchOne(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM payments
         WHERE status = 'verified'
           AND created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL (DAYOFWEEK(CURRENT_DATE()) - 1) DAY)
           AND created_at <= DATE_ADD(DATE_SUB(CURRENT_DATE(), INTERVAL (DAYOFWEEK(CURRENT_DATE()) - 1) DAY), INTERVAL 6 DAY)"
    )['s'] ?? 0.0);
    if ($weekSales <= 0) {
        $weekSales = (float)(Database::fetchOne(
            "SELECT COALESCE(SUM(
                CASE WHEN payment_status = 'advance_paid' THEN COALESCE(advance_amount, 500)
                     ELSE COALESCE(final_amount, total_amount, base_amount, 0) END
            ), 0) AS s FROM bookings
            WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
              AND LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled', 'rejected')
              AND (payment_status IN ('paid', 'advance_paid', 'verified') OR status IN ('completed', 'active', 'confirmed', 'in_trip'))
              AND COALESCE(created_at, pickup_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL (DAYOFWEEK(CURRENT_DATE()) - 1) DAY)
              AND COALESCE(created_at, pickup_date) <= DATE_ADD(DATE_SUB(CURRENT_DATE(), INTERVAL (DAYOFWEEK(CURRENT_DATE()) - 1) DAY), INTERVAL 6 DAY)"
        )['s'] ?? 0.0);
    }

    // Create the KPI history table if it is not present yet, and auto-heal missing columns
    try {
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

        try { Database::execute("ALTER TABLE kpi_metrics ADD COLUMN day_sales DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER metric_date"); } catch (Throwable $_) {}
        try { Database::execute("ALTER TABLE kpi_metrics ADD COLUMN week_sales DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER day_sales"); } catch (Throwable $_) {}
    } catch (Throwable $_) {}

    // Discover all months with activity in database, including historical accounting months
    $knownMonths = [
        '2026-07-01' => true,
        '2026-08-01' => true,
        '2026-09-01' => true,
    ];
    $currentMonthKey = date('Y-m-01');
    $knownMonths[$currentMonthKey] = true;

    try {
        $dbMonths = Database::fetchAll(
            "SELECT DISTINCT DATE_FORMAT(COALESCE(pickup_date, created_at), '%Y-%m-01') AS m
             FROM bookings
             WHERE COALESCE(pickup_date, created_at) IS NOT NULL
               AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
             UNION
             SELECT DISTINCT DATE_FORMAT(created_at, '%Y-%m-01') AS m
             FROM payments
             WHERE created_at IS NOT NULL"
        );
        foreach ($dbMonths as $dm) {
            $mKey = $dm['m'] ?? null;
            if ($mKey && preg_match('/^\d{4}-\d{2}-01$/', $mKey)) {
                $knownMonths[$mKey] = true;
            }
        }
    } catch (Throwable $_) {}

    ksort($knownMonths);

    // Auto-calculate dynamic revenue for each month
    $monthlyRows = [];
    $monthlyRevenue = [];

    foreach (array_keys($knownMonths) as $monthStart) {
        $monthEnd = date('Y-m-t', strtotime($monthStart));

        // Booking query within this month window
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

        // Sum verified payments/bookings from DB for this month
        $dbMonthRevenue = (float)(Database::fetchOne(
            "SELECT COALESCE(SUM(
                CASE
                    WHEN payment_status = 'advance_paid' THEN COALESCE(advance_amount, 500)
                    ELSE COALESCE(final_amount, total_amount, base_amount, 0)
                END
            ), 0) AS s
            FROM bookings
            WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
              AND LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled', 'rejected')
              AND (
                  payment_status IN ('paid', 'advance_paid', 'verified')
                  OR status IN ('completed', 'active', 'confirmed', 'in_trip', 'started')
              )
              AND {$bookingMonthSql}",
            [$monthStart, $monthEnd]
        )['s'] ?? 0.0);

        // Calculate dynamic month revenue:
        // July & August retain historical accounting baselines unless DB exceeds it
        // September starts with verified 10-booking baseline (₹143,816) + auto-adds any new bookings created
        // Any subsequent months (October, etc.) are 100% dynamically derived from verified bookings/payments
        if ($monthStart === '2026-07-01') {
            $monthRev = max(50540.00, $dbMonthRevenue);
        } elseif ($monthStart === '2026-08-01') {
            $monthRev = max(281857.00, $dbMonthRevenue);
        } elseif ($monthStart === '2026-09-01') {
            $newSeptAdditions = (float)(Database::fetchOne(
                "SELECT COALESCE(SUM(
                    CASE
                        WHEN payment_status = 'advance_paid' THEN COALESCE(advance_amount, 500)
                        ELSE COALESCE(final_amount, total_amount, base_amount, 0)
                    END
                ), 0) AS s
                FROM bookings
                WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
                  AND LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled', 'rejected')
                  AND (
                      payment_status IN ('paid', 'advance_paid', 'verified')
                      OR status IN ('completed', 'active', 'confirmed', 'in_trip', 'started')
                  )
                  AND {$bookingMonthSql}
                  AND UPPER(COALESCE(booking_id, booking_number, '')) NOT LIKE 'KRZ-SEP-%'",
                [$monthStart, $monthEnd]
            )['s'] ?? 0.0);
            $monthRev = max(143816.00 + $newSeptAdditions, $dbMonthRevenue);
        } else {
            $monthRev = $dbMonthRevenue;
        }

        $monthlyRevenue[$monthStart] = $monthRev;

        $isCurrentMonth = ($monthStart === $currentMonthKey);
        $rowOnRoad = $isCurrentMonth ? $onRoadFleet : 0;
        $rowYard = max(0, $totalFleet - $rowOnRoad);
        $rowOccupancy = $totalFleet > 0 ? round(($rowOnRoad / $totalFleet) * 100, 2) : 0;
        $rowActive = $isCurrentMonth ? $onRoadFleet : 0;
        $rowPendingPayments = $isCurrentMonth ? $pendingPayments : 0;
        $rowPendingDocs = $isCurrentMonth ? $pendingDocs : 0;
        $rowUsers = $isCurrentMonth ? $totalUsers : $monthUsers;
        $rowDaySales = $isCurrentMonth ? $daySales : 0.0;
        $rowWeekSales = $isCurrentMonth ? $weekSales : 0.0;

        // Auto-sync into MySQL kpi_metrics table (fail-safe)
        try {
            Database::execute(
                "INSERT INTO kpi_metrics (
                    metric_date, day_sales, week_sales, month_sales, total_revenue,
                    total_bookings, paid_bookings, active_trips, completed_trips,
                    total_fleet, on_road_fleet, in_yard_fleet, occupancy_pct,
                    total_users, pending_payments, pending_docs
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
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
                    updated_at = CURRENT_TIMESTAMP",
                [
                    $monthStart,
                    $rowDaySales,
                    $rowWeekSales,
                    $monthRev,
                    $monthRev,
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
        } catch (Throwable $_) {}

        $monthlyRows[$monthStart] = [
            'metric_date' => $monthStart,
            'day_sales' => $rowDaySales,
            'week_sales' => $rowWeekSales,
            'month_sales' => (float)$monthRev,
            'total_revenue' => (float)$monthRev,
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

    // Dynamic Total Revenue is the grand sum across all active and recorded monthly ledgers
    $overallRevenue = array_sum($monthlyRevenue);

    $previousMonthKey = date('Y-m-01', strtotime('-1 month'));
    $currentMonthRevenue = (float)($monthlyRows[$currentMonthKey]['month_sales'] ?? 0.0);
    $lastMonthRevenue = (float)($monthlyRows[$previousMonthKey]['month_sales'] ?? 0.0);

    $avgBooking = $paidBookings > 0 ? round($overallRevenue / $paidBookings, 2) : 0.0;

    $liveStats = [
        'total_users' => $totalUsers,
        'total_bookings' => $totalBookings,
        'pending_docs' => $pendingDocs,
        'pending_payments' => $pendingPayments,
        'day_sales' => $daySales,
        'week_sales' => $weekSales,
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
            'success' => true,
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
    } catch (Throwable $e) {
        error_log("stats.php exception: " . $e->getMessage());
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'error',
            'success' => false,
            'message' => $e->getMessage(),
            'file' => basename($e->getFile()),
            'line' => $e->getLine()
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
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