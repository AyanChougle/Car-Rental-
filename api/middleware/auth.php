<?php
/**
 * api/middleware/auth.php (UPDATED)
 * 
 * JWT-based Authentication & Authorization (NO Firebase dependency).
 * Validates JWT tokens, resolves users from MySQL.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../services/JwtService.php';
require_once __DIR__ . '/cors.php';

class Auth {
    private static ?array $currentUser = null;

    /**
     * Enforces JWT authentication
     * Validates token and loads user from MySQL
     * @return array Current authenticated user record from MySQL
     */
    public static function requireAuth(): array {
        if (self::$currentUser !== null) {
            return self::$currentUser;
        }

        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!$authHeader && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        }

        if (!preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            sendErrorResponse('Authentication required. Missing Bearer token.', 401);
        }

        $token = trim($matches[1]);

        // Verify JWT
        $payload = JwtService::verifyToken($token);
        if (!$payload) {
            sendErrorResponse('Invalid or expired authentication token.', 401);
        }

        $userId = (int)($payload['sub'] ?? 0);
        if ($userId <= 0) {
            sendErrorResponse('Invalid token payload.', 401);
        }

        // Load user from MySQL
        $user = Database::fetchOne(
            "SELECT * FROM users WHERE id = ? LIMIT 1",
            [$userId]
        );

        if (!$user) {
            sendErrorResponse('User not found.', 401);
        }

        if ($user['status'] === 'disabled' || $user['status'] === 'suspended') {
            sendErrorResponse("Your account is {$user['status']}. Contact support.", 403);
        }

        self::$currentUser = $user;
        return $user;
    }

    /**
     * Enforces role-based access control
     * @param string ...$allowedRoles
     * @return array
     */
    public static function requireRole(string ...$allowedRoles): array {
        $user = self::requireAuth();
        $userRole = strtolower($user['role'] ?? 'customer');

        if (!in_array($userRole, $allowedRoles, true)) {
            sendErrorResponse(
                "Access denied. Required role: " . implode('/', $allowedRoles) . ". Your role: $userRole.",
                403
            );
        }

        return $user;
    }

    /**
     * Optional authentication (doesn't fail if token missing)
     * @return array|null
     */
    public static function optionalAuth(): ?array {
        try {
            return self::requireAuth();
        } catch (Throwable $e) {
            return null;
        }
    }

    /**
     * Get current authenticated user (or null if not logged in)
     * @return array|null
     */
    public static function getCurrentUser(): ?array {
        return self::$currentUser;
    }
}
