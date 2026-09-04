-- ============================================================
-- MIGRATION: Add JWT Authentication Columns to users table
-- Run this BEFORE deploying the new auth endpoints
-- ============================================================

SET NAMES utf8mb4;

-- Add JWT auth columns if they don't exist
ALTER TABLE `users` 
ADD COLUMN IF NOT EXISTS `password_hash` VARCHAR(255) DEFAULT NULL COMMENT 'bcrypt hashed password' AFTER `name`,
ADD COLUMN IF NOT EXISTS `refresh_token` VARCHAR(1024) DEFAULT NULL COMMENT 'JWT refresh token for token rotation' AFTER `password_hash`,
ADD COLUMN IF NOT EXISTS `last_login_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Track last login time' AFTER `updated_at`,
ADD INDEX IF NOT EXISTS `idx_users_refresh_token` (`refresh_token`);

-- Optional: Backfill phone field if missing
ALTER TABLE `users` 
MODIFY COLUMN `phone` VARCHAR(32) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `phone` VARCHAR(32) DEFAULT NULL;

-- Verification of schema change
-- Run this to confirm columns were added:
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME='users' AND TABLE_SCHEMA='u303150498_carRentpe'
-- ORDER BY ORDINAL_POSITION;
