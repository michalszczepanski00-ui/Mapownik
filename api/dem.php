<?php
declare(strict_types=1);

/**
 * 19.41.0 — kafel NMT dla widoku „Teren 3D” (opis formatu w _dem.php).
 *   GET api/dem.php?p=4&tx=84&ty=587   → kafel binarny (application/octet-stream)
 *   GET api/dem.php?info=1             → parametry usługi (JSON)
 * Nagłówki: X-Mapownik-DEM-Cache (HIT | MISS), X-Mapownik-DEM-Ms (czas zapytania do GUGiK — pilotaż wydajności).
 */

require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/_dem.php';

function dem_json(int $status, array $payload, array $headers = []): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    foreach ($headers as $k => $v) header("{$k}: {$v}");
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function dem_send(string $bytes, string $cacheState, ?int $ms = null): never {
    $etag = '"dem-' . substr(hash('sha256', $bytes), 0, 20) . '"';
    header('Content-Type: application/octet-stream');
    header('Cache-Control: public, max-age=2592000');
    header('ETag: ' . $etag);
    header('X-Content-Type-Options: nosniff');
    header('X-Mapownik-DEM-Cache: ' . $cacheState);
    header('X-Mapownik-DEM-Datum: ' . DEM_DATUM);
    if ($ms !== null) header('X-Mapownik-DEM-Ms: ' . $ms);
    if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) { http_response_code(304); exit; }
    header('Content-Length: ' . strlen($bytes));
    echo $bytes;
    exit;
}

if (isset($_GET['info'])) {
    dem_json(200, ['ok' => true, 'source' => 'GUGiK NMT 1 m — WCS ' . DEM_COVERAGE, 'datum' => DEM_DATUM, 'crs' => 'EPSG:2180',
        'levels' => DEM_LEVELS, 'tile' => DEM_TILE, 'cacheDays' => (int)(DEM_TTL / 86400), 'newTilesPerHour' => DEM_NEW_TILES_PER_HOUR,
        'maxExecutionTime' => (int)ini_get('max_execution_time')]);
}

$int = static function (string $key): int {
    $v = filter_var($_GET[$key] ?? null, FILTER_VALIDATE_INT);
    if ($v === false || $v === null) throw new DemError(400, "Brak albo błędny parametr {$key}.");
    return (int)$v;
};

$slot = null;
try {
    $p = $int('p'); $tx = $int('tx'); $ty = $int('ty');
    dem_validate($p, $tx, $ty);
    $path = dem_tile_path($p, $tx, $ty);
    if (is_fresh($path, DEM_TTL)) {
        $bytes = (string)@file_get_contents($path);
        if (str_starts_with($bytes, 'MDM1')) dem_send($bytes, 'HIT');
    }
    // Tylko sprawdzenie cache (bez pobierania z GUGiK): 204 = kafla nie ma na serwerze.
    if (isset($_GET['cached'])) { http_response_code(204); header('Cache-Control: no-store'); header('X-Mapownik-DEM-Cache: NONE'); exit; }
    dem_rate_limit();
    @set_time_limit(DEM_UPSTREAM_TIMEOUT + 75);
    $slot = dem_acquire_slot();
    // Inne zapytanie mogło pobrać ten kafel, gdy czekaliśmy na miejsce.
    if (is_fresh($path, DEM_TTL)) { $bytes = (string)@file_get_contents($path); if (str_starts_with($bytes, 'MDM1')) dem_send($bytes, 'HIT'); }
    [$bytes, $ms] = dem_fetch_tile($p, $tx, $ty);
    atomic_write($path, $bytes);
    try { dem_maintain_cache(); } catch (Throwable) { /* porządki nie blokują odpowiedzi */ }
    dem_send($bytes, 'MISS', $ms);
} catch (DemError $e) {
    dem_json($e->status, ['ok' => false, 'error' => $e->getMessage()], $e->headers);
} catch (Throwable $e) {
    error_log('msportal dem.php: ' . $e->getMessage());
    dem_json(500, ['ok' => false, 'error' => 'Błąd serwera kafli NMT.']);
} finally {
    if (is_resource($slot)) { @flock($slot, LOCK_UN); fclose($slot); }
}
