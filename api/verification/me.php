<?php
/**
 * api/verification/me.php
 * GET /api/verification/me - Current user's KYC verification status & document previews
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../config/config.php';

$user = Auth::requireAuth();

$v = Database::fetchOne(
    "SELECT * FROM verification WHERE firebase_uid = ? ORDER BY created_at DESC LIMIT 1",
    [$user['firebase_uid']]
);

// Helper to format document URLs
function resolveDocUrl(?string $val): ?string {
    if (!$val) return null;
    $val = trim($val);
    if (!$val) return null;
    if (str_starts_with($val, 'http://') || str_starts_with($val, 'https://') || str_starts_with($val, '/api/media/')) {
        return $val;
    }
    return '/api/media/file.php?id=' . urlencode($val);
}

$licenseFrontUrl = resolveDocUrl($v['license_front_media_id'] ?? null);
$licenseBackUrl = resolveDocUrl($v['license_back_media_id'] ?? null);
$aadharFrontUrl = resolveDocUrl($v['aadhar_front_media_id'] ?? null);
$aadharBackUrl = resolveDocUrl($v['aadhar_back_media_id'] ?? null);
$panFrontUrl = resolveDocUrl($v['pan_front_media_id'] ?? null);
$panBackUrl = resolveDocUrl($v['pan_back_media_id'] ?? null);

// Disk and metadata fallbacks if any document URL is missing
$safeUid = preg_replace('/[^a-zA-Z0-9_-]/', '_', $user['firebase_uid']);
$userVerDir = STORAGE_ROOT . '/users/' . $safeUid . '/verification';

if (is_dir($userVerDir)) {
    $diskFiles = @scandir($userVerDir) ?: [];
    foreach ($diskFiles as $df) {
        if ($df === '.' || $df === '..') continue;
        $docUrl = '/api/media/file.php?id=' . urlencode("users/$safeUid/verification/$df");
        $lowerDf = strtolower($df);

        $isLicense = str_contains($lowerDf, 'license') || str_contains($lowerDf, 'dl') || str_contains($lowerDf, 'driving');
        $isAadhar = str_contains($lowerDf, 'aadhar') || str_contains($lowerDf, 'adhar') || str_contains($lowerDf, 'uidai');
        $isPan = str_contains($lowerDf, 'pan');
        $isBack = str_contains($lowerDf, 'back');

        if ($isLicense) {
            if ($isBack) {
                $licenseBackUrl = $licenseBackUrl ?? $docUrl;
            } else {
                $licenseFrontUrl = $licenseFrontUrl ?? $docUrl;
            }
        } elseif ($isAadhar) {
            if ($isBack) {
                $aadharBackUrl = $aadharBackUrl ?? $docUrl;
            } else {
                $aadharFrontUrl = $aadharFrontUrl ?? $docUrl;
            }
        } elseif ($isPan) {
            if ($isBack) {
                $panBackUrl = $panBackUrl ?? $docUrl;
            } else {
                $panFrontUrl = $panFrontUrl ?? $docUrl;
            }
        }
    }
}

// Also check user's metadata JSON if present
if (!empty($user['metadata'])) {
    $meta = is_array($user['metadata']) ? $user['metadata'] : json_decode((string)$user['metadata'], true);
    if (is_array($meta)) {
        $licenseFrontUrl = $licenseFrontUrl ?? resolveDocUrl($meta['licenseFrontURL'] ?? $meta['licenseFront'] ?? null);
        $licenseBackUrl = $licenseBackUrl ?? resolveDocUrl($meta['licenseBackURL'] ?? $meta['licenseBack'] ?? null);
        $aadharFrontUrl = $aadharFrontUrl ?? resolveDocUrl($meta['aadharFrontURL'] ?? $meta['aadharFront'] ?? null);
        $aadharBackUrl = $aadharBackUrl ?? resolveDocUrl($meta['aadharBackURL'] ?? $meta['aadharBack'] ?? null);
        $panFrontUrl = $panFrontUrl ?? resolveDocUrl($meta['panFrontURL'] ?? $meta['panFront'] ?? null);
        $panBackUrl = $panBackUrl ?? resolveDocUrl($meta['panBackURL'] ?? $meta['panBack'] ?? null);
    }
}

if (!$v) {
    sendJsonResponse([
        'success' => true,
        'hasSubmission' => ($licenseFrontUrl !== null || $aadharFrontUrl !== null || $user['license_status'] !== 'not_submitted'),
        'verification' => [
            'licenseStatus' => $user['license_status'] ?? 'not_submitted',
            'aadharStatus' => $user['aadhar_status'] ?? 'not_submitted',
            'panStatus' => $user['pan_status'] ?? 'not_submitted',
            'overallStatus' => 'not_submitted',
            'licenseFrontUrl' => $licenseFrontUrl,
            'licenseBackUrl' => $licenseBackUrl,
            'aadharFrontUrl' => $aadharFrontUrl,
            'aadharBackUrl' => $aadharBackUrl,
            'panFrontUrl' => $panFrontUrl,
            'panBackUrl' => $panBackUrl,
        ]
    ]);
}

sendJsonResponse([
    'success' => true,
    'hasSubmission' => true,
    'verification' => [
        'id' => $v['verification_id'],
        'licenseStatus' => $v['license_status'],
        'aadharStatus' => $v['aadhar_status'],
        'panStatus' => $v['pan_status'],
        'overallStatus' => $v['overall_status'],
        'rejectionReason' => $v['rejection_reason'],
        'licenseNumber' => $v['license_number'],
        'aadharNumber' => $v['aadhar_number'],
        'panNumber' => $v['pan_number'],
        'licenseFrontUrl' => $licenseFrontUrl,
        'licenseBackUrl' => $licenseBackUrl,
        'aadharFrontUrl' => $aadharFrontUrl,
        'aadharBackUrl' => $aadharBackUrl,
        'panFrontUrl' => $panFrontUrl,
        'panBackUrl' => $panBackUrl,
        'createdAt' => $v['created_at']
    ]
]);
