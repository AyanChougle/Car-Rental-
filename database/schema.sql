-- ============================================================
-- KRUIZLY PRODUCTION MYSQL DATABASE SCHEMA
-- Hostinger MySQL 8.x
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `firebase_uid` VARCHAR(128) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(32) DEFAULT NULL,
  `age` INT DEFAULT NULL,
  `role` ENUM('customer', 'admin', 'manager', 'executive', 'host') NOT NULL DEFAULT 'customer',
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
-- 2. VEHICLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vehicles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `reg_no` VARCHAR(64) NOT NULL UNIQUE,
  `brand` VARCHAR(128) NOT NULL,
  `model` VARCHAR(128) NOT NULL,
  `year` INT NOT NULL DEFAULT 2024,
  `category` VARCHAR(64) NOT NULL DEFAULT 'economy',
  `transmission` VARCHAR(32) NOT NULL DEFAULT 'Automatic',
  `fuel` VARCHAR(32) NOT NULL DEFAULT 'Petrol',
  `seats` INT NOT NULL DEFAULT 5,
  `bags` INT NOT NULL DEFAULT 2,
  `price_day` DECIMAL(10,2) NOT NULL,
  `price_hour` DECIMAL(10,2) NOT NULL,
  `driver_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `security_deposit` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `free_km` INT NOT NULL DEFAULT 250,
  `extra_km` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `location` VARCHAR(255) DEFAULT 'Gavson Business Park, Ghansoli',
  `available` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('available', 'unavailable', 'maintenance', 'removed') NOT NULL DEFAULT 'available',
  `is_custom_fleet` TINYINT(1) NOT NULL DEFAULT 0,
  `gallery` JSON DEFAULT NULL,
  `created_by` VARCHAR(128) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_vehicles_category` (`category`),
  INDEX `idx_vehicles_available` (`available`),
  INDEX `idx_vehicles_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. BOOKINGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bookings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `booking_id` VARCHAR(64) NOT NULL UNIQUE,
  `booking_number` VARCHAR(64) NOT NULL UNIQUE,
  `user_id` INT DEFAULT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL,
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
  `base_amount` DECIMAL(10,2) NOT NULL,
  `coupon_code` VARCHAR(64) DEFAULT NULL,
  `coupon_discount` DECIMAL(10,2) DEFAULT 0.00,
  `applied_coupons` JSON DEFAULT NULL,
  `total_amount` DECIMAL(10,2) NOT NULL,
  `final_amount` DECIMAL(10,2) NOT NULL,
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
-- 4. PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `payment_id` VARCHAR(64) NOT NULL UNIQUE,
  `booking_id` VARCHAR(64) NOT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
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
-- 5. COUPONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupons` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(64) NOT NULL UNIQUE,
  `discount_type` ENUM('flat', 'percentage') NOT NULL DEFAULT 'flat',
  `discount_value` DECIMAL(10,2) NOT NULL,
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
-- 6. COUPON USAGE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupon_usage` (
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
-- 7. VERIFICATION (KYC)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `verification` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `verification_id` VARCHAR(64) NOT NULL UNIQUE,
  `user_id` INT DEFAULT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL,
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
-- 8. MEDIA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `media` (
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
-- 9. INVOICES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` VARCHAR(64) NOT NULL UNIQUE,
  `invoice_number` VARCHAR(64) NOT NULL UNIQUE,
  `booking_id` VARCHAR(64) NOT NULL,
  `user_id` INT DEFAULT NULL,
  `firebase_uid` VARCHAR(128) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_email` VARCHAR(255) NOT NULL,
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
  `total_amount` DECIMAL(10,2) NOT NULL,
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
-- 10. INVOICE ITEMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoice_items` (
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
-- 11. PARTNER CARS
-- ------------------------------------------------------------
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
  `year` INT NOT NULL DEFAULT 2024,
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
-- 12. CONTACT MESSAGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contact_messages` (
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
-- 13. ADMIN USERS & AUDIT LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `firebase_uid` VARCHAR(128) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `role` ENUM('super_admin', 'admin', 'manager', 'executive') NOT NULL DEFAULT 'admin',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_admin_users_uid` (`firebase_uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
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
-- 14. SETTINGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `key` VARCHAR(64) PRIMARY KEY,
  `value` TEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
