<?php
/**
 * database/migrate_from_json.php
 * 
 * Command-line / browser migration script to load consolidated CarRentPe data into MySQL.
 */

declare(strict_types=1);

require_once __DIR__ . '/../api/config/config.php';
require_once __DIR__ . '/../api/config/database.php';

header('Content-Type: text/plain; charset=utf-8');
echo "=== KRUIZLY CONSOLIDATED CARRENTPE MIGRATION TOOL ===\n";

try {
    $pdo = Database::getConnection();
    echo "1. Checking MySQL Connection... OK (Database: " . DB_NAME . ")\n";

    $migrationFile = __DIR__ . '/Kruizly_Consolidated_CarRentPe_Migration.sql';
    if (!file_exists($migrationFile)) {
        throw new Exception("Migration file not found: $migrationFile");
    }

    echo "2. Applying database/Kruizly_Consolidated_CarRentPe_Migration.sql (" . round(filesize($migrationFile) / 1024, 1) . " KB)...\n";
    $sql = file_get_contents($migrationFile);

    // Disable foreign key checks for clean migration
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");

    // Execute SQL directly or split if needed
    try {
        $pdo->exec($sql);
    } catch (Throwable $execError) {
        // Fallback: execute statement by statement
        echo "   [Note] Multi-statement batch failed (" . $execError->getMessage() . "), trying statement-by-statement...\n";
        $statements = array_filter(array_map('trim', explode(";\n", $sql)));
        $stmtCount = 0;
        foreach ($statements as $statement) {
            if (empty($statement) || str_starts_with($statement, '--') || str_starts_with($statement, '/*')) {
                continue;
            }
            $pdo->exec($statement);
            $stmtCount++;
        }
        echo "   Executed $stmtCount statements individually.\n";
    }

    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
    echo "   Migration SQL applied successfully.\n";

    echo "3. Verification of imported tables:\n";
    $uCount = Database::fetchOne("SELECT COUNT(*) as count FROM users");
    $vCount = Database::fetchOne("SELECT COUNT(*) as count FROM vehicles");
    $bCount = Database::fetchOne("SELECT COUNT(*) as count FROM bookings");
    $pCount = Database::fetchOne("SELECT COUNT(*) as count FROM payments");
    $cCount = Database::fetchOne("SELECT COUNT(*) as count FROM coupons");
    $kCount = Database::fetchOne("SELECT COUNT(*) as count FROM verification");
    $pcCount = Database::fetchOne("SELECT COUNT(*) as count FROM partner_cars");
    $mCount = Database::fetchOne("SELECT COUNT(*) as count FROM media");

    echo "   - Users: " . ($uCount['count'] ?? 0) . "\n";
    echo "   - Fleet Vehicles: " . ($vCount['count'] ?? 0) . "\n";
    echo "   - Bookings: " . ($bCount['count'] ?? 0) . "\n";
    echo "   - Payment Transactions: " . ($pCount['count'] ?? 0) . "\n";
    echo "   - Coupons: " . ($cCount['count'] ?? 0) . "\n";
    echo "   - KYC Document Records: " . ($kCount['count'] ?? 0) . "\n";
    echo "   - Partner Acquisition Cars: " . ($pcCount['count'] ?? 0) . "\n";
    echo "   - Media File Index: " . ($mCount['count'] ?? 0) . "\n";

    echo "\n=== MIGRATION COMPLETED SUCCESSFULLY ===\n";
} catch (Throwable $e) {
    echo "\n[ERROR] Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}

