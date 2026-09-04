<?php
/**
 * api/verification/me.php
 * GET /api/verification/me - Current user's KYC verification status
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();

$v = Database::fetchOne(
    "SELECT * FROM verification WHERE firebase_uid = ? ORDER BY created_at DESC LIMIT 1",
    [$user['firebase_uid']]
);

if (!$v) {
    sendJsonResponse([
        'success' => true,
        'hasSubmission' => false,
        'verification' => [
            'licenseStatus' => $user['license_status'],
            'aadharStatus' => $user['aadhar_status'],
            'panStatus' => $user['pan_status'],
            'overallStatus' => 'not_submitted'
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
        'createdAt' => $v['created_at']
    ]
]);
