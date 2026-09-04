<?php
/**
 * api/middleware/auth.php
 * 
 * Server-Side Authentication & Authorization Middleware using Firebase ID Token.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../services/FirebaseJwtService.php';
require_once __DIR__ . '/cors.php';

class Auth {
    private static ?array $currentUser = null;

    /**
     * Enforces user authentication via Firebase ID Token
     * Resolves and provisions MySQL user record
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

        $idToken = '';
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $idToken = trim($matches[1]);
        } elseif (!empty($_GET['token'])) {
            $idToken = trim((string)$_GET['token']);
        } elseif (!empty($_COOKIE['kruizly_token'])) {
            $idToken = trim((string)$_COOKIE['kruizly_token']);
        }

        if (!$idToken) {
            sendErrorResponse('Authentication required. Missing Bearer token.', 401);
        }

        try {
            $payload = FirebaseJwtService::verifyIdToken($idToken);
            $firebaseUid = $payload['sub'];
            $email = strtolower(trim($payload['email'] ?? ''));
            $name = trim($payload['name'] ?? ($payload['email'] ?? 'User'));

            // Find or auto-provision in MySQL users table
            $user = Database::fetchOne(
                "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
                [$firebaseUid]
            );

            $isAdminEmail = in_array($email, ['ayan@kruizly.com', 'admin@kruizly.com', 'carrentpedatabase@gmail.com'], true);

            if (!$user) {
                $initialRole = $isAdminEmail ? 'admin' : 'customer';

                $userId = Database::insert(
                    "INSERT INTO users (firebase_uid, email, name, role, status)
                     VALUES (?, ?, ?, ?, 'active')",
                    [$firebaseUid, $email, $name, $initialRole]
                );

                $user = Database::fetchOne("SELECT * FROM users WHERE id = ? LIMIT 1", [$userId]);
            } else if ($isAdminEmail && ($user['role'] ?? '') !== 'admin') {
                // Ensure admin accounts maintain admin role in database
                Database::execute("UPDATE users SET role = 'admin' WHERE id = ?", [$user['id']]);
                $user['role'] = 'admin';
            }

            self::$currentUser = $user;
            return $user;
        } catch (Exception $e) {
            error_log("[Auth Middleware Error] " . $e->getMessage());
            sendErrorResponse('Invalid or expired authentication token: ' . $e->getMessage(), 401);
        }
    }

    /**
     * Enforces role authorization (e.g. admin, manager, executive)
     * Admin accounts automatically have full access to all roles and endpoints.
     * @param string ...$allowedRoles
     * @return array
     */
    public static function requireRole(string ...$allowedRoles): array {
        $user = self::requireAuth();
        $userRole = strtolower($user['role'] ?? 'customer');

        // Admin has universal superuser access to every single feature
        if ($userRole === 'admin') {
            return $user;
        }

        if (!in_array($userRole, $allowedRoles, true)) {
            sendErrorResponse("Access denied. Required role: " . implode('/', $allowedRoles) . ". Your role: $userRole.", 403);
        }

        return $user;
    }

    /**
     * Optional authentication helper (returns null if unauthenticated without terminating request)
     */
    public static function optionalAuth(): ?array {
        try {
            return self::requireAuth();
        } catch (Throwable $e) {
            return null;
        }
    }
}
