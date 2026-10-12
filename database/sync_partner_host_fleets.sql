-- SQL Migration: Sync Existing Partner Fleets from vehicles to partner_cars
-- This ensures all partner car hosts (e.g. Amol Gole, Aditi Lotankar, Kundan Singh, Ajay Vishwakarma, etc.)
-- have active listing records in partner_cars and can immediately see them in their profile dashboard.

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Ensure partner_cars table exists
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Populate partner_cars from vehicles table for all Partner acquisition types
INSERT INTO `partner_cars` (
  `car_id`, `user_id`, `firebase_uid`, `user_name`, `user_phone`, `user_email`,
  `brand`, `model`, `year`, `reg_no`, `transmission`, `fuel`, `city`, `expected_price`,
  `status`, `photos`
)
SELECT 
  COALESCE(NULLIF(v.car_id, ''), CONCAT('CRP-', LPAD(v.id, 3, '0'))) AS `car_id`,
  u.id AS `user_id`,
  COALESCE(u.firebase_uid, CONCAT('host_', REPLACE(LOWER(v.owner_name), ' ', '_'))) AS `firebase_uid`,
  v.owner_name AS `user_name`,
  COALESCE(u.phone, '') AS `user_phone`,
  COALESCE(u.email, '') AS `user_email`,
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
  LOWER(TRIM(u.name)) = LOWER(TRIM(v.owner_name))
  OR (v.owner_name LIKE '% %' AND u.name LIKE CONCAT('%', SUBSTRING_INDEX(v.owner_name, ' ', 1), '%'))
)
WHERE LOWER(TRIM(v.acquisition_type)) IN ('partner', 'host', 'hosted')
  OR (v.owner_name IS NOT NULL AND v.owner_name != '' AND v.owner_name NOT IN ('Kruizly Fleet Host', 'Fleet Catalog', 'KRUIZLY'))
ON DUPLICATE KEY UPDATE 
  `user_name` = VALUES(`user_name`),
  `status` = 'approved',
  `brand` = VALUES(`brand`),
  `model` = VALUES(`model`),
  `photos` = VALUES(`photos`);

-- 3. Link any partner_cars whose user registered with phone or email
UPDATE `partner_cars` pc
JOIN `users` u ON (
  (pc.user_email IS NOT NULL AND pc.user_email != '' AND LOWER(TRIM(u.email)) = LOWER(TRIM(pc.user_email)))
  OR (pc.user_phone IS NOT NULL AND pc.user_phone != '' AND RIGHT(REPLACE(REPLACE(u.phone, ' ', ''), '-', ''), 10) = RIGHT(REPLACE(REPLACE(pc.user_phone, ' ', ''), '-', ''), 10))
  OR (LOWER(TRIM(u.name)) = LOWER(TRIM(pc.user_name)))
)
SET pc.firebase_uid = u.firebase_uid,
    pc.user_id = u.id,
    pc.user_email = COALESCE(NULLIF(pc.user_email, ''), u.email),
    pc.user_phone = COALESCE(NULLIF(pc.user_phone, ''), u.phone);

-- 4. Ensure partner users have host privileges if they own vehicles
UPDATE `users` u
JOIN `partner_cars` pc ON pc.firebase_uid = u.firebase_uid OR pc.user_id = u.id
SET u.role = CASE WHEN u.role IN ('admin', 'super_admin', 'manager', 'executive') THEN u.role ELSE 'host' END;

SET FOREIGN_KEY_CHECKS = 1;
