<?php
/**
 * api/services/KpiService.php
 * Automated KPI Calculation and SQL Database Synchronization Service for Kruizly
 * 
 * Automatically calculates operational and financial KPIs dynamically from
 * bookings, vehicles, and users tables, strictly excluding security deposits and
 * prorating cross-month / cross-date bookings by exact operational rental days.
 * Persists the aggregated metrics into the MySQL `kpi_metrics` table.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

class KpiService
{
    /**
     * Recalculates all KPI metrics dynamically from MySQL and updates `kpi_metrics` table.
     * 
     * @return array Array containing 'live', 'monthly', 'revenue_ledger', etc.
     */
    public static function syncMetrics(): array
    {
        try {
            // 1. Ensure kpi_metrics table schema exists
            self::ensureSchema();

            // 2. Operational live counts from SQL database
            $totalUsers = (int)(Database::fetchOne(
                "SELECT COUNT(DISTINCT firebase_uid) AS c FROM users"
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

            $completedTrips = (int)(Database::fetchOne(
                "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
                 FROM bookings
                 WHERE status = 'completed'"
            )['c'] ?? 0);

            // Total available vehicles in Kruizly catalog
            $totalFleetDb = (int)(Database::fetchOne(
                "SELECT COUNT(*) AS c FROM vehicles WHERE status != 'removed'"
            )['c'] ?? 0);
            $totalFleet = max(1, $totalFleetDb);

            // Operational on-road fleet: count vehicles currently on active trip or confirmed within operational dates
            $onRoadFleet = 0;
            try {
                $onRoadFleet = (int)(Database::fetchOne(
                    "SELECT COUNT(DISTINCT COALESCE(NULLIF(b.vehicle_reg, ''), b.vehicle_id, v.reg_no, v.id)) AS c
                     FROM bookings b
                     LEFT JOIN vehicles v ON (b.vehicle_id = v.id)
                     WHERE (
                         b.status IN ('active', 'in_trip', 'started')
                         OR (b.status = 'confirmed' AND CURRENT_TIMESTAMP >= b.pickup_date AND CURRENT_TIMESTAMP <= b.drop_date)
                     )
                     AND LOWER(COALESCE(b.status, '')) NOT IN ('completed', 'cancelled', 'rejected')
                     AND LOWER(COALESCE(b.payment_status, '')) NOT IN ('cancelled', 'rejected')"
                )['c'] ?? 0);
            } catch (Throwable $_) {
                $onRoadFleet = (int)(Database::fetchOne(
                    "SELECT COUNT(DISTINCT COALESCE(NULLIF(vehicle_reg, ''), vehicle_id)) AS c
                     FROM bookings
                     WHERE status IN ('active', 'in_trip', 'started')
                       AND LOWER(COALESCE(status, '')) NOT IN ('completed', 'cancelled', 'rejected')"
                )['c'] ?? 0);
            }

            // Strictly clamp utilization to <= 100%
            $onRoadFleet = min($totalFleet, max(0, $onRoadFleet));
            $availableInYard = max(0, $totalFleet - $onRoadFleet);
            $fleetUtilization = $totalFleet > 0 ? min(100, max(0, (int)round(($onRoadFleet / $totalFleet) * 100))) : 0;

            // 3. Fetch all active and verified bookings for date proration accounting
            $bookings = Database::fetchAll(
                "SELECT id, booking_id, booking_number, vehicle_id, vehicle_reg, vehicle_name,
                        pickup_date, drop_date, days, total_amount, final_amount, base_amount,
                        coupon_discount, security_deposit, advance_amount, payment_status, status,
                        created_at, payment_ref
                 FROM bookings
                 WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'rejected')
                   AND LOWER(COALESCE(payment_status, '')) NOT IN ('cancelled', 'rejected')"
            );

            $totalBookings = count($bookings);

            // Date definitions for Day Sales and Week Sales
            $todayStr = date('Y-m-d');
            $weekStartStr = date('Y-m-d', strtotime('monday this week'));
            $weekEndStr = date('Y-m-d', strtotime('sunday this week'));
            $currentMonthKey = date('Y-m-01');

            $daySales = 0.0;
            $weekSales = 0.0;
            $overallRevenue = 0.0;
            $paidBookingsSet = [];

            // Monthly aggregation structures
            $knownMonths = [
                $currentMonthKey => true,
                date('Y-m-01', strtotime('-1 month')) => true,
            ];

            $monthlyRevenue = [];
            $monthlyBookings = [];
            $monthlyPaidBookings = [];
            $monthlyCompletedTrips = [];

            foreach ($bookings as $b) {
                $bId = (string)($b['booking_number'] ?? $b['booking_id'] ?? $b['id'] ?? '');
                $pStat = strtolower(trim((string)($b['payment_status'] ?? '')));
                $bStat = strtolower(trim((string)($b['status'] ?? '')));
                $isPaid = in_array($pStat, ['paid', 'advance_paid', 'verified'], true)
                    || in_array($bStat, ['confirmed', 'active', 'completed', 'in_trip', 'started'], true)
                    || (!empty($b['payment_ref']) && trim((string)$b['payment_ref']) !== '');

                if ($isPaid && $bId !== '') {
                    $paidBookingsSet[$bId] = true;
                }

                $netRental = self::getBookingNetRental($b);
                $dateInfo = self::getBookingDates($b);
                $totalDays = $dateInfo['days'];
                $dailyRate = $totalDays > 0 ? ($netRental / $totalDays) : 0.0;
                $startTs = strtotime($dateInfo['start_date']);

                $overallRevenue += $netRental;

                // Day Sales: Prorate if operational today
                $todayTs = strtotime($todayStr);
                $weekStartTs = strtotime($weekStartStr);
                $weekEndTs = strtotime($weekEndStr);

                for ($i = 0; $i < $totalDays; $i++) {
                    $curTs = $startTs + ($i * 86400);
                    $curMonth = date('Y-m-01', $curTs);

                    $knownMonths[$curMonth] = true;
                    if (!isset($monthlyRevenue[$curMonth])) {
                        $monthlyRevenue[$curMonth] = 0.0;
                        $monthlyBookings[$curMonth] = [];
                        $monthlyPaidBookings[$curMonth] = [];
                    }

                    $monthlyRevenue[$curMonth] += $dailyRate;
                    if ($bId !== '') {
                        $monthlyBookings[$curMonth][$bId] = true;
                        if ($isPaid) {
                            $monthlyPaidBookings[$curMonth][$bId] = true;
                        }
                    }

                    // Check Today
                    if ($curTs === $todayTs) {
                        $daySales += $dailyRate;
                    }

                    // Check Week
                    if ($curTs >= $weekStartTs && $curTs <= $weekEndTs) {
                        $weekSales += $dailyRate;
                    }
                }

                // Completed trips attribution
                if ($bStat === 'completed') {
                    $cMonth = date('Y-m-01', $startTs + (($totalDays - 1) * 86400));
                    $monthlyCompletedTrips[$cMonth] = ($monthlyCompletedTrips[$cMonth] ?? 0) + 1;
                }
            }

            ksort($knownMonths);

            $paidBookingsCount = count($paidBookingsSet);
            $daySales = round($daySales, 2);
            $weekSales = round($weekSales, 2);
            $overallRevenue = round($overallRevenue, 2);

            // 4. Construct monthly row details
            $monthlyRows = [];
            foreach (array_keys($knownMonths) as $monthStart) {
                $monthEnd = date('Y-m-t', strtotime($monthStart));
                $mRev = round((float)($monthlyRevenue[$monthStart] ?? 0.0), 2);
                $mBookingsCount = isset($monthlyBookings[$monthStart]) ? count($monthlyBookings[$monthStart]) : 0;
                $mPaidCount = isset($monthlyPaidBookings[$monthStart]) ? count($monthlyPaidBookings[$monthStart]) : 0;
                $mCompletedCount = (int)($monthlyCompletedTrips[$monthStart] ?? 0);

                $monthUsers = (int)(Database::fetchOne(
                    "SELECT COUNT(DISTINCT firebase_uid) AS c
                     FROM users
                     WHERE created_at < DATE_ADD(?, INTERVAL 1 DAY)",
                    [$monthEnd]
                )['c'] ?? 0);

                $isCurrentMonth = ($monthStart === $currentMonthKey);
                $rowOnRoad = $isCurrentMonth ? $onRoadFleet : 0;
                $rowYard = max(0, $totalFleet - $rowOnRoad);
                $rowOccupancy = $totalFleet > 0 ? min(100, round(($rowOnRoad / $totalFleet) * 100, 2)) : 0;
                $rowActive = $isCurrentMonth ? $onRoadFleet : 0;
                $rowPendingPayments = $isCurrentMonth ? $pendingPayments : 0;
                $rowPendingDocs = $isCurrentMonth ? $pendingDocs : 0;
                $rowUsers = $isCurrentMonth ? $totalUsers : $monthUsers;
                $rowDaySales = $isCurrentMonth ? $daySales : 0.0;
                $rowWeekSales = $isCurrentMonth ? $weekSales : 0.0;

                $monthlyRows[$monthStart] = [
                    'metric_date' => $monthStart,
                    'day_sales' => $rowDaySales,
                    'week_sales' => $rowWeekSales,
                    'month_sales' => $mRev,
                    'total_revenue' => $isCurrentMonth ? $overallRevenue : $mRev,
                    'total_bookings' => $mBookingsCount,
                    'paid_bookings' => $mPaidCount,
                    'active_trips' => $rowActive,
                    'completed_trips' => $mCompletedCount,
                    'total_fleet' => $totalFleet,
                    'on_road_fleet' => $rowOnRoad,
                    'in_yard_fleet' => $rowYard,
                    'occupancy_pct' => $rowOccupancy,
                    'total_users' => $rowUsers,
                    'pending_payments' => $rowPendingPayments,
                    'pending_docs' => $rowPendingDocs,
                ];

                // Persist into MySQL kpi_metrics table
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
                            $mRev,
                            $isCurrentMonth ? $overallRevenue : $mRev,
                            $mBookingsCount,
                            $mPaidCount,
                            $rowActive,
                            $mCompletedCount,
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
            }

            $previousMonthKey = date('Y-m-01', strtotime('-1 month'));
            $currentMonthRevenue = (float)($monthlyRows[$currentMonthKey]['month_sales'] ?? 0.0);
            $lastMonthRevenue = (float)($monthlyRows[$previousMonthKey]['month_sales'] ?? 0.0);
            $avgBooking = $paidBookingsCount > 0 ? round($overallRevenue / $paidBookingsCount, 2) : 0.0;

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
                'paid_bookings' => $paidBookingsCount,
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

            return [
                'live' => $liveStats,
                'monthly' => $monthlyRows,
                'reporting_month' => $currentMonthKey,
                'previous_month' => $previousMonthKey,
                'revenue_ledger' => $monthlyRevenue,
            ];
        } catch (Throwable $e) {
            error_log("[KpiService::syncMetrics Exception] " . $e->getMessage());
            return [];
        }
    }

    /**
     * Extracts pure fleet rental revenue strictly excluding refundable security deposits.
     */
    public static function getBookingNetRental(array $b): float
    {
        $pStat = strtolower(trim((string)($b['payment_status'] ?? '')));
        if ($pStat === 'advance_paid' && !empty($b['advance_amount']) && empty($b['final_amount'])) {
            return (float)$b['advance_amount'];
        }
        $dep = (float)($b['security_deposit'] ?? 0);
        $tot = (float)($b['final_amount'] ?? $b['total_amount'] ?? 0);
        $base = (float)($b['base_amount'] ?? 0);
        $disc = (float)($b['coupon_discount'] ?? 0);

        if ($tot > 0 && $dep > 0) {
            return max(0.0, $tot - $dep);
        }
        if ($base > 0) {
            return max(0.0, $base - $disc);
        }
        return max(0.0, $tot - $dep);
    }

    /**
     * Normalizes pickup start date and duration days for a booking.
     */
    public static function getBookingDates(array $b): array
    {
        $pStr = trim((string)($b['pickup_date'] ?? ''));
        $dStr = trim((string)($b['drop_date'] ?? ''));
        $cStr = trim((string)($b['created_at'] ?? ''));

        $pTime = false;
        if ($pStr !== '' && $pStr !== '0000-00-00 00:00:00') {
            $pTime = strtotime($pStr);
        }
        if ($pTime === false && $cStr !== '' && $cStr !== '0000-00-00 00:00:00') {
            $pTime = strtotime($cStr);
        }
        if ($pTime === false) {
            $pTime = time();
        }

        $days = (int)($b['days'] ?? 0);
        if ($days <= 0 && $dStr !== '' && $dStr !== '0000-00-00 00:00:00') {
            $dTime = strtotime($dStr);
            if ($dTime !== false && $dTime > $pTime) {
                $days = (int)ceil(($dTime - $pTime) / 86400);
            }
        }
        $days = max(1, $days);

        return [
            'start_date' => date('Y-m-d', $pTime),
            'start_time' => $pTime,
            'days' => $days,
        ];
    }

    /**
     * Auto-heals and creates the MySQL kpi_metrics table if needed.
     */
    private static function ensureSchema(): void
    {
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
    }
}
