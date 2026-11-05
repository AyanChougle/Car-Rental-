-- ============================================================================
-- KRUIZLY PRODUCTION SQL MIGRATION: MONTHLY REVENUE SPLIT ATTRIBUTION
-- Run this script via phpMyAdmin or MySQL CLI on Hostinger database
-- ============================================================================

SET NAMES utf8mb4;

-- 1. Ensure monthly_revenue_split column exists in bookings table
ALTER TABLE `bookings` 
ADD COLUMN IF NOT EXISTS `monthly_revenue_split` JSON NULL AFTER `security_deposit`;

-- 2. Verify schema
SHOW COLUMNS FROM `bookings` LIKE 'monthly_revenue_split';
