<?php
/**
 * api/services/KpiService.php
 *
 * Unified Authoritative Server-Side Engines for KRUIZLY:
 * 1. Date & Rental Duration Engine (IST '+05:30', 24-hour rolling block convention, strict validation)
 * 2. Financial Calculation Engine (base + driver + extra - discount; deposits excluded; verified collections & refunds separated)
 * 3. Hub Attribution Engine (100% DB-driven `hubs` table; never defaults missing hub_id to Hub 1; cross-hub return tracking)
 * 4. Vehicle & Fleet State Engine (separates registered, active_fleet, available_recorded, on_trip, in_yard, maintenance, inactive, removed, scheduled)
 * 5. Reporting & Reconciliation Engine (single source of truth for stats.php, hubs/summary.php, export.php, and dashboards)
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

class KpiService
{
    public const TIMEZONE = 'Asia/Kolkata';

    private static ?DateTimeZone $tzInstance = null;

    private static function tz(): DateTimeZone
    {
        if (self::$tzInstance === null) {
            self::$tzInstance = new DateTimeZone(self::TIMEZONE);
        }
        return self::$tzInstance;
    }

    /**
     * Parses a date/datetime string strictly without substituting current time on invalid input.
     *
     * @param mixed $value
     */
    public static function parseValidTimestamp($value): ?int
    {
        if ($value === null || is_bool($value)) {
            return null;
        }
        if (is_int($value) || (is_string($value) && ctype_digit($value) && strlen($value) >= 9)) {
            $ts = (int)$value;
            return $ts > 0 ? $ts : null;
        }
        $raw = trim((string)$value);
        if ($raw === '' || $raw === '—' || $raw === 'null' || $raw === 'undefined' || str_starts_with($raw, '0000-00-00')) {
            return null;
        }

        // Handle DD/MM/YYYY [HH:mm[:ss] [AM|PM]] or DD-MM-YYYY ...
        if (preg_match('/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i', $raw, $m)) {
            $day = (int)$m[1];
            $month = (int)$m[2];
            $year = (int)$m[3];
            $hour = isset($m[4]) && $m[4] !== '' ? (int)$m[4] : 0;
            $min = isset($m[5]) && $m[5] !== '' ? (int)$m[5] : 0;
            $sec = isset($m[6]) && $m[6] !== '' ? (int)$m[6] : 0;
            $ampm = isset($m[7]) ? strtoupper($m[7]) : '';
            if ($ampm === 'PM' && $hour < 12) {
                $hour += 12;
            } elseif ($ampm === 'AM' && $hour === 12) {
                $hour = 0;
            }
            if (!checkdate($month, $day, $year)) {
                return null;
            }
            $dt = DateTimeImmutable::createFromFormat(
                'Y-n-j G:i:s',
                sprintf('%04d-%d-%d %d:%02d:%02d', $year, $month, $day, $hour, $min, $sec),
                self::tz()
            );
            return $dt instanceof DateTimeImmutable ? $dt->getTimestamp() : null;
        }

        // Standard ISO / SQL formats
        try {
            $dt = new DateTimeImmutable($raw, self::tz());
            $dtIst = $dt->setTimezone(self::tz());
            $y = (int)$dtIst->format('Y');
            if ($y < 2000 || $y > 2100) {
                return null;
            }
            return $dtIst->getTimestamp();
        } catch (Throwable $_) {
            return null;
        }
    }

    /**
     * Validates pickup & drop date inputs under the documented 24-hour rolling block convention.
     * Rejects invalid dates or durations without silently replacing them with current time or 24h.
     *
     * @param mixed $pickupRaw
     * @param mixed $dropRaw
     */
    public static function validateBookingDates($pickupRaw, $dropRaw, bool $requireMin24Hours = true, ?int $explicitDays = null): array
    {
        $pTs = self::parseValidTimestamp($pickupRaw);
        $dTs = self::parseValidTimestamp($dropRaw);

        if ($pTs === null) {
            return ['valid' => false, 'error' => 'Valid pickup date and time is required.'];
        }
        if ($dTs === null) {
            return ['valid' => false, 'error' => 'Valid return date and time is required.'];
        }
        if ($dTs <= $pTs) {
            return ['valid' => false, 'error' => 'Return date & time must be strictly after pickup date & time.'];
        }

        $diffSeconds = $dTs - $pTs;
        $rawHours = max(1, (int)ceil($diffSeconds / 3600));
        if ($requireMin24Hours && $rawHours < 24) {
            return ['valid' => false, 'error' => 'Booking duration must be a minimum of 24 hours (1 full day).'];
        }

        $hours = $requireMin24Hours ? max(24, $rawHours) : $rawHours;
        $days = max(1, (int)ceil($hours / 24));

        // Preserve explicit inclusive calendar days only when date-only 00:00:00 entries specify calendarDiff + 1
        $pDt = (new DateTimeImmutable('@' . $pTs))->setTimezone(self::tz());
        $dDt = (new DateTimeImmutable('@' . $dTs))->setTimezone(self::tz());
        if ($explicitDays !== null && $explicitDays > 0 && $pDt->format('H:i:s') === '00:00:00' && $dDt->format('H:i:s') === '00:00:00') {
            $calDiff = (int)$pDt->diff($dDt)->days;
            if ($explicitDays === $calDiff || $explicitDays === $calDiff + 1) {
                $days = $explicitDays;
                $hours = $days * 24;
            }
        }

        $fullDays = (int)floor($hours / 24);
        $remHours = $hours % 24;
        if ($fullDays > 0 && $remHours > 0) {
            $duration = "{$fullDays} Day" . ($fullDays > 1 ? 's' : '') . " {$remHours} Hr" . ($remHours > 1 ? 's' : '') . " ({$hours} hrs)";
        } else {
            $bDays = max(1, $fullDays);
            $duration = "{$bDays} Day" . ($bDays > 1 ? 's' : '') . " ({$hours} hrs)";
        }

        return [
            'valid' => true,
            'error' => null,
            'pickup_ts' => $pTs,
            'drop_ts' => $dTs,
            'pickup_sql' => $pDt->format('Y-m-d H:i:s'),
            'drop_sql' => $dDt->format('Y-m-d H:i:s'),
            'start_date' => $pDt->format('Y-m-d'),
            'drop_date' => $dDt->format('Y-m-d'),
            'hours' => $hours,
            'days' => $days,
            'full_days' => $fullDays,
            'rem_hours' => $remHours,
            'duration' => $duration,
        ];
    }

    /**
     * Normalizes pickup start date, return date, and billed duration days from a booking row.
     * Never silently substitutes current wall-clock time on corrupt dates.
     */
    public static function getBookingDates(array $b): array
    {
        $pTs = self::parseValidTimestamp($b['pickup_date'] ?? $b['pickupDate'] ?? null);
        $dTs = self::parseValidTimestamp($b['drop_date'] ?? $b['dropDate'] ?? $b['return_date'] ?? null);
        $cTs = self::parseValidTimestamp($b['created_at'] ?? $b['createdAt'] ?? null);
        $storedDays = (int)($b['days'] ?? 0);
        $storedHours = (int)($b['hours'] ?? 0);

        $dateWarning = null;
        $dateValid = true;
        if ($pTs === null) {
            $dateValid = false;
            if ($cTs !== null) {
                $pTs = $cTs;
                $dateWarning = 'Missing or invalid pickup_date; fell back to created_at.';
            } else {
                return [
                    'valid' => false,
                    'date_warning' => 'Missing or invalid pickup_date and created_at.',
                    'start_date' => null,
                    'drop_date' => null,
                    'actual_return_date' => null,
                    'start_time' => null,
                    'drop_time' => null,
                    'days' => max(1, $storedDays),
                    'hours' => max(24, $storedHours),
                ];
            }
        }

        $pDt = (new DateTimeImmutable('@' . $pTs))->setTimezone(self::tz());
        $startYmd = $pDt->format('Y-m-d');

        $computedDays = 0;
        $computedHours = 0;
        $dropYmd = null;

        if ($dTs !== null && $dTs > $pTs) {
            $dDt = (new DateTimeImmutable('@' . $dTs))->setTimezone(self::tz());
            $dropYmd = $dDt->format('Y-m-d');
            $computedHours = max(1, (int)ceil(($dTs - $pTs) / 3600));
            $computedDays = max(1, (int)ceil($computedHours / 24));

            // Allow date-only inclusive 4-day bookings like 2026-11-30 00:00 -> 2026-12-03 00:00 when stored days = calDiff + 1
            if ($storedDays > 0 && $pDt->format('H:i:s') === '00:00:00' && $dDt->format('H:i:s') === '00:00:00') {
                $calDiff = (int)$pDt->diff($dDt)->days;
                if ($storedDays === $calDiff + 1 || $storedDays === $calDiff) {
                    $computedDays = $storedDays;
                    $computedHours = $storedDays * 24;
                }
            } elseif ($storedDays > 0 && $storedDays === $computedDays) {
                $computedDays = $storedDays;
            }
        } elseif ($dTs !== null && $dTs <= $pTs) {
            $dateValid = false;
            $dateWarning = ($dateWarning ? $dateWarning . ' ' : '') . 'drop_date is not after pickup_date.';
            $computedDays = $storedDays > 0 ? $storedDays : 1;
            $computedHours = $storedHours > 0 ? $storedHours : ($computedDays * 24);
            $dropYmd = $pDt->modify('+' . max(0, $computedDays - 1) . ' days')->format('Y-m-d');
        } else {
            $dateValid = false;
            $dateWarning = ($dateWarning ? $dateWarning . ' ' : '') . 'Missing or invalid drop_date.';
            $computedDays = $storedDays > 0 ? $storedDays : ($storedHours > 0 ? max(1, (int)ceil($storedHours / 24)) : 1);
            $computedHours = $storedHours > 0 ? $storedHours : ($computedDays * 24);
            $dropYmd = $pDt->modify('+' . max(0, $computedDays - 1) . ' days')->format('Y-m-d');
        }

        $actualReturnTs = self::parseValidTimestamp($b['returned_at'] ?? $b['completed_at'] ?? null);
        $actualReturnYmd = $actualReturnTs !== null
            ? (new DateTimeImmutable('@' . $actualReturnTs))->setTimezone(self::tz())->format('Y-m-d')
            : $dropYmd;

        return [
            'valid' => $dateValid,
            'date_warning' => $dateWarning,
            'start_date' => $startYmd,
            'drop_date' => $dropYmd,
            'actual_return_date' => $actualReturnYmd,
            'start_time' => $pTs,
            'drop_time' => $dTs ?? ($pTs + ($computedDays * 86400)),
            'days' => max(1, $computedDays),
            'hours' => max(1, $computedHours),
        ];
    }

    /**
     * Authoritative Financial Engine per booking.
     * Separates Base Rental, Driver Charges, Extra Charges, Coupon Discount, Security Deposit,
     * Verified Collections, Refunds, and Outstanding Receivable.
     *
     * @param array $b Booking row
     * @param array $paymentAgg Optional aggregated verified/pending/refund data from `payments` table
     */
    public static function computeBookingFinancials(array $b, array $paymentAgg = []): array
    {
        $bStat = strtolower(trim((string)($b['status'] ?: ($b['booking_status'] ?: ''))));
        $pStat = strtolower(trim((string)($b['payment_status'] ?? '')));

        $isCancelled = in_array($bStat, ['cancelled', 'rejected'], true)
            || in_array($pStat, ['cancelled', 'rejected'], true);
        $isRefundedStatus = ($pStat === 'refunded' || $bStat === 'refunded');

        $baseRental = max(0.0, round((float)($b['base_amount'] ?? $b['baseAmount'] ?? 0.0), 2));
        $deposit = max(0.0, round((float)($b['security_deposit'] ?? $b['securityDeposit'] ?? 0.0), 2));
        $couponDiscount = max(0.0, round((float)($b['coupon_discount'] ?? $b['couponDiscount'] ?? 0.0), 2));
        $extraCharges = max(0.0, round((float)($b['extra_charges'] ?? $b['extraCharges'] ?? 0.0), 2));

        $explicitDriver = max(0.0, round((float)($b['driver_charges'] ?? $b['driverCharges'] ?? 0.0), 2));
        $withDriver = (int)($b['with_driver'] ?? $b['withDriver'] ?? 0) === 1;
        $driverRate = max(0.0, round((float)($b['driver_rate'] ?? $b['driverRate'] ?? 0.0), 2));

        $dates = self::getBookingDates($b);
        $billedDays = max(1, (int)$dates['days']);
        $billedHours = max(1, (int)$dates['hours']);

        if ($explicitDriver > 0.0) {
            $driverCharges = $explicitDriver;
        } elseif ($withDriver && $driverRate > 0.0) {
            $fullDays = (int)floor($billedHours / 24);
            $remHours = $billedHours % 24;
            $calcDriver = ($fullDays > 0 || $remHours > 0)
                ? (($fullDays * $driverRate) + ($remHours > 0 ? round($remHours * ($driverRate / 24), 2) : 0.0))
                : ($billedDays * $driverRate);
            $driverCharges = round(max($driverRate, $calcDriver), 2);
        } else {
            $driverCharges = 0.0;
        }

        $finalAmt = max(0.0, round((float)($b['final_amount'] ?? $b['finalAmount'] ?? 0.0), 2));
        $totalAmt = max(0.0, round((float)($b['total_amount'] ?? $b['totalAmount'] ?? 0.0), 2));
        $legacyAmt = max(0.0, round((float)($b['amount'] ?? 0.0), 2));
        $rawGross = $finalAmt > 0.0 ? $finalAmt : ($totalAmt > 0.0 ? $totalAmt : $legacyAmt);

        $sumComponents = max(0.0, round($baseRental + $driverCharges + $extraCharges - $couponDiscount, 2));
        $depositEmbeddedLegacy = false;

        if ($baseRental > 0.0) {
            if ($deposit > 0.0 && $rawGross >= ($sumComponents + $deposit - 1.0)) {
                // Legacy invoice update or import baked refundable security deposit inside total_amount
                $depositEmbeddedLegacy = true;
                $extracted = round(max(0.0, $rawGross - $deposit), 2);
                if ($extraCharges <= 0.0 && $extracted > ($sumComponents + 0.01)) {
                    $extraCharges = round($extracted - $sumComponents, 2);
                }
                $netRentalBeforeRefund = $extracted;
            } elseif ($explicitDriver > 0.0 || $extraCharges > 0.0) {
                $netRentalBeforeRefund = $sumComponents;
            } elseif ($withDriver && $driverCharges > 0.0) {
                // Preserve full base + driver - discount even when older create flows drifted total_amount
                $netRentalBeforeRefund = ($rawGross > $sumComponents) ? $rawGross : $sumComponents;
            } elseif ($rawGross > 0.0) {
                if ($rawGross > ($baseRental + 0.01) && $couponDiscount <= 0.0 && $extraCharges <= 0.0 && $driverCharges <= 0.0) {
                    $extraCharges = round($rawGross - $baseRental, 2);
                }
                $netRentalBeforeRefund = $rawGross;
            } else {
                $netRentalBeforeRefund = $sumComponents;
            }
        } else {
            // No itemized base_amount stored: treat stored rental total as base rental (do NOT subtract deposit)
            $netRentalBeforeRefund = $rawGross;
            $baseRental = round(max(0.0, $rawGross + $couponDiscount - $driverCharges - $extraCharges), 2);
        }

        // Verified payments aggregation (never trust unverified advance_amount)
        $hasPaymentRows = !empty($paymentAgg['has_rows']);
        $paymentsVerifiedSum = max(0.0, round((float)($paymentAgg['verified_paid'] ?? 0.0), 2));
        $paymentsPendingSum = max(0.0, round((float)($paymentAgg['pending_amount'] ?? 0.0), 2));
        $paymentsPendingCount = (int)($paymentAgg['pending_count'] ?? 0);
        $paymentsRefundSum = max(0.0, round((float)($paymentAgg['refund_amount'] ?? 0.0), 2));
        $duplicatePaymentsSkipped = (int)($paymentAgg['duplicates_skipped'] ?? 0);

        $bookingRefund = max(0.0, round((float)($b['refund_amount'] ?? 0.0), 2));
        $refundAmount = round(max($bookingRefund, $paymentsRefundSum), 2);

        $verifiedCollected = 0.0;
        if ($hasPaymentRows) {
            // Authoritative verified payments from `payments` table
            $verifiedCollected = $paymentsVerifiedSum;
            // If legacy refunded payment moved from verified -> refunded with amount still in booking paid column
            if ($verifiedCollected <= 0.0 && $paymentsRefundSum > 0.0 && (float)($b['payment_amount_paid'] ?? 0.0) > 0.0) {
                $verifiedCollected = round((float)$b['payment_amount_paid'], 2);
            }
        } else {
            // Fallback only for settled transactions verified by payment_status (NEVER treat unverified advance_amount as paid!)
            $recordedPaid = max(0.0, round((float)($b['payment_amount_paid'] ?? 0.0), 2));
            if (in_array($pStat, ['paid', 'verified'], true)) {
                $verifiedCollected = $recordedPaid > 0.0 ? $recordedPaid : $netRentalBeforeRefund;
            } elseif ($pStat === 'advance_paid' && $recordedPaid > 0.0) {
                $verifiedCollected = $recordedPaid;
            }
        }

        // Strip legacy embedded deposit if collections matched gross+deposit
        if ($depositEmbeddedLegacy && $deposit > 0.0 && $verifiedCollected >= ($netRentalBeforeRefund + $deposit - 1.0)) {
            $verifiedCollected = round(max(0.0, $verifiedCollected - $deposit), 2);
        }

        $isPaidStatus = in_array($pStat, ['paid', 'advance_paid', 'verified'], true)
            || in_array($bStat, ['confirmed', 'active', 'completed', 'in_trip', 'started', 'ongoing', 'paid'], true)
            || $verifiedCollected > 0.0;

        $paymentRef = trim((string)($b['payment_ref'] ?? ''));
        $hasPendingVerification = !$isCancelled && !$isRefundedStatus && (
            $pStat === 'pending_verification'
            || $bStat === 'pending_verification'
            || $paymentsPendingCount > 0
            || ($paymentRef !== '' && !in_array($pStat, ['paid', 'advance_paid', 'verified', 'refunded', 'rejected', 'cancelled'], true))
        );

        $grossCustomerPayable = round($netRentalBeforeRefund + $deposit, 2);

        if ($isCancelled || $isRefundedStatus) {
            if ($isCancelled && $refundAmount <= 0.0 && $isRefundedStatus && $verifiedCollected > 0.0) {
                $refundAmount = $verifiedCollected;
            }
            $netRentalRevenue = 0.0;
            $netCollections = max(0.0, round($verifiedCollected - $refundAmount, 2));
            $outstandingAmount = 0.0;
            $isRevenueEligible = false;
        } else {
            $isRevenueEligible = $isPaidStatus;
            $netRentalRevenue = $isRevenueEligible ? max(0.0, round($netRentalBeforeRefund - $refundAmount, 2)) : 0.0;
            $netCollections = max(0.0, round($verifiedCollected - $refundAmount, 2));
            $outstandingAmount = max(0.0, round(max(0.0, $netRentalBeforeRefund - $refundAmount) - $netCollections, 2));
        }

        return [
            'base_rental' => $baseRental,
            'driver_charges' => $driverCharges,
            'extra_charges' => $extraCharges,
            'coupon_discount' => $couponDiscount,
            'security_deposit' => $deposit,
            'gross_customer_payable' => $grossCustomerPayable,
            'net_rental_before_refund' => $netRentalBeforeRefund,
            'refund_amount' => $refundAmount,
            'net_rental_revenue' => $netRentalRevenue,
            'verified_collected' => $verifiedCollected,
            'net_collections' => $netCollections,
            'pending_payment_amount' => $isCancelled ? 0.0 : $paymentsPendingSum,
            'outstanding_amount' => $outstandingAmount,
            'is_cancelled' => $isCancelled || $isRefundedStatus,
            'is_paid' => !$isCancelled && !$isRefundedStatus && ($verifiedCollected > 0.0 || in_array($pStat, ['paid', 'advance_paid', 'verified'], true)),
            'is_revenue_eligible' => $isRevenueEligible,
            'has_pending_verification' => $hasPendingVerification,
            'deposit_embedded_legacy' => $depositEmbeddedLegacy,
            'duplicates_skipped' => $duplicatePaymentsSkipped,
        ];
    }

    /**
     * Extracts pure net fleet rental revenue strictly excluding refundable security deposits.
     * Kept for backward-compatible callers; delegates to computeBookingFinancials().
     */
    public static function getBookingNetRental(array $b): float
    {
        $fin = self::computeBookingFinancials($b);
        return (float)$fin['net_rental_before_refund'];
    }

    /**
     * Allocates net rental (after refund) across exact calendar dates and months.
     * Guaranteed invariants:
     * 1. Each billed day belongs to exactly one calendar date and one month.
     * 2. Sum of daily amounts strictly equals monthly amounts.
     * 3. Sum of monthly amounts strictly equals net rental after refund.
     *
     * @return array<string, array>
     */
    public static function calculateMonthlyRevenueSplit(array $b, ?array $financials = null): array
    {
        $fin = $financials ?? self::computeBookingFinancials($b);
        if (!empty($fin['is_cancelled'])) {
            return [];
        }

        $netAfterRefund = max(0.0, round((float)$fin['net_rental_before_refund'] - (float)$fin['refund_amount'], 2));
        if ($netAfterRefund <= 0.0) {
            return [];
        }

        $dateInfo = self::getBookingDates($b);
        if (empty($dateInfo['start_date'])) {
            return [];
        }

        $startDt = DateTimeImmutable::createFromFormat('Y-m-d', (string)$dateInfo['start_date'], self::tz());
        if (!$startDt) {
            return [];
        }

        $totalDays = max(1, (int)$dateInfo['days']);
        $dailyRate = $netAfterRefund / $totalDays;

        $monthDays = [];
        $monthDailyBreakdown = [];
        $sumAllocated = 0.0;

        for ($i = 0; $i < $totalDays; $i++) {
            $dayDt = $startDt->modify("+$i days");
            $dayYmd = $dayDt->format('Y-m-d');
            $mKey = $dayDt->format('Y-m-01');

            if ($i === $totalDays - 1) {
                $dayPrice = round(max(0.0, $netAfterRefund - $sumAllocated), 2);
            } else {
                $dayPrice = round($dailyRate, 2);
            }
            $sumAllocated = round($sumAllocated + $dayPrice, 2);

            $monthDays[$mKey] = ($monthDays[$mKey] ?? 0) + 1;
            if (!isset($monthDailyBreakdown[$mKey])) {
                $monthDailyBreakdown[$mKey] = [];
            }
            $monthDailyBreakdown[$mKey][$dayYmd] = $dayPrice;
        }

        $split = [];
        foreach ($monthDays as $mKey => $mCount) {
            $split[$mKey] = [
                'month' => $mKey,
                'days' => $mCount,
                'amount' => round(array_sum($monthDailyBreakdown[$mKey]), 2),
                'daily_rate' => round($dailyRate, 2),
                'daily_breakdown' => $monthDailyBreakdown[$mKey],
            ];
        }

        return $split;
    }

    /**
     * Resolves hub attribution for a booking without guessing or defaulting missing IDs to Hub 1.
     * Reporting attribution rule: pickup_hub_id > vehicle registered hub_id > 0 (Unassigned).
     */
    public static function resolveHubAttribution(array $b, array $registeredHubs): array
    {
        $rawPickup = (int)($b['pickup_hub_id'] ?? 0);
        $rawDrop = (int)($b['drop_hub_id'] ?? 0);
        $rawVehHub = (int)($b['v_hub_id'] ?? 0);

        $pickupHubId = ($rawPickup > 0 && isset($registeredHubs[$rawPickup])) ? $rawPickup : 0;
        $dropHubId = ($rawDrop > 0 && isset($registeredHubs[$rawDrop])) ? $rawDrop : 0;
        $vehicleHubId = ($rawVehHub > 0 && isset($registeredHubs[$rawVehHub])) ? $rawVehHub : 0;

        // Primary reporting attribution: Pickup Hub, else Vehicle Registered Hub, else 0 (Unassigned)
        $reportingHubId = $pickupHubId > 0 ? $pickupHubId : ($vehicleHubId > 0 ? $vehicleHubId : 0);
        $effectiveDropHubId = $dropHubId > 0 ? $dropHubId : $pickupHubId;

        $isCrossHubReturn = ($pickupHubId > 0 && $effectiveDropHubId > 0 && $pickupHubId !== $effectiveDropHubId);
        $legacyLocationText = trim((string)($b['location'] ?? $b['pickup_location'] ?? ''));

        return [
            'pickup_hub_id' => $pickupHubId,
            'drop_hub_id' => $effectiveDropHubId,
            'vehicle_hub_id' => $vehicleHubId,
            'reporting_hub_id' => $reportingHubId,
            'reporting_hub_name' => $reportingHubId > 0 ? $registeredHubs[$reportingHubId]['name'] : 'Unassigned / Legacy Hub',
            'pickup_hub_name' => $pickupHubId > 0 ? $registeredHubs[$pickupHubId]['name'] : 'Unassigned',
            'drop_hub_name' => $effectiveDropHubId > 0 ? $registeredHubs[$effectiveDropHubId]['name'] : 'Unassigned',
            'is_cross_hub_return' => $isCrossHubReturn,
            'is_unassigned' => ($reportingHubId === 0),
            'legacy_location_text' => $legacyLocationText,
        ];
    }

    /**
     * Normalizes a vehicle registration plate by uppercasing, removing punctuation, and resolving legacy aliases.
     */
    public static function normalizeRegKey(?string $reg): string
    {
        $raw = strtoupper(trim((string)$reg));
        if ($raw === '' || $raw === 'TBD' || $raw === 'NA' || $raw === 'N/A') {
            return '';
        }
        $clean = preg_replace('/[^A-Z0-9]/', '', $raw) ?? '';
        $aliases = [
            'MH03EF1025' => 'MH03EL1025',
            'MH48CJ4153' => 'MH48GJ4153',
            'MH43CY1632' => 'MH43CU1632',
        ];
        return $aliases[$clean] ?? $clean;
    }

    /**
     * Normalizes common OCR / typo character confusions on license plates (C/G, U/Y, F/L).
     */
    public static function foldRegConfusion(?string $normReg): string
    {
        $clean = (string)$normReg;
        if ($clean === '') {
            return '';
        }
        return str_replace(['F', 'L'], 'F', str_replace(['U', 'Y'], 'U', str_replace(['C', 'G'], 'C', $clean)));
    }

    /**
     * Unified rule determining whether a booking is physically / actively On Road right now.
     * Returned, cancelled, future un-started, and expired un-handed-over bookings stay In Yard (Non-Active).
     */
    public static function isBookingOnRoadNow(array $b, array $dates, array $fin, ?int $nowTs = null): array
    {
        $nowTs = $nowTs ?? time();
        $bStat = strtolower(trim((string)($b['status'] ?: ($b['booking_status'] ?: 'pending_payment'))));
        $pUpStat = strtolower(trim((string)($b['pickup_status'] ?? '')));

        $insp = [];
        if (!empty($b['return_inspection'])) {
            $insp = is_string($b['return_inspection']) ? json_decode($b['return_inspection'], true) : $b['return_inspection'];
            if (!is_array($insp)) {
                $insp = [];
            }
        }

        $hasReturned = !empty($b['return_odometer'])
            || !empty($b['end_odometer'])
            || !empty($b['completed_at'])
            || !empty($b['returned_at'])
            || in_array($bStat, ['completed', 'returned'], true)
            || !empty($insp['returnOdometer'])
            || !empty($insp['endOdometer'])
            || !empty($insp['returnAt'])
            || !empty($insp['returnedAt'])
            || (isset($insp['returnStatus']) && strtolower((string)$insp['returnStatus']) === 'returned');

        $hasPhysicalPickup = !empty($b['pickup_at'])
            || !empty($b['start_odometer'])
            || $pUpStat === 'picked_up'
            || in_array($bStat, ['in_trip', 'ongoing'], true)
            || !empty($insp['pickupOdometer'])
            || !empty($insp['pickupAt'])
            || (!empty($insp['pickupStatus']) && strtolower((string)$insp['pickupStatus']) === 'picked_up');

        $startTs = (int)($dates['start_time'] ?? 0);
        $dropTs = (int)($dates['drop_time'] ?? 0);
        $endWindowTs = $dropTs > 0 ? ($dropTs + 2 * 3600) : 0;

        $isActiveTrip = false;
        if (empty($fin['is_cancelled']) && !$hasReturned) {
            if (in_array($bStat, ['in_trip', 'ongoing'], true)) {
                $isActiveTrip = true;
            } elseif ($hasPhysicalPickup) {
                if (in_array($bStat, ['active', 'started'], true)) {
                    $isActiveTrip = true;
                } elseif ($endWindowTs <= 0 || $nowTs <= ($endWindowTs + 7 * 86400)) {
                    $isActiveTrip = true;
                }
            } elseif (in_array($bStat, ['active', 'started'], true)) {
                $isFutureWithoutHandover = ($startTs > 0 && $nowTs < $startTs);
                $isExpiredWithoutHandover = ($endWindowTs > 0 && $nowTs > ($endWindowTs + 86400));
                if (!$isFutureWithoutHandover && !$isExpiredWithoutHandover && $startTs > 0) {
                    $isActiveTrip = true;
                }
            }
        }

        $isScheduled = empty($fin['is_cancelled'])
            && !$hasReturned
            && !$isActiveTrip
            && (!empty($fin['is_paid']) || in_array($bStat, ['confirmed', 'approved', 'paid', 'advance_paid', 'active', 'started'], true));

        $isCompleted = empty($fin['is_cancelled']) && ($bStat === 'completed' || $hasReturned);

        return [
            'has_returned' => $hasReturned,
            'has_physical_pickup' => $hasPhysicalPickup,
            'is_active_trip' => $isActiveTrip,
            'is_scheduled' => $isScheduled,
            'is_completed' => $isCompleted,
        ];
    }

    /**
     * Classifies a vehicle strictly across lifecycle concepts and operational roster membership:
     * total_registered, catalog_only, active_fleet, available_recorded, on_trip, in_yard, maintenance, inactive, removed (+ scheduled).
     */
    public static function classifyVehicleState(
        array $v,
        array $onTripByVehicleId,
        array $onTripByReg,
        array $scheduledByVehicleId,
        array $scheduledByReg,
        ?bool $inRoster = null
    ): array {
        $vId = (int)($v['id'] ?? 0);
        $rawReg = strtoupper(trim((string)($v['reg_no'] ?? '')));
        $normReg = self::normalizeRegKey($rawReg);
        $foldReg = self::foldRegConfusion($normReg);
        $carId = strtoupper(trim((string)($v['car_id'] ?? '')));
        $vStat = strtolower(trim((string)($v['status'] ?? 'available')));
        $isAvailCol = (int)($v['available'] ?? 1) === 1;
        $isActiveFlag = $inRoster !== null
            ? $inRoster
            : (!isset($v['is_active_fleet']) || (int)$v['is_active_fleet'] === 1);

        $isOnTrip = ($vId > 0 && isset($onTripByVehicleId[$vId]))
            || ($rawReg !== '' && isset($onTripByReg[$rawReg]))
            || ($normReg !== '' && isset($onTripByReg[$normReg]))
            || ($foldReg !== '' && isset($onTripByReg[$foldReg]))
            || ($carId !== '' && isset($onTripByReg[$carId]));
        $isScheduled = ($vId > 0 && isset($scheduledByVehicleId[$vId]))
            || ($rawReg !== '' && isset($scheduledByReg[$rawReg]))
            || ($normReg !== '' && isset($scheduledByReg[$normReg]))
            || ($foldReg !== '' && isset($scheduledByReg[$foldReg]))
            || ($carId !== '' && isset($scheduledByReg[$carId]));

        $isRemoved = ($vStat === 'removed');
        $isExplicitInactive = !$isRemoved && in_array($vStat, ['inactive', 'disabled', 'retired'], true);
        $isMaintenance = !$isRemoved && !$isExplicitInactive && in_array($vStat, ['maintenance', 'service', 'repair'], true);
        $isCatalogOnly = !$isRemoved && !$isExplicitInactive && !$isActiveFlag;
        $isInactive = $isExplicitInactive;
        $isActiveFleet = !$isRemoved && !$isExplicitInactive && $isActiveFlag;
        $isAvailableRecorded = $isActiveFleet && !$isMaintenance && $isAvailCol && $vStat === 'available';

        $operationalState = 'in_yard';
        if ($isRemoved) {
            $operationalState = 'removed';
        } elseif ($isInactive) {
            $operationalState = 'inactive';
        } elseif ($isCatalogOnly) {
            $operationalState = 'catalog_only';
        } elseif ($isOnTrip) {
            $operationalState = 'on_trip';
        } elseif ($isMaintenance) {
            $operationalState = 'maintenance';
        }

        return [
            'is_registered' => true,
            'is_removed' => $isRemoved,
            'is_inactive' => $isInactive,
            'is_catalog_only' => $isCatalogOnly,
            'is_in_roster' => $isActiveFleet,
            'is_active_fleet' => $isActiveFleet,
            'is_available_recorded' => $isAvailableRecorded,
            'is_on_trip' => ($isActiveFleet || $isCatalogOnly) && $isOnTrip,
            'is_maintenance' => $isActiveFleet && !$isOnTrip && $isMaintenance,
            'is_in_yard' => $isActiveFleet && !$isOnTrip && !$isMaintenance,
            'is_unavailable_other' => false,
            'has_scheduled_booking' => $isActiveFleet && $isScheduled,
            'operational_state' => $operationalState,
        ];
    }

    /**
     * Fetches and deduplicates `payments` rows grouped by booking identifier.
     */
    public static function loadDeduplicatedPayments(): array
    {
        $rows = [];
        try {
            $rows = Database::fetchAll("SELECT * FROM `payments` ORDER BY `id` ASC") ?: [];
        } catch (Throwable $_) {
            return ['by_booking' => [], 'rows' => [], 'duplicates_removed' => 0];
        }

        $seenGlobalKeys = [];
        $seenPerBookingUtr = [];
        $byBooking = [];
        $dedupRows = [];
        $duplicatesRemoved = 0;

        foreach ($rows as $p) {
            $pid = trim((string)($p['payment_id'] ?? ''));
            $bid = strtoupper(ltrim(trim((string)($p['booking_id'] ?? '')), '#'));
            $utr = strtoupper(trim((string)($p['utr'] ?? $p['payment_ref'] ?? '')));
            $rpId = trim((string)($p['razorpay_payment_id'] ?? ''));
            $amt = round((float)($p['amount'] ?? 0.0), 2);
            $stat = strtolower(trim((string)($p['status'] ?? 'pending')));

            $globalKey = $pid !== '' ? 'PID:' . strtoupper($pid) : ($rpId !== '' ? 'RP:' . strtoupper($rpId) : 'ID:' . (int)($p['id'] ?? 0));
            if (isset($seenGlobalKeys[$globalKey])) {
                $duplicatesRemoved++;
                continue;
            }
            $seenGlobalKeys[$globalKey] = true;

            if ($bid !== '' && $utr !== '' && $stat !== 'rejected') {
                $utrKey = $bid . '|' . $utr . '|' . number_format($amt, 2, '.', '');
                if (isset($seenPerBookingUtr[$utrKey])) {
                    $duplicatesRemoved++;
                    continue;
                }
                $seenPerBookingUtr[$utrKey] = true;
            }

            $dedupRows[] = $p;

            if ($bid === '') {
                continue;
            }
            if (!isset($byBooking[$bid])) {
                $byBooking[$bid] = [
                    'has_rows' => true,
                    'verified_paid' => 0.0,
                    'pending_amount' => 0.0,
                    'pending_count' => 0,
                    'refund_amount' => 0.0,
                    'duplicates_skipped' => 0,
                ];
            }

            $rowRefund = max(0.0, round((float)($p['refund_amount'] ?? 0.0), 2));
            if ($stat === 'verified') {
                $byBooking[$bid]['verified_paid'] = round($byBooking[$bid]['verified_paid'] + $amt, 2);
                $byBooking[$bid]['refund_amount'] = round($byBooking[$bid]['refund_amount'] + $rowRefund, 2);
            } elseif ($stat === 'pending') {
                $byBooking[$bid]['pending_amount'] = round($byBooking[$bid]['pending_amount'] + $amt, 2);
                $byBooking[$bid]['pending_count']++;
            } elseif ($stat === 'refunded') {
                $actualRef = $rowRefund > 0.0 ? $rowRefund : $amt;
                if (!empty($p['verified_by']) || !empty($p['verified_at'])) {
                    $byBooking[$bid]['verified_paid'] = round($byBooking[$bid]['verified_paid'] + $amt, 2);
                }
                $byBooking[$bid]['refund_amount'] = round($byBooking[$bid]['refund_amount'] + $actualRef, 2);
            }
        }

        return [
            'by_booking' => $byBooking,
            'rows' => $dedupRows,
            'duplicates_removed' => $duplicatesRemoved,
        ];
    }

    /**
     * Loads registered hubs strictly from `hubs` table (zero hardcoded fallback hubs).
     */
    public static function getRegisteredHubsMap(): array
    {
        $rows = [];
        try {
            $rows = Database::fetchAll("SELECT * FROM `hubs` ORDER BY `id` ASC") ?: [];
        } catch (Throwable $_) {
            return [];
        }
        $map = [];
        foreach ($rows as $r) {
            $hId = (int)($r['id'] ?? 0);
            if ($hId > 0) {
                $map[$hId] = $r;
            }
        }
        return $map;
    }

    /**
     * Loads the operational Fleet Roster configuration from `settings` (`manager_active_fleets`).
     * Ensures website catalog cars not added to the operational roster do not inflate yard/trip counts.
     */
    public static function getActiveRosterConfig(): array
    {
        $identifiers = [];
        $hasSetting = false;
        try {
            $setting = Database::fetchOne("SELECT `value` FROM `settings` WHERE `key` = 'manager_active_fleets' ORDER BY `updated_at` DESC LIMIT 1");
            if (!$setting) {
                $setting = Database::fetchOne("SELECT `value` FROM `settings` WHERE `key` = 'manager_active_fleets' LIMIT 1");
            }
            if ($setting && !empty($setting['value'])) {
                $decoded = json_decode((string)$setting['value'], true);
                if (is_array($decoded)) {
                    $hasSetting = true;
                    foreach ($decoded as $rawId) {
                        $raw = strtoupper(trim((string)$rawId));
                        if ($raw === '' || str_starts_with($raw, 'ZIP')) {
                            continue;
                        }
                        $identifiers[$raw] = true;
                        $norm = self::normalizeRegKey($raw);
                        if ($norm !== '') {
                            $identifiers[$norm] = true;
                        }
                    }
                }
            }
        } catch (Throwable $_) {}
        return ['has_setting' => $hasSetting, 'identifiers' => $identifiers];
    }

    /**
     * Returns true when a DB vehicle belongs to the operational active Fleet Roster.
     */
    public static function isVehicleInRoster(array $v, array $rosterConfig): bool
    {
        if (empty($rosterConfig['has_setting'])) {
            return !isset($v['is_active_fleet']) || (int)$v['is_active_fleet'] === 1;
        }
        $ids = $rosterConfig['identifiers'] ?? [];
        if (empty($ids)) {
            return false;
        }
        $vId = (int)($v['id'] ?? 0);
        $rawReg = strtoupper(trim((string)($v['reg_no'] ?? '')));
        $normReg = self::normalizeRegKey($rawReg);
        $carId = strtoupper(trim((string)($v['car_id'] ?? '')));

        if ($rawReg !== '' && isset($ids[$rawReg])) {
            return true;
        }
        if ($normReg !== '' && isset($ids[$normReg])) {
            return true;
        }
        if ($carId !== '' && isset($ids[$carId])) {
            return true;
        }
        if ($vId > 0) {
            if (isset($ids[(string)$vId]) || isset($ids['CAT-' . $vId]) || isset($ids['CAT-' . str_pad((string)$vId, 3, '0', STR_PAD_LEFT)])) {
                return true;
            }
        }
        return false;
    }

    /**
     * Single Authoritative Reporting Engine for Admin, Manager, Executive, Accounts, Hubs Summary, and Exports.
     *
     * Filters supported:
     * - from: 'YYYY-MM-DD' inclusive start
     * - to: 'YYYY-MM-DD' inclusive end
     * - hub_id: null|'all'|int (0 = unassigned-only if filter_unassigned=true, >0 = specific hub)
     * - unassigned_only: bool
     * - status: string|null
     * - search: string|null
     */
    public static function computeFilteredReport(array $filters = [], bool $persistSync = false): array
    {
        self::ensureTables();

        $tz = self::tz();
        $nowDt = new DateTimeImmutable('now', $tz);
        $nowTs = $nowDt->getTimestamp();
        $todayStr = $nowDt->format('Y-m-d');
        $curWeekKey = $nowDt->format('o-\WW');
        $weekStartDt = $nowDt->modify('monday this week');
        $weekEndDt = $nowDt->modify('sunday this week');
        $weekStartStr = $weekStartDt->format('Y-m-d');
        $weekEndStr = $weekEndDt->format('Y-m-d');
        $currentMonthKey = $nowDt->format('Y-m-01');
        $previousMonthKey = $nowDt->modify('first day of previous month')->format('Y-m-01');

        $fromTs = !empty($filters['from']) ? self::parseValidTimestamp($filters['from']) : null;
        $toTs = !empty($filters['to']) ? self::parseValidTimestamp($filters['to']) : null;
        $fromYmd = $fromTs !== null ? (new DateTimeImmutable('@' . $fromTs))->setTimezone($tz)->format('Y-m-d') : null;
        $toYmd = $toTs !== null ? (new DateTimeImmutable('@' . $toTs))->setTimezone($tz)->format('Y-m-d') : null;
        if ($fromYmd !== null && $toYmd !== null && $fromYmd > $toYmd) {
            [$fromYmd, $toYmd] = [$toYmd, $fromYmd];
        }

        $filterHubRaw = $filters['hub_id'] ?? null;
        $filterUnassignedOnly = !empty($filters['unassigned_only']) || ($filterHubRaw === 'unassigned');
        $filterHubId = (!$filterUnassignedOnly && $filterHubRaw !== null && $filterHubRaw !== '' && $filterHubRaw !== 'all' && (int)$filterHubRaw > 0)
            ? (int)$filterHubRaw
            : null;
        $filterStatus = isset($filters['status']) ? strtolower(trim((string)$filters['status'])) : '';
        $filterSearch = isset($filters['search']) ? strtolower(trim((string)$filters['search'])) : '';
        $hasBookingScopeFilter = ($fromYmd !== null || $toYmd !== null || $filterUnassignedOnly || $filterStatus !== '' || $filterSearch !== '');
        $hasAnyFilter = ($hasBookingScopeFilter || $filterHubId !== null);

        // 1. Registered Hubs strictly from DB
        $registeredHubs = self::getRegisteredHubsMap();

        // 2. Operational User & KYC Counts (distinct firebase_uid, never hardcoded)
        $totalUsers = (int)(Database::fetchOne("SELECT COUNT(DISTINCT firebase_uid) AS c FROM `users`")['c'] ?? 0);
        $pendingDocs = (int)(Database::fetchOne(
            "SELECT COUNT(DISTINCT firebase_uid) AS c FROM `verification`
             WHERE overall_status = 'pending' OR license_status = 'pending' OR aadhar_status = 'pending' OR pan_status = 'pending'"
        )['c'] ?? 0);
        if ($pendingDocs === 0) {
            $pendingDocs = (int)(Database::fetchOne(
                "SELECT COUNT(DISTINCT firebase_uid) AS c FROM `users`
                 WHERE (license_status = 'pending' OR aadhar_status = 'pending' OR pan_status = 'pending')
                   AND (license_front_url IS NOT NULL OR aadhar_front_url IS NOT NULL)"
            )['c'] ?? 0);
        }

        // 3. Deduplicated Payments
        $paymentData = self::loadDeduplicatedPayments();
        $paymentsByBooking = $paymentData['by_booking'];

        // 4. All Vehicles (including inactive & removed so 8 states are complete)
        $allVehiclesRaw = Database::fetchAll("SELECT * FROM `vehicles` ORDER BY `id` ASC") ?: [];
        $vehicleMapByReg = [];
        $vehicleMapById = [];
        foreach ($allVehiclesRaw as $vr) {
            $reg = strtoupper(trim((string)($vr['reg_no'] ?? '')));
            $vId = (int)($vr['id'] ?? 0);
            if ($vId > 0) {
                $vehicleMapById[$vId] = $vr;
            }
            if ($reg !== '') {
                $vehicleMapByReg[$reg] = $vr;
            }
        }

        // 5. Initialize Hub Counters (Hub 0 = All System Totals, Hub IDs > 0 = DB hubs, plus Unassigned bucket)
        $blankHubBucket = static function (int $hId, string $hName): array {
            return [
                'hub_id' => $hId,
                'hub_name' => $hName,
                'total_revenue' => 0.0,
                'recognized_rental_revenue' => 0.0,
                'verified_collections' => 0.0,
                'refund_amount' => 0.0,
                'outstanding_amount' => 0.0,
                'security_deposits' => 0.0,
                'month_revenue' => 0.0,
                'day_sales' => 0.0,
                'week_sales' => 0.0,
                'total_bookings' => 0,
                'cancelled_bookings' => 0,
                'paid_bookings' => 0,
                'active_trips' => 0,
                'scheduled_bookings' => 0,
                'completed_trips' => 0,
                'cross_hub_outbound' => 0,
                'cross_hub_inbound' => 0,
                'total_registered_fleet' => 0,
                'total_fleet' => 0,
                'available_recorded_fleet' => 0,
                'on_road_fleet' => 0,
                'available_fleet' => 0,
                'maintenance_fleet' => 0,
                'inactive_fleet' => 0,
                'removed_fleet' => 0,
                'occupancy_pct' => 0.0,
                'total_users' => 0,
                'pending_docs' => 0,
                'pending_payments' => 0,
                'revenue_per_vehicle' => 0.0,
            ];
        };

        $hubStats = [0 => $blankHubBucket(0, 'All Operating Hubs')];
        foreach ($registeredHubs as $hId => $hr) {
            $hubStats[$hId] = $blankHubBucket($hId, (string)($hr['name'] ?? ("Hub #$hId")));
        }
        $unassignedBucket = $blankHubBucket(0, 'Unassigned / Legacy Hub');

        // 6. Fetch & Deduplicate All Bookings Joined with Vehicle Metadata
        $bookingsRaw = Database::fetchAll(
            "SELECT b.*,
                    v.hub_id AS v_hub_id, v.acquisition_type AS v_acq_type, v.owner_name AS v_owner_name,
                    v.reg_no AS v_reg_no
             FROM `bookings` b
             LEFT JOIN `vehicles` v ON (
                 (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND v.id = b.vehicle_id)
                 OR (b.vehicle_reg IS NOT NULL AND TRIM(b.vehicle_reg) <> '' AND b.vehicle_reg <> 'TBD' AND UPPER(v.reg_no) = UPPER(TRIM(b.vehicle_reg)))
             )
             ORDER BY b.created_at ASC, b.id ASC"
        ) ?: [];

        $seenBookingKeys = [];
        $enrichedBookings = [];
        $onTripByVehicleId = [];
        $onTripByReg = [];
        $scheduledByVehicleId = [];
        $scheduledByReg = [];
        $onRoadVehiclesAll = [];
        $onRoadVehiclesByHub = [];
        $onRoadVehiclesUnassigned = [];
        $filteredOnRoadVehicles = [];

        $dailyRows = [];
        $monthlyRowsMap = [];
        $fleetRevenue = [];
        $diagnostics = [
            'invalid_date_bookings' => [],
            'unassigned_hub_bookings' => [],
            'unassigned_hub_vehicles' => [],
            'duplicate_bookings_skipped' => 0,
            'duplicate_payments_skipped' => $paymentData['duplicates_removed'],
        ];

        $emptyDailySlot = static function (string $date): array {
            return [
                'date' => $date,
                'month' => substr($date, 0, 7),
                'pickups' => 0,
                'returns' => 0,
                'active_trips' => 0,
                'completed_trips' => 0,
                'cancelled_bookings' => 0,
                'revenue' => 0.0,
                'collections' => 0.0,
                'refunds' => 0.0,
                'cross_hub_returns' => 0,
            ];
        };

        $filteredTotals = [
            'total_bookings' => 0,
            'cancelled_bookings' => 0,
            'paid_bookings' => 0,
            'active_trips' => 0,
            'scheduled_bookings' => 0,
            'completed_trips' => 0,
            'pending_payments' => 0,
            'base_rental' => 0.0,
            'driver_charges' => 0.0,
            'extra_charges' => 0.0,
            'coupon_discount' => 0.0,
            'security_deposit' => 0.0,
            'gross_customer_payable' => 0.0,
            'recognized_rental_revenue' => 0.0,
            'allocated_revenue_in_range' => 0.0,
            'verified_collections' => 0.0,
            'net_collections' => 0.0,
            'refund_amount' => 0.0,
            'outstanding_amount' => 0.0,
        ];

        $unfilteredAllBookingRevenue = 0.0;
        $unfilteredVerifiedCollections = 0.0;
        $unfilteredNetCollections = 0.0;
        $unfilteredRefunds = 0.0;
        $unfilteredOutstanding = 0.0;
        $unfilteredDeposits = 0.0;
        $earliestLiveMonth = null;

        foreach ($bookingsRaw as $b) {
            $primaryRef = trim((string)($b['booking_id'] ?: ($b['booking_number'] ?: ($b['id'] ?? ''))));
            $normKey = strtoupper(ltrim($primaryRef, '#'));
            if ($normKey === '' || isset($seenBookingKeys[$normKey])) {
                $diagnostics['duplicate_bookings_skipped']++;
                continue;
            }
            $seenBookingKeys[$normKey] = true;

            $bNumKey = strtoupper(ltrim(trim((string)($b['booking_number'] ?? '')), '#'));
            $pAgg = $paymentsByBooking[$normKey] ?? ($bNumKey !== '' ? ($paymentsByBooking[$bNumKey] ?? []) : []);

            $dates = self::getBookingDates($b);
            $fin = self::computeBookingFinancials($b, $pAgg);
            $hubAttr = self::resolveHubAttribution($b, $registeredHubs);
            $rHubId = (int)$hubAttr['reporting_hub_id'];

            if (empty($dates['valid'])) {
                $diagnostics['invalid_date_bookings'][] = [
                    'booking_id' => $primaryRef,
                    'pickup_date' => $b['pickup_date'] ?? null,
                    'drop_date' => $b['drop_date'] ?? null,
                    'warning' => $dates['date_warning'],
                ];
            }
            if ($hubAttr['is_unassigned']) {
                $diagnostics['unassigned_hub_bookings'][] = [
                    'booking_id' => $primaryRef,
                    'pickup_hub_id' => $b['pickup_hub_id'] ?? null,
                    'drop_hub_id' => $b['drop_hub_id'] ?? null,
                    'vehicle_reg' => $b['vehicle_reg'] ?? null,
                    'legacy_location' => $hubAttr['legacy_location_text'],
                ];
            }

            $tripState = self::isBookingOnRoadNow($b, $dates, $fin, $nowTs);
            $hasReturned = $tripState['has_returned'];
            $hasPhysicalPickup = $tripState['has_physical_pickup'];
            $isActiveTrip = $tripState['is_active_trip'];
            $isScheduled = $tripState['is_scheduled'];
            $isCompleted = $tripState['is_completed'];

            $bVid = (int)($b['vehicle_id'] ?? 0);
            $bReg = strtoupper(trim((string)($b['vehicle_reg'] ?? ($b['v_reg_no'] ?? ''))));
            $bRegNorm = self::normalizeRegKey($bReg);
            $bRegFold = self::foldRegConfusion($bRegNorm);
            $bCarId = strtoupper(trim((string)($b['car_id'] ?? '')));
            $uniqueVehKey = $bRegFold !== '' ? $bRegFold : ($bRegNorm !== '' ? $bRegNorm : ($bReg !== '' && $bReg !== 'TBD' ? $bReg : ($bVid > 0 ? ('VID-' . $bVid) : ('BOOKING-' . $normKey))));

            // Track global active/scheduled vehicle sets before user filters so fleet inventory state stays truthful
            if ($isActiveTrip) {
                if ($bVid > 0) {
                    $onTripByVehicleId[$bVid] = $normKey;
                }
                if ($bReg !== '' && $bReg !== 'TBD') {
                    $onTripByReg[$bReg] = $normKey;
                }
                if ($bRegNorm !== '') {
                    $onTripByReg[$bRegNorm] = $normKey;
                }
                if ($bRegFold !== '') {
                    $onTripByReg[$bRegFold] = $normKey;
                }
                if ($bCarId !== '') {
                    $onTripByReg[$bCarId] = $normKey;
                }
                $onRoadVehiclesAll[$uniqueVehKey] = true;
                if ($rHubId > 0) {
                    $onRoadVehiclesByHub[$rHubId][$uniqueVehKey] = true;
                } else {
                    $onRoadVehiclesUnassigned[$uniqueVehKey] = true;
                }
            } elseif ($isScheduled) {
                if ($bVid > 0) {
                    $scheduledByVehicleId[$bVid] = $normKey;
                }
                if ($bReg !== '' && $bReg !== 'TBD') {
                    $scheduledByReg[$bReg] = $normKey;
                }
                if ($bRegNorm !== '') {
                    $scheduledByReg[$bRegNorm] = $normKey;
                }
                if ($bRegFold !== '') {
                    $scheduledByReg[$bRegFold] = $normKey;
                }
                if ($bCarId !== '') {
                    $scheduledByReg[$bCarId] = $normKey;
                }
            }

            // Compute revenue split across dates & months
            $split = ($fin['is_revenue_eligible'] && $fin['net_rental_revenue'] > 0.0)
                ? self::calculateMonthlyRevenueSplit($b, $fin)
                : [];

            // Persist split back into `bookings.monthly_revenue_split` if empty or changed after direct DB booking edit
            if ($persistSync && !empty($split) && !empty($b['id'])) {
                $encodedSplit = json_encode($split);
                $rawExistingSplit = $b['monthly_revenue_split'] ?? null;
                $needsSplitSync = empty($rawExistingSplit);
                if (!$needsSplitSync && is_string($rawExistingSplit)) {
                    $decodedExisting = json_decode($rawExistingSplit, true);
                    $needsSplitSync = ($decodedExisting !== $split);
                } elseif (!$needsSplitSync && is_array($rawExistingSplit)) {
                    $needsSplitSync = ($rawExistingSplit !== $split);
                }
                if ($needsSplitSync && $encodedSplit !== false) {
                    try {
                        Database::execute(
                            "UPDATE `bookings` SET `monthly_revenue_split` = ? WHERE `id` = ?",
                            [$encodedSplit, (int)$b['id']]
                        );
                    } catch (Throwable $_) {}
                }
            }

            // Unfiltered System & Hub Accumulators (for `kpi_metrics` / `kpi_hub_metrics` sync & dashboard parity)
            if ($fin['is_cancelled']) {
                $hubStats[0]['cancelled_bookings']++;
                if ($rHubId > 0) {
                    $hubStats[$rHubId]['cancelled_bookings']++;
                } else {
                    $unassignedBucket['cancelled_bookings']++;
                }
                $unfilteredRefunds = round($unfilteredRefunds + $fin['refund_amount'], 2);
                $unfilteredVerifiedCollections = round($unfilteredVerifiedCollections + $fin['verified_collected'], 2);
                $unfilteredNetCollections = round($unfilteredNetCollections + $fin['net_collections'], 2);
            } else {
                $hubStats[0]['total_bookings']++;
                if ($rHubId > 0) {
                    $hubStats[$rHubId]['total_bookings']++;
                } else {
                    $unassignedBucket['total_bookings']++;
                }

                if ($fin['is_paid'] || $isActiveTrip) {
                    $hubStats[0]['paid_bookings']++;
                    if ($rHubId > 0) {
                        $hubStats[$rHubId]['paid_bookings']++;
                    } else {
                        $unassignedBucket['paid_bookings']++;
                    }
                }
                if ($fin['has_pending_verification']) {
                    $hubStats[0]['pending_payments']++;
                    if ($rHubId > 0) {
                        $hubStats[$rHubId]['pending_payments']++;
                    } else {
                        $unassignedBucket['pending_payments']++;
                    }
                }
                if ($isActiveTrip) {
                    $hubStats[0]['active_trips']++;
                    if ($rHubId > 0) {
                        $hubStats[$rHubId]['active_trips']++;
                    } else {
                        $unassignedBucket['active_trips']++;
                    }
                }
                if ($isScheduled) {
                    $hubStats[0]['scheduled_bookings']++;
                    if ($rHubId > 0) {
                        $hubStats[$rHubId]['scheduled_bookings']++;
                    } else {
                        $unassignedBucket['scheduled_bookings']++;
                    }
                }
                if ($isCompleted) {
                    $hubStats[0]['completed_trips']++;
                    if ($rHubId > 0) {
                        $hubStats[$rHubId]['completed_trips']++;
                    } else {
                        $unassignedBucket['completed_trips']++;
                    }
                }
                if ($hubAttr['is_cross_hub_return']) {
                    $pH = (int)$hubAttr['pickup_hub_id'];
                    $dH = (int)$hubAttr['drop_hub_id'];
                    if (isset($hubStats[$pH])) {
                        $hubStats[$pH]['cross_hub_outbound']++;
                    }
                    if (isset($hubStats[$dH])) {
                        $hubStats[$dH]['cross_hub_inbound']++;
                    }
                    $hubStats[0]['cross_hub_outbound']++;
                    $hubStats[0]['cross_hub_inbound']++;
                }

                $unfilteredDeposits = round($unfilteredDeposits + $fin['security_deposit'], 2);
                $unfilteredVerifiedCollections = round($unfilteredVerifiedCollections + $fin['verified_collected'], 2);
                $unfilteredNetCollections = round($unfilteredNetCollections + $fin['net_collections'], 2);
                $unfilteredRefunds = round($unfilteredRefunds + $fin['refund_amount'], 2);
                $unfilteredOutstanding = round($unfilteredOutstanding + $fin['outstanding_amount'], 2);

                $hubStats[0]['security_deposits'] = round($hubStats[0]['security_deposits'] + $fin['security_deposit'], 2);
                $hubStats[0]['verified_collections'] = round($hubStats[0]['verified_collections'] + $fin['verified_collected'], 2);
                $hubStats[0]['refund_amount'] = round($hubStats[0]['refund_amount'] + $fin['refund_amount'], 2);
                $hubStats[0]['outstanding_amount'] = round($hubStats[0]['outstanding_amount'] + $fin['outstanding_amount'], 2);
                if ($rHubId > 0) {
                    $hubStats[$rHubId]['security_deposits'] = round($hubStats[$rHubId]['security_deposits'] + $fin['security_deposit'], 2);
                    $hubStats[$rHubId]['verified_collections'] = round($hubStats[$rHubId]['verified_collections'] + $fin['verified_collected'], 2);
                    $hubStats[$rHubId]['refund_amount'] = round($hubStats[$rHubId]['refund_amount'] + $fin['refund_amount'], 2);
                    $hubStats[$rHubId]['outstanding_amount'] = round($hubStats[$rHubId]['outstanding_amount'] + $fin['outstanding_amount'], 2);
                } else {
                    $unassignedBucket['security_deposits'] = round($unassignedBucket['security_deposits'] + $fin['security_deposit'], 2);
                    $unassignedBucket['verified_collections'] = round($unassignedBucket['verified_collections'] + $fin['verified_collected'], 2);
                    $unassignedBucket['refund_amount'] = round($unassignedBucket['refund_amount'] + $fin['refund_amount'], 2);
                    $unassignedBucket['outstanding_amount'] = round($unassignedBucket['outstanding_amount'] + $fin['outstanding_amount'], 2);
                }

                if ($fin['is_revenue_eligible'] && $fin['net_rental_revenue'] > 0.0) {
                    $rev = $fin['net_rental_revenue'];
                    $unfilteredAllBookingRevenue = round($unfilteredAllBookingRevenue + $rev, 2);

                    $hubStats[0]['total_revenue'] = round($hubStats[0]['total_revenue'] + $rev, 2);
                    $hubStats[0]['recognized_rental_revenue'] = $hubStats[0]['total_revenue'];
                    if ($rHubId > 0) {
                        $hubStats[$rHubId]['total_revenue'] = round($hubStats[$rHubId]['total_revenue'] + $rev, 2);
                        $hubStats[$rHubId]['recognized_rental_revenue'] = $hubStats[$rHubId]['total_revenue'];
                    } else {
                        $unassignedBucket['total_revenue'] = round($unassignedBucket['total_revenue'] + $rev, 2);
                        $unassignedBucket['recognized_rental_revenue'] = $unassignedBucket['total_revenue'];
                    }

                    foreach ($split as $mKey => $sp) {
                        if ($earliestLiveMonth === null || $mKey < $earliestLiveMonth) {
                            $earliestLiveMonth = $mKey;
                        }
                        if ($mKey === $currentMonthKey) {
                            $mAmt = (float)$sp['amount'];
                            $hubStats[0]['month_revenue'] = round($hubStats[0]['month_revenue'] + $mAmt, 2);
                            if ($rHubId > 0) {
                                $hubStats[$rHubId]['month_revenue'] = round($hubStats[$rHubId]['month_revenue'] + $mAmt, 2);
                            } else {
                                $unassignedBucket['month_revenue'] = round($unassignedBucket['month_revenue'] + $mAmt, 2);
                            }
                        }
                        foreach ($sp['daily_breakdown'] as $dYmd => $dPrice) {
                            if ($dYmd === $todayStr) {
                                $hubStats[0]['day_sales'] = round($hubStats[0]['day_sales'] + $dPrice, 2);
                                if ($rHubId > 0) {
                                    $hubStats[$rHubId]['day_sales'] = round($hubStats[$rHubId]['day_sales'] + $dPrice, 2);
                                } else {
                                    $unassignedBucket['day_sales'] = round($unassignedBucket['day_sales'] + $dPrice, 2);
                                }
                            }
                            if ($dYmd >= $weekStartStr && $dYmd <= $weekEndStr) {
                                $hubStats[0]['week_sales'] = round($hubStats[0]['week_sales'] + $dPrice, 2);
                                if ($rHubId > 0) {
                                    $hubStats[$rHubId]['week_sales'] = round($hubStats[$rHubId]['week_sales'] + $dPrice, 2);
                                } else {
                                    $unassignedBucket['week_sales'] = round($unassignedBucket['week_sales'] + $dPrice, 2);
                                }
                            }
                        }
                    }

                    if ($bReg !== '' && $bReg !== 'TBD') {
                        if (!isset($fleetRevenue[$bReg])) {
                            $vInfo = $vehicleMapByReg[$bReg] ?? null;
                            $acqType = (string)($vInfo['acquisition_type'] ?? ($b['v_acq_type'] ?? 'Partner'));
                            $fleetRevenue[$bReg] = [
                                'reg_no' => $bReg,
                                'vehicle_name' => (string)($b['vehicle_name'] ?? ($vInfo ? $vInfo['brand'] . ' ' . $vInfo['model'] : 'Vehicle')),
                                'hub_id' => $rHubId,
                                'acquisition_type' => $acqType,
                                'owner_name' => (string)($vInfo['owner_name'] ?? ($b['v_owner_name'] ?? '')),
                                'trips_count' => 0,
                                'total_rental' => 0.0,
                                'partner_share' => 0.0,
                                'company_share' => 0.0,
                                'monthly_split' => [],
                            ];
                        }
                        $fleetRevenue[$bReg]['trips_count']++;
                        $fleetRevenue[$bReg]['total_rental'] = round($fleetRevenue[$bReg]['total_rental'] + $rev, 2);
                        if (strtolower($fleetRevenue[$bReg]['acquisition_type']) === 'partner') {
                            $fleetRevenue[$bReg]['partner_share'] = round($fleetRevenue[$bReg]['partner_share'] + round($rev * 0.60, 2), 2);
                            $fleetRevenue[$bReg]['company_share'] = round($fleetRevenue[$bReg]['company_share'] + round($rev * 0.40, 2), 2);
                        } else {
                            $fleetRevenue[$bReg]['company_share'] = round($fleetRevenue[$bReg]['company_share'] + $rev, 2);
                        }
                        foreach ($split as $mKey => $sp) {
                            $fleetRevenue[$bReg]['monthly_split'][$mKey] = round(($fleetRevenue[$bReg]['monthly_split'][$mKey] ?? 0.0) + (float)$sp['amount'], 2);
                        }
                    }
                }
            }

            // Apply Caller Filters for Report Output (Bookings, Daily Bifurcation, Monthly, Reconciliation)
            if ($filterUnassignedOnly && !$hubAttr['is_unassigned']) {
                continue;
            }
            if ($filterHubId !== null && $rHubId !== $filterHubId) {
                continue;
            }
            if ($filterStatus !== '' && $filterStatus !== 'all') {
                if ($filterStatus === 'active' && !$isActiveTrip && $bStat !== 'active') {
                    continue;
                } elseif ($filterStatus === 'cancelled' && !$fin['is_cancelled']) {
                    continue;
                } elseif ($filterStatus !== 'active' && $filterStatus !== 'cancelled' && $bStat !== $filterStatus) {
                    continue;
                }
            }
            if ($filterSearch !== '') {
                $hay = strtolower(
                    ($b['booking_id'] ?? '') . ' ' . ($b['booking_number'] ?? '') . ' ' .
                    ($b['user_name'] ?? '') . ' ' . ($b['user_email'] ?? '') . ' ' . ($b['user_phone'] ?? '') . ' ' .
                    ($b['vehicle_name'] ?? '') . ' ' . ($b['vehicle_reg'] ?? '')
                );
                if (strpos($hay, $filterSearch) === false) {
                    continue;
                }
            }

            // Check overlap against date range [$fromYmd, $toYmd]
            $startYmd = $dates['start_date'];
            $dropYmd = $dates['drop_date'];
            $actualReturnYmd = $dates['actual_return_date'] ?? $dropYmd;
            if ($fromYmd !== null || $toYmd !== null) {
                if ($startYmd === null) {
                    continue;
                }
                $lastActiveYmd = $dropYmd ?? $startYmd;
                if (!empty($split)) {
                    $allSplitDates = [];
                    foreach ($split as $sp) {
                        foreach (array_keys($sp['daily_breakdown']) as $dY) {
                            $allSplitDates[] = $dY;
                        }
                    }
                    if (!empty($allSplitDates)) {
                        $lastActiveYmd = max($lastActiveYmd, max($allSplitDates));
                    }
                }
                $rangeMaxEnd = max($lastActiveYmd, (string)$actualReturnYmd);
                if ($fromYmd !== null && $rangeMaxEnd < $fromYmd) {
                    continue;
                }
                if ($toYmd !== null && $startYmd > $toYmd) {
                    continue;
                }
            }

            // Allocate filtered daily revenue & booking operations cleanly
            $allocatedInRange = 0.0;
            $allocatedDaysInRange = 0;

            if (!empty($split)) {
                foreach ($split as $mKey => $sp) {
                    foreach ($sp['daily_breakdown'] as $dYmd => $dPrice) {
                        if (($fromYmd !== null && $dYmd < $fromYmd) || ($toYmd !== null && $dYmd > $toYmd)) {
                            continue;
                        }
                        if (!isset($dailyRows[$dYmd])) {
                            $dailyRows[$dYmd] = $emptyDailySlot($dYmd);
                        }
                        $dailyRows[$dYmd]['revenue'] = round($dailyRows[$dYmd]['revenue'] + $dPrice, 2);
                        $allocatedInRange = round($allocatedInRange + $dPrice, 2);
                        $allocatedDaysInRange++;

                        if (!isset($monthlyRowsMap[$mKey])) {
                            $monthlyRowsMap[$mKey] = [
                                'metric_date' => $mKey,
                                'month_label' => date('M Y', strtotime($mKey)),
                                'month_sales' => 0.0,
                                'billed_days' => 0,
                                'total_bookings' => 0,
                                'paid_bookings' => 0,
                                'completed_trips' => 0,
                                'cancelled_bookings' => 0,
                                'verified_collections' => 0.0,
                                'refund_amount' => 0.0,
                                'outstanding_amount' => 0.0,
                                'is_historical_archive' => false,
                            ];
                        }
                        $monthlyRowsMap[$mKey]['month_sales'] = round($monthlyRowsMap[$mKey]['month_sales'] + $dPrice, 2);
                        $monthlyRowsMap[$mKey]['billed_days']++;
                    }
                }
            }

            // Daily operational counters (pickup date, active calendar span, return date including $dropYmd outside revenue loop!)
            if ($startYmd !== null) {
                $pMonthKey = substr($startYmd, 0, 7) . '-01';
                $inFromPickup = ($fromYmd === null || $startYmd >= $fromYmd) && ($toYmd === null || $startYmd <= $toYmd);
                if ($inFromPickup) {
                    if (!isset($dailyRows[$startYmd])) {
                        $dailyRows[$startYmd] = $emptyDailySlot($startYmd);
                    }
                    if ($fin['is_cancelled']) {
                        $dailyRows[$startYmd]['cancelled_bookings']++;
                        $dailyRows[$startYmd]['refunds'] = round($dailyRows[$startYmd]['refunds'] + $fin['refund_amount'], 2);
                    } else {
                        $dailyRows[$startYmd]['pickups']++;
                        $dailyRows[$startYmd]['collections'] = round($dailyRows[$startYmd]['collections'] + $fin['verified_collected'], 2);
                        $dailyRows[$startYmd]['refunds'] = round($dailyRows[$startYmd]['refunds'] + $fin['refund_amount'], 2);
                    }
                    if (!isset($monthlyRowsMap[$pMonthKey])) {
                        $monthlyRowsMap[$pMonthKey] = [
                            'metric_date' => $pMonthKey,
                            'month_label' => date('M Y', strtotime($pMonthKey)),
                            'month_sales' => 0.0,
                            'billed_days' => 0,
                            'total_bookings' => 0,
                            'paid_bookings' => 0,
                            'completed_trips' => 0,
                            'cancelled_bookings' => 0,
                            'verified_collections' => 0.0,
                            'refund_amount' => 0.0,
                            'outstanding_amount' => 0.0,
                            'is_historical_archive' => false,
                        ];
                    }
                    if ($fin['is_cancelled']) {
                        $monthlyRowsMap[$pMonthKey]['cancelled_bookings']++;
                    } else {
                        $monthlyRowsMap[$pMonthKey]['total_bookings']++;
                        if ($fin['is_paid']) {
                            $monthlyRowsMap[$pMonthKey]['paid_bookings']++;
                        }
                        if ($isCompleted) {
                            $monthlyRowsMap[$pMonthKey]['completed_trips']++;
                        }
                    }
                    $monthlyRowsMap[$pMonthKey]['verified_collections'] = round($monthlyRowsMap[$pMonthKey]['verified_collections'] + $fin['verified_collected'], 2);
                    $monthlyRowsMap[$pMonthKey]['refund_amount'] = round($monthlyRowsMap[$pMonthKey]['refund_amount'] + $fin['refund_amount'], 2);
                    $monthlyRowsMap[$pMonthKey]['outstanding_amount'] = round($monthlyRowsMap[$pMonthKey]['outstanding_amount'] + $fin['outstanding_amount'], 2);
                }

                // Track returns explicitly on `$actualReturnYmd` (and `$dropYmd`) so multi-day returns are NEVER dropped
                if (!$fin['is_cancelled'] && $actualReturnYmd !== null) {
                    $retInRange = ($fromYmd === null || $actualReturnYmd >= $fromYmd) && ($toYmd === null || $actualReturnYmd <= $toYmd);
                    if ($retInRange && ($isCompleted || $actualReturnYmd <= $todayStr)) {
                        if (!isset($dailyRows[$actualReturnYmd])) {
                            $dailyRows[$actualReturnYmd] = $emptyDailySlot($actualReturnYmd);
                        }
                        $dailyRows[$actualReturnYmd]['returns']++;
                        if ($isCompleted) {
                            $dailyRows[$actualReturnYmd]['completed_trips']++;
                        }
                        if ($hubAttr['is_cross_hub_return']) {
                            $dailyRows[$actualReturnYmd]['cross_hub_returns']++;
                        }
                    }
                }

                // Daily active trip count across billed days in range
                if (!$fin['is_cancelled']) {
                    $sDt = DateTimeImmutable::createFromFormat('Y-m-d', $startYmd, $tz);
                    if ($sDt) {
                        for ($i = 0; $i < $dates['days']; $i++) {
                            $curYmd = $sDt->modify("+$i days")->format('Y-m-d');
                            if (($fromYmd !== null && $curYmd < $fromYmd) || ($toYmd !== null && $curYmd > $toYmd)) {
                                continue;
                            }
                            if (!isset($dailyRows[$curYmd])) {
                                $dailyRows[$curYmd] = $emptyDailySlot($curYmd);
                            }
                            $dailyRows[$curYmd]['active_trips']++;
                        }
                    }
                }
            }

            // Update filtered summary totals
            if ($fin['is_cancelled']) {
                $filteredTotals['cancelled_bookings']++;
            } else {
                $filteredTotals['total_bookings']++;
                if ($fin['is_paid'] || $isActiveTrip) {
                    $filteredTotals['paid_bookings']++;
                }
                if ($isActiveTrip) {
                    $filteredOnRoadVehicles[$uniqueVehKey] = true;
                    $filteredTotals['active_trips'] = count($filteredOnRoadVehicles);
                }
                if ($isScheduled) {
                    $filteredTotals['scheduled_bookings']++;
                }
                if ($isCompleted) {
                    $filteredTotals['completed_trips']++;
                }
                if ($fin['has_pending_verification']) {
                    $filteredTotals['pending_payments']++;
                }
                $filteredTotals['base_rental'] = round($filteredTotals['base_rental'] + $fin['base_rental'], 2);
                $filteredTotals['driver_charges'] = round($filteredTotals['driver_charges'] + $fin['driver_charges'], 2);
                $filteredTotals['extra_charges'] = round($filteredTotals['extra_charges'] + $fin['extra_charges'], 2);
                $filteredTotals['coupon_discount'] = round($filteredTotals['coupon_discount'] + $fin['coupon_discount'], 2);
                $filteredTotals['security_deposit'] = round($filteredTotals['security_deposit'] + $fin['security_deposit'], 2);
                $filteredTotals['gross_customer_payable'] = round($filteredTotals['gross_customer_payable'] + $fin['gross_customer_payable'], 2);
                $filteredTotals['recognized_rental_revenue'] = round($filteredTotals['recognized_rental_revenue'] + $fin['net_rental_revenue'], 2);
                $filteredTotals['allocated_revenue_in_range'] = round($filteredTotals['allocated_revenue_in_range'] + $allocatedInRange, 2);
                $filteredTotals['outstanding_amount'] = round($filteredTotals['outstanding_amount'] + $fin['outstanding_amount'], 2);
            }
            $filteredTotals['verified_collections'] = round($filteredTotals['verified_collections'] + $fin['verified_collected'], 2);
            $filteredTotals['net_collections'] = round($filteredTotals['net_collections'] + $fin['net_collections'], 2);
            $filteredTotals['refund_amount'] = round($filteredTotals['refund_amount'] + $fin['refund_amount'], 2);

            $b['computed_dates'] = $dates;
            $b['computed_financials'] = $fin;
            $b['computed_hub'] = $hubAttr;
            $b['computed_split'] = $split;
            $b['computed_is_active_trip'] = $isActiveTrip;
            $b['computed_is_completed'] = $isCompleted;
            $b['computed_is_scheduled'] = $isScheduled;
            $b['allocated_revenue_in_range'] = $allocatedInRange;
            $b['allocated_days_in_range'] = $allocatedDaysInRange;
            $enrichedBookings[] = $b;
        }

        // 7. Classify ALL Registered Vehicles across lifecycle concepts & operational Roster filter
        $rosterConfig = self::getActiveRosterConfig();
        $fleetBreakdown = [
            'total_registered' => 0,
            'active_fleet' => 0,
            'catalog_only' => 0,
            'available_recorded' => 0,
            'on_trip' => 0,
            'in_yard' => 0,
            'maintenance' => 0,
            'unavailable_other' => 0,
            'inactive' => 0,
            'removed' => 0,
            'scheduled_bookings_vehicles' => 0,
            'unassigned_hub' => 0,
        ];
        $classifiedVehicles = [];

        foreach ($allVehiclesRaw as $v) {
            $vHubRaw = (int)($v['hub_id'] ?? 0);
            $vHubId = ($vHubRaw > 0 && isset($registeredHubs[$vHubRaw])) ? $vHubRaw : 0;
            $inRoster = self::isVehicleInRoster($v, $rosterConfig);
            $vState = self::classifyVehicleState($v, $onTripByVehicleId, $onTripByReg, $scheduledByVehicleId, $scheduledByReg, $inRoster);

            $fleetBreakdown['total_registered']++;
            $hubStats[0]['total_registered_fleet']++;
            if ($vHubId > 0) {
                $hubStats[$vHubId]['total_registered_fleet']++;
            } else {
                $unassignedBucket['total_registered_fleet']++;
                if (!$vState['is_removed'] && $vState['is_active_fleet']) {
                    $fleetBreakdown['unassigned_hub']++;
                    $diagnostics['unassigned_hub_vehicles'][] = [
                        'id' => (int)($v['id'] ?? 0),
                        'reg_no' => $v['reg_no'] ?? '',
                        'brand_model' => trim(($v['brand'] ?? '') . ' ' . ($v['model'] ?? '')),
                        'hub_id' => $v['hub_id'] ?? null,
                    ];
                }
            }

            if ($vState['is_removed']) {
                $fleetBreakdown['removed']++;
                $hubStats[0]['removed_fleet']++;
                if ($vHubId > 0) {
                    $hubStats[$vHubId]['removed_fleet']++;
                } else {
                    $unassignedBucket['removed_fleet']++;
                }
            } elseif ($vState['is_inactive']) {
                $fleetBreakdown['inactive']++;
                $hubStats[0]['inactive_fleet']++;
                if ($vHubId > 0) {
                    $hubStats[$vHubId]['inactive_fleet']++;
                } else {
                    $unassignedBucket['inactive_fleet']++;
                }
            } elseif (!empty($vState['is_catalog_only'])) {
                $fleetBreakdown['catalog_only']++;
            } else {
                // Active operational fleet ONLY (never includes inactive or removed!)
                $fleetBreakdown['active_fleet']++;
                $hubStats[0]['total_fleet']++;
                if ($vHubId > 0) {
                    $hubStats[$vHubId]['total_fleet']++;
                } else {
                    $unassignedBucket['total_fleet']++;
                }

                if ($vState['is_available_recorded']) {
                    $fleetBreakdown['available_recorded']++;
                    $hubStats[0]['available_recorded_fleet']++;
                    if ($vHubId > 0) {
                        $hubStats[$vHubId]['available_recorded_fleet']++;
                    } else {
                        $unassignedBucket['available_recorded_fleet']++;
                    }
                }
                if ($vState['is_on_trip']) {
                    $fleetBreakdown['on_trip']++;
                    $hubStats[0]['on_road_fleet']++;
                    if ($vHubId > 0) {
                        $hubStats[$vHubId]['on_road_fleet']++;
                    } else {
                        $unassignedBucket['on_road_fleet']++;
                    }
                } elseif ($vState['is_maintenance']) {
                    $fleetBreakdown['maintenance']++;
                    $hubStats[0]['maintenance_fleet']++;
                    if ($vHubId > 0) {
                        $hubStats[$vHubId]['maintenance_fleet']++;
                    } else {
                        $unassignedBucket['maintenance_fleet']++;
                    }
                } elseif ($vState['is_in_yard']) {
                    $fleetBreakdown['in_yard']++;
                    $hubStats[0]['available_fleet']++;
                    if ($vHubId > 0) {
                        $hubStats[$vHubId]['available_fleet']++;
                    } else {
                        $unassignedBucket['available_fleet']++;
                    }
                } else {
                    $fleetBreakdown['unavailable_other']++;
                }
                if ($vState['has_scheduled_booking']) {
                    $fleetBreakdown['scheduled_bookings_vehicles']++;
                }
            }

            $v['computed_state'] = $vState;
            $v['computed_hub_id'] = $vHubId;
            $v['computed_hub_name'] = $vHubId > 0 ? $registeredHubs[$vHubId]['name'] : 'Unassigned';
            $classifiedVehicles[] = $v;
        }

        // Finalize Hub Stats: ONLY On-Road vehicles count as Active Trips; Yard is Non-Active
        foreach ($hubStats as $hId => &$hs) {
            $onRoadCount = $hs['total_fleet'] > 0
                ? $hs['on_road_fleet']
                : ($hId === 0 ? count($onRoadVehiclesAll) : count($onRoadVehiclesByHub[$hId] ?? []));
            $hs['on_road_fleet'] = $onRoadCount;
            $hs['active_trips'] = $onRoadCount;
            $hs['available_fleet'] = max(0, $hs['available_fleet']);
            $hs['occupancy_pct'] = $hs['total_fleet'] > 0
                ? min(100.0, round(($onRoadCount / $hs['total_fleet']) * 100, 2))
                : 0.0;
            $hs['revenue_per_vehicle'] = $hs['total_fleet'] > 0
                ? round($hs['total_revenue'] / $hs['total_fleet'], 2)
                : 0.0;
            $hs['total_users'] = $totalUsers;
            $hs['pending_docs'] = $pendingDocs;
        }
        unset($hs);

        if ($unassignedBucket['total_fleet'] > 0) {
            $unassignedBucket['active_trips'] = $unassignedBucket['on_road_fleet'];
            $unassignedBucket['occupancy_pct'] = min(100.0, round(($unassignedBucket['on_road_fleet'] / $unassignedBucket['total_fleet']) * 100, 2));
            $unassignedBucket['revenue_per_vehicle'] = round($unassignedBucket['total_revenue'] / $unassignedBucket['total_fleet'], 2);
        } else {
            $unassignedBucket['active_trips'] = count($onRoadVehiclesUnassigned);
            $unassignedBucket['on_road_fleet'] = $unassignedBucket['active_trips'];
        }

        // 8. Monthly Ledger, Manual DB Adjustments & Historical Archive Handling
        // Preserve booking-only monthly revenue separately so daily/monthly booking reconciliation stays exact.
        foreach ($monthlyRowsMap as $mKey => &$mr) {
            $mr['booking_month_sales'] = round((float)($mr['month_sales'] ?? 0.0), 2);
            $mr['offline_adjustment'] = 0.0;
        }
        unset($mr);

        $existingLedger = [];
        try {
            foreach (Database::fetchAll("SELECT * FROM `kpi_metrics` ORDER BY `metric_date` ASC") ?: [] as $er) {
                $mTs = self::parseValidTimestamp($er['metric_date'] ?? '');
                if ($mTs !== null) {
                    $mKey = (new DateTimeImmutable('@' . $mTs))->setTimezone($tz)->format('Y-m-01');
                    $existingLedger[$mKey] = $er;
                }
            }
        } catch (Throwable $_) {}

        $existingHubRows = [];
        try {
            foreach (Database::fetchAll("SELECT * FROM `kpi_hub_metrics` ORDER BY `hub_id` ASC") ?: [] as $hr) {
                $existingHubRows[(int)($hr['hub_id'] ?? 0)] = $hr;
            }
        } catch (Throwable $_) {}

        $savedEngineState = [];
        try {
            $stateRow = Database::fetchOne("SELECT `value` FROM `settings` WHERE `key` = 'kpi_engine_state' ORDER BY `updated_at` DESC LIMIT 1")
                ?: Database::fetchOne("SELECT `value` FROM `settings` WHERE `key` = 'kpi_engine_state' LIMIT 1");
            if (!empty($stateRow['value'])) {
                $decodedState = json_decode((string)$stateRow['value'], true);
                if (is_array($decodedState)) {
                    $savedEngineState = $decodedState;
                }
            }
        } catch (Throwable $_) {}

        $historicalArchiveRevenue = 0.0;
        $offlineAdjustments = [
            'total_revenue' => 0.0,
            'month_revenue' => 0.0,
            'day_sales' => 0.0,
            'week_sales' => 0.0,
            'total_bookings' => 0,
            'paid_bookings' => 0,
            'completed_trips' => 0,
        ];
        $nextEngineState = $savedEngineState;

        if (!$hasBookingScopeFilter) {
            if (!isset($monthlyRowsMap[$currentMonthKey])) {
                $monthlyRowsMap[$currentMonthKey] = [
                    'metric_date' => $currentMonthKey,
                    'month_label' => date('M Y', strtotime($currentMonthKey)),
                    'month_sales' => 0.0,
                    'booking_month_sales' => 0.0,
                    'offline_adjustment' => 0.0,
                    'billed_days' => 0,
                    'total_bookings' => 0,
                    'paid_bookings' => 0,
                    'completed_trips' => 0,
                    'cancelled_bookings' => 0,
                    'verified_collections' => 0.0,
                    'refund_amount' => 0.0,
                    'outstanding_amount' => 0.0,
                    'is_historical_archive' => false,
                ];
            }

            // Include existing prior-month ledger rows so historical/offline months remain visible even when 0 live bookings exist
            foreach ($existingLedger as $mKey => $er) {
                if (!isset($monthlyRowsMap[$mKey]) && ($filterHubId === null || $mKey < $currentMonthKey)) {
                    $monthlyRowsMap[$mKey] = [
                        'metric_date' => $mKey,
                        'month_label' => date('M Y', strtotime($mKey)),
                        'month_sales' => 0.0,
                        'booking_month_sales' => 0.0,
                        'offline_adjustment' => 0.0,
                        'billed_days' => 0,
                        'total_bookings' => 0,
                        'paid_bookings' => 0,
                        'completed_trips' => 0,
                        'cancelled_bookings' => 0,
                        'verified_collections' => 0.0,
                        'refund_amount' => 0.0,
                        'outstanding_amount' => 0.0,
                        'is_historical_archive' => true,
                    ];
                }
            }

            $adjResult = self::applyManualDbAdjustments(
                $hubStats,
                $monthlyRowsMap,
                $existingHubRows,
                $existingLedger,
                $savedEngineState,
                $currentMonthKey,
                $todayStr,
                $curWeekKey
            );
            $hubStats = $adjResult['hubStats'];
            $monthlyRowsMap = $adjResult['monthlyRowsMap'];
            $historicalArchiveRevenue = $adjResult['historicalArchiveRevenue'];
            $offlineAdjustments = $adjResult['offlineAdjustments'];
            $nextEngineState = $adjResult['nextState'];
        }

        ksort($dailyRows);
        ksort($monthlyRowsMap);

        // Compute running cumulative revenue across monthly ledger while aligning current-month cumulative to Hub 0 total
        $sumEffectiveMonthly = 0.0;
        foreach ($monthlyRowsMap as $mKey => $mr) {
            $sumEffectiveMonthly = round($sumEffectiveMonthly + (float)($mr['month_sales'] ?? 0.0), 2);
        }

        $unallocatedCumOffset = (!$hasBookingScopeFilter && $filterHubId === null)
            ? round((float)$hubStats[0]['total_revenue'] - $sumEffectiveMonthly, 2)
            : 0.0;
        $runningRev = $unallocatedCumOffset;
        $runningBookingRevOnly = 0.0;
        foreach ($monthlyRowsMap as $mKey => &$mr) {
            $mSales = round((float)$mr['month_sales'], 2);
            $runningRev = round($runningRev + $mSales, 2);
            if (empty($mr['is_historical_archive'])) {
                $bMonthSales = round((float)($mr['booking_month_sales'] ?? $mSales), 2);
                $runningBookingRevOnly = round($runningBookingRevOnly + $bMonthSales, 2);
            }
            $isCur = ($mKey === $currentMonthKey);
            $mr['total_revenue'] = ($isCur && !$hasBookingScopeFilter && $filterHubId === null)
                ? round((float)$hubStats[0]['total_revenue'], 2)
                : max(0.0, $runningRev);
            $mr['day_sales'] = $isCur ? round((float)$hubStats[0]['day_sales'], 2) : 0.0;
            $mr['week_sales'] = $isCur ? round((float)$hubStats[0]['week_sales'], 2) : 0.0;
            $mr['active_trips'] = $isCur ? (int)$hubStats[0]['active_trips'] : 0;
            $mr['total_fleet'] = (int)$hubStats[0]['total_fleet'];
            $mr['on_road_fleet'] = $isCur ? (int)$hubStats[0]['on_road_fleet'] : 0;
            $mr['in_yard_fleet'] = $isCur ? (int)$hubStats[0]['available_fleet'] : (int)$hubStats[0]['total_fleet'];
            $mr['occupancy_pct'] = $isCur ? (float)$hubStats[0]['occupancy_pct'] : 0.0;
            $mr['total_users'] = $totalUsers;
            $mr['pending_payments'] = $isCur ? (int)$hubStats[0]['pending_payments'] : 0;
            $mr['pending_docs'] = $isCur ? $pendingDocs : 0;
        }
        unset($mr);

        // 9. Exact Reconciliation Checks (Booking Math + Transparent DB Offline Adjustment Tracking)
        $sumDailyRevenue = round(array_sum(array_column($dailyRows, 'revenue')), 2);
        $sumBookingMonthlySales = $runningBookingRevOnly;
        $expectedAllocatedBookingRev = $hasAnyFilter ? $filteredTotals['allocated_revenue_in_range'] : $unfilteredAllBookingRevenue;
        $effectiveOfflineRevAdj = (!$hasBookingScopeFilter && $filterHubId === null)
            ? round((float)$hubStats[0]['total_revenue'] - $unfilteredAllBookingRevenue, 2)
            : (($filterHubId !== null && !$hasBookingScopeFilter && isset($hubStats[$filterHubId]))
                ? round((float)($hubStats[$filterHubId]['offline_revenue_adjustment'] ?? 0.0), 2)
                : 0.0);

        $reconciliation = [
            'daily_revenue_total' => $sumDailyRevenue,
            'monthly_booking_revenue_total' => $sumBookingMonthlySales,
            'booking_net_rental_total' => $expectedAllocatedBookingRev,
            'historical_archive_revenue' => $historicalArchiveRevenue,
            'offline_total_revenue_adjustment' => $effectiveOfflineRevAdj,
            'offline_month_revenue_adjustment' => (!$hasBookingScopeFilter && $filterHubId === null) ? (float)$offlineAdjustments['month_revenue'] : 0.0,
            'combined_system_revenue' => round($expectedAllocatedBookingRev + $effectiveOfflineRevAdj, 2),
            'verified_collections_total' => $hasAnyFilter ? $filteredTotals['verified_collections'] : $unfilteredVerifiedCollections,
            'refunds_total' => $hasAnyFilter ? $filteredTotals['refund_amount'] : $unfilteredRefunds,
            'net_collections_total' => $hasAnyFilter ? $filteredTotals['net_collections'] : $unfilteredNetCollections,
            'outstanding_receivables_total' => $hasAnyFilter ? $filteredTotals['outstanding_amount'] : $unfilteredOutstanding,
            'security_deposits_liability_total' => $hasAnyFilter ? $filteredTotals['security_deposit'] : $unfilteredDeposits,
            'daily_vs_monthly_diff' => round($sumDailyRevenue - $sumBookingMonthlySales, 2),
            'monthly_vs_bookings_diff' => round($sumBookingMonthlySales - $expectedAllocatedBookingRev, 2),
            'reconciled' => (abs($sumDailyRevenue - $sumBookingMonthlySales) < 0.02 && abs($sumBookingMonthlySales - $expectedAllocatedBookingRev) < 0.02),
        ];

        // 10. Authoritative Direct Persistence into kpi_metrics, kpi_hub_metrics & settings['kpi_engine_state']
        if ($persistSync && !$hasAnyFilter) {
            $syncTs = date('Y-m-d H:i:s');
            try {
                // Keep kpi_hub_metrics strictly aligned to Hub 0 + registered DB hubs
                $validHubIds = array_keys($hubStats);
                if (!empty($validHubIds)) {
                    $placeholders = implode(',', array_fill(0, count($validHubIds), '?'));
                    Database::execute("DELETE FROM `kpi_hub_metrics` WHERE `hub_id` NOT IN ($placeholders)", $validHubIds);
                }

                foreach ($hubStats as $hs) {
                    Database::execute(
                        "INSERT INTO `kpi_hub_metrics` (
                            `hub_id`, `hub_name`, `total_revenue`, `month_revenue`, `total_bookings`, `paid_bookings`,
                            `active_trips`, `completed_trips`, `scheduled_bookings`, `total_fleet`, `on_road_fleet`,
                            `available_fleet`, `maintenance_fleet`, `occupancy_pct`, `total_users`, `pending_docs`,
                            `pending_payments`, `day_sales`, `week_sales`, `updated_at`
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            `hub_name` = VALUES(`hub_name`),
                            `total_revenue` = VALUES(`total_revenue`),
                            `month_revenue` = VALUES(`month_revenue`),
                            `total_bookings` = VALUES(`total_bookings`),
                            `paid_bookings` = VALUES(`paid_bookings`),
                            `active_trips` = VALUES(`active_trips`),
                            `completed_trips` = VALUES(`completed_trips`),
                            `scheduled_bookings` = VALUES(`scheduled_bookings`),
                            `total_fleet` = VALUES(`total_fleet`),
                            `on_road_fleet` = VALUES(`on_road_fleet`),
                            `available_fleet` = VALUES(`available_fleet`),
                            `maintenance_fleet` = VALUES(`maintenance_fleet`),
                            `occupancy_pct` = VALUES(`occupancy_pct`),
                            `total_users` = VALUES(`total_users`),
                            `pending_docs` = VALUES(`pending_docs`),
                            `pending_payments` = VALUES(`pending_payments`),
                            `day_sales` = VALUES(`day_sales`),
                            `week_sales` = VALUES(`week_sales`),
                            `updated_at` = VALUES(`updated_at`)",
                        [
                            $hs['hub_id'], $hs['hub_name'], $hs['total_revenue'], $hs['month_revenue'],
                            $hs['total_bookings'], $hs['paid_bookings'], $hs['active_trips'],
                            $hs['completed_trips'], $hs['scheduled_bookings'], $hs['total_fleet'],
                            $hs['on_road_fleet'], $hs['available_fleet'], $hs['maintenance_fleet'],
                            $hs['occupancy_pct'], $hs['total_users'], $hs['pending_docs'],
                            $hs['pending_payments'], $hs['day_sales'], $hs['week_sales'], $syncTs,
                        ]
                    );
                }

                // Upsert monthly ledger rows
                foreach ($monthlyRowsMap as $mStart => $mr) {
                    Database::execute(
                        "INSERT INTO `kpi_metrics` (
                            `metric_date`, `day_sales`, `week_sales`, `month_sales`, `total_revenue`,
                            `total_bookings`, `paid_bookings`, `active_trips`, `completed_trips`,
                            `total_fleet`, `on_road_fleet`, `in_yard_fleet`, `occupancy_pct`,
                            `total_users`, `pending_payments`, `pending_docs`, `updated_at`
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            `day_sales` = VALUES(`day_sales`),
                            `week_sales` = VALUES(`week_sales`),
                            `month_sales` = VALUES(`month_sales`),
                            `total_revenue` = VALUES(`total_revenue`),
                            `total_bookings` = VALUES(`total_bookings`),
                            `paid_bookings` = VALUES(`paid_bookings`),
                            `active_trips` = VALUES(`active_trips`),
                            `completed_trips` = VALUES(`completed_trips`),
                            `total_fleet` = VALUES(`total_fleet`),
                            `on_road_fleet` = VALUES(`on_road_fleet`),
                            `in_yard_fleet` = VALUES(`in_yard_fleet`),
                            `occupancy_pct` = VALUES(`occupancy_pct`),
                            `total_users` = VALUES(`total_users`),
                            `pending_payments` = VALUES(`pending_payments`),
                            `pending_docs` = VALUES(`pending_docs`),
                            `updated_at` = VALUES(`updated_at`)",
                        [
                            $mStart, $mr['day_sales'], $mr['week_sales'], $mr['month_sales'], $mr['total_revenue'],
                            $mr['total_bookings'], $mr['paid_bookings'], $mr['active_trips'], $mr['completed_trips'],
                            $mr['total_fleet'], $mr['on_road_fleet'], $mr['in_yard_fleet'], $mr['occupancy_pct'],
                            $mr['total_users'], $mr['pending_payments'], $mr['pending_docs'], $syncTs,
                        ]
                    );
                }

                // Record final written state so future phpMyAdmin / modal edits are detected accurately
                $nextEngineState['last_calc_date'] = $todayStr;
                $nextEngineState['last_calc_week'] = $curWeekKey;
                $nextEngineState['last_calc_month'] = $currentMonthKey;
                foreach ($hubStats as $hId => $hs) {
                    $hKey = (string)$hId;
                    if (!isset($nextEngineState['hubs'][$hKey])) {
                        $nextEngineState['hubs'][$hKey] = ['offsets' => []];
                    }
                    $nextEngineState['hubs'][$hKey]['last_written'] = [
                        'total_revenue' => round((float)$hs['total_revenue'], 2),
                        'month_revenue' => round((float)$hs['month_revenue'], 2),
                        'day_sales' => round((float)$hs['day_sales'], 2),
                        'week_sales' => round((float)$hs['week_sales'], 2),
                        'total_bookings' => (int)$hs['total_bookings'],
                        'paid_bookings' => (int)$hs['paid_bookings'],
                        'completed_trips' => (int)$hs['completed_trips'],
                    ];
                }
                foreach ($monthlyRowsMap as $mStart => $mr) {
                    if (!isset($nextEngineState['monthly'][$mStart])) {
                        $nextEngineState['monthly'][$mStart] = ['offsets' => []];
                    }
                    $nextEngineState['monthly'][$mStart]['last_written'] = [
                        'month_sales' => round((float)$mr['month_sales'], 2),
                        'total_revenue' => round((float)$mr['total_revenue'], 2),
                        'day_sales' => round((float)$mr['day_sales'], 2),
                        'week_sales' => round((float)$mr['week_sales'], 2),
                        'total_bookings' => (int)$mr['total_bookings'],
                        'paid_bookings' => (int)$mr['paid_bookings'],
                        'completed_trips' => (int)$mr['completed_trips'],
                    ];
                }

                Database::execute("DELETE FROM `settings` WHERE `key` = 'kpi_engine_state'");
                Database::execute(
                    "INSERT INTO `settings` (`key`, `value`, `updated_at`) VALUES ('kpi_engine_state', ?, ?)",
                    [json_encode($nextEngineState), $syncTs]
                );
            } catch (Throwable $e) {
                error_log('[KpiService persist error] ' . $e->getMessage());
            }
        }

        // Build clean summary object (reflects filters if applied, else unscoped system live values + DB adjustments)
        $summarySource = $hasAnyFilter ? $filteredTotals : $hubStats[0];
        if ($hasAnyFilter && $filterHubId !== null && !$hasBookingScopeFilter && isset($hubStats[$filterHubId])) {
            $summarySource = $hubStats[$filterHubId];
        }
        $effectivePaidCount = (int)$summarySource['paid_bookings'];
        $summaryRevenue = $hasAnyFilter
            ? (($filterHubId !== null && !$hasBookingScopeFilter && isset($hubStats[$filterHubId]))
                ? (float)$hubStats[$filterHubId]['total_revenue']
                : (float)$filteredTotals['allocated_revenue_in_range'])
            : (float)$hubStats[0]['total_revenue'];
        $bookingRevOnly = $hasAnyFilter ? (float)$filteredTotals['allocated_revenue_in_range'] : $unfilteredAllBookingRevenue;
        $avgBooking = $effectivePaidCount > 0 ? round($summaryRevenue / $effectivePaidCount, 2) : 0.0;

        // Scope fleet metrics when a specific hub_id filter is active
        $fleetScope = ($filterHubId !== null && isset($hubStats[$filterHubId])) ? $hubStats[$filterHubId] : $hubStats[0];

        $lastMonthRev = (float)($monthlyRowsMap[$previousMonthKey]['month_sales'] ?? 0.0);

        $liveStats = [
            'total_users' => $totalUsers,
            'total_bookings' => (int)$summarySource['total_bookings'],
            'cancelled_bookings' => (int)$summarySource['cancelled_bookings'],
            'paid_bookings' => $effectivePaidCount,
            'pending_docs' => $pendingDocs,
            'pending_payments' => (int)$summarySource['pending_payments'],
            'day_sales' => $hasBookingScopeFilter ? 0.0 : (float)$summarySource['day_sales'],
            'week_sales' => $hasBookingScopeFilter ? 0.0 : (float)$summarySource['week_sales'],
            'total_revenue' => round($summaryRevenue, 2),
            'booking_revenue' => round($bookingRevOnly, 2),
            'historical_archive_revenue' => round($historicalArchiveRevenue, 2),
            'offline_revenue_adjustment' => round($effectiveOfflineRevAdj, 2),
            'offline_month_adjustment' => (!$hasBookingScopeFilter && $filterHubId === null) ? (float)$offlineAdjustments['month_revenue'] : 0.0,
            'verified_collections' => round($reconciliation['verified_collections_total'], 2),
            'net_collections' => round($reconciliation['net_collections_total'], 2),
            'total_refunds' => round($reconciliation['refunds_total'], 2),
            'outstanding_amount' => round($reconciliation['outstanding_receivables_total'], 2),
            'security_deposits_held' => round($reconciliation['security_deposits_liability_total'], 2),
            'month_revenue' => $hasBookingScopeFilter
                ? round($summaryRevenue, 2)
                : ($filterHubId !== null && isset($hubStats[$filterHubId])
                    ? (float)$hubStats[$filterHubId]['month_revenue']
                    : (float)$hubStats[0]['month_revenue']),
            'last_month_revenue' => $lastMonthRev,
            'avg_booking' => $avgBooking,
            'active_trips' => (int)$summarySource['active_trips'],
            'active_rentals' => (int)$summarySource['active_trips'],
            'scheduled_bookings' => (int)$summarySource['scheduled_bookings'],
            'completed_trips' => (int)$summarySource['completed_trips'],
            'total_registered_vehicles' => (int)$fleetScope['total_registered_fleet'],
            'active_fleet' => (int)$fleetScope['total_fleet'],
            'total_fleet' => (int)$fleetScope['total_fleet'],
            'fleet_count' => (int)$fleetScope['total_fleet'],
            'available_recorded' => (int)$fleetScope['available_recorded_fleet'],
            'on_road_fleet' => (int)$fleetScope['on_road_fleet'],
            'available_fleet' => (int)$fleetScope['available_fleet'],
            'available_in_yard' => (int)$fleetScope['available_fleet'],
            'maintenance_fleet' => (int)$fleetScope['maintenance_fleet'],
            'inactive_fleet' => (int)$fleetScope['inactive_fleet'],
            'removed_fleet' => (int)$fleetScope['removed_fleet'],
            'catalog_only_fleet' => (int)$fleetBreakdown['catalog_only'],
            'fleet_utilization' => (float)$fleetScope['occupancy_pct'],
            'occupancy_pct' => (float)$fleetScope['occupancy_pct'],
            'revenue_per_vehicle' => (float)$fleetScope['revenue_per_vehicle'],
            'cross_hub_returns' => (int)$fleetScope['cross_hub_inbound'],
        ];

        return [
            'live' => $liveStats,
            'effective' => $liveStats,
            'hubs' => $hubStats,
            'unassigned_hub' => $unassignedBucket,
            'registered_hubs' => array_values($registeredHubs),
            'monthly' => $monthlyRowsMap,
            'daily' => array_values($dailyRows),
            'fleet' => array_values($fleetRevenue),
            'fleet_breakdown' => $fleetBreakdown,
            'vehicles' => $classifiedVehicles,
            'bookings' => $enrichedBookings,
            'payments' => $paymentData['rows'],
            'reconciliation' => $reconciliation,
            'diagnostics' => $diagnostics,
            'filters_applied' => [
                'from' => $fromYmd,
                'to' => $toYmd,
                'hub_id' => $filterHubId,
                'unassigned_only' => $filterUnassignedOnly,
                'status' => $filterStatus !== '' ? $filterStatus : null,
                'search' => $filterSearch !== '' ? $filterSearch : null,
                'has_filters' => $hasAnyFilter,
            ],
            'reporting_month' => $currentMonthKey,
            'previous_month' => $previousMonthKey,
        ];
    }

    /**
     * Detects and preserves manual database edits in `kpi_hub_metrics` and `kpi_metrics` (offline / pre-launch
     * amounts not recorded in website `bookings`), while keeping live website bookings 100% dynamic on top.
     */
    public static function applyManualDbAdjustments(
        array $hubStats,
        array $monthlyRowsMap,
        array $existingHubRows,
        array $existingLedger,
        array $savedState,
        string $currentMonthKey,
        string $todayStr,
        string $curWeekKey
    ): array {
        $floatHubFields = ['total_revenue', 'month_revenue', 'day_sales', 'week_sales'];
        $intHubFields = ['total_bookings', 'paid_bookings', 'completed_trips'];
        $floatMonthFields = ['month_sales'];
        $intMonthFields = ['total_bookings', 'paid_bookings', 'completed_trips'];

        $hasState = !empty($savedState) && isset($savedState['hubs']) && is_array($savedState['hubs']);
        $dayRolled = $hasState && !empty($savedState['last_calc_date']) && $savedState['last_calc_date'] !== $todayStr;
        $weekRolled = $hasState && !empty($savedState['last_calc_week']) && $savedState['last_calc_week'] !== $curWeekKey;
        $monthRolled = $hasState && !empty($savedState['last_calc_month']) && $savedState['last_calc_month'] !== $currentMonthKey;

        // 1. Detect edits & bootstrap offsets on `kpi_metrics` (monthly rows)
        ksort($monthlyRowsMap);
        $newMonthOffsets = [];
        $monthEdited = [];
        $monthEditDeltas = [];
        $priorMonthsOfflineRev = 0.0;
        $priorMonthsOfflineDelta = 0.0;
        $historicalArchiveRevenue = 0.0;

        foreach ($monthlyRowsMap as $mKey => $mr) {
            $calcM = [
                'month_sales' => round((float)($mr['booking_month_sales'] ?? $mr['month_sales'] ?? 0.0), 2),
                'total_bookings' => (int)($mr['total_bookings'] ?? 0),
                'paid_bookings' => (int)($mr['paid_bookings'] ?? 0),
                'completed_trips' => (int)($mr['completed_trips'] ?? 0),
            ];
            $prevMState = $savedState['monthly'][$mKey] ?? null;
            $hasMState = is_array($prevMState) && isset($prevMState['last_written']) && is_array($prevMState['last_written']);
            $mOff = is_array($prevMState['offsets'] ?? null)
                ? $prevMState['offsets']
                : ['month_sales' => 0.0, 'total_bookings' => 0, 'paid_bookings' => 0, 'completed_trips' => 0];
            $er = $existingLedger[$mKey] ?? null;

            if ($er !== null) {
                foreach ($floatMonthFields as $f) {
                    $dbVal = round((float)($er[$f] ?? 0.0), 2);
                    if ($hasMState) {
                        $prevWritten = round((float)($prevMState['last_written'][$f] ?? 0.0), 2);
                        if (abs($dbVal - $prevWritten) >= 0.01) {
                            $monthEdited[$mKey][$f] = true;
                            $monthEditDeltas[$mKey][$f] = round($dbVal - $prevWritten, 2);
                            $mOff[$f] = round($dbVal - $calcM[$f], 2);
                        }
                    } elseif ($mKey < $currentMonthKey && $calcM[$f] <= 0.0 && $dbVal > 0.0) {
                        $mOff[$f] = $dbVal;
                    } elseif (($dbVal - $calcM[$f]) >= 0.01) {
                        $mOff[$f] = round($dbVal - $calcM[$f], 2);
                    }
                }
                foreach ($intMonthFields as $f) {
                    $dbVal = (int)($er[$f] ?? 0);
                    if ($hasMState) {
                        $prevWritten = (int)($prevMState['last_written'][$f] ?? 0);
                        if ($dbVal !== $prevWritten) {
                            $monthEdited[$mKey][$f] = true;
                            $monthEditDeltas[$mKey][$f] = $dbVal - $prevWritten;
                            $mOff[$f] = $dbVal - $calcM[$f];
                        }
                    } elseif ($dbVal > $calcM[$f]) {
                        $mOff[$f] = $dbVal - $calcM[$f];
                    }
                }
            }

            $newMonthOffsets[$mKey] = $mOff;
            if ($mKey < $currentMonthKey) {
                $mOfflineAmt = round((float)($mOff['month_sales'] ?? 0.0), 2);
                $priorMonthsOfflineRev = round($priorMonthsOfflineRev + $mOfflineAmt, 2);
                if (!empty($monthEdited[$mKey]['month_sales'])) {
                    $priorMonthsOfflineDelta = round($priorMonthsOfflineDelta + (float)$monthEditDeltas[$mKey]['month_sales'], 2);
                }
                if (!empty($mr['is_historical_archive']) && $mOfflineAmt > 0.0) {
                    $historicalArchiveRevenue = round($historicalArchiveRevenue + $mOfflineAmt, 2);
                }
            }
        }

        // 2. Detect edits, rollovers & bootstrap offsets on `kpi_hub_metrics` (child hubs > 0 first, Hub 0 last)
        $orderedHubIds = array_values(array_filter(array_keys($hubStats), static fn($id) => (int)$id > 0));
        sort($orderedHubIds);
        if (isset($hubStats[0])) {
            $orderedHubIds[] = 0;
        }

        $newHubOffsets = [];
        $hubEdited = [];
        $hubEditDeltas = [];
        $childDeltaSum = [];
        foreach (array_merge($floatHubFields, $intHubFields) as $f) {
            $childDeltaSum[$f] = in_array($f, $floatHubFields, true) ? 0.0 : 0;
        }

        foreach ($orderedHubIds as $hId) {
            $hs = $hubStats[$hId];
            $hKey = (string)$hId;
            $prevHState = $savedState['hubs'][$hKey] ?? null;
            $hasHState = is_array($prevHState) && isset($prevHState['last_written']) && is_array($prevHState['last_written']);
            $hOff = is_array($prevHState['offsets'] ?? null)
                ? $prevHState['offsets']
                : [
                    'total_revenue' => 0.0,
                    'month_revenue' => 0.0,
                    'day_sales' => 0.0,
                    'week_sales' => 0.0,
                    'total_bookings' => 0,
                    'paid_bookings' => 0,
                    'completed_trips' => 0,
                ];

            if ($hasHState) {
                if ($dayRolled) {
                    $hOff['day_sales'] = 0.0;
                }
                if ($weekRolled) {
                    $hOff['week_sales'] = 0.0;
                }
                if ($monthRolled) {
                    $hOff['month_revenue'] = 0.0;
                }
            }

            $hr = $existingHubRows[$hId] ?? null;
            if ($hr !== null) {
                foreach ($floatHubFields as $f) {
                    $dbVal = round((float)($hr[$f] ?? 0.0), 2);
                    $calcVal = round((float)($hs[$f] ?? 0.0), 2);
                    if ($hasHState) {
                        $prevWritten = round((float)($prevHState['last_written'][$f] ?? 0.0), 2);
                        if (abs($dbVal - $prevWritten) >= 0.01) {
                            $hubEdited[$hId][$f] = true;
                            $hubEditDeltas[$hId][$f] = round($dbVal - $prevWritten, 2);
                            $hOff[$f] = round($dbVal - $calcVal, 2);
                        }
                    } elseif (($dbVal - $calcVal) >= 0.01) {
                        $hOff[$f] = round($dbVal - $calcVal, 2);
                    }
                }
                foreach ($intHubFields as $f) {
                    $dbVal = (int)($hr[$f] ?? 0);
                    $calcVal = (int)($hs[$f] ?? 0);
                    if ($hasHState) {
                        $prevWritten = (int)($prevHState['last_written'][$f] ?? 0);
                        if ($dbVal !== $prevWritten) {
                            $hubEdited[$hId][$f] = true;
                            $hubEditDeltas[$hId][$f] = $dbVal - $prevWritten;
                            $hOff[$f] = $dbVal - $calcVal;
                        }
                    } elseif ($dbVal > $calcVal) {
                        $hOff[$f] = $dbVal - $calcVal;
                    }
                }
            }

            // Intra-hub convenience roll-up when narrower period edited without also editing broader totals
            if (!empty($hubEdited[$hId]['day_sales'])) {
                $dDelta = (float)$hubEditDeltas[$hId]['day_sales'];
                if (empty($hubEdited[$hId]['week_sales'])) {
                    $hOff['week_sales'] = round((float)($hOff['week_sales'] ?? 0.0) + $dDelta, 2);
                }
                if (empty($hubEdited[$hId]['month_revenue'])) {
                    $hOff['month_revenue'] = round((float)($hOff['month_revenue'] ?? 0.0) + $dDelta, 2);
                }
                if (empty($hubEdited[$hId]['total_revenue']) && empty($hubEdited[$hId]['month_revenue'])) {
                    $hOff['total_revenue'] = round((float)($hOff['total_revenue'] ?? 0.0) + $dDelta, 2);
                }
            } elseif (!empty($hubEdited[$hId]['week_sales'])) {
                $wDelta = (float)$hubEditDeltas[$hId]['week_sales'];
                if (empty($hubEdited[$hId]['month_revenue'])) {
                    $hOff['month_revenue'] = round((float)($hOff['month_revenue'] ?? 0.0) + $wDelta, 2);
                }
                if (empty($hubEdited[$hId]['total_revenue']) && empty($hubEdited[$hId]['month_revenue'])) {
                    $hOff['total_revenue'] = round((float)($hOff['total_revenue'] ?? 0.0) + $wDelta, 2);
                }
            }
            if (!empty($hubEdited[$hId]['month_revenue']) && empty($hubEdited[$hId]['total_revenue'])) {
                $mDelta = (float)$hubEditDeltas[$hId]['month_revenue'];
                $hOff['total_revenue'] = round((float)($hOff['total_revenue'] ?? 0.0) + $mDelta, 2);
            }

            if ($hId > 0) {
                $prevSavedOff = is_array($prevHState['offsets'] ?? null) ? $prevHState['offsets'] : [];
                foreach ($floatHubFields as $f) {
                    if (!empty($hubEdited[$hId]['day_sales']) || !empty($hubEdited[$hId]['week_sales']) || !empty($hubEdited[$hId]['month_revenue']) || !empty($hubEdited[$hId]['total_revenue'])) {
                        $deltaFromPrev = round((float)($hOff[$f] ?? 0.0) - (float)($prevSavedOff[$f] ?? 0.0), 2);
                        $childDeltaSum[$f] = round((float)$childDeltaSum[$f] + $deltaFromPrev, 2);
                    }
                }
                foreach ($intHubFields as $f) {
                    if (!empty($hubEdited[$hId][$f])) {
                        $childDeltaSum[$f] += ((int)($hOff[$f] ?? 0) - (int)($prevSavedOff[$f] ?? 0));
                    }
                }
            }

            $newHubOffsets[$hId] = $hOff;
        }

        // 3. Synchronize Hub 0 ("All Operating Hubs") <-> Child Hubs <-> `kpi_metrics` current month
        if (isset($newHubOffsets[0])) {
            foreach ($floatHubFields as $f) {
                if (empty($hubEdited[0][$f]) && abs((float)$childDeltaSum[$f]) >= 0.01) {
                    $newHubOffsets[0][$f] = round((float)($newHubOffsets[0][$f] ?? 0.0) + (float)$childDeltaSum[$f], 2);
                }
            }
            foreach ($intHubFields as $f) {
                if (empty($hubEdited[0][$f]) && (int)$childDeltaSum[$f] !== 0) {
                    $newHubOffsets[0][$f] = (int)($newHubOffsets[0][$f] ?? 0) + (int)$childDeltaSum[$f];
                }
            }

            if (abs($priorMonthsOfflineDelta) >= 0.01 && empty($hubEdited[0]['total_revenue'])) {
                $newHubOffsets[0]['total_revenue'] = round((float)($newHubOffsets[0]['total_revenue'] ?? 0.0) + $priorMonthsOfflineDelta, 2);
            }
            if (!$hasState && $priorMonthsOfflineRev > 0.0 && round((float)($newHubOffsets[0]['total_revenue'] ?? 0.0), 2) <= 0.0) {
                $newHubOffsets[0]['total_revenue'] = $priorMonthsOfflineRev;
            }

            // Reconcile current-month ledger row <-> Hub 0
            $curEr = $existingLedger[$currentMonthKey] ?? null;
            $prevCurState = $savedState['monthly'][$currentMonthKey] ?? null;
            $hasCurWritten = is_array($prevCurState) && isset($prevCurState['last_written']);

            $curLedgerTotalEdited = false;
            $curLedgerTotalDelta = 0.0;
            $curLedgerDayEdited = false;
            $curLedgerDayOffset = null;
            $curLedgerWeekEdited = false;
            $curLedgerWeekOffset = null;
            if ($curEr !== null && $hasCurWritten) {
                $prevTot = round((float)($prevCurState['last_written']['total_revenue'] ?? 0.0), 2);
                $dbTot = round((float)($curEr['total_revenue'] ?? 0.0), 2);
                if (abs($dbTot - $prevTot) >= 0.01) {
                    $curLedgerTotalEdited = true;
                    $curLedgerTotalDelta = round($dbTot - $prevTot, 2);
                }
                $prevDay = round((float)($prevCurState['last_written']['day_sales'] ?? 0.0), 2);
                $dbDay = round((float)($curEr['day_sales'] ?? 0.0), 2);
                if (abs($dbDay - $prevDay) >= 0.01) {
                    $curLedgerDayEdited = true;
                    $curLedgerDayOffset = round($dbDay - round((float)$hubStats[0]['day_sales'], 2), 2);
                }
                $prevWk = round((float)($prevCurState['last_written']['week_sales'] ?? 0.0), 2);
                $dbWk = round((float)($curEr['week_sales'] ?? 0.0), 2);
                if (abs($dbWk - $prevWk) >= 0.01) {
                    $curLedgerWeekEdited = true;
                    $curLedgerWeekOffset = round($dbWk - round((float)$hubStats[0]['week_sales'], 2), 2);
                }
            }

            $hTs = strtotime((string)($existingHubRows[0]['updated_at'] ?? '')) ?: 0;
            $mTs = strtotime((string)($curEr['updated_at'] ?? '')) ?: 0;

            if ($curLedgerDayEdited && (empty($hubEdited[0]['day_sales']) || $mTs > $hTs)) {
                $newHubOffsets[0]['day_sales'] = $curLedgerDayOffset;
            }
            if ($curLedgerWeekEdited && (empty($hubEdited[0]['week_sales']) || $mTs > $hTs)) {
                $newHubOffsets[0]['week_sales'] = $curLedgerWeekOffset;
            }

            $h0MonthChanged = !empty($hubEdited[0]['month_revenue']) || !empty($hubEdited[0]['day_sales']) || !empty($hubEdited[0]['week_sales']) || abs((float)$childDeltaSum['month_revenue']) >= 0.01;
            $mCurMonthChanged = !empty($monthEdited[$currentMonthKey]['month_sales']);

            if ($mCurMonthChanged && (!$h0MonthChanged || $mTs > $hTs)) {
                $mCurDelta = (float)($monthEditDeltas[$currentMonthKey]['month_sales'] ?? 0.0);
                $newHubOffsets[0]['month_revenue'] = round((float)$newMonthOffsets[$currentMonthKey]['month_sales'], 2);
                if (empty($hubEdited[0]['total_revenue']) && !$curLedgerTotalEdited) {
                    $newHubOffsets[0]['total_revenue'] = round((float)$newHubOffsets[0]['total_revenue'] + $mCurDelta, 2);
                }
            } elseif ($h0MonthChanged) {
                $newMonthOffsets[$currentMonthKey]['month_sales'] = round((float)$newHubOffsets[0]['month_revenue'], 2);
            } elseif (!$hasState) {
                $h0MOff = round((float)($newHubOffsets[0]['month_revenue'] ?? 0.0), 2);
                $mCurMOff = round((float)($newMonthOffsets[$currentMonthKey]['month_sales'] ?? 0.0), 2);
                if ($mCurMOff > $h0MOff) {
                    $newHubOffsets[0]['month_revenue'] = $mCurMOff;
                    if (round((float)($newHubOffsets[0]['total_revenue'] ?? 0.0), 2) < $mCurMOff) {
                        $newHubOffsets[0]['total_revenue'] = round((float)$newHubOffsets[0]['total_revenue'] + ($mCurMOff - $h0MOff), 2);
                    }
                } elseif ($h0MOff > $mCurMOff) {
                    $newMonthOffsets[$currentMonthKey]['month_sales'] = $h0MOff;
                }
            }

            if ($curLedgerTotalEdited && (empty($hubEdited[0]['total_revenue']) || $mTs > $hTs)) {
                $newHubOffsets[0]['total_revenue'] = round((float)$newHubOffsets[0]['total_revenue'] + $curLedgerTotalDelta, 2);
            }
        }

        // 4. Apply finalized offsets to `$hubStats` and `$monthlyRowsMap`
        foreach ($hubStats as $hId => &$hs) {
            $hOff = $newHubOffsets[$hId] ?? [
                'total_revenue' => 0.0,
                'month_revenue' => 0.0,
                'day_sales' => 0.0,
                'week_sales' => 0.0,
                'total_bookings' => 0,
                'paid_bookings' => 0,
                'completed_trips' => 0,
            ];
            foreach ($floatHubFields as $f) {
                $hs[$f] = max(0.0, round((float)($hs[$f] ?? 0.0) + (float)($hOff[$f] ?? 0.0), 2));
            }
            foreach ($intHubFields as $f) {
                $hs[$f] = max(0, (int)($hs[$f] ?? 0) + (int)($hOff[$f] ?? 0));
            }
            $hs['offline_revenue_adjustment'] = round((float)($hOff['total_revenue'] ?? 0.0), 2);
            $hs['revenue_per_vehicle'] = ($hs['total_fleet'] ?? 0) > 0
                ? round($hs['total_revenue'] / $hs['total_fleet'], 2)
                : 0.0;
        }
        unset($hs);

        foreach ($monthlyRowsMap as $mKey => &$mr) {
            $mOff = $newMonthOffsets[$mKey] ?? ['month_sales' => 0.0, 'total_bookings' => 0, 'paid_bookings' => 0, 'completed_trips' => 0];
            $mSalesOff = round((float)($mOff['month_sales'] ?? 0.0), 2);
            $mr['offline_adjustment'] = $mSalesOff;
            $mr['month_sales'] = max(0.0, round((float)($mr['booking_month_sales'] ?? $mr['month_sales'] ?? 0.0) + $mSalesOff, 2));
            foreach ($intMonthFields as $f) {
                $mr[$f] = max(0, (int)($mr[$f] ?? 0) + (int)($mOff[$f] ?? 0));
            }
        }
        unset($mr);

        $nextState = $savedState;
        $nextState['hubs'] = is_array($nextState['hubs'] ?? null) ? $nextState['hubs'] : [];
        $nextState['monthly'] = is_array($nextState['monthly'] ?? null) ? $nextState['monthly'] : [];
        foreach ($newHubOffsets as $hId => $hOff) {
            $hKey = (string)$hId;
            if (!isset($nextState['hubs'][$hKey])) {
                $nextState['hubs'][$hKey] = [];
            }
            $nextState['hubs'][$hKey]['offsets'] = $hOff;
        }
        foreach ($newMonthOffsets as $mKey => $mOff) {
            if (!isset($nextState['monthly'][$mKey])) {
                $nextState['monthly'][$mKey] = [];
            }
            $nextState['monthly'][$mKey]['offsets'] = $mOff;
        }

        $h0Off = $newHubOffsets[0] ?? [];
        return [
            'hubStats' => $hubStats,
            'monthlyRowsMap' => $monthlyRowsMap,
            'historicalArchiveRevenue' => $historicalArchiveRevenue,
            'offlineAdjustments' => [
                'total_revenue' => round((float)($h0Off['total_revenue'] ?? 0.0), 2),
                'month_revenue' => round((float)($h0Off['month_revenue'] ?? 0.0), 2),
                'day_sales' => round((float)($h0Off['day_sales'] ?? 0.0), 2),
                'week_sales' => round((float)($h0Off['week_sales'] ?? 0.0), 2),
                'total_bookings' => (int)($h0Off['total_bookings'] ?? 0),
                'paid_bookings' => (int)($h0Off['paid_bookings'] ?? 0),
                'completed_trips' => (int)($h0Off['completed_trips'] ?? 0),
            ],
            'nextState' => $nextState,
        ];
    }

    /**
     * Authoritative sync entrypoint: recalculates directly from MySQL and persists into `kpi_metrics` and `kpi_hub_metrics`.
     */
    public static function syncMetrics(bool $persistToDatabase = true, bool $forceReset = false): array
    {
        try {
            $report = self::computeFilteredReport([], $persistSync = $persistToDatabase);
            return [
                'live' => $report['live'],
                'effective' => $report['effective'],
                'hubs' => $report['hubs'],
                'unassigned_hub' => $report['unassigned_hub'],
                'monthly' => $report['monthly'],
                'daily' => $report['daily'],
                'fleet' => $report['fleet'],
                'fleet_breakdown' => $report['fleet_breakdown'],
                'reconciliation' => $report['reconciliation'],
                'diagnostics' => $report['diagnostics'],
                'reporting_month' => $report['reporting_month'],
                'previous_month' => $report['previous_month'],
            ];
        } catch (Throwable $e) {
            error_log('[KpiService::syncMetrics Exception] ' . $e->getMessage());
            return [];
        }
    }

    public static function getMetrics(): array
    {
        return self::syncMetrics(true, false);
    }

    public static function getCachedMetrics(): array
    {
        return self::syncMetrics(false, false);
    }

    public static function reconcileTables(): void
    {
        self::syncMetrics(true, false);
    }

    // Legacy incremental signatures kept safe as direct full-sync wrappers to eliminate drift
    public static function incrementBookingMetrics(float $amount = 0.0, int $hubId = 0, string $pickupDate = ''): void
    {
        self::syncMetrics(true, false);
    }

    public static function adjustBookingMetrics(float $diffAmount = 0.0, int $hubId = 0, string $pickupDate = ''): void
    {
        self::syncMetrics(true, false);
    }

    public static function incrementBookingCount(int $hubId = 0, string $pickupDate = ''): void
    {
        self::syncMetrics(true, false);
    }

    public static function decrementBookingCount(int $hubId = 0, string $pickupDate = ''): void
    {
        self::syncMetrics(true, false);
    }

    public static function decrementBookingMetrics(float $amount = 0.0, int $hubId = 0, string $pickupDate = ''): void
    {
        self::syncMetrics(true, false);
    }

    /**
     * Provisions and safely evolves KPI tables & additive columns if missing.
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
                  `completed_trips` INT NOT NULL DEFAULT 0,
                  `scheduled_bookings` INT NOT NULL DEFAULT 0,
                  `total_fleet` INT NOT NULL DEFAULT 0,
                  `on_road_fleet` INT NOT NULL DEFAULT 0,
                  `available_fleet` INT NOT NULL DEFAULT 0,
                  `maintenance_fleet` INT NOT NULL DEFAULT 0,
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

            // Idempotent additive columns across existing Hostinger tables
            $hubCols = Database::fetchAll("SHOW COLUMNS FROM `kpi_hub_metrics`") ?: [];
            $hubColNames = array_map(static fn($r) => strtolower((string)$r['Field']), $hubCols);
            if (!in_array('completed_trips', $hubColNames, true)) {
                try { Database::execute("ALTER TABLE `kpi_hub_metrics` ADD COLUMN `completed_trips` INT NOT NULL DEFAULT 0 AFTER `active_trips`"); } catch (Throwable $_) {}
            }
            if (!in_array('scheduled_bookings', $hubColNames, true)) {
                try { Database::execute("ALTER TABLE `kpi_hub_metrics` ADD COLUMN `scheduled_bookings` INT NOT NULL DEFAULT 0 AFTER `active_trips`"); } catch (Throwable $_) {}
            }
            if (!in_array('maintenance_fleet', $hubColNames, true)) {
                try { Database::execute("ALTER TABLE `kpi_hub_metrics` ADD COLUMN `maintenance_fleet` INT NOT NULL DEFAULT 0 AFTER `available_fleet`"); } catch (Throwable $_) {}
            }

            $bkCols = Database::fetchAll("SHOW COLUMNS FROM `bookings`") ?: [];
            $bkColNames = array_map(static fn($r) => strtolower((string)$r['Field']), $bkCols);
            if (!in_array('monthly_revenue_split', $bkColNames, true)) {
                try {
                    Database::execute("ALTER TABLE `bookings` ADD COLUMN `monthly_revenue_split` JSON NULL AFTER `security_deposit`");
                } catch (Throwable $_) {
                    try { Database::execute("ALTER TABLE `bookings` ADD COLUMN `monthly_revenue_split` TEXT NULL AFTER `security_deposit`"); } catch (Throwable $__) {}
                }
            }
        } catch (Throwable $e) {
            error_log('[KpiService::ensureTables] ' . $e->getMessage());
        }
    }
}
