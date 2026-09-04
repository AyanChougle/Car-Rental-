<?php
/**
 * api/services/JwtService.php
 * 
 * Native JWT Token Generation & Verification (NO Firebase dependency)
 * Uses HS256 HMAC signing with a secret key for Hostinger MySQL backend.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';

class JwtService {
    private const ALGORITHM = 'HS256';
    private const TOKEN_LIFETIME = 86400; // 24 hours
    private const REFRESH_TOKEN_LIFETIME = 604800; // 7 days

    /**
     * Generate a signed JWT token for a user
     * @param int $userId
     * @param string $email
     * @param string $role
     * @param int|null $expiresIn seconds (default: 24 hours)
     * @return string JWT token
     */
    public static function generateToken(int $userId, string $email, string $role, ?int $expiresIn = null): string {
        $expiresIn = $expiresIn ?? self::TOKEN_LIFETIME;
        $now = time();
        
        $payload = [
            'iat' => $now,
            'exp' => $now + $expiresIn,
            'sub' => (string)$userId,
            'email' => $email,
            'role' => $role,
        ];

        return self::encodeAndSign($payload);
    }

    /**
     * Generate a refresh token (longer-lived, used to get new access tokens)
     * @param int $userId
     * @return string JWT refresh token
     */
    public static function generateRefreshToken(int $userId): string {
        $now = time();
        
        $payload = [
            'iat' => $now,
            'exp' => $now + self::REFRESH_TOKEN_LIFETIME,
            'sub' => (string)$userId,
            'type' => 'refresh',
        ];

        return self::encodeAndSign($payload);
    }

    /**
     * Verify and decode a JWT token
     * @param string $token
     * @return array|null Payload if valid, null otherwise
     */
    public static function verifyToken(string $token): ?array {
        try {
            $parts = explode('.', trim($token));
            
            if (count($parts) !== 3) {
                return null;
            }

            [$headerB64, $payloadB64, $signatureB64] = $parts;

            // Verify signature
            $expectedSignature = self::base64UrlEncode(
                hash_hmac('sha256', "$headerB64.$payloadB64", JWT_SECRET, true)
            );

            if (!hash_equals($signatureB64, $expectedSignature)) {
                return null;
            }

            // Decode payload
            $payloadJson = self::base64UrlDecode($payloadB64);
            $payload = json_decode($payloadJson, true);

            if (!is_array($payload)) {
                return null;
            }

            // Check expiration
            if (isset($payload['exp']) && $payload['exp'] < time()) {
                return null;
            }

            return $payload;
        } catch (Throwable $e) {
            error_log("[JwtService] Token verification failed: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Extract user ID from token (used in middleware)
     * @param string $token
     * @return int|null
     */
    public static function getUserIdFromToken(string $token): ?int {
        $payload = self::verifyToken($token);
        if ($payload && isset($payload['sub'])) {
            return (int)$payload['sub'];
        }
        return null;
    }

    /**
     * Internal: Encode and sign payload as JWT
     * @param array $payload
     * @return string
     */
    private static function encodeAndSign(array $payload): string {
        $header = [
            'alg' => self::ALGORITHM,
            'typ' => 'JWT',
        ];

        $headerB64 = self::base64UrlEncode(json_encode($header));
        $payloadB64 = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', "$headerB64.$payloadB64", JWT_SECRET, true);
        $signatureB64 = self::base64UrlEncode($signature);

        return "$headerB64.$payloadB64.$signatureB64";
    }

    /**
     * Base64 URL-safe encode
     * @param string $data
     * @return string
     */
    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Base64 URL-safe decode
     * @param string $data
     * @return string
     */
    private static function base64UrlDecode(string $data): string {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
