<?php
/**
 * 19.32.0 — pozwolenia na budowę, wnioski i zgłoszenia budowlane w okolicy punktu (RWDZ, GUNB).
 *
 * GET api/permits.php?x=<E 2180>&y=<N 2180>&r=500&years=3&types=dom,wielorodzinny,…&src=P,Z
 *
 * Dane: data/rwdz/rwdz.sqlite (tools/build_rwdz_store.py, aktualizacja co miesiąc). Rejestr nie ma współrzędnych,
 * więc położenie działek bierzemy z ULDK (GUGiK) i zapamiętujemy w cache/rwdz/geo.sqlite:
 *   1. obręby w promieniu: ULDK GetRegionByXY dla środka i punktów na okręgu (pamiętane);
 *   2. inwestycje z tych obrębów z bazy RWDZ (okres, typy, rodzaj wpisu);
 *   3. działki bez położenia: ULDK GetParcelById (zasięg działki), 8 naraz, do ~12 s na zapytanie.
 * Odpowiedź z `pending` > 0 znaczy, że część działek jeszcze nie ma położenia — klient pyta ponownie.
 *
 * GET api/permits.php?status=1 — (19.35.0) data danych, liczba wpisów i stan automatycznej aktualizacji (cron/rwdz_update.php).
 *
 * Plik nie korzysta z _common.php — działa niezależnie od wersji pozostałych plików api/.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const PERMITS_DB = __DIR__ . '/../data/rwdz/rwdz.sqlite';
const PERMITS_GEO = __DIR__ . '/../cache/rwdz/geo.sqlite';
const PERMITS_TYPES = ['dom', 'wielorodzinny', 'uslugi', 'przemysl', 'energia', 'infrastruktura', 'rozbiorka', 'inne'];
const PERMITS_MAX_ITEMS = 400;
const PERMITS_GEO_BUDGET_S = 12.0;
const PERMITS_PARALLEL = 8;
const PERMITS_MISSING_RETRY_S = 30 * 86400;
require_once __DIR__ . '/_permits_privacy.php'; // 19.41.4-b: ukrywanie danych osób fizycznych (RODO)
function permits_out(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function permits_ca(): ?string {
    $bundled = __DIR__ . '/certs/cacert.pem';
    if (is_file($bundled) && (int)@filesize($bundled) > 100000) return $bundled;
    foreach ([(string)ini_get('curl.cainfo'), (string)ini_get('openssl.cafile')] as $c) if ($c !== '' && is_file($c)) return $c;
    return null;
}

/** Równoległe zapytania do ULDK: [klucz => url] → [klucz => treść|null]. Kończy się po $deadline (microtime). */
function permits_multi_get(array $urls, float $deadline): array {
    $out = array_fill_keys(array_keys($urls), null);
    if (!$urls || !function_exists('curl_multi_init')) return $out;
    $mh = curl_multi_init();
    $queue = $urls; $active = [];
    $ca = permits_ca();
    $start = static function (string $key, string $url) use ($mh, &$active, $ca): void {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'Mozilla/5.0 MSPortal-permits', CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_ENCODING => '']);
        if ($ca !== null) curl_setopt($ch, CURLOPT_CAINFO, $ca);
        curl_multi_add_handle($mh, $ch);
        $active[(int)$ch] = [$key, $ch];
    };
    while (($queue || $active) && microtime(true) < $deadline) {
        while ($queue && count($active) < PERMITS_PARALLEL && microtime(true) < $deadline - 1.0) {
            $key = array_key_first($queue); $url = $queue[$key]; unset($queue[$key]);
            $start((string)$key, $url);
        }
        curl_multi_exec($mh, $running);
        curl_multi_select($mh, 0.2);
        while ($info = curl_multi_info_read($mh)) {
            $ch = $info['handle'];
            [$key] = $active[(int)$ch];
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $body = curl_multi_getcontent($ch);
            $out[$key] = ($info['result'] === CURLE_OK && $code === 200 && is_string($body)) ? $body : null;
            curl_multi_remove_handle($mh, $ch); curl_close($ch); unset($active[(int)$ch]);
        }
        if (!$queue && !$active) break;
    }
    foreach ($active as [$key, $ch]) { curl_multi_remove_handle($mh, $ch); curl_close($ch); }
    curl_multi_close($mh);
    return $out;
}

/** Pierwsza linia ULDK: „0” = OK, potem wynik; inaczej null. */
function permits_uldk_value(?string $body): ?string {
    if ($body === null) return null;
    $lines = preg_split('/\R/', trim(preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body)) ?: [];
    if (count($lines) < 2 || trim($lines[0]) !== '0') return null;
    return trim($lines[1]);
}

// ---- wejście
if (!is_file(PERMITS_DB)) permits_out(['ok' => false, 'code' => 'no-data', 'error' => 'Baza pozwoleń nie jest wgrana na serwer (data/rwdz/rwdz.sqlite).'], 503);
if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) permits_out(['ok' => false, 'error' => 'Serwer nie ma PDO SQLite.'], 503);
if (isset($_GET['status'])) {
    $meta = [];
    // 19.41.4-b: uszkodzona albo niedokończona baza dawała błąd 500 bez odpowiedzi JSON.
    try {
        $db = new PDO('sqlite:' . PERMITS_DB, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);
        foreach ($db->query('SELECT key, value FROM meta') as $row) $meta[$row['key']] = $row['value'];
    } catch (Throwable $e) {
        error_log('msportal permits.php status: ' . $e->getMessage());
        permits_out(['ok' => false, 'code' => 'bad-data', 'error' => 'Baza pozwoleń (data/rwdz/rwdz.sqlite) jest uszkodzona albo niekompletna — wgraj ją ponownie.'], 503);
    }
    $update = @json_decode((string)@file_get_contents(dirname(PERMITS_GEO) . '/update-status.json'), true);
    $building = is_file(dirname(PERMITS_GEO) . '/update-state.json');
    permits_out(['ok' => true, 'dataDate' => $meta['data_date'] ?? null, 'builtAt' => $meta['built_at'] ?? null, 'cutoff' => $meta['cutoff'] ?? null,
        'investments' => (int)($meta['investments'] ?? 0), 'parcels' => (int)($meta['parcels'] ?? 0), 'missing' => $meta['missing'] ?? '',
        'builder' => $meta['builder'] ?? 'tools/build_rwdz_store.py', 'update' => is_array($update) ? $update : null, 'building' => $building]);
}
$x = filter_var($_GET['x'] ?? null, FILTER_VALIDATE_FLOAT);
$y = filter_var($_GET['y'] ?? null, FILTER_VALIDATE_FLOAT);
if ($x === false || $y === false || $x < 140000 || $x > 900000 || $y < 120000 || $y > 800000) {
    permits_out(['ok' => false, 'error' => 'Nieprawidłowe współrzędne (EPSG:2180: x = wschód, y = północ).'], 400);
}
$r = max(100, min(1500, (int)($_GET['r'] ?? 500)));
$years = (int)($_GET['years'] ?? 3);
$years = in_array($years, [1, 2, 3], true) ? $years : 3;
$types = array_values(array_intersect(explode(',', (string)($_GET['types'] ?? implode(',', PERMITS_TYPES))), PERMITS_TYPES));
if (!$types) permits_out(['ok' => false, 'error' => 'Wybierz co najmniej jeden typ inwestycji.'], 400);
$src = array_values(array_intersect(explode(',', (string)($_GET['src'] ?? 'P,Z')), ['P', 'Z']));
if (!$src) permits_out(['ok' => false, 'error' => 'Wybierz pozwolenia albo zgłoszenia.'], 400);
$from = (new DateTimeImmutable('today'))->modify("-{$years} years")->format('Y-m-d');
$started = microtime(true);

try {
    $db = new PDO('sqlite:' . PERMITS_DB, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);
    $meta = [];
    foreach ($db->query('SELECT key, value FROM meta') as $row) $meta[$row['key']] = $row['value'];
    if (!is_dir(dirname(PERMITS_GEO))) @mkdir(dirname(PERMITS_GEO), 0775, true);
    $geo = new PDO('sqlite:' . PERMITS_GEO, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $geo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000;
        CREATE TABLE IF NOT EXISTS parcel_xy (id TEXT PRIMARY KEY, x REAL, y REAL, ok INTEGER NOT NULL, at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS region_pt (key TEXT PRIMARY KEY, teryt TEXT, at INTEGER NOT NULL);');
} catch (Throwable $e) {
    error_log('msportal permits.php: ' . $e->getMessage());
    permits_out(['ok' => false, 'error' => 'Nie można otworzyć bazy pozwoleń — spróbuj ponownie za chwilę.'], 503);
}

// ---- 1. obręby w promieniu (środek + 16 punktów na okręgu + 8 w połowie promienia), pamiętane po siatce 50 m
$points = [[$x, $y]];
foreach ([[16, 1.0], [8, 0.5]] as [$n, $f]) for ($i = 0; $i < $n; $i++) $points[] = [$x + cos(2 * M_PI * $i / $n) * $r * $f, $y + sin(2 * M_PI * $i / $n) * $r * $f];
$regions = []; $ask = [];
$lookup = $geo->prepare('SELECT teryt FROM region_pt WHERE key = ?');
foreach ($points as [$px, $py]) {
    $key = (int)round($px / 50) . ':' . (int)round($py / 50);
    $lookup->execute([$key]);
    $hit = $lookup->fetchColumn();
    if ($hit !== false) { if ($hit) $regions[$hit] = true; continue; }
    $ask[$key] = 'https://uldk.gugik.gov.pl/?request=GetRegionByXY&xy=' . sprintf('%.1F,%.1F', round($px / 50) * 50, round($py / 50) * 50) . '&result=teryt&srid=2180';
}
if ($ask) {
    $answers = permits_multi_get($ask, $started + 8.0);
    $save = $geo->prepare('INSERT OR REPLACE INTO region_pt (key, teryt, at) VALUES (?, ?, ?)');
    foreach ($answers as $key => $body) {
        if ($body === null) continue;                 // brak odpowiedzi — spróbujemy następnym razem
        $teryt = permits_uldk_value($body);
        $teryt = ($teryt !== null && preg_match('/^\d{6}_\d\.\d{4}$/', $teryt)) ? $teryt : '';
        $save->execute([$key, $teryt, time()]);
        if ($teryt !== '') $regions[$teryt] = true;
    }
}
if (!$regions) permits_out(['ok' => false, 'error' => 'Usługa ULDK nie wskazała obrębów dla tego miejsca — spróbuj ponownie za chwilę.'], 502);

// ---- 2. inwestycje z tych obrębów
$conds = []; $args = [];
foreach (array_keys($regions) as $teryt) { [$unit, $obreb] = explode('.', $teryt); $conds[] = '(p.unit = ? AND p.obreb = ?)'; $args[] = $unit; $args[] = $obreb; }
$sql = 'SELECT p.inv, p.unit, p.obreb, p.nr FROM parcels p JOIN investments i ON i.id = p.inv WHERE (' . implode(' OR ', $conds) . ')'
    . ' AND i.date_in >= ? AND i.type IN (' . implode(',', array_fill(0, count($types), '?')) . ') AND i.src IN (' . implode(',', array_fill(0, count($src), '?')) . ')'
    . ' ORDER BY i.date_in DESC'; // najnowsze inwestycje pierwsze w kolejce do lokalizacji
$stmt = $db->prepare($sql);
$stmt->execute([...$args, $from, ...$types, ...$src]);
$byInv = [];
foreach ($stmt as $row) $byInv[(int)$row['inv']][] = $row['unit'] . '.' . $row['obreb'] . '.' . $row['nr'];

// ---- 3. położenie działek (pamięć + ULDK w budżecie czasu)
$allParcels = array_values(array_unique(array_merge(...array_values($byInv ?: [[]]))));
$xy = [];
foreach (array_chunk($allParcels, 400) as $chunk) {
    $q = $geo->prepare('SELECT id, x, y, ok, at FROM parcel_xy WHERE id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')');
    $q->execute($chunk);
    foreach ($q as $row) {
        if ((int)$row['ok'] === 1) $xy[$row['id']] = [(float)$row['x'], (float)$row['y']];
        elseif (time() - (int)$row['at'] < PERMITS_MISSING_RETRY_S) $xy[$row['id']] = null; // nieznana w ULDK — nie pytamy przez 30 dni
    }
}
$missing = array_values(array_filter($allParcels, static fn ($id) => !array_key_exists($id, $xy)));
// Kolejka w porządku zapytania: najpierw działki najnowszych inwestycji — w dużym mieście szybciej widać świeże budowy.
$geocoded = 0;
if ($missing && microtime(true) - $started < PERMITS_GEO_BUDGET_S - 1) {
    $urls = [];
    foreach ($missing as $id) $urls[$id] = 'https://uldk.gugik.gov.pl/?request=GetParcelById&id=' . rawurlencode($id) . '&result=geom_extent&srid=2180';
    $answers = permits_multi_get($urls, $started + PERMITS_GEO_BUDGET_S);
    $save = $geo->prepare('INSERT OR REPLACE INTO parcel_xy (id, x, y, ok, at) VALUES (?, ?, ?, ?, ?)');
    $geo->beginTransaction();
    foreach ($answers as $id => $body) {
        if ($body === null) continue; // nie zdążyliśmy albo błąd sieci — następnym razem
        $ext = permits_uldk_value($body);
        $p = $ext !== null ? array_map('floatval', explode(',', $ext)) : [];
        if (count($p) === 4 && $p[0] > 100000) {
            $xy[$id] = [($p[0] + $p[2]) / 2, ($p[1] + $p[3]) / 2];
            $save->execute([$id, $xy[$id][0], $xy[$id][1], 1, time()]);
        } else {
            $xy[$id] = null;
            $save->execute([$id, null, null, 0, time()]);
        }
        $geocoded++;
    }
    $geo->commit();
}

// ---- 4. wynik: inwestycje z działką w promieniu
$pending = 0; $unlocated = 0; $hits = [];
foreach ($byInv as $inv => $ids) {
    $best = null; $waiting = false;
    foreach ($ids as $id) {
        if (!array_key_exists($id, $xy)) { $waiting = true; continue; }
        if ($xy[$id] === null) continue;
        $d = hypot($xy[$id][0] - $x, $xy[$id][1] - $y);
        if ($best === null || $d < $best[0]) $best = [$d, $xy[$id], $id];
    }
    if ($best !== null && $best[0] <= $r) $hits[$inv] = $best;
    elseif ($best === null && $waiting) $pending++;
    elseif ($best === null) $unlocated++;
}
$items = [];
if ($hits) {
    $q = $db->prepare('SELECT i.*, o.value AS organ_name, k.value AS kind_name, t.value AS intent_name, s.value AS status_name
        FROM investments i LEFT JOIN lookup o ON o.id = i.organ LEFT JOIN lookup k ON k.id = i.kind LEFT JOIN lookup t ON t.id = i.intent LEFT JOIN lookup s ON s.id = i.status
        WHERE i.id IN (' . implode(',', array_fill(0, count($hits), '?')) . ')');
    $q->execute(array_keys($hits));
    foreach ($q as $row) {
        [$d, [$px, $py], $pid] = $hits[(int)$row['id']];
        $items[] = [
            'id' => (int)$row['id'], 'src' => $row['src'], 'date' => $row['date_in'], 'dateDecision' => $row['date_dec'],
            'number' => $row['number'], 'organ' => $row['organ_name'], 'investor' => permits_public_investor($row['investor']), 'type' => $row['type'],
            'category' => $row['category'], 'kind' => $row['kind_name'], 'intent' => $row['intent_name'], 'name' => $row['name'],
            'volume' => $row['volume'] !== null ? (float)$row['volume'] : null, 'status' => $row['status_name'], 'place' => $row['place'],
            'parcels' => $byInv[(int)$row['id']], 'parcel' => $pid, 'x' => round($px, 1), 'y' => round($py, 1), 'dist' => (int)round($d),
        ];
    }
    usort($items, static fn ($a, $b) => strcmp((string)$b['date'], (string)$a['date']) ?: $a['dist'] <=> $b['dist']);
}
$counts = array_fill_keys(PERMITS_TYPES, 0);
foreach ($items as $item) $counts[$item['type']] = ($counts[$item['type']] ?? 0) + 1;

permits_out([
    'ok' => true,
    'source' => $meta['source'] ?? 'GUNB — RWDZ',
    'dataDate' => $meta['data_date'] ?? null,
    'center' => [round((float)$x, 1), round((float)$y, 1)], 'radius' => $r, 'years' => $years, 'from' => $from,
    'regions' => array_keys($regions),
    'count' => count($items), 'counts' => $counts,
    'pending' => $pending, 'unlocated' => $unlocated, 'geocoded' => $geocoded,
    'truncated' => count($items) > PERMITS_MAX_ITEMS,
    'items' => array_slice($items, 0, PERMITS_MAX_ITEMS),
    'ms' => (int)round((microtime(true) - $started) * 1000),
]);
