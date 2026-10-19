<?php
/**
 * api/media/index.php
 * GET  /api/media - Query media records by category, relatedId, or userId
 * POST /api/media - Forward upload requests to FileStorageService
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/FileStorageService.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method === 'POST') {
    // Delegate to upload handler
    require __DIR__ . '/upload.php';
    exit;
}

// GET /api/media
try {
    $user = Auth::optionalAuth();

    $category = trim((string)($_GET['category'] ?? ''));
    $relatedId = trim((string)($_GET['relatedId'] ?? $_GET['related_id'] ?? ''));
    $userId = trim((string)($_GET['userId'] ?? $_GET['user_id'] ?? $_GET['uid'] ?? ''));

    $sql = "SELECT media_id, user_id, firebase_uid, category, related_id,
                   original_name, stored_name, stored_path, mime_type, file_size, created_at
            FROM media
            WHERE 1=1";
    $params = [];

    if ($relatedId !== '') {
        $cleanRel = ltrim($relatedId, '#');
        $sql .= " AND (related_id = ? OR related_id = ? OR UPPER(related_id) = UPPER(?))";
        $params[] = $relatedId;
        $params[] = $cleanRel;
        $params[] = $relatedId;
    }

    if ($category !== '') {
        if ($category === 'partner_car_photo') {
            $sql .= " AND (category = 'partner_car_photo' OR category = 'vehicle_gallery' OR category = 'other')";
        } else {
            $sql .= " AND category = ?";
            $params[] = $category;
        }
    }

    if ($userId !== '') {
        $sql .= " AND (firebase_uid = ? OR user_id = ?)";
        $params[] = $userId;
        $params[] = is_numeric($userId) ? (int)$userId : 0;
    }

    $sql .= " ORDER BY id DESC";

    $rows = Database::fetchAll($sql, $params);

    $results = [];
    foreach ($rows as $r) {
        $mId = (string)($r['media_id'] ?? '');
        if ($mId === '') continue;
        $results[] = [
            'id' => $mId,
            'mediaId' => $mId,
            'category' => (string)($r['category'] ?? ''),
            'relatedId' => (string)($r['related_id'] ?? ''),
            'originalName' => (string)($r['original_name'] ?? ''),
            'mimeType' => (string)($r['mime_type'] ?? 'image/jpeg'),
            'fileSize' => (int)($r['file_size'] ?? 0),
            'url' => '/api/media/file.php?id=' . urlencode($mId),
            'createdAt' => (string)($r['created_at'] ?? date('Y-m-d H:i:s'))
        ];
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($results);
    exit;
} catch (Throwable $e) {
    error_log("[Media Query Error] " . $e->getMessage());
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([]);
    exit;
}
