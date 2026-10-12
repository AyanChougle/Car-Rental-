-- Migration: Multi-Hub Architecture
-- Creates hubs, updates vehicles and bookings to use hub_id.

SET FOREIGN_KEY_CHECKS = 0;

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
  `pickup_instructions` TEXT DEFAULT NULL,
  `latitude` DECIMAL(10, 8) DEFAULT NULL,
  `longitude` DECIMAL(11, 8) DEFAULT NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create hub_fleet_pricing table
CREATE TABLE IF NOT EXISTS `hub_fleet_pricing` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `hub_id` INT NOT NULL,
  `fleet_id` INT NOT NULL,
  `daily_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `hourly_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `deposit` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `extra_km_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  INDEX `idx_hub_fleet_pricing_hub` (`hub_id`),
  INDEX `idx_hub_fleet_pricing_fleet` (`fleet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- 6. Seed Operating Hubs: Gavson (Navi Mumbai) and Kandivali (Mumbai)
INSERT INTO `hubs` (`id`, `name`, `code`, `city`, `state`, `country`, `address`, `contact_phone`, `contact_email`, `operating_hours`, `pickup_instructions`, `status`) VALUES
(1, 'Gavson Business Park, Ghansoli', 'GAV-01', 'Navi Mumbai', 'Maharashtra', 'India', 'Gavson Business Park, Ghansoli, Navi Mumbai, Maharashtra 400701', '+91 91671 64547', 'support@kruizly.com', '24/7', 'Report to Gate 1 / Parking Bay A. Executive will hand over keys and inspect vehicle.', 'active'),
(2, 'Kandivali Hub, Mumbai', 'KAND-01', 'Mumbai', 'Maharashtra', 'India', 'Kandivali West, Link Road, Mumbai, Maharashtra 400067', '+91 91671 64547', 'support@kruizly.com', '24/7', 'Report to Kruizly Kandivali Hub Counter. Vehicle inspection and key handoff available 24/7.', 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `city` = VALUES(`city`), `address` = VALUES(`address`);

-- 7. Map existing vehicles and bookings
UPDATE `vehicles` SET `hub_id` = 1 WHERE `hub_id` IS NULL AND (`hub` LIKE '%Gavson%' OR `location` LIKE '%Gavson%' OR `hub` LIKE '%Ghansoli%' OR `location` LIKE '%Ghansoli%' OR `hub` IS NULL OR `hub` = '');
UPDATE `bookings` SET `pickup_hub_id` = 1, `drop_hub_id` = 1 WHERE `pickup_hub_id` IS NULL;

-- 8. Add Toyota Taisor to Hub 1 (Gavson)
INSERT INTO `vehicles` (
  `id`, `car_id`, `reg_no`, `brand`, `model`, `year`, `category`, 
  `transmission`, `fuel`, `seats`, `bags`, `price_day`, `price_hour`, 
  `security_deposit`, `free_km`, `extra_km`,
  `hub`, `hub_id`, `location`, `acquisition_type`, `owner_name`, `acquisition_date`, 
  `available`, `status`, `is_active_fleet`, `is_custom_fleet`, `gallery`
) VALUES
(46, 'CAT-039', 'MH04KR0139', 'Toyota', 'Urban Cruiser Taisor', 2025, 'compact-suv', 'Automatic', 'Petrol', 5, 2, 3500.00, 146.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 1, 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Toyota Taisor.png"]')
ON DUPLICATE KEY UPDATE `hub_id` = 1;

-- 9. Seed Kandivali Hub 2 Segment Fleet (15 Units)
INSERT INTO `vehicles` (
  `id`, `car_id`, `reg_no`, `brand`, `model`, `year`, `category`, 
  `transmission`, `fuel`, `seats`, `bags`, `price_day`, `price_hour`, 
  `security_deposit`, `free_km`, `extra_km`,
  `hub`, `hub_id`, `location`, `acquisition_type`, `owner_name`, `acquisition_date`, 
  `available`, `status`, `is_active_fleet`, `is_custom_fleet`, `gallery`
) VALUES
-- 🔹 COMPACT & 5-SEATER SEGMENT
(101, 'KND-001', 'MH02EX1001', 'Hyundai', 'Exter', 2025, 'compact-suv', 'Manual', 'Petrol + CNG', 5, 2, 2800.00, 117.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Hyundai Exter.png"]'),
(102, 'KND-002', 'MH02SW1002', 'Maruti Suzuki', 'Swift VXI (O)', 2025, 'economy', 'Automatic', 'Petrol', 5, 2, 2600.00, 108.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Maruti Suzuki Swift.png"]'),
(103, 'KND-003', 'MH02TG1003', 'Tata', 'Tigor', 2025, 'economy', 'Automatic', 'Petrol + CNG', 5, 2, 2600.00, 108.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Tigor.jpg"]'),
(104, 'KND-004', 'MH02DZ1004', 'Maruti Suzuki', 'Dzire ZXI+ Sunroof', 2025, 'economy', 'Automatic', 'Petrol', 5, 2, 2800.00, 117.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Maruti Suzuki Dzire.png"]'),
(105, 'KND-005', 'MH02AL1005', 'Tata', 'Altroz', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Tata Altroz.png"]'),
(106, 'KND-006', 'MH02SL1006', 'Kia', 'Seltos Sunroof', 2025, 'suv', 'Manual', 'Petrol', 5, 2, 4500.00, 188.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Seltos.png"]'),

-- 🔹 7 & 8-SEATER MPV SEGMENT
(107, 'KND-007', 'MH02ER1007', 'Maruti Suzuki', 'Ertiga (2023 Unit)', 2023, 'mpv', 'Manual', 'Petrol + CNG', 7, 2, 3500.00, 146.00, 3500.00, 250, 14.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Maruti Suzuki Ertiga.png"]'),
(108, 'KND-008', 'MH02ER1008', 'Maruti Suzuki', 'Ertiga (2025 Unit)', 2025, 'mpv', 'Manual', 'Petrol + CNG', 7, 2, 3800.00, 158.00, 3500.00, 250, 14.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Maruti Suzuki Ertiga.png"]'),
(109, 'KND-009', 'MH02EH1009', 'Maruti Suzuki', 'Ertiga Hybrid', 2025, 'mpv', 'Automatic', 'Petrol', 7, 2, 4000.00, 167.00, 3500.00, 250, 14.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Maruti Suzuki Ertiga.png"]'),
(110, 'KND-010', 'MH02CR1010', 'Kia', 'Carens', 2025, 'mpv', 'Manual', 'Diesel', 7, 2, 4500.00, 188.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Kia Carens.png"]'),
(111, 'KND-011', 'MH02CR1011', 'Kia', 'Carens', 2025, 'mpv', 'Automatic', 'Petrol', 7, 2, 4800.00, 200.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Kia Carens.png"]'),
(112, 'KND-012', 'MH02XO1012', 'Mahindra', '7XO', 2026, 'suv', 'AMT', 'Diesel', 7, 2, 9000.00, 375.00, 7000.00, 250, 28.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Mahindra 7XO.png"]'),

-- 🔹 PREMIUM & LUXURY SEGMENT
(113, 'KND-013', 'MH02CP1013', 'Jeep', 'Compass 4x4 Sunroof', 2024, 'suv', 'Automatic', 'Diesel', 5, 2, 6000.00, 250.00, 5000.00, 250, 18.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Jeep Compass.png"]'),
(114, 'KND-014', 'MH02TR1014', 'Mahindra', 'Thar Roxx Sunroof', 2025, 'suv', 'Automatic', 'Diesel', 5, 2, 7000.00, 292.00, 5000.00, 250, 20.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/thar roxx.png"]'),
(115, 'KND-015', 'MH02BM1015', 'BMW', 'M5 Modified Sunroof', 2022, 'luxury', 'Automatic', 'Diesel', 5, 2, 18000.00, 750.00, 15000.00, 250, 60.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/BMW.png"]')
ON DUPLICATE KEY UPDATE 
  `hub_id` = 2,
  `brand` = VALUES(`brand`),
  `model` = VALUES(`model`),
  `price_day` = VALUES(`price_day`),
  `price_hour` = VALUES(`price_hour`),
  `status` = VALUES(`status`),
  `is_active_fleet` = VALUES(`is_active_fleet`);

