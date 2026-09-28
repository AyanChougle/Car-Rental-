<?php
/**
 * api/hubs/index.php
 * GET /api/hubs - List all active hubs (public)
 * POST /api/hubs - Create a new hub (admin only)
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/auth.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $activeOnly = isset($_GET['active']) ? (bool)$_GET['active'] : false;

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
        sendErrorResponse("Name and Code are required to create a Hub.");
    }

    // Ensure code is unique
    $existing = Database::fetchOne("SELECT id FROM hubs WHERE code = ?", [$code]);
    if ($existing) {
        sendErrorResponse("A Hub with this code already exists.");
    }

    $sql = "INSERT INTO hubs (name, code, city, state, country, address, contact_phone, contact_email, operating_hours, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    $id = Database::insert($sql, [
        $name, $code, $city, $state, $country, $address, $contact_phone, $contact_email, $operating_hours, $status
    ]);

    sendJsonResponse(['success' => true, 'message' => 'Hub created successfully', 'hub_id' => $id]);
}

sendErrorResponse("Method not allowed", 405);
