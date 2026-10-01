<?php
// TEMPORARY: open https://kruizly.com/api/diag-create.php then DELETE this file.
header('Content-Type: application/json');
$f = __DIR__ . '/bookings/create.php';
$src = @file_get_contents($f);
$out = [
  'file' => $f,
  'exists' => $src !== false,
  'modified' => $src !== false ? date('c', filemtime($f)) : null,
  'has_v3_marker' => $src !== false && strpos($src, '2026-09-30-v3') !== false,
  'has_schema_adaptive_insert' => $src !== false && strpos($src, 'SHOW COLUMNS FROM bookings') !== false,
  'php' => PHP_VERSION,
  'opcache_enabled' => function_exists('opcache_get_status') ? (bool)(@opcache_get_status(false)['opcache_enabled'] ?? false) : false,
];
if (function_exists('opcache_invalidate') && $src !== false) { @opcache_invalidate($f, true); $out['opcache_invalidated'] = true; }
try {
  require_once __DIR__ . '/config/database.php';
  $cols = Database::fetchAll('SHOW COLUMNS FROM bookings');
  $out['bookings_columns'] = count($cols);
  $out['bookings_column_names'] = array_column($cols, 'Field');
  $trg = Database::fetchAll('SHOW TRIGGERS');
  $out['triggers'] = array_map(fn($t) => ($t['Table'] ?? '') . ':' . ($t['Trigger'] ?? '') . ':' . ($t['Event'] ?? ''), $trg);
} catch (Throwable $e) { $out['db_error'] = $e->getMessage(); }
echo json_encode($out, JSON_PRETTY_PRINT);
