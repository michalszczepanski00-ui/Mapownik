<?php
declare(strict_types=1);
require_once __DIR__ . '/_analysis_buildings_store.php';

header('Content-Type: application/geo+json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function reply_json(int $status, array $payload, string $cacheState = 'BYPASS'): never {
    http_response_code($status);
    header('Cache-Control: no-store');
    header('X-MSPortal-BDOT-Cache: ' . $cacheState);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function send_query_json(string $json, string $etag, string $cacheState): never {
    header('Cache-Control: public, max-age=300, stale-while-revalidate=1800');
    header('ETag: "' . $etag . '"');
    header('X-MSPortal-BDOT-Cache: ' . $cacheState);
    echo $json;
    exit;
}

try {
    $action = strtolower(trim((string)($_GET['action'] ?? 'query')));
    if ($action === 'status') {
        $status = bdot_store_status();
        $manifest = $status['manifest'];
        reply_json(200, [
            'ok' => true,
            'ready' => (bool)$status['ready'],
            'gzip' => (bool)$status['gzip'],
            'queryCacheWritable' => (bool)$status['queryCacheWritable'],
            'storeVersion' => $manifest['storeVersion'] ?? null,
            'generatedAt' => $manifest['generatedAt'] ?? null,
            'sourceDataset' => $manifest['sourceDataset'] ?? null,
            'tileSize' => $manifest['tileSize'] ?? null,
            'featureCount' => $manifest['featureCount'] ?? null,
            'categories' => $manifest['categories'] ?? null,
            'indexStrategy' => $manifest['indexStrategy'] ?? 'grid',
            'bounds' => $manifest['bounds'] ?? null,
            'queryCachePolicy' => bdot_query_cache_policy(),
        ]);
    }
    if ($action !== 'query') reply_json(400, ['ok' => false, 'error' => 'Nieznana akcja.']);

    $rawBbox = trim((string)($_GET['bbox'] ?? ''));
    if ($rawBbox === '') reply_json(400, ['ok' => false, 'error' => 'Brak parametru bbox.']);
    $bbox = bdot_validate_bbox(array_map('trim', explode(',', $rawBbox)));
    $category = strtolower(trim((string)($_GET['category'] ?? 'single_family')));
    if (!in_array($category, ['single_family','residential','all'], true)) throw new InvalidArgumentException('Nieobsługiwana kategoria budynków.');
    // 18.18.0: limit do 20 000 (ustawiany w panelu Analiz); z parametrem `near`
    // serwer zwraca NAJBLIŻSZE budynki zamiast pierwszych w kolejności kafli.
    $limit = max(1, min(20000, (int)($_GET['limit'] ?? 1200)));
    $near = null;
    $rawNear = trim((string)($_GET['near'] ?? ''));
    if ($rawNear !== '') $near = bdot_validate_bbox(array_map('trim', explode(',', $rawNear)));

    $status = bdot_store_status();
    if (!$status['ready']) { error_log('msportal: brak magazynu BDOT10k w data/bdot_buildings/ (wgraj przygotowany magazyn).'); throw new RuntimeException('Lokalna baza budynków BDOT10k nie jest dostępna na tym serwerze.'); } // 19.43.0 (audyt A4): instrukcja dla administratora tylko w dzienniku
    $manifest = $status['manifest'];
    $queryBbox = bdot_query_cache_bbox($bbox, BDOT_QUERY_CACHE_QUANTUM_METERS);
    $key = bdot_query_cache_key($queryBbox, $category, $limit, $manifest);
    if ($near !== null) $key = hash('sha256', $key . '|near:' . implode(',', array_map(static fn($v) => (string)round((float)$v, -1), $near)));
    $etag = 'bdot-' . substr($key, 0, 24);
    $ifNoneMatch = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''), " \t\n\r\0\x0B\"");
    if ($ifNoneMatch === $etag) {
        http_response_code(304);
        header('Cache-Control: public, max-age=300, stale-while-revalidate=1800');
        header('ETag: "' . $etag . '"');
        header('X-MSPortal-BDOT-Cache: HTTP-304');
        exit;
    }

    $cached = bdot_query_cache_read($key);
    if (is_string($cached)) send_query_json($cached, $etag, 'HIT');

    $result = bdot_query_buildings($queryBbox, $category, $limit, $near);
    $result['meta']['requestedBbox'] = $bbox;
    $result['meta']['cacheBbox'] = $queryBbox;
    $payload = [
        'ok' => true,
        'type' => 'FeatureCollection',
        'features' => $result['features'],
        'meta' => $result['meta'],
    ];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if (!is_string($json)) throw new RuntimeException('Nie udało się zakodować odpowiedzi BDOT10k.');
    bdot_query_cache_write($key, $json);
    send_query_json($json, $etag, 'MISS');
} catch (InvalidArgumentException $e) {
    reply_json(400, ['ok' => false, 'error' => $e->getMessage()]);
} catch (RuntimeException $e) {
    reply_json(503, ['ok' => false, 'error' => $e->getMessage(), 'code' => 'BDOT_STORE_UNAVAILABLE']);
} catch (Throwable $e) {
    reply_json(500, ['ok' => false, 'error' => 'Błąd lokalnego magazynu BDOT10k.']);
}
