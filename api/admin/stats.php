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

        // Seed initial rows only if table is completely empty
        $cnt = (int)(Database::fetchOne("SELECT COUNT(*) AS c FROM `kpi_hub_metrics`")['c'] ?? 0);
        if ($cnt === 0) {
            Database::execute(
                "INSERT INTO `kpi_hub_metrics` 
                 (`hub_id`, `hub_name`, `total_revenue`, `month_revenue`, `total_bookings`, `paid_bookings`, `active_trips`, `total_fleet`, `on_road_fleet`, `available_fleet`, `occupancy_pct`, `total_users`, `pending_docs`, `pending_payments`, `day_sales`, `week_sales`)
                 VALUES
                 (0, 'All Operating Hubs', 1129499.00, 213208.00, 45, 43, 9, 58, 9, 49, 15.52, 188, 0, 0, 1458.00, 7745.00),
                 (1, 'Gavson Business Park, Ghansoli', 744557.00, 107796.00, 28, 27, 6, 43, 6, 37, 13.95, 188, 0, 0, 950.00, 4500.00),
                 (2, 'Kandivali Hub, Mumbai', 384942.00, 105412.00, 17, 16, 3, 15, 3, 12, 20.00, 188, 0, 0, 508.00, 3245.00)
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

        // 1. Read All Hubs (hub_id = 0) directly from database
        $row0 = Database::fetchOne("SELECT * FROM `kpi_hub_metrics` WHERE `hub_id` = 0");
        if (!$row0) {
            // Fallback to KpiService if kpi_hub_metrics table row missing
            require_once __DIR__ . '/../services/KpiService.php';
            $syncData = KpiService::getMetrics();
            $row0 = $syncData['live'] ?? [];
        }

        // 2. Read per-hub rows
        $allHubRows = Database::fetchAll("SELECT * FROM `kpi_hub_metrics` ORDER BY `hub_id` ASC");
        $hubsMap = [];
        foreach ($allHubRows as $hr) {
            $hubsMap[(int)$hr['hub_id']] = [
                'hub_id' => (int)$hr['hub_id'],
                'hub_name' => $hr['hub_name'],
                'total_revenue' => (float)$hr['total_revenue'],
                'month_revenue' => (float)$hr['month_revenue'],
                'total_bookings' => (int)$hr['total_bookings'],
                'paid_bookings' => (int)$hr['paid_bookings'],
                'active_trips' => (int)$hr['active_trips'],
                'total_fleet' => (int)$hr['total_fleet'],
                'on_road_fleet' => (int)$hr['on_road_fleet'],
                'available_fleet' => (int)$hr['available_fleet'],
                'occupancy_pct' => (float)$hr['occupancy_pct'],
                'fleet_utilization' => (float)$hr['occupancy_pct'],
                'total_users' => (int)$hr['total_users'],
                'pending_docs' => (int)$hr['pending_docs'],
                'pending_payments' => (int)$hr['pending_payments'],
                'day_sales' => (float)$hr['day_sales'],
                'week_sales' => (float)$hr['week_sales'],
                'avg_booking' => (int)$hr['paid_bookings'] > 0 ? round((float)$hr['total_revenue'] / (int)$hr['paid_bookings'], 2) : 0,
                'updated_at' => $hr['updated_at'] ?? date('Y-m-d H:i:s')
            ];
        }

        // 3. Format primary live/effective stats object
        $liveStats = [
            'total_revenue' => (float)($row0['total_revenue'] ?? 0),
            'month_revenue' => (float)($row0['month_revenue'] ?? 0),
            'total_bookings' => (int)($row0['total_bookings'] ?? 0),
            'paid_bookings' => (int)($row0['paid_bookings'] ?? 0),
            'active_trips' => (int)($row0['active_trips'] ?? 0),
            'active_rentals' => (int)($row0['on_road_fleet'] ?? $row0['active_trips'] ?? 0),
            'total_fleet' => (int)($row0['total_fleet'] ?? 0),
            'fleet_count' => (int)($row0['total_fleet'] ?? 0),
            'on_road_fleet' => (int)($row0['on_road_fleet'] ?? 0),
            'available_fleet' => (int)($row0['available_fleet'] ?? 0),
            'available_in_yard' => (int)($row0['available_fleet'] ?? 0),
            'fleet_utilization' => (float)($row0['occupancy_pct'] ?? 0),
            'occupancy_pct' => (float)($row0['occupancy_pct'] ?? 0),
            'total_users' => (int)($row0['total_users'] ?? 0),
            'pending_docs' => (int)($row0['pending_docs'] ?? 0),
            'pending_payments' => (int)($row0['pending_payments'] ?? 0),
            'day_sales' => (float)($row0['day_sales'] ?? 0),
            'week_sales' => (float)($row0['week_sales'] ?? 0),
            'avg_booking' => (int)($row0['paid_bookings'] ?? 0) > 0 ? round((float)$row0['total_revenue'] / (int)$row0['paid_bookings'], 2) : 0,
            'updated_at' => $row0['updated_at'] ?? date('Y-m-d H:i:s')
        ];

        // 4. Monthly ledger rows for historical analytics
        $monthlyRows = [];
        try {
            $mRows = Database::fetchAll("SELECT * FROM `kpi_metrics` ORDER BY `metric_date` ASC");
            foreach ($mRows as $mr) {
                $mKey = date('Y-m-01', strtotime((string)$mr['metric_date']));
                $monthlyRows[$mKey] = $mr;
            }
        } catch (Throwable $_) {}

        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'success',
            'success' => true,
            'data' => [
                'live' => $liveStats,
                'effective' => $liveStats,
                'hubs' => $hubsMap,
                'monthly' => $monthlyRows,
                'reporting_month' => date('Y-m-01'),
                'previous_month' => date('Y-m-01', strtotime('-1 month')),
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