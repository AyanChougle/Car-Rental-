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
     * Resolves authenticated user from Bearer header, GET token, or cookie.
     * Returns null if unauthenticated or token is invalid without terminating request.
     * @return array|null Current user record from MySQL or null if guest/unauthenticated
     */
    public static function resolveUser(): ?array {
        if (self::$currentUser !== null) {
            return self::$currentUser;
        }

        $candidateTokens = [];

        // Collect all potential Authorization header sources
        $authHeaders = [
            $_SERVER['HTTP_AUTHORIZATION'] ?? '',
            $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '',
            $_SERVER['AUTHORIZATION'] ?? '',
            $_SERVER['HTTP_X_AUTHORIZATION'] ?? '',
            $_SERVER['REDIRECT_HTTP_X_AUTHORIZATION'] ?? '',
            $_SERVER['HTTP_X_FIREBASE_TOKEN'] ?? '',
            $_SERVER['REDIRECT_HTTP_X_FIREBASE_TOKEN'] ?? ''
        ];

        if (function_exists('getallheaders')) {
            $all = getallheaders();
            foreach (['Authorization', 'authorization', 'X-Authorization', 'x-authorization', 'X-Firebase-Token', 'x-firebase-token'] as $k) {
                if (!empty($all[$k])) {
                    $authHeaders[] = $all[$k];
                }
            }
        }

        if (function_exists('apache_request_headers')) {
            $apache = apache_request_headers();
            foreach (['Authorization', 'authorization', 'X-Authorization', 'x-authorization', 'X-Firebase-Token', 'x-firebase-token'] as $k) {
                if (!empty($apache[$k])) {
                    $authHeaders[] = $apache[$k];
                }
            }
        }

        foreach ($authHeaders as $hdr) {
            $hdr = trim((string)$hdr);
            if (!$hdr) continue;
            if (preg_match('/Bearer\s+(.+)$/i', $hdr, $matches)) {
                $candidateTokens[] = trim($matches[1]);
            } else if (substr_count($hdr, '.') === 2) {
                $candidateTokens[] = $hdr;
            }
        }

        // Check GET, POST, Cookie fallbacks
        if (!empty($_GET['token'])) $candidateTokens[] = trim((string)$_GET['token']);
        if (!empty($_GET['idToken'])) $candidateTokens[] = trim((string)$_GET['idToken']);
        if (!empty($_POST['idToken'])) $candidateTokens[] = trim((string)$_POST['idToken']);
        if (!empty($_COOKIE['kruizly_token'])) $candidateTokens[] = trim((string)$_COOKIE['kruizly_token']);
        if (!empty($_COOKIE['token'])) $candidateTokens[] = trim((string)$_COOKIE['token']);

        $rawInput = @file_get_contents('php://input');
        if ($rawInput) {
            $jsonData = json_decode($rawInput, true);
            if (is_array($jsonData) && !empty($jsonData['idToken'])) {
                $candidateTokens[] = trim((string)$jsonData['idToken']);
            }
        }

        $candidateTokens = array_values(array_unique(array_filter($candidateTokens)));

        if (empty($candidateTokens)) {
            return null;
        }

        foreach ($candidateTokens as $idToken) {

        try {
            $payload = FirebaseJwtService::verifyIdToken($idToken);
            $firebaseUid = $payload['sub'] ?? '';
            if (!$firebaseUid) {
                continue;
            }

            $email = strtolower(trim($payload['email'] ?? ''));
            $name = trim($payload['name'] ?? ($payload['email'] ?? 'User'));

            // Find or auto-provision in MySQL users table
            $user = Database::fetchOne(
                "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
                [$firebaseUid]
            );

            // If not found by firebase_uid, find by email and link migrated account
            if (!$user && !empty($email)) {
                $user = Database::fetchOne(
                    "SELECT * FROM users WHERE email = ? LIMIT 1",
                    [$email]
                );
                if ($user) {
                    Database::execute(
                        "UPDATE users SET firebase_uid = ? WHERE id = ?",
                        [$firebaseUid, $user['id']]
                    );
                    $user['firebase_uid'] = $firebaseUid;
                }
            }

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

            if ($user) {
                self::$currentUser = $user;
                return $user;
            }
        } catch (Throwable $e) {
            error_log("[Auth Middleware Token Verification] " . $e->getMessage());
        }
    }

    return null;

    /**
     * Enforces user authentication via Firebase ID Token
     * Resolves and provisions MySQL user record. Sends 401 on failure.
     * @return array Current authenticated user record from MySQL
     */
    public static function requireAuth(): array {
        $user = self::resolveUser();
        if (!$user) {
            sendErrorResponse('Authentication required. Please sign in to continue.', 401);
        }
        return $user;
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
        return self::resolveUser();
    }
}
