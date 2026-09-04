<?php
/**
 * api/auth/register.php
 * POST /api/auth/register
 * 
 * User registration with JWT token generation.
 * No Firebase dependency.
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
$name = trim($input['name'] ?? '');

// Validation
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendErrorResponse('Invalid email address.', 400);
}

if (strlen($password) < 6) {
    sendErrorResponse('Password must be at least 6 characters.', 400);
}

if (strlen($name) < 2) {
    sendErrorResponse('Name is required (at least 2 characters).', 400);
}

// Check if email already exists
$existing = Database::fetchOne(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [$email]
);

if ($existing) {
    sendErrorResponse('Email already registered. Try logging in instead.', 409);
}

try {
    // Hash password using bcrypt
    $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

    // Determine role
    $isAdmin = in_array($email, ADMIN_EMAILS, true);
    $role = $isAdmin ? 'admin' : 'customer';

    // Create user
    $userId = Database::insert(
        "INSERT INTO users (email, name, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', NOW(), NOW())",
        [$email, $name, $passwordHash, $role]
    );

    // Generate JWT tokens
    $accessToken = JwtService::generateToken($userId, $email, $role);
    $refreshToken = JwtService::generateRefreshToken($userId);

    // Store refresh token in database (optional, for logout/token revocation)
    Database::execute(
        "UPDATE users SET refresh_token = ? WHERE id = ?",
        [$refreshToken, $userId]
    );

    // Load full user record
    $user = Database::fetchOne("SELECT * FROM users WHERE id = ? LIMIT 1", [$userId]);

    sendJsonResponse([
        'success' => true,
        'message' => 'Registration successful.',
        'user' => [
            'id' => $user['id'],
            'email' => $user['email'],
            'name' => $user['name'],
            'role' => $user['role'],
        ],
        'tokens' => [
            'accessToken' => $accessToken,
            'refreshToken' => $refreshToken,
            'expiresIn' => JWT_ACCESS_TOKEN_TTL,
        ],
    ], 201);
} catch (Exception $e) {
    error_log("[Register Error] " . $e->getMessage());
    sendErrorResponse('Registration failed. Please try again.', 500);
}
