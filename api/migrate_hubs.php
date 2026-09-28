<?php
/**
 * One-time migration script for Multi-Hub Architecture
 * Run this from the browser or CLI to execute the migration.
 */
require_once __DIR__ . '/config/database.php';

// Safety: run from CLI, or as a signed-in admin only.
if (PHP_SAPI !== 'cli') {
    require_once __DIR__ . '/middleware/auth.php';
    Auth::requireRole('admin', 'super_admin');
}

header('Content-Type: text/plain');

echo "Starting Multi-Hub Migration...\n";

try {
    $pdo = Database::getConnection();

    // 1. Create hubs table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `hubs` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `name` VARCHAR(150) NOT NULL,
          `code` VARCHAR(50) NOT NULL UNIQUE,
          `city` VARCHAR(100) NOT NULL,
          `state` VARCHAR(100) DEFAULT NULL,
          `country` VARCHAR(100) DEFAULT 'India',
          `address` TEXT DEFAULT NULL,
          `contact_phone` VARCHAR(30) DEFAULT NULL,
          `contact_email` VARCHAR(150) DEFAULT NULL,
          `pickup_instructions` TEXT DEFAULT NULL,
          `operating_hours` VARCHAR(255) DEFAULT '24/7',
          `latitude` DECIMAL(10, 8) DEFAULT NULL,
          `longitude` DECIMAL(11, 8) DEFAULT NULL,
          `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "1. Created 'hubs' table.\n";

    // 2. Create hub_fleet_pricing table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `hub_fleet_pricing` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `hub_id` INT NOT NULL,
          `fleet_id` INT NOT NULL,
          `daily_rate` DECIMAL(10,2) NOT NULL,
          `hourly_rate` DECIMAL(10,2) NOT NULL,
          `deposit` DECIMAL(10,2) NOT NULL,
          `extra_km_rate` DECIMAL(10,2) NOT NULL,
          FOREIGN KEY (`hub_id`) REFERENCES `hubs`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "2. Created 'hub_fleet_pricing' table.\n";

    // 3. Preserve the Hub table exactly as-is.
    // NEVER create a fake/default Hub during migration. Existing Hub records remain untouched.
    $existingHubCount = (int)$pdo->query("SELECT COUNT(*) FROM `hubs`")->fetchColumn();
    echo "3. Existing Hub records preserved: $existingHubCount. No demo/default Hub was inserted.\n";

    // 4. Alter vehicles table
    try {
        $pdo->exec("ALTER TABLE `vehicles` ADD COLUMN `hub_id` INT DEFAULT NULL AFTER `hub`");
        echo "4a. Added 'hub_id' to 'vehicles'.\n";
    } catch (PDOException $e) {
        if (!str_contains($e->getMessage(), 'Duplicate column name')) throw $e;
    }

    $pdo->exec("UPDATE `vehicles` v JOIN `hubs` h ON v.hub = h.name SET v.hub_id = h.id WHERE v.hub_id IS NULL AND v.hub IS NOT NULL AND v.hub != ''");
    
    // No guessing: vehicles whose legacy hub name did not match stay unassigned for admin review.
    $unmappedVehicles = (int)$pdo->query("SELECT COUNT(*) FROM `vehicles` WHERE `hub_id` IS NULL")->fetchColumn();
    echo "4b. Mapped vehicles by exact legacy hub name. Unassigned / legacy vehicles: $unmappedVehicles\n";

    // 5. Alter bookings table
    try {
        $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `pickup_hub_id` INT DEFAULT NULL AFTER `location`, ADD COLUMN `drop_hub_id` INT DEFAULT NULL AFTER `pickup_hub_id`");
        echo "5a. Added 'pickup_hub_id' and 'drop_hub_id' to 'bookings'.\n";
    } catch (PDOException $e) {
        if (!str_contains($e->getMessage(), 'Duplicate column name')) throw $e;
    }

    // Map bookings only through their vehicle's confirmed hub; everything else stays unassigned.
    $pdo->exec("UPDATE `bookings` b JOIN `vehicles` v ON v.reg_no = b.vehicle_reg SET b.pickup_hub_id = v.hub_id, b.drop_hub_id = v.hub_id WHERE b.pickup_hub_id IS NULL AND v.hub_id IS NOT NULL");
    $unmappedBookings = (int)$pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `pickup_hub_id` IS NULL")->fetchColumn();
    echo "5b. Bookings mapped via their vehicle's hub. Unassigned / legacy bookings: $unmappedBookings\n";

    // 6. Alter admin_users table
    try {
        $pdo->exec("ALTER TABLE `admin_users` ADD COLUMN `hub_id` INT DEFAULT NULL AFTER `role`");
        echo "6. Added 'hub_id' to 'admin_users'.\n";
    } catch (PDOException $e) {
        if (!str_contains($e->getMessage(), 'Duplicate column name')) throw $e;
    }

    echo "\nMigration completed successfully!\n";

} catch (PDOException $e) {
    echo "\nMigration failed:\n" . $e->getMessage() . "\n";
    http_response_code(500);
}
