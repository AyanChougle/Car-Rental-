<?php
/**
 * api/users/index.php
 * GET /api/users - List all users (admin, manager, executive)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

Auth::requireRole('admin', 'manager', 'executive');

$rows = Database::fetchAll("SELECT * FROM users ORDER BY created_at DESC");

$users = array_map(function($u) {
    $metadata = [];
    if (!empty($u['metadata'])) {
        $metadata = is_string($u['metadata']) ? json_decode($u['metadata'], true) : $u['metadata'];
    }

    return [
        'id' => $u['firebase_uid'],
        'dbId' => $u['id'],
        'uid' => $u['firebase_uid'],
        'email' => $u['email'],
        'name' => $u['name'],
        'phone' => $u['phone'],
        'age' => $u['age'],
        'role' => $u['role'],
        'status' => $u['status'],
        'licenseStatus' => $u['license_status'],
        'aadharStatus' => $u['aadhar_status'],
        'panStatus' => $u['pan_status'],
        'ipAddress' => $u['ip_address'],
        'licenseFrontURL' => $metadata['licenseFrontURL'] ?? $metadata['licenseURL'] ?? null,
        'licenseBackURL' => $metadata['licenseBackURL'] ?? null,
        'aadharFrontURL' => $metadata['aadharFrontURL'] ?? $metadata['aadharURL'] ?? null,
        'aadharBackURL' => $metadata['aadharBackURL'] ?? null,
        'panFrontURL' => $metadata['panFrontURL'] ?? null,
        'panBackURL' => $metadata['panBackURL'] ?? null,
        'createdAt' => $u['created_at'],
        'updatedAt' => $u['updated_at']
    ];
}, $rows);

sendJsonResponse([
    'success' => true,
    'count' => count($users),
    'users' => $users
]);
