<?php
/**
 * api/hubs/detail.php
 * GET /api/hubs/:id - Get hub details
 * PUT /api/hubs/:id - Update hub details (admin only)
 * DELETE /api/hubs/:id - Deactivate a hub (admin only)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if (!$id) {
    sendErrorResponse("Hub ID is required", 400);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $hub = Database::fetchOne("SELECT * FROM hubs WHERE id = ?", [$id]);
    if (!$hub) {
        sendErrorResponse("Hub not found", 404);
    }
    sendJsonResponse(['success' => true, 'hub' => $hub]);
}

if ($method === 'PUT') {
    $user = requireAdminRole(['super_admin', 'admin']);

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
    $status = trim($input['status'] ?? 'active');

    if (!$name || !$code) {
        sendErrorResponse("Name and Code are required.");
    }

    $existing = Database::fetchOne("SELECT id FROM hubs WHERE code = ? AND id != ?", [$code, $id]);
    if ($existing) {
        sendErrorResponse("Another Hub with this code already exists.");
    }

    $sql = "UPDATE hubs SET name=?, code=?, city=?, state=?, country=?, address=?, contact_phone=?, contact_email=?, operating_hours=?, status=? WHERE id=?";
    Database::execute($sql, [
        $name, $code, $city, $state, $country, $address, $contact_phone, $contact_email, $operating_hours, $status, $id
    ]);

    sendJsonResponse(['success' => true, 'message' => 'Hub updated successfully']);
}

if ($method === 'DELETE') {
    $user = requireAdminRole(['super_admin', 'admin']);
    
    // We soft-delete by setting status = 'inactive'
    Database::execute("UPDATE hubs SET status = 'inactive' WHERE id = ?", [$id]);
    
    sendJsonResponse(['success' => true, 'message' => 'Hub deactivated successfully']);
}

sendErrorResponse("Method not allowed", 405);
