<?php
declare(strict_types=1);
if (!defined('BDOT_NEAREST_COLLECT_CAP')) define('BDOT_NEAREST_COLLECT_CAP', 60000);

const BDOT_QUERY_CACHE_TTL_SECONDS = 2592000; // 30 dni
const BDOT_QUERY_CACHE_MAX_FILES = 5000;
const BDOT_QUERY_CACHE_MAX_BYTES = 1073741824; // 1 GiB
const BDOT_QUERY_CACHE_QUANTUM_METERS = 1.0;


function bdot_store_root(): string {
    $custom = getenv('MAPOWNIK_BDOT_STORE');
    if (is_string($custom) && trim($custom) !== '') return rtrim(trim($custom), DIRECTORY_SEPARATOR);
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'bdot_buildings';
}

function bdot_store_manifest(): ?array {
    static $cachedPath = null;
    static $cachedMtime = null;
    static $cachedManifest = null;
    $file = bdot_store_root() . DIRECTORY_SEPARATOR . 'manifest.json';
    if (!is_file($file) || !is_readable($file)) return null;
    $mtime = (int)@filemtime($file);
    if ($cachedPath === $file && $cachedMtime === $mtime && is_array($cachedManifest)) return $cachedManifest;
    $raw = @file_get_contents($file);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data)) return null;
    $tileSize = (int)($data['tileSize'] ?? 0);
    if ($tileSize < 250 || $tileSize > 50000) return null;
    if (($data['crs'] ?? '') !== 'EPSG:2180') return null;
    $cachedPath = $file;
    $cachedMtime = $mtime;
    $cachedManifest = $data;
    return $data;
}

function bdot_store_status(): array {
    $root = bdot_store_root();
    $manifest = bdot_store_manifest();
    $ready = $manifest !== null && is_dir($root . DIRECTORY_SEPARATOR . 'tiles');
    return [
        'ready' => $ready,
        'root' => $root,
        'manifest' => $manifest,
        'gzip' => function_exists('gzopen'),
        'queryCacheWritable' => bdot_query_cache_writable(),
    ];
}

function bdot_validate_bbox(array $bbox): array {
    if (count($bbox) !== 4) throw new InvalidArgumentException('bbox musi zawierać 4 liczby w EPSG:2180.');
    $v = [];
    foreach ($bbox as $raw) {
        if (is_int($raw) || is_float($raw)) {
            $n = (float)$raw;
        } elseif (is_string($raw) && is_numeric(trim($raw))) {
            $n = (float)trim($raw);
        } else {
            throw new InvalidArgumentException('bbox zawiera wartość, która nie jest liczbą.');
        }
        if (!is_finite($n)) throw new InvalidArgumentException('bbox zawiera nieprawidłową wartość.');
        $v[] = $n;
    }
    [$x1,$y1,$x2,$y2] = $v;
    $out = [min($x1,$x2), min($y1,$y2), max($x1,$x2), max($y1,$y2)];
    $w = $out[2] - $out[0];
    $h = $out[3] - $out[1];
    if ($w <= 0 || $h <= 0) throw new InvalidArgumentException('bbox ma zerowy rozmiar.');
    if ($w > 50000 || $h > 50000) throw new InvalidArgumentException('Obszar jest zbyt duży. Maksymalny wymiar zapytania to 50 km.');
    return $out;
}

function bdot_bbox_intersects(array $a, array $b): bool {
    return !($a[2] < $b[0] || $a[0] > $b[2] || $a[3] < $b[1] || $a[1] > $b[3]);
}

function bdot_category_match(string $featureCategory, string $queryCategory): bool {
    if ($queryCategory === 'all') return true;
    if ($queryCategory === 'single_family') return $featureCategory === 'single_family';
    if ($queryCategory === 'residential') return in_array($featureCategory, ['single_family','multi_family','other_residential'], true);
    return false;
}

function bdot_tile_indices(array $bbox, int $tileSize): array {
    $minTx = (int)floor($bbox[0] / $tileSize);
    $maxTx = (int)floor($bbox[2] / $tileSize);
    $minTy = (int)floor($bbox[1] / $tileSize);
    $maxTy = (int)floor($bbox[3] / $tileSize);
    $tiles = [];
    for ($tx = $minTx; $tx <= $maxTx; $tx++) {
        for ($ty = $minTy; $ty <= $maxTy; $ty++) {
            $tiles[] = [$tx,$ty];
            // 17.6: finer 2.5 km stores are supported without rejecting a 50 km query.
            if (count($tiles) > 900) throw new InvalidArgumentException('Obszar przecina zbyt wiele komórek magazynu. Zmniejsz analizowany obszar.');
        }
    }
    return $tiles;
}

function bdot_open_tile(string $root, int $tx, int $ty): array {
    $base = $root . DIRECTORY_SEPARATOR . 'tiles' . DIRECTORY_SEPARATOR . $tx . DIRECTORY_SEPARATOR . $ty;
    $gz = $base . '.ndjson.gz';
    if (is_file($gz) && is_readable($gz)) {
        if (!function_exists('gzopen')) throw new RuntimeException('Serwer PHP nie ma obsługi zlib wymaganej przez skompresowany magazyn BDOT10k.');
        $h = @gzopen($gz, 'rb');
        if ($h === false) throw new RuntimeException('Nie udało się otworzyć pliku magazynu BDOT10k.');
        return ['kind' => 'gz', 'handle' => $h, 'path' => $gz];
    }
    $plain = $base . '.ndjson';
    if (is_file($plain) && is_readable($plain)) {
        $h = @fopen($plain, 'rb');
        if ($h === false) throw new RuntimeException('Nie udało się otworzyć pliku magazynu BDOT10k.');
        return ['kind' => 'plain', 'handle' => $h, 'path' => $plain];
    }
    return ['kind' => 'missing', 'handle' => null, 'path' => $base];
}

function bdot_read_line(array $tile): string|false {
    if ($tile['kind'] === 'gz') return gzgets($tile['handle']);
    if ($tile['kind'] === 'plain') return fgets($tile['handle']);
    return false;
}

function bdot_close_tile(array $tile): void {
    if ($tile['kind'] === 'gz' && is_resource($tile['handle'])) @gzclose($tile['handle']);
    if ($tile['kind'] === 'plain' && is_resource($tile['handle'])) @fclose($tile['handle']);
}

/**
 * 17.6 query cache. The cache key contains store version + generation date,
 * therefore replacing the store invalidates old answers without deleting files.
 */
function bdot_query_cache_root(): string {
    $custom = getenv('MAPOWNIK_BDOT_QUERY_CACHE');
    if (is_string($custom) && trim($custom) !== '') return rtrim(trim($custom), DIRECTORY_SEPARATOR);
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'cache' . DIRECTORY_SEPARATOR . 'bdot-query';
}

function bdot_query_cache_policy(): array {
    return [
        'ttlSeconds' => BDOT_QUERY_CACHE_TTL_SECONDS,
        'maxFiles' => BDOT_QUERY_CACHE_MAX_FILES,
        'maxBytes' => BDOT_QUERY_CACHE_MAX_BYTES,
        'quantumMeters' => BDOT_QUERY_CACHE_QUANTUM_METERS,
    ];
}

function bdot_query_cache_writable(): bool {
    $root = bdot_query_cache_root();
    if (is_dir($root)) return is_writable($root);
    return @mkdir($root, 0775, true) || (is_dir($root) && is_writable($root));
}

function bdot_query_cache_bbox(array $bbox, float $quantum = BDOT_QUERY_CACHE_QUANTUM_METERS): array {
    $bbox = bdot_validate_bbox($bbox);
    $q = max(0.1, min(100.0, $quantum));
    // Kwantyzujemy na zewnątrz. Cache zwraca więc co najwyżej minimalnie większy
    // zestaw kandydatów, nigdy nie pomija obiektu przez kolizję klucza.
    $expanded = [
        floor($bbox[0] / $q) * $q,
        floor($bbox[1] / $q) * $q,
        ceil($bbox[2] / $q) * $q,
        ceil($bbox[3] / $q) * $q,
    ];
    // Zapytanie graniczne 50 km nie może stać się >50 km wyłącznie przez kwantyzację.
    if (($expanded[2] - $expanded[0]) > 50000 || ($expanded[3] - $expanded[1]) > 50000) {
        return array_map(static fn($v) => round((float)$v, 3), $bbox);
    }
    return $expanded;
}

function bdot_query_cache_key(array $bbox, string $category, int $limit, array $manifest): string {
    $normalized = bdot_query_cache_bbox($bbox, BDOT_QUERY_CACHE_QUANTUM_METERS);
    $identity = [
        'v' => 4,
        'coverageIndex' => isset($manifest['tileKeys']) ? count($manifest['tileKeys']) : null,
        'store' => (string)($manifest['storeVersion'] ?? 'unknown'),
        'generated' => (string)($manifest['generatedAt'] ?? ''),
        'bbox' => $normalized,
        'category' => $category,
        'limit' => $limit,
    ];
    return hash('sha256', json_encode($identity, JSON_UNESCAPED_SLASHES));
}

function bdot_query_cache_path(string $key): string {
    return bdot_query_cache_root() . DIRECTORY_SEPARATOR . substr($key, 0, 2) . DIRECTORY_SEPARATOR . $key . '.json.gz';
}

function bdot_query_cache_read(string $key, int $ttlSeconds = BDOT_QUERY_CACHE_TTL_SECONDS): ?string {
    $path = bdot_query_cache_path($key);
    if (!is_file($path) || !is_readable($path)) return null;
    $mtime = (int)@filemtime($path);
    if ($mtime <= 0 || (time() - $mtime) > $ttlSeconds) { @unlink($path); return null; }
    $raw = @file_get_contents($path);
    if (!is_string($raw) || $raw === '') return null;
    $decoded = function_exists('gzdecode') ? @gzdecode($raw) : false;
    return is_string($decoded) ? $decoded : null;
}

function bdot_query_cache_cleanup(int $ttlSeconds = BDOT_QUERY_CACHE_TTL_SECONDS, int $maxFiles = BDOT_QUERY_CACHE_MAX_FILES, int $maxBytes = BDOT_QUERY_CACHE_MAX_BYTES): array {
    $root = bdot_query_cache_root();
    if (!is_dir($root)) return ['files' => 0, 'bytes' => 0, 'removed' => 0];
    $now = time();
    $entries = [];
    $bytes = 0;
    $removed = 0;
    try {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            if (!$file->isFile() || !str_ends_with($file->getFilename(), '.json.gz')) continue;
            $path = $file->getPathname();
            $mtime = (int)$file->getMTime();
            $size = max(0, (int)$file->getSize());
            if ($mtime <= 0 || ($now - $mtime) > $ttlSeconds) {
                if (@unlink($path)) $removed++;
                continue;
            }
            $entries[] = ['path' => $path, 'mtime' => $mtime, 'size' => $size];
            $bytes += $size;
        }
    } catch (Throwable $e) {
        return ['files' => count($entries), 'bytes' => $bytes, 'removed' => $removed, 'error' => true];
    }
    if (count($entries) > $maxFiles || $bytes > $maxBytes) {
        usort($entries, static fn($a, $b) => $a['mtime'] <=> $b['mtime']);
        $remaining = count($entries);
        foreach ($entries as $entry) {
            if ($remaining <= $maxFiles && $bytes <= $maxBytes) break;
            if (@unlink($entry['path'])) {
                $bytes -= $entry['size'];
                $removed++;
                $remaining--;
            }
        }
        return ['files' => max(0, $remaining), 'bytes' => max(0, $bytes), 'removed' => $removed];
    }
    return ['files' => count($entries), 'bytes' => max(0, $bytes), 'removed' => $removed];
}

function bdot_query_cache_maybe_cleanup(): void {
    // Lekki probabilistyczny GC: średnio 1 na 100 zapisów. Wygasły plik jest też
    // kasowany natychmiast przy próbie odczytu.
    try { if (random_int(1, 100) === 1) bdot_query_cache_cleanup(); } catch (Throwable $e) { /* cache nie może blokować API */ }
}

function bdot_query_cache_write(string $key, string $json): bool {
    if (!bdot_query_cache_writable() || !function_exists('gzencode')) return false;
    $path = bdot_query_cache_path($key);
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) return false;
    $encoded = @gzencode($json, 5);
    if (!is_string($encoded)) return false;
    $tmp = $path . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $encoded, LOCK_EX) === false) return false;
    if (!@rename($tmp, $path)) { @unlink($tmp); return false; }
    bdot_query_cache_maybe_cleanup();
    return true;
}

function bdot_bbox_distance(array $a, array $b): float {
    $dx = max(0.0, max((float)$b[0] - (float)$a[2], (float)$a[0] - (float)$b[2]));
    $dy = max(0.0, max((float)$b[1] - (float)$a[3], (float)$a[1] - (float)$b[3]));
    return sqrt($dx * $dx + $dy * $dy);
}

function bdot_query_buildings(array $bbox, string $category, int $limit, ?array $near = null): array {
    $status = bdot_store_status();
    if (!$status['ready']) { error_log('msportal: brak magazynu BDOT10k w data/bdot_buildings/ (wgraj przygotowany magazyn).'); throw new RuntimeException('Lokalna baza budynków BDOT10k nie jest dostępna na tym serwerze.'); } // 19.43.0 (audyt A4): instrukcja dla administratora tylko w dzienniku
    $manifest = $status['manifest'];
    $bbox = bdot_validate_bbox($bbox);
    if (!in_array($category, ['single_family','residential','all'], true)) throw new InvalidArgumentException('Nieobsługiwana kategoria budynków.');
    $limit = max(1, min(5000, $limit));
    $tileSize = (int)$manifest['tileSize'];
    $tiles = bdot_tile_indices($bbox, $tileSize);
    $root = bdot_store_root();
    $features = [];
    $seen = [];
    $tilesRead = 0;
    $tilesMissing = 0;
    $coverageUnknown = 0;
    $expectedTiles = isset($manifest['tileKeys']) && is_array($manifest['tileKeys']) ? array_fill_keys($manifest['tileKeys'], true) : null;
    $recordsRead = 0;
    $truncated = false;
    $distances = [];

    foreach ($tiles as [$tx,$ty]) {
        $tile = bdot_open_tile($root, $tx, $ty);
        if ($tile['kind'] === 'missing') {
            if ($expectedTiles === null) $coverageUnknown++;
            elseif (isset($expectedTiles[$tx . '/' . $ty])) $tilesMissing++;
            continue;
        }
        $tilesRead++;
        try {
            while (($line = bdot_read_line($tile)) !== false) {
                $recordsRead++;
                $row = json_decode(trim($line), true);
                if (!is_array($row)) continue;
                $id = (string)($row['id'] ?? '');
                if ($id !== '' && isset($seen[$id])) continue;
                $fb = $row['bbox'] ?? null;
                if (!is_array($fb) || count($fb) !== 4 || !bdot_bbox_intersects(array_map('floatval',$fb), $bbox)) continue;
                $fc = (string)($row['category'] ?? 'other');
                if (!bdot_category_match($fc, $category)) continue;
                $geometry = $row['geometry'] ?? null;
                if (!is_array($geometry) || !in_array(($geometry['type'] ?? ''), ['Polygon','MultiPolygon'], true) || !isset($geometry['coordinates'])) continue;
                if ($id !== '') $seen[$id] = true;
                // 18.18.0: w trybie „najbliższe” zbieramy więcej (do twardego limitu
                // pamięci) i obcinamy po sortowaniu według odległości.
                $collectLimit = $near !== null ? max($limit, BDOT_NEAREST_COLLECT_CAP) : $limit;
                if (count($features) >= $collectLimit) { $truncated = true; break 2; }
                if ($near !== null) $distances[] = bdot_bbox_distance(array_map('floatval', $fb), $near);
                $features[] = [
                    'type' => 'Feature',
                    'id' => $id !== '' ? $id : null,
                    'geometry' => $geometry,
                    'properties' => array_merge((array)($row['properties'] ?? []), ['category' => $fc]),
                ];
            }
        } finally {
            bdot_close_tile($tile);
        }
    }

    $collectedCount = count($features);
    if ($near !== null && $collectedCount > 0) {
        array_multisort($distances, SORT_ASC, SORT_NUMERIC, $features);
        if ($collectedCount > $limit) { $features = array_slice($features, 0, $limit); $truncated = true; }
    }

    return [
        'features' => $features,
        'meta' => [
            'nearestFirst' => $near !== null,
            // Przy sortowaniu po odległości najbliższy budynek jest pewny, o ile
            // nie przekroczono twardego limitu zbierania.
            'nearestReliable' => $near !== null && $collectedCount < max($limit, BDOT_NEAREST_COLLECT_CAP),
            'storeVersion' => (string)($manifest['storeVersion'] ?? 'unknown'),
            'dataGeneratedAt' => $manifest['generatedAt'] ?? null,
            'sourceDataset' => $manifest['sourceDataset'] ?? 'BDOT10k OT_BUBD_A',
            'sourceCrs' => 'EPSG:2180',
            'category' => $category,
            'featureCount' => count($features),
            'limit' => $limit,
            'truncated' => $truncated,
            'tilesPlanned' => count($tiles),
            'tilesRead' => $tilesRead,
            'tilesMissing' => $tilesMissing,
            'coverageUnknown' => $coverageUnknown,
            'incomplete' => $tilesMissing > 0 || $coverageUnknown > 0,
            'recordsRead' => $recordsRead,
            'tileSize' => $tileSize,
            'indexStrategy' => $manifest['indexStrategy'] ?? 'grid',
        ],
    ];
}
