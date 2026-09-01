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

        // Update verification record
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
    });

    sendJsonResponse([
        'success' => true,
        'message' => "KYC status updated to '$status' for user."
    ]);
} catch (Exception $e) {
    error_log("[Verification Status Update Error] " . $e->getMessage());
    sendErrorResponse('Failed to update verification status: ' . $e->getMessage(), 500);
}
