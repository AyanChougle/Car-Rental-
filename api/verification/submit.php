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
            if ($licenseStatus !== 'not_submitted') { $updateFields[] = "license_status = ?"; $params[] = $licenseStatus; }

            if ($aadharNumber) { $updateFields[] = "aadhar_number = ?"; $params[] = $aadharNumber; }
            if ($aadharFrontMediaId) { $updateFields[] = "aadhar_front_media_id = ?"; $params[] = $aadharFrontMediaId; }
            if ($aadharBackMediaId) { $updateFields[] = "aadhar_back_media_id = ?"; $params[] = $aadharBackMediaId; }
            if ($aadharStatus !== 'not_submitted') { $updateFields[] = "aadhar_status = ?"; $params[] = $aadharStatus; }

            if ($panNumber) { $updateFields[] = "pan_number = ?"; $params[] = $panNumber; }
            if ($panFrontMediaId) { $updateFields[] = "pan_front_media_id = ?"; $params[] = $panFrontMediaId; }
            if ($panBackMediaId) { $updateFields[] = "pan_back_media_id = ?"; $params[] = $panBackMediaId; }
            if ($panStatus !== 'not_submitted') { $updateFields[] = "pan_status = ?"; $params[] = $panStatus; }

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
                $licenseNumber ?: null, $licenseFrontMediaId ?: null, $licenseBackMediaId ?: null, $licenseStatus,
                $aadharNumber ?: null, $aadharFrontMediaId ?: null, $aadharBackMediaId ?: null, $aadharStatus,
                $panNumber ?: null, $panFrontMediaId ?: null, $panBackMediaId ?: null, $panStatus
            ]);
        }

        // Update user status
        $userUpdates = [];
        $uParams = [];
        if ($licenseStatus !== 'not_submitted') { $userUpdates[] = "license_status = ?"; $uParams[] = $licenseStatus; }
        if ($aadharStatus !== 'not_submitted') { $userUpdates[] = "aadhar_status = ?"; $uParams[] = $aadharStatus; }
        if ($panStatus !== 'not_submitted') { $userUpdates[] = "pan_status = ?"; $uParams[] = $panStatus; }

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
