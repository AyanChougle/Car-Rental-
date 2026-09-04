<?php
/**
 * api/config/config.php (UPDATED)
 * 
 * Central Configuration for KRUIZLY PHP Backend.
 * Hostinger MySQL + JWT (no Firebase dependency).
 */

declare(strict_types=1);

// Error reporting for production vs development
$isLocal = in_array($_SERVER['HTTP_HOST'] ?? '', ['localhost', '127.0.0.1', 'localhost:5500', 'localhost:5501'], true);
if ($isLocal) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}

// ------------------------------------------------------------
// 1. DATABASE CONFIGURATION (Hostinger MySQL)
// ------------------------------------------------------------
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_NAME', getenv('DB_NAME') ?: 'u303154098_carRentpe');
define('DB_USER', getenv('DB_USER') ?: 'u303154098_omkar');
define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'Pa$$@12123');
define('DB_CHARSET', 'utf8mb4');

// ------------------------------------------------------------
// 2. FIREBASE & JWT AUTHENTICATION
// ------------------------------------------------------------
define('FIREBASE_PROJECT_ID', getenv('FIREBASE_PROJECT_ID') ?: 'carrentpeweb');

// SECURITY: In production, this MUST come from environment variable
// Generate a strong key: php -r "echo bin2hex(random_bytes(32));"
define('JWT_SECRET', getenv('JWT_SECRET') ?: 'dev_key_change_in_production_immediately');

// Admin emails that auto-get admin role on first login
define('ADMIN_EMAILS', ['ayan@kruizly.com', 'admin@kruizly.com', 'carrentpedatabase@gmail.com']);

// Token expiration times (seconds)
define('JWT_ACCESS_TOKEN_TTL', 86400); // 24 hours
define('JWT_REFRESH_TOKEN_TTL', 604800); // 7 days

// ------------------------------------------------------------
// 3. FILE STORAGE PATHS (Hostinger Filesystem)
// ------------------------------------------------------------
$storagePath = realpath(__DIR__ . '/../../storage') ?: (__DIR__ . '/../../storage');
if (!is_dir($storagePath)) {
    @mkdir($storagePath, 0755, true);
}
define('STORAGE_ROOT', $storagePath);
define('MAX_UPLOAD_SIZE', 10 * 1024 * 1024); // 10 MB

// ------------------------------------------------------------
// 4. SMTP EMAIL CONFIGURATION
// ------------------------------------------------------------
define('SMTP_HOST', getenv('SMTP_HOST') ?: 'smtp.gmail.com');
define('SMTP_PORT', (int)(getenv('SMTP_PORT') ?: 587));
define('SMTP_USER', getenv('SMTP_USER') ?: 'carrentpedatabase@gmail.com');
define('SMTP_PASS', getenv('SMTP_PASS') ?: 'ydgallypuahfjnrc');
define('SMTP_FROM_EMAIL', getenv('SMTP_FROM_EMAIL') ?: 'carrentpedatabase@gmail.com');
define('SMTP_FROM_NAME', getenv('SMTP_FROM_NAME') ?: 'KRUIZLY Car Rentals');

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
