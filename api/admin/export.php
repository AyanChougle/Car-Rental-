<?php
/**
 * api/admin/export.php
 * GET /api/admin/export - Single-source-of-truth filterable export across Admin, Manager, Executive & Accounts.
 * Powered directly by KpiService::computeFilteredReport() so dashboards, daily/monthly bifurcation,
 * hub metrics, vehicle inventory, payment ledger, and Excel/CSV/JSON exports reconcile 100%.
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

function exportFormatDateTime($val): string
{
    if ($val === null || trim((string)$val) === '') {
        return '';
    }
    $ts = KpiService::parseValidTimestamp($val);
    if ($ts === null) {
        return trim((string)$val);
    }
    return date('H:i:s', $ts) === '00:00:00' ? date('Y-m-d', $ts) : date('Y-m-d H:i', $ts);
}

$fromDateRaw = trim((string)($_GET['from'] ?? $_GET['from_date'] ?? $_GET['startDate'] ?? ''));
$toDateRaw = trim((string)($_GET['to'] ?? $_GET['to_date'] ?? $_GET['endDate'] ?? ''));
$fromTs = $fromDateRaw !== '' ? KpiService::parseValidTimestamp($fromDateRaw) : null;
$toTs = $toDateRaw !== '' ? KpiService::parseValidTimestamp($toDateRaw) : null;

if ($fromDateRaw !== '' && $fromTs === null) {
    sendErrorResponse("Invalid 'from' date filter: $fromDateRaw", 400);
}
if ($toDateRaw !== '' && $toTs === null) {
    sendErrorResponse("Invalid 'to' date filter: $toDateRaw", 400);
}

$fromYmd = $fromTs !== null ? date('Y-m-d', $fromTs) : '';
$toYmd = $toTs !== null ? date('Y-m-d', $toTs) : '';
if ($fromYmd !== '' && $toYmd !== '' && $fromYmd > $toYmd) {
    [$fromYmd, $toYmd] = [$toYmd, $fromYmd];
}

$statusFilter = strtolower(trim((string)($_GET['status'] ?? 'all')));
if ($statusFilter === '') {
    $statusFilter = 'all';
}
$search = trim((string)($_GET['search'] ?? $_GET['q'] ?? ''));
$rawHubParam = $_GET['hub_id'] ?? '';
$requestedUnassigned = ($rawHubParam === 'unassigned');
$requestedHubId = (!$requestedUnassigned && $rawHubParam !== '' && $rawHubParam !== 'all') ? (int)$rawHubParam : 0;
$effectiveUnassigned = ($isSuperAdmin || $assignedHub <= 0) && $requestedUnassigned;
$hubId = (!$isSuperAdmin && $assignedHub > 0) ? $assignedHub : $requestedHubId;
$sortOrder = strtolower(trim((string)($_GET['sort'] ?? 'desc'))) === 'asc' ? 'asc' : 'desc';

$filters = [
    'from' => $fromYmd !== '' ? $fromYmd : null,
    'to' => $toYmd !== '' ? $toYmd : null,
    'hub_id' => $hubId > 0 ? $hubId : null,
    'unassigned_only' => $effectiveUnassigned,
    'status' => $statusFilter !== 'all' ? $statusFilter : null,
    'search' => $search !== '' ? $search : null,
];
$hasDateFilter = ($fromYmd !== '' || $toYmd !== '');

// Invoke unified Calculation Engine
$report = KpiService::computeFilteredReport($filters, false);
$registeredHubs = KpiService::getRegisteredHubsMap();

$live = $report['live'] ?? [];
$hubsMap = $report['hubs'] ?? [];
$reconciliation = $report['reconciliation'] ?? [];
$diagnostics = $report['diagnostics'] ?? [];
$filteredBookings = $report['bookings'] ?? [];

$scopeLabel = 'All Operating Hubs';
if ($effectiveUnassigned) {
    $scopeLabel = 'Unassigned / Legacy Hub';
} elseif ($hubId > 0) {
    $scopeLabel = $registeredHubs[$hubId]['name'] ?? ("Hub #$hubId");
}

// Build User Directory lookup for Customer details
$userLookup = [];
$rawUsers = Database::fetchAll(
    "SELECT id, firebase_uid, email, name, phone, age, role, status, license_status, aadhar_status, pan_status, created_at
     FROM users
     ORDER BY created_at DESC, id DESC"
) ?: [];

$usersExport = array_map(static function ($u) use (&$userLookup) {
    $uidKey = trim((string)($u['firebase_uid'] ?? ''));
    if ($uidKey !== '') {
        $userLookup[$uidKey] = $u;
    }
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

// Map Bookings into Export rows and track vehicle performance strictly within filtered scope
$vehiclePerf = [];
$bookingHubIndex = [];
$bookingCancelIndex = [];
$dailyAux = [];
$sortableBookings = [];

foreach ($filteredBookings as $b) {
    $dates = $b['computed_dates'] ?? [];
    $fin = $b['computed_financials'] ?? [];
    $hubAttr = $b['computed_hub'] ?? [];
    $split = $b['computed_split'] ?? [];

    $bRef = trim((string)($b['booking_number'] ?: ($b['booking_id'] ?: ('BK-' . ($b['id'] ?? '')))));
    $bKey = strtoupper(ltrim($bRef, '#'));
    $bIdKey = strtoupper(ltrim(trim((string)($b['booking_id'] ?? '')), '#'));
    $rHubId = (int)($hubAttr['reporting_hub_id'] ?? 0);
    $bookingHubIndex[$bKey] = $rHubId;
    if ($bIdKey !== '') {
        $bookingHubIndex[$bIdKey] = $rHubId;
    }
    $bookingCancelIndex[$bKey] = !empty($fin['is_cancelled']);
    if ($bIdKey !== '') {
        $bookingCancelIndex[$bIdKey] = !empty($fin['is_cancelled']);
    }

    $uidKey = trim((string)($b['firebase_uid'] ?? ''));
    $uRow = $uidKey !== '' ? ($userLookup[$uidKey] ?? []) : [];
    $custName = (string)exportFirstNonEmpty($b['user_name'] ?? null, $uRow['name'] ?? null, 'Customer');
    $custPhone = (string)exportFirstNonEmpty($b['user_phone'] ?? null, $uRow['phone'] ?? null, '');
    $custEmail = (string)exportFirstNonEmpty($b['user_email'] ?? null, $uRow['email'] ?? null, '');
    $vehName = (string)exportFirstNonEmpty($b['vehicle_name'] ?? null, 'Vehicle');
    $vRegUpper = strtoupper(trim((string)exportFirstNonEmpty($b['vehicle_reg'] ?? null, $b['v_reg_no'] ?? null, '')));

    $insp = [];
    if (!empty($b['return_inspection'])) {
        $insp = is_string($b['return_inspection']) ? json_decode($b['return_inspection'], true) : $b['return_inspection'];
        if (!is_array($insp)) {
            $insp = [];
        }
    }

    $startOdoRaw = exportFirstNonEmpty(
        $b['start_odometer'] ?? null, $b['pickup_odometer'] ?? null,
        $insp['pickupOdometer'] ?? null, $insp['startOdometer'] ?? null, $insp['odometerStart'] ?? null
    );
    $endOdoRaw = exportFirstNonEmpty(
        $b['end_odometer'] ?? null, $b['return_odometer'] ?? null,
        $insp['returnOdometer'] ?? null, $insp['endOdometer'] ?? null, $insp['odometerEnd'] ?? null
    );
    $startFastagRaw = exportFirstNonEmpty(
        $b['start_fastag'] ?? null, $b['pickup_fastag'] ?? null,
        $insp['pickupFastagBalance'] ?? null, $insp['startFastag'] ?? null, $insp['fastagStart'] ?? null
    );
    $returnFastagRaw = exportFirstNonEmpty(
        $b['return_fastag'] ?? null, $b['end_fastag'] ?? null,
        $insp['returnFastagBalance'] ?? null, $insp['endFastag'] ?? null, $insp['fastagEnd'] ?? null
    );

    $startOdo = exportFormatNumOrEmpty($startOdoRaw);
    $endOdo = exportFormatNumOrEmpty($endOdoRaw);
    $distanceKm = (is_numeric($startOdo) && is_numeric($endOdo) && (float)$endOdo >= (float)$startOdo)
        ? round((float)$endOdo - (float)$startOdo, 2)
        : '';

    $startFastag = exportFormatNumOrEmpty($startFastagRaw);
    $returnFastag = exportFormatNumOrEmpty($returnFastagRaw);
    $fastagUsed = (is_numeric($startFastag) && is_numeric($returnFastag))
        ? round((float)$startFastag - (float)$returnFastag, 2)
        : '';

    $bookedDays = max(1, (int)($dates['days'] ?? 1));
    $netRental = (float)($fin['net_rental_revenue'] ?? 0.0);
    $dailyRate = $bookedDays > 0 && $netRental > 0 ? round($netRental / $bookedDays, 2) : 0.0;

    $isCancelled = !empty($fin['is_cancelled']);
    $isActiveTrip = !empty($b['computed_is_active_trip']);
    $isCompleted = !empty($b['computed_is_completed']);

    if ($isCancelled) {
        $opStatus = 'CANCELLED';
        $payStatusLabel = ((float)($fin['refund_amount'] ?? 0.0) > 0.0) ? 'REFUNDED / CANCELLED' : 'CANCELLED';
    } elseif ($isCompleted) {
        $opStatus = 'COMPLETED';
        $payStatusLabel = strtoupper((string)($b['payment_status'] ?: 'PAID'));
    } elseif ($isActiveTrip) {
        $opStatus = 'ACTIVE / ON TRIP';
        $payStatusLabel = strtoupper((string)($b['payment_status'] ?: 'PAID'));
    } elseif (!empty($b['computed_is_scheduled'])) {
        $opStatus = 'CONFIRMED / SCHEDULED';
        $payStatusLabel = strtoupper((string)($b['payment_status'] ?: 'CONFIRMED'));
    } elseif (!empty($fin['has_pending_verification'])) {
        $opStatus = 'AWAITING VERIFICATION';
        $payStatusLabel = 'PENDING_VERIFICATION';
    } else {
        $opStatus = strtoupper(str_replace('_', ' ', (string)($b['status'] ?: 'PENDING PAYMENT')));
        $payStatusLabel = strtoupper((string)($b['payment_status'] ?: 'PENDING_PAYMENT'));
    }

    if (!$isCancelled && $vRegUpper !== '' && $vRegUpper !== 'TBD') {
        if (!isset($vehiclePerf[$vRegUpper])) {
            $vehiclePerf[$vRegUpper] = [
                'bookings' => 0,
                'completed' => 0,
                'active' => 0,
                'booked_days' => 0,
                'net_revenue' => 0.0,
                'distance_km' => 0.0,
                'fastag_used' => 0.0,
            ];
        }
        $vehiclePerf[$vRegUpper]['bookings']++;
        if ($isCompleted) $vehiclePerf[$vRegUpper]['completed']++;
        if ($isActiveTrip) $vehiclePerf[$vRegUpper]['active']++;
        $vehiclePerf[$vRegUpper]['booked_days'] += $bookedDays;
        $vehiclePerf[$vRegUpper]['net_revenue'] = round($vehiclePerf[$vRegUpper]['net_revenue'] + $netRental, 2);
        if (is_numeric($distanceKm)) $vehiclePerf[$vRegUpper]['distance_km'] += (float)$distanceKm;
        if (is_numeric($fastagUsed)) $vehiclePerf[$vRegUpper]['fastag_used'] += (float)$fastagUsed;
    }

    // Track booking refs and vehicle regs for each daily bifurcation slot
    if (!empty($split)) {
        foreach ($split as $sp) {
            foreach ($sp['daily_breakdown'] as $dYmd => $_amt) {
                $dailyAux[$dYmd]['refs'][$bRef] = true;
                if ($vRegUpper !== '' && $vRegUpper !== 'TBD') {
                    $dailyAux[$dYmd]['vehicles'][$vRegUpper] = true;
                }
            }
        }
    }

    $bifurcationParts = [];
    foreach ($split as $mKey => $sp) {
        $bifurcationParts[] = substr($mKey, 0, 7) . ': ' . (int)$sp['days'] . 'd (₹' . number_format((float)$sp['amount'], 2, '.', '') . ')';
    }
    $bifurcationLabel = !empty($bifurcationParts) ? implode(' | ', $bifurcationParts) : 'None';

    $row = [
        'Booking #' => $bRef,
        'Pickup Hub' => $hubAttr['pickup_hub_name'] ?? 'Unassigned',
        'Return Hub' => $hubAttr['drop_hub_name'] ?? 'Unassigned',
        'Reporting Hub' => $hubAttr['reporting_hub_name'] ?? 'Unassigned',
        'Cross-Hub Return' => !empty($hubAttr['is_cross_hub_return']) ? 'YES' : 'NO',
        'Customer Name' => $custName,
        'Customer Phone' => $custPhone,
        'Customer Email' => $custEmail,
        'Vehicle Name' => $vehName,
        'Vehicle Reg' => $vRegUpper,
        'Pickup Date' => exportFormatDateTime($b['pickup_date'] ?? $dates['start_date'] ?? ''),
        'Drop Date' => exportFormatDateTime($b['drop_date'] ?? $dates['drop_date'] ?? ''),
        'Booked Days' => $bookedDays,
    ];
    if ($hasDateFilter) {
        $row['Days in Selected Dates'] = (int)($b['allocated_days_in_range'] ?? 0);
    }
    $row['Duration'] = (string)exportFirstNonEmpty($b['duration'] ?? null, ($bookedDays . ($bookedDays === 1 ? ' Day' : ' Days')));
    $row['Operational Status'] = $opStatus;
    $row['Payment Status'] = $payStatusLabel;
    $row['Daily Rate (₹)'] = $dailyRate;
    $row['Base Rental (₹)'] = round((float)($fin['base_rental'] ?? 0.0), 2);
    $row['Driver Charges (₹)'] = round((float)($fin['driver_charges'] ?? 0.0), 2);
    $row['Extra Charges (₹)'] = round((float)($fin['extra_charges'] ?? 0.0), 2);
    $row['Coupon Discount (₹)'] = round((float)($fin['coupon_discount'] ?? 0.0), 2);
    $row['Refund / Deduction (₹)'] = round((float)($fin['refund_amount'] ?? 0.0), 2);
    $row['Net Rental Revenue (₹)'] = round($netRental, 2);
    if ($hasDateFilter) {
        $row['Allocated Revenue in Selected Dates (₹)'] = round((float)($b['allocated_revenue_in_range'] ?? 0.0), 2);
    }
    $row['Monthly Revenue Bifurcation'] = $bifurcationLabel;
    $row['Security Deposit (₹)'] = round((float)($fin['security_deposit'] ?? 0.0), 2);
    $row['Gross Customer Payable Incl. Deposit (₹)'] = round((float)($fin['gross_customer_payable'] ?? 0.0), 2);
    $row['Verified Collected (₹)'] = round((float)($fin['verified_collected'] ?? 0.0), 2);
    $row['Net Collections (₹)'] = round((float)($fin['net_collections'] ?? 0.0), 2);
    $row['Outstanding Balance (₹)'] = round((float)($fin['outstanding_amount'] ?? 0.0), 2);
    $row['Payment Ref / UTR'] = (string)($b['payment_ref'] ?? '');
    $row['Start Odometer (KM)'] = $startOdo;
    $row['End Odometer (KM)'] = $endOdo;
    $row['Distance Driven (KM)'] = $distanceKm;
    $row['Start FASTag (₹)'] = $startFastag;
    $row['Return FASTag (₹)'] = $returnFastag;
    $row['FASTag Used (₹)'] = $fastagUsed;
    $row['Pickup At'] = exportFormatDateTime(exportFirstNonEmpty($b['pickup_at'] ?? null, $insp['pickupAt'] ?? null, ''));
    $row['Returned At'] = exportFormatDateTime(exportFirstNonEmpty($b['returned_at'] ?? null, $b['completed_at'] ?? null, $insp['returnedAt'] ?? null, $insp['returnAt'] ?? null, ''));
    $row['Handled By'] = (string)exportFirstNonEmpty($b['pickup_handled_by'] ?? null, $insp['pickupHandledBy'] ?? null, $insp['handledBy'] ?? null, '');
    $row['Date Integrity Warning'] = (string)($dates['date_warning'] ?? '');
    $row['Created At'] = exportFormatDateTime($b['created_at'] ?? '');

    $sortableBookings[] = [
        'sort1' => (int)($dates['start_time'] ?? 0),
        'sort2' => KpiService::parseValidTimestamp($b['created_at'] ?? null) ?? 0,
        'id' => (int)($b['id'] ?? 0),
        'row' => $row,
    ];
}

usort($sortableBookings, static function ($a, $b) use ($sortOrder) {
    $cmp = $a['sort1'] <=> $b['sort1'];
    if ($cmp === 0) $cmp = $a['sort2'] <=> $b['sort2'];
    if ($cmp === 0) $cmp = $a['id'] <=> $b['id'];
    return $sortOrder === 'asc' ? $cmp : -$cmp;
});
$bookingsExport = array_map(static fn($item) => $item['row'], $sortableBookings);

// Vehicles Export (includes all 8 lifecycle states & filters cleanly by hub)
$vehiclesExport = [];
foreach ($report['vehicles'] ?? [] as $v) {
    $vHubId = (int)($v['computed_hub_id'] ?? 0);
    if ($effectiveUnassigned && $vHubId !== 0) {
        continue;
    }
    if ($hubId > 0 && $vHubId !== $hubId) {
        continue;
    }
    $state = $v['computed_state'] ?? [];
    $reg = strtoupper(trim((string)($v['reg_no'] ?? '')));
    $perf = $vehiclePerf[$reg] ?? ['bookings' => 0, 'completed' => 0, 'active' => 0, 'booked_days' => 0, 'net_revenue' => 0.0, 'distance_km' => 0.0, 'fastag_used' => 0.0];
    $opState = strtoupper(str_replace('_', ' ', (string)($state['operational_state'] ?? 'IN YARD')));

    $vehiclesExport[] = [
        'Reg No' => $reg,
        'Brand' => $v['brand'] ?? '',
        'Model' => $v['model'] ?? '',
        'Year' => (int)($v['year'] ?? 0),
        'Category' => ucfirst((string)($v['category'] ?? '')),
        'Hub' => $v['computed_hub_name'] ?? 'Unassigned',
        'Operational State' => $opState,
        'Active Fleet' => !empty($state['is_active_fleet']) ? 'YES' : 'NO',
        'DB Availability' => !empty($state['is_available_recorded']) ? 'Available' : 'Unavailable',
        'Has Scheduled Booking' => !empty($state['has_scheduled_booking']) ? 'YES' : 'NO',
        'Acquisition Type' => $v['acquisition_type'] ?? 'Partner',
        'Owner Name' => $v['owner_name'] ?? '',
        'Price / Day (₹)' => round((float)($v['price_day'] ?? 0), 2),
        'Price / Hour (₹)' => round((float)($v['price_hour'] ?? 0), 2),
        'Security Deposit (₹)' => round((float)($v['security_deposit'] ?? 0), 2),
        'Total Bookings (Scope)' => $perf['bookings'],
        'Completed Trips (Scope)' => $perf['completed'],
        'Active Trips (Scope)' => $perf['active'],
        'Booked Days (Scope)' => $perf['booked_days'],
        'Net Revenue (₹)' => round($perf['net_revenue'], 2),
        'Distance Driven (KM)' => round($perf['distance_km'], 2),
        'FASTag Used (₹)' => round($perf['fastag_used'], 2),
    ];
}

// Payments Export (deduplicated, filtered by hub & date, clearly marks cancelled parent bookings)
$paymentsExport = [];
foreach ($report['payments'] ?? [] as $p) {
    $pBkey = strtoupper(ltrim(trim((string)($p['booking_id'] ?? '')), '#'));
    if (!empty($bookingHubIndex) || $hubId > 0 || $effectiveUnassigned) {
        if ($pBkey !== '' && !isset($bookingHubIndex[$pBkey]) && ($hubId > 0 || $effectiveUnassigned)) {
            continue;
        }
    }
    $pDateTs = KpiService::parseValidTimestamp($p['verified_at'] ?? $p['created_at'] ?? null);
    $pDateYmd = $pDateTs !== null ? date('Y-m-d', $pDateTs) : '';
    if ($hasDateFilter && $pDateYmd !== '') {
        if ($fromYmd !== '' && $pDateYmd < $fromYmd && !isset($bookingHubIndex[$pBkey])) {
            continue;
        }
        if ($toYmd !== '' && $pDateYmd > $toYmd && !isset($bookingHubIndex[$pBkey])) {
            continue;
        }
    }
    $rawStat = strtolower(trim((string)($p['status'] ?? 'pending')));
    $parentCancelled = !empty($bookingCancelIndex[$pBkey]);
    $displayPayStat = ($parentCancelled && $rawStat === 'pending') ? 'CANCELLED (VOID)' : strtoupper($rawStat);

    $paymentsExport[] = [
        'Payment ID' => $p['payment_id'] ?? '',
        'Booking #' => $p['booking_id'] ?? '',
        'Parent Booking Cancelled' => $parentCancelled ? 'YES' : 'NO',
        'Amount (₹)' => round((float)($p['amount'] ?? 0), 2),
        'Refund Amount (₹)' => round((float)($p['refund_amount'] ?? 0), 2),
        'Method' => strtoupper((string)($p['method'] ?? '')),
        'UTR / Ref' => $p['utr'] ?: ($p['payment_ref'] ?? ''),
        'Status' => $displayPayStat,
        'Verified By' => $p['verified_by'] ?? '',
        'Verified At' => exportFormatDateTime($p['verified_at'] ?? ''),
        'Created At' => exportFormatDateTime($p['created_at'] ?? ''),
    ];
}

// Coupons & KYC Verifications
$couponsRaw = Database::fetchAll(
    "SELECT code, discount_type, discount_value, min_order, active, status, used_count, max_uses, expires_at
     FROM coupons ORDER BY active DESC, id DESC"
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
     FROM verification ORDER BY COALESCE(verified_at, created_at) DESC, id DESC"
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

// Daily KPI Bifurcation (filtered + sorted + accurate return tracking!)
$dailyList = $report['daily'] ?? [];
usort($dailyList, static fn($a, $b) => $sortOrder === 'asc' ? ($a['date'] <=> $b['date']) : ($b['date'] <=> $a['date']));
$dailyExport = array_map(static function ($d) use ($dailyAux) {
    $dDate = (string)$d['date'];
    $ts = strtotime($dDate);
    return [
        'Date' => $dDate,
        'Day' => $ts ? date('D', $ts) : '',
        'Month' => $d['month'],
        'Pickups Started' => (int)$d['pickups'],
        'Returns Scheduled/Completed' => (int)$d['returns'],
        'Active Trips on Date' => (int)$d['active_trips'],
        'Completed Trips on Date' => (int)$d['completed_trips'],
        'Cancelled Bookings' => (int)$d['cancelled_bookings'],
        'Cross-Hub Returns' => (int)$d['cross_hub_returns'],
        'Daily Rental Revenue (₹)' => round((float)$d['revenue'], 2),
        'Verified Collections (₹)' => round((float)$d['collections'], 2),
        'Refunds Issued (₹)' => round((float)$d['refunds'], 2),
        'Booking Refs' => implode(', ', array_keys($dailyAux[$dDate]['refs'] ?? [])),
        'Vehicles' => implode(', ', array_keys($dailyAux[$dDate]['vehicles'] ?? [])),
    ];
}, $dailyList);

// Monthly KPIs (filtered + sorted cleanly)
$monthlyList = array_values($report['monthly'] ?? []);
usort($monthlyList, static fn($a, $b) => $sortOrder === 'asc' ? ($a['metric_date'] <=> $b['metric_date']) : ($b['metric_date'] <=> $a['metric_date']));
$monthlyExport = array_map(static function ($m) {
    return [
        'Month' => substr((string)$m['metric_date'], 0, 7),
        'Month Key' => $m['metric_date'],
        'Billed Rental Days' => (int)($m['billed_days'] ?? 0),
        'Monthly Rental Revenue (₹)' => round((float)($m['month_sales'] ?? 0), 2),
        'Cumulative Revenue (₹)' => round((float)($m['total_revenue'] ?? 0), 2),
        'Bookings (Non-Cancelled)' => (int)($m['total_bookings'] ?? 0),
        'Paid Bookings' => (int)($m['paid_bookings'] ?? 0),
        'Completed Trips' => (int)($m['completed_trips'] ?? 0),
        'Cancelled Bookings' => (int)($m['cancelled_bookings'] ?? 0),
        'Verified Collections (₹)' => round((float)($m['verified_collections'] ?? 0), 2),
        'Refunds (₹)' => round((float)($m['refund_amount'] ?? 0), 2),
        'Outstanding Receivables (₹)' => round((float)($m['outstanding_amount'] ?? 0), 2),
        'Historical DB Archive' => !empty($m['is_historical_archive']) ? 'YES' : 'NO',
    ];
}, $monthlyList);

// Hub KPIs Export (100% DB hubs + Unassigned diagnostics row if any)
$hubsExport = [];
foreach ($hubsMap as $h) {
    $hubsExport[] = [
        'Hub ID' => (int)($h['hub_id'] ?? 0),
        'Hub Name' => $h['hub_name'] ?? '',
        'Total Rental Revenue (₹)' => round((float)($h['total_revenue'] ?? 0), 2),
        'Current Month Revenue (₹)' => round((float)($h['month_revenue'] ?? 0), 2),
        'Verified Collections (₹)' => round((float)($h['verified_collections'] ?? 0), 2),
        'Refunds (₹)' => round((float)($h['refund_amount'] ?? 0), 2),
        'Outstanding Balance (₹)' => round((float)($h['outstanding_amount'] ?? 0), 2),
        'Security Deposits Held (₹)' => round((float)($h['security_deposits'] ?? 0), 2),
        'Day Sales (₹)' => round((float)($h['day_sales'] ?? 0), 2),
        'Week Sales (₹)' => round((float)($h['week_sales'] ?? 0), 2),
        'Bookings (Non-Cancelled)' => (int)($h['total_bookings'] ?? 0),
        'Cancelled Bookings' => (int)($h['cancelled_bookings'] ?? 0),
        'Paid Bookings' => (int)($h['paid_bookings'] ?? 0),
        'Active Trips' => (int)($h['active_trips'] ?? 0),
        'Scheduled Bookings' => (int)($h['scheduled_bookings'] ?? 0),
        'Completed Trips' => (int)($h['completed_trips'] ?? 0),
        'Cross-Hub Outbound' => (int)($h['cross_hub_outbound'] ?? 0),
        'Cross-Hub Inbound Returns' => (int)($h['cross_hub_inbound'] ?? 0),
        'Total Registered Vehicles' => (int)($h['total_registered_fleet'] ?? 0),
        'Active Fleet' => (int)($h['total_fleet'] ?? 0),
        'On-Road / On-Trip' => (int)($h['on_road_fleet'] ?? 0),
        'In Yard / Available' => (int)($h['available_fleet'] ?? 0),
        'Maintenance Fleet' => (int)($h['maintenance_fleet'] ?? 0),
        'Inactive Fleet' => (int)($h['inactive_fleet'] ?? 0),
        'Removed Fleet' => (int)($h['removed_fleet'] ?? 0),
        'Occupancy (%)' => round((float)($h['occupancy_pct'] ?? 0), 2),
        'Revenue / Active Vehicle (₹)' => round((float)($h['revenue_per_vehicle'] ?? 0), 2),
        'Pending Payments' => (int)($h['pending_payments'] ?? 0),
    ];
}
$unassigned = $report['unassigned_hub'] ?? null;
if ($unassigned && ((int)$unassigned['total_bookings'] > 0 || (int)$unassigned['total_registered_fleet'] > 0 || (float)$unassigned['total_revenue'] > 0)) {
    $hubsExport[] = [
        'Hub ID' => 0,
        'Hub Name' => 'Unassigned / Legacy Hub (Requires Hub Mapping)',
        'Total Rental Revenue (₹)' => round((float)($unassigned['total_revenue'] ?? 0), 2),
        'Current Month Revenue (₹)' => round((float)($unassigned['month_revenue'] ?? 0), 2),
        'Verified Collections (₹)' => round((float)($unassigned['verified_collections'] ?? 0), 2),
        'Refunds (₹)' => round((float)($unassigned['refund_amount'] ?? 0), 2),
        'Outstanding Balance (₹)' => round((float)($unassigned['outstanding_amount'] ?? 0), 2),
        'Security Deposits Held (₹)' => round((float)($unassigned['security_deposits'] ?? 0), 2),
        'Day Sales (₹)' => round((float)($unassigned['day_sales'] ?? 0), 2),
        'Week Sales (₹)' => round((float)($unassigned['week_sales'] ?? 0), 2),
        'Bookings (Non-Cancelled)' => (int)($unassigned['total_bookings'] ?? 0),
        'Cancelled Bookings' => (int)($unassigned['cancelled_bookings'] ?? 0),
        'Paid Bookings' => (int)($unassigned['paid_bookings'] ?? 0),
        'Active Trips' => (int)($unassigned['active_trips'] ?? 0),
        'Scheduled Bookings' => (int)($unassigned['scheduled_bookings'] ?? 0),
        'Completed Trips' => (int)($unassigned['completed_trips'] ?? 0),
        'Cross-Hub Outbound' => 0,
        'Cross-Hub Inbound Returns' => 0,
        'Total Registered Vehicles' => (int)($unassigned['total_registered_fleet'] ?? 0),
        'Active Fleet' => (int)($unassigned['total_fleet'] ?? 0),
        'On-Road / On-Trip' => (int)($unassigned['on_road_fleet'] ?? 0),
        'In Yard / Available' => (int)($unassigned['available_fleet'] ?? 0),
        'Maintenance Fleet' => (int)($unassigned['maintenance_fleet'] ?? 0),
        'Inactive Fleet' => (int)($unassigned['inactive_fleet'] ?? 0),
        'Removed Fleet' => (int)($unassigned['removed_fleet'] ?? 0),
        'Occupancy (%)' => round((float)($unassigned['occupancy_pct'] ?? 0), 2),
        'Revenue / Active Vehicle (₹)' => round((float)($unassigned['revenue_per_vehicle'] ?? 0), 2),
        'Pending Payments' => (int)($unassigned['pending_payments'] ?? 0),
    ];
}

// Financial Reconciliation Sheet
$reconciliationExport = [
    ['Check / Line Item' => 'Daily Revenue Total (₹)', 'Amount / Status' => $reconciliation['daily_revenue_total'] ?? 0.0],
    ['Check / Line Item' => 'Monthly Booking Revenue Total (₹)', 'Amount / Status' => $reconciliation['monthly_booking_revenue_total'] ?? 0.0],
    ['Check / Line Item' => 'Booking Net Rental Total (Excl. Deposit) (₹)', 'Amount / Status' => $reconciliation['booking_net_rental_total'] ?? 0.0],
    ['Check / Line Item' => 'Daily vs Monthly Variance (₹)', 'Amount / Status' => $reconciliation['daily_vs_monthly_diff'] ?? 0.0],
    ['Check / Line Item' => 'Monthly vs Bookings Variance (₹)', 'Amount / Status' => $reconciliation['monthly_vs_bookings_diff'] ?? 0.0],
    ['Check / Line Item' => 'Reconciliation Status', 'Amount / Status' => !empty($reconciliation['reconciled']) ? 'RECONCILED (PASS)' : 'VARIANCE DETECTED'],
    ['Check / Line Item' => 'Verified Collections Total (₹)', 'Amount / Status' => $reconciliation['verified_collections_total'] ?? 0.0],
    ['Check / Line Item' => 'Total Refunds Issued (₹)', 'Amount / Status' => $reconciliation['refunds_total'] ?? 0.0],
    ['Check / Line Item' => 'Net Collections After Refunds (₹)', 'Amount / Status' => $reconciliation['net_collections_total'] ?? 0.0],
    ['Check / Line Item' => 'Outstanding Rental Receivables (₹)', 'Amount / Status' => $reconciliation['outstanding_receivables_total'] ?? 0.0],
    ['Check / Line Item' => 'Refundable Security Deposits Liability (₹)', 'Amount / Status' => $reconciliation['security_deposits_liability_total'] ?? 0.0],
    ['Check / Line Item' => 'Historical DB Archive Ledger (Pre-Booking Months) (₹)', 'Amount / Status' => $reconciliation['historical_archive_revenue'] ?? 0.0],
    ['Check / Line Item' => 'Offline / Manual DB Revenue Adjustments (₹)', 'Amount / Status' => $reconciliation['offline_total_revenue_adjustment'] ?? 0.0],
    ['Check / Line Item' => 'Combined System Revenue (Bookings + DB Adjustments) (₹)', 'Amount / Status' => $reconciliation['combined_system_revenue'] ?? 0.0],
    ['Check / Line Item' => 'Unassigned-Hub Bookings (Audit Flag Count)', 'Amount / Status' => count($diagnostics['unassigned_hub_bookings'] ?? [])],
    ['Check / Line Item' => 'Unassigned-Hub Vehicles (Audit Flag Count)', 'Amount / Status' => count($diagnostics['unassigned_hub_vehicles'] ?? [])],
    ['Check / Line Item' => 'Invalid-Date Bookings (Audit Flag Count)', 'Amount / Status' => count($diagnostics['invalid_date_bookings'] ?? [])],
    ['Check / Line Item' => 'Duplicate Payment Rows Skipped', 'Amount / Status' => (int)($diagnostics['duplicate_payments_skipped'] ?? 0)],
];

$periodLabel = $hasDateFilter ? (($fromYmd ?: 'Start') . ' to ' . ($toYmd ?: 'Present')) : 'All Time';
$summaryRows = [
    ['Metric' => 'Export Generated At', 'Value' => date('Y-m-d H:i:s')],
    ['Metric' => 'Hub Scope', 'Value' => $scopeLabel],
    ['Metric' => 'Selected Date Range', 'Value' => $periodLabel],
    ['Metric' => 'Status Filter', 'Value' => strtoupper($statusFilter)],
    ['Metric' => 'Sort Order', 'Value' => $sortOrder === 'asc' ? 'Oldest Date First' : 'Newest Date First'],
    ['Metric' => '--- Filtered KPI Summary ---', 'Value' => '---'],
    ['Metric' => 'Non-Cancelled Bookings', 'Value' => (int)($live['total_bookings'] ?? 0)],
    ['Metric' => 'Cancelled Bookings', 'Value' => (int)($live['cancelled_bookings'] ?? 0)],
    ['Metric' => 'Paid / Revenue-Eligible Bookings', 'Value' => (int)($live['paid_bookings'] ?? 0)],
    ['Metric' => 'Active / On-Trip Rentals', 'Value' => (int)($live['active_trips'] ?? 0)],
    ['Metric' => 'Scheduled Upcoming Bookings', 'Value' => (int)($live['scheduled_bookings'] ?? 0)],
    ['Metric' => 'Completed Trips', 'Value' => (int)($live['completed_trips'] ?? 0)],
    ['Metric' => 'Awaiting Payment Verification (Excl. Cancelled)', 'Value' => (int)($live['pending_payments'] ?? 0)],
    ['Metric' => 'Pending KYC Reviews', 'Value' => (int)($live['pending_docs'] ?? 0)],
    ['Metric' => 'Net Rental Revenue Excl. Deposit (₹)', 'Value' => (float)($live['booking_revenue'] ?? 0.0)],
    ['Metric' => 'Total System Revenue Incl. DB Archive (₹)', 'Value' => (float)($live['total_revenue'] ?? 0.0)],
    ['Metric' => 'Verified Collections (₹)', 'Value' => (float)($live['verified_collections'] ?? 0.0)],
    ['Metric' => 'Total Refunds (₹)', 'Value' => (float)($live['total_refunds'] ?? 0.0)],
    ['Metric' => 'Net Collections After Refunds (₹)', 'Value' => (float)($live['net_collections'] ?? 0.0)],
    ['Metric' => 'Outstanding Receivables (₹)', 'Value' => (float)($live['outstanding_amount'] ?? 0.0)],
    ['Metric' => 'Security Deposits Held (Separate Liability) (₹)', 'Value' => (float)($live['security_deposits_held'] ?? 0.0)],
    ['Metric' => '--- Fleet State Summary ---', 'Value' => '---'],
    ['Metric' => 'Total Registered Vehicles', 'Value' => (int)($live['total_registered_vehicles'] ?? 0)],
    ['Metric' => 'Active Operational Fleet', 'Value' => (int)($live['active_fleet'] ?? 0)],
    ['Metric' => 'Available (DB Recorded)', 'Value' => (int)($live['available_recorded'] ?? 0)],
    ['Metric' => 'On-Trip / On-Road', 'Value' => (int)($live['on_road_fleet'] ?? 0)],
    ['Metric' => 'Available in Yard', 'Value' => (int)($live['available_fleet'] ?? 0)],
    ['Metric' => 'Maintenance', 'Value' => (int)($live['maintenance_fleet'] ?? 0)],
    ['Metric' => 'Inactive Vehicles', 'Value' => (int)($live['inactive_fleet'] ?? 0)],
    ['Metric' => 'Removed Vehicles', 'Value' => (int)($live['removed_fleet'] ?? 0)],
    ['Metric' => 'Fleet Occupancy (%)', 'Value' => (float)($live['occupancy_pct'] ?? 0.0)],
];

if ($format === 'json' || (!isset($_GET['format']) && !isset($_GET['csv']))) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => 'success',
        'success' => true,
        'filters' => $filters,
        'data' => [
            'summary' => $summaryRows,
            'summary_stats' => $live,
            'reconciliation' => $reconciliationExport,
            'reconciliation_summary' => $reconciliation,
            'diagnostics' => $diagnostics,
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

// CSV Export
$filename = 'KRUIZLY_Export_' . ($fromYmd ?: 'all') . '_to_' . ($toYmd ?: 'present') . '_' . date('Ymd_His') . '.csv';
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
        fputcsv($out, ['No records found.']);
    }
    fputcsv($out, []);
}

writeExportSection($out, 'SUMMARY & KPI METRICS', $summaryRows);
writeExportSection($out, 'FINANCIAL RECONCILIATION', $reconciliationExport);
writeExportSection($out, 'DAILY KPI BIFURCATION (DATE -> MONTH)', $dailyExport);
writeExportSection($out, 'MONTHLY KPI LEDGER', $monthlyExport);
writeExportSection($out, 'HUB KPI METRICS', $hubsExport);
writeExportSection($out, 'BOOKINGS (SORTED ' . strtoupper($sortOrder) . ')', $bookingsExport);
writeExportSection($out, 'FLEET VEHICLES', $vehiclesExport);
writeExportSection($out, 'PAYMENTS', $paymentsExport);
writeExportSection($out, 'USERS', $usersExport);
writeExportSection($out, 'COUPONS', $couponsExport);
writeExportSection($out, 'VERIFICATION (KYC)', $verificationExport);

fclose($out);
exit;
