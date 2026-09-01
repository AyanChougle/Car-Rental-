<?php
/**
 * api/media/upload.php
 * POST /api/media/upload - Secure file upload into Hostinger server storage
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../services/FileStorageService.php';

$user = Auth::requireAuth();

if (empty($_FILES['file']) && empty($_FILES['document']) && empty($_FILES['screenshot'])) {
    sendErrorResponse('No file provided in request. Expecting multipart field "file", "document", or "screenshot".', 400);
}

$uploadedFile = $_FILES['file'] ?? $_FILES['document'] ?? $_FILES['screenshot'];
$category = trim((string)($_POST['category'] ?? 'other'));
$relatedId = trim((string)($_POST['relatedId'] ?? $_POST['bookingId'] ?? $_POST['vehicleReg'] ?? ''));

try {
    $result = FileStorageService::handleUpload($uploadedFile, $user['firebase_uid'], $category, $relatedId);
    sendJsonResponse(array_merge(['success' => true], $result), 201);
} catch (Exception $e) {
    error_log("[Media Upload Error] " . $e->getMessage());
    sendErrorResponse('File upload failed: ' . $e->getMessage(), 400);
}
