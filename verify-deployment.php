<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$root = __DIR__;
$read = static function (string $file): string {
    $v = @file_get_contents($file);
    return is_string($v) ? $v : '';
};

$version = trim($read($root . '/VERSION.txt'));
$index = $read($root . '/index.html');
$diag = $read($root . '/diagnostyka.html');
$ht = $read($root . '/.htaccess');
$health = $read($root . '/api/health.php');

preg_match("/app-(\\d+\\.\\d+\\.\\d+)\\/main\\.js/", $index, $mIndex);
preg_match('/Diagnostyka (?:MSPortalu|msportalu|Mapownika) ([0-9.]+)/i', $diag, $mDiag);
preg_match("/'version'\\s*=>\\s*'([^']+-server)'/", $health, $mHealth);

$appDirs = [];
foreach (glob($root . '/app-*', GLOB_ONLYDIR) ?: [] as $dir) $appDirs[] = basename($dir);
sort($appDirs, SORT_NATURAL);

$escaped = str_replace('.', '\\.', $version);
$currentRule = 'RewriteRule ^app-' . $escaped . '/ - [L]';
$genericStaleRule = 'RewriteRule ^app-[^/]+/ - [R=410,L]';
$allowsCurrent = $version !== '' && str_contains($ht, $currentRule);
$blocksOtherApps = str_contains($ht, $genericStaleRule);
$expectedHealth = $version !== '' ? $version . '-server' : null;

$out = [
    'expected' => $version,
    'version_file' => $version,
    'index_app_version' => $mIndex[1] ?? null,
    'diagnostics_version' => $mDiag[1] ?? null,
    'health_version' => $mHealth[1] ?? null,
    'app_directories_present' => $appDirs,
    'htaccess_allows_current_app' => $allowsCurrent,
    'htaccess_blocks_other_app_directories' => $blocksOtherApps,
    'deployment_consistent' => (
        $version !== ''
        && (($mIndex[1] ?? '') === $version)
        && (($mDiag[1] ?? '') === $version)
        && (($mHealth[1] ?? '') === $expectedHealth)
        && $appDirs === ['app-' . $version]
        && $allowsCurrent
        && $blocksOtherApps
    ),
];

// 19.8.0: hosting bez VPS — analizy RCN/BDOT/działki działają w PHP (api/vps.php).
// Baza jest opcjonalna (bez niej działa analiza działki ULDK/PRG), więc nie wpływa na deployment_consistent.
$dbFile = $root . '/data/msportal/msportal.sqlite3';
$pdoSqlite = class_exists('PDO') && in_array('sqlite', PDO::getAvailableDrivers(), true);
$rtree = null;
if ($pdoSqlite) {
    try {
        $mem = new PDO('sqlite::memory:');
        $mem->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $mem->exec('CREATE VIRTUAL TABLE t USING rtree(id, a, b)');
        $rtree = true;
    } catch (Throwable) {
        $rtree = false;
    }
}
$out['hosting'] = [
    'php_api_present' => is_file($root . '/api/vps.php'),
    'pdo_sqlite' => $pdoSqlite,
    'sqlite_rtree' => $rtree,
    'curl' => function_exists('curl_init'),
    'database_present' => is_file($dbFile),
    'database_mb' => is_file($dbFile) ? round(filesize($dbFile) / 1048576, 1) : 0,
    'database_ready_for_analysis' => $pdoSqlite && is_file($dbFile) && is_readable($dbFile),
];

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
