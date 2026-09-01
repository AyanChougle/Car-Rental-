<?php
/**
 * api/services/FileStorageService.php
 * 
 * Secure Hostinger File Storage and Media Management.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';

class FileStorageService {
    private const ALLOWED_EXTENSIONS = [
        'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf', 'doc', 'docx'
    ];

    private const ALLOWED_MIME_TYPES = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    /**
     * Uploads and stores a file in Hostinger server filesystem
     */
    public static function handleUpload(array $file, string $firebaseUid, string $category = 'other', ?string $relatedId = null): array {
        if (!isset($file['error']) || is_array($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
            throw new Exception('File upload error code: ' . ($file['error'] ?? 'unknown'));
        }

        if ($file['size'] > MAX_UPLOAD_SIZE) {
            throw new Exception('File exceeds maximum allowed size of 10 MB.');
        }

        $origName = basename($file['name']);
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));

        if (!in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
            throw new Exception("File extension '.$ext' is not allowed for security reasons.");
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);

        if (!in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new Exception("Invalid MIME type '$mimeType'.");
        }

        // Subfolder routing
        $safeUid = preg_replace('/[^a-zA-Z0-9_-]/', '_', $firebaseUid);
        $cleanCategory = preg_replace('/[^a-zA-Z0-9_-]/', '_', $category);

        $targetDir = STORAGE_ROOT . '/' . $cleanCategory;
        if ($cleanCategory === 'verification' || $cleanCategory === 'users') {
            $targetDir = STORAGE_ROOT . '/users/' . $safeUid . '/verification';
        } elseif ($cleanCategory === 'bookings' || $cleanCategory === 'payment_proof') {
            $targetDir = STORAGE_ROOT . '/bookings/' . ($relatedId ? preg_replace('/[^a-zA-Z0-9_-]/', '_', $relatedId) : 'general');
        } elseif ($cleanCategory === 'vehicles' || $cleanCategory === 'vehicle_gallery') {
            $targetDir = STORAGE_ROOT . '/vehicles/' . ($relatedId ? preg_replace('/[^a-zA-Z0-9_-]/', '_', $relatedId) : 'fleet');
        }

        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        $mediaId = 'MED-' . bin2hex(random_bytes(12));
        $storedName = time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $targetPath = $targetDir . '/' . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            throw new Exception('Failed to move uploaded file to destination directory.');
        }

        $fileHash = hash_file('sha256', $targetPath);

        // Get user ID
        $user = Database::fetchOne("SELECT id FROM users WHERE firebase_uid = ? LIMIT 1", [$firebaseUid]);
        $userId = $user['id'] ?? null;

        // Record in media table
        Database::execute(
            "INSERT INTO media (media_id, user_id, firebase_uid, category, related_id, original_name, stored_name, stored_path, mime_type, file_size, file_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $mediaId, $userId, $firebaseUid, $cleanCategory, $relatedId,
                $origName, $storedName, $targetPath, $mimeType, $file['size'], $fileHash
            ]
        );

        $mediaUrl = '/api/media/file.php?id=' . urlencode($mediaId);

        return [
            'mediaId' => $mediaId,
            'originalName' => $origName,
            'storedName' => $storedName,
            'url' => $mediaUrl,
            'mediaUrl' => $mediaUrl,
            'category' => $cleanCategory,
            'mimeType' => $mimeType,
            'fileSize' => $file['size'],
            'createdAt' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * Streams an authenticated media file to output
     */
    public static function streamMedia(string $mediaId, ?array $user): void {
        $media = Database::fetchOne("SELECT * FROM media WHERE media_id = ? LIMIT 1", [$mediaId]);
        if (!$media) {
            sendErrorResponse('Media record not found.', 404);
        }

        $filePath = $media['stored_path'];
        if (!file_exists($filePath)) {
            sendErrorResponse('Stored file does not exist on disk.', 404);
        }

        // Authorization check
        $category = $media['category'];
        $isPublic = ($category === 'vehicle_gallery' || $category === 'vehicles');
        $isOwner = $user && ($media['firebase_uid'] === $user['firebase_uid']);
        $isStaff = $user && in_array($user['role'] ?? '', ['admin', 'manager', 'executive'], true);

        if (!$isPublic && !$isOwner && !$isStaff) {
            sendErrorResponse('Access denied to this file.', 403);
        }

        header('Content-Type: ' . $media['mime_type']);
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: private, max-age=86400');
        header('Content-Disposition: inline; filename="' . basename($media['original_name']) . '"');

        readfile($filePath);
        exit;
    }
}
