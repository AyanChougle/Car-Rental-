<?php
/**
 * api/users/bank-details.php
 * GET  /api/users/bank-details            - host: own bank details (account number masked)
 * GET  /api/users/bank-details?all=1      - staff: all host bank records for audit & verification
 * GET  /api/users/bank-details?uid=XXX    - staff: full details for a specific host
 * POST /api/users/bank-details            - host: submit/update bank details
 * POST (staff) {uid, status, rejectionReason} - verify / reject a host's bank details
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$role = strtolower((string)($user['role'] ?? 'customer'));
$isStaff = in_array($role, ['admin', 'super_admin', 'manager', 'accountant', 'executive'], true);
$isHost = ($role === 'host' || $role === 'admin' || $role === 'super_admin');

if (!$isHost && !$isStaff) {
    sendErrorResponse('Bank details are only available for host accounts.', 403);
}

function buildMediaUrl(?string $id): ?string {
    if (!$id || trim($id) === '') return null;
    return "https://kruizly.com/api/media/file.php?id=" . urlencode(trim($id));
}

function bankMask(string $n): string {
    $n = trim($n);
    $len = strlen($n);
    return $len <= 4 ? $n : str_repeat('•', max(0, $len - 4)) . substr($n, -4);
}

function bankPayload(?array $r, bool $full): ?array {
    if (!$r) return null;
    $acct = (string)($r['account_number'] ?? '');
    return [
        'id' => (int)($r['id'] ?? 0),
        'firebaseUid' => (string)($r['firebase_uid'] ?? ''),
        'userId' => !empty($r['user_id']) ? (int)$r['user_id'] : null,
        'name' => (string)($r['user_name'] ?? $r['account_holder_name'] ?? ''),
        'email' => (string)($r['user_email'] ?? ''),
        'phone' => (string)($r['user_phone'] ?? ''),
        'accountHolderName' => (string)($r['account_holder_name'] ?? ''),
        'accountNumber' => $full ? $acct : bankMask($acct),
        'accountNumberMasked' => bankMask($acct),
        'ifscCode' => (string)($r['ifsc_code'] ?? ''),
        'branchName' => (string)($r['branch_name'] ?? ''),
        'passbookMediaId' => $r['passbook_media_id'] ?? null,
        'passbookUrl' => buildMediaUrl($r['passbook_media_id'] ?? null),
        'status' => (string)($r['status'] ?? 'pending'),
        'rejectionReason' => $r['rejection_reason'] ?? null,
        'verifiedBy' => $r['verified_by'] ?? null,
        'verifiedAt' => $r['verified_at'] ?? null,
        'updatedAt' => $r['updated_at'] ?? $r['verified_at'] ?? null,
    ];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    try {
        if ($isStaff && !empty($_GET['all'])) {
            $rows = Database::fetchAll("SELECT * FROM host_bank_details ORDER BY id DESC");

            $uMap = [];
            try {
                $allUsers = Database::fetchAll("SELECT id, firebase_uid, name, email, phone FROM users");
                foreach ($allUsers as $u) {
                    if (!empty($u['firebase_uid'])) $uMap['uid_' . trim((string)$u['firebase_uid'])] = $u;
                    if (!empty($u['id'])) $uMap['id_' . (int)$u['id']] = $u;
                }
            } catch (Throwable $_) {}

            $result = [];
            foreach ($rows as $row) {
                $matchedUser = null;
                $rowUid = trim((string)($row['firebase_uid'] ?? ''));
                $rowUserId = (int)($row['user_id'] ?? 0);
                if ($rowUserId && isset($uMap['id_' . $rowUserId])) {
                    $matchedUser = $uMap['id_' . $rowUserId];
                } elseif ($rowUid && isset($uMap['uid_' . $rowUid])) {
                    $matchedUser = $uMap['uid_' . $rowUid];
                }

                if ($matchedUser) {
                    $row['user_name'] = $matchedUser['name'] ?? $row['account_holder_name'];
                    $row['user_email'] = $matchedUser['email'] ?? '';
                    $row['user_phone'] = $matchedUser['phone'] ?? '';
                }
                $result[] = bankPayload($row, true);
            }
            sendJsonResponse(['success' => true, 'bankDetails' => $result]);
        }

        $uid = trim((string)($user['firebase_uid'] ?? ''));
        $full = false;
        if ($isStaff && !empty($_GET['uid'])) {
            $uid = trim((string)$_GET['uid']);
            $full = true;
        }

        $row = null;
        if (!empty($user['id'])) {
            $row = Database::fetchOne("SELECT * FROM host_bank_details WHERE user_id = ? ORDER BY id DESC LIMIT 1", [(int)$user['id']]);
        }
        if (!$row && $uid !== '') {
            $allRows = Database::fetchAll("SELECT * FROM host_bank_details ORDER BY id DESC");
            foreach ($allRows as $r) {
                if (trim((string)($r['firebase_uid'] ?? '')) === $uid) {
                    $row = $r;
                    break;
                }
            }
        }

        sendJsonResponse(['success' => true, 'bankDetails' => bankPayload($row, $full)]);
    } catch (Throwable $e) {
        error_log("[bank-details.php GET Error] " . $e->getMessage());
        sendErrorResponse('Failed to load bank details: ' . $e->getMessage(), 500);
    }
}

if ($method === 'POST') {
    try {
        $raw = (string)file_get_contents('php://input');
        $input = json_decode($raw, true);
        if (!is_array($input)) $input = $_POST;

        // Staff review action (Approve / Reject)
        if ($isStaff && (!empty($input['uid']) || !empty($input['id'])) && !empty($input['status'])) {
            $status = strtolower(trim((string)$input['status']));
            if (!in_array($status, ['pending', 'verified', 'rejected'], true)) {
                sendErrorResponse('Invalid status value.', 400);
            }

            $targetUid = trim((string)($input['uid'] ?? ''));
            $targetId = isset($input['id']) ? (int)$input['id'] : 0;
            $reason = ($status === 'rejected') ? trim((string)($input['rejectionReason'] ?? '')) : null;
            $verifier = $user['email'] ?? $user['name'] ?? ($user['firebase_uid'] ?? 'staff');
            $verifiedAt = ($status === 'verified') ? date('Y-m-d H:i:s') : null;

            $affected = Database::execute(
                "UPDATE host_bank_details 
                 SET status = ?, 
                     rejection_reason = ?, 
                     verified_by = ?, 
                     verified_at = ? 
                 WHERE id = ? 
                    OR (firebase_uid IS NOT NULL AND firebase_uid != '' AND BINARY firebase_uid = BINARY ?)",
                [
                    $status,
                    $reason,
                    $verifier,
                    $verifiedAt,
                    $targetId,
                    $targetUid
                ]
            );

            // Audit log
            try {
                Database::execute(
                    "INSERT INTO audit_logs (firebase_uid, action, resource_type, resource_id, details, ip_address) 
                     VALUES (?, 'update_host_bank_status', 'host_bank_details', ?, ?, ?)",
                    [
                        $user['firebase_uid'] ?? 'staff',
                        $targetUid ?: (string)$targetId,
                        json_encode(['status' => $status, 'reason' => $reason, 'verified_by' => $verifier]),
                        $_SERVER['REMOTE_ADDR'] ?? null
                    ]
                );
            } catch (Throwable $_) {}

            sendJsonResponse([
                'success' => true, 
                'message' => "Bank details status updated to '$status' successfully.",
                'affected' => $affected
            ]);
        }

        // Host submitting/updating their bank details
        if (!$isHost) {
            sendErrorResponse('Only host accounts can submit bank details.', 403);
        }

        $name = trim(preg_replace('/\s+/', ' ', (string)($input['accountHolderName'] ?? $input['fullName'] ?? '')));
        $acct = preg_replace('/\s+/', '', (string)($input['accountNumber'] ?? ''));
        $ifsc = strtoupper(preg_replace('/\s+/', '', (string)($input['ifscCode'] ?? $input['ifsc'] ?? '')));
        $branch = trim((string)($input['branchName'] ?? ''));
        $passbook = trim((string)($input['passbookMediaId'] ?? ''));

        $existing = Database::fetchOne(
            "SELECT * FROM host_bank_details WHERE firebase_uid = ? LIMIT 1", 
            [$user['firebase_uid']]
        );

        // Allow keeping the stored account number when masked string (••••) is echoed back
        if ($existing && $acct !== '' && (strpos($acct, '•') !== false || strpos($acct, '*') !== false)) {
            $acct = (string)$existing['account_number'];
        }
        if ($existing && $acct === '') {
            $acct = (string)$existing['account_number'];
        }
        if ($passbook === '' && $existing) {
            $passbook = (string)($existing['passbook_media_id'] ?? '');
        }

        if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
            sendErrorResponse('Enter the full name exactly as printed on your bank passbook.', 400);
        }
        if (!preg_match('/^\d{9,18}$/', $acct)) {
            sendErrorResponse('Account number must be 9 to 18 digits.', 400);
        }
        if (!preg_match('/^[A-Z0-9]{11}$/', $ifsc)) {
            sendErrorResponse('Enter a valid 11-character IFSC code.', 400);
        }
        if ($passbook === '') {
            sendErrorResponse('Upload a clear photo of your passbook front page.', 400);
        }

        Database::execute(
            "INSERT INTO host_bank_details (
                firebase_uid, user_id, account_holder_name, account_number, ifsc_code, branch_name, passbook_media_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                account_holder_name = VALUES(account_holder_name),
                account_number = VALUES(account_number),
                ifsc_code = VALUES(ifsc_code),
                branch_name = VALUES(branch_name),
                passbook_media_id = VALUES(passbook_media_id),
                status = 'pending', 
                rejection_reason = NULL, 
                verified_by = NULL, 
                verified_at = NULL",
            [
                $user['firebase_uid'], 
                !empty($user['id']) ? (int)$user['id'] : null, 
                $name, 
                $acct, 
                $ifsc, 
                $branch, 
                $passbook
            ]
        );

        $row = Database::fetchOne(
            "SELECT * FROM host_bank_details WHERE firebase_uid = ? LIMIT 1", 
            [$user['firebase_uid']]
        );

        sendJsonResponse([
            'success' => true, 
            'message' => 'Bank details saved and submitted for verification successfully.', 
            'bankDetails' => bankPayload($row, false)
        ], 201);
    } catch (Throwable $e) {
        error_log("[bank-details.php POST Error] " . $e->getMessage());
        sendErrorResponse('Failed to update bank details: ' . $e->getMessage(), 500);
    }
}

sendErrorResponse('Method not allowed.', 405);
