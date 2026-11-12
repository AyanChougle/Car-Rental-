<?php
/**
 * api/admin/stats.php
 * GET  - Authoritative real-time KPI, Fleet, Hub, Daily/Monthly & Reconciliation stats via KpiService
 * POST - (Admin only) Explicit ledger override in MySQL for a registered DB hub
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method === 'GET') {
    try {
        $user = Auth::requireRole('admin', 'manager', 'executive', 'accountant');

        $fromParam = trim((string)($_GET['from'] ?? $_GET['from_date'] ?? $_GET['startDate'] ?? ''));
        $toParam = trim((string)($_GET['to'] ?? $_GET['to_date'] ?? $_GET['endDate'] ?? ''));
        $rawHub = $_GET['hub_id'] ?? null;
        $statusParam = trim((string)($_GET['status'] ?? ''));
        $searchParam = trim((string)($_GET['search'] ?? $_GET['q'] ?? ''));

        // Enforce hub assignment for non-admin staff when configured
        try {
            $assignedRow = Database::fetchOne(
                "SELECT hub_id FROM admin_users WHERE firebase_uid = ? LIMIT 1",
                [$user['firebase_uid'] ?? '']
            );
            $assignedHub = (int)($assignedRow['hub_id'] ?? 0);
            $role = strtolower((string)($user['role'] ?? ''));
            if ($assignedHub > 0 && !in_array($role, ['admin', 'super_admin'], true)) {
                $rawHub = (string)$assignedHub;
            }
        } catch (Throwable $_) {}

        $filters = [
            'from' => $fromParam !== '' ? $fromParam : null,
            'to' => $toParam !== '' ? $toParam : null,
            'hub_id' => $rawHub,
            'unassigned_only' => ($rawHub === 'unassigned'),
            'status' => $statusParam !== '' ? $statusParam : null,
            'search' => $searchParam !== '' ? $searchParam : null,
        ];

        $hasFilters = ($filters['from'] !== null || $filters['to'] !== null || ($rawHub !== null && $rawHub !== '' && $rawHub !== 'all' && $rawHub !== '0') || $filters['status'] !== null || $filters['search'] !== null);

        $report = KpiService::computeFilteredReport($filters, !$hasFilters);

        $liveStats = $report['live'] ?? [];
        $hubsMap = $report['hubs'] ?? [];
        if (!$hasFilters && is_numeric($rawHub) && (int)$rawHub > 0 && isset($hubsMap[(int)$rawHub])) {
            $liveStats = array_merge($liveStats, $hubsMap[(int)$rawHub]);
        }

        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'success',
            'success' => true,
            'data' => [
                'live' => $liveStats,
                'effective' => $liveStats,
                'hubs' => $hubsMap,
                'unassigned_hub' => $report['unassigned_hub'] ?? null,
                'registered_hubs' => $report['registered_hubs'] ?? [],
                'monthly' => $report['monthly'] ?? [],
                'daily' => $report['daily'] ?? [],
                'fleet' => $report['fleet'] ?? [],
                'fleet_breakdown' => $report['fleet_breakdown'] ?? [],
                'reconciliation' => $report['reconciliation'] ?? [],
                'diagnostics' => $report['diagnostics'] ?? [],
                'filters_applied' => $report['filters_applied'] ?? [],
                'reporting_month' => $report['reporting_month'] ?? date('Y-m-01'),
                'previous_month' => $report['previous_month'] ?? date('Y-m-01', strtotime('-1 month')),
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    } catch (Throwable $e) {
        error_log('stats.php exception: ' . $e->getMessage());
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'success' => false,
            'message' => 'Failed to compute statistics.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

if ($method === 'POST') {
    Auth::requireRole('admin', 'super_admin');
    $user = Auth::currentUser();
    $input = json_decode((string)file_get_contents('php://input'), true) ?? [];

    KpiService::ensureTables();

    $hubId = isset($input['hub_id']) ? (int)$input['hub_id'] : 0;
    if ($hubId === 0) {
        $hubName = 'All Operating Hubs';
    } else {
        $hubRow = Database::fetchOne("SELECT id, name FROM `hubs` WHERE `id` = ? LIMIT 1", [$hubId]);
        if (!$hubRow) {
            sendErrorResponse("Hub #$hubId not found in database.", 404);
        }
        $hubName = (string)$hubRow['name'];
    }

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

    $syncTs = date('Y-m-d H:i:s');

    Database::execute(
        "INSERT INTO `kpi_hub_metrics` (
          `hub_id`, `hub_name`, `total_revenue`, `month_revenue`, `total_bookings`, `paid_bookings`,
          `active_trips`, `total_fleet`, `on_road_fleet`, `available_fleet`, `occupancy_pct`,
          `total_users`, `pending_docs`, `pending_payments`, `day_sales`, `week_sales`, `updated_at`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          `hub_name` = VALUES(`hub_name`),
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
          `updated_at` = VALUES(`updated_at`)",
        [
            $hubId, $hubName, $totalRevenue, $monthRevenue, $totalBookings, $paidBookings,
            $activeTrips, $totalFleet, $onRoadFleet, $availableFleet, $occupancyPct,
            $totalUsers, $pendingDocs, $pendingPayments, $daySales, $weekSales, $syncTs
        ]
    );

    if ($hubId === 0) {
        $curMonth = date('Y-m-01');
        try {
            Database::execute(
                "INSERT INTO `kpi_metrics` (
                  `metric_date`, `day_sales`, `week_sales`, `month_sales`, `total_revenue`,
                  `total_bookings`, `paid_bookings`, `active_trips`, `total_fleet`,
                  `on_road_fleet`, `in_yard_fleet`, `occupancy_pct`, `total_users`,
                  `pending_payments`, `pending_docs`, `updated_at`
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                  `updated_at` = VALUES(`updated_at`)",
                [
                    $curMonth, $daySales, $weekSales, $monthRevenue, $totalRevenue,
                    $totalBookings, $paidBookings, $activeTrips, $totalFleet,
                    $onRoadFleet, $availableFleet, $occupancyPct, $totalUsers,
                    $pendingPayments, $pendingDocs, $syncTs
                ]
            );
        } catch (Throwable $_) {}
    }

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
                    'updated_by' => $user['email'] ?? 'admin',
                ]),
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]
        );
    } catch (Throwable $_) {}

    $updatedRow = Database::fetchOne("SELECT * FROM `kpi_hub_metrics` WHERE `hub_id` = ?", [$hubId]);

    // Synchronize kpi_engine_state & cross-table totals immediately while preserving this manual edit
    $synced = KpiService::syncMetrics(true, false);
    $freshRow = Database::fetchOne("SELECT * FROM `kpi_hub_metrics` WHERE `hub_id` = ?", [$hubId]) ?: $updatedRow;

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'success',
        'success' => true,
        'message' => 'KPI metrics successfully saved to database.',
        'data' => $freshRow,
        'synced' => $synced,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
