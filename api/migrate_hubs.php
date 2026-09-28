<?php
/**
 * One-time migration script for Multi-Hub Architecture
 * Run this from the browser or CLI to execute the migration.
 */
require_once __DIR__ . '/config/database.php';

header('Content-Type: text/plain');

echo "Starting Multi-Hub Migration...\n";

try {
    $pdo = Database::getConnection();

    // 1. Create hubs table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `hubs` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `name` VARCHAR(255) NOT NULL,
          `code` VARCHAR(50) NOT NULL UNIQUE,
          `city` VARCHAR(100) DEFAULT NULL,
          `state` VARCHAR(100) DEFAULT NULL,
          `country` VARCHAR(100) DEFAULT 'India',
          `address` TEXT DEFAULT NULL,
          `contact_phone` VARCHAR(50) DEFAULT NULL,
          `contact_email` VARCHAR(100) DEFAULT NULL,
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

    // 3. Migrate existing hubs from vehicles table
    $existingHubs = $pdo->query("SELECT DISTINCT `hub` FROM `vehicles` WHERE `hub` IS NOT NULL AND `hub` != ''")->fetchAll(PDO::FETCH_COLUMN);
    $defaultHubId = null;

    if (empty($existingHubs)) {
        // Insert a default legacy hub
        $stmt = $pdo->prepare("INSERT INTO `hubs` (`name`, `code`, `city`, `state`, `address`) VALUES ('Gavson Business Park, Ghansoli', 'GHAN-01', 'Navi Mumbai', 'Maharashtra', 'Gavson Business Park, Ghansoli')");
        $stmt->execute();
        $defaultHubId = $pdo->lastInsertId();
        echo "3. Inserted default legacy hub.\n";
    } else {
        foreach ($existingHubs as $index => $hubName) {
            $code = 'HUB-' . str_pad((string)($index + 1), 2, '0', STR_PAD_LEFT);
            $stmt = $pdo->prepare("INSERT IGNORE INTO `hubs` (`name`, `code`, `address`) VALUES (?, ?, ?)");
            $stmt->execute([$hubName, $code, $hubName]);
            if ($defaultHubId === null) {
                $defaultHubId = $pdo->lastInsertId() ?: $pdo->query("SELECT id FROM hubs WHERE name = " . $pdo->quote($hubName))->fetchColumn();
            }
        }
        echo "3. Migrated existing hubs from vehicles.\n";
    }

    // 4. Alter vehicles table
    try {
        $pdo->exec("ALTER TABLE `vehicles` ADD COLUMN `hub_id` INT DEFAULT NULL AFTER `hub`");
        echo "4a. Added 'hub_id' to 'vehicles'.\n";
    } catch (PDOException $e) {
        if (!str_contains($e->getMessage(), 'Duplicate column name')) throw $e;
    }

    $pdo->exec("UPDATE `vehicles` v JOIN `hubs` h ON v.hub = h.name SET v.hub_id = h.id WHERE v.hub_id IS NULL");
    
    // Set fallback hub for any orphans
    if ($defaultHubId) {
        $pdo->exec("UPDATE `vehicles` SET `hub_id` = $defaultHubId WHERE `hub_id` IS NULL");
    }
    echo "4b. Updated 'hub_id' in 'vehicles' based on legacy string.\n";

    // 5. Alter bookings table
    try {
        $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `pickup_hub_id` INT DEFAULT NULL AFTER `location`, ADD COLUMN `drop_hub_id` INT DEFAULT NULL AFTER `pickup_hub_id`");
        echo "5a. Added 'pickup_hub_id' and 'drop_hub_id' to 'bookings'.\n";
    } catch (PDOException $e) {
        if (!str_contains($e->getMessage(), 'Duplicate column name')) throw $e;
    }

    if ($defaultHubId) {
        $pdo->exec("UPDATE `bookings` SET `pickup_hub_id` = $defaultHubId, `drop_hub_id` = $defaultHubId WHERE `pickup_hub_id` IS NULL");
        echo "5b. Mapped existing bookings to legacy hub.\n";
    }

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
