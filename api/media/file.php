<?php
/**
 * api/media/file.php
 * GET /api/media/file.php?id=:mediaId - Stream authenticated file from Hostinger storage
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/FileStorageService.php';

$mediaId = trim((string)($_GET['id'] ?? $_GET['mediaId'] ?? ''));
if (!$mediaId) {
    sendErrorResponse('Media ID is required.', 400);
}

$user = Auth::optionalAuth();

FileStorageService::streamMedia($mediaId, $user);
