<?php
/**
 * api/migrate_partner_fleets.php
 * Standalone migration script to sync partner fleets, host emails, and partner leads into MySQL.
 * Can be run from browser or CLI.
 */

declare(strict_types=1);

require_once __DIR__ . '/config/database.php';

header('Content-Type: application/json; charset=utf-8');

try {
    // 1. Ensure vehicles table has owner_email and owner_phone columns
    try {
        $cols = Database::fetchAll("SHOW COLUMNS FROM `vehicles`");
        $colNames = array_map(fn($c) => strtolower((string)$c['Field']), $cols);
        if (!in_array('owner_email', $colNames, true)) {
            Database::execute("ALTER TABLE `vehicles` ADD COLUMN `owner_email` VARCHAR(191) DEFAULT NULL AFTER `owner_name`");
        }
        if (!in_array('owner_phone', $colNames, true)) {
            Database::execute("ALTER TABLE `vehicles` ADD COLUMN `owner_phone` VARCHAR(32) DEFAULT NULL AFTER `owner_email`");
        }
    } catch (Throwable $e) {
        error_log("[Migration] vehicles column check: " . $e->getMessage());
    }

    // 2. Ensure partner_cars table exists
    Database::execute("
        CREATE TABLE IF NOT EXISTS `partner_cars` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `car_id` VARCHAR(64) NOT NULL UNIQUE,
          `user_id` INT DEFAULT NULL,
          `firebase_uid` VARCHAR(128) NOT NULL,
          `user_name` VARCHAR(255) DEFAULT NULL,
          `user_phone` VARCHAR(32) DEFAULT NULL,
          `user_email` VARCHAR(255) DEFAULT NULL,
          `brand` VARCHAR(128) NOT NULL,
          `model` VARCHAR(128) NOT NULL,
          `year` INT NOT NULL DEFAULT 2026,
          `reg_no` VARCHAR(64) NOT NULL,
          `transmission` VARCHAR(32) DEFAULT 'Manual',
          `fuel` VARCHAR(32) DEFAULT 'Petrol',
          `city` VARCHAR(128) DEFAULT 'Navi Mumbai',
          `expected_price` DECIMAL(10,2) DEFAULT NULL,
          `status` ENUM('pending_approval', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
          `rejection_reason` TEXT DEFAULT NULL,
          `photos` JSON DEFAULT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX `idx_partner_cars_uid` (`firebase_uid`),
          INDEX `idx_partner_cars_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // 3. Ensure partner_leads table exists
    Database::execute("
        CREATE TABLE IF NOT EXISTS `partner_leads` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `legacy_post_id` VARCHAR(64) DEFAULT NULL,
          `name` VARCHAR(191) DEFAULT NULL,
          `phone` VARCHAR(32) DEFAULT NULL,
          `email` VARCHAR(191) DEFAULT NULL,
          `status` VARCHAR(64) DEFAULT 'new',
          `priority` VARCHAR(32) DEFAULT 'medium',
          `source` VARCHAR(64) DEFAULT 'website',
          `city` VARCHAR(128) DEFAULT 'Navi Mumbai',
          `car_owned` VARCHAR(191) DEFAULT NULL,
          `purchase_year` INT DEFAULT 2024,
          `km` INT DEFAULT 0,
          `invest` VARCHAR(64) DEFAULT NULL,
          `invest_when` VARCHAR(64) DEFAULT NULL,
          `remark` TEXT DEFAULT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX `idx_partner_leads_phone` (`phone`),
          INDEX `idx_partner_leads_email` (`email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // 4. Update owner_email and owner_phone directly in vehicles table
    $vehiclesUpdated = Database::execute("
        UPDATE `vehicles`
        SET 
          `owner_email` = CASE 
            WHEN LOWER(TRIM(`owner_name`)) = 'aditi lotankar' THEN 'aditilotankar03@gmail.com'
            WHEN LOWER(TRIM(`owner_name`)) = 'ajay vishwakarma' THEN 'ajay.karma2026@gmail.com'
            WHEN LOWER(TRIM(`owner_name`)) = 'kundan singh' THEN 'kundand7376@gmail.com'
            WHEN LOWER(TRIM(`owner_name`)) = 'amol gole' THEN 'amol3656@gmail.com'
            WHEN LOWER(TRIM(`owner_name`)) IN ('tai phad', 'tai tushar phad') THEN 'tusharphad1995@gmail.com'
            WHEN LOWER(TRIM(`owner_name`)) = 'saif feroz shaikh' THEN 'ferozshaikh93240@gmail.com'
            WHEN LOWER(TRIM(`owner_name`)) = 'omkar tapshale' THEN 'otapshale@gmail.com'
            WHEN LOWER(TRIM(`owner_name`)) = 'anil vishwakarma' THEN 'anil.vishwakarma@partner.kruizly.com'
            WHEN LOWER(TRIM(`owner_name`)) = 'anil kumar gupta' THEN 'anil.gupta@partner.kruizly.com'
            WHEN LOWER(TRIM(`owner_name`)) IN ('viran gupta', 'viren gupta') THEN 'viran.gupta@partner.kruizly.com'
            WHEN LOWER(TRIM(`owner_name`)) = 'kruizly fleet host' THEN 'host@kruizly.com'
            ELSE COALESCE(`owner_email`, '')
          END,
          `owner_phone` = CASE 
            WHEN LOWER(TRIM(`owner_name`)) = 'aditi lotankar' THEN '9867539466'
            WHEN LOWER(TRIM(`owner_name`)) = 'ajay vishwakarma' THEN '9351445570'
            WHEN LOWER(TRIM(`owner_name`)) = 'kundan singh' THEN '9028076662'
            WHEN LOWER(TRIM(`owner_name`)) = 'amol gole' THEN '7977759416'
            WHEN LOWER(TRIM(`owner_name`)) IN ('tai phad', 'tai tushar phad') THEN '9136431378'
            WHEN LOWER(TRIM(`owner_name`)) = 'saif feroz shaikh' THEN '9324021200'
            WHEN LOWER(TRIM(`owner_name`)) = 'omkar tapshale' THEN '8898948642'
            WHEN LOWER(TRIM(`owner_name`)) = 'anil vishwakarma' THEN '9819863286'
            WHEN LOWER(TRIM(`owner_name`)) = 'anil kumar gupta' THEN '9820019727'
            WHEN LOWER(TRIM(`owner_name`)) IN ('viran gupta', 'viren gupta') THEN '9820585577'
            WHEN LOWER(TRIM(`owner_name`)) = 'kruizly fleet host' THEN '+91 93240 21200'
            ELSE COALESCE(`owner_phone`, '')
          END
        WHERE `owner_name` IS NOT NULL AND `owner_name` != ''
    ");

    // 5. Seed partner host user accounts into users table
    $usersSeeded = Database::execute("
        INSERT INTO `users` (`firebase_uid`, `name`, `email`, `phone`, `role`, `created_at`, `updated_at`)
        VALUES
          ('host_aditi_lotankar', 'Aditi Lotankar', 'aditilotankar03@gmail.com', '9867539466', 'host', NOW(), NOW()),
          ('host_ajay_vishwakarma', 'Ajay Vishwakarma', 'ajay.karma2026@gmail.com', '9351445570', 'host', NOW(), NOW()),
          ('host_kundan_singh', 'Kundan Singh', 'kundand7376@gmail.com', '9028076662', 'host', NOW(), NOW()),
          ('host_amol_gole', 'Amol Gole', 'amol3656@gmail.com', '7977759416', 'host', NOW(), NOW()),
          ('host_tai_phad', 'Tai Phad', 'tusharphad1995@gmail.com', '9136431378', 'host', NOW(), NOW()),
          ('host_saif_feroz_shaikh', 'Saif Feroz Shaikh', 'ferozshaikh93240@gmail.com', '9324021200', 'host', NOW(), NOW()),
          ('host_omkar_tapshale', 'Omkar Tapshale', 'otapshale@gmail.com', '8898948642', 'host', NOW(), NOW()),
          ('host_anil_vishwakarma', 'Anil Vishwakarma', 'anil.vishwakarma@partner.kruizly.com', '9819863286', 'host', NOW(), NOW()),
          ('host_anil_gupta', 'Anil Kumar Gupta', 'anil.gupta@partner.kruizly.com', '9820019727', 'host', NOW(), NOW()),
          ('host_viran_gupta', 'Viran Gupta', 'viran.gupta@partner.kruizly.com', '9820585577', 'host', NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          `name` = VALUES(`name`),
          `phone` = COALESCE(NULLIF(VALUES(`phone`), ''), `phone`),
          `role` = CASE WHEN `role` IN ('admin', 'super_admin', 'manager', 'executive') THEN `role` ELSE 'host' END,
          `updated_at` = NOW()
    ");

    // 6. Seed partner leads into partner_leads table
    $leadsSeeded = Database::execute("
        INSERT INTO `partner_leads` (`name`, `phone`, `email`, `status`, `priority`, `source`, `city`, `car_owned`, `purchase_year`, `remark`, `created_at`)
        VALUES
          ('Aditi Lotankar', '9867539466', 'aditilotankar03@gmail.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Maruti Suzuki Fronx', 2026, 'Active host fleet partner', NOW()),
          ('Ajay Vishwakarma', '9351445570', 'ajay.karma2026@gmail.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Toyota Glanza', 2026, 'Active host fleet partner', NOW()),
          ('Kundan Singh', '9028076662', 'kundand7376@gmail.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Toyota Glanza', 2026, 'Active host fleet partner', NOW()),
          ('Amol Gole', '7977759416', 'amol3656@gmail.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Maruti Suzuki Fronx', 2026, 'Active host fleet partner', NOW()),
          ('Tai Phad', '9136431378', 'tusharphad1995@gmail.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Tata Punch', 2026, 'Active host fleet partner', NOW()),
          ('Saif Feroz Shaikh', '9324021200', 'ferozshaikh93240@gmail.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Mahindra Thar', 2025, 'Active host fleet partner', NOW()),
          ('Omkar Tapshale', '8898948642', 'otapshale@gmail.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Hyundai Creta', 2024, 'Active host fleet partner', NOW()),
          ('Anil Vishwakarma', '9819863286', 'anil.vishwakarma@partner.kruizly.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Maruti Suzuki Ertiga', 2024, 'Active host fleet partner', NOW()),
          ('Anil Kumar Gupta', '9820019727', 'anil.gupta@partner.kruizly.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Maruti Suzuki Swift', 2024, 'Active host fleet partner', NOW()),
          ('Viran Gupta', '9820585577', 'viran.gupta@partner.kruizly.com', 'active_partner', 'high', 'fleet_partner', 'Navi Mumbai', 'Maruti Suzuki Ertiga', 2024, 'Active host fleet partner', NOW())
        ON DUPLICATE KEY UPDATE
          `phone` = VALUES(`phone`),
          `email` = VALUES(`email`),
          `status` = VALUES(`status`),
          `car_owned` = VALUES(`car_owned`)
    ");

    // 7. Populate partner_cars from vehicles table
    $partnerCarsInserted = Database::execute("
        INSERT INTO `partner_cars` (
          `car_id`, `user_id`, `firebase_uid`, `user_name`, `user_phone`, `user_email`,
          `brand`, `model`, `year`, `reg_no`, `transmission`, `fuel`, `city`, `expected_price`,
          `status`, `photos`
        )
        SELECT 
          COALESCE(NULLIF(v.car_id, ''), CONCAT('CRP-', LPAD(v.id, 3, '0'))) AS `car_id`,
          u.id AS `user_id`,
          COALESCE(u.firebase_uid, CONCAT('host_', REPLACE(LOWER(v.owner_name), ' ', '_'))) AS `firebase_uid`,
          COALESCE(NULLIF(v.owner_name, ''), 'Kruizly Fleet Host') AS `user_name`,
          COALESCE(NULLIF(v.owner_phone, ''), u.phone, '') AS `user_phone`,
          COALESCE(NULLIF(v.owner_email, ''), u.email, '') AS `user_email`,
          v.brand,
          v.model,
          v.year,
          v.reg_no,
          v.transmission,
          v.fuel,
          COALESCE(NULLIF(v.location, ''), 'Navi Mumbai') AS `city`,
          v.price_day AS `expected_price`,
          'approved' AS `status`,
          v.gallery AS `photos`
        FROM `vehicles` v
        LEFT JOIN `users` u ON (
          (v.owner_email IS NOT NULL AND v.owner_email != '' AND LOWER(TRIM(u.email)) = LOWER(TRIM(v.owner_email)))
          OR LOWER(TRIM(u.name)) = LOWER(TRIM(v.owner_name))
        )
        WHERE LOWER(TRIM(v.acquisition_type)) IN ('partner', 'host', 'hosted')
           OR (v.owner_name IS NOT NULL AND v.owner_name != '' AND v.owner_name NOT IN ('Fleet Catalog', 'KRUIZLY'))
        ON DUPLICATE KEY UPDATE 
          `user_name` = VALUES(`user_name`),
          `user_phone` = COALESCE(NULLIF(VALUES(`user_phone`), ''), `user_phone`),
          `user_email` = COALESCE(NULLIF(VALUES(`user_email`), ''), `user_email`),
          `status` = 'approved',
          `brand` = VALUES(`brand`),
          `model` = VALUES(`model`),
          `photos` = VALUES(`photos`)
    ");

    echo json_encode([
        'success' => true,
        'message' => 'Partner fleets, emails, leads, and users synchronized successfully.',
        'details' => [
            'vehicles_updated' => $vehiclesUpdated,
            'users_seeded' => $usersSeeded,
            'leads_seeded' => $leadsSeeded,
            'partner_cars_synced' => $partnerCarsInserted
        ]
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'line' => $e->getLine()
    ], JSON_PRETTY_PRINT);
}
