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

function formatVerDocUrl(?string $val): ?string {
    if (!$val) return null;
    $val = trim($val);
    if (!$val) return null;
    if (str_starts_with($val, 'http://') || str_starts_with($val, 'https://') || str_starts_with($val, '/api/media/')) {
        return $val;
    }
    return '/api/media/file.php?id=' . urlencode($val);
}

$verifications = array_map(function($v) {
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
        'licenseFrontURL' => formatVerDocUrl($v['license_front_media_id']),
        'licenseBackURL' => formatVerDocUrl($v['license_back_media_id']),
        'aadharNumber' => $v['aadhar_number'],
        'aadharFrontMediaId' => $v['aadhar_front_media_id'],
        'aadharBackMediaId' => $v['aadhar_back_media_id'],
        'aadharStatus' => $v['aadhar_status'],
        'aadharFrontURL' => formatVerDocUrl($v['aadhar_front_media_id']),
        'aadharBackURL' => formatVerDocUrl($v['aadhar_back_media_id']),
        'panNumber' => $v['pan_number'],
        'panFrontMediaId' => $v['pan_front_media_id'],
        'panBackMediaId' => $v['pan_back_media_id'],
        'panStatus' => $v['pan_status'],
        'panFrontURL' => formatVerDocUrl($v['pan_front_media_id']),
        'panBackURL' => formatVerDocUrl($v['pan_back_media_id']),
        'overallStatus' => $v['overall_status'],
        'rejectionReason' => $v['rejection_reason'],
        'verifiedBy' => $v['verified_by'],
        'verifiedAt' => $v['verified_at'],
        'createdAt' => $v['created_at'],
        'updatedAt' => $v['updated_at']
    ];
}, $rows);

sendJsonResponse(['success' => true, 'count' => count($verifications), 'verifications' => $verifications]);
