-- ============================================================
-- KRUIZLY PRODUCTION MIGRATION / SEED EXPORT
-- Converted from KRUIZLY_Database_Export_Merged_2026-09-09.xlsx
-- Fully compatible with Hostinger MySQL 8.x / phpMyAdmin
-- Automatically synchronizes missing table columns
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ------------------------------------------------------------
-- 0. SAFE SCHEMA SYNCHRONIZATION (Idempotent column upgrades)
-- ------------------------------------------------------------
SET @dbname = DATABASE();

-- Add vehicles missing columns if not present
SET @sql_veh = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'vehicles' AND COLUMN_NAME = 'car_id') = 0,
  'ALTER TABLE `vehicles` 
     ADD COLUMN `car_id` VARCHAR(32) DEFAULT NULL AFTER `id`,
     ADD COLUMN `hub` VARCHAR(255) NOT NULL DEFAULT ''Gavson Business Park, Ghansoli'' AFTER `extra_km`,
     ADD COLUMN `acquisition_type` VARCHAR(64) NOT NULL DEFAULT ''Partner'' AFTER `location`,
     ADD COLUMN `owner_name` VARCHAR(128) DEFAULT NULL AFTER `acquisition_type`,
     ADD COLUMN `acquisition_date` DATE DEFAULT NULL AFTER `owner_name`,
     ADD COLUMN `is_active_fleet` TINYINT(1) NOT NULL DEFAULT 1 AFTER `status`',
  'SELECT 1'
));
PREPARE stmt_veh FROM @sql_veh;
EXECUTE stmt_veh;
DEALLOCATE PREPARE stmt_veh;

START TRANSACTION;

-- ------------------------------------------------------------
-- 1. USERS (135 records)
-- ------------------------------------------------------------
INSERT INTO `users` (
  `id`, `firebase_uid`, `email`, `name`, `phone`, `age`, 
  `role`, `status`, `license_status`, `aadhar_status`, `pan_status`, `created_at`
) VALUES
(1, 'cust_roshan_more', 'roshanmo@kruizly.com', 'Roshan More', '7507323988', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(2, 'cust_vivek_hatkamkar', 'vivekhatk@kruizly.com', 'Vivek Anant Hatkamkar', '8355912195', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(3, 'cust_arun_ahuja', 'arun69ahu@gmail.com', 'Arun Ahuja', '7030914115', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(4, 'cust_akash_sarkar', 'aakki7077@gmail.com', 'Akash Sarkar', '8777355520', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(5, 'cust_kunal_vichave', 'kunalvich@gmail.com', 'Kunal Vichave', '7387961727', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(6, 'cust_dipesh_bhoir', 'dipeshbhoir@gmail.com', 'Dipesh Bhoir', '9527788995', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(7, 'cust_krishna_velega', 'krishnavelega@gmail.com', 'Krishna Velega', '9063281666', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(8, 'cust_rushikesh_shimpi', 'rushikesh@gmail.com', 'Rushikesh Shimpi', '9324855850', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(9, 'cust_shaikh_sarfaraz', 'Sarshaikh@gmail.com', 'Shaikh Sarfaraz', '8928073455', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(10, 'cust_shaikh_sarfaraz_2', 'Sarshaikh@gmail.com', 'Shaikh Sarfaraz', '8928073455', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-09 06:22:23'),
(11, '2RzZfetVnmdHQa119Mddj80bPrs2', 'carrentpedatabase@gmail.com', 'car database', NULL, 21, 'admin', 'active', 'verified', 'verified', 'verified', '2026-09-04 07:23:21'),
(12, 'XHt1anv8Eyei92DEPIFfbBSgA402', 'kruizlyexecutive@gmail.com', 'Chaitanya Patil', '8291588796', NULL, 'executive', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-07 10:24:42'),
(13, '0hyIE7QMA6fXEZ56EcrCeXPw7ir1', 'pranavsawant012@gmail.com', '96 _Sawant Pranav', '8356881581', 27, 'admin', 'active', 'verified', 'verified', 'verified', '2026-09-05 05:52:50'),
(14, 'legacy_wp_1', 'ferozshaikh93240@gmail.com', 'ferozshaikh93240@gmail.com', NULL, NULL, 'admin', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-06-15 05:42:09'),
(15, 'legacy_wp_33', 'zipcars018@gmail.com', 'Car rent pe Car rent pe', NULL, NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-20 10:51:58'),
(16, 'legacy_wp_35', 'shubhamkumarsh294@gmail.com', 'Shubham Kumar', '919625272744', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-07-20 10:59:51'),
(17, 'legacy_wp_36', 'mithil.satam94@gmail.com', 'Mithil Satam', '917304003303', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-07-20 11:03:03'),
(18, 'legacy_wp_37', 'akashtyagi63@gmail.com', 'Akash Tyagi', NULL, NULL, 'admin', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-20 11:23:00'),
(19, 'legacy_wp_38', 'saif@diallo.co.in', 'Saif Shaikh', NULL, NULL, 'admin', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-20 11:23:48'),
(20, 'legacy_na_40', 'prathuishprasad02@gmail.com', 'Ananthu S sekhar', '8590963855', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-22 08:28:53'),
(21, 'legacy_na_41', 'sidharthmahapure7458@gmail.com', 'Nitin Mahapure', '08530529448', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-22 09:16:55'),
(22, 'legacy_na_42', 'yashagarwal644@gmail.com', 'Yash Agarwal', '8591138591', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-22 21:48:31'),
(23, 'legacy_wp_45', 'zc_917736096782@phone.carrentpe.in', 'Akshay T R', '917736096782', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-07-24 16:03:10'),
(24, 'legacy_wp_47', 'malviyamilan05@gmail.com', 'Milan Malviya', '7878197722', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 08:15:04'),
(25, 'legacy_wp_48', 'kanav7482@gmail.com', 'Kanav Khurana', '7417019079', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 15:30:56'),
(26, 'legacy_wp_49', 'kartavyapasi04032001@gmail.com', 'Kartavya Pasi', '8080825515', NULL, 'customer', 'active', 'verified', 'not_submitted', 'verified', '2026-07-25 16:04:02'),
(27, 'legacy_wp_50', 'rockstarmh2266@gmail.com', 'Rahil Abdul Salam tambe', '7738712932', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-07-26 08:32:20'),
(28, 'legacy_wp_51', 'zc_919867049194@phone.carrentpe.in', 'Santosh kate', '919867049194', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-26 19:37:03'),
(29, 'legacy_wp_55', 'chiragreddy2707@gmail.com', 'Chirag Reddy', '09136854914', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-27 15:48:59'),
(30, 'legacy_wp_56', 'zc_919351445570@phone.carrentpe.in', 'Ajay Vishwakarma', '919351445570', NULL, 'host', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-29 12:33:45'),
(31, 'legacy_wp_57', 'gegeisjn@immenseignite.info', 'hwfenofywn', '13263841650', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-30 08:40:29'),
(32, 'legacy_wp_58', 'doyiwdgw@immenseignite.info', 'jwxzwrruzm', '10503116132', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-30 08:41:19'),
(33, 'legacy_wp_59', 'mmxwpess@immenseignite.info', 'wwepemnfug', '13193087188', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-30 08:43:16'),
(34, 'legacy_wp_60', 'jhavishnukant3@gmail.com', 'Anish kesharwani', '7777086766', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-07-30 10:36:36'),
(35, 'legacy_wp_61', 'zc_917004684725@phone.carrentpe.in', 'Barun Kumar', '917004684725', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-30 12:15:40'),
(36, 'legacy_wp_62', 'chunilalhirani2929@gmail.com', 'Chunilal Godara', '9892263729', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-07-30 14:18:24'),
(37, 'legacy_wp_63', '785sonim@gmail.com', 'Sonik 786', '7867881916', NULL, 'host', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-31 22:01:09'),
(38, 'legacy_wp_64', 'otapshale@gmail.com', 'Omkar Tapshale', '8898948642', NULL, 'host', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-01 05:27:11'),
(39, 'legacy_wp_65', 'jay.amesar@gmail.com', 'JAI AMESAR', '8411013781', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-08-01 08:59:50'),
(40, 'legacy_wp_66', 'zc_918652896388@phone.carrentpe.in', 'Khalid Khan', '918652896388', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-01 15:54:45'),
(41, 'legacy_wp_67', 'sagar75karange@gmail.com', 'Sagar Karange', '7021580963', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-01 15:59:10'),
(42, 'legacy_wp_68', 'zc_919870627509@phone.carrentpe.in', 'Loukik Rane', '919870627509', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-02 01:35:01'),
(43, 'legacy_wp_69', 'sbamale31@gmail.com', 'Shailesh Amale', '7977088027', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-02 05:22:53'),
(44, 'legacy_wp_70', 'atuljadhav242001@gmail.com', 'Atul Bhika Jadhav', '8956947052', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-02 07:12:45'),
(45, 'legacy_wp_71', 'aditilotankar03@gmail.com', 'Aditi Lotankar', '9867539466', NULL, 'host', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-02 13:37:15'),
(46, 'legacy_wp_72', 'zc_911234567890@phone.carrentpe.in', 'Car Rent Pe 7890', '911234567890', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-03 08:01:38'),
(47, 'legacy_wp_73', 'deepshirsat9211@gmail.com', 'DEEP SHIRSAT', '7559142366', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-03 16:05:37'),
(48, 'legacy_wp_74', 'ashwinidivekar13@gmail.com', 'Ved divekar', '9082836371', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-04 08:17:51'),
(49, 'legacy_wp_75', 'zc_917021676756@phone.carrentpe.in', 'Prabhat', '917021676756', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-05 01:51:04'),
(50, 'legacy_wp_76', 'kundand7376@gmail.com', 'Kundan Singh', '9028076662', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-05 07:58:09'),
(51, 'SW7o8zNdDfeJkWLaNYe0l1f3bD13', 'social@diallo.co.in', 'Diallo Social', '9619152252', 52, 'host', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-05 08:24:43'),
(52, 'legacy_wp_78', 'adityapokle7@gmail.com', 'Aditya pokale', '8433595389', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-05 11:45:13'),
(53, 'legacy_wp_79', 'mayurmokal090686@gmail.com', 'Mayur Raman mokal', '9594879870', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-05 12:23:18'),
(54, 'legacy_wp_80', 'prathambhanushali455@gmail.com', 'Pratham Bhanushali', '8976616388', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-05 15:41:11'),
(55, 'legacy_wp_81', 'choudharyshakeel26@gmail.com', 'Shakeel Ahmed abdulrehman choudhary', '9819578165', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-06 04:33:33'),
(56, 'legacy_wp_82', 'ramesh3692heh@gmail.com', 'Ramesh Yadav', '8468851483', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-06 09:01:32'),
(57, 'legacy_wp_83', 'gurav.nitin3@gmail.com', 'Nitin Gurav', '9082134409', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-07 09:59:55'),
(58, 'legacy_wp_84', 'vaibhavmarathe51@gmail.com', 'Vaibhav Marathe', '8208169953', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-08-07 18:06:07'),
(59, 'legacy_wp_86', 'sindapulkit@gmail.com', 'Pulkit sinda', '9165873840', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-08 05:46:37'),
(60, 'legacy_wp_87', 'shaikanas2401@gmail.com', 'Shaik Anas', '9059312745', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-08 09:58:49'),
(61, 'legacy_wp_88', 'sohilspy042@gmail.com', 'Raj', '9569534838', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-10 07:39:38'),
(62, 'legacy_wp_89', 'faahhadd.khan@gmail.com', 'Fahad Khan', '9820018588', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-10 12:20:58'),
(63, 'legacy_wp_90', 'zc_919920244621@phone.carrentpe.in', 'Sandesh Bagde', '919920244621', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-10 19:09:40'),
(64, 'legacy_wp_91', 'tusharphad1995@gmail.com', 'Tai Tushar phad', '9136431378', NULL, 'host', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-11 11:38:38'),
(65, 'legacy_wp_92', 'abhi14309@gmail.com', 'Abhishek Tripathi', '09643381771', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-11 12:19:58'),
(66, 'legacy_wp_93', 'aniketshetye923@gmail.com', 'Aniket Shetye', '7972245139', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-11 13:45:42'),
(67, 'legacy_wp_94', 'bhoirpratham65@gmail.com', 'Pratham bhoir', '8104177313', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-12 06:28:42'),
(68, 'legacy_wp_95', 'abhisheksharma91373@gmail.com', 'Abhishek Sharma', '9137394479', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-12 07:06:22'),
(69, 'legacy_wp_96', 'mishraamarchandra792@gmail.com', 'Abhimanyu Mishra', '7985671032', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-12 11:13:45'),
(70, 'legacy_wp_97', 'dhiraj.singh220@gmail.com', 'Dhiraj Singh', '7715860449', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-12 15:16:24'),
(71, 'legacy_wp_98', 'anipawar.aniket.pawar43@gmail.com', 'Aniket Pawar', '8888636357', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-13 06:56:31'),
(72, 'legacy_wp_99', 'akshayjuikar.1102@gmail.com', 'Akshay Juikar', '919326095073', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-13 12:36:11'),
(73, 'legacy_wp_100', 'zc_919702764360@phone.carrentpe.in', 'Dhiraj', '919702764360', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-13 13:04:51'),
(74, 'legacy_wp_101', 'singhroshan19869@gmail.com', 'Roshan Singh', '7728911797', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-15 07:17:03'),
(75, 'legacy_wp_102', 'jadhavomkar3130@gmail.com', 'Omkar J', '9321404045', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-15 15:40:17'),
(76, 'legacy_wp_103', 'imu080199@gmail.com', 'Imran siraj mulla', '917387794870', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-08-17 05:52:49'),
(77, 'legacy_wp_104', 'zc_919321445570@phone.carrentpe.in', 'Ajay Vishwakarma', '919321445570', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-17 09:47:16'),
(78, 'legacy_wp_105', 'zc_918850266273@phone.carrentpe.in', 'Deepak anil jha', '918850266273', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-17 14:58:23'),
(79, 'legacy_wp_106', 'roshanmore694@gmail.com', 'Roshan jagan more', '7507323988', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-18 06:02:39'),
(80, 'legacy_wp_107', 'nagarkotishubham@gmail.com', 'SHUBHAM NAGARKOTI', '9769264232', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-18 08:08:07'),
(81, 'legacy_wp_108', 'zc_917387961727@phone.carrentpe.in', 'Kunal Vichave', '917387961727', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-19 17:35:14'),
(82, 'legacy_wp_109', '918693000584@phone.carrentpe.in', 'Nitin Gurav', '8693000584', NULL, 'customer', 'active', 'verified', 'verified', 'verified', '2026-08-20 06:31:45'),
(83, 'legacy_wp_110', 'shoebkhant491@gmail.com', 'Khan mohd shoeb', '8591437170', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-20 10:16:52'),
(84, 'legacy_wp_111', 'manoharrajpurohit03@gmail.com', 'Manohar rajpurohit', '917709619622', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-08-20 16:23:15'),
(85, 'legacy_wp_112', 'Sarshaikh12@gmail.com', 'Shaikh sarfaraz', '8928073455', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-21 13:09:56'),
(86, 'legacy_wp_113', 'kohinoortravels110@gmail.com', 'Shaikh Sarfaraz', '918928073455', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-21 16:29:27'),
(87, 'legacy_wp_114', 'snomaan.ns@gmail.com', 'Noman Shaikh', '9892955576', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-22 08:45:38'),
(88, 'legacy_wp_115', 'ashwinigunjal1588@gmail.com', 'Ashwini Dinesh Gunjal', '9664611150', NULL, 'customer', 'active', 'verified', 'not_submitted', 'verified', '2026-08-22 10:29:59'),
(89, 'legacy_wp_116', 'zc_917977548925@phone.carrentpe.in', 'Papu Pal', '917977548925', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-22 15:51:34'),
(90, 'legacy_wp_117', 'zc_919820163104@phone.carrentpe.in', 'Geetanjali Mane', '919820163104', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-23 08:00:01'),
(91, 'legacy_wp_118', 'khantausif9321@gmail.com', 'Khan', '9321637025', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-24 06:04:20'),
(92, 'legacy_wp_119', 'vivekhatkamkar8675@gmail.com', 'Vivek Anant hatkamkar', '8355912195', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-24 06:44:57'),
(93, 'legacy_wp_120', 'roshanchavan369@gmail.com', 'Roshan Chavan', '8591598099', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-24 11:08:06'),
(94, 'legacy_wp_121', 'sonurathod252@gmail.com', 'Sonu Rathod', '6363835268', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-24 16:24:23'),
(95, 'legacy_wp_122', '918652790069@phone.carrentpe.in', 'Sonu Rathod', '8652790069', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-08-24 17:42:02'),
(96, 'legacy_wp_123', 'moreganesh793@gmail.com', 'Pradeep', '9594124939', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-25 05:26:00'),
(97, 'legacy_wp_124', 'aakki7077@gmail.com', 'Akash Sarkar', '8777355520', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-08-25 07:21:36'),
(98, 'legacy_wp_125', 'sahil9552867644@gmail.com', 'Rasul akram khan', '9820996673', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-25 11:42:29'),
(99, 'legacy_wp_126', 'afreenart.7861@gmail.com', 'mohammad sajid ansari', '7498305104', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-25 13:28:47'),
(100, 'legacy_wp_127', 'arun69ahuja@gmail.com', 'Arun Ahuja', '917030914115', NULL, 'customer', 'active', 'verified', 'not_submitted', 'verified', '2026-08-25 17:14:23'),
(101, 'legacy_wp_128', 'yusufsshekh84519291@gmail.com', 'Yusuf shekh', '8451929154', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-08-26 07:10:22'),
(102, 'legacy_wp_129', 'hritikpawar83221@gmail.com', 'Hritik Pawar', '9372532819', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-26 08:57:08'),
(103, 'legacy_wp_130', 'sheraysafal00@gmail.com', 'Safal Sheray', '7065458360', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-26 10:05:26'),
(104, 'legacy_wp_131', 'mishawaari@gmail.com', 'Anas Mohammed Nasir', '08291780669', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-26 21:25:00'),
(105, 'legacy_wp_132', 'rushikeshsate1@gmail.com', 'Rushikesh Sate', '9970256590', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-27 08:47:40'),
(106, 'legacy_wp_133', 'shrivas.mayank.org@gmail.com', 'Mayank Shrivas', '9702224136', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-08-28 11:14:54'),
(107, 'legacy_wp_134', 'vikasbacche999@gmail.com', 'NARENDRA JAGTAP', '9372807773', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-29 07:33:09'),
(108, 'legacy_wp_135', 'surojitpoddar10@gmail.com', 'Surajit Poddar', '8655662201', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-08-29 08:15:33'),
(109, 'legacy_wp_136', 'kalyansinghrajput8863@gmail.com', 'Kalyan Singh Rajput', '7400325274', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-30 18:47:41'),
(110, 'legacy_wp_137', 'faizshaikh2728@gmail.com', 'Faiz Mohd Shaikh', '9967066122', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-31 05:28:48'),
(111, 'legacy_wp_138', 'aswinsuresh1657@gmail.com', 'ASWIN B S', '8593089130', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-31 08:56:29'),
(112, 'legacy_wp_139', 'Pravinmane3399@gmail.com', 'Pravin Ashok Mane', '8237993399', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-08-31 11:52:56'),
(113, 'legacy_wp_140', 'rushikeshshimpi05@gmail.com', 'Rushikesh Shimpi', '9324855850', NULL, 'customer', 'active', 'verified', 'verified', 'not_submitted', '2026-09-02 12:38:08'),
(114, 'legacy_wp_141', 'suyashpostandel0802@gmail.com', 'Suyash Postandel', '9322891470', NULL, 'customer', 'active', 'verified', 'not_submitted', 'verified', '2026-09-02 14:42:08'),
(115, 'legacy_wp_142', 'chaudhariharshad52@gmail.com', 'Harshad Chaudhari', '8355842822', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-03 09:17:44'),
(116, 'legacy_wp_143', 'dikshitkarkera03@gmail.com', 'Dikshit Karkera', '8169969606', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-09-03 10:39:49'),
(117, 'legacy_wp_144', 'bonvatechaitanya@gmail.com', 'Chaitanya Bonvate', '87673994222', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-09-03 13:21:09'),
(118, 'legacy_wp_145', 'Kubeb.shaikh@gmail.com', 'Kubeb shaikh', '89763330149', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-03 14:44:36'),
(119, 'legacy_crm_customer_1', 'aarav.sharma@example.com', 'Aarav Sharma', '9839015591', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 04:52:52'),
(120, 'legacy_crm_customer_2', 'priya.nair@example.com', 'Priya Nair', '9816719029', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 04:52:52'),
(121, 'legacy_crm_customer_3', 'rohan.mehta@example.com', 'Rohan Mehta', '9825353020', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 04:52:52'),
(122, 'legacy_crm_customer_4', 'sneha.patil@example.com', 'Sneha Patil', '9896610831', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 04:52:52'),
(123, 'legacy_crm_customer_5', 'vikram.rao@example.com', 'Vikram Rao', '9813018247', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 04:52:52'),
(124, 'legacy_crm_customer_6', 'ananya.iyer@example.com', 'Ananya Iyer', '9888193344', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 04:52:52'),
(125, 'legacy_crm_customer_7', 'karan.joshi@example.com', 'Karan Joshi', '9855047087', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 04:52:52'),
(126, 'legacy_crm_customer_8', 'meera.desai@example.com', 'Meera Desai', '9817541724', NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-07-25 04:52:52'),
(127, 'legacy_kyc_1179', 'legacy_kyc_1179@legacy.carrentpe.local', 'Kshitij', '7774819547', NULL, 'customer', 'active', 'pending', 'pending', 'not_submitted', '2026-01-01 00:00:00'),
(128, 'legacy_kyc_1402', 'legacy_kyc_1402@legacy.carrentpe.local', 'Brijbhushan Singh', '9699810889', NULL, 'customer', 'active', 'verified', 'verified', 'verified', '2026-01-01 00:00:00'),
(129, 'ntC8cOqsLmc86mKYYybbANarb2I3', 'shailumunda@gmail.com', 'shailu munda', '8601534351', 34, 'customer', 'active', 'rejected', 'not_submitted', 'not_submitted', '2026-09-07 06:28:22'),
(130, 'wPlKxMamtMZ8wOESGRV9luGE0ur2', 'carwithdriver.vikhroli@gmail.com', 'Chandrakesh Yadav', '8082788465', 39, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-07 06:28:59'),
(131, 'sLiuafS6LebyqCo8tYAnP1HkRVA2', 'ayanchougle1234@gmail.com', 'Ayan', '7208533219', 22, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-07 06:38:24'),
(132, 'JI9gqMt83eTcQAk8yie45tuTEsx1', 'pateluzer913@gmail.com', 'Uzer Patel', NULL, NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-07 07:46:03'),
(133, 'evlFZgLKKGN85upMamoHFjANYsu2', 'sayedarmaan455@gmail.com', 'Armaan Saiyed', NULL, NULL, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-07 09:13:42'),
(134, 'p0XYqoyiJ0TBz5uQbBeu2h2lfZW2', 'swanikkoli28@gmail.com', 'Swanik Koli', '8169908066', 18, 'customer', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-07 13:13:04'),
(135, 'klJJ4VQE8gMjanSxm0uX6Eg2nNG3', 'akash.t@diallo.co.in', 'akash.t', NULL, NULL, 'admin', 'active', 'not_submitted', 'not_submitted', 'not_submitted', '2026-09-07 13:38:45')
ON DUPLICATE KEY UPDATE
  `email` = VALUES(`email`),
  `name` = VALUES(`name`),
  `phone` = VALUES(`phone`),
  `role` = VALUES(`role`),
  `status` = VALUES(`status`),
  `license_status` = VALUES(`license_status`),
  `aadhar_status` = VALUES(`aadhar_status`),
  `pan_status` = VALUES(`pan_status`);

-- ------------------------------------------------------------
-- 2. ADMIN USERS (7 records)
-- ------------------------------------------------------------
INSERT INTO `admin_users` (
  `id`, `firebase_uid`, `email`, `name`, `role`, `created_at`
) VALUES
(1, '2RzZfetVnmdHQa119Mddj80bPrs2', 'carrentpedatabase@gmail.com', 'car database', 'admin', '2026-09-04 07:23:21'),
(2, 'XHt1anv8Eyei92DEPIFfbBSgA402', 'kruizlyexecutive@gmail.com', 'Chaitanya Patil', 'executive', '2026-09-07 10:24:42'),
(3, '0hyIE7QMA6fXEZ56EcrCeXPw7ir1', 'pranavsawant012@gmail.com', '96 _Sawant Pranav', 'admin', '2026-09-05 05:52:50'),
(4, 'legacy_wp_1', 'ferozshaikh93240@gmail.com', 'ferozshaikh93240@gmail.com', 'admin', '2026-06-15 05:42:09'),
(5, 'legacy_wp_37', 'akashtyagi63@gmail.com', 'Akash Tyagi', 'admin', '2026-07-20 11:23:00'),
(6, 'legacy_wp_38', 'saif@diallo.co.in', 'Saif Shaikh', 'admin', '2026-07-20 11:23:48'),
(7, 'klJJ4VQE8gMjanSxm0uX6Eg2nNG3', 'akash.t@diallo.co.in', 'akash.t', 'admin', '2026-09-07 13:38:45')
ON DUPLICATE KEY UPDATE
  `email` = VALUES(`email`),
  `name` = VALUES(`name`),
  `role` = VALUES(`role`);

-- ------------------------------------------------------------
-- 3. VEHICLES (38 records)
-- ------------------------------------------------------------
INSERT INTO `vehicles` (
  `id`, `car_id`, `reg_no`, `brand`, `model`, `year`, `category`, 
  `transmission`, `fuel`, `seats`, `bags`, `price_day`, `price_hour`, 
  `driver_price`, `security_deposit`, `free_km`, `extra_km`, 
  `hub`, `location`, `acquisition_type`, `owner_name`, `acquisition_date`, 
  `available`, `status`, `is_active_fleet`, `is_custom_fleet`, `gallery`
) VALUES
(1, 'CAT-001', 'MH04KR0101', 'BMW', '520D', 2017, 'luxury', 'Automatic', 'Diesel', 5, 2, 18000.00, 750.00, 0.00, 15000.00, 250, 60.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/BMW 520D.png"]'),
(2, 'CAT-002', 'MH04KR0102', 'Mahindra', '7XO', 2026, 'suv', 'AMT', 'Diesel', 7, 2, 9000.00, 375.00, 0.00, 7000.00, 250, 28.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra 7XO.png"]'),
(3, 'CAT-003', 'MH04KR0103', 'Tata', 'Altroz', 2024, 'economy', 'Manual', 'Petrol', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Tata Altroz.png"]'),
(4, 'CAT-004', 'MH04KR0104', 'Tata', 'Altroz', 2024, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Tata Altroz.png"]'),
(5, 'CAT-005', 'MH04KR0105', 'Hyundai', 'Aura', 2024, 'economy', 'AMT', 'Petrol', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai Aura.png"]'),
(6, 'CAT-006', 'MH04KR0106', 'Hyundai', 'Aura', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai Aura.png"]'),
(7, 'CAT-007', 'MH04KR0107', 'Maruti Suzuki', 'Baleno', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2500.00, 104.17, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Baleno.png"]'),
(8, 'CAT-008', 'MH04KR0108', 'Maruti Suzuki', 'Brezza', 2025, 'suv', 'Manual', 'Petrol + CNG', 5, 2, 3500.00, 145.83, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Brezza.png"]'),
(9, 'CAT-009', 'MH04KR0109', 'Maruti Suzuki', 'Brezza', 2018, 'suv', 'Manual', 'Diesel', 5, 2, 4000.00, 166.67, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Brezza.png"]'),
(10, 'CAT-010', 'MH04KR0110', 'Kia', 'Carens', 2025, 'mpv', 'Manual', 'Diesel', 7, 2, 4500.00, 187.50, 0.00, 4000.00, 250, 16.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Kia Carens.png"]'),
(11, 'CAT-011', 'MH04KR0111', 'Jeep', 'Compass', 2020, 'suv', 'Manual', 'Diesel', 5, 2, 5500.00, 229.17, 0.00, 4000.00, 250, 16.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Jeep Compass.png"]'),
(12, 'CAT-012', 'MH04KR0112', 'Hyundai', 'Creta', 2024, 'suv', 'Manual', 'Diesel', 5, 2, 4500.00, 187.50, 0.00, 3500.00, 250, 14.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai Creta.png"]'),
(13, 'CAT-013', 'MH04KR0113', 'Maruti Suzuki', 'Dzire', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Dzire.png"]'),
(14, 'CRP-003', 'MH05GJ4711', 'Maruti Suzuki', 'Ertiga', 2025, 'mpv', 'Manual', 'Petrol + CNG', 7, 2, 3300.00, 137.50, 0.00, 3500.00, 250, 14.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Viren Gupta', '2026-07-24', 1, 'available', 1, 1, '["assets/fleet/Maruti Suzuki Ertiga.png"]'),
(15, 'CAT-014', 'MH04KR0114', 'Hyundai', 'Exter', 2025, 'suv', 'AMT', 'Petrol', 5, 2, 3500.00, 145.83, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai Exter.png"]'),
(16, 'CAT-015', 'MH04KR0115', 'Hyundai', 'Exter', 2025, 'suv', 'Manual', 'Petrol + CNG', 5, 2, 2800.00, 116.67, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai Exter.png"]'),
(17, 'CRP-008', 'MH43CU1632', 'Maruti Suzuki', 'Fronx', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Amol Gole', '2026-08-19', 1, 'available', 1, 1, '["assets/fleet/Maruti Suzuki Fronx.png"]'),
(18, 'CRP-002', 'MH03EL1025', 'Maruti Suzuki', 'Fronx', 2025, 'economy', 'Automatic', 'Petrol', 5, 2, 2700.00, 112.50, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Aditi Lotankar', '2026-07-20', 1, 'available', 1, 1, '["assets/fleet/Maruti Suzuki Fronx.png"]'),
(19, 'CRP-006', 'MH04MU1178', 'Toyota', 'Glanza', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Kundan Singh', '2026-08-04', 1, 'available', 1, 1, '["assets/fleet/Toyota Glanza.png"]'),
(20, 'CRP-005', 'MH48GJ4153', 'Toyota', 'Glanza', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Ajay Vishwakarma', '2026-07-29', 1, 'available', 1, 1, '["assets/fleet/Toyota Glanza.png"]'),
(21, 'CAT-016', 'MH04KR0116', 'Maruti Suzuki', 'Grand Vitara', 2025, 'suv', 'Manual', 'Diesel', 5, 2, 4000.00, 166.67, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Grand Vitara.png"]'),
(22, 'CAT-017', 'MH04KR0117', 'Hyundai', 'i20', 2025, 'economy', 'Manual', 'Petrol', 5, 2, 2600.00, 108.33, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai i20.png"]'),
(23, 'CAT-018', 'MH04KR0118', 'Hyundai', 'i20', 2018, 'economy', 'Manual', 'Diesel', 5, 2, 3000.00, 125.00, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Hyundai i20.png"]'),
(24, 'CAT-019', 'MH04KR0119', 'Maruti Suzuki', 'Ignis', 2024, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2500.00, 104.17, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Ignis.png"]'),
(25, 'CAT-020', 'MH04KR0120', 'Toyota', 'Innova Crysta', 2017, 'mpv', 'Manual', 'Diesel', 7, 2, 5500.00, 229.17, 0.00, 4000.00, 250, 16.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Toyota Innova Crysta.png"]'),
(26, 'CAT-021', 'MH04KR0121', 'Toyota', 'Innova Crysta', 2018, 'mpv', 'Automatic', 'Diesel', 7, 2, 6000.00, 250.00, 0.00, 4000.00, 250, 16.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Toyota Innova Crysta.png"]'),
(27, 'CAT-022', 'MH04KR0122', 'Tata', 'Nexon', 2025, 'suv', 'Manual', 'Petrol + CNG', 5, 2, 3000.00, 125.00, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Tata Nexon.png"]'),
(28, 'CRP-007', 'MH05FV3454', 'Tata', 'Punch', 2025, 'suv', 'Manual', 'Petrol + CNG', 5, 2, 2700.00, 112.50, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Tai Phad', '2026-08-13', 1, 'available', 1, 1, '["assets/fleet/Tata Punch.png"]'),
(29, 'CAT-023', 'MH04KR0123', 'Tata', 'Safari', 2024, 'suv', 'Automatic', 'Diesel', 7, 2, 9000.00, 375.00, 0.00, 7000.00, 250, 28.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Tata Safari.png"]'),
(30, 'CAT-024', 'MH04KR0124', 'Mahindra', 'Scorpio N', 2025, 'suv', 'Manual', 'Diesel', 7, 2, 6000.00, 250.00, 0.00, 4000.00, 250, 16.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra Scorpio N.png"]'),
(31, 'CAT-025', 'MH04KR0125', 'Maruti Suzuki', 'Swift', 2025, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2500.00, 104.17, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Swift.png"]'),
(32, 'CAT-026', 'MH04KR0126', 'Maruti Suzuki', 'Swift', 2021, 'economy', 'AMT', 'Petrol', 5, 2, 2500.00, 104.17, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki Swift.png"]'),
(33, 'CAT-027', 'MH04KR0127', 'Mahindra', 'Thar', 2025, 'suv', 'Manual', 'Diesel', 4, 2, 5500.00, 229.17, 0.00, 4000.00, 250, 16.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra Thar.png"]'),
(34, 'CAT-028', 'MH04KR0128', 'Mahindra', 'Thar', 2024, 'suv', 'Automatic', 'Diesel', 4, 2, 5500.00, 229.17, 0.00, 4000.00, 250, 16.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra Thar.png"]'),
(35, 'CAT-029', 'MH04KR0129', 'Mahindra', 'Thar Roxx', 2025, 'suv', 'Automatic', 'Diesel', 5, 2, 7000.00, 291.67, 0.00, 5000.00, 250, 20.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Mahindra Thar Roxx.png"]'),
(36, 'CAT-030', 'MH04KR0130', 'Maruti Suzuki', 'WagonR', 2023, 'economy', 'Manual', 'Petrol + CNG', 5, 2, 2300.00, 95.83, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki WagonR.png"]'),
(37, 'CAT-031', 'MH04KR0131', 'Maruti Suzuki', 'XL6', 2023, 'mpv', 'Manual', 'Petrol + CNG', 7, 2, 3500.00, 145.83, 0.00, 3000.00, 250, 12.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Fleet Catalog', 'Kruizly Fleet Host', '2026-01-01', 1, 'available', 0, 1, '["assets/fleet/Maruti Suzuki XL6.png"]'),
(38, 'CRP-009', 'MH02FU6808', 'Mahindra', 'XUV700', 2025, 'suv', 'Manual', 'Diesel', 7, 2, 6500.00, 270.83, 0.00, 5000.00, 250, 20.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Partner', 'Saif Feroz Shaikh', '2026-08-01', 1, 'available', 1, 1, '["assets/fleet/Mahindra XUV700.png"]')
ON DUPLICATE KEY UPDATE
  `car_id` = VALUES(`car_id`),
  `brand` = VALUES(`brand`),
  `model` = VALUES(`model`),
  `price_day` = VALUES(`price_day`),
  `price_hour` = VALUES(`price_hour`),
  `security_deposit` = VALUES(`security_deposit`),
  `free_km` = VALUES(`free_km`),
  `extra_km` = VALUES(`extra_km`),
  `hub` = VALUES(`hub`),
  `location` = VALUES(`location`),
  `acquisition_type` = VALUES(`acquisition_type`),
  `owner_name` = VALUES(`owner_name`),
  `acquisition_date` = VALUES(`acquisition_date`),
  `available` = VALUES(`available`),
  `status` = VALUES(`status`),
  `is_active_fleet` = VALUES(`is_active_fleet`);

-- ------------------------------------------------------------
-- 4. COUPONS (5 records)
-- ------------------------------------------------------------
INSERT INTO `coupons` (
  `id`, `code`, `discount_type`, `discount_value`, `min_order`, 
  `max_discount`, `label`, `description`, `active`, `status`, 
  `used_count`, `max_uses`, `expires_at`
) VALUES
(1, 'FIRST500', 'flat', 500.00, 0.00, NULL, '₹500 Flat Off', 'Enjoy ₹500 off on your booking', 0, 'inactive', 0, NULL, NULL),
(2, 'KRUIZLY10', 'percentage', 10.00, 0.00, NULL, '10% Off Rental', 'Get 10% off on your ride', 1, 'active', 1, NULL, NULL),
(3, 'KRUIZLY20', 'percentage', 20.00, 0.00, NULL, '20% Off Rental', 'Get 20% off on your ride', 0, 'inactive', 0, NULL, NULL),
(4, 'WELCOME100', 'flat', 100.00, 0.00, NULL, '₹100 Flat Off', 'Enjoy ₹100 off on your booking', 0, 'inactive', 0, NULL, NULL),
(5, 'FESTIVE15', 'percentage', 15.00, 2500.00, NULL, '15% Off Rental', 'Get 15% off on your ride', 0, 'inactive', 0, NULL, NULL)
ON DUPLICATE KEY UPDATE
  `discount_type` = VALUES(`discount_type`),
  `discount_value` = VALUES(`discount_value`),
  `min_order` = VALUES(`min_order`),
  `active` = VALUES(`active`),
  `status` = VALUES(`status`),
  `used_count` = VALUES(`used_count`);

-- ------------------------------------------------------------
-- 5. BOOKINGS (12 records)
-- ------------------------------------------------------------
INSERT INTO `bookings` (
  `id`, `booking_id`, `booking_number`, `user_id`, `firebase_uid`, 
  `user_name`, `user_email`, `user_phone`, `vehicle_id`, `vehicle_reg`, 
  `vehicle_name`, `vehicle_category`, `pickup_date`, `drop_date`, `duration`, 
  `days`, `hours`, `with_driver`, `day_rate`, `hourly_rate`, 
  `driver_rate`, `driver_hourly_rate`, `security_deposit`, `base_amount`, 
  `coupon_code`, `coupon_discount`, `applied_coupons`, `total_amount`, 
  `final_amount`, `advance_amount`, `remaining_balance`, 
  `remaining_amount`, `payment_plan`, `payment_status`, `status`, 
  `booking_status`, `payment_ref`, `payment_amount_paid`, 
  `location`, `pickup_location`, `drop_location`, 
  `start_odometer`, `end_odometer`, `start_fastag`, `return_fastag`, 
  `pickup_handled_by`, `pickup_at`, `return_inspection`, `payment_screenshot_url`, 
  `created_at`
) VALUES
(1, 'KRZ-SEP-001', 'KRZ-SEP-001', 1, 'cust_roshan_more', 'Roshan More', 'roshanmo@kruizly.com', '7507323988', 20, 'MH48CJ4153', 'Toyota Glanza', NULL, '2026-09-03 09:00:00', '2026-09-16 21:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 40000.00, NULL, 0.00, NULL, 40000.00, 40000.00, 0.00, 0.00, 0.00, 'full', 'paid', 'active', 'active', NULL, 40000.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-03 08:30:00'),
(2, 'KRZ-SEP-002', 'KRZ-SEP-002', 2, 'cust_vivek_hatkamkar', 'Vivek Anant Hatkamkar', 'vivekhatk@kruizly.com', '8355912195', 19, 'MH04MU1178', 'Toyota Glanza', NULL, '2026-09-03 10:00:00', '2026-09-10 20:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 25200.00, NULL, 0.00, NULL, 25200.00, 25200.00, 0.00, 0.00, 0.00, 'full', 'paid', 'active', 'active', NULL, 25200.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-03 09:15:00'),
(3, 'KRZ-SEP-003', 'KRZ-SEP-003', 3, 'cust_arun_ahuja', 'Arun Ahuja', 'arun69ahu@gmail.com', '7030914115', 18, 'MH03EL1025', 'Suzuki Fronx Auto', NULL, '2026-08-30 08:00:00', '2026-09-03 20:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 7020.00, NULL, 0.00, NULL, 7020.00, 7020.00, 0.00, 0.00, 0.00, 'full', 'paid', 'completed', 'completed', NULL, 7020.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-29 18:00:00'),
(4, 'KRZ-SEP-004', 'KRZ-SEP-004', 4, 'cust_akash_sarkar', 'Akash Sarkar', 'aakki7077@gmail.com', '8777355520', 17, 'MH43CY1632', 'Suzuki Fronx', NULL, '2026-09-06 09:00:00', '2026-09-07 20:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 2500.00, NULL, 0.00, NULL, 2500.00, 2500.00, 0.00, 0.00, 0.00, 'full', 'paid', 'completed', 'completed', NULL, 2500.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-05 21:00:00'),
(5, 'KRZ-SEP-005', 'KRZ-SEP-005', 5, 'cust_kunal_vichave', 'Kunal Vichave', 'kunalvich@gmail.com', '7387961727', 28, 'MH05FV3454', 'Tata Punch', NULL, '2026-09-05 08:00:00', '2026-09-06 20:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 3896.00, NULL, 0.00, NULL, 3896.00, 3896.00, 0.00, 0.00, 0.00, 'full', 'paid', 'completed', 'completed', NULL, 3896.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-04 19:30:00'),
(6, 'KRZ-SEP-006', 'KRZ-SEP-006', 6, 'cust_dipesh_bhoir', 'Dipesh Bhoir', 'dipeshbhoir@gmail.com', '9527788995', 14, 'MH05GJ4711', 'Suzuki Ertiga', NULL, '2026-09-07 09:00:00', '2026-09-08 21:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 3300.00, NULL, 0.00, NULL, 3300.00, 3300.00, 0.00, 0.00, 0.00, 'full', 'paid', 'active', 'active', NULL, 3300.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-06 17:00:00'),
(7, 'KRZ-SEP-007', 'KRZ-SEP-007', 7, 'cust_krishna_velega', 'Krishna Velega', 'krishnavelega@gmail.com', '9063281666', 14, 'MH05GJ4711', 'Suzuki Ertiga', NULL, '2026-09-05 09:00:00', '2026-09-06 20:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 3300.00, NULL, 0.00, NULL, 3300.00, 3300.00, 0.00, 0.00, 0.00, 'full', 'paid', 'completed', 'completed', NULL, 3300.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-04 15:00:00'),
(8, 'KRZ-SEP-008', 'KRZ-SEP-008', 8, 'cust_rushikesh_shimpi', 'Rushikesh Shimpi', 'rushikesh@gmail.com', '9324855850', 14, 'MH05GJ4711', 'Suzuki Ertiga', NULL, '2026-09-03 09:00:00', '2026-09-04 20:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 3300.00, NULL, 0.00, NULL, 3300.00, 3300.00, 0.00, 0.00, 0.00, 'full', 'paid', 'completed', 'completed', NULL, 3300.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-02 20:00:00'),
(9, 'KRZ-SEP-009', 'KRZ-SEP-009', 9, 'cust_shaikh_sarfaraz', 'Shaikh Sarfaraz', 'Sarshaikh@gmail.com', '8928073455', 17, 'MH43CY1632', 'Suzuki Fronx', NULL, '2026-09-01 09:00:00', '2026-09-03 20:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 5100.00, NULL, 0.00, NULL, 5100.00, 5100.00, 0.00, 0.00, 0.00, 'full', 'paid', 'completed', 'completed', NULL, 5100.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-31 16:00:00'),
(10, 'KRZ-SEP-010', 'KRZ-SEP-010', 10, 'cust_shaikh_sarfaraz_2', 'Shaikh Sarfaraz', 'Sarshaikh@gmail.com', '8928073455', 17, 'MH43CY1632', 'Suzuki Fronx', NULL, '2026-09-04 09:00:00', '2026-09-06 20:00:00', NULL, 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 5200.00, NULL, 0.00, NULL, 5200.00, 5200.00, 0.00, 0.00, 0.00, 'full', 'paid', 'completed', 'completed', NULL, 5200.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-03 14:00:00'),
(11, '64740873', '64740873', 130, 'wPlKxMamtMZ8wOESGRV9luGE0ur2', 'Chandrakesh Yadav', 'carwithdriver.vikhroli@gmail.com', '8082788465', 1, 'MH04KR0101', 'BMW 520D', NULL, '2026-09-07 06:29:00', '2026-09-09 06:29:00', '1 Day', 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 500.00, NULL, 0.00, NULL, 500.00, 500.00, 0.00, 0.00, 0.00, 'full', 'advance_paid', 'pending_payment', 'pending_payment', NULL, 0.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-07 06:29:48'),
(12, '80487126', '80487126', 130, 'wPlKxMamtMZ8wOESGRV9luGE0ur2', 'Chandrakesh Yadav', 'carwithdriver.vikhroli@gmail.com', '8082788465', 38, 'MH02FU6808', 'Mahindra XUV700', NULL, '2026-10-20 01:30:00', '2026-10-21 01:30:00', '1 Day (24 hrs)', 1, 24, 0, 0.00, 0.00, 0.00, 0.00, 0.00, 6000.00, NULL, 0.00, NULL, 10000.00, 10000.00, 500.00, 9500.00, 9500.00, 'full', 'advance_paid', 'pending_verification', 'pending_verification', NULL, 500.00, 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', 'Gavson Business Park, Ghansoli', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-07 11:53:16')
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`),
  `vehicle_id` = VALUES(`vehicle_id`),
  `vehicle_reg` = VALUES(`vehicle_reg`),
  `vehicle_name` = VALUES(`vehicle_name`),
  `total_amount` = VALUES(`total_amount`),
  `final_amount` = VALUES(`final_amount`),
  `advance_amount` = VALUES(`advance_amount`),
  `remaining_balance` = VALUES(`remaining_balance`),
  `payment_status` = VALUES(`payment_status`),
  `status` = VALUES(`status`);

-- ------------------------------------------------------------
-- 6. PAYMENTS (12 records)
-- ------------------------------------------------------------
INSERT INTO `payments` (
  `id`, `payment_id`, `booking_id`, `firebase_uid`, `amount`, 
  `currency`, `method`, `utr`, `payment_ref`, 
  `screenshot_url`, `screenshot_media_id`, `razorpay_order_id`, 
  `razorpay_payment_id`, `razorpay_signature`, `status`, 
  `rejection_reason`, `refund_amount`, `refund_reason`, 
  `verified_by`, `verified_at`, `created_at`
) VALUES
(1, 'PAY-KRZ-001', 'KRZ-SEP-001', 'cust_roshan_more', 40000.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-09-03 08:45:00'),
(2, 'PAY-KRZ-002', 'KRZ-SEP-002', 'cust_vivek_hatkamkar', 25200.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-09-03 09:30:00'),
(3, 'PAY-KRZ-003', 'KRZ-SEP-003', 'cust_arun_ahuja', 7020.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-08-29 18:30:00'),
(4, 'PAY-KRZ-004', 'KRZ-SEP-004', 'cust_akash_sarkar', 2500.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-09-05 21:15:00'),
(5, 'PAY-KRZ-005', 'KRZ-SEP-005', 'cust_kunal_vichave', 3896.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-09-04 19:45:00'),
(6, 'PAY-KRZ-006', 'KRZ-SEP-006', 'cust_dipesh_bhoir', 3300.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-09-06 17:30:00'),
(7, 'PAY-KRZ-007', 'KRZ-SEP-007', 'cust_krishna_velega', 3300.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-09-04 15:30:00'),
(8, 'PAY-KRZ-008', 'KRZ-SEP-008', 'cust_rushikesh_shimpi', 3300.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-09-02 20:30:00'),
(9, 'PAY-KRZ-009', 'KRZ-SEP-009', 'cust_shaikh_sarfaraz', 5100.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-08-31 16:30:00'),
(10, 'PAY-KRZ-010', 'KRZ-SEP-010', 'cust_shaikh_sarfaraz_2', 5200.00, 'INR', 'upi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'verified', NULL, 0.00, NULL, NULL, NULL, '2026-09-03 14:30:00'),
(11, 'PAY-FB2F4FA4058D', '64740873', 'wPlKxMamtMZ8wOESGRV9luGE0ur2', 500.00, 'INR', 'upi', '661506823268', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, 0.00, NULL, NULL, NULL, '2026-09-07 06:29:48'),
(12, 'PAY-143F0C5CFA79', '80487126', 'wPlKxMamtMZ8wOESGRV9luGE0ur2', 500.00, 'INR', 'upi', '661506823268', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, 0.00, NULL, NULL, NULL, '2026-09-07 11:53:16')
ON DUPLICATE KEY UPDATE
  `amount` = VALUES(`amount`),
  `method` = VALUES(`method`),
  `utr` = VALUES(`utr`),
  `status` = VALUES(`status`),
  `verified_by` = VALUES(`verified_by`),
  `verified_at` = VALUES(`verified_at`);

-- ------------------------------------------------------------
-- 7. VERIFICATION / KYC (3 records)
-- ------------------------------------------------------------
INSERT INTO `verification` (
  `id`, `verification_id`, `user_id`, `firebase_uid`, `full_name`, 
  `phone`, `license_number`, `license_front_media_id`, `license_back_media_id`, 
  `license_status`, `aadhar_number`, `aadhar_front_media_id`, `aadhar_back_media_id`, 
  `aadhar_status`, `pan_number`, `pan_front_media_id`, `pan_back_media_id`, 
  `pan_status`, `selfie_media_id`, `overall_status`, `rejection_reason`, 
  `verified_by`, `verified_at`, `created_at`
) VALUES
(1, 'VER-7F309C777ECF', 11, '2RzZfetVnmdHQa119Mddj80bPrs2', 'car database', NULL, NULL, NULL, NULL, 'verified', NULL, NULL, NULL, 'verified', NULL, NULL, NULL, 'verified', NULL, 'verified', NULL, NULL, NULL, '2026-09-09 06:22:23'),
(2, 'VER-814A374DD3F6', 13, '0hyIE7QMA6fXEZ56EcrCeXPw7ir1', '96 _Sawant Pranav', '8356881581', NULL, NULL, NULL, 'verified', NULL, NULL, NULL, 'verified', NULL, NULL, NULL, 'verified', NULL, 'verified', NULL, NULL, NULL, '2026-09-09 06:22:23'),
(3, 'VER-B1CAEBB3E4E8', 51, 'SW7o8zNdDfeJkWLaNYe0l1f3bD13', 'Saif Shaikh', '9619152252', NULL, NULL, NULL, 'not_submitted', NULL, NULL, NULL, 'not_submitted', NULL, NULL, NULL, 'not_submitted', NULL, 'pending', NULL, NULL, NULL, '2026-09-09 06:22:23')
ON DUPLICATE KEY UPDATE
  `user_id` = VALUES(`user_id`),
  `full_name` = VALUES(`full_name`),
  `phone` = VALUES(`phone`),
  `license_status` = VALUES(`license_status`),
  `aadhar_status` = VALUES(`aadhar_status`),
  `pan_status` = VALUES(`pan_status`),
  `overall_status` = VALUES(`overall_status`);

-- ------------------------------------------------------------
-- 8. DEFAULT SETTINGS
-- ------------------------------------------------------------
INSERT INTO `settings` (`key`, `value`) VALUES
('company_name', 'KRUIZLY Car Rentals'),
('company_email', 'support@kruizly.com'),
('company_phone', '+91 91671 64547'),
('company_address', 'Gavson Business Park, Ghansoli, Navi Mumbai, Maharashtra 400701'),
('currency', 'INR'),
('tax_percentage', '0'),
('security_deposit_default', '3000'),
('free_km_default', '250')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
-- END OF EXPORT --
