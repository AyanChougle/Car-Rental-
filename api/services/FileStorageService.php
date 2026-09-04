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
        if (in_array($cleanCategory, ['verification', 'users', 'license_doc', 'aadhar_doc', 'pan_doc'], true)) {
            $targetDir = STORAGE_ROOT . '/users/' . $safeUid . '/verification';
        } elseif ($cleanCategory === 'personal_media') {
            $targetDir = STORAGE_ROOT . '/users/' . $safeUid . '/personal';
        } elseif ($cleanCategory === 'bookings' || $cleanCategory === 'payment_proof' || $cleanCategory === 'payment_screenshot') {
            $targetDir = STORAGE_ROOT . '/bookings/' . ($relatedId ? preg_replace('/[^a-zA-Z0-9_-]/', '_', $relatedId) : 'general');
        } elseif ($cleanCategory === 'vehicles' || $cleanCategory === 'vehicle_gallery') {
            $targetDir = STORAGE_ROOT . '/vehicles/' . ($relatedId ? preg_replace('/[^a-zA-Z0-9_-]/', '_', $relatedId) : 'fleet');
        }

        if (!is_dir($targetDir)) {
            if (!@mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
                $targetDir = STORAGE_ROOT;
            }
        }

        $mediaId = 'MED-' . bin2hex(random_bytes(12));
        $storedName = time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $targetPath = $targetDir . '/' . $storedName;

        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            throw new Exception('Failed to move uploaded file to destination directory.');
        }

        $fileHash = hash_file('sha256', $targetPath);

        // Map category to schema ENUM for media table
        $dbCategory = match($cleanCategory) {
            'license_doc', 'aadhar_doc', 'pan_doc', 'verification', 'users' => 'verification',
            'payment_proof', 'payment_screenshot' => 'payment_proof',
            'vehicle_gallery', 'vehicles' => 'vehicle_gallery',
            'booking_doc', 'bookings' => 'booking_doc',
            'invoice', 'invoices' => 'invoice',
            default => 'other'
        };

        // Get user ID
        $user = Database::fetchOne("SELECT id FROM users WHERE firebase_uid = ? LIMIT 1", [$firebaseUid]);
        $userId = $user['id'] ?? null;

        // Record in media table
        Database::execute(
            "INSERT INTO media (media_id, user_id, firebase_uid, category, related_id, original_name, stored_name, stored_path, mime_type, file_size, file_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $mediaId, $userId, $firebaseUid, $dbCategory, $relatedId,
                $origName, $storedName, $targetPath, $mimeType, $file['size'], $fileHash
            ]
        );

        $mediaUrl = '/api/media/file.php?id=' . urlencode($mediaId);

        return [
            'id' => $mediaId,
            'mediaId' => $mediaId,
            'originalName' => $origName,
            'storedName' => $storedName,
            'url' => $mediaUrl,
            'mediaUrl' => $mediaUrl,
            'category' => $cleanCategory,
            'mimeType' => $mimeType,
            'fileSize' => $file['size'],
            'sizeBytes' => $file['size'],
            'createdAt' => date('Y-m-d H:i:s'),
            'uploadedAt' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * Streams a media file to output by its unique mediaId
     */
    public static function streamMedia(string $mediaId, ?array $user = null): void {
        $media = Database::fetchOne("SELECT * FROM media WHERE media_id = ? LIMIT 1", [$mediaId]);
        if (!$media) {
            sendErrorResponse('Media record not found.', 404);
        }

        $filePath = $media['stored_path'];
        if (!file_exists($filePath)) {
            sendErrorResponse('Stored file does not exist on disk: ' . basename($filePath), 404);
        }

        header('Content-Type: ' . $media['mime_type']);
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: public, max-age=86400');
        header('Content-Disposition: inline; filename="' . basename($media['original_name']) . '"');

        readfile($filePath);
        exit;
    }
}
