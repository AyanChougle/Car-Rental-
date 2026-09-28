<?php
/**
 * api/hubs/detail.php
 * GET /api/hubs/:id - Get hub details
 * PUT /api/hubs/:id - Update hub details (admin only)
 * PATCH /api/hubs/:id/status - Activate / deactivate (admin only)
 * DELETE /api/hubs/:id - Soft-deactivate a hub (never physically deletes)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) {
    sendErrorResponse("Hub ID is required", 400);
}

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
    $hub = Database::fetchOne("SELECT * FROM hubs WHERE id = ?", [$id]);
    if (!$hub) {
        sendErrorResponse("Hub not found", 404);
    }
    sendJsonResponse(['success' => true, 'hub' => $hub]);
}

if ($method === 'PATCH') {
    // PATCH /api/hubs/:id/status  {"status": "active" | "inactive"}
    $user = Auth::requireRole('admin', 'super_admin');
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $status = trim((string)($input['status'] ?? ''));
    if (!in_array($status, ['active', 'inactive'], true)) {
        sendErrorResponse("Status must be 'active' or 'inactive'.");
    }
    $before = Database::fetchOne("SELECT id, status FROM hubs WHERE id = ?", [$id]);
    if (!$before) sendErrorResponse("Hub not found", 404);
    Database::execute("UPDATE hubs SET status = ? WHERE id = ?", [$status, $id]);
    hubAudit($user, $status === 'active' ? 'hub.activated' : 'hub.deactivated', $id, ['status' => $before['status']], ['status' => $status]);
    sendJsonResponse(['success' => true, 'message' => "Hub is now $status"]);
}

if ($method === 'PUT') {
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
        sendErrorResponse("Name and Code are required.");
    }

    $beforeHub = Database::fetchOne("SELECT * FROM hubs WHERE id = ?", [$id]);
    if (!$beforeHub) sendErrorResponse("Hub not found", 404);
    $existing = Database::fetchOne("SELECT id FROM hubs WHERE code = ? AND id != ?", [$code, $id]);
    if ($existing) {
        sendErrorResponse("Another Hub with this code already exists.");
    }

    $sql = "UPDATE hubs SET name=?, code=?, city=?, state=?, country=?, address=?, contact_phone=?, contact_email=?, operating_hours=?, pickup_instructions=?, latitude=?, longitude=?, status=? WHERE id=?";
    Database::execute($sql, [
        $name, $code, $city, $state, $country, $address, $contact_phone, $contact_email, $operating_hours, $pickup_instructions, $latitude, $longitude, $status, $id
    ]);

    hubAudit($user, 'hub.updated', $id, $beforeHub, ['name' => $name, 'code' => $code, 'city' => $city, 'state' => $state, 'status' => $status]);
    $hub = Database::fetchOne('SELECT * FROM hubs WHERE id = ?', [$id]);
    sendJsonResponse(['success' => true, 'message' => 'Hub updated successfully', 'hub' => $hub]);
}

if ($method === 'DELETE') {
    $user = Auth::requireRole('admin', 'super_admin');
    
    // We soft-delete by setting status = 'inactive'
    Database::execute("UPDATE hubs SET status = 'inactive' WHERE id = ?", [$id]);
    hubAudit($user, 'hub.deactivated', $id, null, ['status' => 'inactive']);
    
    sendJsonResponse(['success' => true, 'message' => 'Hub deactivated successfully']);
}

sendErrorResponse("Method not allowed", 405);
