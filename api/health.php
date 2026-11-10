<?php
declare(strict_types=1);
require_once __DIR__ . '/_analysis_buildings_store.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$cache = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'cache';
$caBundle = __DIR__ . DIRECTORY_SEPARATOR . 'certs' . DIRECTORY_SEPARATOR . 'cacert.pem';
$caReady = is_file($caBundle) && is_readable($caBundle) && (int)@filesize($caBundle) > 100000;
$testDir = $cache . DIRECTORY_SEPARATOR . '.health';
$bdot = bdot_store_status();
$writable = (is_dir($cache) || @mkdir($cache, 0775, true)) && (@mkdir($testDir, 0775, true) || is_dir($testDir));
if ($writable) @rmdir($testDir);
echo json_encode([
  'ok' => true,
  'app' => 'msportal',
  'version' => '19.47.0-server',
  // 19.41.4-b (audyt B6): bez dokładnego numeru wydania PHP (ułatwia dobór znanych błędów); wystarczy gałąź.
  'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
  // Poprawki bezpieczeństwa wgrane na wersję 19.41.4 (ZMIANY_19.41.4-b.md) — do sprawdzenia po wgraniu.
  'patch' => '19.41.4-b',
  'curl' => function_exists('curl_init'),
  'allow_url_fopen' => filter_var((string)ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN),
  'cache_writable' => $writable,
  'gd' => function_exists('imagecreatetruecolor') && function_exists('imagecreatefromstring'),
  'zip' => class_exists('ZipArchive'),
  'imagick' => class_exists('Imagick'),
  'ca_bundle' => $caReady,
  'ca_bundle_bytes' => $caReady ? (int)@filesize($caBundle) : 0,
  'zlib' => function_exists('gzopen'),
  'bdot_store_ready' => (bool)$bdot['ready'],
  'bdot_store_version' => $bdot['manifest']['storeVersion'] ?? null,
  'bdot_store_features' => $bdot['manifest']['featureCount'] ?? null,
  'bdot_tile_size' => $bdot['manifest']['tileSize'] ?? null,
  'bdot_index_strategy' => $bdot['manifest']['indexStrategy'] ?? 'grid',
  'bdot_query_cache_writable' => (bool)($bdot['queryCacheWritable'] ?? false),
  // 19.8.0: hosting bez VPS — analizy RCN/BDOT/działki w PHP (api/vps.php).
  'pdo_sqlite' => class_exists('PDO') && in_array('sqlite', PDO::getAvailableDrivers(), true),
  'msportal_db_present' => is_file(dirname(__DIR__) . '/data/msportal/msportal.sqlite3'),
  // 19.44.0: ile sekund temu działało sprzątanie cache (cron: php tools/maintain_cache.php); null = nigdy.
  'cache_maintenance_age_s' => is_file($cache . '/.maintenance-18.18.0') ? max(0, time() - (int)@filemtime($cache . '/.maintenance-18.18.0')) : null,
  'time' => gmdate('c'),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
