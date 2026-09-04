<?php
/**
 * api/auth/refresh.php
 * POST /api/auth/refresh
 * 
 * Refresh expired access tokens using refresh token.
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../services/JwtService.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Method not allowed.', 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$refreshToken = $input['refreshToken'] ?? '';

if (!$refreshToken) {
    sendErrorResponse('Refresh token is required.', 400);
}

try {
    // Verify refresh token
    $payload = JwtService::verifyToken($refreshToken);
    if (!$payload || ($payload['type'] ?? '') !== 'refresh') {
        sendErrorResponse('Invalid or expired refresh token.', 401);
    }

    $userId = (int)($payload['sub'] ?? 0);

    // Load user
    $user = Database::fetchOne(
        "SELECT * FROM users WHERE id = ? LIMIT 1",
        [$userId]
    );

    if (!$user || $user['refresh_token'] !== $refreshToken) {
        sendErrorResponse('Refresh token mismatch or revoked.', 401);
    }

    // Generate new access token
    $newAccessToken = JwtService::generateToken($user['id'], $user['email'], $user['role']);

    sendJsonResponse([
        'success' => true,
        'message' => 'Token refreshed.',
        'tokens' => [
            'accessToken' => $newAccessToken,
            'expiresIn' => JWT_ACCESS_TOKEN_TTL,
        ],
    ], 200);
} catch (Exception $e) {
    error_log("[Refresh Token Error] " . $e->getMessage());
    sendErrorResponse('Token refresh failed.', 500);
}
