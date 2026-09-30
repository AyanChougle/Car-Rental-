<?php
/**
 * api/hubs/summary.php
 * GET /api/hubs/summary?hub_id=ID
 * Hub-scoped operational and revenue summary for staff dashboards.
 */
declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::optionalAuth();
$hubId = isset($_GET['hub_id']) && $_GET['hub_id'] !== '' ? (int)$_GET['hub_id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);

if ($hubId <= 0) {
    sendErrorResponse('hub_id is required.', 400);
}

/* If the staff account has a fixed hub assignment, never allow it to read another hub. */
try {
    $assigned = Database::fetchOne(
        "SELECT hub_id FROM admin_users WHERE firebase_uid = ? LIMIT 1",
        [$user['firebase_uid'] ?? '']
    );
    $assignedHub = (int)($assigned['hub_id'] ?? 0);
    $role = strtolower((string)($user['role'] ?? ''));
    if ($assignedHub > 0 && !in_array($role, ['admin', 'super_admin'], true) && $assignedHub !== $hubId) {
        sendErrorResponse('You are not authorized to access this Hub.', 403);
    }
} catch (Throwable $_) {}

$hub = Database::fetchOne("SELECT id, name, code, city, state, status FROM hubs WHERE id = ?", [$hubId]);
if (!$hub) sendErrorResponse('Hub not found.', 404);

$baseWhere = "(
    b.pickup_hub_id = ? OR b.drop_hub_id = ?
)";
$baseParams = [$hubId, $hubId];

$bookings = Database::fetchAll(
    "SELECT b.id, b.booking_id, b.booking_number, b.vehicle_id, b.vehicle_reg,
            b.pickup_date, b.drop_date, b.days, b.total_amount, b.final_amount,
            b.base_amount, b.security_deposit, b.payment_status, b.status,
            b.created_at, b.payment_ref
     FROM bookings b
     WHERE $baseWhere
       AND LOWER(COALESCE(b.status,'')) NOT IN ('cancelled','rejected')",
    $baseParams
);

$totalRevenue = 0.0;
$monthRevenue = 0.0;
$lastMonthRevenue = 0.0;
$dayRevenue = 0.0;
$weekRevenue = 0.0;
$paidBookings = [];
$activeTrips = 0;
$completedTrips = 0;
$pendingPayments = 0;
$today = date('Y-m-d');
$weekStart = date('Y-m-d', strtotime('monday this week'));
$weekEnd = date('Y-m-d', strtotime('sunday this week'));
$currentMonth = date('Y-m-01');
$previousMonth = date('Y-m-01', strtotime('-1 month'));

foreach ($bookings as $b) {
    $amount = (float)($b['final_amount'] ?? 0);
    if ($amount <= 0) $amount = (float)($b['total_amount'] ?? $b['base_amount'] ?? 0);
    $deposit = (float)($b['security_deposit'] ?? 0);
    if ($amount > 0 && $deposit > 0 && $amount >= $deposit) $amount -= $deposit;

    $totalRevenue += max(0, $amount);

    $date = !empty($b['pickup_date']) ? date('Y-m-d', strtotime((string)$b['pickup_date'])) : date('Y-m-d', strtotime((string)$b['created_at']));
    $month = date('Y-m-01', strtotime($date));
    if ($month === $currentMonth) $monthRevenue += max(0, $amount);
    if ($month === $previousMonth) $lastMonthRevenue += max(0, $amount);
    if ($date === $today) $dayRevenue += max(0, $amount);
    if ($date >= $weekStart && $date <= $weekEnd) $weekRevenue += max(0, $amount);

    $status = strtolower((string)($b['status'] ?? ''));
    $payment = strtolower((string)($b['payment_status'] ?? ''));
    $isPaid = in_array($payment, ['paid','advance_paid','verified'], true)
        || in_array($status, ['confirmed','active','in_trip','started','completed'], true)
        || trim((string)($b['payment_ref'] ?? '')) !== '';

    $key = (string)($b['booking_number'] ?? $b['booking_id'] ?? $b['id']);
    if ($isPaid) $paidBookings[$key] = true;
    if (in_array($status, ['active','in_trip','started'], true)) $activeTrips++;
    if ($status === 'completed') $completedTrips++;
    if ($payment === 'pending_verification') $pendingPayments++;
}

$fleetCount = (int)(Database::fetchOne(
    "SELECT COUNT(*) AS c FROM vehicles WHERE status != 'removed' AND hub_id = ?", [$hubId]
)['c'] ?? 0);

$onRoad = (int)(Database::fetchOne(
    "SELECT COUNT(DISTINCT COALESCE(NULLIF(b.vehicle_reg,''), b.vehicle_id)) AS c
     FROM bookings b
     WHERE (b.pickup_hub_id = ? OR b.drop_hub_id = ?)
       AND LOWER(COALESCE(b.status,'')) IN ('active','in_trip','started')",
    [$hubId, $hubId]
)['c'] ?? 0);

$onRoad = min($fleetCount, max(0, $onRoad));
$available = max(0, $fleetCount - $onRoad);
$occupancy = $fleetCount > 0 ? round(($onRoad / $fleetCount) * 100, 2) : 0;

sendJsonResponse([
    'success' => true,
    'hub' => $hub,
    'data' => [
        'total_users' => 0,
        'total_bookings' => count($bookings),
        'pending_docs' => 0,
        'pending_payments' => $pendingPayments,
        'day_sales' => round($dayRevenue, 2),
        'week_sales' => round($weekRevenue, 2),
        'total_revenue' => round($totalRevenue, 2),
        'month_revenue' => round($monthRevenue, 2),
        'last_month_revenue' => round($lastMonthRevenue, 2),
        'paid_bookings' => count($paidBookings),
        'avg_booking' => count($paidBookings) ? round($totalRevenue / count($paidBookings), 2) : 0,
        'active_trips' => $activeTrips,
        'completed_trips' => $completedTrips,
        'total_fleet' => $fleetCount,
        'fleet_count' => $fleetCount,
        'on_road_fleet' => $onRoad,
        'active_rentals' => $onRoad,
        'available_fleet' => $available,
        'available_in_yard' => $available,
        'fleet_utilization' => $occupancy,
        'occupancy_pct' => $occupancy
    ]
]);
