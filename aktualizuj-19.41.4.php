<?php
/**
 * msportal 19.41.4 — jednorazowe przestawienie plików serwera na nową wersję.
 *
 * Paczka aktualizacji zawiera pliki przeglądarki (index.html, app-19.41.4/, CSS, diagnostyka, vendor/ol-esm-2).
 * Ten skrypt zmienia NA SERWERZE:
 *   - numery wersji: reguła katalogu aplikacji w .htaccess, wersja w api/health.php, podpisy wersji
 *     w pozostałych plikach api/ i monitor-zrodel.html;
 *   - 19.31.0: poprawkę sprawdzania zagrożenia powodziowego w api/identify.php (nakładaną tylko wtedy, gdy plik
 *     ma oczekiwaną treść; oryginał w cache/kopia-19.31/ do kroku 2).
 * Reszta treści plików serwera zostaje bez zmian (zachowane są zmiany z wersji 19.19–19.27).
 *
 * Krok 1 (przed albo zaraz po wgraniu plików):  php aktualizuj-19.41.4.php
 *   .htaccess dopuszcza app-19.41.4 OBOK dotychczasowego katalogu — portal działa przez cały czas.
 * Krok 2 (po wgraniu i sprawdzeniu portalu):     php aktualizuj-19.41.4.php --sprzatanie
 *   usuwa stare katalogi app-*, stary vendor/ol-esm, starą regułę z .htaccess, kopie i ten skrypt.
 *
 * Wycofanie przed krokiem 2: przywróć .htaccess.bak-<stara wersja> jako .htaccess, cache/kopia-19.31/identify.php
 * jako api/identify.php i stary index.html (stary katalog app-* nadal jest na serwerze).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const NEW_VERSION = '19.41.4';
$root = __DIR__;
$report = ['wersja_docelowa' => NEW_VERSION, 'zmienione_pliki' => [], 'uwagi' => []];
$fail = static function (string $message) use (&$report): never {
    http_response_code(500);
    $report['ok'] = false;
    $report['blad'] = $message;
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
};
$esc = static fn (string $version): string => str_replace('.', '\\.', $version);
$newRule = 'RewriteRule ^app-' . $esc(NEW_VERSION) . '/ - [L]';

$htPath = $root . '/.htaccess';
$ht = @file_get_contents($htPath);
if (!is_string($ht) || $ht === '') $fail('Nie można odczytać pliku .htaccess.');

// Dotychczasowa wersja = reguła app-X.Y.Z w .htaccess inna niż docelowa.
preg_match_all('/^[ \t]*RewriteRule \^app-(\d+)\\\\\.(\d+)\\\\\.(\d+)\/ - \[L\][ \t]*$/m', $ht, $rules, PREG_SET_ORDER);
$oldVersions = [];
foreach ($rules as $rule) {
    $version = $rule[1] . '.' . $rule[2] . '.' . $rule[3];
    if ($version !== NEW_VERSION) $oldVersions[] = $version;
}
$report['poprzednia_wersja'] = $oldVersions[0] ?? null;

if (!in_array('--sprzatanie', $argv, true)) {
    // ---- krok 1: nowa reguła obok starej + numery wersji w plikach serwera
    if (!str_contains($ht, $newRule)) {
        if (!$oldVersions) $fail('W .htaccess nie ma reguły RewriteRule ^app-X.Y.Z/ - [L] — zaktualizuj ręcznie.');
        $oldRule = 'RewriteRule ^app-' . $esc($oldVersions[0]) . '/ - [L]';
        $updated = preg_replace('/^([ \t]*)' . preg_quote($oldRule, '/') . '/m', '$1' . $newRule . "\n" . '$1' . $oldRule, $ht, 1);
        if (!is_string($updated) || $updated === $ht) $fail('Nie udało się dopisać reguły do .htaccess.');
        if (@file_put_contents($root . '/.htaccess.bak-' . $oldVersions[0], $ht) === false) $report['uwagi'][] = 'Nie zapisano kopii .htaccess (brak prawa zapisu w katalogu).';
        if (@file_put_contents($htPath, $updated) === false) $fail('Brak prawa zapisu do .htaccess.');
        $report['zmienione_pliki'][] = '.htaccess';
    }
    $old = $oldVersions[0] ?? null;
    if ($old !== null) {
        $q = preg_quote($old, '/');
        $patterns = [
            "/'" . $q . "-server'/" => "'" . NEW_VERSION . "-server'",
            "/'" . $q . "-export'/" => "'" . NEW_VERSION . "-export'",
            '/(MSPortal(?:Vendor)?\/)' . $q . '/' => '${1}' . NEW_VERSION,
            "/(VPS_VERSION\\s*=\\s*')" . $q . "'/" => '${1}' . NEW_VERSION . "'",
            "/('version'\\s*=>\\s*')" . $q . "'/" => '${1}' . NEW_VERSION . "'",
            '/(MSPortal )' . $q . '/' => '${1}' . NEW_VERSION,
        ];
        foreach (glob($root . '/api/*.php') ?: [] as $file) {
            $text = (string) @file_get_contents($file);
            $next = preg_replace(array_keys($patterns), array_values($patterns), $text);
            if (is_string($next) && $next !== $text) {
                if (@file_put_contents($file, $next) === false) $fail('Brak prawa zapisu: api/' . basename($file));
                $report['zmienione_pliki'][] = 'api/' . basename($file);
            }
        }
        $monitor = $root . '/monitor-zrodel.html';
        $text = (string) @file_get_contents($monitor);
        $next = preg_replace(['/\?v=' . $q . '/', '/<strong>' . $q . '<\/strong>/'], ['?v=' . NEW_VERSION, '<strong>' . NEW_VERSION . '</strong>'], $text);
        if ($text !== '' && is_string($next) && $next !== $text && @file_put_contents($monitor, $next) !== false) $report['zmienione_pliki'][] = 'monitor-zrodel.html';
    }
    // 19.31.0: poprawki plików serwera nakładane w miejscu — tylko gdy plik ma oczekiwaną treść.
    // Oryginał trafia do cache/kopia-19.31/ (katalog niedostępny z sieci); krok 2 go usuwa.
    $serverPatches = [
        [
            'file' => 'api/identify.php',
            'opis' => 'zagrożenie powodziowe (ISOK): nowe nazwy warstw',
            'marker' => 'NZ.Fluvial,NZ.SeaWater,NZ.ArtificialWaterBearingInfrastructure',
            'find' => "/'layers'\\s*=>\\s*'NZ\\.HazardArea',\\s*'query_layers'\\s*=>\\s*'NZ\\.HazardArea',\\s*'version'\\s*=>\\s*'1\\.3\\.0',\\s*'variants'\\s*=>\\s*\\[\\s*\\['layers'\\s*=>\\s*'HazardArea',\\s*'query_layers'\\s*=>\\s*'HazardArea'\\],\\s*\\],/",
            'replace' => "// 19.31.0: usługa ISOK nie ma już warstwy NZ.HazardArea — obszary zagrożenia są w trzech warstwach scenariuszy.\n"
                . "        'layers' => 'NZ.Fluvial,NZ.SeaWater,NZ.ArtificialWaterBearingInfrastructure',\n"
                . "        'query_layers' => 'NZ.Fluvial,NZ.SeaWater,NZ.ArtificialWaterBearingInfrastructure', 'version' => '1.3.0',\n"
                . "        // GeoJSON tej usługi niesie całą geometrię strefy (kilka MB) — tekst ma kilka kB.\n"
                . "        'info_formats' => ['text/plain', 'text/html'],\n"
                . "        'variants' => [\n"
                . "            ['layers' => 'NZ.Fluvial', 'query_layers' => 'NZ.Fluvial'],\n"
                . "        ],",
        ],
        [
            'file' => 'api/identify.php',
            'opis' => 'identyfikacja: kolejność formatów wskazana przez źródło',
            'marker' => "\$source['info_formats']",
            'find' => '/^\$formats = array_merge\(IDENTIFY_STRUCTURED_FORMATS, IDENTIFY_TEXT_FORMATS\);\R/m',
            'replace' => "\$formats = array_merge(IDENTIFY_STRUCTURED_FORMATS, IDENTIFY_TEXT_FORMATS);\n"
                . "// 19.31.0: źródło może wskazać kolejność formatów (np. tekst bez geometrii zamiast ciężkiego GeoJSON).\n"
                . "if (is_array(\$source['info_formats'] ?? null)) {\n"
                . "    \$formats = array_values(array_unique(array_merge(array_values(array_filter(\$source['info_formats'], 'is_string')), \$formats)));\n"
                . "}\n",
        ],
    ];
    $report['poprawki_serwera'] = [];
    $patchedTexts = [];
    foreach ($serverPatches as $patch) {
        $path = $root . '/' . $patch['file'];
        if (!array_key_exists($path, $patchedTexts)) $patchedTexts[$path] = ['old' => (string) @file_get_contents($path), 'new' => null];
        $text = $patchedTexts[$path]['new'] ?? $patchedTexts[$path]['old'];
        if ($text === '') { $report['poprawki_serwera'][] = $patch['opis'] . ': brak pliku ' . $patch['file']; continue; }
        if (str_contains($text, $patch['marker'])) { $report['poprawki_serwera'][] = $patch['opis'] . ': już zastosowana'; continue; }
        if (preg_match_all($patch['find'], $text) !== 1) {
            $report['poprawki_serwera'][] = $patch['opis'] . ': POMINIĘTA — plik ma inną treść';
            $report['uwagi'][] = 'Poprawka „' . $patch['opis'] . '” nie pasuje do ' . $patch['file'] . ' na serwerze — wgraj ten plik z pełnej paczki 19.41.4.';
            continue;
        }
        $replacement = $patch['replace'];
        $patchedTexts[$path]['new'] = preg_replace_callback($patch['find'], static fn () => $replacement, $text, 1);
        $report['poprawki_serwera'][] = $patch['opis'] . ': zastosowana';
    }
    foreach ($patchedTexts as $path => $texts) {
        if ($texts['new'] === null || $texts['new'] === $texts['old']) continue;
        $backupDir = $root . '/cache/kopia-19.31';
        @mkdir($backupDir, 0775, true);
        if (@file_put_contents($backupDir . '/' . basename($path), $texts['old']) === false) $fail('Nie zapisano kopii ' . basename($path) . ' w cache/kopia-19.31 — poprawka niezastosowana.');
        if (@file_put_contents($path, $texts['new']) === false) $fail('Brak prawa zapisu: ' . substr($path, strlen($root) + 1));
        $report['zmienione_pliki'][] = substr($path, strlen($root) + 1);
    }
    $report['krok'] = 1;
    $report['app_nowej_wersji_wgrany'] = is_file($root . '/app-' . NEW_VERSION . '/main.js');
    // 19.35.0: skrypt automatycznej aktualizacji pozwoleń — musi mieć blokadę dostępu z przeglądarki.
    // 19.41.4: kompletność katalogu api/ — brak plików PHP daje w portalu błędy 404 (np. rejestr budów, ceny).
    $apiRequired = ['_analysis_buildings_store.php','_common.php','_dem.php','_identify_parse.php','_source_profiles.php','_source_semantics.php','_terrain.php','_vendor_builder.php','_vps_geo.php','_vps_ru.php','_vps_store.php','_wms_sources.php','analysis_buildings.php','dem.php','export.php','forest.php','health.php','identify.php','orthophoto.php','permits.php','rcn.php','search.php','shared_project.php','source_monitor.php','terrain.php','uldk.php','vendor_status.php','vps.php','wms.php','wms_legend.php', 'certs/cacert.pem', 'certs/.htaccess'];
    $apiMissing = array_values(array_filter($apiRequired, fn ($name) => !is_file($root . '/api/' . $name)));
    $report['katalog_api'] = $apiMissing ? 'BRAK ' . count($apiMissing) . ' plików — wgraj cały katalog api/ z paczki: ' . implode(', ', $apiMissing) : 'kompletny (' . count($apiRequired) . ' plików)';
    // 19.37.0: „Czyj las” — api/forest.php (Bank Danych o Lasach).
    $report['czyj_las'] = is_file($root . '/api/forest.php') ? 'api/forest.php wgrany' : 'BRAK api/forest.php — wgraj z paczki';
    // 19.36.0: raport działki PDF — biblioteka i czcionki w vendor/pdf (ładowane dopiero przy tworzeniu raportu).
    $report['raport_pdf_biblioteka'] = is_file($root . '/vendor/pdf/jspdf.umd.min.js') && is_file($root . '/vendor/pdf/Inter_400Regular.ttf') && is_file($root . '/vendor/pdf/Inter_700Bold.ttf')
        ? 'wgrana' : 'BRAK — wgraj katalog vendor/pdf/ z paczki (raport PDF nie zadziała)';
    $report['raport_pdf_konfiguracja'] = is_file($root . '/konfiguracja/raport-pdf.json') ? 'konfiguracja/raport-pdf.json — własne ustawienia' : 'ustawienia domyślne (opcjonalnie: konfiguracja/raport-pdf.json, przykład w paczce)';
    $report['cron_aktualizacji_pozwolen'] = !is_file($root . '/cron/rwdz_update.php') ? 'nie wgrany (katalog cron/ z paczki)'
        : (is_file($root . '/cron/.htaccess') ? 'wgrany — ustaw zadanie w OVH: Hosting → Zaplanowane zadania (Cron), skrypt cron/rwdz_update.php, codziennie' : 'BRAK cron/.htaccess — wgraj go (ukryty plik)');
    $report['nastepny_krok'] = $report['app_nowej_wersji_wgrany']
        ? 'Sprawdź portal, potem uruchom w CLI: php aktualizuj-19.41.4.php --sprzatanie'
        : 'Wgraj pliki z paczki 19.41.4, sprawdź portal, potem uruchom w CLI: php aktualizuj-19.41.4.php --sprzatanie';
    $report['ok'] = true;
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---- krok 2: sprzątanie — tylko gdy nowa wersja jest kompletna
$version = trim((string) @file_get_contents($root . '/VERSION.txt'));
if ($version !== NEW_VERSION) $fail('VERSION.txt ma „' . $version . '” — najpierw wgraj pliki z paczki 19.41.4.');
if (!is_file($root . '/app-' . NEW_VERSION . '/main.js')) $fail('Brak app-' . NEW_VERSION . '/main.js — najpierw wgraj pliki z paczki.');
if (!str_contains($ht, $newRule)) $fail('Najpierw uruchom krok 1 (aktualizuj-19.41.4.php bez parametrów).');

$removeTree = static function (string $dir) use (&$removeTree): bool {
    foreach (scandir($dir) ?: [] as $name) {
        if ($name === '.' || $name === '..') continue;
        $path = $dir . '/' . $name;
        if (is_dir($path) && !is_link($path)) { if (!$removeTree($path)) return false; }
        elseif (!@unlink($path)) return false;
    }
    return @rmdir($dir);
};
$removed = [];
foreach (glob($root . '/app-*', GLOB_ONLYDIR) ?: [] as $dir) {
    if (basename($dir) === 'app-' . NEW_VERSION) continue;
    if ($removeTree($dir)) $removed[] = basename($dir);
    else $report['uwagi'][] = 'Nie udało się usunąć ' . basename($dir) . ' — usuń przez FTP.';
}
// 19.30.0 poprawka 1: nakładki OpenLayers przeniesione do vendor/ol-esm-2/ — stary katalog nie jest już używany.
if (is_dir($root . '/vendor/ol-esm-2') && is_dir($root . '/vendor/ol-esm')) {
    if ($removeTree($root . '/vendor/ol-esm')) $removed[] = 'vendor/ol-esm';
    else $report['uwagi'][] = 'Nie udało się usunąć vendor/ol-esm — usuń przez FTP.';
}
$cleanHt = $ht;
foreach ($oldVersions as $old) {
    $cleanHt = (string) preg_replace('/^[ \t]*' . preg_quote('RewriteRule ^app-' . $esc($old) . '/ - [L]', '/') . '[ \t]*\R/m', '', $cleanHt);
}
if ($cleanHt !== $ht) {
    if (@file_put_contents($htPath, $cleanHt) === false) $report['uwagi'][] = 'Nie zapisano .htaccess — usuń starą regułę ręcznie.';
    else $report['zmienione_pliki'][] = '.htaccess';
}
foreach (glob($root . '/.htaccess.bak-*') ?: [] as $backup) @unlink($backup);
foreach (glob($root . '/cache/kopia-19.31/*') ?: [] as $backup) @unlink($backup); // kopie plików sprzed poprawek z kroku 1
@rmdir($root . '/cache/kopia-19.31'); // kopia z kroku 1 nie jest już potrzebna
foreach (glob($root . '/aktualizuj-*.php') ?: [] as $script) { if (realpath($script) !== realpath(__FILE__)) @unlink($script); } // skrypty poprzednich wersji
$report['usuniete_katalogi'] = $removed;
$report['krok'] = 2;
$report['skrypt_usuniety'] = @unlink(__FILE__);
if (!$report['skrypt_usuniety']) $report['uwagi'][] = 'Usuń plik aktualizuj-19.41.4.php przez FTP.';
$report['sprawdz'] = 'verify-deployment.php → "deployment_consistent": true';
$report['ok'] = true;
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
