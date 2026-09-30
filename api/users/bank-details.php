<?php
/**
 * api/users/bank-details.php
 * GET  /api/users/bank-details            - host: own bank details (account number masked)
 * GET  /api/users/bank-details?uid=XXX    - staff only: full details for a host
 * POST /api/users/bank-details            - host: save/update bank details
 * POST (staff) {uid, status, rejectionReason} - verify / reject a host's details
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$user = Auth::requireAuth();
$role = strtolower((string)($user['role'] ?? 'customer'));
$isStaff = in_array($role, ['admin', 'super_admin', 'manager', 'accountant', 'executive'], true);
$isHost = ($role === 'host');

if (!$isHost && !$isStaff) {
    sendErrorResponse('Bank details are only available for host accounts.', 403);
}

Database::execute("CREATE TABLE IF NOT EXISTS host_bank_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    user_id INT DEFAULT NULL,
    account_holder_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(32) NOT NULL,
    ifsc_code VARCHAR(16) NOT NULL,\n    branch_name VARCHAR(255) DEFAULT NULL,
    passbook_media_id VARCHAR(64) DEFAULT NULL,
    status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
    rejection_reason TEXT DEFAULT NULL,
    verified_by VARCHAR(128) DEFAULT NULL,
    verified_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

try { Database::execute("ALTER TABLE host_bank_details ADD COLUMN branch_name VARCHAR(255) DEFAULT NULL AFTER ifsc_code"); } catch (Exception $e) {}

function bankMask(string $n): string {
    $len = strlen($n);
    return $len <= 4 ? $n : str_repeat('•', $len - 4) . substr($n, -4);
}

function bankPayload(?array $r, bool $full): ?array {
    if (!$r) return null;
    return [
        'accountHolderName' => $r['account_holder_name'],
        'accountNumber' => $full ? $r['account_number'] : bankMask((string)$r['account_number']),
        'accountNumberMasked' => bankMask((string)$r['account_number']),
        'ifscCode' => $r['ifsc_code'],
        'passbookMediaId' => $r['passbook_media_id'],
        'status' => $r['status'],
        'rejectionReason' => $r['rejection_reason'],
        'updatedAt' => $r['updated_at'],
    ];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if ($isStaff && !empty($_GET['all'])) {
        $rows = Database::fetchAll("SELECT * FROM host_bank_details ORDER BY created_at DESC");
        $result = [];
        foreach ($rows as $row) {
            $result[] = bankPayload($row, true);
        }
        sendJsonResponse(['success' => true, 'bankDetails' => $result]);
    }

    $uid = $user['firebase_uid'];
    $full = false;
    if ($isStaff && !empty($_GET['uid'])) {
        $uid = trim((string)$_GET['uid']);
        $full = true;
    }
    $row = Database::fetchOne("SELECT * FROM host_bank_details WHERE firebase_uid = ? LIMIT 1", [$uid]);
    sendJsonResponse(['success' => true, 'bankDetails' => bankPayload($row, $full)]);
}

if ($method === 'POST') {
    $input = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($input)) $input = $_POST;

    // Staff review action
    if ($isStaff && !empty($input['uid']) && !empty($input['status'])) {
        $status = strtolower(trim((string)$input['status']));
        if (!in_array($status, ['pending', 'verified', 'rejected'], true)) {
            sendErrorResponse('Invalid status.', 400);
        }
        Database::execute(
            "UPDATE host_bank_details SET status = ?, rejection_reason = ?, verified_by = ?, verified_at = ? WHERE firebase_uid = ?",
            [
                $status,
                $status === 'rejected' ? trim((string)($input['rejectionReason'] ?? '')) : null,
                $user['email'] ?? $user['firebase_uid'],
                $status === 'verified' ? date('Y-m-d H:i:s') : null,
                trim((string)$input['uid']),
            ]
        );
        sendJsonResponse(['success' => true, 'message' => 'Bank details status updated.']);
    }

    if (!$isHost) {
        sendErrorResponse('Only host accounts can submit bank details.', 403);
    }

    $name = trim(preg_replace('/\s+/', ' ', (string)($input['accountHolderName'] ?? $input['fullName'] ?? '')));
    $acct = preg_replace('/\s+/', '', (string)($input['accountNumber'] ?? ''));
    $ifsc = strtoupper(preg_replace('/\s+/', '', (string)($input['ifscCode'] ?? $input['ifsc'] ?? '')));
    $branch = trim((string)($input['branchName'] ?? ''));
    $passbook = trim((string)($input['passbookMediaId'] ?? ''));

    $existing = Database::fetchOne("SELECT * FROM host_bank_details WHERE firebase_uid = ? LIMIT 1", [$user['firebase_uid']]);

    // Allow keeping the stored account number when the masked value is echoed back
    if ($existing && $acct !== '' && strpos($acct, '•') !== false) {
        $acct = (string)$existing['account_number'];
    }
    if ($existing && $acct === '') $acct = (string)$existing['account_number'];
    if ($passbook === '' && $existing) $passbook = (string)($existing['passbook_media_id'] ?? '');

    if (mb_strlen($name) < 3 || mb_strlen($name) > 120 || !preg_match('/^[\p{L}][\p{L}\s\.\'-]+$/u', $name)) {
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
        "INSERT INTO host_bank_details (firebase_uid, user_id, account_holder_name, account_number, ifsc_code, branch_name, passbook_media_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            account_holder_name = VALUES(account_holder_name),
            account_number = VALUES(account_number),
            ifsc_code = VALUES(ifsc_code),
            branch_name = VALUES(branch_name),
            passbook_media_id = VALUES(passbook_media_id),
            status = 'pending', rejection_reason = NULL, verified_by = NULL, verified_at = NULL",
        [$user['firebase_uid'], !empty($user['id']) ? (int)$user['id'] : null, $name, $acct, $ifsc, $branch, $passbook]
    );

    $row = Database::fetchOne("SELECT * FROM host_bank_details WHERE firebase_uid = ? LIMIT 1", [$user['firebase_uid']]);
    sendJsonResponse(['success' => true, 'message' => 'Bank details submitted for verification.', 'bankDetails' => bankPayload($row, false)], 201);
}

sendErrorResponse('Method not allowed.', 405);
