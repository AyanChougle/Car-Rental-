<?php
/**
 * api/verification/index.php
 * GET /api/verification - List KYC submissions for admin review
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin', 'manager', 'executive');

$rows = Database::fetchAll(
    "SELECT v.*, u.email as user_email, u.role as user_role, u.status as user_status
     FROM verification v
     LEFT JOIN users u ON v.firebase_uid = u.firebase_uid
     ORDER BY v.created_at DESC"
);

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
    if (str_contains(strtolower($val), '.pdf')) return true;
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

$verifications = array_map(function($v) use ($mediaMap) {
    $licFrontPdf = isDocPdf($v['license_front_media_id'], $mediaMap);
    $licBackPdf = isDocPdf($v['license_back_media_id'], $mediaMap);
    $adhFrontPdf = isDocPdf($v['aadhar_front_media_id'], $mediaMap);
    $adhBackPdf = isDocPdf($v['aadhar_back_media_id'], $mediaMap);
    $panFrontPdf = isDocPdf($v['pan_front_media_id'], $mediaMap);
    $panBackPdf = isDocPdf($v['pan_back_media_id'], $mediaMap);

    return [
        'id' => $v['verification_id'],
        'verificationId' => $v['verification_id'],
        'userId' => $v['firebase_uid'],
        'firebaseUid' => $v['firebase_uid'],
        'fullName' => $v['full_name'],
        'email' => $v['user_email'],
        'phone' => $v['phone'],
        'licenseNumber' => $v['license_number'],
        'licenseFrontMediaId' => $v['license_front_media_id'],
        'licenseBackMediaId' => $v['license_back_media_id'],
        'licenseStatus' => $v['license_status'],
        'licenseFrontURL' => formatVerDocUrl($v['license_front_media_id'], $mediaMap),
        'licenseBackURL' => formatVerDocUrl($v['license_back_media_id'], $mediaMap),
        'licenseFrontIsPdf' => $licFrontPdf,
        'licenseBackIsPdf' => $licBackPdf,
        'aadharNumber' => $v['aadhar_number'],
        'aadharFrontMediaId' => $v['aadhar_front_media_id'],
        'aadharBackMediaId' => $v['aadhar_back_media_id'],
        'aadharStatus' => $v['aadhar_status'],
        'aadharFrontURL' => formatVerDocUrl($v['aadhar_front_media_id'], $mediaMap),
        'aadharBackURL' => formatVerDocUrl($v['aadhar_back_media_id'], $mediaMap),
        'aadharFrontIsPdf' => $adhFrontPdf,
        'aadharBackIsPdf' => $adhBackPdf,
        'panNumber' => $v['pan_number'],
        'panFrontMediaId' => $v['pan_front_media_id'],
        'panBackMediaId' => $v['pan_back_media_id'],
        'panStatus' => $v['pan_status'],
        'panFrontURL' => formatVerDocUrl($v['pan_front_media_id'], $mediaMap),
        'panBackURL' => formatVerDocUrl($v['pan_back_media_id'], $mediaMap),
        'panFrontIsPdf' => $panFrontPdf,
        'panBackIsPdf' => $panBackPdf,
        'overallStatus' => $v['overall_status'],
        'rejectionReason' => $v['rejection_reason'],
        'verifiedBy' => $v['verified_by'],
        'verifiedAt' => $v['verified_at'],
        'createdAt' => $v['created_at'],
        'updatedAt' => $v['updated_at']
    ];
}, $rows);

sendJsonResponse(['success' => true, 'count' => count($verifications), 'verifications' => $verifications]);
