<?php
/**
 * api/hubs/summary.php
 * GET /api/hubs/summary?hub_id=ID[&from=YYYY-MM-DD&to=YYYY-MM-DD]
 * Hub-scoped operational, fleet, and financial summary derived dynamically via KpiService.
 */
declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';

$user = Auth::requireRole('admin', 'manager', 'executive', 'accountant');
$rawHubParam = $_GET['hub_id'] ?? $_GET['id'] ?? '0';
$isUnassigned = ($rawHubParam === 'unassigned');
$hubId = (!$isUnassigned && $rawHubParam !== '' && $rawHubParam !== 'all') ? (int)$rawHubParam : 0;

$fromParam = trim((string)($_GET['from'] ?? $_GET['from_date'] ?? $_GET['startDate'] ?? ''));
$toParam = trim((string)($_GET['to'] ?? $_GET['to_date'] ?? $_GET['endDate'] ?? ''));

/* If the staff account has a fixed hub assignment, restrict cross-hub access. */
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

$isAllHubs = (!$isUnassigned && $hubId <= 0);

if ($isAllHubs) {
    $hub = [
        'id' => 0,
        'name' => 'All Operating Hubs',
        'code' => 'ALL',
        'city' => 'All Locations',
        'state' => '',
        'status' => 'active',
    ];
} elseif ($isUnassigned) {
    $hub = [
        'id' => 0,
        'name' => 'Unassigned / Legacy Hub',
        'code' => 'UNASSIGNED',
        'city' => '',
        'state' => '',
        'status' => 'active',
    ];
} else {
    $hub = Database::fetchOne("SELECT id, name, code, city, state, status FROM hubs WHERE id = ?", [$hubId]);
    if (!$hub) {
        sendErrorResponse("Hub #$hubId not found in database.", 404);
    }
}

$hasDateFilter = ($fromParam !== '' || $toParam !== '');
$filters = [
    'from' => $fromParam !== '' ? $fromParam : null,
    'to' => $toParam !== '' ? $toParam : null,
    'hub_id' => $hubId > 0 ? $hubId : null,
    'unassigned_only' => $isUnassigned,
];

$report = KpiService::computeFilteredReport($filters, !$hasDateFilter && !$isUnassigned && $hubId <= 0);
$targetStats = $isUnassigned
    ? ($report['unassigned_hub'] ?? [])
    : ($hubId > 0 ? ($report['hubs'][$hubId] ?? $report['live']) : ($report['hubs'][0] ?? $report['live']));

$summary = $report['live'] ?? [];
if (!$isAllHubs && !$hasDateFilter && !empty($targetStats)) {
    // Use per-hub exact counters for unscoped single-hub reads
    $totalRev = (float)($targetStats['total_revenue'] ?? 0.0);
    $paidCount = (int)($targetStats['paid_bookings'] ?? 0);
    $summary = array_merge($summary, [
        'total_revenue' => $totalRev,
        'booking_revenue' => $totalRev,
        'month_revenue' => (float)($targetStats['month_revenue'] ?? 0.0),
        'day_sales' => (float)($targetStats['day_sales'] ?? 0.0),
        'week_sales' => (float)($targetStats['week_sales'] ?? 0.0),
        'verified_collections' => (float)($targetStats['verified_collections'] ?? 0.0),
        'total_refunds' => (float)($targetStats['refund_amount'] ?? 0.0),
        'outstanding_amount' => (float)($targetStats['outstanding_amount'] ?? 0.0),
        'security_deposits_held' => (float)($targetStats['security_deposits'] ?? 0.0),
        'total_bookings' => (int)($targetStats['total_bookings'] ?? 0),
        'cancelled_bookings' => (int)($targetStats['cancelled_bookings'] ?? 0),
        'paid_bookings' => $paidCount,
        'avg_booking' => $paidCount > 0 ? round($totalRev / $paidCount, 2) : 0.0,
        'active_trips' => (int)($targetStats['active_trips'] ?? 0),
        'active_rentals' => (int)($targetStats['active_trips'] ?? 0),
        'scheduled_bookings' => (int)($targetStats['scheduled_bookings'] ?? 0),
        'completed_trips' => (int)($targetStats['completed_trips'] ?? 0),
        'total_registered_vehicles' => (int)($targetStats['total_registered_fleet'] ?? 0),
        'active_fleet' => (int)($targetStats['total_fleet'] ?? 0),
        'total_fleet' => (int)($targetStats['total_fleet'] ?? 0),
        'fleet_count' => (int)($targetStats['total_fleet'] ?? 0),
        'available_recorded' => (int)($targetStats['available_recorded_fleet'] ?? 0),
        'on_road_fleet' => (int)($targetStats['on_road_fleet'] ?? 0),
        'on_trip_fleet' => (int)($targetStats['on_road_fleet'] ?? 0),
        'available_fleet' => (int)($targetStats['available_fleet'] ?? 0),
        'available_in_yard' => (int)($targetStats['available_fleet'] ?? 0),
        'in_yard_fleet' => (int)($targetStats['available_fleet'] ?? 0),
        'maintenance_fleet' => (int)($targetStats['maintenance_fleet'] ?? 0),
        'inactive_fleet' => (int)($targetStats['inactive_fleet'] ?? 0),
        'removed_fleet' => (int)($targetStats['removed_fleet'] ?? 0),
        'fleet_utilization' => (float)($targetStats['occupancy_pct'] ?? 0.0),
        'occupancy_pct' => (float)($targetStats['occupancy_pct'] ?? 0.0),
        'revenue_per_vehicle' => (float)($targetStats['revenue_per_vehicle'] ?? 0.0),
        'pending_payments' => (int)($targetStats['pending_payments'] ?? 0),
        'cross_hub_outbound' => (int)($targetStats['cross_hub_outbound'] ?? 0),
        'cross_hub_inbound' => (int)($targetStats['cross_hub_inbound'] ?? 0),
    ]);
}

sendJsonResponse([
    'success' => true,
    'hub' => $hub,
    'data' => array_merge($summary, [
        'updated_at' => date('Y-m-d H:i:s'),
    ]),
    'daily' => $report['daily'] ?? [],
    'monthly' => $report['monthly'] ?? [],
    'reconciliation' => $report['reconciliation'] ?? [],
    'diagnostics' => $report['diagnostics'] ?? [],
]);
