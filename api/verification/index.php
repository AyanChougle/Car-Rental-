<?php
/**
 * api/verification/index.php
 * GET /api/verification - List KYC submissions for admin review
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin', 'manager', 'executive');

$rows = Database::fetchAll(
    "SELECT v.*, u.email as user_email, u.name as user_name, u.phone as user_phone, u.role as user_role, u.status as user_status, u.metadata as user_metadata
     FROM verification v
     LEFT JOIN users u ON v.firebase_uid = u.firebase_uid
     ORDER BY v.created_at DESC"
);

// Scan storage/users directory for disk-based KYC uploads
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
            if (!is_dir($entryPath)) continue;

            $userKey = $entry;
            $userData = [];

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

                    $cdSuffix = '/';
                    if (str_ends_with($cd, '/verification') || str_ends_with($cd, '\\verification')) {
                        $cdSuffix = '/verification/';
                    } elseif (str_ends_with($cd, '/personal') || str_ends_with($cd, '\\personal')) {
                        $cdSuffix = '/personal/';
                    }

                    $relPath = 'users/' . $entry . $cdSuffix . $df;
                    $docUrl = '/api/media/file.php?path=' . urlencode($relPath);
                    if ($ext === 'pdf') {
                        $docUrl .= '&ext=.pdf';
                    }
                    $lowerDf = strtolower($df);

                    $isLicense = str_contains($lowerDf, 'license') || str_contains($lowerDf, 'dl') || str_contains($lowerDf, 'driving');
                    $isAadhar = str_contains($lowerDf, 'aadhar') || str_contains($lowerDf, 'adhar') || str_contains($lowerDf, 'uidai');
                    $isPan = str_contains($lowerDf, 'pan');
                    $isBack = str_contains($lowerDf, 'back');

                    if ($isLicense) {
                        if ($isBack) {
                            $userData['licenseBackURL'] = $userData['licenseBackURL'] ?? $docUrl;
                        } else {
                            $userData['licenseFrontURL'] = $userData['licenseFrontURL'] ?? $docUrl;
                        }
                    } elseif ($isAadhar) {
                        if ($isBack) {
                            $userData['aadharBackURL'] = $userData['aadharBackURL'] ?? $docUrl;
                        } else {
                            $userData['aadharFrontURL'] = $userData['aadharFrontURL'] ?? $docUrl;
                        }
                    } elseif ($isPan) {
                        if ($isBack) {
                            $userData['panBackURL'] = $userData['panBackURL'] ?? $docUrl;
                        } else {
                            $userData['panFrontURL'] = $userData['panFrontURL'] ?? $docUrl;
                        }
                    }
                }
            }

            if (!empty($userData)) {
                $diskUsersMap[$userKey] = $userData;
            }
        }
    }
} catch (Throwable $e) {
    // Best-effort storage scan
}

$allMediaIds = [];
foreach ($rows as $r) {
    foreach (['license_front_media_id', 'license_back_media_id', 'aadhar_front_media_id', 'aadhar_back_media_id', 'pan_front_media_id', 'pan_back_media_id'] as $k) {
        $mid = trim((string)($r[$k] ?? ''));
        if ($mid && !in_array($mid, $allMediaIds, true)) {
            $allMediaIds[] = $mid;
        }
    }
}

$mediaMap = [];
if (!empty($allMediaIds)) {
    try {
        $placeholders = implode(',', array_fill(0, count($allMediaIds), '?'));
        $mRows = Database::fetchAll("SELECT media_id, mime_type, original_name, stored_name, stored_path FROM media WHERE media_id IN ($placeholders)", $allMediaIds);
        foreach ($mRows as $mr) {
            $mediaMap[$mr['media_id']] = $mr;
        }
    } catch (Throwable $e) {
        // Continue if media table query fails
    }
}

function isDocPdf(?string $val, array $mediaMap): bool {
    if (!$val) return false;
    $val = trim($val);
    if (str_contains(strtolower($val), '.pdf') || str_contains(strtolower($val), 'ext=.pdf')) return true;
    if (isset($mediaMap[$val])) {
        $m = $mediaMap[$val];
        if (($m['mime_type'] ?? '') === 'application/pdf') return true;
        if (str_contains(strtolower($m['original_name'] ?? ''), '.pdf')) return true;
        if (str_contains(strtolower($m['stored_path'] ?? ''), '.pdf')) return true;
    }
    return false;
}

function formatVerDocUrl(?string $val, array $mediaMap): ?string {
    if (!$val) return null;
    $val = trim($val);
    if (!$val) return null;
    $isPdf = isDocPdf($val, $mediaMap);
    if (str_starts_with($val, 'http://') || str_starts_with($val, 'https://') || str_starts_with($val, '/api/media/')) {
        if ($isPdf && !str_contains(strtolower($val), '.pdf')) {
            $val .= (str_contains($val, '?') ? '&' : '?') . 'ext=.pdf';
        }
        return $val;
    }
    $url = '/api/media/file.php?id=' . urlencode($val);
    if ($isPdf && !str_contains(strtolower($url), '.pdf')) {
        $url .= '&ext=.pdf';
    }
    return $url;
}

$verifications = array_map(function($v) use ($mediaMap, $diskUsersMap) {
    $uid = trim((string)($v['firebase_uid'] ?? ''));
    $diskMatch = $diskUsersMap[$uid] ?? null;

    $meta = [];
    if (!empty($v['user_metadata'])) {
        $decoded = is_string($v['user_metadata']) ? json_decode($v['user_metadata'], true) : $v['user_metadata'];
        if (is_array($decoded)) {
            $meta = $decoded;
        }
    }

    $licFront = $v['license_front_media_id'] ?: ($diskMatch['licenseFrontURL'] ?? ($meta['licenseFrontURL'] ?? $meta['licenseURL'] ?? $meta['license_front'] ?? null));
    $licBack  = $v['license_back_media_id']  ?: ($diskMatch['licenseBackURL'] ?? ($meta['licenseBackURL'] ?? $meta['license_back'] ?? null));
    $adhFront = $v['aadhar_front_media_id']  ?: ($diskMatch['aadharFrontURL'] ?? ($meta['aadharFrontURL'] ?? $meta['aadharURL'] ?? $meta['aadhar_front'] ?? null));
    $adhBack  = $v['aadhar_back_media_id']   ?: ($diskMatch['aadharBackURL'] ?? ($meta['aadharBackURL'] ?? $meta['aadhar_back'] ?? null));
    $panFront = $v['pan_front_media_id']     ?: ($diskMatch['panFrontURL'] ?? ($meta['panFrontURL'] ?? $meta['panURL'] ?? $meta['pan_front'] ?? null));
    $panBack  = $v['pan_back_media_id']      ?: ($diskMatch['panBackURL'] ?? ($meta['panBackURL'] ?? $meta['pan_back'] ?? null));

    $licFrontPdf = isDocPdf($licFront, $mediaMap);
    $licBackPdf  = isDocPdf($licBack, $mediaMap);
    $adhFrontPdf = isDocPdf($adhFront, $mediaMap);
    $adhBackPdf  = isDocPdf($adhBack, $mediaMap);
    $panFrontPdf = isDocPdf($panFront, $mediaMap);
    $panBackPdf  = isDocPdf($panBack, $mediaMap);

    return [
        'id' => $v['verification_id'] ?? ('VER-' . ($v['id'] ?? $uid)),
        'verificationId' => $v['verification_id'] ?? ('VER-' . ($v['id'] ?? $uid)),
        'userId' => $v['firebase_uid'],
        'firebaseUid' => $v['firebase_uid'],
        'fullName' => $v['full_name'] ?: ($v['user_name'] ?? 'Customer'),
        'email' => $v['user_email'] ?? '',
        'phone' => $v['phone'] ?: ($v['user_phone'] ?? ''),
        'licenseNumber' => $v['license_number'] ?? ($meta['licenseNumber'] ?? null),
        'licenseFrontMediaId' => $v['license_front_media_id'],
        'licenseBackMediaId' => $v['license_back_media_id'],
        'licenseStatus' => $v['license_status'] ?: ($licFront ? 'pending' : 'not_submitted'),
        'licenseFrontURL' => formatVerDocUrl($licFront, $mediaMap),
        'licenseBackURL' => formatVerDocUrl($licBack, $mediaMap),
        'licenseFrontIsPdf' => $licFrontPdf,
        'licenseBackIsPdf' => $licBackPdf,
        'aadharNumber' => $v['aadhar_number'] ?? ($meta['aadharNumber'] ?? null),
        'aadharFrontMediaId' => $v['aadhar_front_media_id'],
        'aadharBackMediaId' => $v['aadhar_back_media_id'],
        'aadharStatus' => $v['aadhar_status'] ?: ($adhFront ? 'pending' : 'not_submitted'),
        'aadharFrontURL' => formatVerDocUrl($adhFront, $mediaMap),
        'aadharBackURL' => formatVerDocUrl($adhBack, $mediaMap),
        'aadharFrontIsPdf' => $adhFrontPdf,
        'aadharBackIsPdf' => $adhBackPdf,
        'panNumber' => $v['pan_number'] ?? ($meta['panNumber'] ?? null),
        'panFrontMediaId' => $v['pan_front_media_id'],
        'panBackMediaId' => $v['pan_back_media_id'],
        'panStatus' => $v['pan_status'] ?: ($panFront ? 'pending' : 'not_submitted'),
        'panFrontURL' => formatVerDocUrl($panFront, $mediaMap),
        'panBackURL' => formatVerDocUrl($panBack, $mediaMap),
        'panFrontIsPdf' => $panFrontPdf,
        'panBackIsPdf' => $panBackPdf,
        'overallStatus' => $v['overall_status'] ?? 'pending',
        'rejectionReason' => $v['rejection_reason'] ?? null,
        'verifiedBy' => $v['verified_by'] ?? null,
        'verifiedAt' => $v['verified_at'] ?? null,
        'createdAt' => $v['created_at'] ?? null,
        'updatedAt' => $v['updated_at'] ?? null
    ];
}, $rows);

sendJsonResponse(['success' => true, 'count' => count($verifications), 'verifications' => $verifications]);
