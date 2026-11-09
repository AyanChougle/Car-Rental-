<?php
/**
 * api/admin/stats.php
 * GET  - Get KPI stats directly from database tables (`kpi_hub_metrics` and `kpi_metrics`)
 * POST - (Admin only) Update KPI metrics directly in MySQL (`kpi_hub_metrics` and `kpi_metrics`)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function ensureKpiHubMetricsTable(): void {
    try {
        Database::execute(
            "CREATE TABLE IF NOT EXISTS `kpi_hub_metrics` (
              `id` INT AUTO_INCREMENT PRIMARY KEY,
              `hub_id` INT NOT NULL UNIQUE,
              `hub_name` VARCHAR(255) NOT NULL,
              `total_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `month_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `total_bookings` INT NOT NULL DEFAULT 0,
              `paid_bookings` INT NOT NULL DEFAULT 0,
              `active_trips` INT NOT NULL DEFAULT 0,
              `total_fleet` INT NOT NULL DEFAULT 0,
              `on_road_fleet` INT NOT NULL DEFAULT 0,
              `available_fleet` INT NOT NULL DEFAULT 0,
              `occupancy_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
              `total_users` INT NOT NULL DEFAULT 0,
              `pending_docs` INT NOT NULL DEFAULT 0,
              `pending_payments` INT NOT NULL DEFAULT 0,
              `day_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `week_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
              `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX `idx_hub_metrics_hub` (`hub_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
        );

        // Seed initial rows only if table is completely empty with zero baseline defaults
        $cnt = (int)(Database::fetchOne("SELECT COUNT(*) AS c FROM `kpi_hub_metrics`")['c'] ?? 0);
        if ($cnt === 0) {
            Database::execute(
                "INSERT INTO `kpi_hub_metrics` 
                 (`hub_id`, `hub_name`, `total_revenue`, `month_revenue`, `total_bookings`, `paid_bookings`, `active_trips`, `total_fleet`, `on_road_fleet`, `available_fleet`, `occupancy_pct`, `total_users`, `pending_docs`, `pending_payments`, `day_sales`, `week_sales`)
                 VALUES
                 (0, 'All Operating Hubs', 0.00, 0.00, 0, 0, 0, 0, 0, 0, 0.00, 0, 0, 0, 0.00, 0.00),
                 (1, 'Gavson Business Park, Ghansoli', 0.00, 0.00, 0, 0, 0, 0, 0, 0, 0.00, 0, 0, 0, 0.00, 0.00),
                 (2, 'Kandivali Hub, Mumbai', 0.00, 0.00, 0, 0, 0, 0, 0, 0, 0.00, 0, 0, 0, 0.00, 0.00)
                 ON DUPLICATE KEY UPDATE `hub_name` = VALUES(`hub_name`)"
            );
        }
    } catch (Throwable $e) {
        error_log("[ensureKpiHubMetricsTable] " . $e->getMessage());
    }
}

if ($method === 'GET') {
    try {
        $user = Auth::requireRole('admin', 'manager', 'accountant');

        ensureKpiHubMetricsTable();

        $forceSync = isset($_GET['sync']) || isset($_GET['recalculate']) || isset($_GET['force']);

        // 1. Fetch persistent KPI rows directly from kpi_hub_metrics table in MySQL
        $existingHubRows = Database::fetchAll("SELECT * FROM `kpi_hub_metrics` ORDER BY `hub_id` ASC") ?: [];

        require_once __DIR__ . '/../services/KpiService.php';

        // Only run syncMetrics with database persistence if table is completely empty or explicit sync requested
        if (empty($existingHubRows) || $forceSync) {
            KpiService::syncMetrics(true);
            $existingHubRows = Database::fetchAll("SELECT * FROM `kpi_hub_metrics` ORDER BY `hub_id` ASC") ?: [];
        }

        // 2. Fetch fleet revenue breakdown in-memory without overwriting kpi_hub_metrics or kpi_metrics tables
        $calcData = KpiService::syncMetrics(false);
        $fleetRevenue = $calcData['fleet'] ?? [];

        // 3. Map actual database rows from kpi_hub_metrics table (strictly preserving any manual phpMyAdmin edits)
        $hubsMap = [];
        $allHubRow = null;
        foreach ($existingHubRows as $hr) {
            $hId = (int)$hr['hub_id'];
            $paidCount = (int)($hr['paid_bookings'] ?? 0);
            $totRev = (float)($hr['total_revenue'] ?? 0.0);
            $avgBk = $paidCount > 0 ? round($totRev / $paidCount, 2) : 0.0;
            $totFleet = (int)($hr['total_fleet'] ?? 0);
            $onRoad = (int)($hr['on_road_fleet'] ?? $hr['active_trips'] ?? 0);
            $availFleet = (int)($hr['available_fleet'] ?? max(0, $totFleet - $onRoad));
            $occPct = (float)($hr['occupancy_pct'] ?? ($totFleet > 0 ? min(100.0, round(($onRoad / $totFleet) * 100, 2)) : 0.0));

            $hubsMap[$hId] = [
                'hub_id' => $hId,
                'hub_name' => (string)($hr['hub_name'] ?? ($hId === 2 ? 'Kandivali Hub, Mumbai' : ($hId === 1 ? 'Gavson Business Park, Ghansoli' : 'All Operating Hubs'))),
                'total_revenue' => $totRev,
                'month_revenue' => (float)($hr['month_revenue'] ?? 0.0),
                'total_bookings' => (int)($hr['total_bookings'] ?? 0),
                'paid_bookings' => $paidCount,
                'active_trips' => (int)($hr['active_trips'] ?? $onRoad),
                'active_rentals' => (int)($hr['active_trips'] ?? $onRoad),
                'completed_trips' => max(0, (int)($hr['total_bookings'] ?? 0) - (int)($hr['active_trips'] ?? $onRoad)),
                'total_fleet' => $totFleet,
                'fleet_count' => $totFleet,
                'on_road_fleet' => $onRoad,
                'available_fleet' => $availFleet,
                'available_in_yard' => $availFleet,
                'in_yard_fleet' => $availFleet,
                'occupancy_pct' => $occPct,
                'fleet_utilization' => $occPct,
                'total_users' => (int)($hr['total_users'] ?? 0),
                'pending_docs' => (int)($hr['pending_docs'] ?? 0),
                'pending_payments' => (int)($hr['pending_payments'] ?? 0),
                'day_sales' => (float)($hr['day_sales'] ?? 0.0),
                'week_sales' => (float)($hr['week_sales'] ?? 0.0),
                'avg_booking' => $avgBk,
                'updated_at' => $hr['updated_at'] ?? null,
            ];

            if ($hId === 0) {
                $allHubRow = $hubsMap[$hId];
            }
        }

        if (!$allHubRow && !empty($hubsMap)) {
            $allHubRow = reset($hubsMap);
        }

        $liveStats = $allHubRow ?? [
            'total_users' => 0,
            'total_bookings' => 0,
            'pending_docs' => 0,
            'pending_payments' => 0,
            'day_sales' => 0.0,
            'week_sales' => 0.0,
            'total_revenue' => 0.0,
            'month_revenue' => 0.0,
            'last_month_revenue' => 0.0,
            'paid_bookings' => 0,
            'avg_booking' => 0.0,
            'active_trips' => 0,
            'active_rentals' => 0,
            'completed_trips' => 0,
            'total_fleet' => 0,
            'fleet_count' => 0,
            'on_road_fleet' => 0,
            'available_fleet' => 0,
            'available_in_yard' => 0,
            'in_yard_fleet' => 0,
            'fleet_utilization' => 0.0,
            'occupancy_pct' => 0.0,
        ];

        // 4. Read monthly rows directly from kpi_metrics table in MySQL
        $kpiMetricsRows = Database::fetchAll("SELECT * FROM `kpi_metrics` ORDER BY `metric_date` ASC") ?: [];
        $monthlyRows = [];
        foreach ($kpiMetricsRows as $km) {
            $mKey = date('Y-m-01', strtotime((string)$km['metric_date']));
            $monthlyRows[$mKey] = $km;
        }

        $currentMonthKey = date('Y-m-01');
        $previousMonthKey = date('Y-m-01', strtotime('-1 month'));

        // Keep current reporting month row strictly aligned with current kpi_hub_metrics table
        if (!isset($monthlyRows[$currentMonthKey])) {
            $monthlyRows[$currentMonthKey] = [
                'metric_date' => $currentMonthKey,
                'day_sales' => $liveStats['day_sales'],
                'week_sales' => $liveStats['week_sales'],
                'month_sales' => $liveStats['month_revenue'],
                'total_revenue' => $liveStats['total_revenue'],
                'total_bookings' => $liveStats['total_bookings'],
                'paid_bookings' => $liveStats['paid_bookings'],
                'active_trips' => $liveStats['active_trips'],
                'completed_trips' => $liveStats['completed_trips'],
                'total_fleet' => $liveStats['total_fleet'],
                'on_road_fleet' => $liveStats['on_road_fleet'],
                'in_yard_fleet' => $liveStats['available_fleet'],
                'occupancy_pct' => $liveStats['occupancy_pct'],
                'total_users' => $liveStats['total_users'],
                'pending_payments' => $liveStats['pending_payments'],
                'pending_docs' => $liveStats['pending_docs'],
            ];
        } else {
            if ($liveStats['month_revenue'] > 0) {
                $monthlyRows[$currentMonthKey]['month_sales'] = $liveStats['month_revenue'];
            }
            if ($liveStats['total_revenue'] > 0) {
                $monthlyRows[$currentMonthKey]['total_revenue'] = $liveStats['total_revenue'];
            }
        }

        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'success',
            'success' => true,
            'data' => [
                'live' => $liveStats,
                'effective' => $liveStats,
                'hubs' => $hubsMap,
                'monthly' => $monthlyRows,
                'fleet' => $fleetRevenue,
                'reporting_month' => $currentMonthKey,
                'previous_month' => $previousMonthKey,
            ]
        ], JSON_UNESCAPED_UNICODE);
        exit;
    } catch (Throwable $e) {
        error_log("stats.php exception: " . $e->getMessage());
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'error',
            'success' => false,
            'message' => $e->getMessage()
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

if ($method === 'POST') {
    // Only Admin can modify KPI metrics in database
    $user = Auth::requireRole('admin');

    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?? [];

    ensureKpiHubMetricsTable();

    $hubId = isset($input['hub_id']) ? (int)$input['hub_id'] : 0;
    $hubName = $hubId === 2 ? 'Kandivali Hub, Mumbai' : ($hubId === 1 ? 'Gavson Business Park, Ghansoli' : 'All Operating Hubs');

    // Read current existing row from database to preserve untouched fields
    $existing = Database::fetchOne("SELECT * FROM `kpi_hub_metrics` WHERE `hub_id` = ?", [$hubId]) ?: [];

    $totalRevenue = isset($input['total_revenue']) && $input['total_revenue'] !== '' ? (float)$input['total_revenue'] : (float)($existing['total_revenue'] ?? 0.0);
    $monthRevenue = isset($input['month_revenue']) && $input['month_revenue'] !== '' ? (float)$input['month_revenue'] : (float)($existing['month_revenue'] ?? 0.0);
    $totalBookings = isset($input['total_bookings']) && $input['total_bookings'] !== '' ? (int)$input['total_bookings'] : (int)($existing['total_bookings'] ?? 0);
    $paidBookings = isset($input['paid_bookings']) && $input['paid_bookings'] !== '' ? (int)$input['paid_bookings'] : (int)($existing['paid_bookings'] ?? 0);
    $activeTrips = isset($input['active_trips']) && $input['active_trips'] !== '' ? (int)$input['active_trips'] : (isset($input['on_road_fleet']) && $input['on_road_fleet'] !== '' ? (int)$input['on_road_fleet'] : (int)($existing['active_trips'] ?? 0));
    $totalFleet = isset($input['total_fleet']) && $input['total_fleet'] !== '' ? (int)$input['total_fleet'] : (int)($existing['total_fleet'] ?? 0);
    $onRoadFleet = isset($input['on_road_fleet']) && $input['on_road_fleet'] !== '' ? (int)$input['on_road_fleet'] : $activeTrips;
    $availableFleet = max(0, $totalFleet - $onRoadFleet);
    $occupancyPct = $totalFleet > 0 ? round(($onRoadFleet / $totalFleet) * 100, 2) : 0.0;
    $totalUsers = isset($input['total_users']) && $input['total_users'] !== '' ? (int)$input['total_users'] : (int)($existing['total_users'] ?? 0);
    $pendingDocs = isset($input['pending_docs']) && $input['pending_docs'] !== '' ? (int)$input['pending_docs'] : (int)($existing['pending_docs'] ?? 0);
    $pendingPayments = isset($input['pending_payments']) && $input['pending_payments'] !== '' ? (int)$input['pending_payments'] : (int)($existing['pending_payments'] ?? 0);
    $daySales = isset($input['day_sales']) && $input['day_sales'] !== '' ? (float)$input['day_sales'] : (float)($existing['day_sales'] ?? 0.0);
    $weekSales = isset($input['week_sales']) && $input['week_sales'] !== '' ? (float)$input['week_sales'] : (float)($existing['week_sales'] ?? 0.0);

    // Save directly into kpi_hub_metrics table in MySQL
    Database::execute(
        "INSERT INTO `kpi_hub_metrics` (
          `hub_id`, `hub_name`, `total_revenue`, `month_revenue`, `total_bookings`, `paid_bookings`,
          `active_trips`, `total_fleet`, `on_road_fleet`, `available_fleet`, `occupancy_pct`,
          `total_users`, `pending_docs`, `pending_payments`, `day_sales`, `week_sales`, `updated_at`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          `total_revenue` = VALUES(`total_revenue`),
          `month_revenue` = VALUES(`month_revenue`),
          `total_bookings` = VALUES(`total_bookings`),
          `paid_bookings` = VALUES(`paid_bookings`),
          `active_trips` = VALUES(`active_trips`),
          `total_fleet` = VALUES(`total_fleet`),
          `on_road_fleet` = VALUES(`on_road_fleet`),
          `available_fleet` = VALUES(`available_fleet`),
          `occupancy_pct` = VALUES(`occupancy_pct`),
          `total_users` = VALUES(`total_users`),
          `pending_docs` = VALUES(`pending_docs`),
          `pending_payments` = VALUES(`pending_payments`),
          `day_sales` = VALUES(`day_sales`),
          `week_sales` = VALUES(`week_sales`),
          `updated_at` = CURRENT_TIMESTAMP",
        [
            $hubId, $hubName, $totalRevenue, $monthRevenue, $totalBookings, $paidBookings,
            $activeTrips, $totalFleet, $onRoadFleet, $availableFleet, $occupancyPct,
            $totalUsers, $pendingDocs, $pendingPayments, $daySales, $weekSales
        ]
    );

    // If All Hubs (hub_id = 0), also synchronize current month row in kpi_metrics table
    if ($hubId === 0) {
        $curMonth = date('Y-m-01');
        try {
            Database::execute(
                "INSERT INTO `kpi_metrics` (
                  `metric_date`, `day_sales`, `week_sales`, `month_sales`, `total_revenue`,
                  `total_bookings`, `paid_bookings`, `active_trips`, `total_fleet`,
                  `on_road_fleet`, `in_yard_fleet`, `occupancy_pct`, `total_users`,
                  `pending_payments`, `pending_docs`, `updated_at`
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                  `day_sales` = VALUES(`day_sales`),
                  `week_sales` = VALUES(`week_sales`),
                  `month_sales` = VALUES(`month_sales`),
                  `total_revenue` = VALUES(`total_revenue`),
                  `total_bookings` = VALUES(`total_bookings`),
                  `paid_bookings` = VALUES(`paid_bookings`),
                  `active_trips` = VALUES(`active_trips`),
                  `total_fleet` = VALUES(`total_fleet`),
                  `on_road_fleet` = VALUES(`on_road_fleet`),
                  `in_yard_fleet` = VALUES(`in_yard_fleet`),
                  `occupancy_pct` = VALUES(`occupancy_pct`),
                  `total_users` = VALUES(`total_users`),
                  `pending_payments` = VALUES(`pending_payments`),
                  `pending_docs` = VALUES(`pending_docs`),
                  `updated_at` = CURRENT_TIMESTAMP",
                [
                    $curMonth, $daySales, $weekSales, $monthRevenue, $totalRevenue,
                    $totalBookings, $paidBookings, $activeTrips, $totalFleet,
                    $onRoadFleet, $availableFleet, $occupancyPct, $totalUsers,
                    $pendingPayments, $pendingDocs
                ]
            );
        } catch (Throwable $_) {}
    }

    // Audit log
    try {
        Database::execute(
            "INSERT INTO `audit_logs` (`firebase_uid`, `action`, `resource_type`, `resource_id`, `details`, `ip_address`) 
             VALUES (?, 'update_kpi_database', 'kpi_hub_metrics', ?, ?, ?)",
            [
                $user['firebase_uid'] ?? 'admin',
                (string)$hubId,
                json_encode([
                    'hub_id' => $hubId,
                    'total_revenue' => $totalRevenue,
                    'month_revenue' => $monthRevenue,
                    'total_bookings' => $totalBookings,
                    'paid_bookings' => $paidBookings,
                    'total_fleet' => $totalFleet,
                    'updated_by' => $user['email'] ?? 'admin'
                ]),
                $_SERVER['REMOTE_ADDR'] ?? null
            ]
        );
    } catch (Throwable $_) {}

    // Return the updated row directly from the database
    $updatedRow = Database::fetchOne("SELECT * FROM `kpi_hub_metrics` WHERE `hub_id` = ?", [$hubId]);

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'success',
        'success' => true,
        'message' => 'KPI metrics successfully saved to database.',
        'data' => $updatedRow
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);