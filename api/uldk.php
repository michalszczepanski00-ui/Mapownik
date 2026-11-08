<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function uldk_fail(string $message, int $status = 502): never {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function numeric_query(string $key): float {
    $raw = $_GET[$key] ?? null;
    if (!is_string($raw) || $raw === '' || !is_numeric($raw)) {
        uldk_fail('Nieprawidłowe współrzędne zapytania.', 400);
    }
    $value = (float)$raw;
    if (!is_finite($value)) uldk_fail('Nieprawidłowe współrzędne zapytania.', 400);
    return $value;
}

$x = numeric_query('x');
$y = numeric_query('y');

// Rozsądny zakres roboczy EPSG:2180 dla Polski z niewielkim marginesem.
if ($x < 100000 || $x > 950000 || $y < 50000 || $y > 1000000) {
    uldk_fail('Punkt znajduje się poza obsługiwanym zakresem EPSG:2180.', 400);
}

$params = [
    'request' => 'GetParcelByXY',
    'xy' => rtrim(rtrim(sprintf('%.3F', $x), '0'), '.') . ',' . rtrim(rtrim(sprintf('%.3F', $y), '0'), '.') . ',2180',
    'result' => 'teryt,parcel,region,commune,county,voivodeship,datasource,geom_wkt',
    'srid' => '2180',
];
$url = 'https://uldk.gugik.gov.pl/?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
[$status, $body, $type, $error] = vendor_remote_get($url, 'text/plain, text/*;q=0.9, */*;q=0.5');

if ($status < 200 || $status >= 300 || trim($body) === '') {
    if ($error !== '') error_log('msportal uldk.php: ' . $error);
    uldk_fail('Usługa ULDK jest chwilowo niedostępna.', 502);
}

$body = preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body;
$lines = preg_split('/\R/u', trim($body)) ?: [];
$statusLine = trim((string)array_shift($lines));
if ($statusLine === '' || $statusLine[0] !== '0') {
    $details = trim(implode(' ', $lines));
    uldk_fail($details !== '' ? $details : 'ULDK nie znalazł działki dla wskazanego punktu.', 404);
}

$payload = trim(implode("\n", $lines));
if ($payload === '') uldk_fail('ULDK zwrócił pustą odpowiedź.', 502);

if (!preg_match('~(?:SRID\s*=\s*\d+\s*;\s*)?(?:MULTIPOLYGON|POLYGON)\s*\(~i', $payload, $match, PREG_OFFSET_CAPTURE)) {
    uldk_fail('ULDK nie zwrócił geometrii działki w formacie WKT.', 502);
}

$wktOffset = (int)$match[0][1];
$wkt = trim(substr($payload, $wktOffset));
$prefix = rtrim(trim(substr($payload, 0, $wktOffset)), "|;\t ");
$fields = [];
if ($prefix !== '') {
    if (str_contains($prefix, '|')) $fields = array_map('trim', explode('|', $prefix));
    elseif (str_contains($prefix, "\t")) $fields = array_map('trim', explode("\t", $prefix));
    elseif (str_contains($prefix, ';')) $fields = array_map('trim', explode(';', $prefix));
    else $fields = [trim($prefix)];
}
while (count($fields) < 7) $fields[] = '';

[$id, $parcel, $region, $commune, $county, $voivodeship, $datasource] = array_slice($fields, 0, 7);

// Część wdrożeń ULDK potrafi zwracać tylko geometrię mimo żądania atrybutów.
// Nie blokujemy wtedy utworzenia obiektu; klient zbuduje bezpieczną nazwę zastępczą.
echo json_encode([
    'ok' => true,
    'parcel' => [
        'id' => $id !== '' ? $id : null,
        'parcel' => $parcel !== '' ? $parcel : null,
        'region' => $region !== '' ? $region : null,
        'commune' => $commune !== '' ? $commune : null,
        'county' => $county !== '' ? $county : null,
        'voivodeship' => $voivodeship !== '' ? $voivodeship : null,
        'datasource' => $datasource !== '' ? $datasource : null,
        'wkt' => $wkt,
        'srid' => 2180,
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
