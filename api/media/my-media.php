<?php
/**
 * api/media/my-media.php
 * GET /api/media/my-media - List current user's uploaded files
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();

$rows = Database::fetchAll(
    "SELECT media_id, category, related_id, original_name, mime_type, file_size, created_at
     FROM media
     WHERE firebase_uid = ?
     ORDER BY created_at DESC",
    [$user['firebase_uid']]
);

$files = array_map(function($m) {
    return [
        'mediaId' => $m['media_id'],
        'category' => $m['category'],
        'relatedId' => $m['related_id'],
        'originalName' => $m['original_name'],
        'mimeType' => $m['mime_type'],
        'fileSize' => (int)$m['file_size'],
        'url' => '/api/media/file.php?id=' . urlencode($m['media_id']),
        'createdAt' => $m['created_at']
    ];
}, $rows);

sendJsonResponse(['success' => true, 'count' => count($files), 'files' => $files]);
