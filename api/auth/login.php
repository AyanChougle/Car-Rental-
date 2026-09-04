<?php
/**
 * api/auth/login.php
 * POST /api/auth/login
 * 
 * User login with JWT token generation.
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/cors.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../services/JwtService.php';

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Method not allowed.', 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];

$email = strtolower(trim($input['email'] ?? ''));
$password = $input['password'] ?? '';

if (!$email || !$password) {
    sendErrorResponse('Email and password are required.', 400);
}

try {
    // Find user by email
    $user = Database::fetchOne(
        "SELECT * FROM users WHERE email = ? LIMIT 1",
        [$email]
    );

    if (!$user) {
        sendErrorResponse('Invalid email or password.', 401);
    }

    // Verify password
    if (!isset($user['password_hash']) || !password_verify($password, $user['password_hash'])) {
        sendErrorResponse('Invalid email or password.', 401);
    }

    // Check account status
    if ($user['status'] === 'disabled') {
        sendErrorResponse('Your account has been disabled. Contact support.', 403);
    }

    if ($user['status'] === 'suspended') {
        sendErrorResponse('Your account is suspended. Contact support.', 403);
    }

    // Generate JWT tokens
    $accessToken = JwtService::generateToken($user['id'], $user['email'], $user['role']);
    $refreshToken = JwtService::generateRefreshToken($user['id']);

    // Store refresh token (for logout/revocation tracking)
    Database::execute(
        "UPDATE users SET refresh_token = ?, last_login_at = NOW() WHERE id = ?",
        [$refreshToken, $user['id']]
    );

    sendJsonResponse([
        'success' => true,
        'message' => 'Login successful.',
        'user' => [
            'id' => $user['id'],
            'email' => $user['email'],
            'name' => $user['name'],
            'role' => $user['role'],
            'status' => $user['status'],
        ],
        'tokens' => [
            'accessToken' => $accessToken,
            'refreshToken' => $refreshToken,
            'expiresIn' => JWT_ACCESS_TOKEN_TTL,
        ],
    ], 200);
} catch (Exception $e) {
    error_log("[Login Error] " . $e->getMessage());
    sendErrorResponse('Login failed. Please try again.', 500);
}
