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
                $name = trim($payload['name'] ?? ($payload['email'] ? explode('@', $payload['email'])[0] : 'User'));
                $phone = trim($payload['phone_number'] ?? '');

                // Ensure users table schema columns exist
                try { Database::execute("ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL"); } catch (Throwable $_) {}
                try { Database::execute("ALTER TABLE users ADD COLUMN age INT NULL"); } catch (Throwable $_) {}
                try { Database::execute("ALTER TABLE users ADD COLUMN metadata TEXT NULL"); } catch (Throwable $_) {}
                try { Database::execute("ALTER TABLE users ADD COLUMN license_status VARCHAR(32) DEFAULT 'not_submitted'"); } catch (Throwable $_) {}
                try { Database::execute("ALTER TABLE users ADD COLUMN aadhar_status VARCHAR(32) DEFAULT 'not_submitted'"); } catch (Throwable $_) {}
                try { Database::execute("ALTER TABLE users ADD COLUMN pan_status VARCHAR(32) DEFAULT 'not_submitted'"); } catch (Throwable $_) {}

                // 1. Find by firebase_uid
                $user = Database::fetchOne(
                    "SELECT * FROM users WHERE firebase_uid = ? LIMIT 1",
                    [$firebaseUid]
                );

                // 2. If not found by firebase_uid, find by email and link
                if (!$user && !empty($email)) {
                    $user = Database::fetchOne(
                        "SELECT * FROM users WHERE email = ? LIMIT 1",
                        [$email]
                    );
                    if ($user) {
                        try {
                            Database::execute(
                                "UPDATE users SET firebase_uid = ? WHERE id = ?",
                                [$firebaseUid, $user['id']]
                            );
                            $user['firebase_uid'] = $firebaseUid;
                        } catch (Throwable $_) {}
                    }
                }

                $isAdminEmail = in_array($email, ['ayan@kruizly.com', 'admin@kruizly.com', 'carrentpedatabase@gmail.com'], true);
                $initialRole = $isAdminEmail ? 'admin' : 'customer';

                // 3. Auto-provision in MySQL if new user
                if (!$user) {
                    $userEmail = !empty($email) ? $email : ($firebaseUid . '@kruizly.user');
                    $userName = !empty($name) ? $name : 'KRUIZLY User';

                    try {
                        $maxRow = Database::fetchOne("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM users");
                        $nextId = (int)($maxRow['next_id'] ?? 1);
                        Database::execute(
                            "INSERT INTO users (id, firebase_uid, email, name, phone, role, status)
                             VALUES (?, ?, ?, ?, ?, ?, 'active')
                             ON DUPLICATE KEY UPDATE firebase_uid = VALUES(firebase_uid)",
                            [$nextId, $firebaseUid, $userEmail, $userName, $phone ?: null, $initialRole]
                        );
                    } catch (Throwable $e1) {
                        try {
                            Database::execute(
                                "INSERT INTO users (firebase_uid, email, name, phone, role, status)
                                 VALUES (?, ?, ?, ?, ?, 'active')
                                 ON DUPLICATE KEY UPDATE firebase_uid = VALUES(firebase_uid)",
                                [$firebaseUid, $userEmail, $userName, $phone ?: null, $initialRole]
                            );
                        } catch (Throwable $e2) {
                            error_log("[Auth Provisioning Error] " . $e2->getMessage());
                        }
                    }

                    $user = Database::fetchOne(
                        "SELECT * FROM users WHERE firebase_uid = ? OR (email IS NOT NULL AND email != '' AND email = ?) LIMIT 1",
                        [$firebaseUid, $userEmail]
                    );
                } else if ($isAdminEmail && ($user['role'] ?? '') !== 'admin') {
                    Database::execute("UPDATE users SET role = 'admin' WHERE id = ?", [$user['id']]);
                    $user['role'] = 'admin';
                }

                // 4. Guarantee a valid authenticated user structure
                if (!$user) {
                    $user = [
                        'id' => 0,
                        'firebase_uid' => $firebaseUid,
                        'email' => $email ?: ($firebaseUid . '@kruizly.user'),
                        'name' => $name ?: 'KRUIZLY User',
                        'phone' => $phone,
                        'age' => null,
                        'role' => $initialRole,
                        'status' => 'active',
                        'license_status' => 'not_submitted',
                        'aadhar_status' => 'not_submitted',
                        'pan_status' => 'not_submitted'
                    ];
                }

                self::$currentUser = $user;
                return $user;
            } catch (Throwable $e) {
                error_log("[Auth Middleware Token Verification] " . $e->getMessage());
            }
        }

        return null;
    }

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
