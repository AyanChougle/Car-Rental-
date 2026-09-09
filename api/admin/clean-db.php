<?php
/**
 * api/admin/clean-db.php
 * Automated deduplication and constraint runner.
 * Safe to execute directly in browser: https://<domain>/api/admin/clean-db.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/cors.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = Database::getConnection();
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $pdo->beginTransaction();

    // 1. DEDUPLICATE VEHICLES
    $pdo->exec('
        DELETE v1 FROM `vehicles` v1
        INNER JOIN `vehicles` v2 
        WHERE v1.id > v2.id 
          AND v1.reg_no = v2.reg_no 
          AND v1.reg_no IS NOT NULL 
          AND v1.reg_no != "" 
          AND v1.reg_no != "TBD"
    ');
    $pdo->exec('
        DELETE v1 FROM `vehicles` v1
        INNER JOIN `vehicles` v2 
        WHERE v1.id > v2.id 
          AND v1.car_id = v2.car_id 
          AND v1.car_id IS NOT NULL 
          AND v1.car_id != ""
    ');

    // 2. DEDUPLICATE USERS
    $pdo->exec('
        DELETE u1 FROM `users` u1
        INNER JOIN `users` u2 
        WHERE u1.id > u2.id 
          AND u1.firebase_uid = u2.firebase_uid 
          AND u1.firebase_uid IS NOT NULL 
          AND u1.firebase_uid != ""
    ');

    // 3. DEDUPLICATE ADMIN USERS
    $pdo->exec('
        DELETE a1 FROM `admin_users` a1
        INNER JOIN `admin_users` a2 
        WHERE a1.id > a2.id 
          AND (
            (a1.firebase_uid = a2.firebase_uid AND a1.firebase_uid IS NOT NULL AND a1.firebase_uid != "")
            OR (a1.email = a2.email AND a1.email IS NOT NULL AND a1.email != "")
          )
    ');

    // 4. DEDUPLICATE BOOKINGS
    $pdo->exec('
        DELETE b1 FROM `bookings` b1
        INNER JOIN `bookings` b2 
        WHERE b1.id > b2.id 
          AND (
            (b1.booking_id = b2.booking_id AND b1.booking_id IS NOT NULL AND b1.booking_id != "")
            OR (b1.booking_number = b2.booking_number AND b1.booking_number IS NOT NULL AND b1.booking_number != "")
            OR (REPLACE(b1.booking_id, "#", "") = REPLACE(b2.booking_id, "#", "") AND b1.booking_id IS NOT NULL AND b1.booking_id != "")
          )
    ');

    // 5. DEDUPLICATE PAYMENTS
    $pdo->exec('
        DELETE p1 FROM `payments` p1
        INNER JOIN `payments` p2 
        WHERE p1.id > p2.id 
          AND (
            (p1.payment_id = p2.payment_id AND p1.payment_id IS NOT NULL AND p1.payment_id != "")
            OR (p1.booking_id = p2.booking_id AND p1.amount = p2.amount AND p1.booking_id IS NOT NULL AND p1.booking_id != "")
          )
    ');

    // 6. DEDUPLICATE COUPONS
    $pdo->exec('
        DELETE c1 FROM `coupons` c1
        INNER JOIN `coupons` c2 
        WHERE c1.id > c2.id 
          AND c1.code = c2.code 
          AND c1.code IS NOT NULL 
          AND c1.code != ""
    ');

    $pdo->commit();
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

    // 7. SAFELY ADD UNIQUE CONSTRAINTS
    $constraints = [
        ['table' => 'vehicles', 'key' => 'uniq_vehicle_reg', 'sql' => 'ALTER TABLE `vehicles` ADD UNIQUE KEY `uniq_vehicle_reg` (`reg_no`)'],
        ['table' => 'users', 'key' => 'uniq_user_firebase_uid', 'sql' => 'ALTER TABLE `users` ADD UNIQUE KEY `uniq_user_firebase_uid` (`firebase_uid`)'],
        ['table' => 'bookings', 'key' => 'uniq_booking_ref', 'sql' => 'ALTER TABLE `bookings` ADD UNIQUE KEY `uniq_booking_ref` (`booking_id`)'],
        ['table' => 'payments', 'key' => 'uniq_payment_id', 'sql' => 'ALTER TABLE `payments` ADD UNIQUE KEY `uniq_payment_id` (`payment_id`)'],
        ['table' => 'coupons', 'key' => 'uniq_coupon_code', 'sql' => 'ALTER TABLE `coupons` ADD UNIQUE KEY `uniq_coupon_code` (`code`)'],
    ];

    $applied = [];
    foreach ($constraints as $c) {
        $stmt = $pdo->prepare('
            SELECT COUNT(*) FROM information_schema.statistics 
            WHERE table_schema = DATABASE() 
              AND table_name = :tname 
              AND index_name = :idx
        ');
        $stmt->execute([':tname' => $c['table'], ':idx' => $c['key']]);
        $exists = (int)$stmt->fetchColumn() > 0;

        if (!$exists) {
            try {
                $pdo->exec($c['sql']);
                $applied[] = "Created {$c['key']} on {$c['table']}";
            } catch (Throwable $ex) {
                $applied[] = "Failed {$c['key']} on {$c['table']}: " . $ex->getMessage();
            }
        } else {
            $applied[] = "Already present: {$c['key']} on {$c['table']}";
        }
    }

    // 8. Gather clean record counts
    $counts = [
        'vehicles' => (int)$pdo->query('SELECT COUNT(*) FROM `vehicles`')->fetchColumn(),
        'users' => (int)$pdo->query('SELECT COUNT(*) FROM `users`')->fetchColumn(),
        'admin_users' => (int)$pdo->query('SELECT COUNT(*) FROM `admin_users`')->fetchColumn(),
        'bookings' => (int)$pdo->query('SELECT COUNT(*) FROM `bookings`')->fetchColumn(),
        'payments' => (int)$pdo->query('SELECT COUNT(*) FROM `payments`')->fetchColumn(),
        'coupons' => (int)$pdo->query('SELECT COUNT(*) FROM `coupons`')->fetchColumn(),
    ];

    echo json_encode([
        'success' => true,
        'message' => 'Database cleaned and unique constraints applied successfully.',
        'counts' => $counts,
        'constraints' => $applied,
    ], JSON_PRETTY_PRINT);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ], JSON_PRETTY_PRINT);
}