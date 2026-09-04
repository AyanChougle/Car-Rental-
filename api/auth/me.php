<?php
/**
 * api/auth/me.php (UPDATED)
 * GET /api/auth/me
 * 
 * Fetch current authenticated user.
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendErrorResponse('Method not allowed.', 405);
}

$user = Auth::requireAuth();

// Remove sensitive fields
unset($user['password_hash'], $user['refresh_token']);

sendJsonResponse([
    'success' => true,
    'user' => $user,
], 200);
