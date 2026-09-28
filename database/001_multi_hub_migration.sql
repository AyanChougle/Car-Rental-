-- Migration: Multi-Hub Architecture
-- Creates hubs, updates vehicles and bookings to use hub_id.

-- 1. Create hubs table
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
);

-- 2. Create hub_fleet_pricing table
CREATE TABLE IF NOT EXISTS `hub_fleet_pricing` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `hub_id` INT NOT NULL,
  `fleet_id` INT NOT NULL,
  `daily_rate` DECIMAL(10,2) NOT NULL,
  `hourly_rate` DECIMAL(10,2) NOT NULL,
  `deposit` DECIMAL(10,2) NOT NULL,
  `extra_km_rate` DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (`hub_id`) REFERENCES `hubs`(`id`) ON DELETE CASCADE
  -- fleet_id could reference vehicles(id) or a specific fleet catalog table
);

-- 3. Add hub_id to vehicles, default to NULL initially
ALTER TABLE `vehicles` 
ADD COLUMN `hub_id` INT DEFAULT NULL AFTER `hub`;

-- 4. Add hub_id to admin_users
ALTER TABLE `admin_users` 
ADD COLUMN `hub_id` INT DEFAULT NULL AFTER `role`;

-- 5. Add pickup_hub_id and drop_hub_id to bookings
ALTER TABLE `bookings`
ADD COLUMN `pickup_hub_id` INT DEFAULT NULL AFTER `vehicle_reg`,
ADD COLUMN `drop_hub_id` INT DEFAULT NULL AFTER `pickup_hub_id`;

-- Note: The migration of existing data should happen here. 
-- Example: 
-- INSERT INTO hubs (name, code, address, city, state, country) VALUES ('Gavson Business Park, Ghansoli', 'GHAN-01', 'Gavson Business Park, Ghansoli', 'Navi Mumbai', 'Maharashtra', 'India');
-- UPDATE vehicles SET hub_id = 1 WHERE hub = 'Gavson Business Park, Ghansoli';
-- UPDATE bookings SET pickup_hub_id = 1, drop_hub_id = 1;
-- ALTER TABLE vehicles DROP COLUMN hub;
