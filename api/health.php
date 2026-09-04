<?php
/**
 * api/health.php
 * GET /api/health - Health check endpoint
 */

declare(strict_types=1);

require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/middleware/cors.php';

$dbStatus = 'disconnected';

try {
    $res = Database::fetchOne("SELECT 1 as alive");

    if ($res && $res['alive'] == 1) {
        $dbStatus = 'connected';
    }
} catch (Throwable $e) {
    $dbStatus = 'error: ' . $e->getMessage();
}

sendJsonResponse([
    'success' => true,
    'service' => 'KRUIZLY PHP REST API',
    'version' => '2.0.0',
    'runtime' => 'PHP ' . PHP_VERSION,
    'database' => $dbStatus,
    'timestamp' => date('Y-m-d H:i:s')
]);