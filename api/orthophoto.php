<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/_orthophoto.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
maybe_maintain_map_cache();
function ortho_reply(array $data, int $status = 200): never {
    http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit;
}
$base = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime';
$mode = (string)($_GET['mode'] ?? 'dates');
if ($mode === 'dates') {
    $cache = cache_root() . '/orthophoto/dates-v1.json';
    $cached = is_file($cache) ? json_decode((string)file_get_contents($cache), true) : null;
    if (is_fresh($cache, 86400) && is_array($cached) && !empty($cached['months'])) ortho_reply($cached);
    [$status, $body] = official_gis_remote_get($base . '?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0', 'application/xml,text/xml', 12, 'ortho-dates');
    $months = $status === 200 && strlen($body) < 2000000 ? orthophoto_months($body) : [];
    if (!$months) {
        if (is_array($cached) && !empty($cached['months'])) ortho_reply([...$cached, 'rangeStale' => true]);
        ortho_reply(['ok' => true, 'months' => orthophoto_verified_months(), 'checkedAt' => '2026-10-03', 'rangeStale' => true]);
    }
    $data = ['ok' => true, 'months' => $months, 'checkedAt' => gmdate('c')];
    atomic_write($cache, json_encode($data, JSON_UNESCAPED_SLASHES) ?: '{}'); ortho_reply($data);
}
if ($mode !== 'point') ortho_reply(['ok' => false, 'error' => 'Nieznana operacja.'], 400);
$x = filter_input(INPUT_GET, 'x', FILTER_VALIDATE_FLOAT); $y = filter_input(INPUT_GET, 'y', FILTER_VALIDATE_FLOAT);
if (!is_numeric($x) || !is_numeric($y) || !is_finite((float)$x) || !is_finite((float)$y) || $x < 100000 || $x > 900000 || $y < 100000 || $y > 950000) ortho_reply(['ok' => false, 'error' => 'Nieprawidłowe współrzędne.'], 400);
$x = round((float)$x); $y = round((float)$y);
$cache = cache_root() . '/orthophoto/points/' . hash('sha256', $x . ':' . $y) . '.json';
if (is_fresh($cache, 86400)) {
    $data = json_decode((string)file_get_contents($cache), true);
    if (is_array($data) && ($data['ok'] ?? false)) ortho_reply($data);
}
$params = ['SERVICE' => 'WMS', 'VERSION' => '1.1.1', 'REQUEST' => 'GetFeatureInfo', 'LAYERS' => 'Raster', 'QUERY_LAYERS' => 'Raster',
    'STYLES' => '', 'SRS' => 'EPSG:2180', 'BBOX' => implode(',', [$x - 5, $y - 5, $x + 5, $y + 5]),
    'WIDTH' => '101', 'HEIGHT' => '101', 'X' => '50', 'Y' => '50', 'FEATURE_COUNT' => '10', 'INFO_FORMAT' => 'text/plain', 'FORMAT' => 'image/png'];
[$status, $body] = official_gis_remote_get($base . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986), 'text/plain', 12, 'ortho-point');
if ($status !== 200 || strlen($body) > 1000000 || preg_match('/<(?:\w+:)?(?:ServiceException|ExceptionReport|html)\b/i', $body)) ortho_reply(['ok' => false, 'error' => 'Nie udało się odczytać danych zdjęć.'], 502);
$records = orthophoto_records($body);
if (!$records && !preg_match('/Search returned no results/i', $body)) ortho_reply(['ok' => false, 'error' => 'Nie rozpoznano formatu danych zdjęć.'], 502);
$data = ['ok' => true, 'coordinate' => [$x, $y], 'records' => $records, 'checkedAt' => gmdate('c')];
atomic_write($cache, json_encode($data, JSON_UNESCAPED_SLASHES) ?: '{}'); ortho_reply($data);
