<?php
/**
 * api/verification/submit.php
 * POST /api/verification/submit - Customer identity / KYC document submission
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/FileStorageService.php';

$user = Auth::requireAuth();

$input = $_POST;
if (empty($input)) {
    $raw = json_decode((string)file_get_contents('php://input'), true);
    if (is_array($raw)) {
        $input = $raw;
    }
}

$licenseNumber = trim((string)($input['licenseNumber'] ?? ''));
$aadharNumber = trim((string)($input['aadharNumber'] ?? ''));
$panNumber = trim((string)($input['panNumber'] ?? ''));
$fullName = trim((string)($input['fullName'] ?? $user['name'] ?? ''));
$phone = trim((string)($input['phone'] ?? $user['phone'] ?? ''));

$verificationId = 'VER-' . strtoupper(bin2hex(random_bytes(6)));

// Process file uploads if attached
$licenseFrontMediaId = trim((string)($input['licenseFrontMediaId'] ?? ''));
$licenseBackMediaId = trim((string)($input['licenseBackMediaId'] ?? ''));
$aadharFrontMediaId = trim((string)($input['aadharFrontMediaId'] ?? ''));
$aadharBackMediaId = trim((string)($input['aadharBackMediaId'] ?? ''));
$panFrontMediaId = trim((string)($input['panFrontMediaId'] ?? ''));
$panBackMediaId = trim((string)($input['panBackMediaId'] ?? ''));

$licenseStatus = $licenseNumber || $licenseFrontMediaId ? 'pending' : 'not_submitted';
$aadharStatus = $aadharNumber || $aadharFrontMediaId ? 'pending' : 'not_submitted';
$panStatus = $panNumber || $panFrontMediaId ? 'pending' : 'not_submitted';

try {
    Database::transaction(function($pdo) use (
        $verificationId, $user, $fullName, $phone, $licenseNumber, $licenseFrontMediaId,
        $licenseBackMediaId, $licenseStatus, $aadharNumber, $aadharFrontMediaId,
        $aadharBackMediaId, $aadharStatus, $panNumber, $panFrontMediaId, $panBackMediaId, $panStatus
    ) {
        $stmt = $pdo->prepare(
            "INSERT INTO verification (
                verification_id, user_id, firebase_uid, full_name, phone,
                license_number, license_front_media_id, license_back_media_id, license_status,
                aadhar_number, aadhar_front_media_id, aadhar_back_media_id, aadhar_status,
                pan_number, pan_front_media_id, pan_back_media_id, pan_status,
                overall_status
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending'
            ) ON DUPLICATE KEY UPDATE
                full_name = VALUES(full_name),
                phone = VALUES(phone),
                license_number = VALUES(license_number),
                license_front_media_id = VALUES(license_front_media_id),
                license_back_media_id = VALUES(license_back_media_id),
                license_status = VALUES(license_status),
                aadhar_number = VALUES(aadhar_number),
                aadhar_front_media_id = VALUES(aadhar_front_media_id),
                aadhar_back_media_id = VALUES(aadhar_back_media_id),
                aadhar_status = VALUES(aadhar_status),
                pan_number = VALUES(pan_number),
                pan_front_media_id = VALUES(pan_front_media_id),
                pan_back_media_id = VALUES(pan_back_media_id),
                pan_status = VALUES(pan_status),
                overall_status = 'pending',
                updated_at = CURRENT_TIMESTAMP"
        );

        $stmt->execute([
            $verificationId, $user['id'], $user['firebase_uid'], $fullName, $phone,
            $licenseNumber ?: null, $licenseFrontMediaId ?: null, $licenseBackMediaId ?: null, $licenseStatus,
            $aadharNumber ?: null, $aadharFrontMediaId ?: null, $aadharBackMediaId ?: null, $aadharStatus,
            $panNumber ?: null, $panFrontMediaId ?: null, $panBackMediaId ?: null, $panStatus
        ]);

        // Update user status
        $pdo->prepare(
            "UPDATE users SET
                license_status = ?,
                aadhar_status = ?,
                pan_status = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE firebase_uid = ?"
        )->execute([$licenseStatus, $aadharStatus, $panStatus, $user['firebase_uid']]);
    });

    sendJsonResponse([
        'success' => true,
        'message' => 'Identity verification documents submitted successfully for review.',
        'verificationId' => $verificationId
    ], 201);
} catch (Exception $e) {
    error_log("[Verification Submit Error] " . $e->getMessage());
    sendErrorResponse('Failed to submit verification: ' . $e->getMessage(), 500);
}
