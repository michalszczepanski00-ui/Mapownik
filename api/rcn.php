<?php
/**
 * 19.29.0 — ceny transakcyjne w okolicy punktu z Rejestru Cen Nieruchomości (RCN) GUGiK.
 *
 * Usługa WFS https://mapy.geoportal.gov.pl/wss/service/rcn jest bezpłatna (nowelizacja 2025)
 * i zastępuje dawny moduł RCN oparty na lokalnej bazie (usunięty w 19.23). Filtrujemy po stronie
 * GUGiK (obszar, rodzaj nieruchomości, data aktu), grupujemy rekordy w transakcje i liczymy zł/m².
 *
 * GET api/rcn.php?x=<E 2180>&y=<N 2180>&r=500&kind=grunty|domy|mieszkania&years=5
 *
 * Plik nie korzysta z _common.php — działa niezależnie od wersji pozostałych plików api/.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const RCN_WFS = 'https://mapy.geoportal.gov.pl/wss/service/rcn';
const RCN_CACHE_TTL = 3 * 86400;
const RCN_MAX_FEATURES = 3000;
const RCN_MAX_ITEMS = 200;
const RCN_KINDS = [
    // warstwa WFS, NIER_RODZAJ, dodatkowy warunek, jednostka zł/m², rozsądny zakres zł/m²
    'grunty' => ['ms:dzialki', 'nieruchomoscGruntowaNiezabudowana', null, 'm² gruntu', [1, 20000]],
    'domy' => ['ms:budynki', 'nieruchomoscGruntowaZabudowana', ['BUD_RODZAJ', 'mieszkalny'], 'm² pow. użytkowej', [300, 40000]],
    'mieszkania' => ['ms:lokale', 'nieruchomoscLokalowa', null, 'm² pow. użytkowej', [500, 80000]],
];
const RCN_MARKET = ['wolnyRynek', 'sprzedazPrzetargowa'];

function rcn_out(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// 19.32.0: tryb obszaru widoku (narzędzie „Ceny transakcyjne”): bbox=minE,minN,maxE,maxN w EPSG:2180, bok do 8 km.
$bbox = null;
if (isset($_GET['bbox'])) {
    $parts = array_map(static fn ($v) => filter_var($v, FILTER_VALIDATE_FLOAT), explode(',', (string)$_GET['bbox']));
    if (count($parts) !== 4 || in_array(false, $parts, true) || $parts[2] <= $parts[0] || $parts[3] <= $parts[1]
        || $parts[2] - $parts[0] > 8000 || $parts[3] - $parts[1] > 8000) {
        rcn_out(['ok' => false, 'error' => 'Nieprawidłowy obszar (bbox w EPSG:2180, bok do 8 km — przybliż mapę).'], 400);
    }
    $bbox = $parts;
    $_GET['x'] = ($parts[0] + $parts[2]) / 2; $_GET['y'] = ($parts[1] + $parts[3]) / 2;
}
$x = filter_var($_GET['x'] ?? null, FILTER_VALIDATE_FLOAT);
$y = filter_var($_GET['y'] ?? null, FILTER_VALIDATE_FLOAT);
$r = (int)($_GET['r'] ?? 500);
$kind = (string)($_GET['kind'] ?? 'grunty');
$years = (int)($_GET['years'] ?? 5);
if ($x === false || $y === false || $x < 140000 || $x > 900000 || $y < 120000 || $y > 800000) {
    rcn_out(['ok' => false, 'error' => 'Nieprawidłowe współrzędne (EPSG:2180: x = wschód, y = północ).'], 400);
}
if (!isset(RCN_KINDS[$kind])) rcn_out(['ok' => false, 'error' => 'Nieznany rodzaj: grunty, domy albo mieszkania.'], 400);
$r = max(100, min(1500, $r));
$years = in_array($years, [1, 2, 3, 5, 10], true) ? $years : 5;
[$typeName, $propertyKind, $extra, $unit, $range] = RCN_KINDS[$kind];
$from = (new DateTimeImmutable('today'))->modify("-{$years} years")->format('Y-m-d');

$cacheDir = dirname(__DIR__) . '/cache/rcn';
$key = hash('sha256', implode('|', [$kind, $years, round($x / 25), round($y / 25), $r, $from, $bbox ? implode(',', array_map(static fn ($v) => (int)round($v / 25), $bbox)) : '']));
$cacheFile = $cacheDir . '/' . $key . '.json';
if (is_file($cacheFile) && (time() - (int)filemtime($cacheFile)) < RCN_CACHE_TTL) {
    $cached = json_decode((string)file_get_contents($cacheFile), true);
    if (is_array($cached)) { $cached['cached'] = true; rcn_out($cached); }
}

// Obszar z zapasem: działki jednej transakcji leżą obok siebie, a część może być poza promieniem.
$margin = $kind === 'grunty' ? 250 : 50;
$minE = $x - $r - $margin; $maxE = $x + $r + $margin; $minN = $y - $r - $margin; $maxN = $y + $r + $margin;
if ($bbox) { [$minE, $minN, $maxE, $maxN] = [$bbox[0] - $margin, $bbox[1] - $margin, $bbox[2] + $margin, $bbox[3] + $margin]; }
$conditions = sprintf(
    '<fes:BBOX><fes:ValueReference>GEOMETRIA</fes:ValueReference><gml:Envelope srsName="urn:ogc:def:crs:EPSG::2180">'
    . '<gml:lowerCorner>%.2F %.2F</gml:lowerCorner><gml:upperCorner>%.2F %.2F</gml:upperCorner></gml:Envelope></fes:BBOX>',
    $minN, $minE, $maxN, $maxE // EPSG:2180 w URN: kolejność osi północ, wschód
);
$equal = static fn (string $field, string $value): string => '<fes:PropertyIsEqualTo><fes:ValueReference>' . $field . '</fes:ValueReference><fes:Literal>' . htmlspecialchars($value, ENT_XML1) . '</fes:Literal></fes:PropertyIsEqualTo>';
$conditions .= $equal('NIER_RODZAJ', $propertyKind);
if ($extra) $conditions .= $equal($extra[0], $extra[1]);
$conditions .= '<fes:PropertyIsGreaterThanOrEqualTo><fes:ValueReference>DOK_DATA</fes:ValueReference><fes:Literal>' . $from . '</fes:Literal></fes:PropertyIsGreaterThanOrEqualTo>';
$filter = '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"><fes:And>' . $conditions . '</fes:And></fes:Filter>';
$url = RCN_WFS . '?' . http_build_query(['SERVICE' => 'WFS', 'VERSION' => '2.0.0', 'REQUEST' => 'GetFeature', 'TYPENAMES' => $typeName, 'COUNT' => RCN_MAX_FEATURES, 'FILTER' => $filter]);

$started = microtime(true);
$ch = curl_init($url);
$caBundle = __DIR__ . '/certs/cacert.pem';
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
    CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 45, CURLOPT_ENCODING => '',
    CURLOPT_USERAGENT => 'MSPortal-RCN/19.29 (+https://mapownik.swiadectwa.net)',
    CURLOPT_HTTPHEADER => ['Accept: application/gml+xml, text/xml'],
] + (is_file($caBundle) ? [CURLOPT_CAINFO => $caBundle] : []));
$body = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($ch);
curl_close($ch);
$upstreamMs = (int)round((microtime(true) - $started) * 1000);

$failed = !is_string($body) || $status !== 200 || !str_contains(substr($body, 0, 2000), 'FeatureCollection');
if ($failed) {
    // Usługa GUGiK nie odpowiada — ostatni znany wynik (nawet starszy) zamiast błędu.
    if (is_file($cacheFile)) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (is_array($cached)) { $cached['cached'] = true; $cached['stale'] = true; rcn_out($cached); }
    }
    $reason = $curlError !== '' ? $curlError : ('HTTP ' . $status . (is_string($body) && str_contains($body, 'ExceptionText') ? ' (błąd usługi WFS)' : ''));
    rcn_out(['ok' => false, 'error' => 'Rejestr cen GUGiK nie odpowiada: ' . $reason, 'retryable' => true, 'upstreamMs' => $upstreamMs], 502);
}

// --- odczyt GML: każdy rekord -> pola + środek geometrii
$records = [];
$reader = new XMLReader();
if (!$reader->XML($body, 'UTF-8', LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) rcn_out(['ok' => false, 'error' => 'Nieczytelna odpowiedź rejestru cen.'], 502);
$local = substr($typeName, 3);
while ($reader->read()) {
    if ($reader->nodeType !== XMLReader::ELEMENT || $reader->localName !== $local || $reader->namespaceURI === 'http://www.opengis.net/wfs/2.0') continue;
    $xml = $reader->readOuterXml();
    $node = @simplexml_load_string($xml);
    if ($node === false) continue;
    $fields = [];
    foreach ($node->children('http://mapserver.gis.umn.edu/mapserver') as $name => $child) {
        if ($name === 'GEOMETRIA') continue;
        $time = $child->children('http://www.opengis.net/gml/3.2')->timePosition ?? null;
        $fields[$name] = trim((string)($time !== null && (string)$time !== '' ? $time : $child));
    }
    // Środek: średnia wierzchołków (pary „północ wschód”).
    preg_match_all('/<gml:(?:posList|pos)[^>]*>([^<]+)</', $xml, $m);
    $sumE = 0.0; $sumN = 0.0; $n = 0;
    foreach ($m[1] as $list) {
        $nums = preg_split('/\s+/', trim($list));
        for ($i = 0; $i + 1 < count($nums); $i += 2) { $sumN += (float)$nums[$i]; $sumE += (float)$nums[$i + 1]; $n++; }
    }
    if ($n === 0) continue;
    $fields['_e'] = $sumE / $n; $fields['_n'] = $sumN / $n;
    $records[] = $fields;
}
$truncated = count($records) >= RCN_MAX_FEATURES;

$num = static function (?string $value): ?float {
    if ($value === null || $value === '') return null;
    $v = (float)str_replace(',', '.', $value);
    return is_finite($v) ? $v : null;
};
// Powierzchnia gruntu: część powiatów podaje hektary z 4 miejscami po przecinku (np. „0.5015”), reszta m².
$landArea = static function (?string $value) use ($num): ?float {
    $v = $num($value);
    if ($v === null) return null;
    $raw = str_replace(',', '.', trim((string)$value));
    $decimals = str_contains($raw, '.') ? strlen(substr($raw, strpos($raw, '.') + 1)) : 0;
    return ($decimals >= 3 || ($decimals > 0 && $v < 1)) ? $v * 10000 : $v;
};
// Udział inny niż całość (np. 1/105 drogi wewnętrznej) — cena nie dotyczy całej nieruchomości.
$isShare = static function (array $rec): bool {
    $u = trim((string)($rec['NIER_UDZIAL'] ?? ''));
    if ($u === '' || $u === '1/1' || $u === '1') return false;
    if (preg_match('~^(\d+)\s*/\s*(\d+)$~', $u, $m) && $m[1] === $m[2]) return false;
    return true;
};
$address = static function (string $raw): string {
    $parts = [];
    foreach (explode(';', $raw) as $piece) { [$k, $v] = array_pad(explode(':', $piece, 2), 2, ''); $parts[trim($k)] = trim($v); }
    $street = trim(($parts['UL'] ?? '') . ' ' . ($parts['NR_PORZ'] ?? ''));
    return $street !== '' ? $street : ($parts['MSC'] ?? '');
};

// --- grupowanie w transakcje
$groups = [];
foreach ($records as $rec) {
    $id = $rec['TRAN_LOKALNY_ID_IIP'] ?? '';
    if ($id === '') $id = 'rek-' . ($rec['gid'] ?? count($groups));
    $groups[$id][] = $rec;
}
$items = [];
$excluded = ['nonMarket' => 0, 'noPrice' => 0, 'noArea' => 0, 'outlier' => 0, 'package' => 0, 'share' => 0, 'road' => 0, 'small' => 0];
foreach ($groups as $id => $recs) {
    $first = $recs[0];
    $dist = INF; $nearE = $first['_e']; $nearN = $first['_n'];
    foreach ($recs as $rec) {
        $d = hypot($rec['_e'] - $x, $rec['_n'] - $y);
        if ($d < $dist) { $dist = $d; $nearE = $rec['_e']; $nearN = $rec['_n']; }
    }
    if ($bbox ? !($nearE >= $bbox[0] && $nearE <= $bbox[2] && $nearN >= $bbox[1] && $nearN <= $bbox[3]) : $dist > $r) continue;
    $tranPrice = $num($first['TRAN_CENA_BRUTTO'] ?? null);
    // Cena nieruchomości (NIER_CENA_BRUTTO) ma pierwszeństwo — cena transakcji może obejmować np. dom z udziałem w drodze.
    $propPrices = array_values(array_unique(array_filter(array_map(fn ($rec) => $num($rec['NIER_CENA_BRUTTO'] ?? null), $recs), fn ($v) => $v !== null && $v > 0)));
    $price = count($propPrices) === 1 ? $propPrices[0] : $tranPrice;
    $share = $isShare($first);
    $area = null; $label = ''; $note = null; $extraInfo = [];
    if ($kind === 'grunty') {
        $parcels = [];
        foreach ($recs as $rec) $parcels[$rec['DZI_ID_DZIALKI'] ?? $rec['gid']] = $rec;
        $parcelPrices = array_map(fn ($p) => $num($p['DZI_CENA_BRUTTO'] ?? null), $parcels);
        if (count($parcels) > 1 && !in_array(null, $parcelPrices, true) && array_sum($parcelPrices) > 0) $price = array_sum($parcelPrices);
        $area = $landArea($first['NIER_POW_GRUNTU'] ?? null) ?: array_sum(array_map(fn ($p) => (float)$landArea($p['DZI_POW_EWID'] ?? '0'), $parcels));
        $numbers = array_values(array_filter(array_map(fn ($p) => $p['DZI_NR_DZIALKI'] ?? '', $parcels)));
        $label = 'dz. ' . implode(', ', array_slice($numbers, 0, 3)) . (count($numbers) > 3 ? ' i ' . (count($numbers) - 3) . ' inne' : '');
        $extraInfo = ['parcels' => array_keys($parcels), 'use' => $first['DZI_SPOSOB_UZYT'] ?? '', 'mpzp' => $first['DZI_PRZEZN_WMPZP'] ?? ''];
    } elseif ($kind === 'mieszkania') {
        $flats = array_values(array_filter($recs, fn ($rec) => ($rec['LOK_FUNKCJA'] ?? '') === 'mieszkalna'));
        if (!$flats) continue;
        $flatPrices = array_map(fn ($f) => $num($f['LOK_CENA_BRUTTO'] ?? null), $flats);
        if (count($flats) > 1 && in_array(null, $flatPrices, true)) { $note = 'pakiet ' . count($flats) . ' lokali'; }
        $area = array_sum(array_map(fn ($f) => (float)$num($f['LOK_POW_UZYT'] ?? '0'), $flats));
        if (count($flats) === 1 && $flatPrices[0] && $flatPrices[0] > 0) $price = $flatPrices[0];
        $label = $address($flats[0]['LOK_ADRES'] ?? '');
        $extraInfo = ['rooms' => (int)($flats[0]['LOK_LICZBA_IZB'] ?? 0) ?: null, 'floor' => $flats[0]['LOK_NR_KOND'] ?? null, 'flats' => count($flats)];
    } else {
        $houses = array_values(array_filter($recs, fn ($rec) => ($rec['BUD_RODZAJ'] ?? '') === 'mieszkalny'));
        if (!$houses) continue;
        $usable = array_sum(array_map(fn ($b) => (float)$num($b['BUD_POW_UZYT'] ?? '0'), $houses));
        // Pow. użytkowa całego bloku (setki m²) nie opisuje domu — wtedy bez zł/m².
        $area = ($usable >= 30 && $usable <= 600) ? $usable : null;
        $label = $address($houses[0]['BUD_ADRES'] ?? '');
        $extraInfo = ['landArea' => $landArea($first['NIER_POW_GRUNTU'] ?? null), 'buildings' => count($houses)];
    }
    $perM2 = ($price && $price > 0 && $area && $area > 0) ? $price / $area : null;
    $type = $first['TRAN_RODZAJ_TRANS'] ?? '';
    $inStats = true;
    if (!in_array($type, RCN_MARKET, true)) { $inStats = false; $excluded['nonMarket']++; $note = $note ?? 'transakcja nierynkowa'; }
    elseif (!$price || $price <= 0) { $inStats = false; $excluded['noPrice']++; $note = $note ?? 'bez ceny'; }
    elseif ($share) { $inStats = false; $excluded['share']++; $note = 'udział ' . trim((string)$first['NIER_UDZIAL']); }
    elseif ($kind === 'grunty' && ($first['DZI_SPOSOB_UZYT'] ?? '') === 'terenyKomunikacyjne') { $inStats = false; $excluded['road']++; $note = 'grunt pod drogą'; }
    elseif ($kind === 'grunty' && $area !== null && $area < 150) { $inStats = false; $excluded['small']++; $note = 'mała działka (pas gruntu)'; }
    elseif ($note !== null && str_starts_with($note, 'pakiet')) { $inStats = false; $excluded['package']++; }
    elseif ($perM2 === null && $kind !== 'domy') { $inStats = false; $excluded['noArea']++; $note = 'bez powierzchni'; }
    elseif ($perM2 !== null && ($perM2 < $range[0] || $perM2 > $range[1])) { $inStats = false; $excluded['outlier']++; $note = 'cena nietypowa'; }
    $items[] = array_merge([
        'id' => $id,
        'date' => substr($first['DOK_DATA'] ?? '', 0, 10),
        'price' => $price !== null ? round($price) : null,
        'area' => $area !== null ? round($area, 2) : null,
        'perM2' => $perM2 !== null ? round($perM2) : null,
        'label' => $label,
        'dist' => (int)round($dist),
        'x' => round($nearE, 1), 'y' => round($nearN, 1),
        'market' => $first['TRAN_RODZAJ_RYNKU'] ?? '',
        'type' => $type,
        'inStats' => $inStats,
        'note' => $note,
        'usufruct' => ($first['NIER_PRAWO'] ?? '') === 'uzytkowanieWieczyste',
    ], $extraInfo);
}
usort($items, fn ($a, $b) => strcmp($b['date'], $a['date']) ?: $a['dist'] <=> $b['dist']);

$quantile = static function (array $values, float $q): ?float {
    if (!$values) return null;
    sort($values);
    $pos = ($q * (count($values) - 1)); $lo = (int)floor($pos); $hi = (int)ceil($pos);
    return $values[$lo] + ($values[$hi] - $values[$lo]) * ($pos - $lo);
};
$market = array_values(array_filter($items, fn ($i) => $i['inStats']));
$per = array_values(array_filter(array_map(fn ($i) => $i['perM2'], $market), fn ($v) => $v !== null));
$prices = array_map(fn ($i) => $i['price'], $market);
$areas = array_values(array_filter(array_map(fn ($i) => $i['area'], $market), fn ($v) => $v !== null));
$dates = array_map(fn ($i) => $i['date'], $market);
$round = static fn (?float $v, int $step = 1): ?int => $v === null ? null : (int)(round($v / $step) * $step);

$payload = [
    'ok' => true,
    'source' => 'Rejestr Cen Nieruchomości — GUGiK (WFS)',
    'kind' => $kind, 'unit' => $unit, 'radius' => $r, 'years' => $years, 'from' => $from,
    'center' => [round((float)$x, 1), round((float)$y, 1)],
    'count' => count($items),
    'marketCount' => count($market),
    'excluded' => $excluded,
    'truncated' => $truncated,
    'stats' => [
        'medianPerM2' => $round($quantile($per, 0.5)),
        'p25PerM2' => $round($quantile($per, 0.25)),
        'p75PerM2' => $round($quantile($per, 0.75)),
        'perM2Count' => count($per),
        'medianPrice' => $round($quantile($prices, 0.5), 100),
        'medianArea' => $round($quantile($areas, 0.5)),
        'firstDate' => $dates ? min($dates) : null,
        'lastDate' => $dates ? max($dates) : null,
    ],
    'bbox' => $bbox,
    'items' => array_slice($items, 0, $bbox ? 1500 : RCN_MAX_ITEMS),
    'upstreamMs' => $upstreamMs,
    'checkedAt' => gmdate('c'),
    'cached' => false,
];
if (is_dir($cacheDir) || @mkdir($cacheDir, 0775, true)) {
    $tmp = $cacheFile . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) !== false) @rename($tmp, $cacheFile);
}
rcn_out($payload);
