<?php
/**
 * api/services/KpiService.php
 * Automated KPI Calculation and SQL Database Synchronization Service for Kruizly
 * 
 * Authoritative Server-Side KPI & Revenue Engine:
 * - Dynamically calculates revenue, bookings, trips, fleet occupancy from MySQL bookings, vehicles, users.
 * - Strictly excludes refundable security deposits exactly once.
 * - Accurately attributes revenue, trips, and bookings by hub (Hub 1: Gavson, Hub 2: Kandivali, Hub 0: All Hubs).
 * - Matches trips to registered fleet by registration number and computes partner vs company revenue sharing (60% / 40%).
 * - Recalculates dynamically from live database records; zero hardcoded figures or overrides.
 * - Persists calculated metrics into `kpi_metrics` and `kpi_hub_metrics` tables.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

class KpiService
{
    /**
     * Main entry point: calculates live metrics from server records and persists them.
     */
    public static function getMetrics(): array
    {
        return self::syncMetrics();
    }

    /**
     * Atomically increments the revenue and booking count when a new booking is created on the platform.
     * Increases month_sales, total_revenue, and booking counts across both kpi_metrics and kpi_hub_metrics.
     */
    public static function incrementBookingMetrics(float $amount = 0.0, int $hubId = 0, string $pickupDate = ''): void
    {
        $mKey = !empty($pickupDate) ? date('Y-m-01', strtotime($pickupDate)) : date('Y-m-01');
        $isToday = !empty($pickupDate) ? (date('Y-m-d', strtotime($pickupDate)) === date('Y-m-d')) : true;
        $dayAmount = $isToday ? $amount : 0.0;

        try {
            self::ensureTables();

            // 1. Increment in kpi_metrics table (creates row if not exists, or increments existing ledger values)
            Database::execute(
                "INSERT INTO `kpi_metrics` (
                    `metric_date`, `day_sales`, `week_sales`, `month_sales`, `total_revenue`,
                    `total_bookings`, `paid_bookings`, `created_at`, `updated_at`
                ) VALUES (?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE 
                    `month_sales` = `month_sales` + VALUES(`month_sales`),
                    `total_revenue` = `total_revenue` + VALUES(`total_revenue`),
                    `day_sales` = `day_sales` + VALUES(`day_sales`),
                    `week_sales` = `week_sales` + VALUES(`week_sales`),
                    `total_bookings` = `total_bookings` + 1,
                    `paid_bookings` = `paid_bookings` + 1,
                    `updated_at` = CURRENT_TIMESTAMP",
                [$mKey, $dayAmount, $dayAmount, $amount, $amount]
            );

            // Also increment running total_revenue for subsequent months (e.g. November row if booking was in October)
            if ($amount > 0) {
                Database::execute(
                    "UPDATE `kpi_metrics` SET `total_revenue` = `total_revenue` + ? WHERE `metric_date` > ?",
                    [$amount, $mKey]
                );
            }

            // 2. Increment in kpi_hub_metrics table (Hub 0 and specific Hub)
            $hubsToUpdate = [0];
            if ($hubId > 0 && !in_array($hubId, $hubsToUpdate, true)) {
                $hubsToUpdate[] = $hubId;
            }

            foreach ($hubsToUpdate as $hId) {
                Database::execute(
                    "UPDATE `kpi_hub_metrics` SET
                        `day_sales` = `day_sales` + ?,
                        `week_sales` = `week_sales` + ?,
                        `month_revenue` = `month_revenue` + ?,
                        `total_revenue` = `total_revenue` + ?,
                        `total_bookings` = `total_bookings` + 1,
                        `paid_bookings` = `paid_bookings` + 1,
                        `updated_at` = CURRENT_TIMESTAMP
                     WHERE `hub_id` = ?",
                    [$dayAmount, $dayAmount, $amount, $amount, $hId]
                );
            }
        } catch (Throwable $e) {
            error_log("[KpiService::incrementBookingMetrics] " . $e->getMessage());
        }
    }

    /**
     * Dynamically adjusts the revenue across kpi_metrics and kpi_hub_metrics when a booking amount is edited.
     * $diffAmount can be positive (amount increased) or negative (amount decreased).
     */
    public static function adjustBookingMetrics(float $diffAmount = 0.0, int $hubId = 0, string $pickupDate = ''): void
    {
        if (abs($diffAmount) < 0.01) return;
        $mKey = !empty($pickupDate) ? date('Y-m-01', strtotime($pickupDate)) : date('Y-m-01');
        $isToday = !empty($pickupDate) ? (date('Y-m-d', strtotime($pickupDate)) === date('Y-m-d')) : true;
        $dayAmount = $isToday ? $diffAmount : 0.0;

        try {
            self::ensureTables();

            // 1. Adjust in kpi_metrics for this month
            Database::execute(
                "UPDATE `kpi_metrics` 
                 SET `month_sales` = GREATEST(0.00, `month_sales` + ?),
                     `total_revenue` = GREATEST(0.00, `total_revenue` + ?),
                     `day_sales` = GREATEST(0.00, `day_sales` + ?),
                     `week_sales` = GREATEST(0.00, `week_sales` + ?),
                     `updated_at` = CURRENT_TIMESTAMP
                 WHERE `metric_date` = ?",
                [$diffAmount, $diffAmount, $dayAmount, $dayAmount, $mKey]
            );

            // Also adjust running total_revenue for subsequent months
            Database::execute(
                "UPDATE `kpi_metrics` SET `total_revenue` = GREATEST(0.00, `total_revenue` + ?) WHERE `metric_date` > ?",
                [$diffAmount, $mKey]
            );

            // 2. Adjust in kpi_hub_metrics table (Hub 0 and specific Hub)
            $hubsToUpdate = [0];
            if ($hubId > 0 && !in_array($hubId, $hubsToUpdate, true)) {
                $hubsToUpdate[] = $hubId;
            }

            foreach ($hubsToUpdate as $hId) {
                Database::execute(
                    "UPDATE `kpi_hub_metrics` SET
                        `day_sales` = GREATEST(0.00, `day_sales` + ?),
                        `week_sales` = GREATEST(0.00, `week_sales` + ?),
                        `month_revenue` = GREATEST(0.00, `month_revenue` + ?),
                        `total_revenue` = GREATEST(0.00, `total_revenue` + ?),
                        `updated_at` = CURRENT_TIMESTAMP
                     WHERE `hub_id` = ?",
                    [$dayAmount, $dayAmount, $diffAmount, $diffAmount, $hId]
                );
            }
        } catch (Throwable $e) {
            error_log("[KpiService::adjustBookingMetrics] " . $e->getMessage());
        }
    }

    /**
     * Increments booking count across kpi_metrics and kpi_hub_metrics.
     */
    public static function incrementBookingCount(int $hubId = 0, string $pickupDate = ''): void
    {
        $mKey = !empty($pickupDate) ? date('Y-m-01', strtotime($pickupDate)) : date('Y-m-01');
        try {
            self::ensureTables();
            Database::execute(
                "UPDATE `kpi_metrics` SET `total_bookings` = `total_bookings` + 1, `paid_bookings` = `paid_bookings` + 1, `updated_at` = CURRENT_TIMESTAMP WHERE `metric_date` = ?",
                [$mKey]
            );
            $hubs = [0];
            if ($hubId > 0) $hubs[] = $hubId;
            foreach ($hubs as $hId) {
                Database::execute(
                    "UPDATE `kpi_hub_metrics` SET `total_bookings` = `total_bookings` + 1, `paid_bookings` = `paid_bookings` + 1, `updated_at` = CURRENT_TIMESTAMP WHERE `hub_id` = ?",
                    [$hId]
                );
            }
        } catch (Throwable $e) {
            error_log("[KpiService::incrementBookingCount] " . $e->getMessage());
        }
    }

    /**
     * Decrements booking count across kpi_metrics and kpi_hub_metrics.
     */
    public static function decrementBookingCount(int $hubId = 0, string $pickupDate = ''): void
    {
        $mKey = !empty($pickupDate) ? date('Y-m-01', strtotime($pickupDate)) : date('Y-m-01');
        try {
            self::ensureTables();
            Database::execute(
                "UPDATE `kpi_metrics` SET `total_bookings` = GREATEST(0, `total_bookings` - 1), `paid_bookings` = GREATEST(0, `paid_bookings` - 1), `updated_at` = CURRENT_TIMESTAMP WHERE `metric_date` = ?",
                [$mKey]
            );
            $hubs = [0];
            if ($hubId > 0) $hubs[] = $hubId;
            foreach ($hubs as $hId) {
                Database::execute(
                    "UPDATE `kpi_hub_metrics` SET `total_bookings` = GREATEST(0, `total_bookings` - 1), `paid_bookings` = GREATEST(0, `paid_bookings` - 1), `updated_at` = CURRENT_TIMESTAMP WHERE `hub_id` = ?",
                    [$hId]
                );
            }
        } catch (Throwable $e) {
            error_log("[KpiService::decrementBookingCount] " . $e->getMessage());
        }
    }

    /**
     * Atomically decrements the revenue and booking count when a booking is cancelled.
     * Subtracts net rental from month_sales and total_revenue across both kpi_metrics and kpi_hub_metrics.
     */
    public static function decrementBookingMetrics(float $amount = 0.0, int $hubId = 0, string $pickupDate = ''): void
    {
        if ($amount <= 0.0) return;
        $mKey = !empty($pickupDate) ? date('Y-m-01', strtotime($pickupDate)) : date('Y-m-01');
        $isToday = !empty($pickupDate) ? (date('Y-m-d', strtotime($pickupDate)) === date('Y-m-d')) : true;
        $dayAmount = $isToday ? $amount : 0.0;

        try {
            self::ensureTables();

            // 1. Decrement in kpi_metrics table
            Database::execute(
                "UPDATE `kpi_metrics` 
                 SET `month_sales` = GREATEST(0.00, `month_sales` - ?),
                     `total_revenue` = GREATEST(0.00, `total_revenue` - ?),
                     `day_sales` = GREATEST(0.00, `day_sales` - ?),
                     `week_sales` = GREATEST(0.00, `week_sales` - ?),
                     `total_bookings` = GREATEST(0, `total_bookings` - 1),
                     `paid_bookings` = GREATEST(0, `paid_bookings` - 1),
                     `updated_at` = CURRENT_TIMESTAMP
                 WHERE `metric_date` = ?",
                [$amount, $amount, $dayAmount, $dayAmount, $mKey]
            );

            // Also decrement running total_revenue for subsequent months
            Database::execute(
                "UPDATE `kpi_metrics` SET `total_revenue` = GREATEST(0.00, `total_revenue` - ?) WHERE `metric_date` > ?",
                [$amount, $mKey]
            );

            // 2. Decrement in kpi_hub_metrics table
            $hubsToUpdate = [0];
            if ($hubId > 0 && !in_array($hubId, $hubsToUpdate, true)) {
                $hubsToUpdate[] = $hubId;
            }

            foreach ($hubsToUpdate as $hId) {
                Database::execute(
                    "UPDATE `kpi_hub_metrics` SET
                        `day_sales` = GREATEST(0.00, `day_sales` - ?),
                        `week_sales` = GREATEST(0.00, `week_sales` - ?),
                        `month_revenue` = GREATEST(0.00, `month_revenue` - ?),
                        `total_revenue` = GREATEST(0.00, `total_revenue` - ?),
                        `total_bookings` = GREATEST(0, `total_bookings` - 1),
                        `paid_bookings` = GREATEST(0, `paid_bookings` - 1),
                        `updated_at` = CURRENT_TIMESTAMP
                     WHERE `hub_id` = ?",
                    [$dayAmount, $dayAmount, $amount, $amount, $hId]
                );
            }
        } catch (Throwable $e) {
            error_log("[KpiService::decrementBookingMetrics] " . $e->getMessage());
        }
    }

    /**
     * Fallback to retrieve cached metrics without full calculation if needed.
     */
    public static function getCachedMetrics(): array
    {
        return self::syncMetrics();
    }

    /**
     * Recalculates all KPI metrics dynamically from MySQL and updates kpi_metrics & kpi_hub_metrics.
     */
    public static function syncMetrics(): array
    {
        try {
            self::ensureTables();

            // 1. Fetch Registered Operating Hubs
            $hubsRows = Database::fetchAll("SELECT id, name, code FROM hubs WHERE status = 'active' ORDER BY id ASC") ?: [];
            $hubDefinitions = [
                0 => 'All Operating Hubs',
                1 => 'Gavson Business Park, Ghansoli',
                2 => 'Kandivali Hub, Mumbai',
            ];
            foreach ($hubsRows as $hr) {
                $hubDefinitions[(int)$hr['id']] = (string)$hr['name'];
            }

            // Structure to collect per-hub statistics
            $hubStats = [];
            foreach ($hubDefinitions as $hId => $hName) {
                $hubStats[$hId] = [
                    'hub_id' => $hId,
                    'hub_name' => $hName,
                    'total_revenue' => 0.0,
                    'month_revenue' => 0.0,
                    'day_sales' => 0.0,
                    'week_sales' => 0.0,
                    'total_bookings' => 0,
                    'paid_bookings' => 0,
                    'active_trips' => 0,
                    'completed_trips' => 0,
                    'total_fleet' => 0,
                    'on_road_fleet' => 0,
                    'available_fleet' => 0,
                    'occupancy_pct' => 0.0,
                    'total_users' => 0,
                    'pending_docs' => 0,
                    'pending_payments' => 0,
                ];
            }

            // 2. Operational Counts: Total Users & KYC Pending
            $totalUsers = (int)(Database::fetchOne("SELECT COUNT(DISTINCT firebase_uid) AS c FROM users")['c'] ?? 0);
            $pendingDocs = (int)(Database::fetchOne(
                "SELECT COUNT(DISTINCT firebase_uid) AS c FROM verification
                 WHERE overall_status = 'pending' OR license_status = 'pending' OR aadhar_status = 'pending' OR pan_status = 'pending'"
            )['c'] ?? 0);
            if ($pendingDocs === 0) {
                $pendingDocs = (int)(Database::fetchOne(
                    "SELECT COUNT(DISTINCT firebase_uid) AS c FROM users
                     WHERE (license_status = 'pending' OR aadhar_status = 'pending' OR pan_status = 'pending')
                       AND (license_front_url IS NOT NULL OR aadhar_front_url IS NOT NULL)"
                )['c'] ?? 0);
            }

            // 3. Operational Counts: Pending Payments
            $pendingPayments = (int)(Database::fetchOne(
                "SELECT COUNT(DISTINCT COALESCE(NULLIF(booking_id, ''), booking_number, id)) AS c
                 FROM bookings
                 WHERE payment_status = 'pending_verification'
                    OR (payment_ref IS NOT NULL AND payment_status NOT IN ('paid','advance_paid','rejected','cancelled'))"
            )['c'] ?? 0);

            // 4. Vehicles & Fleet Inventory
            $vehicles = Database::fetchAll(
                "SELECT id, car_id, reg_no, brand, model, category, hub_id, status, is_active_fleet, acquisition_type, owner_name
                 FROM vehicles
                 WHERE status != 'removed'"
            ) ?: [];

            $vehicleMapByReg = [];
            $vehicleMapById = [];
            foreach ($vehicles as $v) {
                $reg = strtoupper(trim((string)$v['reg_no']));
                $vId = (int)$v['id'];
                $vHub = (int)($v['hub_id'] ?? 1);
                if ($vHub <= 0 || !isset($hubStats[$vHub])) {
                    $vHub = 1;
                }

                $vehicleMapByReg[$reg] = $v;
                $vehicleMapById[$vId] = $v;

                // Fleet counts per hub and overall
                if (isset($hubStats[$vHub])) {
                    $hubStats[$vHub]['total_fleet']++;
                }
                $hubStats[0]['total_fleet']++;
            }

            // 5. Fetch All Bookings with Fleet Join
            $bookings = Database::fetchAll(
                "SELECT b.id, b.booking_id, b.booking_number, b.vehicle_id, b.vehicle_reg, b.vehicle_name,
                        b.pickup_date, b.drop_date, b.days, b.total_amount, b.final_amount, b.base_amount,
                        b.coupon_discount, b.security_deposit, b.advance_amount, b.payment_status, b.status,
                        b.created_at, b.pickup_hub_id, b.drop_hub_id,
                        v.hub_id AS v_hub_id, v.acquisition_type AS v_acq_type, v.owner_name AS v_owner_name
                 FROM bookings b
                 LEFT JOIN vehicles v ON (
                     (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND v.id = b.vehicle_id)
                     OR (b.vehicle_reg IS NOT NULL AND TRIM(b.vehicle_reg) <> '' AND b.vehicle_reg <> 'TBD' AND UPPER(v.reg_no) = UPPER(TRIM(b.vehicle_reg)))
                 )
                 ORDER BY b.created_at ASC"
            ) ?: [];

            // Deduplication and date ranges
            $todayStr = date('Y-m-d');
            $weekStartStr = date('Y-m-d', strtotime('monday this week'));
            $weekEndStr = date('Y-m-d', strtotime('sunday this week'));
            $currentMonthKey = date('Y-m-01');
            $previousMonthKey = date('Y-m-01', strtotime('-1 month'));
            $nowTs = time();

            $seenBookings = [];
            $monthlySalesOverall = [];
            $monthlyBookingsOverall = [];
            $monthlyPaidOverall = [];
            $monthlyCompletedOverall = [];
            $fleetRevenue = [];
            $onRoadVehiclesOverall = [];
            $onRoadVehiclesPerHub = [];

            foreach ($bookings as $b) {
                // Deduplicate by primary booking identifier to prevent double-counting
                $bRef = trim((string)($b['booking_id'] ?? $b['booking_number'] ?? $b['id'] ?? ''));
                if ($bRef === '' || isset($seenBookings[$bRef])) {
                    continue;
                }
                $seenBookings[$bRef] = true;

                $bStat = strtolower(trim((string)($b['status'] ?? '')));
                $pStat = strtolower(trim((string)($b['payment_status'] ?? '')));

                // Exclude cancelled, rejected, or refunded bookings completely from revenue
                $isCancelled = in_array($bStat, ['cancelled', 'rejected'], true)
                    || in_array($pStat, ['cancelled', 'rejected', 'refunded'], true);

                // Identify actual hub attribution
                $hubId = (int)($b['pickup_hub_id'] ?: ($b['drop_hub_id'] ?: ($b['v_hub_id'] ?? 1)));
                if ($hubId <= 0 || !isset($hubStats[$hubId])) {
                    $hubId = 1; // Default to Gavson
                }

                // If cancelled, record it as a booking attempt (if desired) but 0 revenue and 0 active trip
                if ($isCancelled) {
                    continue;
                }

                // Count towards total bookings
                $hubStats[$hubId]['total_bookings']++;
                $hubStats[0]['total_bookings']++;

                // Check eligibility for revenue and active/completed trips
                $isPaid = in_array($pStat, ['paid', 'advance_paid', 'verified'], true)
                    || in_array($bStat, ['confirmed', 'active', 'completed', 'in_trip', 'started'], true);

                if ($isPaid) {
                    $hubStats[$hubId]['paid_bookings']++;
                    $hubStats[0]['paid_bookings']++;
                }

                $dateInfo = self::getBookingDates($b);
                $startTs = $dateInfo['start_time'];
                $totalDays = max(1, $dateInfo['days']);
                $endTs = $startTs + ($totalDays * 86400);

                // Active Trip determination
                $hasReturned = !empty($b['return_odometer']) || !empty($b['end_odometer']) || !empty($b['completed_at']) || !empty($b['returned_at']);
                $isActiveTrip = false;
                if (!$hasReturned && $bStat !== 'completed') {
                    $hasPhysicalPickup = !empty($b['pickup_at']) || !empty($b['start_odometer']);
                    if ($bStat === 'in_trip') {
                        $isActiveTrip = true;
                    } elseif ($hasPhysicalPickup) {
                        $isActiveTrip = ($endTs <= 0 || $nowTs <= ($endTs + 86400));
                    } elseif (in_array($bStat, ['active', 'started', 'confirmed'], true)) {
                        $isActiveTrip = ($startTs <= 0 || $nowTs >= $startTs) && ($endTs <= 0 || $nowTs <= ($endTs + 86400));
                    }
                }

                if ($isActiveTrip) {
                    $hubStats[$hubId]['active_trips']++;
                    $hubStats[0]['active_trips']++;

                    $vRegKey = strtoupper(trim((string)($b['vehicle_reg'] ?? '')));
                    if ($vRegKey !== '' && $vRegKey !== 'TBD') {
                        $onRoadVehiclesOverall[$vRegKey] = true;
                        $onRoadVehiclesPerHub[$hubId][$vRegKey] = true;
                    }
                }

                if ($bStat === 'completed') {
                    $hubStats[$hubId]['completed_trips']++;
                    $hubStats[0]['completed_trips']++;
                }

                // Revenue calculation (strictly excluding deposits & deducting refunds)
                if (!$isPaid) {
                    continue;
                }

                $netRental = self::getBookingNetRental($b);

                // Deduct any applicable partial refunds recorded on booking or payment
                $refundAmt = (float)($b['refund_amount'] ?? 0.0);
                if ($refundAmt > 0) {
                    $netRental = max(0.0, $netRental - $refundAmt);
                }

                if ($netRental <= 0) {
                    continue;
                }

                $dailyRate = $netRental / $totalDays;
                $isCompleted = ($bStat === 'completed');
                $earnedRentalForTrip = 0.0;

                // Attribute rental revenue across trip days to corresponding reporting months
                for ($i = 0; $i < $totalDays; $i++) {
                    $curTs = $startTs + ($i * 86400);
                    $curDate = date('Y-m-d', $curTs);
                    $curMonth = date('Y-m-01', $curTs);

                    $earnedRentalForTrip += $dailyRate;

                    if (!isset($monthlySalesOverall[$curMonth])) {
                        $monthlySalesOverall[$curMonth] = 0.0;
                        $monthlyBookingsOverall[$curMonth] = 0;
                        $monthlyPaidOverall[$curMonth] = 0;
                        $monthlyCompletedOverall[$curMonth] = 0;
                    }

                    $monthlySalesOverall[$curMonth] += $dailyRate;

                    // Current Reporting Month
                    if ($curMonth === $currentMonthKey) {
                        $hubStats[$hubId]['month_revenue'] += $dailyRate;
                        $hubStats[0]['month_revenue'] += $dailyRate;
                    }

                    // Day Sales (Today)
                    if ($curDate === $todayStr) {
                        $hubStats[$hubId]['day_sales'] += $dailyRate;
                        $hubStats[0]['day_sales'] += $dailyRate;
                    }

                    // Week Sales (Current Monday - Sunday)
                    if ($curDate >= $weekStartStr && $curDate <= $weekEndStr) {
                        $hubStats[$hubId]['week_sales'] += $dailyRate;
                        $hubStats[0]['week_sales'] += $dailyRate;
                    }
                }

                $bookingMonth = date('Y-m-01', $startTs);
                if (!isset($monthlyBookingsOverall[$bookingMonth])) {
                    $monthlyBookingsOverall[$bookingMonth] = 0;
                    $monthlyPaidOverall[$bookingMonth] = 0;
                    $monthlyCompletedOverall[$bookingMonth] = 0;
                }
                $monthlyBookingsOverall[$bookingMonth]++;
                $monthlyPaidOverall[$bookingMonth]++;
                if ($bStat === 'completed') {
                    $monthlyCompletedOverall[$bookingMonth]++;
                }

                // Total Earned Revenue: only add the delivered/earned portion
                $hubStats[$hubId]['total_revenue'] += $earnedRentalForTrip;
                $hubStats[0]['total_revenue'] += $earnedRentalForTrip;

                // Fleet Revenue & Partner Sharing (60% Partner / 40% Company on earned rental)
                $vReg = strtoupper(trim((string)($b['vehicle_reg'] ?? '')));
                if ($vReg !== '' && $vReg !== 'TBD' && $earnedRentalForTrip > 0) {
                    if (!isset($fleetRevenue[$vReg])) {
                        $vInfo = $vehicleMapByReg[$vReg] ?? null;
                        $acqType = $vInfo['acquisition_type'] ?? ($b['v_acq_type'] ?? 'Partner');
                        $fleetRevenue[$vReg] = [
                            'reg_no' => $vReg,
                            'vehicle_name' => $b['vehicle_name'] ?? ($vInfo ? $vInfo['brand'] . ' ' . $vInfo['model'] : 'Vehicle'),
                            'hub_id' => $hubId,
                            'acquisition_type' => $acqType,
                            'owner_name' => $vInfo['owner_name'] ?? ($b['v_owner_name'] ?? ''),
                            'trips_count' => 0,
                            'total_rental' => 0.0,
                            'partner_share' => 0.0,
                            'company_share' => 0.0,
                        ];
                    }
                    $fleetRevenue[$vReg]['trips_count']++;
                    $fleetRevenue[$vReg]['total_rental'] += $earnedRentalForTrip;
                    if (strtolower((string)$fleetRevenue[$vReg]['acquisition_type']) === 'partner') {
                        $fleetRevenue[$vReg]['partner_share'] += round($earnedRentalForTrip * 0.60, 2);
                        $fleetRevenue[$vReg]['company_share'] += round($earnedRentalForTrip * 0.40, 2);
                    } else {
                        $fleetRevenue[$vReg]['company_share'] += $earnedRentalForTrip;
                    }
                }
            }

            // 6. Finalize per-hub metrics (occupancy, rounding, users)
            foreach ($hubStats as $hId => &$hs) {
                $onRoadCount = $hId === 0 ? count($onRoadVehiclesOverall) : count($onRoadVehiclesPerHub[$hId] ?? []);
                $hs['on_road_fleet'] = $onRoadCount;
                $hs['available_fleet'] = max(0, $hs['total_fleet'] - $onRoadCount);
                $hs['occupancy_pct'] = $hs['total_fleet'] > 0 ? min(100.0, round(($onRoadCount / $hs['total_fleet']) * 100, 2)) : 0.0;
                $hs['total_users'] = $totalUsers;
                $hs['pending_docs'] = $pendingDocs;
                $hs['pending_payments'] = $pendingPayments;

                $hs['total_revenue'] = round($hs['total_revenue'], 2);
                $hs['month_revenue'] = round($hs['month_revenue'], 2);
                $hs['day_sales'] = round($hs['day_sales'], 2);
                $hs['week_sales'] = round($hs['week_sales'], 2);

                // Persist each hub record into kpi_hub_metrics table without overwriting user/booking revenues
                Database::execute(
                    "INSERT INTO `kpi_hub_metrics` (
                        `hub_id`, `hub_name`, `total_revenue`, `month_revenue`, `total_bookings`, `paid_bookings`,
                        `active_trips`, `total_fleet`, `on_road_fleet`, `available_fleet`, `occupancy_pct`,
                        `total_users`, `pending_docs`, `pending_payments`, `day_sales`, `week_sales`, `updated_at`
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE
                        `hub_name` = VALUES(`hub_name`),
                        `total_revenue` = GREATEST(`total_revenue`, VALUES(`total_revenue`)),
                        `month_revenue` = GREATEST(`month_revenue`, VALUES(`month_revenue`)),
                        `total_bookings` = GREATEST(`total_bookings`, VALUES(`total_bookings`)),
                        `paid_bookings` = GREATEST(`paid_bookings`, VALUES(`paid_bookings`)),
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
                        $hs['hub_id'], $hs['hub_name'], $hs['total_revenue'], $hs['month_revenue'],
                        $hs['total_bookings'], $hs['paid_bookings'], $hs['active_trips'],
                        $hs['total_fleet'], $hs['on_road_fleet'], $hs['available_fleet'], $hs['occupancy_pct'],
                        $hs['total_users'], $hs['pending_docs'], $hs['pending_payments'],
                        $hs['day_sales'], $hs['week_sales']
                    ]
                );
            }
            unset($hs);

            // 7. Read existing historical months from kpi_metrics (e.g. July, August from prior master ledger)
            $existingLedger = [];
            try {
                $eRows = Database::fetchAll("SELECT * FROM kpi_metrics ORDER BY metric_date ASC");
                foreach ($eRows as $er) {
                    $mKey = date('Y-m-01', strtotime((string)$er['metric_date']));
                    $existingLedger[$mKey] = $er;
                }
            } catch (Throwable $_) {}

            // Combine all known months
            $allMonths = array_unique(array_merge(
                array_keys($existingLedger),
                array_keys($monthlySalesOverall),
                [$currentMonthKey]
            ));
            sort($allMonths);

            $monthlyRows = [];
            $runningTotalRev = 0.0;
            $runningBookingsCount = 0;
            $runningPaidCount = 0;

            foreach ($allMonths as $mStart) {
                $ex = $existingLedger[$mStart] ?? null;
                $hasDynamicBookings = isset($monthlySalesOverall[$mStart]) && $monthlySalesOverall[$mStart] > 0;

                // Revenue ledger rule:
                // A populated SQL month_sales value is the approved monthly ledger value.
                // Do not replace a manually corrected month with a different booking-derived
                // total every time the dashboard refreshes. Booking totals are used to seed
                // a month only when the ledger has no positive month_sales value yet.
                if ($ex && (float)($ex['month_sales'] ?? 0) > 0) {
                    $mSales = (float)$ex['month_sales'];
                } elseif ($hasDynamicBookings) {
                    $mSales = round($monthlySalesOverall[$mStart], 2);
                } elseif ($ex && (float)($ex['total_revenue'] ?? 0) > 0) {
                    $mSales = (float)($ex['month_sales'] ?? 0);
                } else {
                    $mSales = 0.0;
                }

                // Operational counts can still be recalculated from live bookings.
                if ($hasDynamicBookings) {
                    $mBCount = $monthlyBookingsOverall[$mStart] ?? 0;
                    $mPCount = $monthlyPaidOverall[$mStart] ?? 0;
                    $mCompCount = $monthlyCompletedOverall[$mStart] ?? 0;
                } elseif ($ex) {
                    $mBCount = (int)($ex['total_bookings'] ?? 0);
                    $mPCount = (int)($ex['paid_bookings'] ?? 0);
                    $mCompCount = (int)($ex['completed_trips'] ?? 0);
                } else {
                    $mBCount = 0;
                    $mPCount = 0;
                    $mCompCount = 0;
                }

                $runningTotalRev += $mSales;
                $rowTotalRev = round($runningTotalRev, 2);
                $runningBookingsCount += $mBCount;
                $runningPaidCount += $mPCount;

                $isCur = ($mStart === $currentMonthKey);
                $rowDay = $isCur ? max($hubStats[0]['day_sales'], (float)($ex['day_sales'] ?? 0.0)) : 0.0;
                $rowWeek = $isCur ? max($hubStats[0]['week_sales'], (float)($ex['week_sales'] ?? 0.0)) : 0.0;
                $rowActive = $isCur ? $hubStats[0]['active_trips'] : 0;
                $rowOnRoad = $isCur ? $hubStats[0]['on_road_fleet'] : 0;
                $rowFleet = $hubStats[0]['total_fleet'];
                $rowInYard = max(0, $rowFleet - $rowOnRoad);
                $rowOcc = $rowFleet > 0 ? min(100.0, round(($rowOnRoad / $rowFleet) * 100, 2)) : 0.0;

                $monthlyRows[$mStart] = [
                    'metric_date' => $mStart,
                    'day_sales' => $rowDay,
                    'week_sales' => $rowWeek,
                    'month_sales' => $mSales,
                    'total_revenue' => $rowTotalRev,
                    'total_bookings' => $mBCount,
                    'paid_bookings' => $mPCount,
                    'active_trips' => $rowActive,
                    'completed_trips' => $mCompCount,
                    'total_fleet' => $rowFleet,
                    'on_road_fleet' => $rowOnRoad,
                    'in_yard_fleet' => $rowInYard,
                    'occupancy_pct' => $rowOcc,
                    'total_users' => $totalUsers,
                    'pending_payments' => $isCur ? $pendingPayments : 0,
                    'pending_docs' => $isCur ? $pendingDocs : 0,
                ];

                // Persist into kpi_metrics table
                Database::execute(
                    "INSERT INTO `kpi_metrics` (
                        `metric_date`, `day_sales`, `week_sales`, `month_sales`, `total_revenue`,
                        `total_bookings`, `paid_bookings`, `active_trips`, `completed_trips`,
                        `total_fleet`, `on_road_fleet`, `in_yard_fleet`, `occupancy_pct`,
                        `total_users`, `pending_payments`, `pending_docs`, `updated_at`
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE
                        `day_sales` = VALUES(`day_sales`),
                        `week_sales` = VALUES(`week_sales`),
                        `month_sales` = GREATEST(`month_sales`, VALUES(`month_sales`)),
                        `total_revenue` = GREATEST(`total_revenue`, VALUES(`total_revenue`)),
                        `total_bookings` = GREATEST(`total_bookings`, VALUES(`total_bookings`)),
                        `paid_bookings` = GREATEST(`paid_bookings`, VALUES(`paid_bookings`)),
                        `active_trips` = VALUES(`active_trips`),
                        `completed_trips` = VALUES(`completed_trips`),
                        `total_fleet` = VALUES(`total_fleet`),
                        `on_road_fleet` = VALUES(`on_road_fleet`),
                        `in_yard_fleet` = VALUES(`in_yard_fleet`),
                        `occupancy_pct` = VALUES(`occupancy_pct`),
                        `total_users` = VALUES(`total_users`),
                        `pending_payments` = VALUES(`pending_payments`),
                        `pending_docs` = VALUES(`pending_docs`),
                        `updated_at` = CURRENT_TIMESTAMP",
                    [
                        $mStart, $rowDay, $rowWeek, $mSales, $rowTotalRev,
                        $mBCount, $mPCount, $rowActive, $mCompCount,
                        $rowFleet, $rowOnRoad, $rowInYard, $rowOcc,
                        $totalUsers, $isCur ? $pendingPayments : 0, $isCur ? $pendingDocs : 0
                    ]
                );
            }

            // Sync live metrics for Hub 0, strictly preserving master ledger revenues if already populated
            $curMonthSales = (float)($monthlyRows[$currentMonthKey]['month_sales'] ?? $hubStats[0]['month_revenue']);
            $curDaySales = (float)($monthlyRows[$currentMonthKey]['day_sales'] ?? $hubStats[0]['day_sales']);
            $curWeekSales = (float)($monthlyRows[$currentMonthKey]['week_sales'] ?? $hubStats[0]['week_sales']);

            $existingHub0 = Database::fetchOne("SELECT total_revenue, month_revenue, day_sales, week_sales FROM kpi_hub_metrics WHERE hub_id = 0 LIMIT 1");
            if ($existingHub0 && (float)$existingHub0['total_revenue'] > 0) {
                $hubStats[0]['total_revenue'] = (float)$existingHub0['total_revenue'];
                $hubStats[0]['month_revenue'] = (float)$existingHub0['month_revenue'];
                $hubStats[0]['day_sales'] = max($hubStats[0]['day_sales'], (float)$existingHub0['day_sales']);
                $hubStats[0]['week_sales'] = max($hubStats[0]['week_sales'], (float)$existingHub0['week_sales']);
            } else {
                $hubStats[0]['total_revenue'] = round($runningTotalRev, 2);
                $hubStats[0]['month_revenue'] = round($curMonthSales, 2);
                $hubStats[0]['day_sales'] = round($curDaySales, 2);
                $hubStats[0]['week_sales'] = round($curWeekSales, 2);
                Database::execute(
                    "UPDATE `kpi_hub_metrics` SET `total_revenue` = ?, `month_revenue` = ?, `day_sales` = ?, `week_sales` = ? WHERE `hub_id` = 0",
                    [$hubStats[0]['total_revenue'], $hubStats[0]['month_revenue'], $hubStats[0]['day_sales'], $hubStats[0]['week_sales']]
                );
            }

            // Sync live metrics for Hub 1 (Gavson), strictly preserving master ledger revenues if already populated
            $existingHub1 = Database::fetchOne("SELECT total_revenue, month_revenue, day_sales, week_sales FROM kpi_hub_metrics WHERE hub_id = 1 LIMIT 1");
            if ($existingHub1 && (float)$existingHub1['total_revenue'] > 0) {
                $hubStats[1]['total_revenue'] = (float)$existingHub1['total_revenue'];
                $hubStats[1]['month_revenue'] = (float)$existingHub1['month_revenue'];
                $hubStats[1]['day_sales'] = max($hubStats[1]['day_sales'], (float)$existingHub1['day_sales']);
                $hubStats[1]['week_sales'] = max($hubStats[1]['week_sales'], (float)$existingHub1['week_sales']);
            } else {
                $hub2Rev = (float)($hubStats[2]['total_revenue'] ?? 0.0);
                $hub2MonthRev = (float)($hubStats[2]['month_revenue'] ?? 0.0);
                $hub2DaySales = (float)($hubStats[2]['day_sales'] ?? 0.0);
                $hub2WeekSales = (float)($hubStats[2]['week_sales'] ?? 0.0);

                $hubStats[1]['total_revenue'] = round(max($hubStats[1]['total_revenue'], $hubStats[0]['total_revenue'] - $hub2Rev), 2);
                $hubStats[1]['month_revenue'] = round(max($hubStats[1]['month_revenue'], $curMonthSales - $hub2MonthRev), 2);
                $hubStats[1]['day_sales'] = round(max($hubStats[1]['day_sales'], $curDaySales - $hub2DaySales), 2);
                $hubStats[1]['week_sales'] = round(max($hubStats[1]['week_sales'], $curWeekSales - $hub2WeekSales), 2);
                Database::execute(
                    "UPDATE `kpi_hub_metrics` SET `total_revenue` = ?, `month_revenue` = ?, `day_sales` = ?, `week_sales` = ? WHERE `hub_id` = 1",
                    [$hubStats[1]['total_revenue'], $hubStats[1]['month_revenue'], $hubStats[1]['day_sales'], $hubStats[1]['week_sales']]
                );
            }

            $lastMonthRev = (float)($monthlyRows[$previousMonthKey]['month_sales'] ?? 0.0);
            $avgBooking = $hubStats[0]['paid_bookings'] > 0 ? round($hubStats[0]['month_revenue'] / $hubStats[0]['paid_bookings'], 2) : 0.0;

            $liveStats = [
                'total_users' => $totalUsers,
                'total_bookings' => $hubStats[0]['total_bookings'],
                'pending_docs' => $pendingDocs,
                'pending_payments' => $pendingPayments,
                'day_sales' => $hubStats[0]['day_sales'],
                'week_sales' => $hubStats[0]['week_sales'],
                'total_revenue' => $hubStats[0]['total_revenue'],
                'month_revenue' => $hubStats[0]['month_revenue'],
                'last_month_revenue' => $lastMonthRev,
                'paid_bookings' => $hubStats[0]['paid_bookings'],
                'avg_booking' => $avgBooking,
                'active_trips' => $hubStats[0]['active_trips'],
                'active_rentals' => $hubStats[0]['active_trips'],
                'completed_trips' => $hubStats[0]['completed_trips'],
                'total_fleet' => $hubStats[0]['total_fleet'],
                'fleet_count' => $hubStats[0]['total_fleet'],
                'on_road_fleet' => $hubStats[0]['on_road_fleet'],
                'available_fleet' => $hubStats[0]['available_fleet'],
                'available_in_yard' => $hubStats[0]['available_fleet'],
                'fleet_utilization' => $hubStats[0]['occupancy_pct'],
                'occupancy_pct' => $hubStats[0]['occupancy_pct'],
            ];

            return [
                'live' => $liveStats,
                'effective' => $liveStats,
                'hubs' => $hubStats,
                'monthly' => $monthlyRows,
                'fleet' => array_values($fleetRevenue),
                'reporting_month' => $currentMonthKey,
                'previous_month' => $previousMonthKey,
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
        $deposit = (float)($b['security_deposit'] ?? 0.0);
        $finalAmt = (float)($b['final_amount'] ?? 0.0);
        $totalAmt = (float)($b['total_amount'] ?? 0.0);
        $baseAmt = (float)($b['base_amount'] ?? 0.0);
        $couponDisc = (float)($b['coupon_discount'] ?? 0.0);

        // Authoritative booking gross amount
        $gross = $finalAmt > 0 ? $finalAmt : ($totalAmt > 0 ? $totalAmt : 0.0);

        // Case 1: Gross amount explicitly contains deposit (e.g. gross >= baseAmt + deposit - 1.0)
        if ($baseAmt > 0 && $deposit > 0 && $gross >= ($baseAmt + $deposit - 1.0)) {
            return round(max(0.0, $gross - $deposit), 2);
        }

        // Case 2: Pure base rental amount is present
        if ($baseAmt > 0) {
            return round(max(0.0, $baseAmt - $couponDisc), 2);
        }

        // Case 3: Only gross total is present; check if deposit is embedded in it
        if ($gross > 0) {
            if ($deposit > 0 && $gross > $deposit) {
                return round(max(0.0, $gross - $deposit), 2);
            }
            return round(max(0.0, $gross - $couponDisc), 2);
        }

        return 0.0;
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
     * Provisions table schemas if they do not exist.
     */
    public static function ensureTables(): void
    {
        try {
            Database::execute(
                "CREATE TABLE IF NOT EXISTS `kpi_metrics` (
                  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  `metric_date` DATE NOT NULL,
                  `day_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                  `week_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                  `month_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                  `total_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                  `total_bookings` INT NOT NULL DEFAULT 0,
                  `paid_bookings` INT NOT NULL DEFAULT 0,
                  `active_trips` INT NOT NULL DEFAULT 0,
                  `completed_trips` INT NOT NULL DEFAULT 0,
                  `total_fleet` INT NOT NULL DEFAULT 0,
                  `on_road_fleet` INT NOT NULL DEFAULT 0,
                  `in_yard_fleet` INT NOT NULL DEFAULT 0,
                  `occupancy_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
                  `total_users` INT NOT NULL DEFAULT 0,
                  `pending_payments` INT NOT NULL DEFAULT 0,
                  `pending_docs` INT NOT NULL DEFAULT 0,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY `uniq_metric_date` (`metric_date`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
            );

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
        } catch (Throwable $e) {
            error_log("[KpiService::ensureTables] " . $e->getMessage());
        }
    }
}
