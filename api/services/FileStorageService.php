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
    // Blocked executable/script extensions for server security
    private const BLOCKED_EXTENSIONS = [
        'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'phps',
        'exe', 'bat', 'cmd', 'sh', 'bash', 'com', 'dll', 'vbs', 'vbe', 'js', 'jse',
        'wsf', 'wsh', 'scr', 'cpl', 'jar', 'jsp', 'asp', 'aspx', 'cgi', 'pl', 'py'
    ];

    public static function getMimeFromExtension(string $ext): string {
        return match(strtolower($ext)) {
            'jpg', 'jpeg', 'jpe', 'jfif', 'jfi', 'jif' => 'image/jpeg',
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            'bmp', 'dib' => 'image/bmp',
            'tif', 'tiff' => 'image/tiff',
            'svg', 'svgz' => 'image/svg+xml',
            'avif', 'avis' => 'image/avif',
            'heic', 'heif', 'hif', 'hvic', 'heics', 'heifs' => 'image/heic',
            'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'rw2', 'orf', 'pef' => 'image/x-dcraw',
            'zip', 'zipx', 'z' => 'application/zip',
            '7z', 's7z' => 'application/x-7z-compressed',
            'rar', 'rev' => 'application/vnd.rar',
            'tar' => 'application/x-tar',
            'gz', 'gzip', 'tgz', 'tar.gz' => 'application/gzip',
            'bz2', 'bzip2', 'tbz2', 'tbz', 'tar.bz2' => 'application/x-bzip2',
            'xz', 'txz', 'tar.xz' => 'application/x-xz',
            'zst', 'zstd', 'tar.zst' => 'application/zstd',
            'pdf' => 'application/pdf',
            'doc', 'dot', 'rtf' => 'application/msword',
            'docx', 'dotx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls', 'xlt', 'csv' => 'application/vnd.ms-excel',
            'xlsx', 'xltx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt', 'pot' => 'application/vnd.ms-powerpoint',
            'pptx', 'potx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt', 'text' => 'text/plain',
            default => 'application/octet-stream'
        };
    }

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
        $lowerName = strtolower($origName);
        $ext = '';
        if (preg_match('/\.tar\.(gz|bz2|xz|zst)$/i', $lowerName, $m)) {
            $ext = 'tar.' . strtolower($m[1]);
        } else {
            $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        }

        // Security check: Never allow server execution scripts
        $singleExt = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        if (in_array($singleExt, self::BLOCKED_EXTENSIONS, true) || in_array($ext, self::BLOCKED_EXTENSIONS, true)) {
            throw new Exception("File type '.$ext' is restricted for security.");
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']) ?: '';

        // Disallow PHP / executable MIME types
        if (str_contains($mimeType, 'php') || str_contains($mimeType, 'executable') || str_contains($mimeType, 'x-msdownload')) {
            throw new Exception("Invalid file content type '$mimeType'.");
        }

        // Resolve canonical MIME from extension if generic or empty
        if (empty($mimeType) || $mimeType === 'application/octet-stream' || $mimeType === 'binary/octet-stream') {
            $mimeType = self::getMimeFromExtension($ext);
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
        $userId = (!empty($user['id']) && (int)$user['id'] > 0) ? (int)$user['id'] : null;

        // Auto-calculate next ID so insert never fails with duplicate key 0
        $maxRow = Database::fetchOne("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM media");
        $nextId = (int)($maxRow['next_id'] ?? 1);

        // Record in media table
        Database::execute(
            "INSERT INTO media (id, media_id, user_id, firebase_uid, category, related_id, original_name, stored_name, stored_path, mime_type, file_size, file_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $nextId, $mediaId, $userId, $firebaseUid, $dbCategory, $relatedId,
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

        $filePath = null;
        $mimeType = 'image/png';
        $originalName = 'document.png';

        if ($media) {
            $mimeType = $media['mime_type'] ?: 'image/png';
            $originalName = $media['original_name'] ?: 'document.png';
            $candidatePath = $media['stored_path'] ?? '';

            if ($candidatePath && file_exists($candidatePath) && !is_dir($candidatePath)) {
                $filePath = $candidatePath;
            } else {
                $storedName = $media['stored_name'] ?? basename((string)$candidatePath);
                $searchLocations = [
                    STORAGE_ROOT . '/' . $storedName,
                    STORAGE_ROOT . '/bookings/' . ($media['related_id'] ?? '') . '/' . $storedName,
                    STORAGE_ROOT . '/bookings/general/' . $storedName,
                    STORAGE_ROOT . '/users/' . ($media['firebase_uid'] ?? '') . '/verification/' . $storedName,
                    STORAGE_ROOT . '/users/' . ($media['firebase_uid'] ?? '') . '/personal/' . $storedName,
                    STORAGE_ROOT . '/verification/' . $storedName,
                    STORAGE_ROOT . '/payment_proof/' . $storedName,
                    STORAGE_ROOT . '/vehicle_gallery/' . $storedName,
                    STORAGE_ROOT . '/vehicles/' . ($media['related_id'] ?? '') . '/' . $storedName,
                    STORAGE_ROOT . '/other/' . $storedName,
                    __DIR__ . '/../../storage/' . $storedName,
                    __DIR__ . '/../../uploads/' . $storedName,
                ];
                foreach ($searchLocations as $loc) {
                    if ($loc && file_exists($loc) && !is_dir($loc)) {
                        $filePath = $loc;
                        break;
                    }
                }
            }
        }

        if (!$filePath && $mediaId) {
            $cleanRel = str_replace(['../', '..\\'], '', $mediaId);
            $candidates = [
                STORAGE_ROOT . '/' . ltrim($cleanRel, '/'),
                STORAGE_ROOT . '/users/' . ltrim($cleanRel, '/'),
                STORAGE_ROOT . '/bookings/' . ltrim($cleanRel, '/'),
                STORAGE_ROOT . '/inspection_photo/' . ltrim($cleanRel, '/'),
                STORAGE_ROOT . '/invoices/' . ltrim($cleanRel, '/'),
                STORAGE_ROOT . '/vehicles/' . ltrim($cleanRel, '/'),
                __DIR__ . '/../../storage/' . ltrim($cleanRel, '/'),
            ];
            foreach ($candidates as $cand) {
                if ($cand && file_exists($cand) && !is_dir($cand)) {
                    $filePath = $cand;
                    $originalName = basename($cand);
                    $lowerCand = strtolower(basename($cand));
                    if (preg_match('/\.tar\.(gz|bz2|xz)$/i', $lowerCand, $m)) {
                        $ext = 'tar.' . strtolower($m[1]);
                    } else {
                        $ext = strtolower(pathinfo($cand, PATHINFO_EXTENSION));
                    }
                    $mimeType = self::getMimeFromExtension($ext);
                    break;
                }
            }
        }

        if ($filePath && file_exists($filePath) && !is_dir($filePath)) {
            header('Content-Type: ' . $mimeType);
            header('Content-Length: ' . filesize($filePath));
            header('Cache-Control: public, max-age=86400');
            header('Content-Disposition: inline; filename="' . basename($originalName) . '"');
            readfile($filePath);
            exit;
        }

        // Return a clean inline SVG fallback image when media file is missing on disk
        header('Content-Type: image/svg+xml; charset=utf-8');
        header('Cache-Control: public, max-age=300');
        header('Content-Disposition: inline; filename="document-preview.svg"');
        echo '<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300" viewBox="0 0 500 300">
  <rect width="100%" height="100%" fill="#0d1117" rx="14"/>
  <rect x="20" y="20" width="460" height="260" rx="10" fill="#161b22" stroke="#30363d" stroke-width="1.5" stroke-dasharray="6,6"/>
  <circle cx="250" cy="110" r="32" fill="#21262d"/>
  <path d="M238 120l8-10 6 7 12-15 12 18H238z" fill="#48d7ff"/>
  <circle cx="246" cy="98" r="4" fill="#48d7ff"/>
  <text x="50%" y="175" fill="#f0f6fc" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Document Preview</text>
  <text x="50%" y="205" fill="#8b949e" font-family="system-ui, -apple-system, sans-serif" font-size="12" text-anchor="middle">Ref: ' . htmlspecialchars($mediaId, ENT_QUOTES, 'UTF-8') . '</text>
  <text x="50%" y="235" fill="#388bfd" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" text-anchor="middle">KRUIZLY Protected Storage</text>
</svg>';
        exit;
    }
}
