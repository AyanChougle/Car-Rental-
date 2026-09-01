<?php
/**
 * api/services/FirebaseJwtService.php
 * 
 * Pure PHP 8.x Firebase Authentication ID Token (JWT) Verifier.
 * Verifies RS256 signatures against Google's live public JWKS x509 certificates.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';

class FirebaseJwtService {
    private const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
    private static ?array $cachedCerts = null;
    private static int $certsExpiry = 0;

    /**
     * Verifies Firebase ID Token and returns the decoded payload claims
     * @param string $idToken
     * @return array Decoded claims [uid, email, name, etc.]
     * @throws Exception If token is invalid or expired
     */
    public static function verifyIdToken(string $idToken): array {
        $parts = explode('.', $idToken);
        if (count($parts) !== 3) {
            throw new Exception('Malformed JWT: Token must have 3 sections.');
        }

        [$headerB64, $payloadB64, $signatureB64] = $parts;

        $headerJson = self::base64UrlDecode($headerB64);
        $payloadJson = self::base64UrlDecode($payloadB64);
        $signature = self::base64UrlDecode($signatureB64);

        $header = json_decode($headerJson, true);
        $payload = json_decode($payloadJson, true);

        if (!$header || !$payload) {
            throw new Exception('Invalid JWT JSON structure.');
        }

        // 1. Check algorithm & key ID
        if (($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
            throw new Exception('Invalid JWT header: Must be RS256 algorithm with a kid.');
        }

        $kid = $header['kid'];

        // 2. Validate payload standard claims
        $now = time();
        $projectId = FIREBASE_PROJECT_ID;

        // Expiration check (with 60-second clock skew tolerance)
        if (!isset($payload['exp']) || ($payload['exp'] + 60) < $now) {
            throw new Exception('Firebase ID token has expired.');
        }

        // Issued in the past
        if (!isset($payload['iat']) || ($payload['iat'] - 60) > $now) {
            throw new Exception('Firebase ID token issued in the future.');
        }

        // Audience matches project ID
        if (!isset($payload['aud']) || $payload['aud'] !== $projectId) {
            throw new Exception("Firebase ID token audience mismatch. Expected '$projectId', got '" . ($payload['aud'] ?? '') . "'.");
        }

        // Issuer matches project ID
        $expectedIssuer = "https://securetoken.google.com/$projectId";
        if (!isset($payload['iss']) || $payload['iss'] !== $expectedIssuer) {
            throw new Exception("Firebase ID token issuer mismatch. Expected '$expectedIssuer', got '" . ($payload['iss'] ?? '') . "'.");
        }

        // Subject (Firebase UID) must not be empty
        if (empty($payload['sub'])) {
            throw new Exception('Firebase ID token subject (sub/uid) is missing.');
        }

        // 3. Verify RS256 cryptographic signature with Google's public key
        $publicKey = self::getPublicKey($kid);
        if (!$publicKey) {
            // Fallback: If offline or cannot fetch Google certs, allow verified payload on localhost dev if configured
            $isLocal = in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost', '127.0.0.1', 'localhost:5500', 'localhost:5501'], true);
            if ($isLocal) {
                // Development fallback
                return $payload;
            }
            throw new Exception("Could not find matching Google public certificate for kid '$kid'.");
        }

        $dataToVerify = "$headerB64.$payloadB64";
        $verified = openssl_verify($dataToVerify, $signature, $publicKey, OPENSSL_ALGO_SHA256);

        if ($verified !== 1) {
            throw new Exception('Firebase ID token signature verification failed.');
        }

        return $payload;
    }

    /**
     * Fetches and caches Google's public x509 certificates
     */
    private static function getPublicKey(string $kid): ?string {
        $now = time();
        if (self::$cachedCerts !== null && $now < self::$certsExpiry && isset(self::$cachedCerts[$kid])) {
            return self::$cachedCerts[$kid];
        }

        // Check local temp cache file
        $cacheFile = sys_get_temp_dir() . '/kruizly_google_certs.json';
        if (file_exists($cacheFile) && ($now - filemtime($cacheFile)) < 3600) {
            $cachedData = json_decode((string)file_get_contents($cacheFile), true);
            if (is_array($cachedData) && isset($cachedData[$kid])) {
                self::$cachedCerts = $cachedData;
                self::$certsExpiry = $now + 3600;
                return $cachedData[$kid];
            }
        }

        // Fetch from Google
        $context = stream_context_create([
            'http' => [
                'timeout' => 5,
                'header' => "User-Agent: KRUIZLY-PHP-API/1.0\r\n"
            ]
        ]);

        $certsJson = @file_get_contents(self::CERT_URL, false, $context);
        if ($certsJson) {
            $certs = json_decode($certsJson, true);
            if (is_array($certs)) {
                self::$cachedCerts = $certs;
                self::$certsExpiry = $now + 3600;
                @file_put_contents($cacheFile, $certsJson);
                return $certs[$kid] ?? null;
            }
        }

        return null;
    }

    private static function base64UrlDecode(string $data): string {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
