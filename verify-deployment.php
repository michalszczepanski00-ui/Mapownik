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

// 19.42.0: index.html z budowania Vite — wersja w odwołaniu do assets/js/boot.js, kod w assets/build/.
preg_match('/assets\/js\/boot\.js\?v=(\d+\.\d+\.\d+)/', $index, $mIndex);
$boot = $read($root . '/assets/js/boot.js');
preg_match("/var VERSION = '([0-9.]+)'/", $boot, $mBoot);
preg_match_all('/(?:src|href)="\.\/(assets\/build\/[^"?]+)"/', $index, $mBuild);
$bundleFiles = array_values(array_unique($mBuild[1] ?? []));
$missingBundle = array_values(array_filter($bundleFiles, static fn(string $f): bool => !is_file($root . '/' . $f)));
$hasMainBundle = (bool)array_filter($bundleFiles, static fn(string $f): bool => (bool)preg_match('~^assets/build/main-[\w-]+\.js$~', $f));
preg_match('/Diagnostyka (?:MSPortalu|msportalu|Mapownika) ([0-9.]+)/i', $diag, $mDiag);
preg_match("/'version'\\s*=>\\s*'([^']+-server)'/", $health, $mHealth);

$appDirs = [];
foreach (glob($root . '/app-*', GLOB_ONLYDIR) ?: [] as $dir) $appDirs[] = basename($dir);
sort($appDirs, SORT_NATURAL);

// 19.45.0: kod aplikacji jest tylko w assets/build/ — katalogi app-* i dawne biblioteki to pozostałości do usunięcia.
// Nie psują działania (.htaccess zwraca dla nich 410), więc nie wpływają na deployment_consistent.
$genericStaleRule = 'RewriteRule ^app-[^/]+/ - [R=410,L]';
$blocksOtherApps = str_contains($ht, $genericStaleRule);
$leftovers = $appDirs;
foreach (['vendor/static', 'vendor/ol-esm', 'vendor/ol-esm-2', 'vendor/opt', 'vendor/shims', 'vendor/geometry'] as $dir) {
    if (is_dir($root . '/' . $dir)) $leftovers[] = $dir;
}
// 19.53.0: api/orthophoto.php i api/_orthophoto.php (dawny moduł zdjęć archiwalnych) — usunięte z paczki.
foreach (['setup-vendors.php', 'api/vendor_status.php', 'api/_vendor_builder.php', 'api/orthophoto.php', 'api/_orthophoto.php'] as $file) {
    if (is_file($root . '/' . $file)) $leftovers[] = $file;
}
$expectedHealth = $version !== '' ? $version . '-server' : null;

$out = [
    'expected' => $version,
    'version_file' => $version,
    'index_app_version' => $mIndex[1] ?? null,
    'boot_version' => $mBoot[1] ?? null,
    'bundle_files' => count($bundleFiles),
    'bundle_missing' => $missingBundle,
    'diagnostics_version' => $mDiag[1] ?? null,
    'health_version' => $mHealth[1] ?? null,
    'app_directories_present' => $appDirs,
    'htaccess_blocks_other_app_directories' => $blocksOtherApps,
    'leftover_files' => $leftovers,
    'deployment_consistent' => (
        $version !== ''
        && (($mIndex[1] ?? '') === $version)
        && (($mBoot[1] ?? '') === $version)
        && $hasMainBundle
        && !$missingBundle
        && (($mDiag[1] ?? '') === $version)
        && (($mHealth[1] ?? '') === $expectedHealth)
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
