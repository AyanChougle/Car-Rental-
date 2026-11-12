-- ============================================================================
-- KRUIZLY Migration 003: Unified Financial, Fleet, Hub & Reporting Engines
-- Backward-compatible, additive-only migration (preserves all production data).
-- Portable across BOTH Oracle MySQL 8.0+ and MariaDB 10.0+ (phpMyAdmin & CLI).
-- Uses INFORMATION_SCHEMA + PREPARE/EXECUTE (no DELIMITER/PROCEDURE required).
--
-- ROLLBACK INSTRUCTIONS (drop only columns newly added by this migration):
--   ALTER TABLE `bookings`
--     DROP COLUMN `driver_charges`,
--     DROP COLUMN `extra_charges`,
--     DROP COLUMN `refund_amount`,
--     DROP COLUMN `refund_status`,
--     DROP COLUMN `cancellation_reason`,
--     DROP COLUMN `monthly_revenue_split`;
--   -- Note: payments.refund_amount & payments.refund_reason exist in baseline schema.sql;
--   -- only drop them if newly added by this migration on a pre-refund schema.
--   ALTER TABLE `kpi_hub_metrics`
--     DROP COLUMN `scheduled_bookings`,
--     DROP COLUMN `completed_trips`,
--     DROP COLUMN `maintenance_fleet`;
--   ALTER TABLE `partner_cars`
--     DROP COLUMN `payout_model`,
--     DROP COLUMN `fixed_monthly_amount`,
--     DROP COLUMN `revenue_share_pct`;
--   ALTER TABLE `vehicles`
--     DROP COLUMN `payout_model`,
--     DROP COLUMN `fixed_monthly_amount`;
-- ============================================================================

SET NAMES utf8mb4;

-- 0. Ensure kpi_hub_metrics exists before altering columns
CREATE TABLE IF NOT EXISTS `kpi_hub_metrics` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `hub_id` INT NOT NULL UNIQUE,
  `hub_name` VARCHAR(255) NOT NULL,
  `total_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `month_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_bookings` INT NOT NULL DEFAULT 0,
  `paid_bookings` INT NOT NULL DEFAULT 0,
  `active_trips` INT NOT NULL DEFAULT 0,
  `scheduled_bookings` INT NOT NULL DEFAULT 0,
  `completed_trips` INT NOT NULL DEFAULT 0,
  `total_fleet` INT NOT NULL DEFAULT 0,
  `on_road_fleet` INT NOT NULL DEFAULT 0,
  `available_fleet` INT NOT NULL DEFAULT 0,
  `maintenance_fleet` INT NOT NULL DEFAULT 0,
  `occupancy_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `total_users` INT NOT NULL DEFAULT 0,
  `pending_docs` INT NOT NULL DEFAULT 0,
  `pending_payments` INT NOT NULL DEFAULT 0,
  `day_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `week_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_hub_metrics_hub` (`hub_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1. Bookings: financial separation, refund & cancellation metadata, monthly split
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'driver_charges') = 0,
  'ALTER TABLE `bookings` ADD COLUMN `driver_charges` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `driver_rate`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'extra_charges') = 0,
  'ALTER TABLE `bookings` ADD COLUMN `extra_charges` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `base_amount`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'refund_amount') = 0,
  'ALTER TABLE `bookings` ADD COLUMN `refund_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `remaining_balance`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'refund_status') = 0,
  'ALTER TABLE `bookings` ADD COLUMN `refund_status` VARCHAR(64) DEFAULT NULL AFTER `payment_status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'cancellation_reason') = 0,
  'ALTER TABLE `bookings` ADD COLUMN `cancellation_reason` VARCHAR(255) DEFAULT NULL AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'monthly_revenue_split') = 0,
  'ALTER TABLE `bookings` ADD COLUMN `monthly_revenue_split` TEXT DEFAULT NULL AFTER `security_deposit`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Payments: refund tracking columns (if migrating an older payments table)
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'refund_amount') = 0,
  'ALTER TABLE `payments` ADD COLUMN `refund_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'refund_reason') = 0,
  'ALTER TABLE `payments` ADD COLUMN `refund_reason` VARCHAR(255) DEFAULT NULL AFTER `refund_amount`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. kpi_hub_metrics: scheduled_bookings, completed_trips, maintenance_fleet
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kpi_hub_metrics' AND COLUMN_NAME = 'scheduled_bookings') = 0,
  'ALTER TABLE `kpi_hub_metrics` ADD COLUMN `scheduled_bookings` INT NOT NULL DEFAULT 0 AFTER `active_trips`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kpi_hub_metrics' AND COLUMN_NAME = 'completed_trips') = 0,
  'ALTER TABLE `kpi_hub_metrics` ADD COLUMN `completed_trips` INT NOT NULL DEFAULT 0 AFTER `scheduled_bookings`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kpi_hub_metrics' AND COLUMN_NAME = 'maintenance_fleet') = 0,
  'ALTER TABLE `kpi_hub_metrics` ADD COLUMN `maintenance_fleet` INT NOT NULL DEFAULT 0 AFTER `available_fleet`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Host vehicle payout model columns on partner_cars and vehicles
SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'partner_cars' AND COLUMN_NAME = 'payout_model') = 0,
  'ALTER TABLE `partner_cars` ADD COLUMN `payout_model` VARCHAR(32) NOT NULL DEFAULT ''revenue_share'' AFTER `expected_price`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'partner_cars' AND COLUMN_NAME = 'fixed_monthly_amount') = 0,
  'ALTER TABLE `partner_cars` ADD COLUMN `fixed_monthly_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `payout_model`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'partner_cars' AND COLUMN_NAME = 'revenue_share_pct') = 0,
  'ALTER TABLE `partner_cars` ADD COLUMN `revenue_share_pct` DECIMAL(5,2) NOT NULL DEFAULT 60.00 AFTER `fixed_monthly_amount`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicles' AND COLUMN_NAME = 'payout_model') = 0,
  'ALTER TABLE `vehicles` ADD COLUMN `payout_model` VARCHAR(32) NOT NULL DEFAULT ''revenue_share'' AFTER `owner_name`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicles' AND COLUMN_NAME = 'fixed_monthly_amount') = 0,
  'ALTER TABLE `vehicles` ADD COLUMN `fixed_monthly_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `payout_model`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
