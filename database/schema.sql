-- ============================================================
-- KRUIZLY PRODUCTION MYSQL MASTER DATABASE SCHEMA
-- Hostinger MySQL 8.x / phpMyAdmin Compatible
-- Full AUTO_INCREMENT Primary Keys & Strict-Mode Compliant
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `firebase_uid` VARCHAR(128) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(32) DEFAULT NULL,
  `age` INT DEFAULT NULL,
  `role` ENUM('customer', 'admin', 'manager', 'executive', 'accountant', 'host') NOT NULL DEFAULT 'customer',
  `status` ENUM('active', 'disabled', 'suspended', 'pending') NOT NULL DEFAULT 'active',
  `license_status` ENUM('not_submitted', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'not_submitted',
  `aadhar_status` ENUM('not_submitted', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'not_submitted',
  `pan_status` ENUM('not_submitted', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'not_submitted',
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `metadata` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. ADMIN USERS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `admin_users`;
CREATE TABLE `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `firebase_uid` VARCHAR(128) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `role` ENUM('super_admin', 'admin', 'manager', 'executive', 'accountant') NOT NULL DEFAULT 'admin',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_admin_users_uid` (`firebase_uid`),
  INDEX `idx_admin_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. VEHICLES TABLE (FLEET)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `vehicles`;
CREATE TABLE `vehicles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `car_id` VARCHAR(32) DEFAULT NULL,
  `reg_no` VARCHAR(64) NOT NULL UNIQUE,
  `brand` VARCHAR(128) NOT NULL,
  `model` VARCHAR(128) NOT NULL,
  `year` INT NOT NULL DEFAULT 2026,
  `category` VARCHAR(64) NOT NULL DEFAULT 'economy',
  `transmission` VARCHAR(32) NOT NULL DEFAULT 'Manual',
  `fuel` VARCHAR(32) NOT NULL DEFAULT 'Petrol',
  `seats` INT NOT NULL DEFAULT 5,
  `bags` INT NOT NULL DEFAULT 2,
  `price_day` DECIMAL(10,2) NOT NULL DEFAULT 3500.00,
  `price_hour` DECIMAL(10,2) NOT NULL DEFAULT 145.00,
  `driver_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `security_deposit` DECIMAL(10,2) NOT NULL DEFAULT 3000.00,
  `free_km` INT NOT NULL DEFAULT 250,
  `extra_km` DECIMAL(10,2) NOT NULL DEFAULT 15.00,
  `hub` VARCHAR(255) NOT NULL DEFAULT 'Gavson Business Park, Ghansoli',
  `location` VARCHAR(255) DEFAULT 'Gavson Business Park, Ghansoli',
  `acquisition_type` VARCHAR(64) NOT NULL DEFAULT 'Partner',
  `owner_name` VARCHAR(128) DEFAULT NULL,
  `acquisition_date` DATE DEFAULT NULL,
  `available` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('available', 'unavailable', 'maintenance', 'removed') NOT NULL DEFAULT 'available',
  `is_active_fleet` TINYINT(1) NOT NULL DEFAULT 1,
  `is_custom_fleet` TINYINT(1) NOT NULL DEFAULT 1,
  `gallery` JSON DEFAULT NULL,
  `created_by` VARCHAR(128) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_vehicles_car_id` (`car_id`),
  INDEX `idx_vehicles_reg_no` (`reg_no`),
  INDEX `idx_vehicles_category` (`category`),
  INDEX `idx_vehicles_available` (`available`),
  INDEX `idx_vehicles_status` (`status`),
  INDEX `idx_vehicles_active_fleet` (`is_active_fleet`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. BOOKINGS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `bookings`;
CREATE TABLE `bookings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `booking_id` VARCHAR(64) NOT NULL UNIQUE,
  `booking_number` VARCHAR(64) NOT NULL UNIQUE,
  `user_id` INT DEFAULT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL DEFAULT 'legacy_system',
  `user_name` VARCHAR(255) DEFAULT NULL,
  `user_email` VARCHAR(255) DEFAULT NULL,
  `user_phone` VARCHAR(32) DEFAULT NULL,
  `vehicle_id` INT DEFAULT NULL,
  `vehicle_reg` VARCHAR(64) NOT NULL,
  `vehicle_name` VARCHAR(255) NOT NULL,
  `vehicle_category` VARCHAR(64) DEFAULT NULL,
  `pickup_date` DATETIME NOT NULL,
  `drop_date` DATETIME NOT NULL,
  `duration` VARCHAR(128) DEFAULT NULL,
  `days` INT DEFAULT 1,
  `hours` INT DEFAULT 24,
  `with_driver` TINYINT(1) DEFAULT 0,
  `day_rate` DECIMAL(10,2) DEFAULT 0.00,
  `hourly_rate` DECIMAL(10,2) DEFAULT 0.00,
  `driver_rate` DECIMAL(10,2) DEFAULT 0.00,
  `driver_hourly_rate` DECIMAL(10,2) DEFAULT 0.00,
  `security_deposit` DECIMAL(10,2) DEFAULT 0.00,
  `base_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `coupon_code` VARCHAR(64) DEFAULT NULL,
  `coupon_discount` DECIMAL(10,2) DEFAULT 0.00,
  `applied_coupons` JSON DEFAULT NULL,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `final_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `token_amount` DECIMAL(10,2) DEFAULT 0.00,
  `advance_amount` DECIMAL(10,2) DEFAULT 0.00,
  `remaining_balance` DECIMAL(10,2) DEFAULT 0.00,
  `remaining_amount` DECIMAL(10,2) DEFAULT 0.00,
  `payment_plan` VARCHAR(32) DEFAULT 'full',
  `payment_status` ENUM('pending_payment', 'pending_verification', 'advance_paid', 'paid', 'refunded', 'rejected', 'cancelled', 'pay_at_pickup') NOT NULL DEFAULT 'pending_payment',
  `status` ENUM('pending_payment', 'pending_verification', 'confirmed', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'pending_payment',
  `booking_status` VARCHAR(64) DEFAULT 'pending_payment',
  `payment_ref` VARCHAR(128) DEFAULT NULL,
  `payment_amount_paid` DECIMAL(10,2) DEFAULT 0.00,
  `location` VARCHAR(255) DEFAULT 'Gavson Business Park, Ghansoli',
  `pickup_location` VARCHAR(255) DEFAULT 'Gavson Business Park, Ghansoli',
  `drop_location` VARCHAR(255) DEFAULT 'Gavson Business Park, Ghansoli',
  `start_odometer` VARCHAR(32) DEFAULT NULL,
  `end_odometer` VARCHAR(32) DEFAULT NULL,
  `start_fastag` VARCHAR(32) DEFAULT NULL,
  `return_fastag` VARCHAR(32) DEFAULT NULL,
  `pickup_handled_by` VARCHAR(128) DEFAULT NULL,
  `pickup_at` DATETIME DEFAULT NULL,
  `return_inspection` JSON DEFAULT NULL,
  `payment_screenshot_url` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_bookings_firebase_uid` (`firebase_uid`),
  INDEX `idx_bookings_vehicle_reg` (`vehicle_reg`),
  INDEX `idx_bookings_status` (`status`),
  INDEX `idx_bookings_payment_status` (`payment_status`),
  INDEX `idx_bookings_pickup_date` (`pickup_date`),
  CONSTRAINT `fk_bookings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bookings_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. PAYMENTS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `payments`;
CREATE TABLE `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `payment_id` VARCHAR(64) NOT NULL UNIQUE,
  `booking_id` VARCHAR(64) NOT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL DEFAULT 'legacy_system',
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `token_amount` DECIMAL(10,2) DEFAULT 0.00,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'INR',
  `method` VARCHAR(32) NOT NULL DEFAULT 'upi',
  `utr` VARCHAR(128) DEFAULT NULL,
  `payment_ref` VARCHAR(128) DEFAULT NULL,
  `screenshot_url` TEXT DEFAULT NULL,
  `screenshot_media_id` VARCHAR(64) DEFAULT NULL,
  `razorpay_order_id` VARCHAR(128) DEFAULT NULL,
  `razorpay_payment_id` VARCHAR(128) DEFAULT NULL,
  `razorpay_signature` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('pending', 'verified', 'rejected', 'refunded') NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT DEFAULT NULL,
  `refund_amount` DECIMAL(10,2) DEFAULT 0.00,
  `refund_reason` TEXT DEFAULT NULL,
  `verified_by` VARCHAR(128) DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_payments_booking_id` (`booking_id`),
  INDEX `idx_payments_firebase_uid` (`firebase_uid`),
  INDEX `idx_payments_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. COUPONS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `coupons`;
CREATE TABLE `coupons` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL UNIQUE,
  `discount_type` ENUM('flat', 'percentage') NOT NULL DEFAULT 'flat',
  `discount_value` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `min_order` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `max_discount` DECIMAL(10,2) DEFAULT NULL,
  `label` VARCHAR(128) DEFAULT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('active', 'inactive', 'expired') NOT NULL DEFAULT 'active',
  `used_count` INT NOT NULL DEFAULT 0,
  `max_uses` INT DEFAULT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_coupons_code` (`code`),
  INDEX `idx_coupons_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. COUPON USAGE TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `coupon_usage`;
CREATE TABLE `coupon_usage` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `coupon_id` INT DEFAULT NULL,
  `coupon_code` VARCHAR(64) NOT NULL,
  `user_id` INT DEFAULT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL,
  `booking_id` VARCHAR(64) NOT NULL,
  `discount_applied` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `used_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_user_coupon` (`coupon_code`, `firebase_uid`),
  INDEX `idx_coupon_usage_booking` (`booking_id`),
  CONSTRAINT `fk_coupon_usage_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_coupon_usage_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. VERIFICATION (KYC) TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `verification`;
CREATE TABLE `verification` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `verification_id` VARCHAR(64) NOT NULL UNIQUE,
  `user_id` INT DEFAULT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL UNIQUE,
  `full_name` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(32) DEFAULT NULL,
  `license_number` VARCHAR(64) DEFAULT NULL,
  `license_front_media_id` VARCHAR(64) DEFAULT NULL,
  `license_back_media_id` VARCHAR(64) DEFAULT NULL,
  `license_status` ENUM('not_submitted', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'not_submitted',
  `aadhar_number` VARCHAR(64) DEFAULT NULL,
  `aadhar_front_media_id` VARCHAR(64) DEFAULT NULL,
  `aadhar_back_media_id` VARCHAR(64) DEFAULT NULL,
  `aadhar_status` ENUM('not_submitted', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'not_submitted',
  `pan_number` VARCHAR(64) DEFAULT NULL,
  `pan_front_media_id` VARCHAR(64) DEFAULT NULL,
  `pan_back_media_id` VARCHAR(64) DEFAULT NULL,
  `pan_status` ENUM('not_submitted', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'not_submitted',
  `selfie_media_id` VARCHAR(64) DEFAULT NULL,
  `overall_status` ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT DEFAULT NULL,
  `verified_by` VARCHAR(128) DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_verification_uid` (`firebase_uid`),
  INDEX `idx_verification_overall` (`overall_status`),
  CONSTRAINT `fk_verification_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. MEDIA TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `media`;
CREATE TABLE `media` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `media_id` VARCHAR(64) NOT NULL UNIQUE,
  `user_id` INT DEFAULT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL,
  `category` ENUM('verification', 'payment_proof', 'vehicle_gallery', 'booking_doc', 'invoice', 'other') NOT NULL DEFAULT 'other',
  `related_id` VARCHAR(64) DEFAULT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `stored_name` VARCHAR(255) NOT NULL,
  `stored_path` VARCHAR(512) NOT NULL,
  `mime_type` VARCHAR(128) NOT NULL,
  `file_size` INT NOT NULL,
  `file_hash` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_media_uid` (`firebase_uid`),
  INDEX `idx_media_category` (`category`),
  INDEX `idx_media_related_id` (`related_id`),
  CONSTRAINT `fk_media_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 10. INVOICES TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `invoices`;
CREATE TABLE `invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` VARCHAR(64) NOT NULL UNIQUE,
  `invoice_number` VARCHAR(64) NOT NULL UNIQUE,
  `booking_id` VARCHAR(64) NOT NULL,
  `user_id` INT DEFAULT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL DEFAULT 'legacy_system',
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_email` VARCHAR(255) DEFAULT NULL,
  `customer_phone` VARCHAR(32) DEFAULT NULL,
  `vehicle_name` VARCHAR(255) NOT NULL,
  `vehicle_reg` VARCHAR(64) NOT NULL,
  `pickup_date` DATETIME NOT NULL,
  `drop_date` DATETIME NOT NULL,
  `duration` VARCHAR(128) DEFAULT NULL,
  `base_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `coupon_discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `gst_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `security_deposit` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `amount_paid` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `balance_due` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('draft', 'issued', 'paid', 'cancelled') NOT NULL DEFAULT 'issued',
  `email_status` ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  `email_sent_at` DATETIME DEFAULT NULL,
  `pdf_path` VARCHAR(512) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_invoices_booking_id` (`booking_id`),
  INDEX `idx_invoices_firebase_uid` (`firebase_uid`),
  CONSTRAINT `fk_invoices_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 11. INVOICE ITEMS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `invoice_items`;
CREATE TABLE `invoice_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` INT NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_invoice_items_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 12. PARTNER CARS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `partner_cars`;
CREATE TABLE `partner_cars` (
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
  `status` ENUM('pending_approval', 'approved', 'rejected') NOT NULL DEFAULT 'pending_approval',
  `rejection_reason` TEXT DEFAULT NULL,
  `photos` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_partner_cars_uid` (`firebase_uid`),
  INDEX `idx_partner_cars_status` (`status`),
  CONSTRAINT `fk_partner_cars_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 13. PARTNER LEADS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `partner_leads`;
CREATE TABLE `partner_leads` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `city` VARCHAR(128) DEFAULT 'Navi Mumbai',
  `car_model` VARCHAR(255) DEFAULT NULL,
  `car_year` INT DEFAULT NULL,
  `status` ENUM('new', 'contacted', 'inspected', 'onboarded', 'rejected') NOT NULL DEFAULT 'new',
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 14. CONTACT MESSAGES TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `contact_messages`;
CREATE TABLE `contact_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(32) DEFAULT NULL,
  `subject` VARCHAR(255) DEFAULT NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('unread', 'read', 'replied') NOT NULL DEFAULT 'unread',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 15. AUDIT LOGS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `firebase_uid` VARCHAR(128) NOT NULL,
  `action` VARCHAR(128) NOT NULL,
  `resource_type` VARCHAR(64) NOT NULL,
  `resource_id` VARCHAR(64) DEFAULT NULL,
  `details` JSON DEFAULT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_logs_action` (`action`),
  INDEX `idx_audit_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 16. SETTINGS TABLE
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `key` VARCHAR(64) PRIMARY KEY,
  `value` TEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INITIAL SEED DATA
-- ============================================================

-- 1. ADMIN & STAFF USERS
INSERT INTO `admin_users` (`id`, `firebase_uid`, `email`, `name`, `role`) VALUES
(1, 'super_admin_ayan', 'ayanchougle@gmail.com', 'Ayan Chougle', 'super_admin'),
(2, 'staff_omkar_tapshale', 'omkar.tapshale@kruizly.com', 'Omkar Tapshale', 'manager'),
(3, 'staff_rahul_sharma', 'rahul.sharma@kruizly.com', 'Rahul Sharma', 'accountant')
ON DUPLICATE KEY UPDATE `email` = VALUES(`email`), `name` = VALUES(`name`);

-- 2. 7 ACTIVE FLEET VEHICLES
INSERT INTO `vehicles` (
  `id`, `car_id`, `reg_no`, `brand`, `model`, `year`, `category`, 
  `transmission`, `fuel`, `seats`, `bags`, `price_day`, `price_hour`, 
  `hub`, `location`, `acquisition_type`, `owner_name`, `acquisition_date`, 
  `available`, `status`, `is_active_fleet`, `is_custom_fleet`, `gallery`
) VALUES
(1, 'CRP-002', 'MH03EL1025', 'Suzuki', 'Fronx', 2026, 'compact-suv', 'Automatic', 'Petrol', 5, 2, 3500.00, 146.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Aditi Lotankar', '2026-07-20', 1, 'available', 1, 1, '["assets/fleet/Suzuki Fronx.png"]'),
(2, 'CRP-003', 'MH05GJ4711', 'Suzuki', 'Ertiga', 2026, 'mpv', 'Manual', 'Petrol + CNG', 7, 3, 4000.00, 167.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Viren Gupta', '2026-07-24', 1, 'available', 1, 1, '["assets/fleet/Suzuki Ertiga.png"]'),
(3, 'CRP-005', 'MH48CJ4153', 'Toyota', 'Glanza', 2026, 'hatchback', 'Manual', 'Petrol + CNG', 5, 2, 3000.00, 125.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Ajay Vishwakarma', '2026-07-29', 1, 'available', 1, 1, '["assets/fleet/Toyota Glanza.png"]'),
(4, 'CRP-006', 'MH04MU1178', 'Toyota', 'Glanza', 2026, 'hatchback', 'Manual', 'Petrol + CNG', 5, 2, 3000.00, 125.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Kundan Singh', '2026-08-04', 1, 'available', 1, 1, '["assets/fleet/Toyota Glanza.png"]'),
(5, 'CRP-007', 'MH05FV3454', 'Tata', 'Punch', 2026, 'compact-suv', 'Manual', 'Petrol + CNG', 5, 2, 3000.00, 125.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Tai Phad', '2026-08-13', 1, 'available', 1, 1, '["assets/fleet/Tata Punch.png"]'),
(6, 'CRP-008', 'MH43CY1632', 'Suzuki', 'Fronx', 2026, 'compact-suv', 'Manual', 'Petrol + CNG', 5, 2, 3200.00, 133.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Amol Gole', '2026-08-19', 1, 'available', 1, 1, '["assets/fleet/Suzuki Fronx.png"]'),
(7, 'CRP-009', 'MH02FU6808', 'Mahindra', 'XUV 700', 2026, 'suv', 'Automatic', 'Petrol', 5, 3, 5500.00, 229.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Saif Feroz Shaikh', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Mahindra XUV 700.png"]')
ON DUPLICATE KEY UPDATE 
  `brand` = VALUES(`brand`),
  `model` = VALUES(`model`),
  `price_day` = VALUES(`price_day`),
  `price_hour` = VALUES(`price_hour`),
  `status` = VALUES(`status`),
  `is_active_fleet` = VALUES(`is_active_fleet`);

-- 3. 10 SEPTEMBER MANUAL BOOKINGS
INSERT INTO `bookings` (
  `id`, `booking_id`, `booking_number`, `firebase_uid`, `user_name`, `user_phone`, 
  `vehicle_reg`, `vehicle_name`, `pickup_date`, `drop_date`, `days`, 
  `base_amount`, `total_amount`, `final_amount`, `payment_amount_paid`, 
  `payment_status`, `status`, `booking_status`, `created_at`
) VALUES
(1, 'KRZ-SEP-001', 'KRZ-SEP-001', 'cust_roshan_more', 'Roshan More', '7507323988', 'MH48CJ4153', 'Toyota Glanza', '2026-09-03 09:00:00', '2026-09-16 21:00:00', 16, 40000.00, 40000.00, 40000.00, 40000.00, 'paid', 'active', 'active', '2026-09-03 08:30:00'),
(2, 'KRZ-SEP-002', 'KRZ-SEP-002', 'cust_vivek_hatkamkar', 'Vivek Anant Hatkamkar', '8355912195', 'MH04MU1178', 'Toyota Glanza', '2026-09-03 10:00:00', '2026-09-10 20:00:00', 10, 25200.00, 25200.00, 25200.00, 25200.00, 'paid', 'active', 'active', '2026-09-03 09:15:00'),
(3, 'KRZ-SEP-003', 'KRZ-SEP-003', 'cust_arun_ahuja', 'Arun Ahuja', '7030914115', 'MH03EL1025', 'Suzuki Fronx Auto', '2026-08-30 08:00:00', '2026-09-03 20:00:00', 3, 7020.00, 7020.00, 7020.00, 7020.00, 'paid', 'completed', 'completed', '2026-08-29 18:00:00'),
(4, 'KRZ-SEP-004', 'KRZ-SEP-004', 'cust_akash_sarkar', 'Akash Sarkar', '8777355520', 'MH01BALENO', 'Maruti Baleno', '2026-09-06 09:00:00', '2026-09-07 20:00:00', 1, 2500.00, 2500.00, 2500.00, 2500.00, 'paid', 'completed', 'completed', '2026-09-05 21:00:00'),
(5, 'KRZ-SEP-005', 'KRZ-SEP-005', 'cust_kunal_vichave', 'Kunal Vichave', '7387961727', 'MH05FV3454', 'Tata Punch', '2026-09-05 08:00:00', '2026-09-06 20:00:00', 2, 3896.00, 3896.00, 3896.00, 3896.00, 'paid', 'completed', 'completed', '2026-09-04 19:30:00'),
(6, 'KRZ-SEP-006', 'KRZ-SEP-006', 'cust_dipesh_bhoir', 'Dipesh Bhoir', '9527788995', 'MH05GJ4711', 'Suzuki Ertiga', '2026-09-07 09:00:00', '2026-09-08 21:00:00', 1, 3300.00, 3300.00, 3300.00, 3300.00, 'paid', 'active', 'active', '2026-09-06 17:00:00'),
(7, 'KRZ-SEP-007', 'KRZ-SEP-007', 'cust_krishna_velega', 'Krishna Velega', '9063281666', 'MH05GJ4711', 'Suzuki Ertiga', '2026-09-05 09:00:00', '2026-09-06 20:00:00', 1, 3300.00, 3300.00, 3300.00, 3300.00, 'paid', 'completed', 'completed', '2026-09-04 15:00:00'),
(8, 'KRZ-SEP-008', 'KRZ-SEP-008', 'cust_rushikesh_shimpi', 'Rushikesh Shimpi', '9324855850', 'MH05GJ4711', 'Suzuki Ertiga', '2026-09-03 09:00:00', '2026-09-04 20:00:00', 1, 3300.00, 3300.00, 3300.00, 3300.00, 'paid', 'completed', 'completed', '2026-09-02 20:00:00'),
(9, 'KRZ-SEP-009', 'KRZ-SEP-009', 'cust_shaikh_sarfaraz', 'Shaikh Sarfaraz', '8928073455', 'MH43CY1632', 'Suzuki Fronx', '2026-09-01 09:00:00', '2026-09-03 20:00:00', 2, 5100.00, 5100.00, 5100.00, 5100.00, 'paid', 'completed', 'completed', '2026-08-31 16:00:00'),
(10, 'KRZ-SEP-010', 'KRZ-SEP-010', 'cust_shaikh_sarfaraz_2', 'Shaikh Sarfaraz', '8928073455', 'MH43CY1632', 'Suzuki Fronx', '2026-09-04 09:00:00', '2026-09-06 20:00:00', 2, 5200.00, 5200.00, 5200.00, 5200.00, 'paid', 'completed', 'completed', '2026-09-03 14:00:00')
ON DUPLICATE KEY UPDATE
  `user_name` = VALUES(`user_name`),
  `vehicle_reg` = VALUES(`vehicle_reg`),
  `total_amount` = VALUES(`total_amount`),
  `final_amount` = VALUES(`final_amount`),
  `payment_amount_paid` = VALUES(`payment_amount_paid`),
  `payment_status` = VALUES(`payment_status`),
  `status` = VALUES(`status`);

-- 4. 10 PAYMENTS CORRESPONDING TO BOOKINGS
INSERT INTO `payments` (
  `id`, `payment_id`, `booking_id`, `firebase_uid`, `amount`, `method`, 
  `status`, `verified_by`, `created_at`
) VALUES
(1, 'PAY-KRZ-001', 'KRZ-SEP-001', 'cust_roshan_more', 40000.00, 'UPI', 'verified', 'Ayan Chougle', '2026-09-03 08:45:00'),
(2, 'PAY-KRZ-002', 'KRZ-SEP-002', 'cust_vivek_hatkamkar', 25200.00, 'UPI', 'verified', 'Ayan Chougle', '2026-09-03 09:30:00'),
(3, 'PAY-KRZ-003', 'KRZ-SEP-003', 'cust_arun_ahuja', 7020.00, 'UPI', 'verified', 'Ayan Chougle', '2026-08-29 18:30:00'),
(4, 'PAY-KRZ-004', 'KRZ-SEP-004', 'cust_akash_sarkar', 2500.00, 'UPI', 'verified', 'Ayan Chougle', '2026-09-05 21:15:00'),
(5, 'PAY-KRZ-005', 'KRZ-SEP-005', 'cust_kunal_vichave', 3896.00, 'UPI', 'verified', 'Ayan Chougle', '2026-09-04 19:45:00'),
(6, 'PAY-KRZ-006', 'KRZ-SEP-006', 'cust_dipesh_bhoir', 3300.00, 'UPI', 'verified', 'Ayan Chougle', '2026-09-06 17:30:00'),
(7, 'PAY-KRZ-007', 'KRZ-SEP-007', 'cust_krishna_velega', 3300.00, 'UPI', 'verified', 'Ayan Chougle', '2026-09-04 15:30:00'),
(8, 'PAY-KRZ-008', 'KRZ-SEP-008', 'cust_rushikesh_shimpi', 3300.00, 'UPI', 'verified', 'Ayan Chougle', '2026-09-02 20:30:00'),
(9, 'PAY-KRZ-009', 'KRZ-SEP-009', 'cust_shaikh_sarfaraz', 5100.00, 'UPI', 'verified', 'Ayan Chougle', '2026-08-31 16:30:00'),
(10, 'PAY-KRZ-010', 'KRZ-SEP-010', 'cust_shaikh_sarfaraz_2', 5200.00, 'UPI', 'verified', 'Ayan Chougle', '2026-09-03 14:30:00')
ON DUPLICATE KEY UPDATE
  `amount` = VALUES(`amount`),
  `status` = VALUES(`status`),
  `verified_by` = VALUES(`verified_by`);

-- 5. 10 INVOICES CORRESPONDING TO BOOKINGS
INSERT INTO `invoices` (
  `id`, `invoice_id`, `invoice_number`, `booking_id`, `firebase_uid`, 
  `customer_name`, `customer_phone`, `vehicle_name`, `vehicle_reg`, 
  `pickup_date`, `drop_date`, `duration`, `total_amount`, `amount_paid`, 
  `balance_due`, `status`, `created_at`
) VALUES
(1, 'INV-KRZ-001', 'INV-2026-001', 'KRZ-SEP-001', 'cust_roshan_more', 'Roshan More', '7507323988', 'Toyota Glanza', 'MH48CJ4153', '2026-09-03 09:00:00', '2026-09-16 21:00:00', '16 Days', 40000.00, 40000.00, 0.00, 'paid', '2026-09-03 09:00:00'),
(2, 'INV-KRZ-002', 'INV-2026-002', 'KRZ-SEP-002', 'cust_vivek_hatkamkar', 'Vivek Anant Hatkamkar', '8355912195', 'Toyota Glanza', 'MH04MU1178', '2026-09-03 10:00:00', '2026-09-10 20:00:00', '10 Days', 25200.00, 25200.00, 0.00, 'paid', '2026-09-03 09:45:00'),
(3, 'INV-KRZ-003', 'INV-2026-003', 'KRZ-SEP-003', 'cust_arun_ahuja', 'Arun Ahuja', '7030914115', 'Suzuki Fronx Auto', 'MH03EL1025', '2026-08-30 08:00:00', '2026-09-03 20:00:00', '3 Days', 7020.00, 7020.00, 0.00, 'paid', '2026-08-29 19:00:00'),
(4, 'INV-KRZ-004', 'INV-2026-004', 'KRZ-SEP-004', 'cust_akash_sarkar', 'Akash Sarkar', '8777355520', 'Maruti Baleno', 'MH01BALENO', '2026-09-06 09:00:00', '2026-09-07 20:00:00', '1 Day', 2500.00, 2500.00, 0.00, 'paid', '2026-09-05 21:30:00'),
(5, 'INV-KRZ-005', 'INV-2026-005', 'KRZ-SEP-005', 'cust_kunal_vichave', 'Kunal Vichave', '7387961727', 'Tata Punch', 'MH05FV3454', '2026-09-05 08:00:00', '2026-09-06 20:00:00', '2 Days', 3896.00, 3896.00, 0.00, 'paid', '2026-09-04 20:00:00'),
(6, 'INV-KRZ-006', 'INV-2026-006', 'KRZ-SEP-006', 'cust_dipesh_bhoir', 'Dipesh Bhoir', '9527788995', 'Suzuki Ertiga', 'MH05GJ4711', '2026-09-07 09:00:00', '2026-09-08 21:00:00', '1 Day', 3300.00, 3300.00, 0.00, 'paid', '2026-09-06 18:00:00'),
(7, 'INV-KRZ-007', 'INV-2026-007', 'KRZ-SEP-007', 'cust_krishna_velega', 'Krishna Velega', '9063281666', 'Suzuki Ertiga', 'MH05GJ4711', '2026-09-05 09:00:00', '2026-09-06 20:00:00', '1 Day', 3300.00, 3300.00, 0.00, 'paid', '2026-09-04 16:00:00'),
(8, 'INV-KRZ-008', 'INV-2026-008', 'KRZ-SEP-008', 'cust_rushikesh_shimpi', 'Rushikesh Shimpi', '9324855850', 'Suzuki Ertiga', 'MH05GJ4711', '2026-09-03 09:00:00', '2026-09-04 20:00:00', '1 Day', 3300.00, 3300.00, 0.00, 'paid', '2026-09-02 21:00:00'),
(9, 'INV-KRZ-009', 'INV-2026-009', 'KRZ-SEP-009', 'cust_shaikh_sarfaraz', 'Shaikh Sarfaraz', '8928073455', 'Suzuki Fronx', 'MH43CY1632', '2026-09-01 09:00:00', '2026-09-03 20:00:00', '2 Days', 5100.00, 5100.00, 0.00, 'paid', '2026-08-31 17:00:00'),
(10, 'INV-KRZ-010', 'INV-2026-010', 'KRZ-SEP-010', 'cust_shaikh_sarfaraz_2', 'Shaikh Sarfaraz', '8928073455', 'Suzuki Fronx', 'MH43CY1632', '2026-09-04 09:00:00', '2026-09-06 20:00:00', '2 Days', 5200.00, 5200.00, 0.00, 'paid', '2026-09-03 15:00:00')
ON DUPLICATE KEY UPDATE
  `total_amount` = VALUES(`total_amount`),
  `amount_paid` = VALUES(`amount_paid`),
  `status` = VALUES(`status`);

-- 6. ACTIVE COUPONS
INSERT INTO `coupons` (`id`, `code`, `discount_type`, `discount_value`, `min_order`, `label`, `description`, `active`, `status`) VALUES
(1, 'FIRST500', 'flat', 500.00, 0.00, '₹500 Flat Off', 'Enjoy ₹500 off on your first booking', 1, 'active'),
(2, 'KRUIZLY10', 'percentage', 10.00, 0.00, '10% Off Rental', 'Get 10% off on your ride', 1, 'active'),
(3, 'KRUIZLY20', 'percentage', 20.00, 0.00, '20% Off Rental', 'Special 20% discount on long trips', 1, 'active'),
(4, 'WELCOME100', 'flat', 100.00, 0.00, '₹100 Welcome Discount', 'Instant ₹100 discount on your booking', 1, 'active'),
(5, 'FESTIVE15', 'percentage', 15.00, 2500.00, '15% Festive Special', 'Festive season discount on car rentals', 1, 'active')
ON DUPLICATE KEY UPDATE
  `discount_type` = VALUES(`discount_type`),
  `discount_value` = VALUES(`discount_value`),
  `active` = VALUES(`active`);

-- 7. DEFAULT SETTINGS
INSERT INTO `settings` (`key`, `value`) VALUES
('company_name', 'KRUIZLY Car Rentals'),
('company_email', 'support@kruizly.com'),
('company_phone', '+91 91671 64547'),
('company_address', 'Gavson Business Park, Ghansoli, Navi Mumbai, Maharashtra 400701'),
('currency', 'INR')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

SET FOREIGN_KEY_CHECKS = 1;
