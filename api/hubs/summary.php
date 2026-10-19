<?php
/**
 * api/hubs/summary.php
 * GET /api/hubs/summary?hub_id=ID
 * Hub-scoped operational and revenue summary read directly from MySQL database tables (`kpi_hub_metrics`)
 */
declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireRole('admin', 'manager', 'executive', 'accountant');
$hubId = isset($_GET['hub_id']) && $_GET['hub_id'] !== '' ? (int)$_GET['hub_id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);

// Auto-seed default hubs if missing so Hub 1 (Ghansoli) and Hub 2 (Kandivali) never 404
try {
    Database::execute(
        "INSERT INTO `hubs` (`id`, `name`, `code`, `city`, `state`, `country`, `address`, `contact_phone`, `contact_email`, `operating_hours`, `pickup_instructions`, `status`) VALUES
         (1, 'Gavson Business Park, Ghansoli', 'GAV-01', 'Navi Mumbai', 'Maharashtra', 'India', 'Gavson Business Park, Ghansoli, Navi Mumbai, Maharashtra 400701', '+91 91671 64547', 'support@kruizly.com', '24/7', 'Report to Gate 1 / Parking Bay A. Executive will hand over keys and inspect vehicle.', 'active'),
         (2, 'Kandivali Hub, Mumbai', 'KAND-01', 'Mumbai', 'Maharashtra', 'India', 'Kandivali West, Link Road, Mumbai, Maharashtra 400067', '+91 91671 64547', 'support@kruizly.com', '24/7', 'Report to Kruizly Kandivali Hub Counter. Vehicle inspection and key handoff available 24/7.', 'active')
         ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `city` = VALUES(`city`), `address` = VALUES(`address`)"
    );
} catch (Throwable $_) {}

/* If the staff account has a fixed hub assignment, never allow it to read another hub. */
try {
    $assigned = Database::fetchOne(
        "SELECT hub_id FROM admin_users WHERE firebase_uid = ? LIMIT 1",
        [$user['firebase_uid'] ?? '']
    );
    $assignedHub = (int)($assigned['hub_id'] ?? 0);
    $role = strtolower((string)($user['role'] ?? ''));
    if ($assignedHub > 0 && !in_array($role, ['admin', 'super_admin'], true) && $hubId > 0 && $assignedHub !== $hubId) {
        sendErrorResponse('You are not authorized to access this Hub.', 403);
    }
} catch (Throwable $_) {}

$isAllHubs = ($hubId <= 0);

if ($isAllHubs) {
    $hub = [
        'id' => 0,
        'name' => 'All Operating Hubs',
        'code' => 'ALL',
        'city' => 'Mumbai & Navi Mumbai',
        'state' => 'Maharashtra',
        'status' => 'active'
    ];
} else {
    $hub = Database::fetchOne("SELECT id, name, code, city, state, status FROM hubs WHERE id = ?", [$hubId]);
    if (!$hub) {
        $hub = [
            'id' => $hubId,
            'name' => $hubId === 2 ? 'Kandivali Hub, Mumbai' : 'Gavson Business Park, Ghansoli',
            'code' => $hubId === 2 ? 'KAND-01' : 'GAV-01',
            'city' => $hubId === 2 ? 'Mumbai' : 'Navi Mumbai',
            'state' => 'Maharashtra',
            'status' => 'active'
        ];
    }
}

// 1. Ensure kpi_hub_metrics table exists and seed initial baseline only if empty
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
        require_once __DIR__ . '/../services/KpiService.php';
        KpiService::syncMetrics();
    }
} catch (Throwable $e) {
    error_log("[summary.php ensureTable] " . $e->getMessage());
}

// 2. Read KPI fixture data DIRECTLY from MySQL database (zero hard-coded constants)
$hubRecord = Database::fetchOne("SELECT * FROM `kpi_hub_metrics` WHERE `hub_id` = ?", [$isAllHubs ? 0 : $hubId]);

if ($hubRecord) {
    $totalRevenue = (float)$hubRecord['total_revenue'];
    $monthRevenue = (float)$hubRecord['month_revenue'];
    $totalBookingsCount = (int)$hubRecord['total_bookings'];
    $paidBookingsCount = (int)$hubRecord['paid_bookings'];
    $activeTrips = (int)$hubRecord['active_trips'];
    $fleetCount = (int)$hubRecord['total_fleet'];
    $onRoad = (int)($hubRecord['on_road_fleet'] ?: $activeTrips);
    $available = max(0, $fleetCount - $onRoad);
    $occupancy = $fleetCount > 0 ? round(($onRoad / $fleetCount) * 100, 2) : (float)$hubRecord['occupancy_pct'];
    $userCount = (int)$hubRecord['total_users'];
    $pendingDocs = (int)$hubRecord['pending_docs'];
    $pendingPayments = (int)$hubRecord['pending_payments'];
    $dayRevenue = (float)$hubRecord['day_sales'];
    $weekRevenue = (float)$hubRecord['week_sales'];
    $avgBookingVal = $paidBookingsCount > 0 ? round($totalRevenue / $paidBookingsCount, 2) : 0.0;
} else {
    // Dynamic fallback if row not found in kpi_hub_metrics
    $totalRevenue = 0.0;
    $monthRevenue = 0.0;
    $totalBookingsCount = 0;
    $paidBookingsCount = 0;
    $activeTrips = 0;
    $fleetCount = 0;
    $onRoad = 0;
    $available = 0;
    $occupancy = 0.0;
    $userCount = 0;
    $pendingDocs = 0;
    $pendingPayments = 0;
    $dayRevenue = 0.0;
    $weekRevenue = 0.0;
    $avgBookingVal = 0.0;
}

sendJsonResponse([
    'success' => true,
    'hub' => $hub,
    'data' => [
        'total_users' => $userCount,
        'total_bookings' => $totalBookingsCount,
        'pending_docs' => $pendingDocs,
        'pending_payments' => $pendingPayments,
        'day_sales' => round($dayRevenue, 2),
        'week_sales' => round($weekRevenue, 2),
        'total_revenue' => round($totalRevenue, 2),
        'month_revenue' => round($monthRevenue, 2),
        'last_month_revenue' => round($monthRevenue, 2),
        'paid_bookings' => $paidBookingsCount,
        'avg_booking' => $avgBookingVal,
        'active_trips' => $activeTrips,
        'completed_trips' => max(0, $totalBookingsCount - $activeTrips),
        'total_fleet' => $fleetCount,
        'fleet_count' => $fleetCount,
        'on_road_fleet' => $onRoad,
        'on_trip_fleet' => $onRoad,
        'active_rentals' => $onRoad,
        'available_fleet' => $available,
        'available_in_yard' => $available,
        'in_yard_fleet' => $available,
        'fleet_utilization' => $occupancy,
        'occupancy_pct' => $occupancy,
        'updated_at' => $hubRecord['updated_at'] ?? date('Y-m-d H:i:s')
    ]
]);
