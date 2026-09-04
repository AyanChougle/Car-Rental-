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

// Process file uploads & document references if attached
$licenseFrontMediaId = trim((string)($input['licenseFrontMediaId'] ?? $input['licenseFrontURL'] ?? $input['licenseFront'] ?? ''));
$licenseBackMediaId = trim((string)($input['licenseBackMediaId'] ?? $input['licenseBackURL'] ?? $input['licenseBack'] ?? ''));
$aadharFrontMediaId = trim((string)($input['aadharFrontMediaId'] ?? $input['aadharFrontURL'] ?? $input['aadharFront'] ?? ''));
$aadharBackMediaId = trim((string)($input['aadharBackMediaId'] ?? $input['aadharBackURL'] ?? $input['aadharBack'] ?? ''));
$panFrontMediaId = trim((string)($input['panFrontMediaId'] ?? $input['panFrontURL'] ?? $input['panFront'] ?? ''));
$panBackMediaId = trim((string)($input['panBackMediaId'] ?? $input['panBackURL'] ?? $input['panBack'] ?? ''));

$licenseSubmitted = (bool)($licenseNumber || $licenseFrontMediaId || $licenseBackMediaId);
$aadharSubmitted = (bool)($aadharNumber || $aadharFrontMediaId || $aadharBackMediaId);
$panSubmitted = (bool)($panNumber || $panFrontMediaId || $panBackMediaId);

$licenseStatus = $licenseSubmitted ? 'pending' : null;
$aadharStatus = $aadharSubmitted ? 'pending' : null;
$panStatus = $panSubmitted ? 'pending' : null;

try {
    Database::transaction(function($pdo) use (
        $verificationId, $user, $fullName, $phone, $licenseNumber, $licenseFrontMediaId,
        $licenseBackMediaId, $licenseStatus, $licenseSubmitted, $aadharNumber, $aadharFrontMediaId,
        $aadharBackMediaId, $aadharStatus, $aadharSubmitted, $panNumber, $panFrontMediaId, $panBackMediaId, $panStatus, $panSubmitted
    ) {
        $existing = Database::fetchOne("SELECT * FROM verification WHERE firebase_uid = ? LIMIT 1", [$user['firebase_uid']]);

        if ($existing) {
            $updateFields = [
                "full_name = COALESCE(NULLIF(?, ''), full_name)",
                "phone = COALESCE(NULLIF(?, ''), phone)"
            ];
            $params = [$fullName, $phone];

            if ($licenseNumber) { $updateFields[] = "license_number = ?"; $params[] = $licenseNumber; }
            if ($licenseFrontMediaId) { $updateFields[] = "license_front_media_id = ?"; $params[] = $licenseFrontMediaId; }
            if ($licenseBackMediaId) { $updateFields[] = "license_back_media_id = ?"; $params[] = $licenseBackMediaId; }
            if ($licenseStatus !== null) { $updateFields[] = "license_status = ?"; $params[] = $licenseStatus; }

            if ($aadharNumber) { $updateFields[] = "aadhar_number = ?"; $params[] = $aadharNumber; }
            if ($aadharFrontMediaId) { $updateFields[] = "aadhar_front_media_id = ?"; $params[] = $aadharFrontMediaId; }
            if ($aadharBackMediaId) { $updateFields[] = "aadhar_back_media_id = ?"; $params[] = $aadharBackMediaId; }
            if ($aadharStatus !== null) { $updateFields[] = "aadhar_status = ?"; $params[] = $aadharStatus; }

            if ($panNumber) { $updateFields[] = "pan_number = ?"; $params[] = $panNumber; }
            if ($panFrontMediaId) { $updateFields[] = "pan_front_media_id = ?"; $params[] = $panFrontMediaId; }
            if ($panBackMediaId) { $updateFields[] = "pan_back_media_id = ?"; $params[] = $panBackMediaId; }
            if ($panStatus !== null) { $updateFields[] = "pan_status = ?"; $params[] = $panStatus; }

            $updateFields[] = "overall_status = 'pending'";
            $updateFields[] = "updated_at = CURRENT_TIMESTAMP";
            $params[] = $user['firebase_uid'];

            $pdo->prepare("UPDATE verification SET " . implode(', ', $updateFields) . " WHERE firebase_uid = ?")->execute($params);
        } else {
            $stmt = $pdo->prepare(
                "INSERT INTO verification (
                    verification_id, user_id, firebase_uid, full_name, phone,
                    license_number, license_front_media_id, license_back_media_id, license_status,
                    aadhar_number, aadhar_front_media_id, aadhar_back_media_id, aadhar_status,
                    pan_number, pan_front_media_id, pan_back_media_id, pan_status,
                    overall_status
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending'
                )"
            );
            $stmt->execute([
                $verificationId, $user['id'], $user['firebase_uid'], $fullName, $phone,
                $licenseNumber ?: null, $licenseFrontMediaId ?: null, $licenseBackMediaId ?: null, $licenseStatus ?: 'not_submitted',
                $aadharNumber ?: null, $aadharFrontMediaId ?: null, $aadharBackMediaId ?: null, $aadharStatus ?: 'not_submitted',
                $panNumber ?: null, $panFrontMediaId ?: null, $panBackMediaId ?: null, $panStatus ?: 'not_submitted'
            ]);
        }

        // Update user status and profile fields
        $userUpdates = [];
        $uParams = [];
        if ($fullName) { $userUpdates[] = "name = COALESCE(NULLIF(?, ''), name)"; $uParams[] = $fullName; }
        if ($phone) { $userUpdates[] = "phone = COALESCE(NULLIF(?, ''), phone)"; $uParams[] = $phone; }
        if ($licenseStatus !== null) { $userUpdates[] = "license_status = ?"; $uParams[] = $licenseStatus; }
        if ($aadharStatus !== null) { $userUpdates[] = "aadhar_status = ?"; $uParams[] = $aadharStatus; }
        if ($panStatus !== null) { $userUpdates[] = "pan_status = ?"; $uParams[] = $panStatus; }

        if (!empty($userUpdates)) {
            $userUpdates[] = "updated_at = CURRENT_TIMESTAMP";
            $uParams[] = $user['firebase_uid'];
            $pdo->prepare("UPDATE users SET " . implode(', ', $userUpdates) . " WHERE firebase_uid = ?")->execute($uParams);
        }
    });

    sendJsonResponse([
        'success' => true,
        'message' => 'Identity verification documents submitted successfully for review.',
        'verificationId' => $verificationId
    ], 201);
} catch (Exception $e) {
    error_log("[Verification Submit Error] " . $e->getMessage());
    sendErrorResponse('Failed to submit verification: ' . $e->getMessage(), 400);
}
