<?php
/**
 * api/config/database.php
 * 
 * Secure PDO Connection Pool & Query Helper for Hostinger MySQL.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $hosts = array_values(array_unique([DB_HOST, '127.0.0.1', 'localhost']));
            $lastException = null;

            $options = [
                PDO::ATTR_PERSISTENT => true,
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 5,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES " . DB_CHARSET . ", time_zone = '+05:30'",
            ];

            foreach ($hosts as $host) {
                for ($attempt = 1; $attempt <= 3; $attempt++) {
                    try {
                        $dsn = sprintf(
                            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                            $host,
                            DB_PORT,
                            DB_NAME,
                            DB_CHARSET
                        );
                        self::$instance = new PDO($dsn, DB_USER, DB_PASS, $options);
                        return self::$instance;
                    } catch (PDOException $e) {
                        $lastException = $e;
                        // If Hostinger connection rate limit hit (SQLSTATE 2002 Operation not permitted), wait and retry
                        if (str_contains($e->getMessage(), '2002') || (int)$e->getCode() === 2002) {
                            usleep(120000); // 120ms
                            continue;
                        }
                        break;
                    }
                }
            }

            if (self::$instance === null) {
                $msg = $lastException ? $lastException->getMessage() : 'Unknown error';
                error_log("[Database Connection Error] " . $msg);
                sendErrorResponse("Database connection failed: " . $msg, 500);
            }
        }

        return self::$instance;
    }

    /**
     * Executes a parameterized query and returns all rows
     */
    public static function fetchAll(string $sql, array $params = []): array {
        $stmt = self::getConnection()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Executes a parameterized query and returns a single row
     */
    public static function fetchOne(string $sql, array $params = []): ?array {
        $stmt = self::getConnection()->prepare($sql);
        $stmt->execute($params);
        $result = $stmt->fetch();
        return $result ?: null;
    }

    /**
     * Auto-heals missing AUTO_INCREMENT schema constraint on tables
     */
    public static function autoHealTable(string $table): void {
        $table = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
        if (!$table) return;
        $pdo = self::getConnection();
        try {
            $pdo->exec("ALTER TABLE `$table` MODIFY `id` INT NOT NULL AUTO_INCREMENT");
        } catch (Throwable $_) {
            try {
                $pdo->exec("ALTER TABLE `$table` MODIFY `id` INT AUTO_INCREMENT PRIMARY KEY");
            } catch (Throwable $__) {}
        }
    }

    /**
     * Executes an INSERT / UPDATE / DELETE statement and returns affected rows or last insert ID
     */
    public static function execute(string $sql, array $params = []): int {
        try {
            $stmt = self::getConnection()->prepare($sql);
            $stmt->execute($params);
            return $stmt->rowCount();
        } catch (PDOException $e) {
            if ($e->getCode() === '23000' && str_contains($e->getMessage(), 'Duplicate entry') && str_contains($e->getMessage(), 'PRIMARY')) {
                if (preg_match('/(?:INSERT\s+INTO|UPDATE)\s+[`]?([a-zA-Z0-9_]+)[`]?/i', $sql, $m)) {
                    self::autoHealTable($m[1]);
                    $stmt = self::getConnection()->prepare($sql);
                    $stmt->execute($params);
                    return $stmt->rowCount();
                }
            }
            throw $e;
        }
    }

    /**
     * Inserts a record and returns the auto-increment ID
     */
    public static function insert(string $sql, array $params = []): int {
        $pdo = self::getConnection();
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return (int)$pdo->lastInsertId();
        } catch (PDOException $e) {
            if ($e->getCode() === '23000' && str_contains($e->getMessage(), 'Duplicate entry') && str_contains($e->getMessage(), 'PRIMARY')) {
                if (preg_match('/(?:INSERT\s+INTO)\s+[`]?([a-zA-Z0-9_]+)[`]?/i', $sql, $m)) {
                    self::autoHealTable($m[1]);
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                    return (int)$pdo->lastInsertId();
                }
            }
            throw $e;
        }
    }

    /**
     * Executes callback inside a database transaction
     */
    public static function transaction(callable $callback) {
        $pdo = self::getConnection();
        $pdo->beginTransaction();
        try {
            $result = $callback($pdo);
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
