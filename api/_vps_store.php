<?php
declare(strict_types=1);

/**
 * 19.8.0: odczyt bazy SQLite msportal w PHP — odpowiednik vps/msportal/db.py.
 *
 * Na hostingu współdzielonym nie ma usługi Pythona ani harmonogramu. Baza jest
 * przygotowywana na komputerze administratora (narzedzia_importu/) i wgrywana
 * przez FTP jako jeden plik. PHP otwiera ją wyłącznie do odczytu.
 *
 * Indeks przestrzenny: R*Tree (item_bounds), a gdy SQLite na hostingu nie ma
 * modułu rtree — zwykła tabela item_bbox tworzona przez narzędzie „przygotuj”.
 */

function vps_db_path(): string {
    $custom = getenv('MSPORTAL_DB');
    if (is_string($custom) && trim($custom) !== '') return trim($custom);
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'msportal' . DIRECTORY_SEPARATOR . 'msportal.sqlite3';
}

final class VpsStoreUnavailable extends RuntimeException {}

function vps_db(): ?PDO {
    static $pdo = false;
    if ($pdo !== false) return $pdo;
    $path = vps_db_path();
    if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        throw new VpsStoreUnavailable('Na serwerze brak rozszerzenia PHP pdo_sqlite. Włącz je w panelu hostingu.');
    }
    if (!is_file($path) || !is_readable($path)) return $pdo = null;
    $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_TIMEOUT => 3];
    if (defined('PDO::SQLITE_ATTR_OPEN_FLAGS')) $options[PDO::SQLITE_ATTR_OPEN_FLAGS] = PDO::SQLITE_OPEN_READONLY;
    $pdo = new PDO('sqlite:' . $path, null, null, $options);
    $pdo->exec('PRAGMA query_only=1');
    return $pdo;
}

function vps_table_exists(PDO $db, string $name): bool {
    $st = $db->prepare("SELECT 1 FROM sqlite_master WHERE name=? LIMIT 1");
    $st->execute([$name]);
    return (bool)$st->fetchColumn();
}

/** Nazwa tabeli zasięgów: R*Tree, gdy działa; inaczej zwykła tabela z narzędzia „przygotuj”. */
function vps_bounds_table(PDO $db, string $rtree, string $plain): string {
    static $cache = [];
    if (isset($cache[$rtree])) return $cache[$rtree];
    if (vps_table_exists($db, $rtree)) {
        try {
            $db->query("SELECT id FROM {$rtree} LIMIT 1")->fetchAll();
            return $cache[$rtree] = $rtree;
        } catch (PDOException) {
            // brak modułu rtree w SQLite hostingu
        }
    }
    if (vps_table_exists($db, $plain)) return $cache[$rtree] = $plain;
    throw new VpsStoreUnavailable('SQLite na serwerze nie obsługuje R*Tree, a baza nie ma tabeli zastępczej. ' .
        'Przygotuj bazę ponownie poleceniem „przygotuj” z narzędzia importu.');
}

/**
 * Tabela zasięgów i dodatkowy warunek zawężający dla tabeli zastępczej (bez R*Tree):
 * minx >= x1 − największa szerokość obiektu — indeks po minx czyta wtedy wąski pas.
 */
function vps_bounds(PDO $db, string $rtree, string $plain, string $alias, float $x1): array {
    $table = vps_bounds_table($db, $rtree, $plain);
    if ($table === $rtree) return [$table, '', []];
    $width = (float)(vps_meta($db)[$plain . '_max_width'] ?? 360);
    return [$table, " AND {$alias}.minx >= ?", [$x1 - $width - 1e-9]];
}

function vps_rtree_supported(): ?bool {
    try {
        $mem = new PDO('sqlite::memory:');
        $mem->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $mem->exec('CREATE VIRTUAL TABLE t USING rtree(id, a, b)');
        return true;
    } catch (Throwable) {
        return false;
    }
}

function vps_meta(PDO $db): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    if (!vps_table_exists($db, 'hosting_meta')) return $cache = [];
    $out = [];
    foreach ($db->query('SELECT key, value FROM hosting_meta') as $row) $out[(string)$row['key']] = (string)$row['value'];
    return $cache = $out;
}

function vps_status(): array {
    $empty = ['ready' => true, 'databasePresent' => false, 'datasets' => ['bdot' => 0], 'sources' => []];
    $db = vps_db();
    if ($db === null || !vps_table_exists($db, 'items') || !vps_table_exists($db, 'imports')) return $empty;
    // 19.23.0: RCN z lokalnej bazy wycofany — health nie raportuje zbioru RCN (ceny: api/rcn.php, WFS GUGiK).
    $counts = ['bdot' => 0];
    foreach ($db->query('SELECT dataset, SUM(count) AS n FROM imports GROUP BY dataset') as $row) {
        if (isset($counts[$row['dataset']])) $counts[$row['dataset']] = (int)$row['n'];
    }
    $sources = $db->query('SELECT dataset,source,count,imported_at FROM imports ORDER BY imported_at DESC LIMIT 80')->fetchAll();
    foreach ($sources as &$s) $s['count'] = (int)$s['count'];
    return ['ready' => true, 'databasePresent' => true, 'datasets' => $counts, 'sources' => $sources];
}

// Identyczny obiekt z kilku źródeł = ta sama klasa, geometria i atrybuty transakcji.
const VPS_DEDUPE_GROUP = "GROUP BY i.dataset, i.bdot_class, i.class_name, i.geom, i.price, i.area, i.event_date, i.asset_type, i.building_use, CASE WHEN i.dataset='rcn' THEN CASE WHEN i.record_key!='' THEN i.record_key ELSE i.source || ':' || i.id END ELSE '' END";

function vps_rcn_filters(array $f, array &$params): string {
    $sql = '';
    if (!empty($f['year_from'])) { $sql .= ' AND i.event_date >= ?'; $params[] = $f['year_from'] . '-01-01'; }
    if (!empty($f['year_to'])) { $sql .= ' AND i.event_date <= ?'; $params[] = $f['year_to'] . '-12-31'; }
    if (!empty($f['asset_type']) && $f['asset_type'] !== 'all') { $sql .= ' AND i.asset_type = ?'; $params[] = $f['asset_type']; }
    if (isset($f['min_area'])) { $sql .= ' AND i.area >= ?'; $params[] = $f['min_area']; }
    if (isset($f['max_area'])) { $sql .= ' AND i.area <= ?'; $params[] = $f['max_area']; }
    return $sql;
}

function vps_query(string $dataset, array $bbox, int $limit, array $filters = []): array {
    $db = vps_db();
    if ($db === null) return [[], false];
    [$x1, $y1, $x2, $y2] = $bbox;
    [$bt, $extra, $extraParams] = vps_bounds($db, 'item_bounds', 'item_bbox', 'r', $x1);
    $sql = "SELECT MIN(i.id) AS id, i.dataset, i.class_name, i.geom, i.price, i.area, i.price_m2,
                i.event_date, i.description, MIN(i.details) AS details, i.asset_type, i.bdot_class, i.building_use FROM {$bt} r
                JOIN items i ON i.id = r.id WHERE i.dataset = ? AND
                r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ?{$extra}";
    $params = array_merge([$dataset, $x2, $x1, $y2, $y1], $extraParams);
    if (!empty($filters['class_name']) && $filters['class_name'] !== 'all') { $sql .= ' AND i.class_name = ?'; $params[] = $filters['class_name']; }
    if ($dataset === 'rcn') $sql .= vps_rcn_filters($filters, $params);
    $sql .= ' ' . VPS_DEDUPE_GROUP . ' ORDER BY id LIMIT ?';
    $params[] = $limit + 1;
    $st = $db->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
    return [array_slice($rows, 0, $limit), count($rows) > $limit];
}

function vps_classes(): array {
    $db = vps_db();
    if ($db === null || !vps_table_exists($db, 'items')) return [];
    $rows = $db->query("SELECT class_name,COUNT(*) AS count FROM items WHERE dataset='bdot' GROUP BY class_name ORDER BY count DESC LIMIT 200")->fetchAll();
    foreach ($rows as &$r) $r['count'] = (int)$r['count'];
    return $rows;
}

function vps_median(array $sorted): ?float {
    $n = count($sorted);
    if ($n === 0) return null;
    $mid = intdiv($n, 2);
    return $n % 2 ? (float)$sorted[$mid] : ($sorted[$mid - 1] + $sorted[$mid]) / 2;
}

/**
 * Pełne liczebności i jednorodna próba (reservoir) do statystyk cen — jak db.rcn_summary.
 * Do $cap dopasowań statystyki są dokładne; powyżej — powtarzalna próba z całego zbioru.
 */
function vps_rcn_summary(array $bbox, array $filters = [], int $cap = 15000): ?array {
    $db = vps_db();
    if ($db === null) return null;
    [$x1, $y1, $x2, $y2] = $bbox;
    [$bt, $extra, $extraParams] = vps_bounds($db, 'item_bounds', 'item_bbox', 'r', $x1);
    $sql = "SELECT MIN(i.id) AS id, i.price_m2, i.event_date FROM {$bt} r
            JOIN items i ON i.id = r.id WHERE i.dataset='rcn'
            AND r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=?{$extra}";
    $params = array_merge([$x2, $x1, $y2, $y1], $extraParams);
    $sql .= vps_rcn_filters($filters, $params) . ' ' . VPS_DEDUPE_GROUP;
    mt_srand(20261020);
    $matched = 0; $priced = 0; $sample = []; $annual = [];
    $st = $db->prepare($sql);
    $st->execute($params);
    while (($row = $st->fetch()) !== false) {
        $matched++;
        $price = $row['price_m2'];
        if ($price === null || (float)$price <= 0) continue;
        $priced++;
        $year = substr((string)($row['event_date'] ?? ''), 0, 4);
        $entry = [(float)$price, $year];
        if ($year !== '' && ctype_digit($year)) $annual[$year] = ($annual[$year] ?? 0) + 1;
        if (count($sample) < $cap) $sample[] = $entry;
        else {
            $j = mt_rand(0, $priced - 1);
            if ($j < $cap) $sample[$j] = $entry;
        }
    }
    $values = array_map(fn($e) => $e[0], $sample);
    sort($values);
    $pct = function (array $seq, float $fraction): ?float {
        if (!$seq) return null;
        $pos = (count($seq) - 1) * $fraction;
        $low = (int)floor($pos); $high = min(count($seq) - 1, $low + 1);
        return round($seq[$low] + ($seq[$high] - $seq[$low]) * ($pos - $low), 2);
    };
    $byYear = [];
    foreach ($sample as [$price, $year]) if ($year !== '' && ctype_digit($year)) $byYear[$year][] = $price;
    ksort($annual, SORT_STRING);
    $annualOut = [];
    foreach ($annual as $year => $count) {
        $prices = $byYear[$year] ?? [];
        sort($prices);
        $annualOut[] = ['year' => (int)$year, 'count' => $count, 'sampleCount' => count($prices),
            'medianPriceM2' => $prices ? round(vps_median($prices), 2) : null];
    }
    $sampled = $priced > $cap;
    return [
        'matchingRecords' => $matched, 'pricedRecords' => $priced, 'truncated' => $sampled,
        'sampleRecords' => count($sample), 'sampleMethod' => $sampled ? 'uniform_reservoir' : 'all',
        'medianPriceM2' => $values ? round(vps_median($values), 2) : null,
        'meanPriceM2' => $values ? round(array_sum($values) / count($values), 2) : null,
        'minPriceM2' => $values ? $values[0] : null, 'maxPriceM2' => $values ? $values[count($values) - 1] : null,
        'p25PriceM2' => $pct($values, .25), 'p75PriceM2' => $pct($values, .75),
        'annual' => $annualOut,
    ];
}

function vps_data_quality(): array {
    try {
        $db = vps_db();
    } catch (VpsStoreUnavailable) {
        return ['databaseReady' => false, 'integrity' => 'error', 'sources' => [], 'complete' => false];
    }
    if ($db === null) return ['databaseReady' => false, 'integrity' => 'missing', 'sources' => []];
    try {
        $rows = [];
        $check = $db->prepare('SELECT 1 FROM items WHERE dataset=? AND source=? LIMIT 1');
        foreach ($db->query('SELECT dataset,source,count,imported_at FROM imports ORDER BY imported_at DESC LIMIT 80')->fetchAll() as $item) {
            $age = null;
            try {
                $dt = new DateTimeImmutable((string)$item['imported_at'], new DateTimeZone('UTC'));
                $age = max(0, (int)floor((time() - $dt->getTimestamp()) / 86400));
            } catch (Exception) {
            }
            $check->execute([$item['dataset'], $item['source']]);
            $rows[] = ['dataset' => $item['dataset'], 'source' => $item['source'], 'count' => (int)$item['count'],
                'ageDays' => $age, 'hasRecords' => (bool)$check->fetchColumn()];
            $check->closeCursor();
        }
        $complete = (bool)$rows;
        foreach ($rows as $r) $complete = $complete && $r['hasRecords'];
        return ['databaseReady' => true, 'integrity' => 'not_scanned', 'sources' => $rows,
            'complete' => $complete, 'state' => $rows ? 'available' : 'empty'];
    } catch (Throwable) {
        return ['databaseReady' => false, 'integrity' => 'error', 'sources' => [], 'complete' => false];
    }
}

/** Kandydaci BDOT od najbliższych (odległość ramki od punktu), bez duplikatów źródeł. */
function vps_bdot_nearby_candidates(array $bbox, int $cap = 2501, ?array $center = null): array {
    $db = vps_db();
    if ($db === null) return [[], false];
    [$x1, $y1, $x2, $y2] = $bbox;
    [$bt, $extra, $extraParams] = vps_bounds($db, 'item_bounds', 'item_bbox', 'r', $x1);
    [$cx, $cy] = $center ?? [($x1 + $x2) / 2, ($y1 + $y2) / 2];
    $kx = cos(deg2rad($cy)) ** 2;
    $st = $db->prepare("SELECT MIN(i.id) AS id,i.bdot_class,i.building_use,i.class_name,i.geom,MIN(i.details) AS details,
          MIN(((MAX(r.minx,MIN(?,r.maxx))-?)*(MAX(r.minx,MIN(?,r.maxx))-?))*? +
              (MAX(r.miny,MIN(?,r.maxy))-?)*(MAX(r.miny,MIN(?,r.maxy))-?)) AS d2
        FROM {$bt} r JOIN items i ON i.id=r.id
        WHERE i.dataset='bdot' AND r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=?{$extra}
          AND i.bdot_class IN ('OT_BUBD_A','OT_SKDR_L')
        GROUP BY i.bdot_class,i.geom,i.building_use,i.class_name ORDER BY d2, id LIMIT ?");
    $st->execute(array_merge([$cx, $cx, $cx, $cx, $kx, $cy, $cy, $cy, $cy, $x2, $x1, $y2, $y1], $extraParams, [$cap]));
    $rows = $st->fetchAll();
    return [array_slice($rows, 0, $cap - 1), count($rows) === $cap];
}

function vps_bdot_coverage(): array {
    $db = vps_db();
    if ($db === null || !vps_table_exists($db, 'items')) return [];
    $out = [];
    foreach ($db->query("SELECT bdot_class,COUNT(*) AS n FROM items WHERE dataset='bdot' AND bdot_class != '' GROUP BY bdot_class") as $r) {
        $out[$r['bdot_class']] = (int)$r['n'];
    }
    return $out;
}

const VPS_PARCEL_CATEGORIES = ['mpzp', 'pog', 'soil', 'protected', 'utilities'];

function vps_parcel_layer_status(): array {
    try {
        $db = vps_db();
        if ($db === null || !vps_table_exists($db, 'parcel_layer_sources')) return [];
        $rows = $db->query('SELECT category,source,count,imported_at,extent FROM parcel_layer_sources ORDER BY category,source')->fetchAll();
        foreach ($rows as &$r) $r['count'] = (int)$r['count'];
        return $rows;
    } catch (Throwable) {
        return [];
    }
}

function vps_parcel_layer_candidates(string $category, array $bbox, int $cap = 1200): array {
    $db = vps_db();
    if ($db === null || !vps_table_exists($db, 'parcel_layers')) return [[], false];
    try {
        [$x1, $y1, $x2, $y2] = $bbox;
        [$bt, $extra, $extraParams] = vps_bounds($db, 'parcel_layer_bounds', 'parcel_layer_bbox', 'b', $x1);
        $st = $db->prepare("SELECT l.source,l.properties,l.geom FROM {$bt} b
            JOIN parcel_layers l ON l.id=b.id WHERE l.category=?
            AND b.minx<=? AND b.maxx>=? AND b.miny<=? AND b.maxy>=?{$extra} LIMIT ?");
        $st->execute(array_merge([$category, $x2, $x1, $y2, $y1], $extraParams, [$cap + 1]));
        $rows = $st->fetchAll();
    } catch (Throwable) {
        return [[], false];
    }
    return [array_slice($rows, 0, $cap), count($rows) > $cap];
}
