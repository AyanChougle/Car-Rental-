<?php
/**
 * api/auth/logout.php
 * POST /api/auth/logout
 * 
 * Logout user (revoke refresh token).
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/cors.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Method not allowed.', 405);
}

try {
    $user = Auth::requireAuth();

    // Clear refresh token
    Database::execute(
        "UPDATE users SET refresh_token = NULL WHERE id = ?",
        [$user['id']]
    );

    sendJsonResponse([
        'success' => true,
        'message' => 'Logged out successfully.',
    ], 200);
} catch (Exception $e) {
    error_log("[Logout Error] " . $e->getMessage());
    sendErrorResponse('Logout failed.', 500);
}
