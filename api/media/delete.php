<?php
/**
 * api/media/delete.php
 * DELETE /api/media/:mediaId
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$isStaff = in_array($user['role'] ?? '', ['admin', 'manager'], true);

$mediaId = trim((string)($_GET['id'] ?? $_GET['mediaId'] ?? ''));
if (!$mediaId) {
    sendErrorResponse('Media ID is required.', 400);
}

$media = Database::fetchOne("SELECT * FROM media WHERE media_id = ? LIMIT 1", [$mediaId]);
if (!$media) {
    sendErrorResponse('Media not found.', 404);
}

if (!$isStaff && $media['firebase_uid'] !== $user['firebase_uid']) {
    sendErrorResponse('Access denied.', 403);
}

if (file_exists($media['stored_path'])) {
    @unlink($media['stored_path']);
}

Database::execute("DELETE FROM media WHERE media_id = ?", [$mediaId]);

sendJsonResponse(['success' => true, 'message' => 'Media deleted successfully.']);
