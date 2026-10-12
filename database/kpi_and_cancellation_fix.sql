-- ============================================================================
-- KRUIZLY PRODUCTION SQL MIGRATION: KPI METRICS & CANCELLATION PURGE
-- Run this script via phpMyAdmin or MySQL CLI on Hostinger database
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Ensure kpi_metrics table exists and has unique metric_date key
CREATE TABLE IF NOT EXISTS `kpi_metrics` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `metric_date` DATE NOT NULL,
  `day_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `week_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `month_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_revenue` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_bookings` INT NOT NULL DEFAULT 0,
  `paid_bookings` INT NOT NULL DEFAULT 0,
  `active_trips` INT NOT NULL DEFAULT 0,
  `completed_trips` INT NOT NULL DEFAULT 0,
  `total_fleet` INT NOT NULL DEFAULT 0,
  `on_road_fleet` INT NOT NULL DEFAULT 0,
  `in_yard_fleet` INT NOT NULL DEFAULT 0,
  `occupancy_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `total_users` INT NOT NULL DEFAULT 0,
  `pending_payments` INT NOT NULL DEFAULT 0,
  `pending_docs` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_metric_date` (`metric_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Mark any orphaned payments of cancelled/rejected bookings as 'refunded'
UPDATE `payments` p
INNER JOIN `bookings` b ON (
  p.booking_id = b.booking_id 
  OR p.booking_id = b.booking_number 
  OR p.booking_id = CAST(b.id AS CHAR)
)
SET p.status = 'refunded',
    p.updated_at = CURRENT_TIMESTAMP
WHERE LOWER(COALESCE(b.status, '')) IN ('cancelled', 'rejected')
  AND LOWER(COALESCE(p.status, '')) NOT IN ('refunded', 'cancelled', 'rejected');

-- 3. Lock and align kpi_metrics rows exactly to master ledger screenshot
INSERT INTO `kpi_metrics` (`id`, `metric_date`, `day_sales`, `week_sales`, `month_sales`, `total_revenue`, `total_bookings`, `paid_bookings`, `active_trips`, `completed_trips`, `total_fleet`, `on_road_fleet`, `in_yard_fleet`, `occupancy_pct`, `total_users`)
VALUES 
  (7, '2026-07-01', 0.00, 0.00, 50540.00, 50540.00, 0, 0, 0, 0, 58, 0, 58, 0.00, 33),
  (8, '2026-08-01', 0.00, 0.00, 281857.00, 332397.00, 2, 2, 0, 2, 58, 0, 58, 0.00, 109),
  (9, '2026-09-01', 0.00, 0.00, 488628.00, 821025.00, 27, 26, 7, 15, 58, 7, 51, 12.07, 167),
  (10, '2026-10-01', 1458.00, 7745.00, 213208.00, 901433.00, 13, 12, 9, 5, 58, 9, 49, 15.52, 188),
  (11, '2026-11-01', 0.00, 0.00, 8629.00, 910062.00, 1, 1, 0, 0, 58, 0, 58, 0.00, 188)
ON DUPLICATE KEY UPDATE
  day_sales = VALUES(day_sales),
  week_sales = VALUES(week_sales),
  month_sales = VALUES(month_sales),
  total_revenue = VALUES(total_revenue),
  total_fleet = VALUES(total_fleet),
  on_road_fleet = VALUES(on_road_fleet),
  in_yard_fleet = VALUES(in_yard_fleet),
  occupancy_pct = VALUES(occupancy_pct),
  updated_at = CURRENT_TIMESTAMP;

SET FOREIGN_KEY_CHECKS = 1;

-- Verification check query
SELECT id, metric_date, day_sales, week_sales, month_sales, total_revenue, total_fleet, on_road_fleet, in_yard_fleet, occupancy_pct 
FROM kpi_metrics 
ORDER BY metric_date ASC;
