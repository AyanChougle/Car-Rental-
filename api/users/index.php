<?php
/**
 * api/users/index.php
 * GET /api/users - List all users (admin, manager, executive)
 * PHP 7.4+ compatible (no str_contains / str_starts_with / str_ends_with)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin', 'manager', 'executive');

function formatDocUrl(?string $val): ?string {
    if (!$val) return null;
    $val = trim($val);
    if (!$val) return null;
    // Already a full URL or an API path
    if (
        strpos($val, 'http://') === 0 ||
        strpos($val, 'https://') === 0 ||
        strpos($val, '/api/media/') === 0
    ) {
        return $val;
    }
    return '/api/media/file.php?id=' . urlencode($val);
}

// ----------------------------------------------------------------
// Main query: join users + verification tables
// ----------------------------------------------------------------
$rows = Database::fetchAll(
    "SELECT
        u.id,
        u.firebase_uid,
        u.email,
        u.name,
        u.phone,
        u.age,
        u.role,
        u.status,
        u.metadata,
        u.ip_address,
        u.created_at,
        u.updated_at,
        v.license_number,
        v.license_front_media_id,
        v.license_back_media_id,
        v.aadhar_number,
        v.aadhar_front_media_id,
        v.aadhar_back_media_id,
        v.pan_number,
        v.pan_front_media_id,
        v.pan_back_media_id,
        v.license_status  AS v_license_status,
        v.aadhar_status   AS v_aadhar_status,
        v.pan_status      AS v_pan_status,
        v.overall_status  AS v_overall_status
     FROM users u
     LEFT JOIN verification v ON u.firebase_uid = v.firebase_uid
     ORDER BY u.id DESC"
);

// ----------------------------------------------------------------
// SCAN storage/users directory for extra KYC docs (best-effort)
// Never crash the endpoint if storage isn't accessible.
// ----------------------------------------------------------------
$storageUsersDir = defined('STORAGE_ROOT')
    ? (STORAGE_ROOT . '/users')
    : (__DIR__ . '/../../storage/users');

$diskUsersMap = [];

try {
    if (is_dir($storageUsersDir)) {
        $entries = @scandir($storageUsersDir) ?: [];
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $entryPath = $storageUsersDir . '/' . $entry;

            // JSON file directly in storage/users (e.g. users.json, {uid}.json)
            if (is_file($entryPath) && strtolower(pathinfo($entryPath, PATHINFO_EXTENSION)) === 'json') {
                $json = json_decode((string)@file_get_contents($entryPath), true);
                if (is_array($json)) {
                    if (isset($json['users']) && is_array($json['users'])) {
                        foreach ($json['users'] as $ju) {
                            if (!is_array($ju)) continue;
                            $k = trim((string)($ju['firebase_uid'] ?? $ju['uid'] ?? $ju['email'] ?? ''));
                            if ($k) {
                                $diskUsersMap[$k] = array_merge($diskUsersMap[$k] ?? [], $ju);
                            }
                        }
                    } else {
                        $k = trim((string)($json['firebase_uid'] ?? $json['uid'] ?? $json['email'] ?? pathinfo($entry, PATHINFO_FILENAME)));
                        if ($k) {
                            $diskUsersMap[$k] = array_merge($diskUsersMap[$k] ?? [], $json);
                        }
                    }
                }
                continue;
            }

            // Sub-directory: storage/users/{firebase_uid}/
            if (!is_dir($entryPath)) continue;

            $userKey  = $entry;
            $userData = ['firebase_uid' => $userKey];

            // Look for JSON metadata inside folder
            foreach (['user.json', 'profile.json', 'data.json', 'metadata.json'] as $metaFile) {
                $metaPath = $entryPath . '/' . $metaFile;
                if (file_exists($metaPath)) {
                    $m = json_decode((string)@file_get_contents($metaPath), true);
                    if (is_array($m)) {
                        $userData = array_merge($userData, $m);
                    }
                }
            }

            // Scan for KYC image/PDF files
            $candidateDirs = [$entryPath, $entryPath . '/verification', $entryPath . '/personal'];
            foreach ($candidateDirs as $cd) {
                if (!is_dir($cd)) continue;
                $docFiles = @scandir($cd) ?: [];
                foreach ($docFiles as $df) {
                    if ($df === '.' || $df === '..') continue;
                    $dfPath = $cd . '/' . $df;
                    if (!is_file($dfPath)) continue;

                    $ext = strtolower(pathinfo($df, PATHINFO_EXTENSION));
                    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'gif'], true)) continue;

                    // Determine sub-path suffix
                    $cdSuffix = '';
                    if (substr($cd, -strlen('/verification')) === '/verification') {
                        $cdSuffix = '/verification/';
                    } elseif (substr($cd, -strlen('/personal')) === '/personal') {
                        $cdSuffix = '/personal/';
                    } else {
                        $cdSuffix = '/';
                    }

                    $relPath = 'users/' . $entry . $cdSuffix . $df;
                    $docUrl  = '/api/media/file.php?path=' . urlencode($relPath);
                    $lowerDf = strtolower($df);

                    $isLicense  = strpos($lowerDf, 'license') !== false || strpos($lowerDf, 'dl') !== false || strpos($lowerDf, 'driving') !== false;
                    $isAadhar   = strpos($lowerDf, 'aadhar') !== false || strpos($lowerDf, 'adhar') !== false || strpos($lowerDf, 'uidai') !== false;
                    $isPan      = strpos($lowerDf, 'pan') !== false;
                    $isBack     = strpos($lowerDf, 'back') !== false;

                    if ($isLicense) {
                        if ($isBack) {
                            $userData['licenseBackURL']  = $userData['licenseBackURL']  ?? $docUrl;
                        } else {
                            $userData['licenseFrontURL'] = $userData['licenseFrontURL'] ?? $docUrl;
                        }
                    } elseif ($isAadhar) {
                        if ($isBack) {
                            $userData['aadharBackURL']  = $userData['aadharBackURL']  ?? $docUrl;
                        } else {
                            $userData['aadharFrontURL'] = $userData['aadharFrontURL'] ?? $docUrl;
                        }
                    } elseif ($isPan) {
                        if ($isBack) {
                            $userData['panBackURL']  = $userData['panBackURL']  ?? $docUrl;
                        } else {
                            $userData['panFrontURL'] = $userData['panFrontURL'] ?? $docUrl;
                        }
                    }
                }
            }

            $diskUsersMap[$userKey] = array_merge($diskUsersMap[$userKey] ?? [], $userData);
        }
    }
} catch (Throwable $diskErr) {
    // Disk-scan errors must never crash the API - silently log and continue
    error_log('[api/users] storage scan error: ' . $diskErr->getMessage());
}

// ----------------------------------------------------------------
// Deduplicate & merge disk data into DB rows
// ----------------------------------------------------------------
$dedupedUsers = [];
$seenUsers    = [];

foreach ($rows as $u) {
    $uid   = trim((string)($u['firebase_uid'] ?? ''));
    $email = strtolower(trim((string)($u['email'] ?? '')));
    $key   = $uid ?: ($email ?: (string)($u['id'] ?? ''));
    if (isset($seenUsers[$key])) continue;
    $seenUsers[$key] = true;

    // Merge disk KYC URLs if available and DB entry is missing them
    $diskMatch = $diskUsersMap[$uid] ?? ($email ? ($diskUsersMap[$email] ?? null) : null);
    if ($diskMatch) {
        if (!empty($diskMatch['licenseFrontURL']) && empty($u['license_front_media_id'])) {
            $u['disk_license_front'] = $diskMatch['licenseFrontURL'];
        }
        if (!empty($diskMatch['licenseBackURL']) && empty($u['license_back_media_id'])) {
            $u['disk_license_back'] = $diskMatch['licenseBackURL'];
        }
        if (!empty($diskMatch['aadharFrontURL']) && empty($u['aadhar_front_media_id'])) {
            $u['disk_aadhar_front'] = $diskMatch['aadharFrontURL'];
        }
        if (!empty($diskMatch['aadharBackURL']) && empty($u['aadhar_back_media_id'])) {
            $u['disk_aadhar_back'] = $diskMatch['aadharBackURL'];
        }
        if (!empty($diskMatch['panFrontURL']) && empty($u['pan_front_media_id'])) {
            $u['disk_pan_front'] = $diskMatch['panFrontURL'];
        }
        if (!empty($diskMatch['panBackURL']) && empty($u['pan_back_media_id'])) {
            $u['disk_pan_back'] = $diskMatch['panBackURL'];
        }
        if (empty($u['license_number']) && !empty($diskMatch['licenseNumber'])) {
            $u['license_number'] = $diskMatch['licenseNumber'];
        }
        if (empty($u['aadhar_number']) && !empty($diskMatch['aadharNumber'])) {
            $u['aadhar_number'] = $diskMatch['aadharNumber'];
        }
        if (empty($u['pan_number']) && !empty($diskMatch['panNumber'])) {
            $u['pan_number'] = $diskMatch['panNumber'];
        }
    }

    $dedupedUsers[] = $u;
}

// Append disk-only users not present in DB
foreach ($diskUsersMap as $dk => $du) {
    $uid   = trim((string)($du['firebase_uid'] ?? $du['uid'] ?? $dk));
    $email = strtolower(trim((string)($du['email'] ?? '')));
    $key   = $uid ?: ($email ?: $dk);
    if (isset($seenUsers[$key])) continue;
    $seenUsers[$key] = true;
    $dedupedUsers[] = [
        'id'                   => null,
        'firebase_uid'         => $uid,
        'email'                => $email ?: ($uid . '@kruizly.com'),
        'name'                 => $du['name'] ?? $du['fullName'] ?? 'Customer',
        'phone'                => $du['phone'] ?? '',
        'age'                  => $du['age'] ?? null,
        'role'                 => $du['role'] ?? 'customer',
        'status'               => $du['status'] ?? 'active',
        'metadata'             => null,
        'ip_address'           => null,
        'created_at'           => $du['createdAt'] ?? date('Y-m-d H:i:s'),
        'updated_at'           => $du['updatedAt'] ?? date('Y-m-d H:i:s'),
        'license_number'       => $du['licenseNumber'] ?? null,
        'license_front_media_id' => null,
        'license_back_media_id'  => null,
        'aadhar_number'        => $du['aadharNumber'] ?? null,
        'aadhar_front_media_id' => null,
        'aadhar_back_media_id'  => null,
        'pan_number'           => $du['panNumber'] ?? null,
        'pan_front_media_id'   => null,
        'pan_back_media_id'    => null,
        'v_license_status'     => $du['licenseStatus'] ?? (!empty($du['licenseFrontURL']) ? 'pending' : 'not_submitted'),
        'v_aadhar_status'      => $du['aadharStatus']  ?? (!empty($du['aadharFrontURL'])  ? 'pending' : 'not_submitted'),
        'v_pan_status'         => $du['panStatus']     ?? (!empty($du['panFrontURL'])     ? 'pending' : 'not_submitted'),
        'v_overall_status'     => null,
        'disk_license_front'   => $du['licenseFrontURL'] ?? null,
        'disk_license_back'    => $du['licenseBackURL']  ?? null,
        'disk_aadhar_front'    => $du['aadharFrontURL']  ?? null,
        'disk_aadhar_back'     => $du['aadharBackURL']   ?? null,
        'disk_pan_front'       => $du['panFrontURL']     ?? null,
        'disk_pan_back'        => $du['panBackURL']      ?? null,
    ];
}

// ----------------------------------------------------------------
// Build output array
// ----------------------------------------------------------------
$users = [];
foreach ($dedupedUsers as $u) {
    $metadata = [];
    if (!empty($u['metadata'])) {
        $decoded = is_string($u['metadata'])
            ? json_decode($u['metadata'], true)
            : $u['metadata'];
        if (is_array($decoded)) {
            $metadata = $decoded;
        }
    }

    // Resolve document URLs: prefer DB media IDs, fallback to disk URLs, then metadata
    $licFront = $u['license_front_media_id'] ?: ($u['disk_license_front'] ?? ($metadata['licenseFrontURL'] ?? $metadata['licenseURL'] ?? null));
    $licBack  = $u['license_back_media_id']  ?: ($u['disk_license_back']  ?? ($metadata['licenseBackURL']  ?? null));
    $adhFront = $u['aadhar_front_media_id']  ?: ($u['disk_aadhar_front']  ?? ($metadata['aadharFrontURL']  ?? $metadata['aadharURL']  ?? null));
    $adhBack  = $u['aadhar_back_media_id']   ?: ($u['disk_aadhar_back']   ?? ($metadata['aadharBackURL']   ?? null));
    $panFront = $u['pan_front_media_id']     ?: ($u['disk_pan_front']     ?? ($metadata['panFrontURL']     ?? null));
    $panBack  = $u['pan_back_media_id']      ?: ($u['disk_pan_back']      ?? ($metadata['panBackURL']      ?? null));

    // Merge verification statuses: DB verification table wins, fall back to users table column
    $vLic  = $u['v_license_status'] ?? null;
    $vAdh  = $u['v_aadhar_status']  ?? null;
    $vPan  = $u['v_pan_status']     ?? null;

    // Simple merge helper (inline, no closure type hints for PHP 7.4 compat)
    $resolveStatus = static function($verStatus, $userStatus): string {
        if ($verStatus === 'verified'  || $userStatus === 'verified')  return 'verified';
        if ($verStatus === 'rejected'  || $userStatus === 'rejected')  return 'rejected';
        if ($verStatus === 'pending'   || $userStatus === 'pending')   return 'pending';
        return (string)($verStatus ?: ($userStatus ?: 'not_submitted'));
    };

    $users[] = [
        'id'                  => $u['firebase_uid'],
        'dbId'                => $u['id'],
        'uid'                 => $u['firebase_uid'],
        'email'               => $u['email'],
        'name'                => $u['name'],
        'phone'               => $u['phone'],
        'age'                 => $u['age'],
        'role'                => $u['role'],
        'status'              => $u['status'],
        'licenseStatus'       => $resolveStatus($vLic, null),
        'aadharStatus'        => $resolveStatus($vAdh, null),
        'panStatus'           => $resolveStatus($vPan, null),
        'licenseNumber'       => $u['license_number']  ?? null,
        'aadharNumber'        => $u['aadhar_number']   ?? null,
        'panNumber'           => $u['pan_number']      ?? null,
        'ipAddress'           => $u['ip_address']      ?? null,
        'licenseFrontURL'     => formatDocUrl($licFront),
        'licenseBackURL'      => formatDocUrl($licBack),
        'aadharFrontURL'      => formatDocUrl($adhFront),
        'aadharBackURL'       => formatDocUrl($adhBack),
        'panFrontURL'         => formatDocUrl($panFront),
        'panBackURL'          => formatDocUrl($panBack),
        'licenseFrontMediaId' => $u['license_front_media_id'] ?? null,
        'licenseBackMediaId'  => $u['license_back_media_id']  ?? null,
        'aadharFrontMediaId'  => $u['aadhar_front_media_id']  ?? null,
        'aadharBackMediaId'   => $u['aadhar_back_media_id']   ?? null,
        'panFrontMediaId'     => $u['pan_front_media_id']     ?? null,
        'panBackMediaId'      => $u['pan_back_media_id']      ?? null,
        'createdAt'           => $u['created_at']  ?? null,
        'updatedAt'           => $u['updated_at']  ?? null,
    ];
}

sendJsonResponse([
    'success' => true,
    'count'   => count($users),
    'users'   => $users,
]);
