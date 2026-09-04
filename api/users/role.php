<?php
/**
 * api/users/role.php
 * PUT /api/users/:uid/role - Update user permissions (admin only)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin');

$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;
$targetUid = trim((string)($_GET['uid'] ?? $input['uid'] ?? ''));
$role = trim((string)($input['role'] ?? ''));
$status = trim((string)($input['status'] ?? ''));

if (!$targetUid) {
    sendErrorResponse('User UID is required.', 400);
}

$validRoles = ['customer', 'admin', 'manager', 'executive', 'host'];
if ($role && !in_array($role, $validRoles, true)) {
    sendErrorResponse("Invalid role '$role'.", 400);
}

Database::execute(
    "UPDATE users SET
        role = COALESCE(NULLIF(?, ''), role),
        status = COALESCE(NULLIF(?, ''), status),
        updated_at = CURRENT_TIMESTAMP
     WHERE firebase_uid = ?",
    [$role, $status, $targetUid]
);

sendJsonResponse(['success' => true, 'message' => "User permissions updated."]);
