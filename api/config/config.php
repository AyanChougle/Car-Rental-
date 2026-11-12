<?php
/**
 * api/config/config.php
 * 
 * Central Configuration for KRUIZLY PHP Backend.
 * Loads protected environment variables from .env (never commit secrets in source).
 */

declare(strict_types=1);

// Set default timezone to Indian Standard Time (Navi Mumbai)
date_default_timezone_set('Asia/Kolkata');

// Load .env file if present and not already injected into environment
(static function (): void {
    $envPath = __DIR__ . '/../../.env';
    if (!is_file($envPath) || !is_readable($envPath)) {
        return;
    }
    $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return;
    }
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || $trimmed[0] === '#') {
            continue;
        }
        $pos = strpos($trimmed, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($trimmed, 0, $pos));
        $val = trim(substr($trimmed, $pos + 1));
        if ($key === '') {
            continue;
        }
        if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
            (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
            $val = substr($val, 1, -1);
        }
        $existing = getenv($key);
        if (($existing === false || $existing === '') && (!isset($_ENV[$key]) || $_ENV[$key] === '')) {
            putenv("$key=$val");
            $_ENV[$key] = $val;
            $_SERVER[$key] = $val;
        }
    }
})();

function kruizlyEnv(string $key, ?string $default = null): ?string {
    $val = getenv($key);
    if ($val === false && isset($_ENV[$key])) {
        $val = (string)$_ENV[$key];
    }
    if ($val === false && isset($_SERVER[$key])) {
        $val = (string)$_SERVER[$key];
    }
    if ($val === false || trim((string)$val) === '') {
        return $default;
    }
    return (string)$val;
}

// Error reporting for production vs development (never leak errors in production)
$isLocal = in_array($_SERVER['HTTP_HOST'] ?? '', ['127.0.0.1', 'localhost', 'localhost:5502', 'localhost:5501'], true)
    || (kruizlyEnv('APP_ENV', 'production') === 'local');
if ($isLocal && PHP_SAPI === 'cli') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
    ini_set('display_errors', '0');
}

// ------------------------------------------------------------
// 1. DATABASE CONFIGURATION (Protected Environment Variables)
// ------------------------------------------------------------
define('DB_HOST', kruizlyEnv('DB_HOST', 'localhost'));
define('DB_PORT', kruizlyEnv('DB_PORT', '3306'));
define('DB_NAME', kruizlyEnv('DB_NAME', ''));
define('DB_USER', kruizlyEnv('DB_USER', ''));
define('DB_PASS', kruizlyEnv('DB_PASS', ''));
define('DB_CHARSET', 'utf8mb4');

// ------------------------------------------------------------
// 2. FIREBASE & JWT AUTHENTICATION
// ------------------------------------------------------------
define('FIREBASE_PROJECT_ID', kruizlyEnv('FIREBASE_PROJECT_ID', 'carrentpeweb'));

// SECURITY: Must be supplied strictly via environment / .env (no hardcoded fallback secret)
define('JWT_SECRET', trim((string)kruizlyEnv('JWT_SECRET', '')));

// Admin emails that auto-get admin role on first login
define('ADMIN_EMAILS', ['ayan@kruizly.com', 'admin@kruizly.com', 'ayanchougle@gmail.com', 'carrentpedatabase@gmail.com', 'currentpedatabase@gmail.com']);

// Token expiration times (seconds)
define('JWT_ACCESS_TOKEN_TTL', 86400); // 24 hours
define('JWT_REFRESH_TOKEN_TTL', 604800); // 7 days

// ------------------------------------------------------------
// 3. FILE STORAGE PATHS (Hostinger Filesystem)
// ------------------------------------------------------------
$envStorage = trim((string)kruizlyEnv('STORAGE_ROOT', ''));
if ($envStorage !== '' && (str_contains($envStorage, 'YOUR_') || str_contains($envStorage, '<'))) {
    $envStorage = '';
}
$storagePath = $envStorage !== ''
    ? $envStorage
    : (realpath(__DIR__ . '/../../storage') ?: (__DIR__ . '/../../storage'));
if (!is_dir($storagePath)) {
    @mkdir($storagePath, 0755, true);
}
define('STORAGE_ROOT', $storagePath);
define('MAX_UPLOAD_SIZE', (int)(kruizlyEnv('MAX_UPLOAD_SIZE', (string)(10 * 1024 * 1024))));

// ------------------------------------------------------------
// 4. SMTP EMAIL CONFIGURATION
// ------------------------------------------------------------
define('SMTP_HOST', kruizlyEnv('SMTP_HOST', ''));
define('SMTP_PORT', (int)kruizlyEnv('SMTP_PORT', '587'));
$envSmtpUser = trim((string)kruizlyEnv('SMTP_USER', ''));
if (str_contains($envSmtpUser, 'YOUR_') || str_contains($envSmtpUser, '<')) {
    $envSmtpUser = 'support@kruizly.com';
}
define('SMTP_USER', $envSmtpUser);
define('SMTP_PASS', kruizlyEnv('SMTP_PASS', ''));
define('SMTP_FROM_EMAIL', kruizlyEnv('SMTP_FROM_EMAIL', SMTP_USER ?: 'support@kruizly.com'));
define('SMTP_FROM_NAME', kruizlyEnv('SMTP_FROM_NAME', 'KRUIZLY Car Rentals'));

// ------------------------------------------------------------
// 5. COMPANY DETAILS
// ------------------------------------------------------------
define('COMPANY_NAME', 'KRUIZLY');
define('COMPANY_TAGLINE', 'Premium Self-Drive Car Rentals');
define('COMPANY_PHONE', '+91 91671 64547');
define('COMPANY_EMAIL', 'support@kruizly.com');
define('COMPANY_ADDRESS', 'Gavson Business Park, Ghansoli, Navi Mumbai, Maharashtra 400701');

// Helper function for JSON responses
function sendJsonResponse(array $data, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function sendErrorResponse(string $message, int $statusCode = 400, array $extra = []): void {
    sendJsonResponse(array_merge(['success' => false, 'error' => $message], $extra), $statusCode);
}
