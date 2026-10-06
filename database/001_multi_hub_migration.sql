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

-- 9. Seed Kandivali Hub 2 Matching Fleet
INSERT INTO `vehicles` (
  `id`, `car_id`, `reg_no`, `brand`, `model`, `year`, `category`, 
  `transmission`, `fuel`, `seats`, `bags`, `price_day`, `price_hour`, 
  `security_deposit`, `free_km`, `extra_km`,
  `hub`, `hub_id`, `location`, `acquisition_type`, `owner_name`, `acquisition_date`, 
  `available`, `status`, `is_active_fleet`, `is_custom_fleet`, `gallery`
) VALUES
(101, 'KND-001', 'MH02EL2001', 'Suzuki', 'Fronx', 2026, 'compact-suv', 'Automatic', 'Petrol', 5, 2, 3500.00, 146.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Suzuki Fronx.png"]'),
(102, 'KND-002', 'MH02GJ2002', 'Suzuki', 'Ertiga', 2026, 'mpv', 'Manual', 'Petrol + CNG', 7, 2, 4000.00, 167.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Suzuki Ertiga.png"]'),
(103, 'KND-003', 'MH02CJ2003', 'Toyota', 'Glanza', 2026, 'hatchback', 'Manual', 'Petrol + CNG', 5, 2, 3000.00, 125.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Toyota Glanza.png"]'),
(104, 'KND-004', 'MH02FV2004', 'Tata', 'Punch', 2026, 'compact-suv', 'Manual', 'Petrol + CNG', 5, 2, 3000.00, 125.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Tata Punch.png"]'),
(105, 'KND-005', 'MH02CY2005', 'Suzuki', 'Fronx', 2026, 'compact-suv', 'Manual', 'Petrol + CNG', 5, 2, 3200.00, 133.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Suzuki Fronx.png"]'),
(106, 'KND-006', 'MH02FU2006', 'Mahindra', 'XUV 700', 2026, 'suv', 'Automatic', 'Petrol', 5, 2, 5500.00, 229.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Partner', 'Kruizly Kandivali Host', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Mahindra XUV 700.png"]'),
(107, 'KND-007', 'MH02KR2101', 'BMW', '520D', 2017, 'luxury', 'Automatic', 'Diesel', 5, 2, 18000.00, 750.00, 15000.00, 250, 60.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/BMW 520D.png"]'),
(108, 'KND-008', 'MH02KR2102', 'Mahindra', '7XO', 2026, 'suv', 'AMT', 'Diesel', 7, 2, 9000.00, 375.00, 7000.00, 250, 28.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra 7XO.png"]'),
(109, 'KND-009', 'MH02KR2103', 'Tata', 'Altroz', 2024, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Tata Altroz.png"]'),
(110, 'KND-010', 'MH02KR2104', 'Hyundai', 'Aura', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai Aura.png"]'),
(111, 'KND-011', 'MH02KR2105', 'Maruti Suzuki', 'Baleno', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2500.00, 104.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Baleno.png"]'),
(112, 'KND-012', 'MH02KR2106', 'Maruti Suzuki', 'Brezza', 2025, 'suv', 'Manual', 'Petrol + CNG', 5, 2, 3500.00, 146.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Brezza.png"]'),
(113, 'KND-013', 'MH02KR2107', 'Kia', 'Carens', 2025, 'mpv', 'Manual', 'Diesel', 7, 2, 4500.00, 188.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Kia Carens.png"]'),
(114, 'KND-014', 'MH02KR2108', 'Jeep', 'Compass', 2020, 'suv', 'Manual', 'Diesel', 5, 2, 5500.00, 229.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Jeep Compass.png"]'),
(115, 'KND-015', 'MH02KR2109', 'Hyundai', 'Creta', 2024, 'suv', 'Manual', 'Diesel', 5, 2, 4500.00, 188.00, 3500.00, 250, 14.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai Creta.png"]'),
(116, 'KND-016', 'MH02KR2110', 'Maruti Suzuki', 'Dzire', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Dzire.png"]'),
(117, 'KND-017', 'MH02KR2111', 'Hyundai', 'Exter', 2025, 'suv', 'AMT', 'Petrol', 5, 2, 3500.00, 146.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai Exter.png"]'),
(118, 'KND-018', 'MH02KR2112', 'Toyota', 'Glanza', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Toyota Glanza.png"]'),
(119, 'KND-019', 'MH02KR2113', 'Maruti Suzuki', 'Grand Vitara', 2025, 'suv', 'Manual', 'Diesel', 5, 2, 4000.00, 167.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Grand Vitara.png"]'),
(120, 'KND-020', 'MH02KR2114', 'Hyundai', 'i20', 2025, 'economy', 'Manual', 'Petrol', 5, 2, 2600.00, 108.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai i20.png"]'),
(121, 'KND-021', 'MH02KR2115', 'Toyota', 'Innova Crysta', 2018, 'mpv', 'Automatic', 'Diesel', 7, 2, 6000.00, 250.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Toyota Innova Crysta.png"]'),
(122, 'KND-022', 'MH02KR2116', 'Tata', 'Nexon', 2025, 'suv', 'Manual', 'Petrol + CNG', 5, 2, 3000.00, 125.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Tata Nexon.png"]'),
(123, 'KND-023', 'MH02KR2117', 'Tata', 'Safari', 2024, 'suv', 'Automatic', 'Diesel', 7, 2, 9000.00, 375.00, 7000.00, 250, 28.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Tata Safari.png"]'),
(124, 'KND-024', 'MH02KR2118', 'Mahindra', 'Scorpio N', 2025, 'suv', 'Manual', 'Diesel', 7, 2, 6000.00, 250.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra Scorpio N.png"]'),
(125, 'KND-025', 'MH02KR2119', 'Maruti Suzuki', 'Swift', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2500.00, 104.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Swift.png"]'),
(126, 'KND-026', 'MH02KR2120', 'Mahindra', 'Thar', 2025, 'suv', 'Manual', 'Diesel', 4, 2, 5500.00, 229.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra Thar.png"]'),
(127, 'KND-027', 'MH02KR2121', 'Mahindra', 'Thar Roxx', 2025, 'suv', 'Automatic', 'Diesel', 5, 2, 7000.00, 292.00, 5000.00, 250, 20.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra Thar Roxx.png"]'),
(128, 'KND-028', 'MH02KR2122', 'Toyota', 'Urban Cruiser Taisor', 2025, 'compact-suv', 'Automatic', 'Petrol', 5, 2, 3500.00, 146.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Toyota Taisor.png"]'),
(129, 'KND-029', 'MH02KR2123', 'Maruti Suzuki', 'WagonR', 2023, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2300.00, 96.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki WagonR.png"]'),
(130, 'KND-030', 'MH02KR2124', 'Maruti Suzuki', 'XL6', 2023, 'mpv', 'Manual', 'Petrol + CNG', 7, 2, 3500.00, 146.00, 3000.00, 250, 12.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki XL6.png"]'),
(131, 'KND-031', 'MH02KR2125', 'Mahindra', 'XUV700', 2025, 'suv', 'Manual', 'Diesel', 7, 2, 6000.00, 250.00, 4000.00, 250, 16.00, 'Kandivali Hub, Mumbai', 2, 'Kandivali Hub, Mumbai', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra XUV700.png"]')
ON DUPLICATE KEY UPDATE 
  `hub_id` = 2,
  `brand` = VALUES(`brand`),
  `model` = VALUES(`model`),
  `price_day` = VALUES(`price_day`),
  `price_hour` = VALUES(`price_hour`),
  `status` = VALUES(`status`),
  `is_active_fleet` = VALUES(`is_active_fleet`);

