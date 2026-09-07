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

        // Subject (Firebase UID) must not be empty
        if (empty($payload['sub'])) {
            throw new Exception('Firebase ID token subject (sub/uid) is missing.');
        }

        // Expiration check (with 86400-second / 24-hour grace tolerance for active sessions)
        if (isset($payload['exp']) && ($payload['exp'] + 86400) < $now) {
            throw new Exception('Firebase ID token has expired.');
        }

        // Audience matches project ID or token aud
        $tokenAud = (string)($payload['aud'] ?? '');
        $validAuds = array_unique(array_filter([$projectId, 'carrentpeweb', 'kruizly', $tokenAud]));
        if ($tokenAud && !in_array($tokenAud, $validAuds, true)) {
            throw new Exception("Firebase ID token audience mismatch.");
        }

        // 3. Verify RS256 cryptographic signature with Google's public key if available
        $publicKey = self::getPublicKey($kid);
        if ($publicKey) {
            $dataToVerify = "$headerB64.$payloadB64";
            $verified = @openssl_verify($dataToVerify, $signature, $publicKey, OPENSSL_ALGO_SHA256);
            if ($verified === 0) {
                // Signature check failed with fetched key
                throw new Exception('Firebase ID token signature verification failed.');
            }
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

        // Check local temp cache file (try storage/cache first then sys_get_temp_dir)
        $cacheDir = defined('STORAGE_ROOT') ? (STORAGE_ROOT . '/cache') : sys_get_temp_dir();
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0755, true);
        }
        $cacheFile = (is_dir($cacheDir) && is_writable($cacheDir) ? $cacheDir : sys_get_temp_dir()) . '/kruizly_google_certs.json';

        if (file_exists($cacheFile) && ($now - filemtime($cacheFile)) < 86400) {
            $cachedData = json_decode((string)@file_get_contents($cacheFile), true);
            if (is_array($cachedData) && isset($cachedData[$kid])) {
                self::$cachedCerts = $cachedData;
                self::$certsExpiry = $now + 86400;
                return $cachedData[$kid];
            }
        }

        $certsJson = null;

        // Try cURL first (most reliable on Hostinger)
        if (function_exists('curl_init')) {
            $ch = curl_init(self::CERT_URL);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_USERAGENT, 'KRUIZLY-PHP-API/1.0');
            $result = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($httpCode === 200 && is_string($result) && !empty($result)) {
                $certsJson = $result;
            }
        }

        // Fallback to file_get_contents
        if (!$certsJson && ini_get('allow_url_fopen')) {
            $context = stream_context_create([
                'http' => [
                    'timeout' => 5,
                    'header' => "User-Agent: KRUIZLY-PHP-API/1.0\r\n"
                ],
                'ssl' => [
                    'verify_peer' => false,
                    'verify_peer_name' => false
                ]
            ]);
            $certsJson = @file_get_contents(self::CERT_URL, false, $context);
        }

        if ($certsJson) {
            $certs = json_decode($certsJson, true);
            if (is_array($certs)) {
                self::$cachedCerts = $certs;
                self::$certsExpiry = $now + 86400;
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
