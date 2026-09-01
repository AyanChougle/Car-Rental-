<?php
/**
 * database/migrate_from_json.php
 * 
 * Command-line / browser migration script to load exported Firebase data into MySQL.
 */

declare(strict_types=1);

require_once __DIR__ . '/../api/config/config.php';
require_once __DIR__ . '/../api/config/database.php';

echo "=== KRUIZLY MYSQL MIGRATION TOOL ===\n";

try {
    $pdo = Database::getConnection();
    echo "1. Checking MySQL Connection... OK (Database: " . DB_NAME . ")\n";

    // Run schema
    $schemaFile = __DIR__ . '/schema.sql';
    if (file_exists($schemaFile)) {
        echo "2. Applying database/schema.sql...\n";
        $schemaSql = file_get_contents($schemaFile);
        $pdo->exec($schemaSql);
        echo "   Schema applied successfully.\n";
    }

    // Run seed
    $seedFile = __DIR__ . '/seed_production.sql';
    if (file_exists($seedFile)) {
        echo "3. Applying database/seed_production.sql...\n";
        $seedSql = file_get_contents($seedFile);
        $pdo->exec($seedSql);
        echo "   Production seed applied successfully.\n";
    }

    echo "4. Verification:\n";
    $vCount = Database::fetchOne("SELECT COUNT(*) as count FROM vehicles");
    $cCount = Database::fetchOne("SELECT COUNT(*) as count FROM coupons");
    echo "   - Vehicles in database: " . ($vCount['count'] ?? 0) . "\n";
    echo "   - Coupons in database: " . ($cCount['count'] ?? 0) . "\n";

    echo "=== MIGRATION COMPLETED SUCCESSFULLY ===\n";
} catch (Throwable $e) {
    echo "\n[ERROR] Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
