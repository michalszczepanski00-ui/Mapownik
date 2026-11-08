<?php
/**
 * 19.37.0 — „Czyj las”: własność lasu z Banku Danych o Lasach (BDL, Lasy Państwowe).
 *
 * GET api/forest.php?x=<E 2180>&y=<N 2180>
 *     → { ok, found, kind: 'lp' | 'inne' | null, owner, text, count, basis, details }
 *       kind 'lp'   — las Skarbu Państwa w zarządzie PGL Lasy Państwowe (warstwa „Wydzielenia PGL LP”);
 *       kind 'inne' — las poza Lasami Państwowymi wg uproszczonych planów urządzenia lasu (prywatne, gminne…).
 *     Format jak api/identify.php — kartа działki pokazuje `text`.
 * GET api/forest.php?wms=1&BBOX=…&WIDTH=…&HEIGHT=…&SRS|CRS=EPSG:3857|EPSG:2180
 *     → obraz PNG: lasy państwowe na zielono, pozostałe na pomarańczowo (styl SLD wysyłany do BDL),
 *       pamięć podręczna 30 dni w cache/forest/. Ta sama domena — mapa da się wyeksportować.
 *
 * Plik nie korzysta z _common.php — działa niezależnie od wersji pozostałych plików api/.
 */
declare(strict_types=1);

const FOREST_WMS = 'https://mapserver.bdl.lasy.gov.pl/ArcGIS/services/WMS_BDL/mapserver/WMSServer';
const FOREST_UA = 'Mozilla/5.0 MSPortal-forest/19.37';
const FOREST_CACHE = __DIR__ . '/../cache/forest';
const FOREST_TILE_TTL = 30 * 86400;
const FOREST_INFO_TTL = 7 * 86400;

function forest_json(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function forest_ca(): ?string { $p = __DIR__ . '/certs/cacert.pem'; return is_file($p) ? $p : null; }
function forest_cache_dir(): string { if (!is_dir(FOREST_CACHE)) @mkdir(FOREST_CACHE, 0775, true); return FOREST_CACHE; }

/** Kilka zapytań do BDL naraz. */
function forest_multi(array $urls, int $timeout): array {
    $mh = curl_multi_init(); $handles = [];
    foreach ($urls as $key => $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => $timeout, CURLOPT_USERAGENT => FOREST_UA, CURLOPT_ENCODING => '',
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS]);
        if ($ca = forest_ca()) curl_setopt($ch, CURLOPT_CAINFO, $ca);
        curl_multi_add_handle($mh, $ch); $handles[$key] = $ch;
    }
    do { $status = curl_multi_exec($mh, $active); if ($active) curl_multi_select($mh, 1.0); } while ($active && $status === CURLM_OK);
    $out = [];
    foreach ($handles as $key => $ch) {
        $out[$key] = ['code' => (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'body' => (string)curl_multi_getcontent($ch), 'type' => (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE)];
        curl_multi_remove_handle($mh, $ch); curl_close($ch);
    }
    curl_multi_close($mh);
    return $out;
}

/**
 * 19.41.4-b (audyt B2): limit zapytań do BDL na adres IP (tylko pobrania — odpowiedzi z cache bez limitu).
 * Adresy IPv6 liczone po sieci /64, żeby zmiana adresu w obrębie jednego łącza nie omijała limitu.
 */
function forest_client_key(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'local');
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $bin = @inet_pton($ip);
        if (is_string($bin) && strlen($bin) === 16) $ip = bin2hex(substr($bin, 0, 8)) . '::/64';
    }
    return hash('sha256', $ip);
}
function forest_rate_limit(string $bucket, int $limit, int $window): void {
    $dir = FOREST_CACHE . '/rate';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) return;
    $h = @fopen($dir . '/' . $bucket . '-' . substr(forest_client_key(), 0, 24) . '.json', 'c+');
    if ($h === false) return;
    try {
        @flock($h, LOCK_EX);
        $now = time();
        $list = json_decode((string)stream_get_contents($h), true);
        $list = array_values(array_filter(is_array($list) ? $list : [], static fn ($t) => is_int($t) && $now - $t < $window));
        if (count($list) >= $limit) {
            http_response_code(429); header('Retry-After: 60'); header('Content-Type: text/plain; charset=utf-8'); header('Cache-Control: no-store');
            echo 'Zbyt wiele zapytań o mapę lasów z tego adresu — spróbuj za chwilę.'; exit;
        }
        $list[] = $now;
        ftruncate($h, 0); rewind($h); fwrite($h, json_encode($list));
    } finally { @flock($h, LOCK_UN); fclose($h); }
}
/**
 * Czy zapytanie to kafel siatki mapy (EPSG:3857, kafle 512 px jak w dataCatalog.js)? Tylko takie trafiają do
 * cache: liczba możliwych plików jest wtedy skończona. Inne zapytania (np. test diagnostyki w EPSG:2180)
 * są obsługiwane, ale bez zapisu na dysk — dowolne BBOX-y nie mogą już zapełnić konta.
 */
function forest_is_grid_tile(string $crs, array $bbox, int $w, int $h): bool {
    if ($crs !== 'EPSG:3857' || $w !== $h || !in_array($w, [256, 512, 1024], true)) return false;
    $world = 40075016.68557849; $origin = -20037508.342789244;
    $span = $bbox[2] - $bbox[0];
    if ($span <= 0 || abs(($bbox[3] - $bbox[1]) - $span) > $span * 1e-6) return false;
    $z = log($world / $span, 2);
    if (abs($z - round($z)) > 1e-6 || $z < 0 || $z > 23) return false;
    foreach ([($bbox[0] - $origin) / $span, ($bbox[1] - $origin) / $span] as $i) if (abs($i - round($i)) > 1e-4) return false;
    return true;
}

/** <FIELDS a="…" b="…"/> z odpowiedzi ArcGIS → tablice pól (wartości bez spacji, bez „Null”). */
function forest_fields(string $xml): array {
    $rows = [];
    if (!preg_match_all('/<FIELDS\s+([^>]*?)\/?>/u', $xml, $m)) return $rows;
    foreach ($m[1] as $attrs) {
        preg_match_all('/([A-Za-z_][\w.]*)="([^"]*)"/u', $attrs, $a, PREG_SET_ORDER);
        $row = [];
        foreach ($a as [, $k, $v]) {
            $v = trim(html_entity_decode($v, ENT_QUOTES | ENT_XML1, 'UTF-8'));
            if ($v !== '' && $v !== 'Null') $row[$k] = $v;
        }
        if ($row) $rows[] = $row;
    }
    return $rows;
}

// ---- mapa (PNG) ---------------------------------------------------------------
if (isset($_GET['wms'])) {
    $q = array_change_key_case($_GET, CASE_UPPER);
    $bbox = array_map('floatval', explode(',', (string)($q['BBOX'] ?? '')));
    $w = (int)($q['WIDTH'] ?? 0); $h = (int)($q['HEIGHT'] ?? 0);
    $crs = (string)($q['CRS'] ?? $q['SRS'] ?? '');
    if (count($bbox) !== 4 || $w < 16 || $h < 16 || $w > 2048 || $h > 2048 || !in_array($crs, ['EPSG:3857', 'EPSG:2180'], true) || $bbox[2] <= $bbox[0] || $bbox[3] <= $bbox[1]) {
        http_response_code(400); header('Content-Type: text/plain; charset=utf-8'); echo 'Nieprawidłowe zapytanie mapy.'; exit;
    }
    $key = hash('sha256', implode('|', [$crs, ...array_map(static fn ($v) => round($v, 2), $bbox), $w, $h, 'v1']));
    $file = forest_cache_dir() . '/' . substr($key, 0, 2) . '/' . $key . '.png';
    header('Content-Type: image/png');
    header('Cache-Control: public, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    $cacheable = forest_is_grid_tile($crs, $bbox, $w, $h);
    if ($cacheable && is_file($file) && time() - (int)filemtime($file) < FOREST_TILE_TTL) { readfile($file); exit; }
    forest_rate_limit('map', 600, 600);
    $sym = static fn (string $fill, string $stroke) => '<PolygonSymbolizer><Fill><CssParameter name="fill">' . $fill . '</CssParameter><CssParameter name="fill-opacity">0.5</CssParameter></Fill>'
        . '<Stroke><CssParameter name="stroke">' . $stroke . '</CssParameter><CssParameter name="stroke-width">0.7</CssParameter></Stroke></PolygonSymbolizer>';
    $sld = '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">'
        . '<NamedLayer><Name>1</Name><UserStyle><FeatureTypeStyle><Rule>' . $sym('#2f7d4f', '#1f5a37') . '</Rule></FeatureTypeStyle></UserStyle></NamedLayer>'
        . '<NamedLayer><Name>0</Name><UserStyle><FeatureTypeStyle><Rule>' . $sym('#e08a1e', '#9a4d05') . '</Rule></FeatureTypeStyle></UserStyle></NamedLayer>'
        . '</StyledLayerDescriptor>';
    $params = ['SERVICE' => 'WMS', 'VERSION' => '1.1.1', 'REQUEST' => 'GetMap', 'LAYERS' => '1,0', 'STYLES' => '', 'SRS' => $crs,
        'BBOX' => implode(',', $bbox), 'WIDTH' => $w, 'HEIGHT' => $h, 'FORMAT' => 'image/png', 'TRANSPARENT' => 'TRUE', 'SLD_BODY' => $sld];
    $res = forest_multi(['map' => FOREST_WMS . '?' . http_build_query($params)], 25)['map'];
    if ($res['code'] !== 200 || !str_starts_with($res['body'], "\x89PNG")) {
        http_response_code(502); header('Content-Type: text/plain; charset=utf-8'); header('Cache-Control: no-store');
        echo 'Bank Danych o Lasach nie odpowiedział (HTTP ' . $res['code'] . ').'; exit;
    }
    if ($cacheable) {
        @mkdir(dirname($file), 0775, true);
        $part = $file . '.part.' . bin2hex(random_bytes(4));
        @file_put_contents($part, $res['body']) && @rename($part, $file);
    } else {
        header('Cache-Control: no-store');
    }
    echo $res['body'];
    exit;
}

// ---- informacja o lesie w punkcie -----------------------------------------------
$x = filter_var($_GET['x'] ?? null, FILTER_VALIDATE_FLOAT);
$y = filter_var($_GET['y'] ?? null, FILTER_VALIDATE_FLOAT);
if ($x === false || $y === false || $x < 140000 || $x > 900000 || $y < 120000 || $y > 800000) {
    forest_json(['ok' => false, 'error' => 'Nieprawidłowe współrzędne (EPSG:2180: x = wschód, y = północ).'], 400);
}
// 19.41.4-b (audyt B2): klucz co 1 m zamiast 0,1 m — informacja o wydzieleniu lasu nie zmienia się na 10 cm.
$infoKey = hash('sha256', sprintf('%.0f|%.0f|v1', $x, $y));
$infoFile = forest_cache_dir() . '/info-' . substr($infoKey, 0, 32) . '.json';
if (is_file($infoFile) && time() - (int)filemtime($infoFile) < FOREST_INFO_TTL) {
    $cached = json_decode((string)file_get_contents($infoFile), true);
    if (is_array($cached)) forest_json($cached + ['cached' => true]);
}
$gfi = static function (string $layer) use ($x, $y): string {
    $d = 2.0;
    return FOREST_WMS . '?' . http_build_query(['SERVICE' => 'WMS', 'VERSION' => '1.1.1', 'REQUEST' => 'GetFeatureInfo', 'LAYERS' => $layer, 'QUERY_LAYERS' => $layer, 'STYLES' => '',
        'SRS' => 'EPSG:2180', 'BBOX' => implode(',', [$x - $d, $y - $d, $x + $d, $y + $d]), 'WIDTH' => 5, 'HEIGHT' => 5, 'X' => 2, 'Y' => 2, 'INFO_FORMAT' => 'text/xml', 'FEATURE_COUNT' => 3]);
};
forest_rate_limit('info', 120, 600);
$res = forest_multi(['lp' => $gfi('1'), 'inne' => $gfi('0'), 'range' => $gfi('4')], 20);
if ($res['lp']['code'] !== 200 && $res['inne']['code'] !== 200) {
    forest_json(['ok' => false, 'error' => 'Bank Danych o Lasach nie odpowiedział.', 'code' => 'upstream', 'retryable' => true], 502);
}
$lp = forest_fields($res['lp']['body'])[0] ?? null;
$other = forest_fields($res['inne']['body'])[0] ?? null;
$range = forest_fields($res['range']['body'])[0] ?? null;

const SITE = ['BS' => 'bór suchy', 'BŚW' => 'bór świeży', 'BW' => 'bór wilgotny', 'BB' => 'bór bagienny', 'BMŚW' => 'bór mieszany świeży', 'BMW' => 'bór mieszany wilgotny', 'BMB' => 'bór mieszany bagienny',
    'LMŚW' => 'las mieszany świeży', 'LMW' => 'las mieszany wilgotny', 'LMB' => 'las mieszany bagienny', 'LŚW' => 'las świeży', 'LW' => 'las wilgotny', 'OL' => 'ols', 'OLJ' => 'ols jesionowy', 'LŁ' => 'las łęgowy',
    'BMWYŻŚW' => 'bór mieszany wyżynny świeży', 'LMWYŻŚW' => 'las mieszany wyżynny świeży', 'LWYŻŚW' => 'las wyżynny świeży', 'BWYŻŚW' => 'bór wyżynny świeży', 'LŁWYŻ' => 'las łęgowy wyżynny',
    'BMGÓRŚW' => 'bór mieszany górski świeży', 'LMGÓRŚW' => 'las mieszany górski świeży', 'LGÓRŚW' => 'las górski świeży', 'BGÓRŚW' => 'bór górski świeży'];
const SPECIES = ['SO' => 'sosna', 'DB' => 'dąb', 'DBS' => 'dąb szypułkowy', 'DBB' => 'dąb bezszypułkowy', 'DBC' => 'dąb czerwony', 'BK' => 'buk', 'ŚW' => 'świerk', 'JD' => 'jodła', 'BRZ' => 'brzoza', 'OL' => 'olsza',
    'OLS' => 'olsza czarna', 'GB' => 'grab', 'MD' => 'modrzew', 'JS' => 'jesion', 'KL' => 'klon', 'JW' => 'jawor', 'LP' => 'lipa', 'OS' => 'osika', 'TP' => 'topola', 'AK' => 'robinia akacjowa', 'WZ' => 'wiąz', 'DG' => 'daglezja'];
const FUNC = ['GOSP' => 'gospodarczy', 'OCHR' => 'ochronny', 'REZ' => 'rezerwat', 'PN' => 'park narodowy'];
const PROT = ['OCH MIAST' => 'ochronny w granicach i wokół miast', 'WODOCHR' => 'wodochronny', 'GLEBOCHR' => 'glebochronny', 'OSTOJ' => 'ostoja zwierząt', 'NAUK' => 'badawczy (nasienny, doświadczalny)',
    'NASIEN' => 'nasienny', 'UZDROW' => 'uzdrowiskowy', 'OBRONNY' => 'obronny', 'USZKODZ' => 'uszkodzony przez przemysł', 'PRZEMYSŁ' => 'uszkodzony przez przemysł', 'CIEK' => 'wodochronny (cieki)'];

$lines = []; $details = []; $kind = null; $owner = null;
$name = static fn (?string $v) => $v === null ? null : trim(preg_replace('/\s+/u', ' ', $v));
$stand = static function (array $f) use (&$lines, &$details): void {
    $site = $f['site_type_cd'] ?? null; $sp = $f['species_cd_d'] ?? null;
    if ($site) { $lines[] = 'Typ siedliskowy: ' . (SITE[$site] ?? $site) . " ({$site})"; $details['siedlisko'] = SITE[$site] ?? $site; }
    if ($sp) { $age = $f['species_age'] ?? null; $lines[] = 'Gatunek panujący: ' . (SPECIES[$sp] ?? $sp) . ($age ? ", wiek {$age} lat" : ''); $details['gatunek'] = SPECIES[$sp] ?? $sp; $details['wiek'] = $age; }
    if (!empty($f['forest_func_cd'])) { $fn = FUNC[$f['forest_func_cd']] ?? strtolower($f['forest_func_cd']); $lines[] = 'Funkcja lasu: ' . $fn; $details['funkcja'] = $fn; }
    if (!empty($f['prot_category_cd'])) { $pc = PROT[$f['prot_category_cd']] ?? strtolower($f['prot_category_cd']); $lines[] = 'Kategoria ochronności: ' . $pc; $details['ochronnosc'] = $pc; }
    if (!empty($f['sub_area'])) { $lines[] = 'Powierzchnia wydzielenia: ' . $f['sub_area'] . ' ha'; $details['powierzchnia_ha'] = $f['sub_area']; }
    if (!empty($f['adress_forest'])) { $addr = preg_replace('/\s*-\s*/', '-', trim($f['adress_forest'])); $lines[] = 'Adres leśny: ' . $addr; $details['adres'] = $addr; }
};
if ($lp) {
    $kind = 'lp'; $owner = 'Skarb Państwa — Państwowe Gospodarstwo Leśne Lasy Państwowe';
    $lines[] = 'Własność: ' . $owner;
    if ($range) {
        $rdlp = $name($range['region_name'] ?? null); $nadl = $name($range['inspectorate_name'] ?? null); $lesn = $name($range['forest_range_name'] ?? null);
        if ($rdlp) $lines[] = 'RDLP: ' . $rdlp; if ($nadl) $lines[] = 'Nadleśnictwo: ' . $nadl; if ($lesn) $lines[] = 'Leśnictwo: ' . $lesn;
        $details += ['rdlp' => $rdlp, 'nadlesnictwo' => $nadl, 'lesnictwo' => $lesn];
    }
    $stand($lp);
    if (!empty($lp['a_year'])) $lines[] = 'Stan danych: ' . $lp['a_year'];
} elseif ($other) {
    $kind = 'inne';
    $cat = $name($other['owner_cat_name'] ?? null) ?: 'nieustalona';
    $owner = $cat;
    $lines[] = 'Własność: ' . $cat . ' (las poza Lasami Państwowymi)';
    $stand($other);
    $lines[] = 'Źródło: uproszczony plan urządzenia lasu' . (!empty($other['a_year']) ? ' (stan ' . $other['a_year'] . ')' : '');
    $details['kategoria'] = $cat;
}
$payload = [
    'ok' => true, 'found' => $kind !== null, 'kind' => $kind, 'owner' => $owner,
    'text' => $kind ? implode("\n", $lines) : null, 'count' => $kind ? 1 : 0, 'basis' => 'structured',
    'details' => $details, 'source' => 'Bank Danych o Lasach (BDL) — Lasy Państwowe',
];
@file_put_contents($infoFile, json_encode($payload, JSON_UNESCAPED_UNICODE));
forest_json($payload);
