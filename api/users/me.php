<?php
/**
 * api/users/me.php
 * GET /api/users/me - Get profile
 * PUT /api/users/me - Update profile
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $metadata = [];
    if (!empty($user['metadata'])) {
        $metadata = is_string($user['metadata']) ? json_decode($user['metadata'], true) : $user['metadata'];
    }

    $v = Database::fetchOne("SELECT * FROM verification WHERE firebase_uid = ? LIMIT 1", [$user['firebase_uid']]);

    $formatMediaUrl = function(?string $val): ?string {
        if (!$val) return null;
        if (str_starts_with($val, 'http') || str_starts_with($val, '/api/media/')) return $val;
        return '/api/media/file.php?id=' . urlencode($val);
    };

    $licenseFrontURL = $metadata['licenseFrontURL'] ?? $metadata['licenseURL'] ?? $formatMediaUrl($v['license_front_media_id'] ?? null);
    $licenseBackURL = $metadata['licenseBackURL'] ?? $formatMediaUrl($v['license_back_media_id'] ?? null);
    $aadharFrontURL = $metadata['aadharFrontURL'] ?? $metadata['aadharURL'] ?? $formatMediaUrl($v['aadhar_front_media_id'] ?? null);
    $aadharBackURL = $metadata['aadharBackURL'] ?? $formatMediaUrl($v['aadhar_back_media_id'] ?? null);
    $panFrontURL = $metadata['panFrontURL'] ?? $formatMediaUrl($v['pan_front_media_id'] ?? null);
    $panBackURL = $metadata['panBackURL'] ?? $formatMediaUrl($v['pan_back_media_id'] ?? null);

    sendJsonResponse([
        'success' => true,
        'user' => [
            'id' => $user['id'],
            'uid' => $user['firebase_uid'],
            'firebaseUid' => $user['firebase_uid'],
            'email' => $user['email'],
            'name' => $user['name'],
            'phone' => $user['phone'],
            'age' => $user['age'],
            'role' => $user['role'],
            'status' => $user['status'],
            'licenseStatus' => $v['license_status'] ?? $user['license_status'],
            'aadharStatus' => $v['aadhar_status'] ?? $user['aadhar_status'],
            'panStatus' => $v['pan_status'] ?? $user['pan_status'],
            'overallStatus' => $v['overall_status'] ?? 'not_submitted',
            'licenseFrontURL' => $licenseFrontURL,
            'licenseBackURL' => $licenseBackURL,
            'aadharFrontURL' => $aadharFrontURL,
            'aadharBackURL' => $aadharBackURL,
            'panFrontURL' => $panFrontURL,
            'panBackURL' => $panBackURL,
            'createdAt' => $user['created_at'],
            'updatedAt' => $user['updated_at']
        ]
    ]);
}

if ($method === 'PUT' || $method === 'POST') {
    $input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
    $name = trim((string)($input['name'] ?? ''));
    $phone = trim((string)($input['phone'] ?? ''));
    $age = isset($input['age']) ? (int)$input['age'] : null;

    Database::execute(
        "UPDATE users SET
            name = COALESCE(NULLIF(?, ''), name),
            phone = COALESCE(NULLIF(?, ''), phone),
            age = COALESCE(?, age),
            updated_at = CURRENT_TIMESTAMP
         WHERE firebase_uid = ?",
        [$name, $phone, $age, $user['firebase_uid']]
    );

    sendJsonResponse(['success' => true, 'message' => 'Profile updated successfully.']);
}

sendErrorResponse('Method not allowed.', 405);
