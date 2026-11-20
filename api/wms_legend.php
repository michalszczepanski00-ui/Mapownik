<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

/**
 * Legendy warstw WMS (GetLegendGraphic) z tej samej białej listy źródeł,
 * co GetMap w wms.php.
 *
 * Powód istnienia osobnego pliku: wms.php ma na sztywno REQUEST=GetMap
 * i wymaga BBOX/WIDTH/HEIGHT, których legenda nie ma. Wzorzec „drugi typ
 * zapytania WMS przez ten sam serwer" jest już w identify.php
 * (GetFeatureInfo), więc to trzeci punkt tej samej konstrukcji, a nie nowa.
 *
 * Bezpieczeństwo jest identyczne jak w wms.php: klient podaje WYŁĄCZNIE klucz
 * źródła i nazwę warstwy, która musi wystąpić w kompozycji zapisanej w kodzie.
 * Ani adres serwera, ani dowolna nazwa warstwy nie przechodzą z zewnątrz, więc
 * to nie staje się otwartym proxy WMS.
 *
 * Dwa tryby:
 *   ?source=KLUCZ              -> JSON ze spisem legend do pobrania
 *   ?source=KLUCZ&layer=NAZWA  -> PNG jednej legendy
 *
 * Spis zamiast jednego obrazka, bo kompozycje bywają wielowarstwowe (BDOT10k
 * transport: 16 warstw, MPZP: 7). Zwrócenie legendy tylko pierwszej z nich
 * wyglądałoby na kompletną, a nie byłoby.
 */

$wmsSources = require __DIR__ . '/_wms_sources.php';

/** Maksimum legend na warstwę — 16 obrazków to ściana, nie legenda. */
const LEGEND_MAX_ENTRIES = 8;

/** Legendy zmieniają się rzadko; tydzień to i tak ostrożnie. */
const LEGEND_TTL = 7 * 86400;

$key = (string)($_GET['source'] ?? '');
if ($key === '' || !isset($wmsSources[$key])) {
    reject_tile_request('Nieznane źródło WMS: ' . $key, 404);
}
$source = $wmsSources[$key];

/**
 * Nazwy warstw kompozycji. Uwaga na warstwy nazwane "0" (mapa glebowo-rolnicza,
 * MIDAS) — filtrowanie po prawdziwości wycięłoby je po cichu.
 */
function legend_layer_names(array $source): array {
    $raw = (string)($source['layers'] ?? ($source['variants'][0]['layers'] ?? ''));
    $names = array_map('trim', explode(',', $raw));
    return array_values(array_filter($names, static fn (string $name): bool => $name !== ''));
}

$layers = legend_layer_names($source);
if ($layers === []) {
    reject_tile_request('Źródło ' . $key . ' nie ma zadeklarowanych warstw.', 404);
}

$requested = isset($_GET['layer']) ? trim((string)$_GET['layer']) : '';

// ---------------------------------------------------------------- tryb spisu
if ($requested === '') {
    $shown = array_slice($layers, 0, LEGEND_MAX_ENTRIES);
    $entries = [];
    foreach ($shown as $name) {
        $entries[] = [
            'layer' => $name,
            'url' => './api/wms_legend.php?source=' . rawurlencode($key) . '&layer=' . rawurlencode($name),
        ];
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: public, max-age=86400');
    echo json_encode([
        'source' => $key,
        'total' => count($layers),
        'shown' => count($entries),
        'entries' => $entries,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// ------------------------------------------------------------- tryb obrazka
if (!in_array($requested, $layers, true)) {
    reject_tile_request('Warstwa spoza kompozycji źródła ' . $key . '.', 400);
}

// Nazwa techniczna stref bywa różna w kolejnych publikacjach usługi.
// Resolve wybiera tę samą warstwę z GetCapabilities co mapa i identyfikacja.
if ($key === 'pog_zones') {
    $resolved = resolve_wms_layers_from_capabilities($source);
    if ($resolved !== null && $resolved !== '') $requested = $resolved;
}

$version = (string)($source['version'] ?? ($source['variants'][0]['version'] ?? '1.1.1'));
$upstreamUrl = (string)($source['url'] ?? ($source['variants'][0]['url'] ?? ''));
if ($upstreamUrl === '') {
    reject_tile_request('Źródło ' . $key . ' nie ma adresu WMS.', 404);
}

$cacheSeed = ['source' => $key, 'layer' => $requested, 'version' => $version, 'url' => $upstreamUrl];
$cacheKey = hash('sha256', json_encode($cacheSeed, JSON_UNESCAPED_SLASHES) ?: ($key . '|' . $requested));
$cache = cache_root() . '/legend/' . $key . '/' . substr($cacheKey, 0, 2) . '/' . $cacheKey . '.png';

if (is_fresh($cache, LEGEND_TTL) && cached_raster_valid($cache, 4, $dimensions)) {
    serve_file($cache, 'image/png', LEGEND_TTL, 'HIT', $dimensions);
}

$params = [
    'SERVICE' => 'WMS',
    'VERSION' => $version,
    'REQUEST' => 'GetLegendGraphic',
    'LAYER' => $requested,
    'FORMAT' => 'image/png',
    'TRANSPARENT' => 'TRUE',
    'EXCEPTIONS' => $version === '1.3.0' ? 'XML' : 'application/vnd.ogc.se_xml',
    // Czytelne etykiety zamiast domyślnych 10 px serwera.
    'LEGEND_OPTIONS' => 'fontAntiAliasing:true;fontSize:11;dpi:96',
];
ksort($params);
$url = $upstreamUrl . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);

$timeout = (int)($source['legend_timeout'] ?? $source['timeout'] ?? 8);
[$status, $body, $type, $error] = official_gis_remote_get(
    $url,
    'image/png,image/*;q=0.9,*/*;q=0.2',
    max(3, min(20, $timeout)),
    'legend:' . $key
);
// Legenda bywa wąskim paskiem kilku pikseli, więc próg wymiaru jest niższy
// niż przy kaflach mapy.
[$valid, $legendWidth, $legendHeight, $rasterError] = validate_raster_bytes($body, $type, 4);

if ($status >= 200 && $status < 300 && $valid) {
    atomic_write($cache, $body);
    header('X-MSPortal-Legend-Size: ' . $legendWidth . 'x' . $legendHeight);
    header('X-MSPortal-WMS-Version: ' . $version);
    serve_bytes($body, strtok($type, ';') ?: 'image/png', 'MISS', LEGEND_TTL);
}

// Nieaktualna legenda jest lepsza niż brak: zmienia się raz na lata.
if (is_file($cache) && cached_raster_valid($cache, 4, $staleDimensions)) {
    serve_file($cache, 'image/png', 3600, 'STALE', $staleDimensions);
}

$hint = '';
if ($body !== '' && !str_contains(strtolower($type), 'image/')) {
    $snippet = substr($body, 0, 2000);
    if (preg_match('/<(?:ServiceException|ExceptionText)[^>]*>(.*?)<\/(?:ServiceException|ExceptionText)>/si', $snippet, $m)) {
        $hint = html_entity_decode(trim(preg_replace('/\s+/', ' ', strip_tags($m[1])) ?? ''), ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
    if ($hint === '') {
        $hint = trim(preg_replace('/\s+/', ' ', strip_tags($snippet)) ?? '');
    }
    if (strlen($hint) > 240) $hint = substr($hint, 0, 240) . '…';
}
if ($hint === '' && $status >= 200 && $status < 300 && !$valid) {
    $hint = $rasterError;
}

http_response_code($status >= 400 ? $status : 502);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-MSPortal-Upstream-Status: ' . $status);
header('X-MSPortal-Upstream-Error: ' . preg_replace('/[^A-Za-z0-9 ._:-]/', '', 'legend ' . $key . ' ' . $requested . ' ' . $error . ' ' . $hint));
exit('Legenda niedostępna dla warstwy ' . $requested . '.');
