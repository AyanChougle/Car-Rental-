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
            'licenseStatus' => $user['license_status'],
            'aadharStatus' => $user['aadhar_status'],
            'panStatus' => $user['pan_status'],
            'licenseFrontURL' => $metadata['licenseFrontURL'] ?? $metadata['licenseURL'] ?? null,
            'licenseBackURL' => $metadata['licenseBackURL'] ?? null,
            'aadharFrontURL' => $metadata['aadharFrontURL'] ?? $metadata['aadharURL'] ?? null,
            'aadharBackURL' => $metadata['aadharBackURL'] ?? null,
            'panFrontURL' => $metadata['panFrontURL'] ?? null,
            'panBackURL' => $metadata['panBackURL'] ?? null,
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
