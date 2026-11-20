<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

/**
 * 19.56.0 — udziały stref planu ogólnego i klas gruntu w granicy działki.
 *
 * Żadna publiczna usługa nie podaje geometrii stref POG ani konturów klasyfikacyjnych, ale usługi WMS
 * (MapServer) przyjmują własny styl SLD. Rysujemy więc obraz zasięgu działki, w którym każda strefa / klasa
 * ma osobny kolor (reguła z filtrem po oznaczeniu), nakładamy maskę granicy działki i liczymy piksele.
 * Rozdzielczość: dłuższy bok 800 px — błąd udziału to ułamek procenta przy działkach powyżej kilkuset m².
 *
 * POST JSON: { kind: "pog" | "pog_draft" | "soil", wkt: "POLYGON((x y, …))" (EPSG:2180), parcelId: "101903_2.0009.113/2" }
 * Odpowiedź: { ok, kind, areaM2, items: [{ code, share, areaM2, attrs }], otherShare, noneShare, status, note }
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const PS_SIZE = 800;
const PS_TIMEOUT = 12;
const PS_POG = [
    'pog' => 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin',
    'pog_draft' => 'https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin',
];
const PS_KIUG = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzytkowGruntowych';
// Kolory reguł (dobrze rozróżnialne); ostatni — „inne” (ElseFilter).
const PS_COLORS = [[230, 25, 75], [60, 180, 75], [0, 130, 200], [245, 130, 48], [145, 30, 180], [70, 240, 240], [240, 50, 230], [210, 245, 60],
    [250, 190, 212], [0, 128, 128], [220, 190, 255], [170, 110, 40], [128, 0, 0], [170, 255, 195], [128, 128, 0], [255, 215, 180], [0, 0, 128], [255, 225, 25]];
const PS_OTHER = [0, 0, 0];

function ps_reply(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Pierścienie z WKT (POLYGON / MULTIPOLYGON, EPSG:2180). */
function ps_rings(string $wkt): array {
    $wkt = preg_replace('/^\s*SRID\s*=\s*\d+\s*;\s*/i', '', $wkt) ?? '';
    if (!preg_match('/^\s*(MULTI)?POLYGON\s*\(/i', $wkt)) return [];
    preg_match_all('/\(([^()]+)\)/', $wkt, $m);
    $rings = [];
    foreach ($m[1] as $ring) {
        $pts = [];
        foreach (explode(',', $ring) as $pair) {
            $xy = preg_split('/\s+/', trim($pair));
            if (count($xy) < 2 || !is_numeric($xy[0]) || !is_numeric($xy[1])) return [];
            $pts[] = [(float)$xy[0], (float)$xy[1]];
        }
        if (count($pts) >= 3) $rings[] = $pts;
    }
    return $rings;
}

/** Maska granicy (parzysto-nieparzysta, linie skanowania): wiersz => lista [x0, x1) pikseli w środku. */
function ps_mask(array $rings, array $bbox, int $w, int $h): array {
    [$minX, $minY, $maxX, $maxY] = $bbox;
    $sx = ($maxX - $minX) / $w; $sy = ($maxY - $minY) / $h;
    $spans = [];
    for ($j = 0; $j < $h; $j++) {
        $y = $maxY - ($j + 0.5) * $sy;
        $xs = [];
        foreach ($rings as $ring) {
            $n = count($ring);
            for ($i = 0, $k = $n - 1; $i < $n; $k = $i++) {
                [$x1, $y1] = $ring[$k]; [$x2, $y2] = $ring[$i];
                if (($y1 > $y) !== ($y2 > $y)) $xs[] = $x1 + ($y - $y1) * ($x2 - $x1) / ($y2 - $y1);
            }
        }
        sort($xs);
        $row = [];
        for ($i = 0; $i + 1 < count($xs); $i += 2) {
            $a = (int)ceil(($xs[$i] - $minX) / $sx - 0.5); $b = (int)floor(($xs[$i + 1] - $minX) / $sx - 0.5);
            $a = max(0, $a); $b = min($w - 1, $b);
            if ($b >= $a) $row[] = [$a, $b + 1];
        }
        if ($row) $spans[$j] = $row;
    }
    return $spans;
}

function ps_get(string $url, string $accept): array {
    [$status, $body, $type, $error] = official_gis_remote_get($url, $accept, PS_TIMEOUT);
    return [(int)$status, (string)$body, (string)$type, (string)$error];
}

function ps_wms_params(string $layer, array $bbox, int $w, int $h): array {
    return ['SERVICE' => 'WMS', 'VERSION' => '1.1.1', 'LAYERS' => $layer, 'STYLES' => '', 'SRS' => 'EPSG:2180',
        'BBOX' => implode(',', array_map(static fn ($v) => sprintf('%.2f', $v), $bbox)), 'WIDTH' => (string)$w, 'HEIGHT' => (string)$h];
}

/** GetFeatureInfo GML w pikselu obrazu: lista obiektów [pole => wartość]. */
function ps_feature_info(string $url, string $layer, array $bbox, int $w, int $h, int $px, int $py): array {
    $q = ps_wms_params($layer, $bbox, $w, $h) + ['REQUEST' => 'GetFeatureInfo', 'QUERY_LAYERS' => $layer, 'X' => (string)$px, 'Y' => (string)$py,
        'INFO_FORMAT' => 'application/vnd.ogc.gml', 'FEATURE_COUNT' => '5'];
    [$status, $body] = ps_get($url . '?' . http_build_query($q, '', '&', PHP_QUERY_RFC3986), 'application/vnd.ogc.gml, text/xml');
    if ($status !== 200 || $body === '') return [];
    $out = [];
    if (preg_match_all('~<' . preg_quote($layer, '~') . '_feature>(.*?)</' . preg_quote($layer, '~') . '_feature>~s', $body, $m)) {
        foreach ($m[1] as $block) {
            $item = [];
            if (preg_match_all('~<([A-Za-z_][\w]*)>([^<]*)</\1>~u', $block, $f, PREG_SET_ORDER)) foreach ($f as $field) $item[$field[1]] = html_entity_decode(trim($field[2]), ENT_QUOTES | ENT_XML1, 'UTF-8');
            $out[] = $item;
        }
    }
    return $out;
}

function ps_sld(string $layer, string $attr, array $codes): string {
    $esc = static fn (string $v): string => htmlspecialchars($v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    $rules = '';
    foreach (array_values($codes) as $i => $code) {
        $c = PS_COLORS[$i % count(PS_COLORS)];
        $rules .= '<Rule><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>' . $esc($attr) . '</ogc:PropertyName><ogc:Literal>' . $esc((string)$code)
            . '</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter><PolygonSymbolizer><Fill><CssParameter name="fill">' . sprintf('#%02x%02x%02x', ...$c)
            . '</CssParameter></Fill></PolygonSymbolizer></Rule>';
    }
    $rules .= '<Rule><ElseFilter/><PolygonSymbolizer><Fill><CssParameter name="fill">' . sprintf('#%02x%02x%02x', ...PS_OTHER) . '</CssParameter></Fill></PolygonSymbolizer></Rule>';
    return '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>' . $esc($layer)
        . '</Name><UserStyle><FeatureTypeStyle>' . $rules . '</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>';
}

/**
 * Obraz z regułami i zliczenie pikseli w masce.
 * Zwraca [counts per index (−1 = inne, −2 = brak obiektu, −3 = krawędź/nieczytelny), firstPixelPerIndex, imageOk, styled].
 */
function ps_render_count(string $url, string $layer, string $attr, array $codes, array $bbox, int $w, int $h, array $spans): array {
    $q = ps_wms_params($layer, $bbox, $w, $h) + ['REQUEST' => 'GetMap', 'FORMAT' => 'image/png', 'TRANSPARENT' => 'TRUE', 'SLD_BODY' => ps_sld($layer, $attr, $codes)];
    [$status, $body, $type] = ps_get($url . '?' . http_build_query($q, '', '&', PHP_QUERY_RFC3986), 'image/png');
    if ($status !== 200 || !str_starts_with($body, "\x89PNG")) return [null, null, false, false];
    $img = @imagecreatefromstring($body);
    if (!$img) return [null, null, false, false];
    if (!imageistruecolor($img)) imagepalettetotruecolor($img);
    $palette = array_slice(PS_COLORS, 0, count($codes));
    $counts = []; $first = []; $styled = false;
    foreach ($spans as $j => $row) {
        foreach ($row as [$a, $b]) {
            for ($i = $a; $i < $b; $i++) {
                $rgba = imagecolorat($img, $i, $j);
                $alpha = ($rgba >> 24) & 0x7F; // 0 = kryjący, 127 = przezroczysty
                if ($alpha > 63) { $counts[-2] = ($counts[-2] ?? 0) + 1; continue; }
                $r = ($rgba >> 16) & 0xFF; $g = ($rgba >> 8) & 0xFF; $bl = $rgba & 0xFF;
                $best = -3; $bestD = 3 * 22 * 22;
                $d = ($r - PS_OTHER[0]) ** 2 + ($g - PS_OTHER[1]) ** 2 + ($bl - PS_OTHER[2]) ** 2;
                if ($d < $bestD) { $best = -1; $bestD = $d; }
                foreach ($palette as $k => $c) {
                    $d = ($r - $c[0]) ** 2 + ($g - $c[1]) ** 2 + ($bl - $c[2]) ** 2;
                    if ($d < $bestD) { $best = $k; $bestD = $d; }
                }
                if ($best !== -3) $styled = true;
                $counts[$best] = ($counts[$best] ?? 0) + 1;
                if (!isset($first[$best])) $first[$best] = [$i, $j];
            }
        }
    }
    imagedestroy($img);
    return [$counts, $first, true, $styled];
}

/** Jak ps_render_count, ale etykieta dla każdego piksela maski (indeks liniowy => numer reguły; −1 inne, −2 brak, −3 krawędź). */
function ps_render_labels(string $url, string $layer, string $attr, array $codes, array $bbox, int $w, int $h, array $spans): array {
    $q = ps_wms_params($layer, $bbox, $w, $h) + ['REQUEST' => 'GetMap', 'FORMAT' => 'image/png', 'TRANSPARENT' => 'TRUE', 'SLD_BODY' => ps_sld($layer, $attr, $codes)];
    [$status, $body] = ps_get($url . '?' . http_build_query($q, '', '&', PHP_QUERY_RFC3986), 'image/png');
    if ($status !== 200 || !str_starts_with($body, "\x89PNG")) return [null, false, false];
    $img = @imagecreatefromstring($body);
    if (!$img) return [null, false, false];
    if (!imageistruecolor($img)) imagepalettetotruecolor($img);
    $palette = array_slice(PS_COLORS, 0, count($codes));
    $labels = []; $opaque = 0; $total = 0;
    foreach ($spans as $j => $row) foreach ($row as [$a, $b]) for ($i = $a; $i < $b; $i++) {
        $rgba = imagecolorat($img, $i, $j); $total++;
        if ((($rgba >> 24) & 0x7F) > 63) { $labels[$j * $w + $i] = -2; continue; }
        $opaque++;
        $r = ($rgba >> 16) & 0xFF; $g = ($rgba >> 8) & 0xFF; $bl = $rgba & 0xFF;
        $best = -3; $bestD = 3 * 22 * 22;
        $d = ($r - PS_OTHER[0]) ** 2 + ($g - PS_OTHER[1]) ** 2 + ($bl - PS_OTHER[2]) ** 2;
        if ($d < $bestD) { $best = -1; $bestD = $d; }
        foreach ($palette as $k => $c) { $d = ($r - $c[0]) ** 2 + ($g - $c[1]) ** 2 + ($bl - $c[2]) ** 2; if ($d < $bestD) { $best = $k; $bestD = $d; } }
        $labels[$j * $w + $i] = $best;
    }
    imagedestroy($img);
    // Styl przyjęty = wielokąty wypełnione (każdy obiekt ma kolor reguły albo „inne”). Gdy usługa ignoruje SLD,
    // rysuje swoje linie i napisy — kilka procent pikseli, często w kolorach podobnych do reguł.
    $styled = $total > 0 && $opaque / $total >= 0.35;
    return [$labels, true, $styled];
}

/**
 * Klasyfikacja pikseli warstwy po oznaczeniu: najpierw kandydaci, potem słownik (partiami po 17 reguł),
 * dopóki „inne” zajmują więcej niż 1% działki. Zwraca [indeks => kod|null(brak)|false(inne)], ok, styled.
 */
function ps_classify(string $url, string $layer, string $attr, array $candidates, array $dictionary, array $bbox, int $w, int $h, array $spans, int $maskPixels): array {
    $final = []; $tried = []; $queue = array_values(array_unique($candidates)); $dict = array_values(array_diff(array_unique($dictionary), $queue));
    $styledAny = false; $okAny = false;
    for ($round = 0; $round < 4; $round++) {
        $batch = array_slice($queue, 0, count(PS_COLORS) - 1);
        $queue = array_slice($queue, count($batch));
        if (!$batch) { $batch = array_slice($dict, 0, count(PS_COLORS) - 1); $dict = array_slice($dict, count($batch)); }
        if (!$batch) break;
        $tried = array_merge($tried, $batch);
        [$labels, $ok, $styled] = ps_render_labels($url, $layer, $attr, $batch, $bbox, $w, $h, $spans);
        if (!$ok) { if (!$okAny) return [null, false, false]; break; }
        $okAny = true; $styledAny = $styledAny || $styled;
        if (!$styled && $round === 0) return [null, true, false];
        $other = 0;
        foreach ($labels as $idx => $lab) {
            if (isset($final[$idx]) && $final[$idx] !== false) continue;
            if ($lab >= 0) $final[$idx] = $batch[$lab];
            elseif ($lab === -2) $final[$idx] = null;
            elseif ($lab === -1) { $final[$idx] = false; $other++; }
            // −3: piksel krawędzi (mieszany kolor) — bez etykiety; rozdzielany proporcjonalnie na końcu.
        }
        $otherNow = 0; foreach ($final as $v) if ($v === false) $otherNow++;
        if ($otherNow / $maskPixels <= 0.01) break;
    }
    return [$final, true, $styledAny];
}

/** Punkty kontrolne wewnątrz maski: środek najdłuższego odcinka w kilku wierszach. */
function ps_probe_pixels(array $spans, int $count): array {
    $rows = array_keys($spans);
    if (!$rows) return [];
    $out = [];
    for ($k = 0; $k < $count; $k++) {
        $j = $rows[(int)floor(($k + 0.5) * count($rows) / $count)];
        $best = null;
        foreach ($spans[$j] as $span) if ($best === null || $span[1] - $span[0] > $best[1] - $best[0]) $best = $span;
        $out[] = [intdiv($best[0] + $best[1], 2), $j];
    }
    return array_values(array_unique($out, SORT_REGULAR));
}

/** Usługa EGiB powiatu: wejście GUGiK (PowiatoweBazyEwidencjiGruntow) albo adres z rejestru usług powiatowych. */
function ps_county_wms(string $teryt4): ?string {
    if (!preg_match('/^\d{4}$/', $teryt4)) return null;
    $cacheFile = cache_root() . '/parcel-shares/county-' . $teryt4 . '.json';
    if (is_fresh($cacheFile, 30 * 86400)) {
        $cached = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($cached)) return $cached['url'] ?? null;
    }
    $url = null;
    $gugik = 'https://mapy.geoportal.gov.pl/wss/ext/PowiatoweBazyEwidencjiGruntow/' . $teryt4;
    [$status, $body] = ps_get($gugik . '?service=WMS&request=GetCapabilities', 'text/xml');
    if ($status === 200 && str_contains($body, 'kontury_klasyfikacyjne')) $url = $gugik;
    if ($url === null) {
        [$status, $body] = ps_get('https://integracja.gugik.gov.pl/eziudp/index.php?teryt=' . $teryt4 . '&zbior=egib', 'text/html');
        if ($status === 200 && preg_match('~(https?://[^"\'<>\s]+?)\?service=WMS&(?:amp;)?request=GetCapabilities~i', $body, $m)) {
            $candidate = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
            [$s2, $b2] = ps_get($candidate . '?service=WMS&request=GetCapabilities', 'text/xml');
            if ($s2 === 200 && str_contains($b2, 'kontury_klasyfikacyjne')) $url = $candidate;
        }
    }
    ensure_dir(dirname($cacheFile));
    atomic_write($cacheFile, json_encode(['url' => $url, 'checkedAt' => gmdate('c')]) ?: '{}');
    return $url;
}

/** Oznaczenia konturów działki z integracji krajowej (lista dla całej działki). */
function ps_soil_codes(array $bbox, int $w, int $h, array $probe): array {
    $codes = [];
    foreach (array_slice($probe, 0, 2) as [$px, $py]) {
        $q = ps_wms_params('kontury,uzytki', $bbox, $w, $h) + ['REQUEST' => 'GetFeatureInfo', 'QUERY_LAYERS' => 'kontury,uzytki', 'X' => (string)$px, 'Y' => (string)$py,
            'INFO_FORMAT' => 'text/xml', 'FEATURE_COUNT' => '5'];
        [$status, $body] = ps_get(PS_KIUG . '?' . http_build_query($q, '', '&', PHP_QUERY_RFC3986), 'text/xml');
        if ($status !== 200) continue;
        if (preg_match_all('~<Attribute Name="Oznaczenie (?:konturu|użytku)">([^<]*)</Attribute>~u', $body, $m)) {
            foreach ($m[1] as $list) foreach (explode(',', $list) as $code) { $code = trim($code); if ($code !== '' && preg_match('/^[A-Za-zŁłŚśŻżŹź\-]{1,4}(?:[IVX]{1,3}[ab]?z?)?$/u', $code)) $codes[$code] = true; }
        }
        if ($codes) break;
    }
    return array_keys($codes);
}

// --------------------------------------------------------------------------- żądanie
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') ps_reply(405, ['ok' => false, 'error' => 'Wymagana metoda POST.']);
$raw = (string)file_get_contents('php://input');
if (strlen($raw) > 300000) ps_reply(413, ['ok' => false, 'error' => 'Granica działki jest zbyt duża.']);
$input = json_decode($raw, true);
$kind = is_array($input) ? (string)($input['kind'] ?? '') : '';
if (!in_array($kind, ['pog', 'pog_draft', 'soil'], true)) ps_reply(400, ['ok' => false, 'error' => 'Nieznany rodzaj udziałów.']);
$rings = ps_rings((string)($input['wkt'] ?? ''));
if (!$rings) ps_reply(400, ['ok' => false, 'error' => 'Nieprawidłowa granica działki (WKT).']);
$all = array_merge(...$rings);
if (count($all) > 20000) ps_reply(413, ['ok' => false, 'error' => 'Granica działki ma zbyt wiele wierzchołków.']);
$xs = array_column($all, 0); $ys = array_column($all, 1);
$minX = min($xs); $maxX = max($xs); $minY = min($ys); $maxY = max($ys);
if ($minX < 100000 || $maxX > 950000 || $minY < 50000 || $maxY > 1000000) ps_reply(400, ['ok' => false, 'error' => 'Granica poza zakresem Polski (EPSG:2180).']);
if ($maxX - $minX > 6000 || $maxY - $minY > 6000) ps_reply(400, ['ok' => false, 'error' => 'Obszar większy niż 6 km — udziały liczy się dla działek.']);
$parcelId = (string)($input['parcelId'] ?? '');

$cacheKey = hash('sha256', json_encode([$kind, $rings, $parcelId, 4]) ?: $kind);
$cacheFile = cache_root() . '/parcel-shares/' . substr($cacheKey, 0, 2) . '/' . $cacheKey . '.json';
if (is_fresh($cacheFile, 7 * 86400)) {
    $cached = (string)@file_get_contents($cacheFile);
    if ($cached !== '') { header('X-MSPortal-Cache: HIT'); echo $cached; exit; }
}

$pad = max(2.0, 0.02 * max($maxX - $minX, $maxY - $minY));
$bbox = [$minX - $pad, $minY - $pad, $maxX + $pad, $maxY + $pad];
$scale = PS_SIZE / max($bbox[2] - $bbox[0], $bbox[3] - $bbox[1]);
$w = max(32, (int)round(($bbox[2] - $bbox[0]) * $scale)); $h = max(32, (int)round(($bbox[3] - $bbox[1]) * $scale));
$spans = ps_mask($rings, $bbox, $w, $h);
$maskPixels = 0; foreach ($spans as $row) foreach ($row as [$a, $b]) $maskPixels += $b - $a;
if ($maskPixels < 20) ps_reply(400, ['ok' => false, 'error' => 'Działka za mała do policzenia udziałów.']);
$pixelArea = (($bbox[2] - $bbox[0]) / $w) * (($bbox[3] - $bbox[1]) / $h);
$probe = ps_probe_pixels($spans, 5);

$result = ['ok' => true, 'kind' => $kind, 'areaM2' => round($maskPixels * $pixelArea, 1), 'items' => [], 'otherShare' => 0.0, 'noneShare' => 0.0, 'status' => 'ok', 'note' => null];
if ($kind === 'soil') {
    $teryt4 = substr(preg_replace('/\D/', '', $parcelId) ?? '', 0, 4);
    $url = ps_county_wms($teryt4);
    $listed = ps_soil_codes($bbox, $w, $h, $probe);
    // Lista integracji łączy użytek z klasą („BrRIVb”); warstwa konturów ma samą klasę („RIVb”), warstwa użytków sam użytek („Br”).
    $classRe = '/(R|Ł|Ps|Ls|Lz)(VIz|VI|V|IVa|IVb|IV|IIIa|IIIb|III|II|I)$/u';
    $classCands = []; $useCands = [];
    foreach ($listed as $code) {
        if (preg_match($classRe, $code, $m)) { $classCands[] = $m[1] . $m[2]; $prefix = substr($code, 0, strlen($code) - strlen($m[0])); if ($prefix !== '') $useCands[] = rtrim($prefix, '-'); else $useCands[] = $m[1]; }
        else $useCands[] = $code;
    }
    $classDict = [];
    foreach (['R' => ['I', 'II', 'IIIa', 'IIIb', 'IVa', 'IVb', 'V', 'VI', 'VIz'], 'Ł' => ['I', 'II', 'III', 'IV', 'V', 'VI'], 'Ps' => ['I', 'II', 'III', 'IV', 'V', 'VI'], 'Ls' => ['I', 'II', 'III', 'IV', 'V', 'VI'], 'Lz' => ['I', 'II', 'III', 'IV', 'V', 'VI']] as $u => $cls) foreach ($cls as $c) $classDict[] = $u . $c;
    $useDict = ['R', 'Ł', 'Ps', 'S', 'Br', 'Wsr', 'W', 'Lzr', 'Ls', 'Lz', 'N', 'B', 'Ba', 'Bi', 'Bp', 'Bz', 'K', 'dr', 'Tk', 'Ti', 'Tp', 'Wm', 'Wp', 'Ws', 'Tr'];
    if ($url === null) { $result['status'] = 'no_service'; $result['codes'] = $listed; $result['note'] = 'Nie znaleziono usługi powiatu z konturami klasyfikacyjnymi.'; }
    else {
        [$cls, $okC, $styledC] = ps_classify($url, 'kontury_klasyfikacyjne', 'OZNACZENIE', $classCands, $classDict, $bbox, $w, $h, $spans, $maskPixels);
        if (!$okC) { $result['status'] = 'service_error'; $result['codes'] = $listed; $result['note'] = 'Usługa powiatu nie odpowiedziała.'; }
        elseif (!$styledC) { $result['status'] = 'no_style'; $result['codes'] = $listed; $result['note'] = 'Usługa powiatu nie przyjmuje własnego stylu — udziałów klas nie da się policzyć.'; }
        else {
            [$use, $okU] = ps_classify($url, 'uzytki', 'OZNACZENIE', $useCands, $useDict, $bbox, $w, $h, $spans, $maskPixels);
            $tally = []; $otherPx = 0; $nonePx = 0;
            foreach ($cls as $idx => $c) {
                $u = ($okU && is_array($use)) ? ($use[$idx] ?? null) : null;
                if (is_string($c)) {
                    preg_match($classRe, $c, $m);
                    $label = (is_string($u) && $m && $u !== $m[1]) ? $u . '-' . $c : $c; // np. Br-RIVb; R + RIVb → RIVb
                } elseif (is_string($u)) $label = $u; // użytek bez klasy (B, dr, W…)
                elseif ($c === false || $u === false) { $otherPx++; continue; }
                else { $nonePx++; continue; }
                $tally[$label] = ($tally[$label] ?? 0) + 1;
            }
            foreach ($tally as $code => $px) $result['items'][] = ['code' => $code, 'pixels' => $px];
            $result['otherPixels'] = $otherPx;
            $counts = [-3 => max(0, $maskPixels - array_sum($tally) - $otherPx - $nonePx)];
        }
    }
} else {
    $url = PS_POG[$kind];
    $zones = []; // oznaczenie => atrybuty
    foreach ($probe as [$px, $py]) foreach (ps_feature_info($url, 'strefaPlanistyczna', $bbox, $w, $h, $px, $py) as $f) if (!empty($f['oznaczenie'])) $zones[$f['oznaczenie']] ??= $f;
    $counts = null;
    for ($round = 0; $round < 4; $round++) {
        if (!$zones) break;
        $codes = array_keys($zones);
        [$counts, $first, $ok] = ps_render_count($url, 'strefaPlanistyczna', 'oznaczenie', $codes, $bbox, $w, $h, $spans);
        if (!$ok) { $result['status'] = 'service_error'; $result['note'] = 'Usługa planów ogólnych nie odpowiedziała.'; $counts = null; break; }
        // Fragment nierozpoznanej strefy (> 1% działki) — dopytujemy o nią w jej pikselu.
        if (($counts[-1] ?? 0) / $maskPixels > 0.01 && isset($first[-1]) && count($zones) < count(PS_COLORS)) {
            $before = count($zones);
            foreach (ps_feature_info($url, 'strefaPlanistyczna', $bbox, $w, $h, $first[-1][0], $first[-1][1]) as $f) if (!empty($f['oznaczenie'])) $zones[$f['oznaczenie']] ??= $f;
            if (count($zones) > $before) continue;
        }
        break;
    }
    if (!$zones && $result['status'] === 'ok') { $result['status'] = 'no_zones'; $result['note'] = 'W granicy działki nie ma stref planu ogólnego.'; }
    if ($counts !== null) {
        foreach (array_keys($zones) as $i => $code) if (($counts[$i] ?? 0) > 0) {
            $a = $zones[$code];
            $result['items'][] = ['code' => $code, 'pixels' => $counts[$i], 'attrs' => array_filter([
                'symbol' => $a['symbol'] ?? null, 'nazwa' => $a['nazwa'] ?? null, 'obowiazujeOd' => $a['obowiazujeOd'] ?? null, 'status' => $a['status'] ?? null,
                'profilPodstawowy' => $a['profilPodstawowy'] ?? null, 'profilDodatkowy' => $a['profilDodatkowy'] ?? null,
                'przestrzenNazw' => $a['przestrzenNazw'] ?? null,
                'maksWysokoscZabudowy' => $a['maksWysokoscZabudowy'] ?? null, 'maksUdzialPowierzchniZabudowy' => $a['maksUdzialPowierzchniZabudowy'] ?? null,
                'maksNadziemnaIntensywnoscZabudowy' => $a['maksNadziemnaIntensywnoscZabudowy'] ?? null, 'minUdzialPowierzchniBiologicznieCzynnej' => $a['minUdzialPowierzchniBiologicznieCzynnej'] ?? null,
            ], static fn ($v) => $v !== null && $v !== '')];
        }
        $result['otherPixels'] = $counts[-1] ?? 0; $result['nonePixels'] = ($counts[-2] ?? 0) + ($counts[-3] ?? 0);
    }
}
// Udziały względem całej maski; krawędzie (piksele mieszane) rozdzielamy proporcjonalnie między rozpoznane klasy.
$classified = array_sum(array_column($result['items'], 'pixels')) + (int)($result['otherPixels'] ?? 0);
$edge = 0;
if (isset($counts) && is_array($counts)) $edge = (int)($counts[-3] ?? 0);
$basis = $classified + $edge > 0 ? $classified + $edge : $maskPixels;
foreach ($result['items'] as &$item) {
    $share = $classified > 0 ? $item['pixels'] / $classified * ($classified + $edge) / $maskPixels : 0;
    $item['share'] = round($share, 4); $item['areaM2'] = round($share * $maskPixels * $pixelArea, 1); unset($item['pixels']);
}
unset($item);
$result['otherShare'] = $classified > 0 ? round(((int)($result['otherPixels'] ?? 0)) / $classified * ($classified + $edge) / $maskPixels, 4) : 0.0;
$result['noneShare'] = round(max(0, 1 - array_sum(array_column($result['items'], 'share')) - $result['otherShare']), 4);
unset($result['otherPixels'], $result['nonePixels']);
usort($result['items'], static fn ($a, $b) => $b['share'] <=> $a['share']);
$json = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{"ok":false}';
if (in_array($result['status'], ['ok', 'no_zones', 'no_codes', 'no_style', 'no_service'], true)) { ensure_dir(dirname($cacheFile)); atomic_write($cacheFile, $json); }
header('X-MSPortal-Cache: MISS');
echo $json;
