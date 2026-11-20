<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

maybe_maintain_map_cache();

/**
 * Generic read-only proxy/cache for a small whitelist of Polish public WMS
 * overlay services (cadastral parcels, protected areas, spatial planning,
 * soil-agricultural map). KIEG may be requested as a single viewport image
 * so server-rendered parcel labels are placed once instead of once per tile.
 *
 * Each "source" key maps to a fixed upstream base URL and a fixed LAYERS
 * value chosen here in code - the client (dataCatalog.js / TileWMS) only
 * ever controls the map viewport (BBOX/WIDTH/HEIGHT/CRS). It cannot choose
 * the upstream host or layer list, which keeps this from becoming an open
 * WMS proxy for arbitrary sites.
 *
 * Layer names are fixed in this whitelist. MPZP uses the full official KIMP
 * composition. The soil map uses the technical ArcGIS WMS layer id confirmed
 * by live diagnostics, with the human-readable title only as a fallback.
 */
$wmsSources = require __DIR__ . '/_wms_sources.php';

$key = (string)($_GET['source'] ?? '');
if ($key === '' || !isset($wmsSources[$key])) {
    reject_tile_request('Nieznane źródło WMS: ' . $key, 404);
}
$source = $wmsSources[$key];
$time = null;

$bbox = (string)($_GET['BBOX'] ?? $_GET['bbox'] ?? '');
if (!preg_match('/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/', $bbox)) {
    reject_tile_request('Nieprawidłowy parametr BBOX.', 400);
}

$width = filter_input(INPUT_GET, 'WIDTH', FILTER_VALIDATE_INT) ?: filter_input(INPUT_GET, 'width', FILTER_VALIDATE_INT);
$height = filter_input(INPUT_GET, 'HEIGHT', FILTER_VALIDATE_INT) ?: filter_input(INPUT_GET, 'height', FILTER_VALIDATE_INT);
if (!$width || !$height || $width < 32 || $width > 4096 || $height < 32 || $height > 4096) {
    reject_tile_request('Nieprawidłowy rozmiar obrazu WMS.', 400);
}

$crsInput = strtoupper((string)($_GET['CRS'] ?? $_GET['SRS'] ?? 'EPSG:3857'));
if (!in_array($crsInput, ['EPSG:3857', 'EPSG:2180'], true)) {
    reject_tile_request('Nieobsługiwany układ współrzędnych.', 400);
}

$variants = $source['variants'] ?? [[
    'url' => $source['url'],
    'layers' => $source['layers'],
    'version' => $source['version'] ?? '1.1.1',
]];
$resolvedCapabilitiesLayers = resolve_wms_layers_from_capabilities($source);
if ($resolvedCapabilitiesLayers !== null && $resolvedCapabilitiesLayers !== '') {
    array_unshift($variants, [
        'url' => $source['url'],
        'layers' => $resolvedCapabilitiesLayers,
        'version' => $source['version'] ?? '1.1.1',
    ]);
}

// 17.8.3 — remember the variant that last worked for this source and try it
// first. Failed variants used to be retried on every cold tile.
$variantSignature = static function (array $variant) use ($source): string {
    $parts = [
        (string)($variant['url'] ?? $source['url']),
        (string)($variant['layers'] ?? $source['layers']),
        (string)($variant['version'] ?? $source['version'] ?? '1.1.1'),
        (string)($variant['styles'] ?? ''),
    ];
    // 19.55.0: parametry stałe (np. własny styl SLD_BODY) odróżniają warianty o tych samych warstwach —
    // bez tego zapamiętany „zwycięzca” wybierał wariant zapasowy bez stylu. Dla źródeł bez parametrów podpis bez zmian.
    if (!empty($variant['fixed_params'])) $parts[] = $variant['fixed_params'];
    return hash('sha256', json_encode($parts, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '');
};
// 19.8.6 — tryb „merge: fill” (plany ogólne): obraz składany z KAŻDEGO źródła, puste
// piksele pierwszego uzupełniane kolejnymi. Ani krajowa integracja GUGiK, ani Rejestr
// Urbanistyczny nie mają wszystkich gmin (Starogard Gdański tylko w GUGiK; Szczecin,
// Białystok, Olsztyn tylko w RU), a obie usługi zwracają wtedy HTTP 200 z pustym obrazem,
// więc wybór „pierwszego działającego” wariantu zawsze gubił część kraju. Kolejność
// wariantów jest tu stała: zapamiętany „zwycięzca” nie ma sensu.
$mergeMode = (string)($source['merge'] ?? '') === 'fill';
// 17.8.3 — per-source timeout. Aggregate services (KIEG/KIUT/KIMP/POG) fan out
// to municipal and county servers and regularly need more than 5 s.
$upstreamHost = strtolower((string)parse_url((string)$source['url'], PHP_URL_HOST));
$isAggregate = $upstreamHost === 'integracja.gugik.gov.pl' || str_contains((string)$source['url'], '/wss/ext/');
$upstreamTimeout = max(3, min(25, (int)($source['timeout'] ?? ($isAggregate ? 15 : 10))));
$requestBudget = (float)($source['budget'] ?? 24);
$circuitKey = 'wms:' . $key;
@set_time_limit((int)ceil($requestBudget + $upstreamTimeout + 5));

$expectedType = (string)($source['format'] ?? 'image/png');
// Cache namespace follows the effective WMS configuration. Any change to URL,
// LAYERS, VERSION, variants, format or transparency automatically invalidates
// old entries without a manually maintained vN directory.
$configSeed = [
    'url' => $source['url'] ?? null,
    'layers' => $source['layers'] ?? null,
    'version' => $source['version'] ?? null,
    'merge_version' => $mergeMode ? 2 : 0,
    'variants' => $variants,
    'format' => $expectedType,
    'transparent' => !empty($source['transparent']),
];
$configHash = substr(hash('sha256', json_encode($configSeed, JSON_UNESCAPED_SLASHES) ?: $key), 0, 16);
$cacheSeed = [
    'source' => $key,
    'config' => $configHash,
    'bbox' => $bbox,
    'width' => $width,
    'height' => $height,
    'crs' => $crsInput,
];
if ($time !== null) $cacheSeed['time'] = $time;
$cacheKey = hash('sha256', json_encode($cacheSeed, JSON_UNESCAPED_SLASHES) ?: ($key . '|' . $configHash . '|' . $bbox));
$extension = str_contains(strtolower($expectedType), 'jpeg') ? '.jpg' : '.png';
$cache = cache_root() . '/wms/' . $key . '/' . $configHash . '/' . substr($cacheKey, 0, 2) . '/' . $cacheKey . $extension;
$ttl = (int)$source['ttl'];

if (is_fresh($cache, $ttl)) {
    if (cached_raster_valid($cache, 16, $freshCacheDimensions)) serve_file($cache, $expectedType, min($ttl,3600), 'HIT', $freshCacheDimensions);
    @unlink($cache);
}

$winnerFile = cache_root() . '/wms-winner/' . preg_replace('/[^a-z0-9_]/i', '_', $key) . '.json';
if (!$mergeMode && count($variants) > 1 && is_fresh($winnerFile, 86400)) {
    $winner = json_decode((string)@file_get_contents($winnerFile), true);
    $winnerSig = is_array($winner) ? (string)($winner['sig'] ?? '') : '';
    if ($winnerSig !== '') {
        foreach ($variants as $i => $candidate) {
            if ($i > 0 && $variantSignature($candidate) === $winnerSig) {
                array_splice($variants, $i, 1);
                array_unshift($variants, $candidate);
                break;
            }
        }
    }
}

$attemptErrors = [];
$lastStatus = 0;
$deadHosts = [];
$upstreamStartedAt = microtime(true);

/**
 * Jedno zapytanie GetMap dla wariantu. 19.8.6: bezpiecznik liczony per źródło I host —
 * wcześniej jeden wspólny bezpiecznik źródła po awarii Rejestru Urbanistycznego blokował
 * też zapasową krajową integrację GUGiK (i odwrotnie).
 */
$requestVariant = static function (array $variant, int $timeout) use ($source, $bbox, $crsInput, $width, $height, $time, $expectedType, $circuitKey): array {
    $version = (string)($variant['version'] ?? $source['version'] ?? '1.1.1');
    $layers = (string)($variant['layers'] ?? $source['layers']);
    $upstreamUrl = (string)($variant['url'] ?? $source['url']);
    $styles = array_key_exists('styles', $variant) ? (string)$variant['styles'] : '';
    // The browser always sends BBOX in conventional x/y order. WMS 1.3.0
    // follows the EPSG axis definition for EPSG:2180 (northing/easting), so
    // swap the coordinate axes only for the upstream 1.3.0 request.
    $upstreamBbox = $bbox;
    if ($version === '1.3.0' && $crsInput === 'EPSG:2180') {
        $parts = explode(',', $bbox);
        if (count($parts) === 4) {
            $upstreamBbox = implode(',', [$parts[1], $parts[0], $parts[3], $parts[2]]);
        }
    }

    // 19.50.0: wariant „eksport ArcGIS” (zapas EEA dla form ochrony przyrody) — ten sam obraz
    // (BBOX, rozmiar, układ), ale zapytanie REST `export` zamiast WMS GetMap.
    if (($variant['kind'] ?? '') === 'arcgis_export') {
        $sr = substr($crsInput, 5);
        $params = [
            'bbox' => $bbox, 'bboxSR' => $sr, 'imageSR' => $sr, 'size' => $width . ',' . $height, 'dpi' => '96',
            'layers' => $layers, 'format' => 'png32', 'transparent' => 'true', 'f' => 'image',
        ];
        if (!empty($variant['layer_defs'])) $params['layerDefs'] = (string)$variant['layer_defs'];
        if (!empty($variant['dynamic_layers'])) $params['dynamicLayers'] = (string)$variant['dynamic_layers'];
        $version = 'arcgis-export';
    } else {
    $params = [
        'SERVICE' => 'WMS',
        'VERSION' => $version,
        'REQUEST' => 'GetMap',
        'LAYERS' => $layers,
        'STYLES' => $styles,
        'FORMAT' => $expectedType,
        'TRANSPARENT' => !empty($source['transparent']) ? 'TRUE' : 'FALSE',
        'BBOX' => $upstreamBbox,
        'WIDTH' => (string)$width,
        'HEIGHT' => (string)$height,
        'EXCEPTIONS' => $version === '1.3.0' ? 'XML' : 'application/vnd.ogc.se_xml',
    ];
    if (!empty($variant['fixed_params']) && is_array($variant['fixed_params'])) {
        foreach ($variant['fixed_params'] as $paramKey => $paramValue) $params[$paramKey] = (string)$paramValue;
    }
    $params[$version === '1.3.0' ? 'CRS' : 'SRS'] = $crsInput;
    if ($time !== null) $params['TIME'] = $time;
    }
    ksort($params);
    $query = http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    $url = $upstreamUrl . '?' . $query;
    $host = strtolower((string)parse_url($upstreamUrl, PHP_URL_HOST));
    $variantCircuit = $circuitKey . '@' . $host;
    [$status, $body, $type, $error] = official_gis_remote_get($url, 'image/png,image/jpeg,image/*;q=0.9,*/*;q=0.2', $timeout, $variantCircuit);
    [$validRaster, $rasterWidth, $rasterHeight, $rasterError] = validate_raster_bytes($body, $type, 16);
    if ($validRaster && ($rasterWidth !== $width || $rasterHeight !== $height)) { $validRaster = false; $rasterError = 'Nieprawidlowe wymiary obrazu WMS'; }
    $ok = $status >= 200 && $status < 300 && $validRaster;
    if ($status >= 200 && $status < 300 && !$validRaster) gis_circuit_record('circuit:' . $variantCircuit, false);
    $bodyHint = '';
    if (!$ok && $body !== '' && !str_contains(strtolower($type), 'image/')) {
        // WMS servers often answer HTTP 200 with ServiceException XML. Extract the
        // actual exception text so diagnostics reveal a bad layer/CRS immediately.
        $snippet = substr($body, 0, 4000);
        if (preg_match('/<(?:ServiceException|ExceptionText)[^>]*>(.*?)<\/(?:ServiceException|ExceptionText)>/si', $snippet, $m)) {
            $bodyHint = html_entity_decode(trim(preg_replace('/\s+/', ' ', strip_tags($m[1])) ?? ''), ENT_QUOTES | ENT_XML1, 'UTF-8');
        }
        if ($bodyHint === '') {
            $bodyHint = html_entity_decode(trim(preg_replace('/\s+/', ' ', strip_tags($snippet)) ?? ''), ENT_QUOTES | ENT_XML1, 'UTF-8');
        }
        if (strlen($bodyHint) > 320) $bodyHint = substr($bodyHint, 0, 320) . '…';
    }
    if (!$ok && $bodyHint === '' && $status >= 200 && $status < 300 && str_contains(strtolower($type), 'image/')) {
        $bodyHint = $rasterError . ($rasterWidth || $rasterHeight ? ' ' . $rasterWidth . 'x' . $rasterHeight : '');
    }
    return [
        'ok' => $ok, 'status' => $status, 'body' => $body, 'type' => $type, 'error' => (string)$error,
        'width' => $rasterWidth, 'height' => $rasterHeight, 'version' => $version, 'layers' => $layers,
        'host' => $host, 'hint' => $bodyHint,
        // Usługa nie odpowiada (albo bezpiecznik jest otwarty): kolejne warianty na TYM SAMYM
        // hoście nic nie dadzą, ale wariant z innego hosta wciąż może.
        'unreachable' => gis_is_timeout_error((string)$error) || str_starts_with((string)$error, 'circuit ') || $status === 0,
    ];
};
$describeAttempt = static function (int $index, array $r): string {
    return 'v' . ($index + 1) . ' HTTP ' . $r['status'] . ($r['type'] !== '' ? ' ' . $r['type'] : '') . ($r['error'] !== '' ? ' ' . $r['error'] : '') . ($r['hint'] !== '' ? ' ' . $r['hint'] : '');
};
$remainingTimeout = static function () use ($upstreamStartedAt, $requestBudget, $upstreamTimeout): int {
    $remainingBudget = (int)floor($requestBudget - (microtime(true) - $upstreamStartedAt));
    return $remainingBudget < 1 ? 0 : min($upstreamTimeout, $remainingBudget);
};

if ($mergeMode) {
    // Jeden udany obraz z każdego hosta (w obrębie hosta warianty jak dotąd: pierwszy działający).
    $layersOk = [];
    $hostsTried = [];
    // Mianownik skali obrazu (0,28 mm/piksel, jak w WMS); EPSG:3857 i 2180 mają jednostki metrowe.
    $bboxParts = array_map('floatval', explode(',', $bbox));
    $requestScale = ($bboxParts[2] - $bboxParts[0]) / $width / 0.00028;
    foreach ($variants as $index => $variant) {
        // Wariant poza swoim zakresem skal (strefy Rejestru Urbanistycznego: od 1:10 000) zwróciłby
        // pusty obraz — nie pytamy go i nie liczymy jako brakującego źródła.
        if (isset($variant['max_scale']) && $requestScale > (float)$variant['max_scale']) continue;
        $host = strtolower((string)parse_url((string)($variant['url'] ?? $source['url']), PHP_URL_HOST));
        $hostsTried[$host] = true;
        if (isset($layersOk[$host]) || ($deadHosts[$host] ?? false)) continue;
        $attemptTimeout = $remainingTimeout();
        if ($attemptTimeout < 1) { $attemptErrors[] = 'budżet czasu ' . (int)$requestBudget . ' s wyczerpany'; break; }
        // Źródło uzupełniające ma krótszy limit: wolny Rejestr Urbanistyczny (bywa 503 po 10 s)
        // nie może opóźniać kafli, które krajowa integracja już narysowała. Najgorzej 8 + 5 s,
        // poniżej limitu przeglądarki (proxyTimeoutMs 15 s).
        if ($layersOk || $deadHosts) $attemptTimeout = min($attemptTimeout, max(2, (int)($source['merge_secondary_timeout'] ?? 5)));
        $r = $requestVariant($variant, $attemptTimeout);
        $lastStatus = $r['status'];
        if ($r['ok']) { $layersOk[$host] = $r; continue; }
        $attemptErrors[] = $describeAttempt($index, $r);
        if ($r['unreachable']) $deadHosts[$host] = true;
    }
    if ($layersOk) {
        $parts = array_values($layersOk);
        $body = count($parts) > 1 ? wms_merge_fill(array_column($parts, 'body'), $merged) : null;
        $used = $body === null ? 1 : $merged;
        $body ??= $parts[0]['body'];
        $complete = $used === count($hostsTried);
        // Gdy jedno źródło nie odpowiada (np. Rejestr Urbanistyczny: HTTP 503 po 10 s), wcześniejszy
        // pełny obraz tego kafla jest lepszy niż świeży bez części gmin.
        if (!$complete && is_file($cache) && cached_raster_valid($cache, 16, $staleMergeDimensions)) {
            serve_file($cache, $expectedType, 300, 'STALE', $staleMergeDimensions);
        }
        if ($complete) atomic_write($cache, $body);
        // Obraz bez jednego ze źródeł jest lepszy niż żaden, ale nie może zostać w pamięci na dobę:
        // ważny jeszcze tylko 15 minut (is_fresh liczy od czasu modyfikacji pliku).
        if (!$complete) header('X-MSPortal-Partial: 1');
        header('X-MSPortal-Raster-Size: ' . $width . 'x' . $height);
        header('X-MSPortal-WMS-Merge: ' . $used . '/' . count($hostsTried) . ' ' . implode(',', array_keys($layersOk)));
        if ($attemptErrors) header('X-MSPortal-Upstream-Error: ' . preg_replace('/[^A-Za-z0-9 ._:-]/', '', implode(' | ', $attemptErrors)));
        header('X-MSPortal-Upstream-Ms: ' . (string)max(0, (int)round((microtime(true) - $upstreamStartedAt) * 1000)));
        serve_bytes($body, $expectedType, 'MISS', $complete ? min($ttl, 3600) : 300);
    }
}

foreach ($mergeMode ? [] : $variants as $index => $variant) {
    if ($index > 0 && (microtime(true) - $upstreamStartedAt) >= $requestBudget) {
        $attemptErrors[] = 'budżet czasu ' . (int)$requestBudget . ' s wyczerpany';
        break;
    }
    $host = strtolower((string)parse_url((string)($variant['url'] ?? $source['url']), PHP_URL_HOST));
    if ($deadHosts[$host] ?? false) continue;
    $attemptTimeout = $remainingTimeout();
    if ($attemptTimeout < 1) break;
    $r = $requestVariant($variant, $attemptTimeout);
    $lastStatus = $r['status'];
    if ($r['ok']) {
        $servedType = strtok($r['type'], ';') ?: $expectedType;
        atomic_write($cache, $r['body']);
        if (count($variants) > 1) atomic_write($winnerFile, json_encode(['sig' => $variantSignature($variant), 'index' => $index, 'at' => time()]) ?: '{}');
        header('X-MSPortal-Raster-Size: ' . $r['width'] . 'x' . $r['height']);
        header('X-MSPortal-WMS-Variant: ' . ($index + 1));
        if ($resolvedCapabilitiesLayers !== null && $r['layers'] === $resolvedCapabilitiesLayers) {
            header('X-MSPortal-WMS-Layers-Resolved: capabilities');
        }
        header('X-MSPortal-WMS-Version: ' . $r['version']);
        header('X-MSPortal-WMS-Timeout: ' . $upstreamTimeout);
        header('X-MSPortal-WMS-Axis: ' . (($r['version'] === '1.3.0' && $crsInput === 'EPSG:2180') ? 'yx' : 'xy'));
        header('X-MSPortal-Upstream-Ms: ' . (string)max(0, (int)round((microtime(true) - $upstreamStartedAt) * 1000)));
        serve_bytes($r['body'], $servedType, 'MISS', min($ttl,3600));
    }
    $attemptErrors[] = $describeAttempt($index, $r);
    // 17.8.3: another variant only helps when the upstream answered and rejected
    // this request (bad layer name, CRS, ServiceException). A timeout or an open
    // circuit means the service itself is unavailable — skip its other variants.
    // 19.8.6: …but still try variants on a different host (e.g. GUGiK → Rejestr Urbanistyczny).
    if ($r['unreachable']) $deadHosts[$host] = true;
}

if (is_file($cache) && cached_raster_valid($cache, 16, $staleCacheDimensions)) {
    // A stale but valid image is safer than a blank replacement while a public
    // upstream is temporarily unavailable.
    serve_file($cache, $expectedType, 3600, 'STALE', $staleCacheDimensions);
}
if (($source['error_mode'] ?? '') === 'http') {
    http_response_code(502);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-MSPortal-Upstream-Status: ' . ($lastStatus ?: 502));
    header('X-MSPortal-Upstream-Error: ' . preg_replace('/[^A-Za-z0-9 ._:-]/', '', 'WMS ' . $key . ' ' . implode(' | ', $attemptErrors)));
    exit('Chwilowy błąd źródła WMS. Poprzedni kafel pozostaje na mapie.');
}
fail_tile('WMS ' . $key . ' — ' . implode(' | ', $attemptErrors), $lastStatus ?: 502);
