<?php
/**
 * api/users/index.php
 * GET /api/users - List all users (admin, manager, executive)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin', 'manager', 'executive');

function formatDocUrl(?string $val): ?string {
    if (!$val) return null;
    $val = trim($val);
    if (!$val) return null;
    if (str_starts_with($val, 'http://') || str_starts_with($val, 'https://') || str_starts_with($val, '/api/media/')) {
        return $val;
    }
    return '/api/media/file.php?id=' . urlencode($val);
}

$rows = Database::fetchAll(
    "SELECT 
        u.*,
        v.license_number,
        v.license_front_media_id,
        v.license_back_media_id,
        v.aadhar_number,
        v.aadhar_front_media_id,
        v.aadhar_back_media_id,
        v.pan_number,
        v.pan_front_media_id,
        v.pan_back_media_id,
        v.license_status AS v_license_status,
        v.aadhar_status AS v_aadhar_status,
        v.pan_status AS v_pan_status,
        v.overall_status AS v_overall_status
     FROM users u
     LEFT JOIN verification v ON u.firebase_uid = v.firebase_uid
     ORDER BY u.created_at DESC"
);

$users = array_map(function($u) {
    $metadata = [];
    if (!empty($u['metadata'])) {
        $metadata = is_string($u['metadata']) ? json_decode($u['metadata'], true) : $u['metadata'];
    }

    $licFront = $u['license_front_media_id'] ?: ($metadata['licenseFrontURL'] ?? $metadata['licenseURL'] ?? null);
    $licBack = $u['license_back_media_id'] ?: ($metadata['licenseBackURL'] ?? null);
    $adhFront = $u['aadhar_front_media_id'] ?: ($metadata['aadharFrontURL'] ?? $metadata['aadharURL'] ?? null);
    $adhBack = $u['aadhar_back_media_id'] ?: ($metadata['aadharBackURL'] ?? null);
    $panFront = $u['pan_front_media_id'] ?: ($metadata['panFrontURL'] ?? null);
    $panBack = $u['pan_back_media_id'] ?: ($metadata['panBackURL'] ?? null);

    return [
        'id' => $u['firebase_uid'],
        'dbId' => $u['id'],
        'uid' => $u['firebase_uid'],
        'email' => $u['email'],
        'name' => $u['name'],
        'phone' => $u['phone'],
        'age' => $u['age'],
        'role' => $u['role'],
        'status' => $u['status'],
        'licenseStatus' => $u['v_license_status'] ?: $u['license_status'],
        'aadharStatus' => $u['v_aadhar_status'] ?: $u['aadhar_status'],
        'panStatus' => $u['v_pan_status'] ?: $u['pan_status'],
        'licenseNumber' => $u['license_number'] ?? null,
        'aadharNumber' => $u['aadhar_number'] ?? null,
        'panNumber' => $u['pan_number'] ?? null,
        'ipAddress' => $u['ip_address'],
        'licenseFrontURL' => formatDocUrl($licFront),
        'licenseBackURL' => formatDocUrl($licBack),
        'aadharFrontURL' => formatDocUrl($adhFront),
        'aadharBackURL' => formatDocUrl($adhBack),
        'panFrontURL' => formatDocUrl($panFront),
        'panBackURL' => formatDocUrl($panBack),
        'licenseFrontMediaId' => $u['license_front_media_id'],
        'licenseBackMediaId' => $u['license_back_media_id'],
        'aadharFrontMediaId' => $u['aadhar_front_media_id'],
        'aadharBackMediaId' => $u['aadhar_back_media_id'],
        'panFrontMediaId' => $u['pan_front_media_id'],
        'panBackMediaId' => $u['pan_back_media_id'],
        'createdAt' => $u['created_at'],
        'updatedAt' => $u['updated_at']
    ];
}, $rows);

sendJsonResponse([
    'success' => true,
    'count' => count($users),
    'users' => $users
]);
