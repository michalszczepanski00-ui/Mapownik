<?php
declare(strict_types=1);
/**
 * 19.8.6 — kontrola źródeł planistycznych w punktach kontrolnych (cron, PHP CLI).
 *
 * Monitor w aplikacji sprawdza konfigurację główną w dowolnym punkcie i słusznie nie uznaje
 * pustej próbki za awarię. Ten skrypt pyta KAŻDE źródło osobno w miejscach, gdzie dane
 * na pewno były (sprawdzone 28.10.2026). Pusty obraz w takim miejscu to luka albo awaria
 * usługi, której zwykły test HTTP nie widzi — tak wyglądały braki planów ogólnych
 * (Starogard Gdański tylko w GUGiK; Szczecin, Białystok, Olsztyn tylko w Rejestrze).
 *
 *   php tools/check_sources.php
 *   php tools/check_sources.php --portal=https://mapownik.swiadectwa.net/test22/   (też scalone kafle wms.php)
 *   php tools/check_sources.php --json=cache/check_sources.json --mail=admin@example.org
 *
 * Kod wyjścia: 0 — wszystko w porządku, 1 — co najmniej jedno sprawdzenie nie przeszło.
 * Katalog tools/ jest niedostępny z WWW (.htaccess); skrypt i tak działa tylko z wiersza poleceń.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../api/_common.php';

const MIN_DRAWN = 0.01; // udział narysowanych pikseli, poniżej którego obraz uznajemy za pusty

$profiles = json_decode((string)file_get_contents(__DIR__ . '/../data/source-profiles.json'), true)['sources'];
$variantFor = static function (string $key, string $host) use ($profiles): array {
    foreach ($profiles[$key]['variants'] as $variant) {
        if (parse_url($variant['url'], PHP_URL_HOST) === $host) return $variant;
    }
    throw new RuntimeException("Brak wariantu $host w $key");
};
const GUGIK = 'mapy.geoportal.gov.pl';
const RU = 'rejestr-urbanistyczny.gov.pl';

/** [nazwa => [url, warstwy, wersja, [miejsce => [lon, lat, zoom]], klucz wms.php]] — zoom w siatce EPSG:3857. */
$checks = [
    'Strefy POG — GUGiK' => $variantFor('pog_zones', GUGIK) + ['points' => ['Starogard Gdański' => [18.530, 53.966, 17], 'Poznań' => [16.925, 52.406, 17]]],
    'Strefy POG — Rejestr Urbanistyczny' => $variantFor('pog_zones', RU) + ['points' => ['Szczecin' => [14.553, 53.428, 17], 'Białystok' => [23.163, 53.133, 17]]],
    'Obszary POG — Rejestr Urbanistyczny' => $variantFor('pog_adopted', RU) + ['points' => ['Szczecin' => [14.553, 53.428, 15], 'Olsztyn' => [20.480, 53.778, 13]]],
    'MPZP — krajowa integracja' => ['url' => 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego',
        'layers' => 'granice,raster,wektor-str,wektor-lzb,wektor-lin,wektor-pow,wektor-pkt', 'version' => '1.1.1',
        'points' => ['Kraków' => [19.945, 50.065, 17], 'Piaseczno' => [21.023, 52.081, 17], 'Białystok' => [23.163, 53.133, 17]]],
];

function check_get(string $url, int $timeout = 20): array {
    $attempt = static function () use ($url, $timeout): array {
        $ch = curl_init($url);
        $options = [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => $timeout, CURLOPT_USERAGENT => MAPOWNIK_USER_AGENT . ' source-check'];
        $ca = mapownik_ca_bundle();
        if ($ca !== null) $options[CURLOPT_CAINFO] = $ca;
        curl_setopt_array($ch, $options);
        $start = microtime(true);
        $body = curl_exec($ch);
        $result = ['code' => (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'type' => (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE),
            'body' => is_string($body) ? $body : '', 'error' => is_string($body) ? '' : curl_error($ch), 'seconds' => round(microtime(true) - $start, 2)];
        curl_close($ch);
        return $result;
    };
    // Jedno ponowienie po błędzie sieci: pojedyncze zerwane połączenie nie jest jeszcze awarią.
    $result = $attempt();
    return $result['error'] === '' ? $result : $attempt();
}

/** Kafel 512 px siatki EPSG:3857 zawierający punkt (jak kafle Mapownika). */
function check_tile(float $lon, float $lat, int $zoom): array {
    $o = 20037508.342789244;
    $x = $lon * $o / 180;
    $y = log(tan((90 + $lat) * M_PI / 360)) * $o / M_PI;
    $span = 4 * $o / (2 ** $zoom);
    $i = floor(($x + $o) / $span);
    $j = floor(($y + $o) / $span);
    return [$i * $span - $o, $j * $span - $o, ($i + 1) * $span - $o, ($j + 1) * $span - $o];
}

/** Udział pikseli, które nie są przezroczyste ani białe (próbka co 8 px). */
function check_drawn(string $png): ?float {
    $image = @imagecreatefromstring($png);
    if ($image === false) return null;
    $drawn = $all = 0;
    for ($x = 0; $x < imagesx($image); $x += 8) {
        for ($y = 0; $y < imagesy($image); $y += 8) {
            $c = imagecolorsforindex($image, imagecolorat($image, $x, $y));
            $all++;
            if ($c['alpha'] < 127 && !($c['red'] >= 254 && $c['green'] >= 254 && $c['blue'] >= 254)) $drawn++;
        }
    }
    imagedestroy($image);
    return $all ? $drawn / $all : null;
}

function check_image(string $url): array {
    $r = check_get($url);
    $share = str_starts_with($r['type'], 'image/') ? check_drawn($r['body']) : null;
    if ($r['code'] !== 200 || $share === null) {
        $hint = $r['error'] ?: trim(substr(preg_replace('/\s+/', ' ', strip_tags($r['body'])) ?? '', 0, 120));
        return [false, "HTTP {$r['code']} {$r['type']} $hint", $r['seconds']];
    }
    if ($share < MIN_DRAWN) return [false, 'pusty obraz — usługa działa, ale nie zwraca danych tam, gdzie były', $r['seconds']];
    return [true, sprintf('%.0f%% narysowane', $share * 100), $r['seconds']];
}

$options = getopt('', ['json:', 'mail:', 'portal:']);
$report = ['checked_at' => date(DATE_ATOM), 'version' => trim((string)@file_get_contents(__DIR__ . '/../VERSION.txt')), 'checks' => []];
$problems = [];
$record = static function (string $name, string $place, array $result) use (&$report, &$problems): void {
    [$ok, $message, $seconds] = $result;
    $report['checks'][] = ['check' => $name, 'place' => $place, 'ok' => $ok, 'message' => $message, 'seconds' => $seconds];
    printf("%s %-38s %-18s %5.1f s  %s\n", $ok ? 'OK  ' : 'BŁĄD', $name, $place, $seconds, $message);
    if (!$ok) $problems[] = "$name, $place: $message";
};

foreach ($checks as $name => $def) {
    $caps = check_get($def['url'] . '?SERVICE=WMS&REQUEST=GetCapabilities');
    preg_match_all('#<Name>([^<]+)</Name>#', $caps['body'], $m);
    $missing = array_diff(explode(',', $def['layers']), $m[1] ?? []);
    $record($name, 'GetCapabilities', $caps['code'] !== 200
        ? [false, "HTTP {$caps['code']} {$caps['error']}", $caps['seconds']]
        : [!$missing, $missing ? 'brak warstw: ' . implode(', ', $missing) : 'warstwy obecne', $caps['seconds']]);
    foreach ($def['points'] as $place => [$lon, $lat, $zoom]) {
        $version = $def['version'] ?? '1.1.1';
        $url = $def['url'] . '?' . http_build_query([
            'SERVICE' => 'WMS', 'REQUEST' => 'GetMap', 'VERSION' => $version, $version === '1.3.0' ? 'CRS' : 'SRS' => 'EPSG:3857',
            'BBOX' => implode(',', check_tile($lon, $lat, $zoom)), 'WIDTH' => 512, 'HEIGHT' => 512,
            'LAYERS' => $def['layers'], 'STYLES' => '', 'FORMAT' => 'image/png', 'TRANSPARENT' => 'TRUE',
        ], '', '&', PHP_QUERY_RFC3986);
        $record($name, $place, check_image($url));
    }
}

// Scalone kafle z wdrożonego portalu: oba źródła naraz (Starogard z GUGiK, Szczecin z RU).
if (isset($options['portal'])) {
    $base = rtrim((string)$options['portal'], '/') . '/api/wms.php';
    foreach (['Starogard Gdański' => [18.530, 53.966], 'Szczecin' => [14.553, 53.428], 'Białystok' => [23.163, 53.133]] as $place => [$lon, $lat]) {
        $url = $base . '?' . http_build_query(['source' => 'pog_zones', 'BBOX' => implode(',', check_tile($lon, $lat, 17)),
            'WIDTH' => 512, 'HEIGHT' => 512, 'SRS' => 'EPSG:3857'], '', '&', PHP_QUERY_RFC3986);
        $record('Strefy POG — portal (scalone)', $place, check_image($url));
    }
}

if (isset($options['json'])) {
    file_put_contents((string)$options['json'], json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}
if ($problems && isset($options['mail'])) {
    mail((string)$options['mail'], 'MSportal: źródła planistyczne nie przeszły kontroli', implode("\n", $problems));
}
echo PHP_EOL . ($problems ? count($problems) . ' problemów' : 'wszystkie sprawdzenia poprawne') . PHP_EOL;
exit($problems ? 1 : 0);
