<?php
/**
 * api/admin/export.php
 * GET /api/admin/export - Authoritative, sorted, filterable export across Admin, Manager & Executive panels.
 * Supports:
 * - format=json|csv
 * - from / to (YYYY-MM-DD rental date overlap filter)
 * - status (all, active, completed, confirmed, pending_payment, pending_verification, cancelled)
 * - hub_id (optional hub scoping)
 * - search (optional query across ref, customer, vehicle)
 * - sort (desc = newest date first [default], asc = oldest date first)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/KpiService.php';

$user = Auth::requireRole('admin', 'manager', 'executive', 'accountant');

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// Enforce hub assignment for non-admin staff when configured
$assignedHub = 0;
try {
    $assignedRow = Database::fetchOne(
        "SELECT hub_id FROM admin_users WHERE firebase_uid = ? LIMIT 1",
        [$user['firebase_uid'] ?? '']
    );
    $assignedHub = (int)($assignedRow['hub_id'] ?? 0);
} catch (Throwable $_) {}

$role = strtolower((string)($user['role'] ?? ''));
$isSuperAdmin = in_array($role, ['admin', 'super_admin'], true);

$format = strtolower(trim((string)($_GET['format'] ?? 'json')));
if (isset($_GET['csv'])) {
    $format = 'csv';
}

function exportFirstNonEmpty(...$candidates)
{
    foreach ($candidates as $val) {
        if ($val !== null && trim((string)$val) !== '') {
            return $val;
        }
    }
    return null;
}

function exportFormatNumOrEmpty($val)
{
    if ($val === null || trim((string)$val) === '') {
        return '';
    }
    return is_numeric($val) ? (float)$val : trim((string)$val);
}

function exportSafeTs($val): int
{
    if ($val === null || trim((string)$val) === '') {
        return 0;
    }
    $clean = trim((string)$val);
    if ($clean === '0000-00-00' || $clean === '0000-00-00 00:00:00') {
        return 0;
    }
    // Strip ordinal suffixes (e.g., 19th Nov 2026) and convert DD/MM/YYYY to YYYY-MM-DD for strtotime
    $clean = (string)preg_replace('/(\d+)(st|nd|rd|th)\b/i', '$1', $clean);
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/', $clean, $m)) {
        $clean = $m[3] . '-' . $m[2] . '-' . $m[1] . $m[4];
    }
    $ts = strtotime($clean);
    return ($ts !== false && $ts > 0) ? (int)$ts : 0;
}

function exportFormatDateTime($val): string
{
    if ($val === null || trim((string)$val) === '') {
        return '';
    }
    $ts = exportSafeTs($val);
    if ($ts <= 0) {
        return trim((string)$val);
    }
    return date('H:i:s', $ts) === '00:00:00' ? date('Y-m-d', $ts) : date('Y-m-d H:i', $ts);
}

$fromDateRaw = trim((string)($_GET['from'] ?? $_GET['from_date'] ?? $_GET['startDate'] ?? ''));
$toDateRaw = trim((string)($_GET['to'] ?? $_GET['to_date'] ?? $_GET['endDate'] ?? ''));
$fromTsArg = exportSafeTs($fromDateRaw);
$toTsArg = exportSafeTs($toDateRaw);
$fromYmd = $fromTsArg > 0 ? date('Y-m-d', $fromTsArg) : '';
$toYmd = $toTsArg > 0 ? date('Y-m-d', $toTsArg) : '';
if ($fromYmd !== '' && $toYmd !== '' && $fromYmd > $toYmd) {
    [$fromYmd, $toYmd] = [$toYmd, $fromYmd];
}

$statusFilter = strtolower(trim((string)($_GET['status'] ?? 'all')));
if ($statusFilter === '') {
    $statusFilter = 'all';
}
$search = strtolower(trim((string)($_GET['search'] ?? $_GET['q'] ?? '')));
$requestedHubId = isset($_GET['hub_id']) && $_GET['hub_id'] !== '' ? (int)$_GET['hub_id'] : 0;
$hubId = (!$isSuperAdmin && $assignedHub > 0) ? $assignedHub : $requestedHubId;
$sortOrder = strtolower(trim((string)($_GET['sort'] ?? 'desc'))) === 'asc' ? 'asc' : 'desc';

// 1. Fetch Hubs Lookup
$hubNames = [
    0 => 'All Operating Hubs',
    1 => 'Gavson Business Park, Ghansoli',
    2 => 'Kandivali Hub, Mumbai',
];
try {
    $hubList = Database::fetchAll("SELECT id, name FROM hubs ORDER BY id ASC") ?: [];
    foreach ($hubList as $hr) {
        $hubNames[(int)$hr['id']] = (string)$hr['name'];
    }
} catch (Throwable $_) {}

// 2. Fetch Payments & Build Booking Payment Aggregates
$rawPayments = Database::fetchAll(
    "SELECT payment_id, booking_id, firebase_uid, amount, currency, method, utr, payment_ref, status, refund_amount, refund_reason, verified_by, verified_at, created_at
     FROM payments
     ORDER BY COALESCE(verified_at, created_at) DESC, id DESC"
) ?: [];

$paymentsByBooking = [];
$paymentsExport = [];
foreach ($rawPayments as $p) {
    $bKey = strtoupper(ltrim(trim((string)($p['booking_id'] ?? '')), '#'));
    $pStat = strtolower(trim((string)($p['status'] ?? '')));
    if ($bKey !== '') {
        if (!isset($paymentsByBooking[$bKey])) {
            $paymentsByBooking[$bKey] = [
                'verified_paid' => 0.0,
                'refund_total' => 0.0,
                'latest_ref' => '',
                'latest_method' => '',
            ];
        }
        if (in_array($pStat, ['verified', 'approved', 'paid'], true)) {
            $paymentsByBooking[$bKey]['verified_paid'] += (float)($p['amount'] ?? 0);
        }
        $paymentsByBooking[$bKey]['refund_total'] += (float)($p['refund_amount'] ?? 0);
        if ($paymentsByBooking[$bKey]['latest_ref'] === '' && !empty($p['utr'] ?: $p['payment_ref'])) {
            $paymentsByBooking[$bKey]['latest_ref'] = (string)($p['utr'] ?: $p['payment_ref']);
        }
        if ($paymentsByBooking[$bKey]['latest_method'] === '' && !empty($p['method'])) {
            $paymentsByBooking[$bKey]['latest_method'] = (string)$p['method'];
        }
    }

    $paymentsExport[] = [
        'Payment ID' => $p['payment_id'] ?? '',
        'Booking #' => $p['booking_id'] ?? '',
        'Amount (₹)' => round((float)($p['amount'] ?? 0), 2),
        'Refund Amount (₹)' => round((float)($p['refund_amount'] ?? 0), 2),
        'Method' => strtoupper((string)($p['method'] ?? '')),
        'UTR / Ref' => $p['utr'] ?: ($p['payment_ref'] ?? ''),
        'Status' => strtoupper($pStat),
        'Verified By' => $p['verified_by'] ?? '',
        'Verified At' => exportFormatDateTime($p['verified_at'] ?? ''),
        'Created At' => exportFormatDateTime($p['created_at'] ?? ''),
    ];
}

// 3. Fetch Users, Vehicles, Coupons, KYC Verifications, Authoritative KPI Tables
$rawUsers = Database::fetchAll(
    "SELECT id, firebase_uid, email, name, phone, age, role, status, license_status, aadhar_status, pan_status, created_at
     FROM users
     ORDER BY created_at DESC, id DESC"
) ?: [];

$usersExport = array_map(static function ($u) {
    return [
        'User ID' => (int)($u['id'] ?? 0),
        'Name' => $u['name'] ?? '',
        'Email' => $u['email'] ?? '',
        'Phone' => $u['phone'] ?? '',
        'Age' => $u['age'] ?? '',
        'Role' => strtoupper((string)($u['role'] ?? 'customer')),
        'Account Status' => strtoupper((string)($u['status'] ?? 'active')),
        'License Status' => strtoupper((string)($u['license_status'] ?? 'not_submitted')),
        'Aadhaar Status' => strtoupper((string)($u['aadhar_status'] ?? 'not_submitted')),
        'PAN Status' => strtoupper((string)($u['pan_status'] ?? 'not_submitted')),
        'Registered At' => exportFormatDateTime($u['created_at'] ?? ''),
    ];
}, $rawUsers);

$rawVehicles = Database::fetchAll(
    "SELECT v.*
     FROM vehicles v
     WHERE COALESCE(v.status, 'available') != 'removed'
     ORDER BY COALESCE(v.hub_id, 1) ASC, v.brand ASC, v.model ASC, v.id ASC"
) ?: [];

$couponsRaw = Database::fetchAll(
    "SELECT code, discount_type, discount_value, min_order, active, status, used_count, max_uses, expires_at
     FROM coupons
     ORDER BY active DESC, id DESC"
) ?: [];

$couponsExport = array_map(static function ($c) {
    return [
        'Code' => $c['code'] ?? '',
        'Discount Type' => strtoupper((string)($c['discount_type'] ?? 'flat')),
        'Discount Value' => round((float)($c['discount_value'] ?? 0), 2),
        'Min Order (₹)' => round((float)($c['min_order'] ?? 0), 2),
        'Active' => !empty($c['active']) ? 'YES' : 'NO',
        'Status' => strtoupper((string)($c['status'] ?? 'active')),
        'Used Count' => (int)($c['used_count'] ?? 0),
        'Max Uses' => $c['max_uses'] ?? 'Unlimited',
        'Expires At' => exportFormatDateTime($c['expires_at'] ?? ''),
    ];
}, $couponsRaw);

$verificationRaw = Database::fetchAll(
    "SELECT verification_id, firebase_uid, full_name, phone, license_number, license_status, aadhar_number, aadhar_status, pan_number, pan_status, overall_status, verified_by, verified_at, created_at
     FROM verification
     ORDER BY COALESCE(verified_at, created_at) DESC, id DESC"
) ?: [];

$verificationExport = array_map(static function ($v) {
    return [
        'Verification ID' => $v['verification_id'] ?? '',
        'Customer Name' => $v['full_name'] ?? '',
        'Phone' => $v['phone'] ?? '',
        'License Number' => $v['license_number'] ?? '',
        'License Status' => strtoupper((string)($v['license_status'] ?? '')),
        'Aadhaar Number' => $v['aadhar_number'] ?? '',
        'Aadhaar Status' => strtoupper((string)($v['aadhar_status'] ?? '')),
        'PAN Number' => $v['pan_number'] ?? '',
        'PAN Status' => strtoupper((string)($v['pan_status'] ?? '')),
        'Overall Status' => strtoupper((string)($v['overall_status'] ?? '')),
        'Verified By' => $v['verified_by'] ?? '',
        'Verified At' => exportFormatDateTime($v['verified_at'] ?? ''),
    ];
}, $verificationRaw);

$kpiHubRows = [];
try {
    $kpiHubRows = Database::fetchAll("SELECT * FROM `kpi_hub_metrics` ORDER BY `hub_id` ASC") ?: [];
} catch (Throwable $_) {}

$kpiMonthlyRows = [];
try {
    $kpiMonthlyRows = Database::fetchAll("SELECT * FROM `kpi_metrics` ORDER BY `metric_date` ASC") ?: [];
} catch (Throwable $_) {}

// 4. Fetch & Deduplicate All Bookings with Joined Customer, Vehicle, Hub & Live Status
$rawBookingsQuery = Database::fetchAll(
    "SELECT b.*,
            COALESCE(NULLIF(b.user_name, ''), NULLIF(u.name, ''), u.email, 'Customer') AS resolved_user_name,
            COALESCE(NULLIF(b.user_email, ''), NULLIF(u.email, ''), '') AS resolved_user_email,
            COALESCE(NULLIF(b.user_phone, ''), NULLIF(u.phone, ''), '') AS resolved_user_phone,
            COALESCE(NULLIF(b.vehicle_name, ''), NULLIF(CONCAT(TRIM(COALESCE(v.brand, '')), ' ', TRIM(COALESCE(v.model, ''))), ''), 'Vehicle') AS resolved_vehicle_name,
            v.reg_no AS v_reg_no,
            v.hub_id AS v_hub_id,
            v.acquisition_type AS v_acq_type,
            v.owner_name AS v_owner_name
     FROM bookings b
     LEFT JOIN users u ON u.firebase_uid = b.firebase_uid
     LEFT JOIN vehicles v ON (
         (b.vehicle_id IS NOT NULL AND b.vehicle_id > 0 AND v.id = b.vehicle_id)
         OR (
             b.vehicle_reg IS NOT NULL
             AND TRIM(b.vehicle_reg) <> ''
             AND b.vehicle_reg <> 'TBD'
             AND UPPER(v.reg_no) = UPPER(TRIM(b.vehicle_reg))
             AND COALESCE(v.status, 'available') != 'removed'
         )
     )
     ORDER BY COALESCE(b.updated_at, b.created_at) DESC, b.id DESC"
) ?: [];

$seenBookings = [];
$dedupedBookings = [];
foreach ($rawBookingsQuery as $b) {
    $refRaw = exportFirstNonEmpty($b['booking_number'] ?? null, $b['booking_id'] ?? null, $b['id'] ?? null, '');
    $ref = strtoupper(ltrim(trim((string)$refRaw), '#'));
    if ($ref !== '' && isset($seenBookings[$ref])) {
        continue;
    }
    if ($ref !== '') {
        $seenBookings[$ref] = true;
    }
    $dedupedBookings[] = $b;
}

$nowTs = time();
$hasDateFilter = ($fromYmd !== '' || $toYmd !== '');

$onRoadVehicleKeys = [];
$vehiclePerfStats = [];
$filteredRowsWithSortKey = [];
$dailyLedger = [];
$monthlyFromDaily = [];

// Aggregate counters across exported dataset
$summaryStats = [
    'exported_bookings' => 0,
    'eligible_paid_bookings' => 0,
    'active_trips' => 0,
    'completed_trips' => 0,
    'confirmed_upcoming_trips' => 0,
    'pending_trips' => 0,
    'cancelled_bookings' => 0,
    'total_booked_days' => 0,
    'window_overlap_days' => 0,
    'gross_booking_amount' => 0.0,
    'net_rental_revenue' => 0.0,
    'window_prorated_revenue' => 0.0,
    'security_deposits' => 0.0,
    'amount_paid' => 0.0,
    'remaining_balance' => 0.0,
    'total_distance_km' => 0.0,
    'total_fastag_used' => 0.0,
];

foreach ($dedupedBookings as $b) {
    $bHubId = (int)($b['pickup_hub_id'] ?: ($b['drop_hub_id'] ?: ($b['v_hub_id'] ?? 1)));
    if ($bHubId <= 0) {
        $bHubId = 1;
    }
    if ($hubId > 0 && $bHubId !== $hubId) {
        $dropH = (int)($b['drop_hub_id'] ?? 0);
        if ($dropH !== $hubId) {
            continue;
        }
    }

    $bStat = strtolower(trim((string)exportFirstNonEmpty($b['status'] ?? null, $b['booking_status'] ?? null, '')));
    $pStat = strtolower(trim((string)exportFirstNonEmpty($b['payment_status'] ?? null, '')));
    $isCancelled = in_array($bStat, ['cancelled', 'rejected'], true)
        || in_array($pStat, ['cancelled', 'rejected', 'refunded'], true);

    $insp = [];
    if (!empty($b['return_inspection'])) {
        $insp = is_string($b['return_inspection']) ? json_decode($b['return_inspection'], true) : $b['return_inspection'];
        if (!is_array($insp)) {
            $insp = [];
        }
    }

    // Resolve Odometer and FASTag reliably (ignore empty strings)
    $startOdoRaw = exportFirstNonEmpty(
        $b['start_odometer'] ?? null,
        $b['pickup_odometer'] ?? null,
        $insp['pickupOdometer'] ?? null,
        $insp['startOdometer'] ?? null,
        $insp['odometerStart'] ?? null,
        $insp['startOdo'] ?? null
    );
    $endOdoRaw = exportFirstNonEmpty(
        $b['end_odometer'] ?? null,
        $b['return_odometer'] ?? null,
        $insp['returnOdometer'] ?? null,
        $insp['endOdometer'] ?? null,
        $insp['odometerEnd'] ?? null,
        $insp['endOdo'] ?? null
    );
    $startFastagRaw = exportFirstNonEmpty(
        $b['start_fastag'] ?? null,
        $b['pickup_fastag'] ?? null,
        $insp['pickupFastagBalance'] ?? null,
        $insp['startFastag'] ?? null,
        $insp['fastagStart'] ?? null,
        $insp['pickupFastag'] ?? null
    );
    $returnFastagRaw = exportFirstNonEmpty(
        $b['return_fastag'] ?? null,
        $b['return_fastag_balance'] ?? null,
        $insp['returnFastagBalance'] ?? null,
        $insp['returnFastag'] ?? null,
        $insp['fastagReturn'] ?? null
    );

    $startOdo = exportFormatNumOrEmpty($startOdoRaw);
    $endOdo = exportFormatNumOrEmpty($endOdoRaw);
    $startFastag = exportFormatNumOrEmpty($startFastagRaw);
    $returnFastag = exportFormatNumOrEmpty($returnFastagRaw);

    $distanceKm = (is_numeric($startOdo) && is_numeric($endOdo) && (float)$endOdo >= (float)$startOdo)
        ? round((float)$endOdo - (float)$startOdo, 2)
        : '';
    $fastagUsed = (is_numeric($startFastag) && is_numeric($returnFastag) && (float)$startFastag >= (float)$returnFastag)
        ? round((float)$startFastag - (float)$returnFastag, 2)
        : '';

    // Resolve authoritative Trip Active vs Completed classification (matching KpiService.php)
    $hasReturned = !$isCancelled && (
        $endOdo !== ''
        || !empty($b['completed_at'])
        || !empty($b['returned_at'])
        || in_array($bStat, ['completed', 'returned'], true)
        || !empty($insp['returnAt'])
        || !empty($insp['returnedAt'])
        || (isset($insp['returnStatus']) && strtolower((string)$insp['returnStatus']) === 'returned')
    );

    $rawPickupTs = exportSafeTs($b['pickup_date'] ?? null);
    $rawCreatedTs = exportSafeTs($b['created_at'] ?? null);
    $rawDropTs = exportSafeTs($b['drop_date'] ?? null);
    $startTs = $rawPickupTs ?: ($rawCreatedTs ?: $nowTs);
    $startYmd = date('Y-m-d', $startTs);

    $rawDays = (int)($b['days'] ?? 0);
    $diffDays = ($rawPickupTs > 0 && $rawDropTs > $rawPickupTs)
        ? max(1, (int)ceil(($rawDropTs - $rawPickupTs) / 86400))
        : 0;
    if ($rawDays <= 0) {
        $bookedDays = max(1, $diffDays);
    } elseif ($diffDays > 0 && (($rawDays === 1 && $diffDays > 1) || abs($diffDays - $rawDays) > 1)) {
        $bookedDays = $diffDays;
    } else {
        $bookedDays = max(1, $rawDays);
    }

    $endTs = $startTs + ($bookedDays * 86400);
    $dropYmd = $rawDropTs > 0
        ? date('Y-m-d', $rawDropTs)
        : date('Y-m-d', strtotime("$startYmd +" . max(0, $bookedDays - 1) . " days"));

    $isPaid = in_array($pStat, ['paid', 'advance_paid', 'verified'], true)
        || in_array($bStat, ['confirmed', 'active', 'completed', 'returned', 'in_trip', 'started', 'ongoing', 'paid'], true);

    $isActiveTrip = false;
    if (!$isCancelled && !$hasReturned) {
        $hasPhysicalPickup = !empty($b['pickup_at'])
            || $startOdo !== ''
            || in_array($bStat, ['in_trip', 'ongoing'], true)
            || (!empty($insp['pickupStatus']) && $insp['pickupStatus'] === 'picked_up');

        if (in_array($bStat, ['in_trip', 'ongoing'], true)) {
            $isActiveTrip = true;
        } elseif ($hasPhysicalPickup) {
            if (in_array($bStat, ['active', 'started', 'ongoing', 'in_trip'], true)) {
                $isActiveTrip = true;
            } else {
                $isActiveTrip = ($endTs <= 0 || $nowTs <= ($endTs + 7 * 86400));
            }
        } elseif ($isPaid || in_array($bStat, ['active', 'started', 'confirmed', 'approved'], true)) {
            $isActiveTrip = ($startTs <= 0 || $nowTs >= $startTs) && ($endTs <= 0 || $nowTs <= ($endTs + 86400));
        }
    }

    $vRegUpper = strtoupper(trim((string)exportFirstNonEmpty($b['vehicle_reg'] ?? null, $b['v_reg_no'] ?? null, '')));
    if ($isActiveTrip && $vRegUpper !== '' && $vRegUpper !== 'TBD') {
        $onRoadVehicleKeys[$vRegUpper] = true;
    }

    // Operational label
    if ($isCancelled) {
        $opStatusLabel = 'CANCELLED';
    } elseif ($hasReturned) {
        $opStatusLabel = 'COMPLETED';
    } elseif ($isActiveTrip) {
        $opStatusLabel = 'ACTIVE (ON TRIP)';
    } elseif ($pStat === 'pending_verification' || $bStat === 'pending_verification') {
        $opStatusLabel = 'PENDING VERIFICATION';
    } elseif ($pStat === 'pending_payment' || $bStat === 'pending_payment') {
        $opStatusLabel = 'PENDING PAYMENT';
    } else {
        $opStatusLabel = 'CONFIRMED / UPCOMING';
    }

    // Amounts resolution (matching KpiService + payments table)
    $cleanRef = strtoupper(ltrim(trim((string)exportFirstNonEmpty($b['booking_number'] ?? null, $b['booking_id'] ?? null, $b['id'] ?? null, '')), '#'));
    $payAgg = $paymentsByBooking[$cleanRef] ?? null;

    $securityDeposit = round((float)($b['security_deposit'] ?? 0.0), 2);
    $couponDiscount = round((float)($b['coupon_discount'] ?? 0.0), 2);
    $refundAmt = round((float)exportFirstNonEmpty(
        (($b['refund_amount'] ?? 0) > 0 ? $b['refund_amount'] : null),
        ($payAgg && $payAgg['refund_total'] > 0 ? $payAgg['refund_total'] : null),
        0.0
    ), 2);

    $bWithRefund = $b;
    $bWithRefund['refund_amount'] = $refundAmt;
    $bWithRefund['days'] = $bookedDays;
    $bWithRefund['pickup_date'] = date('Y-m-d H:i:s', $startTs);
    $bWithRefund['drop_date'] = $rawDropTs > 0 ? date('Y-m-d H:i:s', $rawDropTs) : ($b['drop_date'] ?? '');

    $netRentalRaw = KpiService::getBookingNetRental($bWithRefund);
    $netRental = $isCancelled ? 0.0 : round(max(0.0, $netRentalRaw - $refundAmt), 2);

    $finalAmt = (float)($b['final_amount'] ?? 0.0);
    $totalAmt = (float)($b['total_amount'] ?? 0.0);
    $grossTotal = $finalAmt > 0 ? $finalAmt : ($totalAmt > 0 ? $totalAmt : round($netRental + $securityDeposit, 2));
    if ($grossTotal < $netRental) {
        $grossTotal = round($netRental + $securityDeposit, 2);
    }
    $grossTotal = round($grossTotal, 2);

    $baseRental = round((float)exportFirstNonEmpty(
        (($b['base_amount'] ?? 0) > 0 ? $b['base_amount'] : null),
        $netRental + $couponDiscount
    ), 2);

    // Paid amount resolution
    $rawPaidCol = (float)($b['payment_amount_paid'] ?? 0.0);
    $advCol = (float)($b['advance_amount'] ?? 0.0);
    $verifiedPaySum = $payAgg ? (float)$payAgg['verified_paid'] : 0.0;
    if ($verifiedPaySum > 0) {
        $amountPaid = round($verifiedPaySum, 2);
    } elseif ($rawPaidCol > 0) {
        $amountPaid = round($rawPaidCol, 2);
    } elseif (in_array($pStat, ['paid', 'verified'], true) && !$isCancelled) {
        $amountPaid = $grossTotal;
    } elseif ($advCol > 0) {
        $amountPaid = round($advCol, 2);
    } else {
        $amountPaid = 0.0;
    }

    $rawRemBal = (float)($b['remaining_balance'] ?? 0.0);
    $rawRemAmt = (float)($b['remaining_amount'] ?? 0.0);
    if ($isCancelled || in_array($pStat, ['paid', 'verified'], true)) {
        $remainingBalance = 0.0;
    } elseif ($rawRemBal > 0) {
        $remainingBalance = round($rawRemBal, 2);
    } elseif ($rawRemAmt > 0) {
        $remainingBalance = round($rawRemAmt, 2);
    } else {
        $remainingBalance = round(max(0.0, $grossTotal - $amountPaid), 2);
    }

    // Track per-vehicle performance across all non-cancelled hub bookings
    if (!$isCancelled && $vRegUpper !== '' && $vRegUpper !== 'TBD') {
        if (!isset($vehiclePerfStats[$vRegUpper])) {
            $vehiclePerfStats[$vRegUpper] = [
                'bookings' => 0,
                'completed' => 0,
                'active' => 0,
                'booked_days' => 0,
                'net_revenue' => 0.0,
                'distance_km' => 0.0,
                'fastag_used' => 0.0,
            ];
        }
        $vehiclePerfStats[$vRegUpper]['bookings']++;
        if ($hasReturned) $vehiclePerfStats[$vRegUpper]['completed']++;
        if ($isActiveTrip) $vehiclePerfStats[$vRegUpper]['active']++;
        $vehiclePerfStats[$vRegUpper]['booked_days'] += $bookedDays;
        if ($isPaid || $isActiveTrip) {
            $vehiclePerfStats[$vRegUpper]['net_revenue'] += $netRental;
        }
        if (is_numeric($distanceKm)) $vehiclePerfStats[$vRegUpper]['distance_km'] += (float)$distanceKm;
        if (is_numeric($fastagUsed)) $vehiclePerfStats[$vRegUpper]['fastag_used'] += (float)$fastagUsed;
    }

    // Compute daily & monthly revenue bifurcation for eligible bookings
    $isRevenueEligible = !$isCancelled && ($isPaid || $isActiveTrip);
    $split = ($isRevenueEligible && $netRental > 0) ? KpiService::calculateMonthlyRevenueSplit($bWithRefund) : [];
    $dailyRate = $bookedDays > 0 && !$isCancelled ? round($netRental / $bookedDays, 2) : 0.0;
    $bifurcationParts = [];
    foreach ($split as $mKeySplit => $mSplitInfo) {
        $bifurcationParts[] = substr((string)$mKeySplit, 0, 7) . ' (' . (int)$mSplitInfo['days'] . 'd): ₹' . number_format((float)$mSplitInfo['amount'], 2);
    }
    $bifurcationLabel = implode(' | ', $bifurcationParts);

    // Apply Selected Date Range Filter (overlap check + exact daily proration)
    $overlapDays = $bookedDays;
    $windowProratedRev = $isRevenueEligible ? $netRental : 0.0;
    if ($hasDateFilter) {
        $lastActiveDayYmd = date('Y-m-d', strtotime("$startYmd +" . max(0, $bookedDays - 1) . " days"));
        if ($fromYmd !== '' && $lastActiveDayYmd < $fromYmd) {
            continue;
        }
        if ($toYmd !== '' && $startYmd > $toYmd) {
            continue;
        }

        $overlapDays = 0;
        $windowProratedRev = 0.0;
        if (!empty($split)) {
            foreach ($split as $mSplit) {
                $breakdown = $mSplit['daily_breakdown'] ?? [];
                foreach ($breakdown as $dayStr => $dayPrice) {
                    if ($fromYmd !== '' && $dayStr < $fromYmd) continue;
                    if ($toYmd !== '' && $dayStr > $toYmd) continue;
                    $overlapDays++;
                    $windowProratedRev += (float)$dayPrice;
                }
            }
        } else {
            for ($i = 0; $i < $bookedDays; $i++) {
                $dayStr = date('Y-m-d', strtotime("$startYmd +$i days"));
                if ($fromYmd !== '' && $dayStr < $fromYmd) continue;
                if ($toYmd !== '' && $dayStr > $toYmd) continue;
                $overlapDays++;
            }
        }
        if ($overlapDays === 0) {
            continue;
        }
        $windowProratedRev = round($windowProratedRev, 2);
    }

    // Apply Status Filter
    if ($statusFilter !== 'all') {
        $matchesStatus = false;
        if ($statusFilter === 'active' || $statusFilter === 'in_trip' || $statusFilter === 'ongoing') {
            $matchesStatus = $isActiveTrip;
        } elseif ($statusFilter === 'completed' || $statusFilter === 'returned') {
            $matchesStatus = $hasReturned;
        } elseif ($statusFilter === 'cancelled' || $statusFilter === 'rejected') {
            $matchesStatus = $isCancelled;
        } elseif ($statusFilter === 'confirmed') {
            $matchesStatus = !$isCancelled && ($isPaid || $bStat === 'confirmed');
        } elseif ($statusFilter === 'pending_payment' || $statusFilter === 'pending_verification') {
            $matchesStatus = ($bStat === $statusFilter || $pStat === $statusFilter);
        } else {
            $matchesStatus = ($bStat === $statusFilter || $pStat === $statusFilter);
        }
        if (!$matchesStatus) {
            continue;
        }
    }

    // Apply Search Filter
    $displayRef = (string)exportFirstNonEmpty($b['booking_number'] ?? null, $b['booking_id'] ?? null, ('#' . ($b['id'] ?? '')));
    $custName = (string)($b['resolved_user_name'] ?? $b['user_name'] ?? 'Customer');
    $custPhone = (string)($b['resolved_user_phone'] ?? $b['user_phone'] ?? '');
    $custEmail = (string)($b['resolved_user_email'] ?? $b['user_email'] ?? '');
    $vehName = (string)($b['resolved_vehicle_name'] ?? $b['vehicle_name'] ?? 'Vehicle');
    $hubLabel = $hubNames[$bHubId] ?? ($b['location'] ?? 'Gavson Business Park, Ghansoli');

    if ($search !== '') {
        $hay = strtolower("$displayRef $custName $custPhone $custEmail $vehName $vRegUpper $hubLabel $opStatusLabel");
        if (!str_contains($hay, $search)) {
            continue;
        }
    }

    // Accumulate Daily KPI Bifurcation & Monthly Rollup for all matching non-cancelled bookings
    if (!$isCancelled) {
        if (!empty($split)) {
            foreach ($split as $mSplit) {
                $breakdown = $mSplit['daily_breakdown'] ?? [];
                foreach ($breakdown as $dayStr => $dayPrice) {
                    if ($hasDateFilter) {
                        if ($fromYmd !== '' && $dayStr < $fromYmd) continue;
                        if ($toYmd !== '' && $dayStr > $toYmd) continue;
                    }
                    $mKeyDay = substr($dayStr, 0, 7) . '-01';
                    if (!isset($dailyLedger[$dayStr])) {
                        $dailyLedger[$dayStr] = [
                            'date' => $dayStr,
                            'month' => substr($dayStr, 0, 7),
                            'billed_days' => 0,
                            'scheduled_days' => 0,
                            'pickups' => 0,
                            'returns' => 0,
                            'revenue' => 0.0,
                            'refs' => [],
                            'vehicles' => [],
                        ];
                    }
                    $dailyLedger[$dayStr]['billed_days']++;
                    $dailyLedger[$dayStr]['scheduled_days']++;
                    $dailyLedger[$dayStr]['revenue'] = round($dailyLedger[$dayStr]['revenue'] + (float)$dayPrice, 2);
                    if ($dayStr === $startYmd) $dailyLedger[$dayStr]['pickups']++;
                    if ($dayStr === $dropYmd) $dailyLedger[$dayStr]['returns']++;
                    $dailyLedger[$dayStr]['refs'][$displayRef] = true;
                    $dailyLedger[$dayStr]['vehicles'][$vehName . ($vRegUpper ? " ($vRegUpper)" : '')] = true;

                    if (!isset($monthlyFromDaily[$mKeyDay])) {
                        $monthlyFromDaily[$mKeyDay] = ['billed_days' => 0, 'scheduled_days' => 0, 'revenue' => 0.0];
                    }
                    $monthlyFromDaily[$mKeyDay]['billed_days']++;
                    $monthlyFromDaily[$mKeyDay]['scheduled_days']++;
                    $monthlyFromDaily[$mKeyDay]['revenue'] = round($monthlyFromDaily[$mKeyDay]['revenue'] + (float)$dayPrice, 2);
                }
            }
        } else {
            for ($i = 0; $i < $bookedDays; $i++) {
                $dayStr = date('Y-m-d', strtotime("$startYmd +$i days"));
                if ($hasDateFilter) {
                    if ($fromYmd !== '' && $dayStr < $fromYmd) continue;
                    if ($toYmd !== '' && $dayStr > $toYmd) continue;
                }
                $mKeyDay = substr($dayStr, 0, 7) . '-01';
                if (!isset($dailyLedger[$dayStr])) {
                    $dailyLedger[$dayStr] = [
                        'date' => $dayStr,
                        'month' => substr($dayStr, 0, 7),
                        'billed_days' => 0,
                        'scheduled_days' => 0,
                        'pickups' => 0,
                        'returns' => 0,
                        'revenue' => 0.0,
                        'refs' => [],
                        'vehicles' => [],
                    ];
                }
                $dailyLedger[$dayStr]['scheduled_days']++;
                if ($dayStr === $startYmd) $dailyLedger[$dayStr]['pickups']++;
                if ($dayStr === $dropYmd) $dailyLedger[$dayStr]['returns']++;
                $dailyLedger[$dayStr]['refs'][$displayRef] = true;
                $dailyLedger[$dayStr]['vehicles'][$vehName . ($vRegUpper ? " ($vRegUpper)" : '')] = true;

                if (!isset($monthlyFromDaily[$mKeyDay])) {
                    $monthlyFromDaily[$mKeyDay] = ['billed_days' => 0, 'scheduled_days' => 0, 'revenue' => 0.0];
                }
                $monthlyFromDaily[$mKeyDay]['scheduled_days']++;
            }
        }
    }

    // Update Summary Counters
    $summaryStats['exported_bookings']++;
    if ($isCancelled) {
        $summaryStats['cancelled_bookings']++;
    } else {
        if ($isRevenueEligible) {
            $summaryStats['eligible_paid_bookings']++;
            $summaryStats['net_rental_revenue'] = round($summaryStats['net_rental_revenue'] + $netRental, 2);
            $summaryStats['window_prorated_revenue'] = round($summaryStats['window_prorated_revenue'] + $windowProratedRev, 2);
        }
        if ($hasReturned) {
            $summaryStats['completed_trips']++;
        } elseif ($isActiveTrip) {
            $summaryStats['active_trips']++;
        } elseif (in_array($pStat, ['pending_payment', 'pending_verification'], true) || in_array($bStat, ['pending_payment', 'pending_verification'], true)) {
            $summaryStats['pending_trips']++;
        } else {
            $summaryStats['confirmed_upcoming_trips']++;
        }
        $summaryStats['total_booked_days'] += $bookedDays;
        $summaryStats['window_overlap_days'] += $overlapDays;
        $summaryStats['gross_booking_amount'] = round($summaryStats['gross_booking_amount'] + $grossTotal, 2);
        $summaryStats['security_deposits'] = round($summaryStats['security_deposits'] + $securityDeposit, 2);
        $summaryStats['amount_paid'] = round($summaryStats['amount_paid'] + $amountPaid, 2);
        $summaryStats['remaining_balance'] = round($summaryStats['remaining_balance'] + $remainingBalance, 2);
        if (is_numeric($distanceKm)) {
            $summaryStats['total_distance_km'] = round($summaryStats['total_distance_km'] + (float)$distanceKm, 2);
        }
        if (is_numeric($fastagUsed)) {
            $summaryStats['total_fastag_used'] = round($summaryStats['total_fastag_used'] + (float)$fastagUsed, 2);
        }
    }

    $pickupFmt = exportFormatDateTime(exportFirstNonEmpty($b['pickup_date'] ?? null, $startYmd));
    $dropFmt = exportFormatDateTime(exportFirstNonEmpty($b['drop_date'] ?? null, $dropYmd));
    $createdFmt = exportFormatDateTime($b['created_at'] ?? '');
    $sortPrimaryTs = $startTs;
    $sortSecondaryTs = $rawCreatedTs;

    $row = [
        'Booking #' => $displayRef,
        'Hub' => $hubLabel,
        'Customer Name' => $custName,
        'Customer Phone' => $custPhone,
        'Customer Email' => $custEmail,
        'Vehicle Name' => $vehName,
        'Vehicle Reg' => $vRegUpper,
        'Pickup Date' => $pickupFmt,
        'Drop Date' => $dropFmt,
        'Booked Days' => $bookedDays,
    ];
    if ($hasDateFilter) {
        $row['Days in Selected Dates'] = $overlapDays;
    }
    $row['Duration'] = (string)exportFirstNonEmpty($b['duration'] ?? null, ($bookedDays . ($bookedDays === 1 ? ' Day' : ' Days')));
    $row['Operational Status'] = $opStatusLabel;
    $row['Payment Status'] = strtoupper($pStat ?: 'PENDING');
    $row['Daily Rate (₹)'] = $dailyRate;
    $row['Base Rental (₹)'] = $baseRental;
    $row['Coupon Discount (₹)'] = $couponDiscount;
    $row['Refund / Deduction (₹)'] = $refundAmt;
    $row['Net Rental Excl. Deposit (₹)'] = $netRental;
    if ($hasDateFilter) {
        $row['Prorated Revenue in Dates (₹)'] = $windowProratedRev;
    }
    $row['Monthly Revenue Bifurcation'] = $bifurcationLabel;
    $row['Security Deposit (₹)'] = $securityDeposit;
    $row['Gross Total Incl. Deposit (₹)'] = $grossTotal;
    $row['Amount Paid (₹)'] = $amountPaid;
    $row['Remaining Balance (₹)'] = $remainingBalance;
    $row['Payment Ref / UTR'] = (string)exportFirstNonEmpty($b['payment_ref'] ?? null, $payAgg['latest_ref'] ?? null, '');
    $row['Start Odometer (KM)'] = $startOdo;
    $row['End Odometer (KM)'] = $endOdo;
    $row['Distance Driven (KM)'] = $distanceKm;
    $row['Start FASTag (₹)'] = $startFastag;
    $row['Return FASTag (₹)'] = $returnFastag;
    $row['FASTag Used (₹)'] = $fastagUsed;
    $row['Pickup At'] = exportFormatDateTime(exportFirstNonEmpty($b['pickup_at'] ?? null, $insp['pickupAt'] ?? null, ''));
    $row['Returned At'] = exportFormatDateTime(exportFirstNonEmpty($b['returned_at'] ?? null, $b['completed_at'] ?? null, $insp['returnedAt'] ?? null, $insp['returnAt'] ?? null, ''));
    $row['Handled By'] = (string)exportFirstNonEmpty($b['pickup_handled_by'] ?? null, $insp['pickupHandledBy'] ?? null, $insp['handledBy'] ?? null, '');
    $row['Created At'] = $createdFmt;

    $filteredRowsWithSortKey[] = [
        'sort1' => $sortPrimaryTs,
        'sort2' => $sortSecondaryTs,
        'id' => (int)($b['id'] ?? 0),
        'row' => $row,
    ];
}

// Sort Bookings strictly chronologically (Newest first OR Oldest first)
usort($filteredRowsWithSortKey, static function ($a, $b) use ($sortOrder) {
    $cmp = $a['sort1'] <=> $b['sort1'];
    if ($cmp === 0) {
        $cmp = $a['sort2'] <=> $b['sort2'];
    }
    if ($cmp === 0) {
        $cmp = $a['id'] <=> $b['id'];
    }
    return $sortOrder === 'asc' ? $cmp : -$cmp;
});

$bookingsExport = array_map(static fn($item) => $item['row'], $filteredRowsWithSortKey);

// 5. Enrich Vehicles Sheet with Hub Name, Live Yard/On-Trip Status, Trips & Totals
$vehiclesExport = [];
foreach ($rawVehicles as $v) {
    $vHub = (int)($v['hub_id'] ?? 1);
    if ($vHub <= 0) $vHub = 1;
    if ($hubId > 0 && $vHub !== $hubId) {
        continue;
    }
    $reg = strtoupper(trim((string)($v['reg_no'] ?? '')));
    $perf = $vehiclePerfStats[$reg] ?? [
        'bookings' => 0,
        'completed' => 0,
        'active' => 0,
        'booked_days' => 0,
        'net_revenue' => 0.0,
        'distance_km' => 0.0,
        'fastag_used' => 0.0,
    ];
    $isOnRoad = isset($onRoadVehicleKeys[$reg]);
    $vehiclesExport[] = [
        'Reg No' => $reg,
        'Brand' => $v['brand'] ?? '',
        'Model' => $v['model'] ?? '',
        'Year' => (int)($v['year'] ?? 0),
        'Category' => ucfirst((string)($v['category'] ?? '')),
        'Hub' => $hubNames[$vHub] ?? ('Hub #' . $vHub),
        'Live Status' => $isOnRoad ? 'ON TRIP' : 'IN YARD',
        'DB Availability' => !empty($v['available']) ? 'Available' : 'Unavailable',
        'Acquisition Type' => $v['acquisition_type'] ?? 'Partner',
        'Owner Name' => $v['owner_name'] ?? '',
        'Price / Day (₹)' => round((float)($v['price_day'] ?? 0), 2),
        'Price / Hour (₹)' => round((float)($v['price_hour'] ?? 0), 2),
        'Security Deposit (₹)' => round((float)($v['security_deposit'] ?? 0), 2),
        'Total Bookings' => $perf['bookings'],
        'Completed Trips' => $perf['completed'],
        'Active Trips' => $perf['active'],
        'Booked Days' => $perf['booked_days'],
        'Net Revenue (₹)' => round($perf['net_revenue'], 2),
        'Distance Driven (KM)' => round($perf['distance_km'], 2),
        'FASTag Used (₹)' => round($perf['fastag_used'], 2),
    ];
}

// 6. Format Summary & KPI Sheet
$targetHubRecord = null;
foreach ($kpiHubRows as $hr) {
    if ((int)$hr['hub_id'] === ($hubId > 0 ? $hubId : 0)) {
        $targetHubRecord = $hr;
        break;
    }
}

$periodLabel = $hasDateFilter
    ? (($fromYmd ?: 'Start') . ' to ' . ($toYmd ?: 'Present'))
    : 'All Time';

$summaryRows = [
    ['Metric' => 'Export Generated At', 'Value' => date('Y-m-d H:i:s')],
    ['Metric' => 'Hub Scope', 'Value' => $hubNames[$hubId] ?? 'All Operating Hubs'],
    ['Metric' => 'Selected Date Range', 'Value' => $periodLabel],
    ['Metric' => 'Status Filter', 'Value' => strtoupper($statusFilter)],
    ['Metric' => 'Sort Order', 'Value' => $sortOrder === 'asc' ? 'Oldest Date First' : 'Newest Date First'],
    ['Metric' => '--- Filtered Bookings Summary ---', 'Value' => '---'],
    ['Metric' => 'Exported Bookings Count (Non-Cancelled)', 'Value' => $summaryStats['exported_bookings'] - $summaryStats['cancelled_bookings']],
    ['Metric' => 'Exported Total Records (Incl. Cancelled)', 'Value' => $summaryStats['exported_bookings']],
    ['Metric' => 'Verified / Eligible Bookings', 'Value' => $summaryStats['eligible_paid_bookings']],
    ['Metric' => 'Active / On-Trip Count', 'Value' => $summaryStats['active_trips']],
    ['Metric' => 'Completed Trips Count', 'Value' => $summaryStats['completed_trips']],
    ['Metric' => 'Confirmed / Upcoming Trips', 'Value' => $summaryStats['confirmed_upcoming_trips']],
    ['Metric' => 'Pending Verification / Payment', 'Value' => $summaryStats['pending_trips']],
    ['Metric' => 'Cancelled / Rejected Bookings', 'Value' => $summaryStats['cancelled_bookings']],
    ['Metric' => 'Total Booked Days (Filtered)', 'Value' => $summaryStats['total_booked_days']],
];
if ($hasDateFilter) {
    $summaryRows[] = ['Metric' => 'Booked Days Overlapping Selected Dates', 'Value' => $summaryStats['window_overlap_days']];
    $summaryRows[] = ['Metric' => 'Prorated Net Revenue in Selected Dates (₹)', 'Value' => $summaryStats['window_prorated_revenue']];
}
$summaryRows = array_merge($summaryRows, [
    ['Metric' => 'Net Rental Revenue Excl. Deposit (₹)', 'Value' => $summaryStats['net_rental_revenue']],
    ['Metric' => 'Total Security Deposits (₹)', 'Value' => $summaryStats['security_deposits']],
    ['Metric' => 'Gross Booking Amount Incl. Deposit (₹)', 'Value' => $summaryStats['gross_booking_amount']],
    ['Metric' => 'Total Amount Paid / Collected (₹)', 'Value' => $summaryStats['amount_paid']],
    ['Metric' => 'Total Remaining Balance Due (₹)', 'Value' => $summaryStats['remaining_balance']],
    ['Metric' => 'Total Distance Driven (KM)', 'Value' => $summaryStats['total_distance_km']],
    ['Metric' => 'Total FASTag Used (₹)', 'Value' => $summaryStats['total_fastag_used']],
]);

if ($targetHubRecord) {
    $summaryRows = array_merge($summaryRows, [
        ['Metric' => '--- Authoritative Database KPI Ledger ---', 'Value' => '---'],
        ['Metric' => 'DB Total Revenue (₹)', 'Value' => round((float)($targetHubRecord['total_revenue'] ?? 0), 2)],
        ['Metric' => 'DB Revenue This Month (₹)', 'Value' => round((float)($targetHubRecord['month_revenue'] ?? 0), 2)],
        ['Metric' => 'DB Day Sales (₹)', 'Value' => round((float)($targetHubRecord['day_sales'] ?? 0), 2)],
        ['Metric' => 'DB Week Sales (₹)', 'Value' => round((float)($targetHubRecord['week_sales'] ?? 0), 2)],
        ['Metric' => 'DB Total Bookings', 'Value' => (int)($targetHubRecord['total_bookings'] ?? 0)],
        ['Metric' => 'DB Paid Bookings', 'Value' => (int)($targetHubRecord['paid_bookings'] ?? 0)],
        ['Metric' => 'DB Active Trips', 'Value' => (int)($targetHubRecord['active_trips'] ?? 0)],
        ['Metric' => 'DB Total Fleet Vehicles', 'Value' => (int)($targetHubRecord['total_fleet'] ?? 0)],
        ['Metric' => 'DB On-Road Vehicles', 'Value' => (int)($targetHubRecord['on_road_fleet'] ?? 0)],
        ['Metric' => 'DB Available in Yard', 'Value' => (int)($targetHubRecord['available_fleet'] ?? 0)],
        ['Metric' => 'DB Fleet Occupancy (%)', 'Value' => (float)($targetHubRecord['occupancy_pct'] ?? 0)],
        ['Metric' => 'DB Registered Users', 'Value' => (int)($targetHubRecord['total_users'] ?? 0)],
        ['Metric' => 'DB Pending KYC Docs', 'Value' => (int)($targetHubRecord['pending_docs'] ?? 0)],
        ['Metric' => 'DB Pending Payments', 'Value' => (int)($targetHubRecord['pending_payments'] ?? 0)],
    ]);
}

// 7. Build Daily KPI Bifurcation (Per Calendar Date -> Rolls into Monthly KPIs)
$dailyKeys = array_keys($dailyLedger);
if ($sortOrder === 'asc') {
    sort($dailyKeys, SORT_STRING);
} else {
    rsort($dailyKeys, SORT_STRING);
}
$dailyExport = [];
foreach ($dailyKeys as $dKey) {
    $dRec = $dailyLedger[$dKey];
    $dTs = strtotime($dKey);
    $dailyExport[] = [
        'Date' => $dRec['date'],
        'Day' => $dTs ? date('D', $dTs) : '',
        'Month' => $dRec['month'],
        'Billed Trips Count' => (int)$dRec['billed_days'],
        'Total Scheduled Trips' => (int)$dRec['scheduled_days'],
        'Pickups Count' => (int)$dRec['pickups'],
        'Returns Count' => (int)$dRec['returns'],
        'Daily Revenue (₹)' => round((float)$dRec['revenue'], 2),
        'Booking Refs' => implode(', ', array_keys($dRec['refs'])),
        'Vehicles' => implode(', ', array_keys($dRec['vehicles'])),
    ];
}

// 8. Build Monthly KPI Sheet combining Daily Bifurcation Rollups & DB kpi_metrics Ledger
$kpiMonthlyByKey = [];
foreach ($kpiMonthlyRows as $m) {
    $mk = substr((string)($m['metric_date'] ?? ''), 0, 7) . '-01';
    if ($mk !== '-01') {
        $kpiMonthlyByKey[$mk] = $m;
    }
}
$allMonthKeys = array_values(array_unique(array_merge(array_keys($kpiMonthlyByKey), array_keys($monthlyFromDaily))));
if ($sortOrder === 'asc') {
    sort($allMonthKeys, SORT_STRING);
} else {
    rsort($allMonthKeys, SORT_STRING);
}

$monthlyExport = array_map(static function ($mk) use ($kpiMonthlyByKey, $monthlyFromDaily) {
    $m = $kpiMonthlyByKey[$mk] ?? [];
    $roll = $monthlyFromDaily[$mk] ?? ['billed_days' => 0, 'scheduled_days' => 0, 'revenue' => 0.0];
    return [
        'Month' => substr($mk, 0, 7),
        'Month Key' => $mk,
        'Billed Rental Days' => (int)$roll['billed_days'],
        'Total Scheduled Days' => (int)$roll['scheduled_days'],
        'Daily-Rollup Revenue (₹)' => round((float)$roll['revenue'], 2),
        'DB Month Sales (₹)' => isset($m['month_sales']) ? round((float)$m['month_sales'], 2) : '',
        'DB Cumulative Revenue (₹)' => isset($m['total_revenue']) ? round((float)$m['total_revenue'], 2) : '',
        'DB Day Sales (₹)' => isset($m['day_sales']) ? round((float)$m['day_sales'], 2) : '',
        'DB Week Sales (₹)' => isset($m['week_sales']) ? round((float)$m['week_sales'], 2) : '',
        'Month Bookings' => (int)($m['total_bookings'] ?? 0),
        'Month Paid Bookings' => (int)($m['paid_bookings'] ?? 0),
        'Active Trips' => (int)($m['active_trips'] ?? 0),
        'Completed Trips' => (int)($m['completed_trips'] ?? 0),
        'Total Fleet' => (int)($m['total_fleet'] ?? 0),
        'On Road' => (int)($m['on_road_fleet'] ?? 0),
        'In Yard' => (int)($m['in_yard_fleet'] ?? 0),
        'Occupancy (%)' => round((float)($m['occupancy_pct'] ?? 0), 2),
        'Total Users' => (int)($m['total_users'] ?? 0),
        'Pending Payments' => (int)($m['pending_payments'] ?? 0),
        'Pending Docs' => (int)($m['pending_docs'] ?? 0),
        'Updated At' => exportFormatDateTime($m['updated_at'] ?? ''),
    ];
}, $allMonthKeys);

$hubsExport = array_map(static function ($h) {
    return [
        'Hub ID' => (int)($h['hub_id'] ?? 0),
        'Hub Name' => $h['hub_name'] ?? '',
        'Total Revenue (₹)' => round((float)($h['total_revenue'] ?? 0), 2),
        'Month Revenue (₹)' => round((float)($h['month_revenue'] ?? 0), 2),
        'Day Sales (₹)' => round((float)($h['day_sales'] ?? 0), 2),
        'Week Sales (₹)' => round((float)($h['week_sales'] ?? 0), 2),
        'Total Bookings' => (int)($h['total_bookings'] ?? 0),
        'Paid Bookings' => (int)($h['paid_bookings'] ?? 0),
        'Active Trips' => (int)($h['active_trips'] ?? 0),
        'Total Fleet' => (int)($h['total_fleet'] ?? 0),
        'On-Road Fleet' => (int)($h['on_road_fleet'] ?? 0),
        'Available in Yard' => (int)($h['available_fleet'] ?? 0),
        'Occupancy (%)' => round((float)($h['occupancy_pct'] ?? 0), 2),
        'Total Users' => (int)($h['total_users'] ?? 0),
        'Pending Docs' => (int)($h['pending_docs'] ?? 0),
        'Pending Payments' => (int)($h['pending_payments'] ?? 0),
        'Updated At' => exportFormatDateTime($h['updated_at'] ?? ''),
    ];
}, $kpiHubRows);

if ($format === 'json' || (!isset($_GET['format']) && !isset($_GET['csv']))) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'success',
        'success' => true,
        'filters' => [
            'from' => $fromYmd,
            'to' => $toYmd,
            'status' => $statusFilter,
            'hub_id' => $hubId,
            'search' => $search,
            'sort' => $sortOrder,
        ],
        'data' => [
            'summary' => $summaryRows,
            'summary_stats' => $summaryStats,
            'daily_kpis' => $dailyExport,
            'monthly_kpis' => $monthlyExport,
            'hub_kpis' => $hubsExport,
            'bookings' => $bookingsExport,
            'payments' => $paymentsExport,
            'users' => $usersExport,
            'vehicles' => $vehiclesExport,
            'coupons' => $couponsExport,
            'verification' => $verificationExport,
        ],
        'exported_at' => date('Y-m-d H:i:s'),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// CSV fallback export
$filename = "KRUIZLY_Export_" . ($fromYmd ?: 'all') . "_to_" . ($toYmd ?: 'present') . "_" . date('Ymd_His') . ".csv";
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$out = fopen('php://output', 'w');
fprintf($out, chr(0xEF) . chr(0xBB) . chr(0xBF));

function writeExportSection($out, string $title, array $rows): void
{
    fputcsv($out, ["=== $title ==="]);
    if (!empty($rows)) {
        fputcsv($out, array_keys($rows[0]));
        foreach ($rows as $row) {
            fputcsv($out, array_values($row));
        }
    } else {
        fputcsv($out, ["No records found."]);
    }
    fputcsv($out, []);
}

writeExportSection($out, "SUMMARY & KPI METRICS", $summaryRows);
writeExportSection($out, "DAILY KPI BIFURCATION (DATE -> MONTH)", $dailyExport);
writeExportSection($out, "MONTHLY KPI LEDGER", $monthlyExport);
writeExportSection($out, "HUB KPI METRICS", $hubsExport);
writeExportSection($out, "BOOKINGS (SORTED " . strtoupper($sortOrder) . ")", $bookingsExport);
writeExportSection($out, "FLEET VEHICLES", $vehiclesExport);
writeExportSection($out, "PAYMENTS", $paymentsExport);
writeExportSection($out, "USERS", $usersExport);
writeExportSection($out, "COUPONS", $couponsExport);
writeExportSection($out, "VERIFICATION (KYC)", $verificationExport);

fclose($out);
exit;
