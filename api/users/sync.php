<?php
/**
 * api/users/sync.php
 * POST /api/users/sync - Sync Firebase Auth profile on login
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

// Auto-heal missing columns in users table
try {
    Database::execute("ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL AFTER email");
} catch (Throwable $_) {}
try {
    Database::execute("ALTER TABLE users ADD COLUMN age INT NULL AFTER phone");
} catch (Throwable $_) {}
try {
    Database::execute("ALTER TABLE users ADD COLUMN ip_address VARCHAR(64) NULL");
} catch (Throwable $_) {}

$name = trim((string)($input['name'] ?? ''));
$phone = trim((string)($input['phone'] ?? ''));
$age = isset($input['age']) && $input['age'] !== '' && (int)$input['age'] > 0 ? (int)$input['age'] : null;
$ipAddress = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;

Database::execute(
    "UPDATE users SET
        name = COALESCE(NULLIF(?, ''), name),
        phone = COALESCE(NULLIF(?, ''), phone),
        age = COALESCE(?, age),
        ip_address = COALESCE(?, ip_address),
        updated_at = CURRENT_TIMESTAMP
     WHERE id = ? OR firebase_uid = ? OR (email IS NOT NULL AND email != '' AND email = ?)",
    [$name, $phone, $age, $ipAddress, $user['id'] ?? 0, $user['firebase_uid'] ?? '', $user['email'] ?? '']
);

$updated = Database::fetchOne(
    "SELECT * FROM users WHERE id = ? OR firebase_uid = ? OR (email IS NOT NULL AND email != '' AND email = ?) LIMIT 1",
    [$user['id'] ?? 0, $user['firebase_uid'] ?? '', $user['email'] ?? '']
);

sendJsonResponse([
    'success' => true,
    'message' => 'User synchronized with MySQL database.',
    'user' => $updated
]);

