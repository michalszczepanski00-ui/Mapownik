<?php
declare(strict_types=1);

/**
 * 19.8.0: API „Działka, ceny i otoczenie” w PHP — zastępuje usługę Python/FastAPI
 * z VPS (vps/msportal/app.py). Te same trasy, parametry i format odpowiedzi:
 *
 *   api/vps.php?route=health          (stary adres /vps/api/health przekierowuje .htaccess)
 *
 * Działa na zwykłym hostingu z PHP 8.1+, pdo_sqlite i cURL. Tylko odczyt bazy;
 * import danych odbywa się lokalnie (narzedzia_importu/), a nie na serwerze WWW.
 */

require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/_vps_store.php';
require_once __DIR__ . '/_vps_geo.php';
require_once __DIR__ . '/_vps_ru.php';

const VPS_VERSION = '19.56.0';
const VPS_EXPENSIVE = ['rcn/stats', 'bdot/nearby', 'site/screening', 'parcel/analyze'];

final class VpsHttpError extends RuntimeException {
    public function __construct(public readonly int $status, string $detail, public readonly array $headers = []) {
        parent::__construct($detail);
    }
}

function vps_send(int $status, array $payload, array $headers = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $k => $v) header($k . ': ' . $v);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
}

// ------------------------------------------------------------------ parametry

function vps_q_float(string $key, ?float $default, ?float $min = null, ?float $max = null, bool $required = false): ?float {
    $raw = $_GET[$key] ?? null;
    if ($raw === null || $raw === '') {
        if ($required) throw new VpsHttpError(422, "Brak parametru {$key}");
        return $default;
    }
    if (!is_string($raw) || !is_numeric(trim($raw))) throw new VpsHttpError(422, "Parametr {$key} musi być liczbą");
    $v = (float)trim($raw);
    if (!is_finite($v) || ($min !== null && $v < $min) || ($max !== null && $v > $max)) {
        throw new VpsHttpError(422, "Parametr {$key} poza zakresem" . ($min !== null && $max !== null ? " {$min}–{$max}" : ''));
    }
    return $v;
}

function vps_q_int(string $key, ?int $default, int $min, int $max): ?int {
    $raw = $_GET[$key] ?? null;
    if ($raw === null || $raw === '') return $default;
    if (!is_string($raw) || !preg_match('~^-?\d+$~', trim($raw))) throw new VpsHttpError(422, "Parametr {$key} musi być liczbą całkowitą");
    $v = (int)trim($raw);
    if ($v < $min || $v > $max) throw new VpsHttpError(422, "Parametr {$key} poza zakresem {$min}–{$max}");
    return $v;
}

function vps_q_str(string $key, string $default): string {
    $raw = $_GET[$key] ?? $default;
    return is_string($raw) ? $raw : $default;
}

function vps_parse_bbox(): array {
    $value = $_GET['bbox'] ?? null;
    if (!is_string($value)) throw new VpsHttpError(422, 'bbox: oczekiwano minLon,minLat,maxLon,maxLat');
    $parts = explode(',', $value);
    $nums = [];
    foreach ($parts as $p) {
        if (!is_numeric(trim($p))) throw new VpsHttpError(422, 'bbox: oczekiwano minLon,minLat,maxLon,maxLat');
        $nums[] = (float)trim($p);
    }
    if (count($nums) !== 4 || array_filter($nums, fn($v) => !is_finite($v))) throw new VpsHttpError(422, 'Nieprawidłowy bbox');
    [$x1, $y1, $x2, $y2] = $nums;
    if (!(-180 <= $x1 && $x1 < $x2 && $x2 <= 180 && -90 <= $y1 && $y1 < $y2 && $y2 <= 90)) throw new VpsHttpError(422, 'bbox poza EPSG:4326');
    if (($x2 - $x1) * ($y2 - $y1) > 0.75) throw new VpsHttpError(422, 'Zbyt duży obszar. Przybliż mapę lub zmniejsz promień.');
    return $nums;
}

function vps_rcn_params(): array {
    $f = [
        'year_from' => vps_q_int('year_from', null, 1990, 2100),
        'year_to' => vps_q_int('year_to', null, 1990, 2100),
        'asset_type' => vps_q_str('asset_type', 'all'),
        'min_area' => vps_q_float('min_area', null, 0, 1e9),
        'max_area' => vps_q_float('max_area', null, 0, 1e9),
    ];
    if ($f['year_from'] && $f['year_to'] && $f['year_from'] > $f['year_to']) throw new VpsHttpError(422, 'Zły przedział lat');
    if ($f['min_area'] !== null && $f['max_area'] !== null && $f['min_area'] > $f['max_area']) throw new VpsHttpError(422, 'Minimalna powierzchnia przekracza maksymalną');
    if (!in_array($f['asset_type'], ['all', 'land', 'building', 'unit', 'other', 'unknown'], true)) throw new VpsHttpError(422, 'Nieprawidłowy rodzaj nieruchomości');
    return array_filter($f, fn($v) => $v !== null);
}

// ------------------------------------------------- limity kosztownych zapytań

function vps_client_ip(): string {
    return (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/**
 * Jedna kosztowna analiza naraz (blokada pliku — działa także przy wielu procesach PHP)
 * oraz maks. 10 analiz na minutę na adres IP. Zwraca uchwyt blokady do zwolnienia.
 */
function vps_guard_expensive() {
    $dir = cache_root() . DIRECTORY_SEPARATOR . 'vps';
    if (!ensure_dir($dir)) return null; // brak zapisu w cache: bez limitów, jak przy braku Redis
    $bucketFile = $dir . DIRECTORY_SEPARATOR . 'rate-' . substr(hash('sha256', vps_client_ip()), 0, 24) . '.json';
    $h = @fopen($bucketFile, 'c+');
    if ($h !== false) {
        try {
            @flock($h, LOCK_EX);
            $now = microtime(true);
            $bucket = json_decode((string)stream_get_contents($h), true);
            $bucket = array_values(array_filter(is_array($bucket) ? $bucket : [], fn($t) => is_numeric($t) && $now - (float)$t < 60));
            if (count($bucket) >= 10) throw new VpsHttpError(429, 'Maksymalnie 10 analiz na minutę.', ['Retry-After' => '60']);
            $bucket[] = $now;
            ftruncate($h, 0); rewind($h); fwrite($h, json_encode($bucket));
        } finally {
            @flock($h, LOCK_UN); fclose($h);
        }
    }
    // 19.43.0 (audyt A2): dwie analizy naraz i do 6 s oczekiwania na wolne miejsce. Wcześniej jedna analiza
    // na cały serwer i natychmiastowe 429 — drugi użytkownik dostawał raport z luką „Trwa analiza”.
    $deadline = microtime(true) + 6.0;
    while (true) {
        for ($i = 0; $i < 2; $i++) {
            $gate = @fopen($dir . DIRECTORY_SEPARATOR . "analysis-{$i}.lock", 'c');
            if ($gate === false) return null;
            if (@flock($gate, LOCK_EX | LOCK_NB)) return $gate;
            fclose($gate);
        }
        if (microtime(true) > $deadline) throw new VpsHttpError(429, 'Trwa analiza. Ponów za chwilę.', ['Retry-After' => '3']);
        usleep(250000);
    }
}

// ------------------------------------------------------------------ zapytania HTTP

/**
 * Pobiera publiczny zasób z jednego z zakodowanych na stałe hostów (bez SSRF).
 * Przekierowania tylko na HTTPS i tylko do tych samych hostów; limit rozmiaru i czasu.
 */
function vps_fetch_public(string $url, int $maxBytes = 2500000, int $timeout = 6): string {
    if (isset($GLOBALS['__vps_fetch_override']) && is_callable($GLOBALS['__vps_fetch_override'])) {
        return ($GLOBALS['__vps_fetch_override'])($url);
    }
    $allowed = ['uldk.gugik.gov.pl', 'ogcapi.geoportal.gov.pl'];
    if (!function_exists('curl_init')) throw new RuntimeException('Brak rozszerzenia cURL');
    for ($hop = 0; $hop < 4; $hop++) {
        $parts = parse_url($url);
        if (($parts['scheme'] ?? '') !== 'https' || !in_array($parts['host'] ?? '', $allowed, true)) {
            throw new RuntimeException('Przekierowanie poza oficjalne źródło zablokowane');
        }
        $body = '';
        $tooLarge = false;
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HEADER => false,
            CURLOPT_CONNECTTIMEOUT => min(4, $timeout),
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => 'msportal-gis/' . VPS_VERSION . ' (official-data-client)',
            CURLOPT_HTTPHEADER => ['Accept: application/json, text/plain;q=0.8'],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_ENCODING => '',
            CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$body, &$tooLarge, $maxBytes): int {
                if (strlen($body) + strlen($chunk) > $maxBytes) { $tooLarge = true; return 0; }
                $body .= $chunk;
                return strlen($chunk);
            },
        ];
        if (defined('CURLOPT_PROTOCOLS')) $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
        $ca = mapownik_ca_bundle();
        if ($ca !== null) $opts[CURLOPT_CAINFO] = $ca;
        curl_setopt_array($ch, $opts);
        $ok = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $location = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        $error = curl_error($ch);
        curl_close($ch);
        if ($tooLarge) throw new RuntimeException('Odpowiedź źródła danych przekracza limit bezpieczeństwa');
        if ($ok === false) throw new RuntimeException($error !== '' ? $error : 'błąd połączenia');
        if ($status >= 300 && $status < 400 && $location !== '') { $url = $location; continue; }
        if ($status < 200 || $status >= 300) throw new RuntimeException('HTTP ' . $status);
        return (string)preg_replace('/^\xEF\xBB\xBF/', '', $body);
    }
    throw new RuntimeException('Zbyt wiele przekierowań');
}

// --------------------------------------------------------------- analizy BDOT

function vps_bbox_around(float $lon, float $lat, float $radiusM): array {
    $dy = $radiusM / 110574.0;
    $dx = $radiusM / (111320.0 * max(0.4, cos(deg2rad($lat))));
    return [$lon - $dx, $lat - $dy, $lon + $dx, $lat + $dy];
}

/** Odpowiednik spatial_analysis.analyze: odległości do rzeczywistych geometrii w EPSG:2180. */
function vps_bdot_analyze(float $lon, float $lat, int $radiusM, int $countCap = 2500): array {
    [$rows, $capReached] = vps_bdot_nearby_candidates(vps_bbox_around($lon, $lat, $radiusM), $countCap + 1, [$lon, $lat]);
    [$px, $py] = geo_to2180($lon, $lat);
    $groups = [
        'buildings' => ['label' => 'Budynki (OT_BUBD_A)', 'count' => 0, 'nearestM' => null],
        'roads' => ['label' => 'Drogi (OT_SKDR_L)', 'count' => 0, 'nearestM' => null],
    ];
    $closest = [];
    foreach ($rows as $r) {
        $geojson = json_decode((string)$r['geom'], true);
        $g = is_array($geojson) ? geo_normalize($geojson) : null;
        if ($g === null) continue;
        if (geo_bounds_point_distance(geo_bounds($g), $px, $py) > $radiusM) continue;
        $d = round(geo_point_distance($px, $py, $g), 1);
        if ($d > $radiusM) continue;
        $group = $r['bdot_class'] === 'OT_BUBD_A' ? 'buildings' : 'roads';
        $groups[$group]['count']++;
        $groups[$group]['nearestM'] = $groups[$group]['nearestM'] === null ? $d : min($groups[$group]['nearestM'], $d);
        $closest[] = ['id' => (int)$r['id'], 'group' => $group, 'distanceM' => $d,
            'bdotClass' => $r['bdot_class'], 'buildingUse' => ($r['building_use'] ?? '') !== '' ? $r['building_use'] : null];
    }
    usort($closest, fn($a, $b) => [$a['distanceM'], $a['id']] <=> [$b['distanceM'], $b['id']]);
    $coverage = vps_bdot_coverage();
    return ['ok' => true, 'location' => ['lon' => $lon, 'lat' => $lat, 'radiusM' => $radiusM],
        'groups' => $groups, 'nearest' => array_slice($closest, 0, 30),
        'candidateCapReached' => $capReached,
        'dataAvailable' => ['buildings' => !empty($coverage['OT_BUBD_A']), 'roads' => !empty($coverage['OT_SKDR_L'])],
        'completeness' => $capReached ? 'partial' : 'within_imported_sources',
        'note' => 'Odległości do rzeczywistych geometrii w EPSG:2180. ' .
            'Brak obiektów w lokalnej bazie NIE oznacza braku w terenie. ' .
            'BDOT10k nie zastępuje GESUT ani analizy dostępności uzbrojenia.'];
}

// ---------------------------------------------------------- analiza działki 360°

const VPS_PARCEL_ID_RE = '~^[0-9]{6}_[1-9]\.\d{4}\.[A-Za-z0-9_./-]{1,35}$~';
const VPS_PRG_BASE = 'https://ogcapi.geoportal.gov.pl/res/ims/maps/PRG/apiFeatures';
const VPS_PRG_COLLECTIONS = ['GranicaGminy', 'GranicaPowiatu'];
// 19.8.0: ULDK zwraca nazwy jednostek z EGiB w tym samym zapytaniu (~1 s). PRG odpowiada ~11 s,
// więc jest tylko zapasem, gdy ULDK nie poda nazw.
const VPS_ULDK_FIELDS = 'id,voivodeship,county,commune,region,parcel,geom_wkt';

function vps_uldk_polygon(?string $parcelId, ?float $lon, ?float $lat): array {
    if ($parcelId) {
        if (!preg_match(VPS_PARCEL_ID_RE, $parcelId)) throw new VpsHttpError(422, 'Podaj pełny identyfikator działki EGiB, np. 141201_1.0001.6509');
        $params = ['request' => 'GetParcelById', 'id' => $parcelId, 'result' => VPS_ULDK_FIELDS, 'srid' => '2180'];
    } else {
        if ($lon === null || $lat === null || !(14 <= $lon && $lon <= 24.3 && 49 <= $lat && $lat <= 55.1)) {
            throw new VpsHttpError(422, 'Podaj współrzędne punktu w Polsce');
        }
        $params = ['request' => 'GetParcelByXY', 'xy' => sprintf('%.7F,%.7F,4326', $lon, $lat), 'result' => VPS_ULDK_FIELDS, 'srid' => '2180'];
    }
    try {
        $raw = vps_fetch_public('https://uldk.gugik.gov.pl/?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986), 900000, 8);
    } catch (RuntimeException $e) {
        throw new VpsHttpError(502, 'ULDK chwilowo niedostępny: ' . $e->getMessage());
    }
    $lines = preg_split('/\R/u', trim($raw)) ?: [];
    if (!$lines || trim($lines[0]) !== '0') throw new VpsHttpError(502, 'ULDK nie zwrócił działki ani poprawnej geometrii');
    $body = implode("\n", array_slice($lines, 1));
    if (!preg_match('~(?:(?:MULTI)?POLYGON)\s*\(~i', $body, $m, PREG_OFFSET_CAPTURE)) throw new VpsHttpError(502, 'ULDK nie zwrócił wieloboku WKT');
    $start = (int)$m[0][1];
    $candidate = trim(substr($body, $start));
    $candidate = trim(explode('|', $candidate)[0]);
    $fields = array_map('trim', explode('|', trim(substr($body, 0, $start), "|;\n\t ")));
    $idValue = $fields[0] ?? '';
    $admin = [];
    if (count($fields) >= 6) {
        foreach (['voivodeship', 'county', 'commune', 'region', 'parcel'] as $i => $key) {
            $value = $fields[$i + 1] ?? '';
            if ($value !== '' && !preg_match('~^SRID~i', $value)) $admin[$key] = mb_substr($value, 0, 120);
        }
    }
    if (!preg_match(VPS_PARCEL_ID_RE, $idValue)) $idValue = $parcelId ?: null;
    if (strlen($candidate) > 750000) throw new VpsHttpError(502, 'Błędna geometria działki ULDK');
    $wkt = geo_parse_wkt_polygon($candidate);
    $metric = $wkt ? geo_normalize($wkt, false) : null;
    if ($metric === null || !$metric['polys']) throw new VpsHttpError(502, 'Błędna geometria działki ULDK');
    // Kontrola kolejności osi: EPSG:2180 w ULDK to (easting, northing).
    [$bx0, $by0, $bx1, $by1] = geo_bounds($metric);
    [$clon, $clat] = geo_to4326(($bx0 + $bx1) / 2, ($by0 + $by1) / 2);
    if (!(13 <= $clon && $clon <= 25 && 48 <= $clat && $clat <= 56)) {
        $swap = fn(array $polys): array => array_map(fn($poly) => array_map(fn($ring) => array_map(fn($p) => [$p[1], $p[0]], $ring), $poly), $polys);
        $metric = geo_normalize(['type' => 'MultiPolygon', 'coordinates' => $swap($metric['polys'])], false);
        if ($metric === null) throw new VpsHttpError(502, 'Błędna geometria działki ULDK');
    }
    $area = geo_area($metric);
    if ($area <= 0 || $area > 200000000) throw new VpsHttpError(502, 'Błędna geometria działki ULDK');
    return ['result' => ['id' => $idValue, 'geometry' => geo_to_geojson4326($metric), 'areaM2' => round($area, 2),
        'source' => 'GUGiK ULDK/EGB', 'crs' => 'EPSG:4326'] + ($admin ? ['admin' => $admin] : []), 'metric' => $metric];
}

function vps_py_str($v): string {
    if ($v === null) return 'None';
    if (is_bool($v)) return $v ? 'True' : 'False';
    if (is_float($v)) return (floor($v) == $v && abs($v) < 1e16) ? sprintf('%.1F', $v) : (string)$v;
    if (is_array($v)) return json_encode($v, JSON_UNESCAPED_UNICODE) ?: '';
    return (string)$v;
}

const VPS_PRG_TIMEOUT = 15; // 19.8.0: usługa PRG odpowiada w 5–12 s (pomiar 27.10.2026)

/** Pobiera kilka zasobów PRG równolegle (curl_multi); null = błąd danego zapytania. */
/**
 * $follow: zezwala na przekierowania HTTPS (np. krajowa integracja MPZP → serwer gminy); host
 * sprawdzany jest dla adresu początkowego — tak samo jak w wms.php przy kaflach.
 */
function vps_fetch_parallel(array $urls, int $maxBytes, int $timeout, array $allowedHosts = ['ogcapi.geoportal.gov.pl'], bool|array $follow = false): array {
    if (isset($GLOBALS['__vps_fetch_override']) || !function_exists('curl_multi_init')) {
        $out = [];
        foreach ($urls as $k => $url) {
            try { $out[$k] = vps_fetch_public($url, $maxBytes, $timeout); } catch (Throwable) { $out[$k] = null; }
        }
        return $out;
    }
    $mh = curl_multi_init();
    $handles = []; $bodies = []; $tooLarge = [];
    foreach ($urls as $k => $url) {
        $parts = parse_url($url);
        if (($parts['scheme'] ?? '') !== 'https' || !in_array($parts['host'] ?? '', $allowedHosts, true)) continue;
        $bodies[$k] = ''; $tooLarge[$k] = false;
        $ch = curl_init($url);
        $opts = [
            CURLOPT_FOLLOWLOCATION => is_array($follow) ? in_array($k, $follow, true) : $follow, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => $timeout,
            CURLOPT_USERAGENT => 'msportal-gis/' . VPS_VERSION . ' (official-data-client)',
            CURLOPT_HTTPHEADER => ['Accept: application/geo+json, application/json'],
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_ENCODING => '',
            CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$bodies, &$tooLarge, $k, $maxBytes): int {
                if (strlen($bodies[$k]) + strlen($chunk) > $maxBytes) { $tooLarge[$k] = true; return 0; }
                $bodies[$k] .= $chunk;
                return strlen($chunk);
            },
        ];
        if (defined('CURLOPT_PROTOCOLS')) $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
        if (defined('CURLOPT_REDIR_PROTOCOLS')) $opts[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTPS;
        $ca = mapownik_ca_bundle();
        if ($ca !== null) $opts[CURLOPT_CAINFO] = $ca;
        curl_setopt_array($ch, $opts);
        curl_multi_add_handle($mh, $ch);
        $handles[$k] = $ch;
    }
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 0.5);
    } while ($running && $status === CURLM_OK);
    $out = array_fill_keys(array_keys($urls), null);
    foreach ($handles as $k => $ch) {
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if (!$tooLarge[$k] && curl_errno($ch) === 0 && $code >= 200 && $code < 300) $out[$k] = $bodies[$k];
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    return $out;
}

/** Gmina i powiat z PRG OGC API Features: dokładne pokrycie punktu, nie sam bbox. */
function vps_prg_features(array $collections, float $lon, float $lat): array {
    $d = .005;
    $params = http_build_query(['bbox' => sprintf('%.6F,%.6F,%.6F,%.6F', $lon - $d, $lat - $d, $lon + $d, $lat + $d), 'limit' => '15', 'f' => 'json']);
    $urls = [];
    foreach ($collections as $c) $urls[$c] = VPS_PRG_BASE . "/collections/{$c}/items?{$params}";
    $out = [];
    foreach (vps_fetch_parallel($urls, 3000000, VPS_PRG_TIMEOUT) as $collection => $raw) {
        $out[$collection] = $raw === null
            ? ['status' => 'unavailable', 'note' => 'Usługa PRG nie odpowiada lub format danych się zmienił']
            : vps_prg_match(json_decode($raw, true), $lon, $lat);
    }
    return $out;
}

function vps_prg_match($reply, float $lon, float $lat): array {
    if (!is_array($reply)) return ['status' => 'unavailable', 'note' => 'Usługa PRG nie odpowiada lub format danych się zmienił'];
    foreach (array_slice((array)($reply['features'] ?? []), 0, 15) as $feature) {
        $g = is_array($feature['geometry'] ?? null) ? geo_normalize($feature['geometry'], false) : null;
        if ($g === null || !$g['polys']) continue;
        $covers = geo_point_in_polys($lon, $lat, $g['polys']) || geo_point_distance($lon, $lat, $g) <= 1e-9;
        if (!$covers) continue;
        $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
        $name = null;
        foreach (['nazwaJednostki', 'nazwa', 'nazwaWlasna', 'name', 'Nazwa', 'NAZWA'] as $k) {
            if (!empty($props[$k])) { $name = vps_py_str($props[$k]); break; }
        }
        $short = [];
        foreach (array_slice($props, 0, 12, true) as $k => $v) $short[(string)$k] = mb_substr(vps_py_str($v), 0, 120);
        return ['status' => 'matched', 'name' => $name, 'source' => 'GUGiK PRG OGC API Features', 'properties' => $short];
    }
    return ['status' => 'unverified', 'note' => 'Nie potwierdzono pokrycia punktu geometrią z PRG'];
}

function vps_layer_matches(string $category, array $parcelMetric, array $parcelBounds4326, int $limit = 1200): array {
    [$rows, $truncated] = vps_parcel_layer_candidates($category, $parcelBounds4326, $limit);
    $parcelArea = geo_area($parcelMetric);
    $pb = geo_bounds($parcelMetric);
    $matches = [];
    foreach ($rows as $r) {
        try {
            $geojson = json_decode((string)$r['geom'], true);
            $g = is_array($geojson) ? geo_normalize($geojson) : null;
            if ($g === null || geo_bounds_distance($pb, geo_bounds($g)) > 0.001) continue;
            if (!geo_intersects($g, $parcelMetric)) continue;
            $overlap = $g['polys'] ? geo_intersection_area($parcelMetric['polys'], $g['polys']) : 0.0;
            $prop = json_decode((string)$r['properties'], true);
            if (!is_array($prop)) $prop = ['_attributes_error' => true];
            $label = null;
            foreach (['symbol', 'SYMBOL', 'oznaczenie', 'oznaczenieTerenu', 'przeznaczenie', 'nazwa', 'NAZWA', 'kodStrefy', 'KOD', 'class', 'klasa'] as $k) {
                if (!empty($prop[$k])) { $label = vps_py_str($prop[$k]); break; }
            }
            $surface = $overlap > 0 ? round($overlap, 1) : null;
            $attrs = [];
            foreach (array_slice($prop, 0, 14, true) as $k => $v) $attrs[(string)$k] = mb_substr(vps_py_str($v), 0, 150);
            $matches[] = ['source' => $r['source'], 'label' => $label, 'areaM2' => $surface,
                'attributesWarning' => !empty($prop['_attributes_truncated']) || !empty($prop['_attributes_error']),
                'partPct' => $surface !== null ? round($surface / $parcelArea * 100, 1) : null,
                'attributes' => $attrs];
        } catch (Throwable) {
            continue;
        }
    }
    usort($matches, fn($a, $b) => ($b['areaM2'] ?? 0) <=> ($a['areaM2'] ?? 0));
    return [array_slice($matches, 0, 40), $truncated, count($matches) > 40];
}

function vps_bdot_polygon(array $parcelMetric, array $parcelBounds4326, array $center4326, int $radius): array {
    [$px, $py] = $center4326;
    $dx = ($radius + 500) / (111320 * max(.4, cos(deg2rad($py))));
    $dy = ($radius + 500) / 110574;
    $bounds = [$parcelBounds4326[0] - $dx, $parcelBounds4326[1] - $dy, $parcelBounds4326[2] + $dx, $parcelBounds4326[3] + $dy];
    [$rows, $cap] = vps_bdot_nearby_candidates($bounds, 2501, [$px, $py]);
    $pb = geo_bounds($parcelMetric);
    $groups = ['buildings' => ['count' => 0, 'nearestM' => null, 'insideParcel' => 0], 'roads' => ['count' => 0, 'nearestM' => null, 'insideParcel' => 0]];
    foreach ($rows as $r) {
        $geojson = json_decode((string)$r['geom'], true);
        $g = is_array($geojson) ? geo_normalize($geojson) : null;
        if ($g === null || geo_bounds_distance($pb, geo_bounds($g)) > $radius) continue;
        $dist = round(geo_distance($parcelMetric, $g), 1);
        if ($dist > $radius) continue;
        $key = $r['bdot_class'] === 'OT_BUBD_A' ? 'buildings' : 'roads';
        $groups[$key]['count']++;
        if ($dist == 0) $groups[$key]['insideParcel']++;
        if ($groups[$key]['nearestM'] === null || $dist < $groups[$key]['nearestM']) $groups[$key]['nearestM'] = $dist;
    }
    return ['groups' => $groups, 'candidateCapReached' => $cap, 'radiusM' => $radius,
        'interpretation' => 'Odległości od GRANICY działki do geometrii BDOT10k. W zakresie zaimportowanych klas.'];
}

function vps_parcel_analyze(?string $parcelId, ?float $lon, ?float $lat, int $radius, bool $fetchPrg, bool $includeRu = true): array {
    if ($radius < 100 || $radius > 2000) throw new VpsHttpError(422, 'Promień musi wynosić 100–2000 m');
    $parcel = vps_uldk_polygon($parcelId, $lon, $lat);
    $metric = $parcel['metric'];
    $result = $parcel['result'];
    $poly4326 = geo_normalize($result['geometry'], false);
    $bounds4326 = geo_bounds($poly4326);
    $center = geo_representative_point($poly4326);
    $imported = array_fill_keys(VPS_PARCEL_CATEGORIES, []);
    foreach (vps_parcel_layer_status() as $src) if (isset($imported[$src['category']])) $imported[$src['category']][] = $src;
    $layers = [];
    foreach (VPS_PARCEL_CATEGORIES as $category) {
        $sources = $imported[$category];
        [$features, $cut, $more] = $sources ? vps_layer_matches($category, $metric, $bounds4326) : [[], false, false];
        $layers[$category] = ['status' => $sources ? 'indexed_unverified' : 'unavailable',
            'matches' => $features, 'resultTruncated' => $cut || $more,
            'sources' => array_map(fn($s) => ['name' => $s['source'], 'importedAt' => $s['imported_at']], array_slice($sources, 0, 12)),
            'note' => 'Brak kolizji w zaimportowanych obiektach nie dowodzi braku ograniczeń. Pokrycie i aktualność wymagają weryfikacji.'];
    }
    // 19.8.3: POG i MPZP bez importu — online z Rejestru Urbanistycznego, dokładne pola przecięć.
    if ($includeRu) {
        // Zapasowe źródła (Geoportal POG, krajowa integracja MPZP) jadą w pierwszej rundzie zapytań RU — równolegle.
        $prefetched = [];
        try {
            $online = vps_ru_parcel_layers($metric, vps_planning_urls($metric), $prefetched);
        } catch (Throwable $e) {
            error_log('msportal RU: ' . $e->getMessage());
            $online = [];
        }
        // Plan ogólny: gdy RU nie odpowiedział albo nie ma stref dla działki — krajowa integracja GUGiK
        // (udziały szacowane z punktów, oznaczone jako przybliżone).
        $ruPog = $online['pog'] ?? null;
        $ruHasZones = $ruPog && $ruPog['ok'] && array_filter($ruPog['matches'], fn($m) => ($m['kind'] ?? '') === 'strefa');
        if (!$ruHasZones) {
            try {
                $gp = vps_gp_pog_parcel($metric, $prefetched);
            } catch (Throwable $e) {
                error_log('msportal GP POG: ' . $e->getMessage());
                $gp = ['ok' => false];
            }
            if ($gp['ok'] && ($gp['matches'] || !($ruPog['ok'] ?? false))) {
                // Pusta odpowiedź integracji przy niedziałającym RU nie dowodzi braku planu — wynik niepełny.
                $online['pog'] = ['ok' => true, 'complete' => (bool)$gp['matches'] || ($ruPog['ok'] ?? false), 'matches' => $gp['matches'], 'approximate' => true,
                    'samples' => $gp['samples'], 'leafCoveragePct' => null, 'queries' => count($gp['matches']) ? $gp['samples'] : 0,
                    'provider' => 'GUGiK — krajowa integracja planów ogólnych', 'draft' => $gp['draft']];
            } elseif ($gp['ok'] && $gp['draft'] && $ruPog) {
                $online['pog']['draft'] = $gp['draft'];
            }
        }
        // MPZP: gdy RU nie odpowiedział albo nie ma planu — krajowa integracja MPZP (opis lub rysunek planu).
        $ruMpzp = $online['mpzp'] ?? null;
        if (!($ruMpzp && $ruMpzp['ok'] && $ruMpzp['matches'])) {
            try {
                $kimp = vps_kimp_parcel($metric, $prefetched);
            } catch (Throwable $e) {
                error_log('msportal KIMP: ' . $e->getMessage());
                $kimp = ['ok' => false, 'matches' => []];
            }
            if ($kimp['matches'] || ($kimp['ok'] && !($ruMpzp['ok'] ?? false))) {
                $online['mpzp'] = ['ok' => true, 'complete' => (bool)$kimp['matches'] || ($ruMpzp['ok'] ?? false), 'matches' => $kimp['matches'],
                    'approximate' => true, 'samples' => 1, 'leafCoveragePct' => null, 'queries' => 1,
                    'provider' => 'GUGiK — krajowa integracja MPZP'];
            }
        }
        foreach ($online as $category => $ru) {
            $layer = &$layers[$category];
            if (!$ru['ok']) {
                $layer['online'] = ['status' => 'unavailable', 'note' => 'Rejestr Urbanistyczny nie odpowiedział — spróbuj ponownie.'];
                unset($layer);
                continue;
            }
            $layer['matches'] = array_slice(array_merge($ru['matches'], $layer['matches']), 0, 40);
            $layer['status'] = $layer['status'] === 'unavailable' ? 'online_rejestr' : 'indexed_and_online';
            $layer['online'] = ['status' => $ru['complete'] ? 'complete' : 'partial', 'source' => $ru['provider'] ?? 'Rejestr Urbanistyczny (MRiT)',
                'coveragePct' => $ru['leafCoveragePct'], 'queries' => $ru['queries'],
                'approximate' => !empty($ru['approximate']), 'samples' => $ru['samples'] ?? null, 'draft' => $ru['draft'] ?? null];
            $layer['note'] = $category === 'pog'
                ? (!empty($ru['approximate'])
                    ? 'Plan ogólny i strefy z krajowej integracji GUGiK; udziały szacowane z ' . (int)($ru['samples'] ?? 0) . ' punktów w działce (usługa nie podaje geometrii stref).'
                    : 'Plan ogólny i strefy z Rejestru Urbanistycznego; pola przecięć liczone z geometrii stref. Brak planu w rejestrze nie oznacza braku procedury — sprawdź w gminie.')
                : (!empty($ru['approximate'])
                    ? 'MPZP z krajowej integracji GUGiK (punkt wewnątrz działki) — granice planu i udział terenów sprawdź na rysunku planu.'
                    : 'MPZP z Rejestru Urbanistycznego. Rejestr nie obejmuje jeszcze wszystkich planów — brak wpisu nie oznacza braku MPZP (zobacz warstwę „MPZP — rysunek planu”).');
            if (!$ru['complete']) $layer['resultTruncated'] = true;
            unset($layer);
        }
    }
    $coverage = vps_status()['datasets'];
    $bdot = $coverage['bdot'] ? vps_bdot_polygon($metric, $bounds4326, $center, $radius) : null;
    // Statystyki rynku w ramce EPSG:4326 wokół działki, NIE sprzedaż wybranej działki.
    $mdx = $radius / (111320 * max(.4, cos(deg2rad($center[1]))));
    $mdy = $radius / 110574;
    $market = !empty($coverage['rcn']) ? vps_rcn_summary([$bounds4326[0] - $mdx, $bounds4326[1] - $mdy, $bounds4326[2] + $mdx, $bounds4326[3] + $mdy], ['asset_type' => 'land']) : null;
    $admin = $result['admin'] ?? [];
    $fromUldk = fn(string $name, string $level): array => ['status' => 'matched', 'name' => $name,
        'source' => 'GUGiK ULDK (EGiB)', 'properties' => array_filter(['poziom' => $level,
            'wojewodztwo' => $admin['voivodeship'] ?? null, 'obreb' => $admin['region'] ?? null])];
    if (!empty($admin['commune']) && !empty($admin['county'])) {
        $admins = ['GranicaGminy' => $fromUldk($admin['commune'], 'gmina'), 'GranicaPowiatu' => $fromUldk($admin['county'], 'powiat')];
    } else {
        $admins = $fetchPrg ? vps_prg_features(VPS_PRG_COLLECTIONS, $center[0], $center[1])
            : array_fill_keys(VPS_PRG_COLLECTIONS, ['status' => 'not_requested']);
    }
    $coverageStates = ['parcel' => 'resolved', 'prg' => ($admins['GranicaGminy']['status'] ?? '') === 'matched' ? 'matched' : 'unverified',
        'bdot' => $bdot ? 'indexed_unverified' : 'unavailable', 'rcn' => $market ? 'indexed_unverified' : 'unavailable'];
    foreach (VPS_PARCEL_CATEGORIES as $category) $coverageStates[$category] = $layers[$category]['status'];
    $coverageStates['terrain'] = 'unavailable';
    $flags = ['Nie jest to ocena prawna dopuszczalności zabudowy ani raport urzędowy.',
        'Brak danych lub brak przecięcia z importem NIE oznacza braku ograniczeń.',
        'RCN dotyczy rynku w otoczeniu, nie ceny wybranej działki.',
        'BDOT10k nie zastępuje GESUT ani weryfikacji dostępu do drogi publicznej.'];
    $attrWarn = false; $truncated = $bdot && $bdot['candidateCapReached'];
    foreach ($layers as $layer) {
        if ($layer['resultTruncated']) $truncated = true;
        foreach ($layer['matches'] as $it) if (!empty($it['attributesWarning'])) $attrWarn = true;
    }
    if ($attrWarn) $flags[] = 'Część atrybutów warstw jest skrócona lub uszkodzona; przecięcia geometrii zachowano.';
    if ($truncated) $flags[] = 'Osiągnięto limit obiektów: co najmniej jedna analiza jest niepełna.';
    return ['ok' => true, 'version' => VPS_VERSION, 'assessment' => 'INDICATIVE_GEOMETRY_SCREENING',
        'parcel' => $result, 'location' => ['lon' => $center[0], 'lat' => $center[1], 'radiusM' => $radius],
        'prg' => $admins, 'layers' => $layers, 'bdot' => $bdot, 'rcnNearby' => $market, 'rcnSearchRadiusM' => $radius,
        'coverage' => $coverageStates, 'warnings' => $flags,
        'sources' => ['parcel' => 'GUGiK ULDK', 'prg' => VPS_PRG_BASE, 'planning' => 'Zaimportowane wektorowe źródła z weryfikacją atrybutów']];
}

// ------------------------------------------------------------------------ trasy

function vps_records(string $dataset, array $bbox, int $limit, array $filters): array {
    $indexed = vps_status()['datasets'][$dataset];
    if (!$indexed) {
        return [503, ['ok' => false, 'code' => 'DATA_NOT_IMPORTED',
            'error' => 'Brak zaimportowanych danych ' . strtoupper($dataset) . ' w bazie na serwerze. Przygotuj bazę narzędziem importu i wgraj ją przez FTP.']];
    }
    [$rows, $truncated] = vps_query($dataset, $bbox, $limit, $filters);
    $features = [];
    foreach ($rows as $row) {
        $geom = json_decode((string)$row['geom'], true);
        if (!is_array($geom)) continue;
        $details = json_decode((string)$row['details'], true);
        $props = ['class' => $row['class_name'], 'description' => $row['description'],
            'price' => $row['price'] === null ? null : (float)$row['price'], 'area_m2' => $row['area'] === null ? null : (float)$row['area'],
            'price_m2' => $row['price_m2'] === null ? null : (float)$row['price_m2'],
            'date' => $row['event_date'], 'asset_type' => $row['asset_type'],
            'bdot_class' => $row['bdot_class'], 'building_use' => $row['building_use']];
        if (is_array($details)) $props = array_merge($props, $details);
        $features[] = ['type' => 'Feature', 'id' => (int)$row['id'], 'geometry' => $geom, 'properties' => $props];
    }
    return [200, ['ok' => true, 'type' => 'FeatureCollection', 'features' => $features,
        'meta' => ['dataset' => strtoupper($dataset), 'count' => count($features), 'truncated' => $truncated,
            'availableRecords' => $indexed, 'bboxCrs' => 'EPSG:4326',
            'bboxFilter' => 'bounding-box intersection; exact geometry intersection not guaranteed']]];
}

function vps_not_imported(string $what): array {
    return [503, ['ok' => false, 'code' => 'DATA_NOT_IMPORTED', 'error' => "{$what} nie został zaimportowany."]];
}

function vps_route(string $route, string $method): array {
    switch ($route) {
        case 'health':
            try {
                $s = vps_status();
            } catch (VpsStoreUnavailable $e) {
                return [200, ['ok' => true, 'service' => 'msportal', 'version' => VPS_VERSION, 'mode' => 'hosting',
                    'ready' => false, 'dataReady' => false, 'problem' => $e->getMessage(),
                    'datasets' => ['bdot' => 0], 'sources' => []]];
            }
            return [200, array_merge(['ok' => true, 'service' => 'msportal', 'version' => VPS_VERSION, 'mode' => 'hosting',
                'dataReady' => $s['ready'] && array_sum($s['datasets']) > 0], $s)];
        case 'ready':
            $s = vps_status();
            $ready = $s['ready'] && array_sum($s['datasets']) > 0;
            return [$ready ? 200 : 503, ['ok' => $ready, 'state' => $ready ? 'ready' : 'empty_or_missing', 'datasets' => $s['datasets']]];
        case 'bdot/classes':
            return [200, ['ok' => true, 'classes' => vps_classes()]];
        case 'bdot/search':
            $class = vps_q_str('class_name', 'all');
            if (!($class === 'all' || (strlen($class) <= 50 && preg_match('~^[\p{L}\p{N}_-]+$~u', $class)))) throw new VpsHttpError(422, 'Nieprawidłowy kod klasy BDOT10k');
            return vps_records('bdot', vps_parse_bbox(), vps_q_int('limit', 200, 1, 500), ['class_name' => $class]);
        case 'rcn/search':
        case 'rcn/stats':
            // 19.23.0: moduł RCN z lokalnej bazy wycofany; 19.29.0: ceny z usługi WFS GUGiK — api/rcn.php.
            return [410, ['detail' => 'Moduł RCN z lokalnej bazy został wycofany. Ceny transakcyjne: api/rcn.php (Rejestr Cen Nieruchomości GUGiK).']];
        case 'rcn/search-legacy':
            $limit = vps_q_int('limit', 150, 1, 500);
            $f = vps_rcn_params();
            return vps_records('rcn', vps_parse_bbox(), $limit, $f);
        case 'rcn/stats-legacy':
            $f = vps_rcn_params();
            $bbox = vps_parse_bbox();
            if (empty(vps_status()['datasets']['rcn'])) return vps_not_imported('RCN');
            return [200, array_merge(['ok' => true], vps_rcn_summary($bbox, $f) ?? [], ['note' =>
                'Statystyka opisowa zaimportowanych transakcji (przecięcie bbox), nie operat ani wycena. ' .
                'Transakcje pakietowe lub o innej definicji powierzchni mogą zniekształcać cenę za m².'])];
        case 'bdot/nearby':
            $lon = vps_q_float('lon', null, 14, 24.2, true);
            $lat = vps_q_float('lat', null, 49, 55, true);
            $radius = vps_q_int('radius_m', 500, 50, 3000);
            if (!vps_status()['datasets']['bdot']) return vps_not_imported('BDOT');
            return [200, vps_bdot_analyze($lon, $lat, $radius)];
        case 'site/screening':
            $lon = vps_q_float('lon', null, 14, 24.2, true);
            $lat = vps_q_float('lat', null, 49, 55, true);
            $radius = vps_q_int('radius_m', 500, 100, 3000);
            $available = vps_status()['datasets'];
            $bdot = $available['bdot'] ? vps_bdot_analyze($lon, $lat, $radius) : null;
            $rcn = !empty($available['rcn']) ? vps_rcn_summary(vps_bbox_around($lon, $lat, $radius), ['asset_type' => 'land']) : null;
            $quality = ['bdot' => $bdot ? ($bdot['candidateCapReached'] ? 'indexed_partial' : 'indexed') : 'missing',
                'rcn' => $rcn ? ($rcn['truncated'] ? 'sampled' : 'indexed') : 'missing',
                'parcels' => 'not_connected', 'planning' => 'not_connected', 'soil' => 'not_connected',
                'utilities' => 'not_connected', 'protected_areas' => 'not_connected', 'terrain' => 'not_connected'];
            return [200, ['ok' => true, 'location' => ['lon' => $lon, 'lat' => $lat, 'radiusM' => $radius],
                'bdot' => $bdot, 'rcnLand' => $rcn, 'coverage' => $quality, 'assessment' => 'PRELIMINARY_ONLY',
                'note' => 'Wstępna analiza punktu i otoczenia na podstawie lokalnych danych. NIE dotyczy granic działki, ' .
                    'dopuszczalności inwestycji ani rzeczywistego uzbrojenia. Brak danych nie oznacza braku ograniczeń.']];
        case 'sources/status':
            $s = vps_status();
            $db = vps_db();
            $meta = $db ? vps_meta($db) : [];
            $sources = array_map(fn($x) => ['id' => $x['source'], 'dataset' => $x['dataset'], 'enabled' => true,
                'status' => 'updated', 'lastChecked' => $x['imported_at'], 'lastSuccess' => $x['imported_at'],
                'records' => $x['count'], 'readMiB' => 0, 'message' => ''], $s['sources']);
            return [200, ['ok' => true, 'configured' => (bool)$sources, 'paused' => false, 'mode' => 'hosting',
                'lastRun' => $meta['prepared_at'] ?? ($s['sources'][0]['imported_at'] ?? null), 'sources' => $sources,
                'message' => $sources ? '' : 'Brak zaimportowanych źródeł. Bazę przygotowuje się lokalnie i wgrywa przez FTP.']];
        case 'quality':
            return [200, array_merge(['ok' => true], vps_data_quality())];
        case 'parcel/layers':
            return [200, ['ok' => true, 'layers' => vps_parcel_layer_status(), 'categories' => VPS_PARCEL_CATEGORIES,
                'note' => 'Warstwy opcjonalne importowane administracyjnie z plików wektorowych. Ich obecność nie oznacza pełnego pokrycia kraju.']];
        case 'parcel/analyze':
            if ($method !== 'POST') throw new VpsHttpError(405, 'Metoda niedozwolona', ['Allow' => 'POST']);
            $raw = file_get_contents('php://input', false, null, 0, 65536);
            $req = json_decode((string)$raw, true);
            if (!is_array($req)) throw new VpsHttpError(422, 'Oczekiwano obiektu JSON');
            $id = $req['parcel_id'] ?? null;
            if ($id !== null && (!is_string($id) || mb_strlen($id) > 90)) throw new VpsHttpError(422, 'Nieprawidłowy identyfikator działki');
            $id = is_string($id) && $id !== '' ? $id : null;
            $num = function (string $k) use ($req): ?float {
                if (!isset($req[$k])) return null;
                if (!is_int($req[$k]) && !is_float($req[$k])) throw new VpsHttpError(422, "Nieprawidłowa wartość {$k}");
                $v = (float)$req[$k];
                if (!is_finite($v)) throw new VpsHttpError(422, $k === 'lon' ? 'Nieprawidłowa długość geograficzna' : 'Nieprawidłowa szerokość geograficzna');
                return $v;
            };
            $lon = $num('lon'); $lat = $num('lat');
            $radius = $req['radius_m'] ?? 500;
            if (!is_int($radius) || $radius < 100 || $radius > 2000) throw new VpsHttpError(422, 'Promień musi wynosić 100–2000 m');
            if (!$id && ($lon === null || $lat === null)) throw new VpsHttpError(422, 'Wskaż pełny identyfikator działki lub punkt na mapie');
            return [200, vps_parcel_analyze($id, $lon, $lat, $radius, ($req['include_prg'] ?? true) !== false, ($req['include_ru'] ?? true) !== false)];
        case 'manager/catalog':
        case 'manager/plan':
        case 'manager/save':
        case 'manager/config':
            throw new VpsHttpError(501, 'Menedżer danych działał tylko na VPS. Na hostingu bazę przygotowuje się lokalnie narzędziem importu (INSTRUKCJA_HOSTING.md) i wgrywa przez FTP.');
        default:
            throw new VpsHttpError(404, 'Not Found');
    }
}

// ----------------------------------------------------------------- wykonanie

if (!defined('VPS_NO_DISPATCH')) {
    $route = trim((string)($_GET['route'] ?? ''), '/');
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $gate = null;
    try {
        if (!preg_match('~^[a-z/]{1,40}$~', $route)) throw new VpsHttpError(404, 'Not Found');
        if ($method === 'OPTIONS') { vps_send(204, []); return; }
        if (!in_array($method, ['GET', 'POST', 'HEAD'], true)) throw new VpsHttpError(405, 'Metoda niedozwolona');
        if (in_array($route, VPS_EXPENSIVE, true)) {
            @set_time_limit(45);
            $gate = vps_guard_expensive();
        }
        [$status, $payload] = vps_route($route, $method);
        vps_send($status, $payload);
    } catch (VpsHttpError $e) {
        vps_send($e->status, ['detail' => $e->getMessage()], $e->headers);
    } catch (VpsStoreUnavailable $e) {
        vps_send(503, ['ok' => false, 'detail' => $e->getMessage()]);
    } catch (PDOException $e) {
        vps_send(503, ['ok' => false, 'detail' => 'Baza jest zajęta, uszkodzona lub przekroczono czas zapytania. Zmniejsz obszar i ponów.'], ['Retry-After' => '3']);
    } catch (Throwable $e) {
        error_log('msportal vps.php: ' . $e->getMessage());
        vps_send(500, ['ok' => false, 'detail' => 'Błąd serwera analiz.']);
    } finally {
        if (is_resource($gate)) { @flock($gate, LOCK_UN); fclose($gate); }
    }
}
