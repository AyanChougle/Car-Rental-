<?php
/**
 * api/hubs/index.php
 * GET /api/hubs - List all active hubs (public)
 * POST /api/hubs - Create a new hub (admin only)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

function hubAudit(array $user, string $action, int $hubId, $before = null, $after = null): void {
    try {
        Database::execute(
            "INSERT INTO audit_logs (firebase_uid, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, 'hub', ?, ?, ?)",
            [
                (string)($user['firebase_uid'] ?? ''), $action, (string)$hubId,
                json_encode(['before' => $before, 'after' => $after]),
                $_SERVER['REMOTE_ADDR'] ?? null
            ]
        );
    } catch (Throwable $e) { /* auditing must never break the request */ }
}

if ($method === 'GET') {
    $activeOnly = isset($_GET['active']) && in_array(strtolower((string)$_GET['active']), ['1','true','yes'], true);

    $sql = "SELECT * FROM hubs";
    if ($activeOnly) {
        $sql .= " WHERE status = 'active'";
    }
    $sql .= " ORDER BY name ASC";

    $hubs = Database::fetchAll($sql);
    sendJsonResponse(['success' => true, 'hubs' => $hubs]);
}

if ($method === 'POST') {
    // Only super_admin or admin can create a hub
    $user = Auth::requireRole('admin', 'super_admin');

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        sendErrorResponse("Invalid JSON payload");
    }

    $name = trim($input['name'] ?? '');
    $code = trim($input['code'] ?? '');
    $city = trim($input['city'] ?? '');
    $state = trim($input['state'] ?? '');
    $country = trim($input['country'] ?? 'India');
    $address = trim($input['address'] ?? '');
    $contact_phone = trim($input['contact_phone'] ?? '');
    $contact_email = trim($input['contact_email'] ?? '');
    $operating_hours = trim($input['operating_hours'] ?? '24/7');
    $pickup_instructions = trim($input['pickup_instructions'] ?? '');
    $latitude = $input['latitude'] ?? null;
    $longitude = $input['longitude'] ?? null;
    $status = trim($input['status'] ?? 'active');

    if (!$name || !$code) {
        sendErrorResponse("Name and Code are required to create a Hub.");
    }

    // Ensure code is unique
    $existing = Database::fetchOne("SELECT id FROM hubs WHERE code = ?", [$code]);
    if ($existing) {
        sendErrorResponse("A Hub with this code already exists.");
    }

    $sql = "INSERT INTO hubs (name, code, city, state, country, address, contact_phone, contact_email, operating_hours, pickup_instructions, latitude, longitude, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    $id = Database::insert($sql, [
        $name, $code, $city, $state, $country, $address, $contact_phone, $contact_email, $operating_hours, $pickup_instructions, $latitude, $longitude, $status
    ]);

    hubAudit($user, 'hub.created', (int)$id, null, ['name' => $name, 'code' => $code, 'status' => $status]);
    $hub = Database::fetchOne('SELECT * FROM hubs WHERE id = ?', [$id]);
    sendJsonResponse(['success' => true, 'message' => 'Hub created successfully', 'hub_id' => $id, 'hub' => $hub]);
}

sendErrorResponse("Method not allowed", 405);
