-- ============================================================
-- KRUIZLY PRODUCTION MYSQL DATABASE SCHEMA
-- Hostinger MySQL Architecture
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  age INT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'customer',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  license_status VARCHAR(50) NOT NULL DEFAULT 'not_submitted',
  aadhar_status VARCHAR(50) NOT NULL DEFAULT 'not_submitted',
  pan_status VARCHAR(50) NOT NULL DEFAULT 'not_submitted',
  ip_address VARCHAR(100) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_firebase_uid (firebase_uid),
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. VEHICLES (FLEET)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reg_no VARCHAR(50) NOT NULL UNIQUE,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  year INT NULL,
  fuel VARCHAR(50) NULL,
  transmission VARCHAR(50) NULL,
  seats INT NOT NULL DEFAULT 5,
  bags INT NOT NULL DEFAULT 2,
  price_day DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  price_hour DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  driver_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  security_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  free_km INT NOT NULL DEFAULT 250,
  extra_km DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  location VARCHAR(255) NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  icon VARCHAR(100) NOT NULL DEFAULT '🚘',
  commission DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  odometer VARCHAR(50) NOT NULL DEFAULT 'pending',
  tracker_id VARCHAR(100) NULL,
  tracking VARCHAR(50) NOT NULL DEFAULT 'pending',
  last_service VARCHAR(100) NOT NULL DEFAULT 'pending',
  gallery JSON NULL,
  updated_by VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vehicles_reg_no (reg_no),
  INDEX idx_vehicles_category (category),
  INDEX idx_vehicles_status (status),
  INDEX idx_vehicles_available (available)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. BOOKINGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(100) NOT NULL UNIQUE,
  booking_number VARCHAR(100) NULL,
  user_id INT NULL,
  firebase_uid VARCHAR(128) NOT NULL,
  user_name VARCHAR(255) NULL,
  user_email VARCHAR(255) NULL,
  user_phone VARCHAR(50) NULL,
  car_id VARCHAR(100) NULL,
  vehicle_name VARCHAR(255) NULL,
  vehicle_reg VARCHAR(50) NULL,
  vehicle_category VARCHAR(50) NULL,
  pickup_date VARCHAR(100) NOT NULL,
  drop_date VARCHAR(100) NOT NULL,
  pickup_location VARCHAR(255) NULL,
  drop_location VARCHAR(255) NULL,
  duration VARCHAR(100) NULL,
  days INT NOT NULL DEFAULT 1,
  hours INT NOT NULL DEFAULT 24,
  with_driver TINYINT(1) NOT NULL DEFAULT 0,
  base_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  day_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  driver_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  driver_hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  insurance_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  coupon_code VARCHAR(100) NULL,
  coupon_discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  final_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  security_deposit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_plan VARCHAR(50) NOT NULL DEFAULT 'full',
  payment_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  advance_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  remaining_balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  remaining_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'upi',
  payment_mode VARCHAR(50) NULL,
  payment_ref VARCHAR(255) NULL,
  payment_status VARCHAR(50) NOT NULL DEFAULT 'pending_payment',
  status VARCHAR(50) NOT NULL DEFAULT 'pending_payment',
  booking_status VARCHAR(50) NOT NULL DEFAULT 'pending_payment',
  payment_screenshot_media_id VARCHAR(100) NULL,
  payment_screenshot_category VARCHAR(100) NULL,
  payment_screenshot_url LONGTEXT NULL,
  payment_submitted_at TIMESTAMP NULL,
  payment_submitted_by VARCHAR(128) NULL,
  payment_verified_at TIMESTAMP NULL,
  payment_verified_by VARCHAR(128) NULL,
  pickup_status VARCHAR(50) NULL,
  pickup_at TIMESTAMP NULL,
  pickup_handled_by VARCHAR(128) NULL,
  pickup_notes TEXT NULL,
  pickup_odometer VARCHAR(50) NULL,
  pickup_fuel_level VARCHAR(50) NULL,
  pickup_fastag_balance VARCHAR(50) NULL,
  pickup_payment_collected DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pickup_payment_collected_at TIMESTAMP NULL,
  pickup_payment_collected_by VARCHAR(128) NULL,
  start_odometer VARCHAR(50) NULL,
  end_odometer VARCHAR(50) NULL,
  start_fastag VARCHAR(50) NULL,
  return_fastag VARCHAR(50) NULL,
  return_inspection JSON NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bookings_booking_id (booking_id),
  INDEX idx_bookings_firebase_uid (firebase_uid),
  INDEX idx_bookings_user_id (user_id),
  INDEX idx_bookings_payment_status (payment_status),
  INDEX idx_bookings_status (status),
  INDEX idx_bookings_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(100) NOT NULL,
  user_id INT NULL,
  firebase_uid VARCHAR(128) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  method VARCHAR(50) NOT NULL DEFAULT 'upi',
  payment_gateway VARCHAR(50) NOT NULL DEFAULT 'manual_upi',
  gateway_order_id VARCHAR(150) NULL,
  gateway_payment_id VARCHAR(150) NULL,
  gateway_signature VARCHAR(255) NULL,
  utr VARCHAR(100) NULL,
  screenshot_media_id INT NULL,
  screenshot_url LONGTEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
  rejection_reason TEXT NULL,
  verified_at TIMESTAMP NULL,
  verified_by VARCHAR(128) NULL,
  refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  refund_reason TEXT NULL,
  refund_ref VARCHAR(150) NULL,
  metadata JSON NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payments_booking_id (booking_id),
  INDEX idx_payments_firebase_uid (firebase_uid),
  INDEX idx_payments_utr (utr),
  INDEX idx_payments_status (status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. COUPONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL DEFAULT 'flat',
  discount_type VARCHAR(50) NOT NULL DEFAULT 'flat',
  discount_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  min_order DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  max_discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  label VARCHAR(255) NULL,
  description TEXT NULL,
  usage_limit INT NOT NULL DEFAULT 0,
  used_count INT NOT NULL DEFAULT 0,
  valid_from TIMESTAMP NULL,
  valid_until TIMESTAMP NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_coupons_code (code),
  INDEX idx_coupons_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. COUPON USAGE (STRICT 1 USER PER COUPON ENFORCEMENT)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  coupon_id INT NOT NULL,
  coupon_code VARCHAR(50) NOT NULL,
  user_id INT NULL,
  firebase_uid VARCHAR(128) NOT NULL,
  booking_id VARCHAR(100) NOT NULL,
  discount_applied DECIMAL(10,2) NOT NULL,
  used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_coupon (firebase_uid, coupon_code),
  INDEX idx_coupon_usage_coupon_id (coupon_id),
  INDEX idx_coupon_usage_booking_id (booking_id),
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. VERIFICATION (KYC DOCUMENTS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification (
  id INT AUTO_INCREMENT PRIMARY KEY,
  verification_id VARCHAR(100) NOT NULL UNIQUE,
  user_id INT NULL,
  firebase_uid VARCHAR(128) NOT NULL,
  full_name VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  license_number VARCHAR(100) NULL,
  license_front_media_id INT NULL,
  license_back_media_id INT NULL,
  license_status VARCHAR(50) NOT NULL DEFAULT 'not_submitted',
  aadhar_number VARCHAR(100) NULL,
  aadhar_front_media_id INT NULL,
  aadhar_back_media_id INT NULL,
  aadhar_status VARCHAR(50) NOT NULL DEFAULT 'not_submitted',
  pan_number VARCHAR(100) NULL,
  pan_front_media_id INT NULL,
  pan_back_media_id INT NULL,
  pan_status VARCHAR(50) NOT NULL DEFAULT 'not_submitted',
  selfie_media_id INT NULL,
  overall_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT NULL,
  verified_at TIMESTAMP NULL,
  verified_by VARCHAR(128) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_verification_firebase_uid (firebase_uid),
  INDEX idx_verification_overall_status (overall_status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. MEDIA (FILE UPLOADS ON HOSTINGER FILESYSTEM)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  firebase_uid VARCHAR(128) NOT NULL,
  booking_id VARCHAR(100) NULL,
  verification_id VARCHAR(100) NULL,
  vehicle_id VARCHAR(100) NULL,
  invoice_id VARCHAR(100) NULL,
  category VARCHAR(100) NOT NULL,
  doc_type VARCHAR(100) NULL,
  doc_side VARCHAR(50) NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_media_firebase_uid (firebase_uid),
  INDEX idx_media_booking_id (booking_id),
  INDEX idx_media_verification_id (verification_id),
  INDEX idx_media_category (category),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. INVOICES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id VARCHAR(100) NOT NULL UNIQUE,
  invoice_number VARCHAR(100) NOT NULL UNIQUE,
  booking_id VARCHAR(100) NOT NULL,
  raw_booking_id VARCHAR(100) NULL,
  user_id INT NULL,
  firebase_uid VARCHAR(128) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'BOOKING',
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  invoice_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  customer JSON NOT NULL,
  vehicle JSON NOT NULL,
  rental JSON NOT NULL,
  charges JSON NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tax DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  balance_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_plan VARCHAR(50) NOT NULL DEFAULT 'full',
  payment_status VARCHAR(50) NOT NULL DEFAULT 'paid',
  payment_mode VARCHAR(50) NULL,
  payment_ref VARCHAR(255) NULL,
  security_deposit JSON NULL,
  notes TEXT NULL,
  pdf_filename VARCHAR(255) NULL,
  pdf_path TEXT NULL,
  pdf_generated_at TIMESTAMP NULL,
  email_recipient VARCHAR(255) NULL,
  email_status VARCHAR(50) NOT NULL DEFAULT 'NOT_SENT',
  email_message_id VARCHAR(255) NULL,
  email_sent_at TIMESTAMP NULL,
  email_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_invoices_invoice_id (invoice_id),
  INDEX idx_invoices_invoice_number (invoice_number),
  INDEX idx_invoices_booking_id (booking_id),
  INDEX idx_invoices_firebase_uid (firebase_uid),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 10. INVOICE ITEMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  item_type VARCHAR(50) NOT NULL DEFAULT 'charge',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoice_items_invoice_id (invoice_id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 11. PARTNER CARS (HOST CAR LISTINGS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_cars (
  id INT AUTO_INCREMENT PRIMARY KEY,
  listing_id VARCHAR(100) NOT NULL UNIQUE,
  user_id INT NULL,
  firebase_uid VARCHAR(128) NOT NULL,
  owner_name VARCHAR(255) NULL,
  owner_email VARCHAR(255) NULL,
  owner_phone VARCHAR(50) NULL,
  city VARCHAR(100) NULL,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  year INT NULL,
  transmission VARCHAR(50) NULL,
  fuel VARCHAR(50) NULL,
  reg_no VARCHAR(50) NULL,
  expected_rent_per_day DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  photos JSON NULL,
  documents JSON NULL,
  rejection_reason TEXT NULL,
  approved_at TIMESTAMP NULL,
  approved_by VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_partner_cars_listing_id (listing_id),
  INDEX idx_partner_cars_firebase_uid (firebase_uid),
  INDEX idx_partner_cars_status (status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 12. CONTACT MESSAGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  subject VARCHAR(255) NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'unread',
  ip_address VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 13. ADMIN USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  permissions JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admin_users_uid (firebase_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 14. AUDIT LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_firebase_uid VARCHAR(128) NOT NULL,
  actor_role VARCHAR(50) NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NOT NULL,
  details JSON NULL,
  ip_address VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_actor (actor_firebase_uid),
  INDEX idx_audit_action (action),
  INDEX idx_audit_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
