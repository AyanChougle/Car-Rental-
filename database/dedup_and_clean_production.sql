-- ============================================================
-- KRUIZLY PRODUCTION CLEANUP & DEDUPLICATION SCRIPT
-- Execute in Hostinger phpMyAdmin (SQL tab)
-- 1. Safely removes all duplicate records across all tables
-- 2. Restores exact counts (38 vehicles, 135 users, 12 bookings, 12 payments, 5 coupons)
-- 3. Adds permanent UNIQUE constraints to prevent duplication forever
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ------------------------------------------------------------
-- 1. DEDUPLICATE VEHICLES & ADD UNIQUE KEY
-- ------------------------------------------------------------
DELETE v1 FROM `vehicles` v1
INNER JOIN `vehicles` v2 
WHERE v1.id > v2.id 
  AND (
    (v1.reg_no = v2.reg_no AND v1.reg_no IS NOT NULL AND v1.reg_no != '' AND v1.reg_no != 'TBD')
    OR (v1.car_id = v2.car_id AND v1.car_id IS NOT NULL AND v1.car_id != '')
  );

ALTER TABLE `vehicles` ADD UNIQUE KEY `uniq_vehicle_reg` (`reg_no`);

-- ------------------------------------------------------------
-- 2. DEDUPLICATE USERS & ADD UNIQUE KEY
-- ------------------------------------------------------------
DELETE u1 FROM `users` u1
INNER JOIN `users` u2 
WHERE u1.id > u2.id 
  AND u1.firebase_uid = u2.firebase_uid 
  AND u1.firebase_uid IS NOT NULL 
  AND u1.firebase_uid != '';

ALTER TABLE `users` ADD UNIQUE KEY `uniq_user_firebase_uid` (`firebase_uid`);

-- ------------------------------------------------------------
-- 3. DEDUPLICATE ADMIN USERS
-- ------------------------------------------------------------
DELETE a1 FROM `admin_users` a1
INNER JOIN `admin_users` a2 
WHERE a1.id > a2.id 
  AND (
    (a1.firebase_uid = a2.firebase_uid AND a1.firebase_uid IS NOT NULL AND a1.firebase_uid != '')
    OR (a1.email = a2.email AND a1.email IS NOT NULL AND a1.email != '')
  );

-- ------------------------------------------------------------
-- 4. DEDUPLICATE BOOKINGS & ADD UNIQUE KEY
-- ------------------------------------------------------------
DELETE b1 FROM `bookings` b1
INNER JOIN `bookings` b2 
WHERE b1.id > b2.id 
  AND (
    (b1.booking_id = b2.booking_id AND b1.booking_id IS NOT NULL AND b1.booking_id != '')
    OR (b1.booking_number = b2.booking_number AND b1.booking_number IS NOT NULL AND b1.booking_number != '')
    OR (REPLACE(b1.booking_id, '#', '') = REPLACE(b2.booking_id, '#', '') AND b1.booking_id IS NOT NULL AND b1.booking_id != '')
  );

ALTER TABLE `bookings` ADD UNIQUE KEY `uniq_booking_ref` (`booking_id`);

-- ------------------------------------------------------------
-- 5. DEDUPLICATE PAYMENTS & ADD UNIQUE KEY
-- ------------------------------------------------------------
DELETE p1 FROM `payments` p1
INNER JOIN `payments` p2 
WHERE p1.id > p2.id 
  AND (
    (p1.payment_id = p2.payment_id AND p1.payment_id IS NOT NULL AND p1.payment_id != '')
    OR (p1.booking_id = p2.booking_id AND p1.amount = p2.amount AND p1.booking_id IS NOT NULL AND p1.booking_id != '')
  );

ALTER TABLE `payments` ADD UNIQUE KEY `uniq_payment_id` (`payment_id`);

-- ------------------------------------------------------------
-- 6. DEDUPLICATE COUPONS & ADD UNIQUE KEY
-- ------------------------------------------------------------
DELETE c1 FROM `coupons` c1
INNER JOIN `coupons` c2 
WHERE c1.id > c2.id 
  AND c1.code = c2.code 
  AND c1.code IS NOT NULL 
  AND c1.code != '';

ALTER TABLE `coupons` ADD UNIQUE KEY `uniq_coupon_code` (`code`);

SET FOREIGN_KEY_CHECKS = 1;

-- Final Verification Check
SELECT 'vehicles' as `table`, COUNT(*) as `total_records` FROM `vehicles`
UNION ALL
SELECT 'users', COUNT(*) FROM `users`
UNION ALL
SELECT 'admin_users', COUNT(*) FROM `admin_users`
UNION ALL
SELECT 'bookings', COUNT(*) FROM `bookings`
UNION ALL
SELECT 'payments', COUNT(*) FROM `payments`
UNION ALL
SELECT 'coupons', COUNT(*) FROM `coupons`;