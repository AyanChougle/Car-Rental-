<?php
/**
 * api/users/sync.php
 * POST /api/users/sync - Sync Firebase Auth profile on login
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$name = trim((string)($input['name'] ?? ''));
$phone = trim((string)($input['phone'] ?? ''));
$age = isset($input['age']) ? (int)$input['age'] : null;
$ipAddress = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;

Database::execute(
    "UPDATE users SET
        name = COALESCE(NULLIF(?, ''), name),
        phone = COALESCE(NULLIF(?, ''), phone),
        age = COALESCE(?, age),
        ip_address = COALESCE(?, ip_address),
        updated_at = CURRENT_TIMESTAMP
     WHERE firebase_uid = ?",
    [$name, $phone, $age, $ipAddress, $user['firebase_uid']]
);

$updated = Database::fetchOne("SELECT * FROM users WHERE firebase_uid = ? LIMIT 1", [$user['firebase_uid']]);

sendJsonResponse([
    'success' => true,
    'message' => 'User synchronized with MySQL database.',
    'user' => $updated
]);
