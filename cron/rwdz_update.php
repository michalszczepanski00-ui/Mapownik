<?php
/**
 * 19.35.0 — automatyczna aktualizacja bazy pozwoleń na budowę (RWDZ, GUNB) dla narzędzia „Budowy i pozwolenia”.
 *
 * Uruchamianie: panel OVH → Hosting → Zaplanowane zadania (Cron) → Dodaj:
 *   skrypt:    www/<katalog portalu>/cron/rwdz_update.php     (np. www/test22/cron/rwdz_update.php)
 *   język:     PHP 8.x, częstotliwość: codziennie (np. 03:xx)
 * Skrypt działa tylko z wiersza poleceń (cron); z przeglądarki katalog cron/ jest zablokowany (.htaccess).
 *
 * Co robi przy każdym uruchomieniu:
 *   1. pyta dane.gov.pl (zbiór 3467) o datę danych GUNB; gdy nie ma nowszych niż w data/rwdz/rwdz.sqlite — kończy w sekundę;
 *   2. gdy są nowsze — buduje nową bazę plik po pliku (16 województw + zgłoszenia), w limicie czasu (domyślnie 20 min);
 *      niedokończona budowa jest wznawiana przy następnym uruchomieniu (stan: cache/rwdz/update-state.json);
 *   3. gotową bazę podmienia jednym ruchem (rename) — portal przez cały czas korzysta ze starej;
 *   4. zapisuje dziennik cache/rwdz/update.log i stan cache/rwdz/update-status.json (widoczny w diagnostyce).
 * Zapamiętane położenia działek (cache/rwdz/geo.sqlite) zostają.
 *
 * Opcje (CLI):  --budget=<minuty>   limit czasu jednego uruchomienia (domyślnie 20)
 *               --years=<lata>      zakres danych (domyślnie 3)
 *               --force             buduj nawet bez nowszych danych
 *               --cache=<katalog>   (testy) katalog z już pobranymi plikami ZIP — nie są usuwane
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Tylko z crona (CLI).\n"); }
@ini_set('memory_limit', '512M');
@set_time_limit(0);

const RWDZ_DATASET_API = 'https://api.dane.gov.pl/1.4/datasets/3467/resources?per_page=50';
const RWDZ_UA = 'Mozilla/5.0 MSPortal-rwdz-update/19.35';
$root = dirname(__DIR__);
$dbPath = $root . '/data/rwdz/rwdz.sqlite';
$workDir = $root . '/cache/rwdz';
$statePath = $workDir . '/update-state.json';
$statusPath = $workDir . '/update-status.json';
$logPath = $workDir . '/update.log';
$opts = getopt('', ['budget::', 'years::', 'force', 'cache::']);
$budgetS = max(60, (int)(($opts['budget'] ?? 20)) * 60);
$years = max(1, min(5, (int)($opts['years'] ?? 3)));
$force = array_key_exists('force', $opts);
$zipCache = isset($opts['cache']) && is_dir((string)$opts['cache']) ? rtrim((string)$opts['cache'], '/') : null;
$started = microtime(true);
@mkdir($workDir, 0775, true);
@mkdir(dirname($dbPath), 0775, true);

function rwdz_log(string $message): void {
    global $logPath;
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $message . "\n";
    echo $line;
    $old = is_file($logPath) ? (file($logPath, FILE_IGNORE_NEW_LINES) ?: []) : [];
    $old = array_slice($old, -300);
    @file_put_contents($logPath, implode("\n", $old) . ($old ? "\n" : '') . $line, LOCK_EX);
}
function rwdz_status(array $status): void {
    global $statusPath;
    @file_put_contents($statusPath, json_encode($status + ['at' => date('c')], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}
function rwdz_ca(): ?string {
    if (($env = getenv('RWDZ_CAINFO')) && is_file($env)) return $env;
    $bundled = dirname(__DIR__) . '/api/certs/cacert.pem';
    return is_file($bundled) ? $bundled : null;
}
function rwdz_get_json(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 60, CURLOPT_USERAGENT => RWDZ_UA]);
    if ($ca = rwdz_ca()) curl_setopt($ch, CURLOPT_CAINFO, $ca);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $data = is_string($body) ? json_decode($body, true) : null;
    if ($code !== 200 || !is_array($data)) throw new RuntimeException("dane.gov.pl: HTTP {$code}");
    return $data;
}
function rwdz_download(string $url, string $target): void {
    $fh = fopen($target . '.part', 'wb');
    if (!$fh) throw new RuntimeException('Brak zapisu w ' . dirname($target));
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_FILE => $fh, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 900, CURLOPT_CONNECTTIMEOUT => 20, CURLOPT_USERAGENT => RWDZ_UA]);
    if ($ca = rwdz_ca()) curl_setopt($ch, CURLOPT_CAINFO, $ca);
    $ok = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    fclose($fh);
    if (!$ok || $code !== 200) { @unlink($target . '.part'); throw new RuntimeException("pobieranie HTTP {$code} {$error}"); }
    rename($target . '.part', $target);
}

/** Typ inwestycji — te same reguły co tools/build_rwdz_store.py. */
function rwdz_classify(string $category, string $kind, string $intent, string $name): string {
    static $rules = [
        'energia' => '/fotowolt|elektrowni|turbin|wiatrak|farm[ay] (pv|fotow|wiatr)|magazyn energii/u',
        'wielorodzinny' => '/wielorodzinn|wielolokal/u',
        'dom' => '/jednorodzinn|rekreacji indywidualnej|letniskow/u',
        'przemysl' => '/hal[ai]? |hala|magazyn|przemysł|produkcyj|warsztat|logistycz/u',
        'uslugi' => '/usług|handl|sklep|biur|hotel|pensjonat|szkoł|przedszkol|żłob|restaurac|gastronom|przychodni|szpital|apartament/u',
        'infrastruktura' => '/sieci|sieć|kanalizac|wodociąg|gazoci|przyłącz|linii|kabl|telekomunik|maszt|stacj[ai] (trans|bazow)|drog|ulic|chodnik|parking|most|ścieżk/u',
    ];
    static $categories = ['I' => 'dom', 'XIII' => 'wielorodzinny', 'XXVI' => 'infrastruktura', 'XVII' => 'przemysl', 'XVIII' => 'przemysl'];
    $text = mb_strtolower($intent . ' ' . $name);
    if (preg_match('/rozbi[oó]rk/u', $text)) return 'rozbiorka';
    if (str_starts_with(mb_strtolower($kind), 'budynek mieszkalny jednorodzinny')) return 'dom';
    if (isset($categories[$category])) return $categories[$category];
    foreach ($rules as $type => $pattern) if (preg_match($pattern, $text)) return $type;
    return 'inne';
}
function rwdz_clean(?string $value, int $limit = 200): string {
    $v = preg_replace('/\s+/u', ' ', trim((string)$value, " \t\n\r\0\x0B\"")) ?? '';
    return mb_substr($v, 0, $limit);
}

// ---- blokada (jedno uruchomienie naraz)
$lock = fopen($workDir . '/update.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { echo "Inna aktualizacja trwa — koniec.\n"; exit(0); }

try {
    // ---- 1. czy są nowe dane?
    $resources = rwdz_get_json(RWDZ_DATASET_API)['data'] ?? [];
    $wanted = [];
    foreach ($resources as $r) {
        $a = $r['attributes'] ?? [];
        $title = (string)($a['title'] ?? '');
        if (!str_starts_with($title, 'Wnioski i decyzje') && !(str_contains($title, 'Zgłoszenia') && str_contains($title, 'od 2022'))) continue;
        $url = (string)($a['file_url'] ?? '') ?: (string)($a['link'] ?? '') ?: (string)($a['download_url'] ?? '');
        $wanted[] = ['title' => $title, 'url' => $url, 'date' => substr((string)($a['data_date'] ?? $a['modified'] ?? ''), 0, 10), 'done' => false];
    }
    if (!$wanted) throw new RuntimeException('Brak plików RWDZ w zbiorze 3467 — sprawdź dane.gov.pl.');
    $latest = max(array_column($wanted, 'date'));
    $current = null;
    if (is_file($dbPath)) {
        try { $current = (new PDO('sqlite:' . $dbPath))->query("SELECT value FROM meta WHERE key = 'data_date'")->fetchColumn() ?: null; } catch (Throwable) { $current = null; }
    }
    $state = is_file($statePath) ? json_decode((string)file_get_contents($statePath), true) : null;
    if (!$state && !$force && $current !== null && $latest <= $current) {
        rwdz_log("Dane aktualne (GUNB {$latest}, baza {$current}).");
        rwdz_status(['ok' => true, 'state' => 'aktualne', 'dataDate' => $current, 'latest' => $latest]);
        exit(0);
    }

    // ---- 2. budowa (nowa albo wznowiona)
    $tmpDb = $dbPath . '.building';
    if (!$state || ($state['latest'] ?? '') !== $latest || !is_file($tmpDb)) {
        @unlink($tmpDb);
        $cutoff = (new DateTimeImmutable('today'))->modify("-{$years} years")->format('Y-m-d');
        $state = ['latest' => $latest, 'cutoff' => $cutoff, 'years' => $years, 'files' => $wanted, 'started' => date('c'), 'missing' => []];
        $db = new PDO('sqlite:' . $tmpDb, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
            CREATE TABLE investments (id INTEGER PRIMARY KEY, src TEXT NOT NULL, date_in TEXT, date_dec TEXT, number TEXT, organ INTEGER,
                investor TEXT, type TEXT, category TEXT, kind INTEGER, intent INTEGER, name TEXT, volume REAL, status INTEGER, place TEXT);
            CREATE TABLE lookup (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE);
            CREATE TABLE parcels (inv INTEGER NOT NULL, unit TEXT NOT NULL, obreb TEXT NOT NULL, nr TEXT NOT NULL);
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);');
        rwdz_log("Nowe dane GUNB z {$latest} (baza: " . ($current ?? 'brak') . ") — początek budowy, od {$cutoff}.");
    } else {
        $db = new PDO('sqlite:' . $tmpDb, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;');
        rwdz_log('Wznowienie budowy (' . count(array_filter($state['files'], fn ($f) => $f['done'])) . '/' . count($state['files']) . ' plików gotowe).');
    }
    $saveState = function () use (&$state, $statePath): void { file_put_contents($statePath, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX); };
    $saveState();

    $lookups = [];
    foreach ($db->query('SELECT id, value FROM lookup') as $row) $lookups[$row['value']] = (int)$row['id'];
    $insLookup = $db->prepare('INSERT INTO lookup (value) VALUES (?)');
    $lookup = function (string $value) use (&$lookups, $insLookup, $db): ?int {
        if ($value === '') return null;
        if (!isset($lookups[$value])) { $insLookup->execute([$value]); $lookups[$value] = (int)$db->lastInsertId(); }
        return $lookups[$value];
    };
    $insInv = $db->prepare('INSERT INTO investments (src, date_in, date_dec, number, organ, investor, type, category, kind, intent, name, volume, status, place) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $insPar = $db->prepare('INSERT INTO parcels (inv, unit, obreb, nr) VALUES (?,?,?,?)');

    foreach ($state['files'] as $i => $file) {
        if ($file['done']) continue;
        if (microtime(true) - $started > $budgetS) { rwdz_log('Limit czasu — dokończę przy następnym uruchomieniu.'); rwdz_status(['ok' => true, 'state' => 'w trakcie', 'latest' => $latest, 'dataDate' => $current]); exit(0); }
        $zone = str_contains($file['title'], 'Zgłoszenia') ? 'Z' : 'P';
        $name = mb_substr(preg_replace('/[^a-z0-9]+/u', '-', mb_strtolower($file['title'])) ?? 'plik', 0, 80); // jak w tools/build_rwdz_store.py
        $zipPath = $zipCache && is_file("{$zipCache}/{$name}.zip") ? "{$zipCache}/{$name}.zip" : "{$workDir}/download.zip";
        if ($zipPath === "{$workDir}/download.zip") {
            try { rwdz_download($file['url'], $zipPath); }
            catch (Throwable $e) { rwdz_log("POMINIĘTO {$file['title']}: {$e->getMessage()}"); $state['missing'][] = $file['title']; $state['files'][$i]['done'] = true; $saveState(); continue; }
        }
        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) throw new RuntimeException("Nie można otworzyć ZIP: {$file['title']}");
        $csvName = null;
        for ($k = 0; $k < $zip->numFiles; $k++) { $n = (string)$zip->getNameIndex($k); if (str_ends_with(strtolower($n), '.csv')) { $csvName = $n; break; } }
        $stream = $csvName !== null ? $zip->getStream($csvName) : false;
        if (!$stream) throw new RuntimeException("Brak CSV w ZIP: {$file['title']}");
        $header = fgetcsv($stream, 0, ';', '"', '');
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string)$header[0]);
        $cols = []; $seen = [];
        foreach ($header as $h) { $seen[$h] = ($seen[$h] ?? 0) + 1; $cols[] = $seen[$h] === 1 ? $h : "{$h}_{$seen[$h]}"; }
        $keys = []; $kept = 0;
        $db->beginTransaction();
        while (($row = fgetcsv($stream, 0, ';', '"', '')) !== false) {
            if (count($row) < count($cols) - 2) continue;
            $r = array_combine(array_slice($cols, 0, count($row)), array_slice($row, 0, count($cols)));
            if ($r === false) continue;
            $dateIn = substr((string)($r['data_wplywu_wniosku'] ?? $r['data_wplywu_wniosku_do_urzedu'] ?? ''), 0, 10);
            if ($dateIn === '' || $dateIn < $state['cutoff']) continue;
            $unit = rwdz_clean($r['jednosta_numer_ew'] ?? $r['jednostki_numer'] ?? '', 20);
            $obreb = rwdz_clean($r['obreb_numer'] ?? '', 10);
            $nr = rwdz_clean($r['numer_dzialki'] ?? '', 30);
            if ($unit === '' || $obreb === '' || $nr === '' || !preg_match('/^\d{6}_\d(\.\d{4})?$/', $unit)) continue;
            $key = $zone === 'P'
                ? 'P|' . (($r['numer_gunb'] ?? '') !== '' ? $r['numer_gunb'] : (($r['numer_urzad'] ?? '') . '|' . ($r['nazwa_organu'] ?? '')))
                : 'Z|' . (($r['numer_ewidencyjny_system'] ?? '') !== '' ? $r['numer_ewidencyjny_system'] : (($r['numer_ewidencyjny_urzad'] ?? '') . '|' . ($r['nazwa_organu'] ?? '')));
            $inv = $keys[$key] ?? null;
            if ($inv === null) {
                $category = rwdz_clean($r['kategoria'] ?? '', 8);
                $kind = rwdz_clean($r['rodzaj_inwestycji'] ?? '', 80);
                $intent = rwdz_clean(($r['nazwa_zamierzenia_bud'] ?? '') !== '' ? $r['nazwa_zamierzenia_bud'] : ($r['rodzaj_zam_budowlanego'] ?? ''), 80);
                $name = rwdz_clean($r['nazwa_zam_budowlanego'] ?? '', 180);
                $volume = (float)str_replace(',', '.', (string)($r['kubatura'] ?? ''));
                $street = rwdz_clean($r['ulica'] ?? '', 60);
                $place = implode(', ', array_filter([rwdz_clean($r['miasto'] ?? '', 60), trim($street . ' ' . rwdz_clean($r['nr_domu'] ?? '', 12))]));
                $insInv->execute([$zone, $dateIn, substr((string)($r['data_wydania_decyzji'] ?? ''), 0, 10) ?: null,
                    rwdz_clean(($r['numer_decyzji_urzedu'] ?? '') ?: (($r['numer_ewidencyjny_urzad'] ?? '') ?: ($r['numer_urzad'] ?? '')), 60),
                    $lookup(rwdz_clean($r['nazwa_organu'] ?? '', 120)), rwdz_clean($r['nazwa_inwestor'] ?? '', 160) ?: null,
                    rwdz_classify($category, $kind, $intent, $name), $category, $lookup($kind), $lookup($intent), $name ?: null,
                    $volume > 0 ? $volume : null, $lookup(rwdz_clean($r['stan'] ?? '', 60)), $place ?: null]);
                $inv = (int)$db->lastInsertId();
                $keys[$key] = $inv;
            }
            $insPar->execute([$inv, $unit, $obreb, $nr]);
            if (++$kept % 20000 === 0) { $db->commit(); $db->beginTransaction(); }
        }
        $db->commit();
        fclose($stream); $zip->close();
        if (!$zipCache) @unlink($zipPath);
        $state['files'][$i]['done'] = true;
        $state['files'][$i]['kept'] = $kept;
        $saveState();
        rwdz_log("  {$file['title']}: {$kept} wpisów (pamięć " . round(memory_get_peak_usage(true) / 1048576) . ' MB)');
    }

    // ---- 3. indeksy, meta, podmiana
    rwdz_log('Indeksy…');
    $db->exec('DELETE FROM parcels WHERE rowid NOT IN (SELECT MIN(rowid) FROM parcels GROUP BY inv, unit, obreb, nr);
        CREATE INDEX parcels_region ON parcels (unit, obreb); CREATE INDEX parcels_inv ON parcels (inv);');
    $counts = ['investments' => (int)$db->query('SELECT COUNT(*) FROM investments')->fetchColumn(), 'parcels' => (int)$db->query('SELECT COUNT(*) FROM parcels')->fetchColumn()];
    $meta = ['data_date' => $latest, 'built_at' => date('c'), 'cutoff' => $state['cutoff'], 'years' => (string)$state['years'],
        'missing' => implode('; ', $state['missing']), 'source' => 'GUNB — Rejestr Wniosków, Decyzji i Zgłoszeń (dane.gov.pl, zbiór 3467)',
        'builder' => 'cron/rwdz_update.php', 'investments' => (string)$counts['investments'], 'parcels' => (string)$counts['parcels']];
    $ins = $db->prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    foreach ($meta as $k => $v) $ins->execute([$k, $v]);
    $db = null; $insInv = $insPar = $insLookup = $ins = null;
    if ($counts['investments'] < 1000) throw new RuntimeException("Podejrzanie mało inwestycji ({$counts['investments']}) — baza NIE została podmieniona.");
    if (!rename($tmpDb, $dbPath)) throw new RuntimeException('Nie udało się podmienić pliku bazy.');
    @unlink($statePath);
    $minutes = round((microtime(true) - $started) / 60, 1);
    rwdz_log("GOTOWE: baza z danymi GUNB {$latest} — {$counts['investments']} inwestycji, {$counts['parcels']} działek (ostatni etap {$minutes} min, pamięć " . round(memory_get_peak_usage(true) / 1048576) . ' MB).');
    rwdz_status(['ok' => true, 'state' => 'zaktualizowano', 'dataDate' => $latest, 'investments' => $counts['investments'], 'missing' => $state['missing']]);
} catch (Throwable $e) {
    rwdz_log('BŁĄD: ' . $e->getMessage());
    rwdz_status(['ok' => false, 'state' => 'błąd', 'error' => $e->getMessage()]);
    exit(1);
}
