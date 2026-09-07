-- ============================================================
-- KRUIZLY: BACKFILL BOOKINGS FROM PAYMENTS TABLE
-- Run this query in phpMyAdmin SQL tab to backfill all bookings
-- ============================================================

INSERT INTO `bookings` (
    `booking_id`, `booking_number`, `user_id`, `firebase_uid`, `user_name`, `user_email`, `user_phone`,
    `vehicle_reg`, `vehicle_name`, `vehicle_category`, `pickup_date`, `drop_date`,
    `duration`, `days`, `hours`, `with_driver`, `base_amount`, `total_amount`, `final_amount`,
    `advance_amount`, `remaining_balance`, `remaining_amount`, `payment_plan`, `payment_status`,
    `status`, `booking_status`, `location`, `security_deposit`, `payment_ref`, `payment_screenshot_url`, `created_at`
)
SELECT 
    p.booking_id,
    p.booking_id AS booking_number,
    u.id AS user_id,
    p.firebase_uid,
    COALESCE(NULLIF(u.name, ''), 'Customer') AS user_name,
    COALESCE(NULLIF(u.email, ''), '') AS user_email,
    u.phone AS user_phone,
    COALESCE((SELECT reg_no FROM vehicles LIMIT 1), 'BMW-320D') AS vehicle_reg,
    COALESCE((SELECT CONCAT(brand, ' ', model) FROM vehicles LIMIT 1), 'BMW 3 Series') AS vehicle_name,
    COALESCE((SELECT category FROM vehicles LIMIT 1), 'Luxury Sedan') AS vehicle_category,
    p.created_at AS pickup_date,
    DATE_ADD(p.created_at, INTERVAL 1 DAY) AS drop_date,
    '1 Day' AS duration,
    1 AS days,
    24 AS hours,
    0 AS with_driver,
    p.amount AS base_amount,
    p.amount AS total_amount,
    p.amount AS final_amount,
    CASE WHEN p.amount <= 500 THEN p.amount ELSE 0.00 END AS advance_amount,
    0.00 AS remaining_balance,
    0.00 AS remaining_amount,
    CASE WHEN p.amount <= 500 THEN 'advance' ELSE 'full' END AS payment_plan,
    CASE 
        WHEN p.status = 'verified' AND p.amount <= 500 THEN 'advance_paid'
        WHEN p.status = 'verified' THEN 'paid'
        WHEN p.status = 'rejected' THEN 'rejected'
        ELSE 'pending_verification'
    END AS payment_status,
    CASE 
        WHEN p.status = 'verified' THEN 'confirmed'
        WHEN p.status = 'rejected' THEN 'cancelled'
        ELSE 'pending_verification'
    END AS status,
    CASE 
        WHEN p.status = 'verified' THEN 'confirmed'
        WHEN p.status = 'rejected' THEN 'cancelled'
        ELSE 'pending_verification'
    END AS booking_status,
    'Gavson Business Park, Ghansoli' AS location,
    0.00 AS security_deposit,
    COALESCE(p.utr, p.payment_ref) AS payment_ref,
    p.screenshot_url AS payment_screenshot_url,
    p.created_at
FROM `payments` p
LEFT JOIN `bookings` b ON (p.booking_id = b.booking_id OR p.booking_id = b.booking_number)
LEFT JOIN `users` u ON p.firebase_uid = u.firebase_uid
WHERE b.id IS NULL
ON DUPLICATE KEY UPDATE 
    payment_status = VALUES(payment_status),
    status = VALUES(status),
    booking_status = VALUES(booking_status);
