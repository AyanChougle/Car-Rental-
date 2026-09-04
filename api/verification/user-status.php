<?php
/**
 * api/verification/user-status.php
 * POST /api/verification/user/:uid/status - Admin direct KYC status update
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$admin = Auth::requireRole('admin', 'manager');
$input = json_decode((string)file_get_contents('php://input'), true) ?: $_POST;

$targetUid = trim((string)($_GET['uid'] ?? $input['uid'] ?? $input['firebaseUid'] ?? ''));
$docType = strtolower(trim((string)($input['documentType'] ?? $input['docType'] ?? '')));
$status = strtolower(trim((string)($input['status'] ?? 'verified')));
$reason = trim((string)($input['rejectionReason'] ?? $input['reason'] ?? ''));

if (!$targetUid) {
    sendErrorResponse('Target user UID is required.', 400);
}

$validStatuses = ['verified', 'rejected', 'pending', 'not_submitted'];
if (!in_array($status, $validStatuses, true)) {
    sendErrorResponse("Invalid status '$status'.", 400);
}

try {
    Database::transaction(function($pdo) use ($targetUid, $docType, $status, $reason, $admin) {
        $now = date('Y-m-d H:i:s');

        $userUpdates = [];
        $params = [];

        if ($docType === 'license') {
            $userUpdates[] = "license_status = ?";
            $params[] = $status;
        } elseif ($docType === 'aadhar') {
            $userUpdates[] = "aadhar_status = ?";
            $params[] = $status;
        } elseif ($docType === 'pan') {
            $userUpdates[] = "pan_status = ?";
            $params[] = $status;
        } else {
            // Overall verification
            $userUpdates[] = "license_status = ?";
            $userUpdates[] = "aadhar_status = ?";
            $userUpdates[] = "pan_status = ?";
            $params[] = $status;
            $params[] = $status;
            $params[] = $status;
        }

        $params[] = $targetUid;
        $pdo->prepare("UPDATE users SET " . implode(', ', $userUpdates) . ", updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?")->execute($params);

        // Ensure verification record exists and is updated
        $verRecord = Database::fetchOne("SELECT id FROM verification WHERE firebase_uid = ? LIMIT 1", [$targetUid]);
        if (!$verRecord) {
            $verId = 'VER-' . strtoupper(bin2hex(random_bytes(6)));
            $u = Database::fetchOne("SELECT * FROM users WHERE firebase_uid = ? LIMIT 1", [$targetUid]);
            if ($u) {
                $licSt = $docType === 'license' ? $status : ($u['license_status'] ?: 'not_submitted');
                $adhSt = $docType === 'aadhar' ? $status : ($u['aadhar_status'] ?: 'not_submitted');
                $panSt = $docType === 'pan' ? $status : ($u['pan_status'] ?: 'not_submitted');
                $overSt = ($licSt === 'verified' && $adhSt === 'verified') ? 'verified' : ($status === 'rejected' ? 'rejected' : 'pending');

                $pdo->prepare(
                    "INSERT INTO verification (
                        verification_id, user_id, firebase_uid, full_name, phone,
                        license_status, aadhar_status, pan_status, overall_status,
                        rejection_reason, verified_by, verified_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                )->execute([
                    $verId, $u['id'], $u['firebase_uid'], $u['name'], $u['phone'],
                    $licSt, $adhSt, $panSt, $overSt,
                    $reason ?: null, $admin['firebase_uid'], $now
                ]);
            }
        } else {
            $verUpdates = [];
            $vParams = [];
            if ($docType === 'license') {
                $verUpdates[] = "license_status = ?";
                $vParams[] = $status;
            } elseif ($docType === 'aadhar') {
                $verUpdates[] = "aadhar_status = ?";
                $vParams[] = $status;
            } elseif ($docType === 'pan') {
                $verUpdates[] = "pan_status = ?";
                $vParams[] = $status;
            } else {
                $verUpdates[] = "license_status = ?";
                $verUpdates[] = "aadhar_status = ?";
                $verUpdates[] = "pan_status = ?";
                $vParams[] = $status;
                $vParams[] = $status;
                $vParams[] = $status;
            }

            $verUpdates[] = "overall_status = ?";
            $vParams[] = $status === 'verified' ? 'verified' : ($status === 'rejected' ? 'rejected' : 'pending');

            if ($reason) {
                $verUpdates[] = "rejection_reason = ?";
                $vParams[] = $reason;
            }

            $verUpdates[] = "verified_by = ?";
            $verUpdates[] = "verified_at = ?";
            $vParams[] = $admin['firebase_uid'];
            $vParams[] = $now;
            $vParams[] = $targetUid;

            $pdo->prepare("UPDATE verification SET " . implode(', ', $verUpdates) . ", updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?")->execute($vParams);
        }
    });

    sendJsonResponse([
        'success' => true,
        'message' => "KYC status updated to '$status' for user."
    ]);
} catch (Exception $e) {
    error_log("[Verification Status Update Error] " . $e->getMessage());
    sendErrorResponse('Failed to update verification status: ' . $e->getMessage(), 500);
}
