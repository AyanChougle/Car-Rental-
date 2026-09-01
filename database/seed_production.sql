-- ============================================================
-- KRUIZLY PRODUCTION SEED DATA
-- ============================================================

SET NAMES utf8mb4;

-- 1. VEHICLES CATALOG
INSERT INTO `vehicles` (`reg_no`, `brand`, `model`, `year`, `category`, `transmission`, `fuel`, `seats`, `price_day`, `price_hour`, `driver_price`, `security_deposit`, `free_km`, `extra_km`, `location`, `available`, `status`, `gallery`) VALUES
('MH-04-AB-1234', 'Mahindra', 'XUV 7XO', 2024, 'suv', 'Automatic', 'Diesel', 7, 3500.00, 146.00, 2000.00, 3000.00, 250, 15.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-46-AZ-5522', 'Mahindra', 'Scorpio N', 2024, 'suv', 'Automatic', 'Diesel', 7, 3200.00, 133.00, 2000.00, 3000.00, 250, 14.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-03-CD-9090', 'Mahindra', 'Thar Roxx', 2024, 'suv', 'Manual', 'Diesel', 5, 3000.00, 125.00, 2000.00, 3000.00, 250, 14.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-02-EF-3456', 'Toyota', 'Fortuner Legender', 2024, 'luxury', 'Automatic', 'Diesel', 7, 6500.00, 271.00, 2500.00, 5000.00, 250, 25.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-43-XY-1010', 'Toyota', 'Innova Hycross', 2024, 'mpv', 'Automatic', 'Hybrid', 8, 4200.00, 175.00, 2000.00, 3000.00, 250, 18.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-01-GH-7890', 'Hyundai', 'Creta', 2024, 'suv', 'Automatic', 'Petrol', 5, 2400.00, 100.00, 1800.00, 2000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-12-IJ-2345', 'Kia', 'Seltos', 2024, 'suv', 'Automatic', 'Diesel', 5, 2500.00, 104.00, 1800.00, 2000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-14-KL-6789', 'Maruti', 'Grand Vitara', 2024, 'suv', 'Automatic', 'Hybrid', 5, 2200.00, 92.00, 1800.00, 2000.00, 250, 11.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-05-MN-4321', 'Hyundai', 'Verna', 2024, 'sedan', 'Automatic', 'Turbo Petrol', 5, 2200.00, 92.00, 1800.00, 2000.00, 250, 11.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-48-OP-8765', 'Honda', 'City', 2024, 'sedan', 'Automatic', 'Petrol', 5, 2000.00, 83.00, 1800.00, 2000.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-09-QR-1357', 'Maruti', 'Ertiga', 2024, 'mpv', 'Automatic', 'Petrol', 7, 2100.00, 88.00, 1800.00, 2000.00, 250, 11.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-47-ST-2468', 'Tata', 'Harrier', 2024, 'suv', 'Automatic', 'Diesel', 5, 2800.00, 117.00, 2000.00, 2500.00, 250, 13.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-06-UV-9753', 'Tata', 'Safari', 2024, 'suv', 'Automatic', 'Diesel', 7, 3100.00, 129.00, 2000.00, 3000.00, 250, 14.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-43-WX-8642', 'Maruti', 'Swift', 2024, 'hatchback', 'Manual', 'Petrol', 5, 1400.00, 58.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-04-YZ-7531', 'Hyundai', 'i20', 2024, 'hatchback', 'Automatic', 'Petrol', 5, 1600.00, 67.00, 1500.00, 1500.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-02-AA-9512', 'Tata', 'Nexon', 2024, 'suv', 'Automatic', 'Petrol', 5, 1800.00, 75.00, 1800.00, 2000.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-12-BB-3579', 'Maruti', 'Brezza', 2024, 'suv', 'Automatic', 'Petrol', 5, 1800.00, 75.00, 1800.00, 2000.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-14-CC-4680', 'Kia', 'Carens', 2024, 'mpv', 'Automatic', 'Diesel', 7, 2300.00, 96.00, 1800.00, 2000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-03-DD-1593', 'Skoda', 'Slavia', 2024, 'sedan', 'Automatic', 'Petrol', 5, 2100.00, 88.00, 1800.00, 2000.00, 250, 11.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-01-EE-7539', 'Volkswagen', 'Virtus', 2024, 'sedan', 'Automatic', 'Petrol', 5, 2200.00, 92.00, 1800.00, 2000.00, 250, 11.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-46-FF-8520', 'Toyota', 'Urban Cruiser Taisor', 2024, 'suv', 'Automatic', 'Petrol', 5, 1700.00, 71.00, 1800.00, 2000.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-48-GG-9630', 'Maruti', 'Fronx', 2024, 'suv', 'Automatic', 'Petrol', 5, 1700.00, 71.00, 1800.00, 2000.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-05-HH-7410', 'Tata', 'Punch', 2024, 'suv', 'Manual', 'Petrol', 5, 1300.00, 54.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-09-II-8521', 'Hyundai', 'Exter', 2024, 'suv', 'Automatic', 'Petrol', 5, 1400.00, 58.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-47-JJ-9632', 'Maruti', 'Baleno', 2024, 'hatchback', 'Automatic', 'Petrol', 5, 1500.00, 63.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-06-KK-1478', 'Tata', 'Altroz', 2024, 'hatchback', 'Manual', 'Diesel', 5, 1500.00, 63.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-43-LL-2589', 'Maruti', 'Dzire', 2024, 'sedan', 'Automatic', 'Petrol', 5, 1600.00, 67.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-04-MM-3690', 'Honda', 'Amaze', 2024, 'sedan', 'Automatic', 'Petrol', 5, 1600.00, 67.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-02-NN-1235', 'Hyundai', 'Venue', 2024, 'suv', 'Automatic', 'Petrol', 5, 1800.00, 75.00, 1800.00, 2000.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-12-OO-2346', 'Kia', 'Sonet', 2024, 'suv', 'Automatic', 'Diesel', 5, 1800.00, 75.00, 1800.00, 2000.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-14-PP-3457', 'Toyota', 'Innova Crysta', 2024, 'mpv', 'Manual', 'Diesel', 7, 3600.00, 150.00, 2000.00, 3000.00, 250, 15.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-03-QQ-4568', 'MG', 'Hector', 2024, 'suv', 'Automatic', 'Petrol', 5, 2400.00, 100.00, 1800.00, 2000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-01-RR-5679', 'Mahindra', 'XUV 3XO', 2024, 'suv', 'Automatic', 'Turbo Petrol', 5, 1700.00, 71.00, 1800.00, 2000.00, 250, 10.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-46-SS-6780', 'Mahindra', 'Bolero Neo', 2024, 'suv', 'Manual', 'Diesel', 7, 1800.00, 75.00, 1800.00, 2000.00, 250, 11.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-48-TT-7891', 'Maruti', 'XL6', 2024, 'mpv', 'Automatic', 'Petrol', 6, 2200.00, 92.00, 1800.00, 2000.00, 250, 11.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]'),
('MH-05-UU-8902', 'Toyota', 'Glanza', 2024, 'hatchback', 'Automatic', 'Petrol', 5, 1500.00, 63.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Mercedes.png"]'),
('MH-09-VV-9013', 'Hyundai', 'Aura', 2024, 'sedan', 'Manual', 'CNG', 5, 1500.00, 63.00, 1500.00, 1500.00, 250, 9.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/Fortuner.png"]'),
('MH-47-WW-0124', 'Maruti', 'Wagon R', 2024, 'hatchback', 'Manual', 'CNG', 5, 1200.00, 50.00, 1500.00, 1500.00, 250, 8.00, 'Gavson Business Park, Ghansoli', 1, 'available', '["assets/fleet/BMW.png"]')
ON DUPLICATE KEY UPDATE
  `brand` = VALUES(`brand`),
  `model` = VALUES(`model`),
  `price_day` = VALUES(`price_day`),
  `price_hour` = VALUES(`price_hour`);

-- 2. COUPONS
INSERT INTO `coupons` (`code`, `discount_type`, `discount_value`, `min_order`, `label`, `description`, `active`, `status`) VALUES
('FIRST500', 'flat', 500.00, 0.00, '₹500 Flat Off', 'Enjoy ₹500 off on your first booking', 1, 'active'),
('KRUIZLY10', 'percentage', 10.00, 0.00, '10% Off Rental', 'Get 10% off on your ride', 1, 'active'),
('KRUIZLY20', 'percentage', 20.00, 0.00, '20% Off Rental', 'Special 20% discount on long trips', 1, 'active'),
('WELCOME100', 'flat', 100.00, 0.00, '₹100 Welcome Discount', 'Instant ₹100 discount on your booking', 1, 'active')
ON DUPLICATE KEY UPDATE
  `discount_type` = VALUES(`discount_type`),
  `discount_value` = VALUES(`discount_value`),
  `active` = VALUES(`active`);

-- 3. DEFAULT SETTINGS
INSERT INTO `settings` (`key`, `value`) VALUES
('company_name', 'KRUIZLY Car Rentals'),
('company_email', 'support@kruizly.com'),
('company_phone', '+91 91671 64547'),
('company_address', 'Gavson Business Park, Ghansoli, Navi Mumbai, Maharashtra 400701'),
('currency', 'INR')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
