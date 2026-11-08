<?php
declare(strict_types=1);

/**
 * 19.8.3: plany ogólne (POG) i MPZP w analizie działki prosto z Rejestru Urbanistycznego,
 * bez importu danych. Usługi WMS RU zwracają w GetFeatureInfo (JSON) pełną geometrię
 * obiektu w EPSG:2180 i jego parametry, więc pole części wspólnej z działką liczymy dokładnie
 * (geo_intersection_area), a nie z próbkowania.
 *
 * Punkty zapytań: wnętrze działki; kolejne rundy pytają tylko o miejsca, których nie pokrywa
 * jeszcze żaden pobrany obiekt. Strefy POG są publikowane dopiero od skali 1:10 000, dlatego
 * zapytanie dotyczy okna 128 × 128 m (skala ~1:3600).
 */

const VPS_RU_HOST = 'rejestr-urbanistyczny.gov.pl';
const VPS_RU_TIMEOUT = 5;
const VPS_RU_MAX_ROUNDS = 3;
const VPS_RU_POINTS_PER_ROUND = 5;
const VPS_RU_BUDGET_S = 8.0; // łączny czas zapytań RU w jednej analizie

function vps_ru_categories(): array {
    $zones = [];
    foreach (['SW', 'SJ', 'SZ', 'SU', 'SH', 'SP', 'SR', 'SI', 'SN', 'SC', 'SG', 'SO', 'SK'] as $code) {
        $zones[] = "APP.POG.{$code}.PrawnieWiazacyLubRealizowany";
    }
    return [
        'pog' => [
            'service' => 'wms-pog',
            // Strefy (pokrywają całą gminę) + akty: uchwalony i w trakcie przyjmowania.
            'layers' => array_merge($zones, ['APP.POG.PrawnieWiazacyLubRealizowany', 'APP.POG.WTrakciePrzyjmowania']),
            'leaf' => '~^APP\.POG\.S[A-Z]\.~',
            // Plan ogólny obejmuje całą gminę: pusta pierwsza runda = brak planu w rejestrze.
            'stopAfterEmptyRounds' => 1,
        ],
        'mpzp' => [
            'service' => 'wms-mpzp',
            'layers' => ['APP.MPZP.PrawnieWiazacyLubRealizowany', 'APP.MPZP.WTrakciePrzyjmowania'],
            'leaf' => '~^APP\.MPZP\.~',
            // MPZP może obejmować tylko część działki: dwie puste rundy (≈10 punktów) kończą szukanie.
            'stopAfterEmptyRounds' => 2,
        ],
    ];
}

function vps_ru_gfi_url(string $service, array $layers, float $x, float $y): string {
    $h = 64.0; // 128 px × 1 m
    $list = implode(',', $layers);
    return 'https://' . VPS_RU_HOST . "/uslugi-sieciowe/{$service}/wms?" . http_build_query([
        'SERVICE' => 'WMS', 'REQUEST' => 'GetFeatureInfo', 'VERSION' => '1.3.0', 'CRS' => 'EPSG:2180',
        // WMS 1.3.0 + EPSG:2180: kolejność osi northing, easting.
        'BBOX' => sprintf('%.2F,%.2F,%.2F,%.2F', $y - $h, $x - $h, $y + $h, $x + $h),
        'WIDTH' => '128', 'HEIGHT' => '128', 'I' => '64', 'J' => '64', 'STYLES' => '', 'FORMAT' => 'image/png',
        'LAYERS' => $list, 'QUERY_LAYERS' => $list, 'INFO_FORMAT' => 'application/json', 'FEATURE_COUNT' => '25',
    ], '', '&', PHP_QUERY_RFC3986);
}

/** Punkty kandydujące wewnątrz działki (EPSG:2180): punkt reprezentatywny + siatka 7×7 w zasięgu. */
function vps_ru_candidate_points(array $parcel): array {
    $points = [geo_representative_point($parcel)];
    [$x0, $y0, $x1, $y1] = geo_bounds($parcel);
    $n = 7;
    for ($i = 0; $i < $n; $i++) {
        for ($j = 0; $j < $n; $j++) {
            $x = $x0 + ($x1 - $x0) * ($i + .5) / $n;
            $y = $y0 + ($y1 - $y0) * ($j + .5) / $n;
            if (geo_point_in_polys($x, $y, $parcel['polys'])) $points[] = [$x, $y];
        }
    }
    return $points;
}

/** Wybiera do $k punktów możliwie odległych od siebie (pierwszy punkt zawsze pierwszy). */
function vps_ru_spread(array $points, int $k): array {
    if (count($points) <= $k) return $points;
    $chosen = [array_shift($points)];
    while (count($chosen) < $k && $points) {
        $best = 0; $bestD = -1.0;
        foreach ($points as $i => $p) {
            $d = INF;
            foreach ($chosen as $c) $d = min($d, ($p[0] - $c[0]) ** 2 + ($p[1] - $c[1]) ** 2);
            if ($d > $bestD) { $bestD = $d; $best = $i; }
        }
        $chosen[] = $points[$best];
        array_splice($points, $best, 1);
    }
    return $chosen;
}

function vps_ru_short_props(array $props): array {
    $out = [];
    foreach (array_slice($props, 0, 16, true) as $k => $v) {
        // Puste pola rejestru (null, „-”) pomijamy — inaczej w raporcie pojawiało się „None”.
        if (is_array($v) || $v === null || in_array(trim((string)$v), ['', '-'], true)) continue;
        $out[(string)$k] = mb_substr(vps_py_str($v), 0, 300);
    }
    return $out;
}

/**
 * Obiekty RU przecinające działkę, z dokładnym polem części wspólnej.
 * Zwraca [kategoria => ['ok' => bool, 'matches' => [...], 'uncovered' => bool, 'queries' => int]].
 */
function vps_ru_parcel_layers(array $parcel, array $extraUrls = [], ?array &$extraOut = null): array {
    $extraOut = [];
    $parcelArea = geo_area($parcel);
    $candidates = vps_ru_candidate_points($parcel);
    $state = [];
    foreach (vps_ru_categories() as $cat => $cfg) {
        $state[$cat] = ['cfg' => $cfg, 'features' => [], 'pending' => $candidates, 'answered' => 0, 'failedPts' => [],
            'queries' => 0, 'emptyRounds' => 0, 'stopped' => false];
    }
    $started = microtime(true);
    for ($round = 0; $round < VPS_RU_MAX_ROUNDS; $round++) {
        $left = VPS_RU_BUDGET_S - (microtime(true) - $started);
        if ($round > 0 && $left < 2) break;
        $urls = []; $asked = [];
        foreach ($state as $cat => &$st) {
            if ($st['stopped']) continue;
            // Pomiń punkty pokryte już pobranym obiektem „liściowym” (strefa POG / plan MPZP).
            $st['pending'] = array_values(array_filter($st['pending'], function (array $p) use ($st): bool {
                foreach ($st['features'] as $f) {
                    if ($f['leaf'] && geo_point_in_polys($p[0], $p[1], $f['geom']['polys'])) return false;
                }
                return true;
            }));
            foreach (vps_ru_spread($st['pending'], VPS_RU_POINTS_PER_ROUND) as $i => $p) {
                $key = "{$cat}|{$round}|{$i}";
                $urls[$key] = vps_ru_gfi_url($st['cfg']['service'], $st['cfg']['layers'], $p[0], $p[1]);
                $asked[$key] = [$cat, $p];
            }
        }
        unset($st);
        if ($round === 0 && $extraUrls) $urls += $extraUrls;
        if (!$urls) break;
        $roundFound = array_fill_keys(array_keys($state), false);
        $roundAsked = array_fill_keys(array_keys($state), false);
        $replies = vps_fetch_parallel($urls, 4000000, (int)max(2, min(VPS_RU_TIMEOUT, floor($left))),
            [VPS_RU_HOST, 'mapy.geoportal.gov.pl'], array_values(array_intersect(array_keys($urls), VPS_FOLLOW_KEYS)));
        foreach ($replies as $key => $raw) {
            if (!isset($asked[$key])) { $extraOut[$key] = $raw; continue; }
            [$cat, $p] = $asked[$key];
            $state[$cat]['queries']++;
            $roundAsked[$cat] = true;
            $pointKey = sprintf('%.2F,%.2F', $p[0], $p[1]);
            $reply = is_string($raw) ? json_decode($raw, true) : null;
            // Nieudany punkt zostaje w kolejce — kolejna runda zapyta o niego ponownie.
            if (!is_array($reply) || !isset($reply['features'])) { $roundFound[$cat] = true; $state[$cat]['failedPts'][$pointKey] = $p; continue; }
            unset($state[$cat]['failedPts'][$pointKey]);
            $state[$cat]['answered']++;
            if ($reply['features']) $roundFound[$cat] = true;
            // Punkt bez obiektu: nie pytamy o niego ponownie.
            $state[$cat]['pending'] = array_values(array_filter($state[$cat]['pending'], fn($q) => $q !== $p));
            foreach ((array)$reply['features'] as $feature) {
                $id = (string)($feature['id'] ?? '');
                if ($id === '' || isset($state[$cat]['features'][$id]) || !is_array($feature['geometry'] ?? null)) continue;
                $geom = geo_normalize($feature['geometry'], false); // już EPSG:2180 (easting, northing)
                if ($geom === null || !$geom['polys']) continue;
                $state[$cat]['features'][$id] = ['id' => $id, 'geom' => $geom,
                    'props' => is_array($feature['properties'] ?? null) ? $feature['properties'] : [],
                    'leaf' => (bool)preg_match($state[$cat]['cfg']['leaf'], $id)];
            }
        }
        foreach ($state as $cat => &$st) {
            if (!$roundAsked[$cat]) continue;
            $st['emptyRounds'] = $roundFound[$cat] ? 0 : $st['emptyRounds'] + 1;
            if ($st['emptyRounds'] >= $st['cfg']['stopAfterEmptyRounds']) $st['stopped'] = true;
        }
        unset($st);
    }
    $out = [];
    foreach ($state as $cat => $st) {
        // Nieudany punkt nie obniża kompletności, jeśli leży w strefie pobranej z innego punktu.
        $st['failedPts'] = array_filter($st['failedPts'], function (array $p) use ($st): bool {
            foreach ($st['features'] as $f) if ($f['leaf'] && geo_point_in_polys($p[0], $p[1], $f['geom']['polys'])) return false;
            return true;
        });
        $matches = [];
        $leafArea = 0.0;
        foreach ($st['features'] as $f) {
            $overlap = geo_intersection_area($parcel['polys'], $f['geom']['polys']);
            if ($overlap < 0.05) continue;
            if ($f['leaf']) $leafArea += $overlap;
            $props = $f['props'];
            $label = null;
            foreach (['Oznaczenie', 'Tytuł', 'Nazwa', 'Identyfikator'] as $k) {
                if (!empty($props[$k]) && $props[$k] !== '-') { $label = mb_substr(vps_py_str($props[$k]), 0, 160); break; }
            }
            $isAct = !$f['leaf'] || $cat === 'mpzp';
            $matches[] = [
                'source' => 'Rejestr Urbanistyczny (online)',
                'label' => $label,
                'kind' => $cat === 'pog' ? ($f['leaf'] ? 'strefa' : 'akt') : 'plan',
                'status' => isset($props['Status']) ? mb_strtolower(vps_py_str($props['Status'])) : null,
                'areaM2' => round($overlap, 1),
                'partPct' => $parcelArea > 0 ? round(min(100, $overlap / $parcelArea * 100), 1) : null,
                'link' => (isset($props['Link do Rejestru Urbanistycznego']) && str_starts_with((string)$props['Link do Rejestru Urbanistycznego'], 'https://' . VPS_RU_HOST . '/'))
                    ? (string)$props['Link do Rejestru Urbanistycznego'] : null,
                'attributesWarning' => false,
                'attributes' => vps_ru_short_props($props),
                'order' => $isAct ? 0 : 1,
            ];
        }
        // Najpierw akt (plan), potem strefy od największego udziału.
        usort($matches, fn($a, $b) => [$a['order'], -$a['areaM2']] <=> [$b['order'], -$b['areaM2']]);
        foreach ($matches as &$m) unset($m['order']);
        unset($m);
        $out[$cat] = [
            'ok' => $st['answered'] > 0,
            'complete' => !$st['failedPts'],
            'matches' => array_slice($matches, 0, 40),
            'leafCoveragePct' => $parcelArea > 0 ? round(min(100, $leafArea / $parcelArea * 100), 1) : null,
            'queries' => $st['queries'],
        ];
    }
    return $out;
}

// ---------------------------------------------------------------------------
// 19.8.3: zapas z krajowej integracji planów ogólnych (Geoportal). Usługa nie zwraca geometrii
// stref (tylko atrybuty i bbox), więc udział strefy w działce jest SZACOWANY z punktów próbkowych
// i oznaczany jako przybliżony. Używany, gdy Rejestr Urbanistyczny nie odpowiada albo nie ma planu.

const VPS_GP_POG_URL = 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin';
const VPS_GP_POG_DRAFT_URL = 'https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin';
const VPS_GP_SAMPLES = 9;

const VPS_POG_ZONE_NAMES = [
    'SW' => 'strefa wielofunkcyjna z zabudową mieszkaniową wielorodzinną',
    'SJ' => 'strefa wielofunkcyjna z zabudową mieszkaniową jednorodzinną',
    'SZ' => 'strefa wielofunkcyjna z zabudową zagrodową',
    'SU' => 'strefa usługowa',
    'SH' => 'strefa handlu wielkopowierzchniowego',
    'SP' => 'strefa gospodarcza',
    'SR' => 'strefa produkcji rolniczej',
    'SI' => 'strefa infrastrukturalna',
    'SN' => 'strefa zieleni i rekreacji',
    'SC' => 'strefa cmentarzy',
    'SG' => 'strefa górnictwa',
    'SO' => 'strefa otwarta',
    'SK' => 'strefa komunikacyjna',
];

function vps_gp_gfi_url(string $base, string $layers, float $x, float $y): string {
    $h = 64.0;
    return $base . '?' . http_build_query([
        'SERVICE' => 'WMS', 'REQUEST' => 'GetFeatureInfo', 'VERSION' => '1.3.0', 'CRS' => 'EPSG:2180',
        'BBOX' => sprintf('%.2F,%.2F,%.2F,%.2F', $y - $h, $x - $h, $y + $h, $x + $h),
        'WIDTH' => '128', 'HEIGHT' => '128', 'I' => '64', 'J' => '64', 'STYLES' => '', 'FORMAT' => 'image/png',
        'LAYERS' => $layers, 'QUERY_LAYERS' => $layers, 'INFO_FORMAT' => 'application/vnd.ogc.gml', 'FEATURE_COUNT' => '10',
    ], '', '&', PHP_QUERY_RFC3986);
}

/** Obiekty z odpowiedzi GML MapServera: [['layer' => ..., 'props' => [...]], ...]. */
function vps_gp_parse_gml(string $xml): ?array {
    if (!str_contains($xml, 'msGMLOutput')) return null;
    $prev = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
    libxml_use_internal_errors($prev);
    if ($doc === false) return null;
    $out = [];
    foreach ($doc->children() as $layerNode) {
        $layer = preg_replace('~_layer$~', '', $layerNode->getName());
        foreach ($layerNode->children() as $featureNode) {
            if (!str_ends_with($featureNode->getName(), '_feature')) continue;
            $props = [];
            foreach ($featureNode->children() as $field) {
                if ($field->count() > 0) continue; // gml:boundedBy itp.
                $props[$field->getName()] = trim((string)$field);
            }
            $out[] = ['layer' => $layer, 'props' => $props];
        }
    }
    return $out;
}

function vps_gp_pog_urls(array $parcel): array {
    $points = vps_ru_spread(vps_ru_candidate_points($parcel), VPS_GP_SAMPLES);
    $urls = [];
    foreach ($points as $i => $p) {
        $urls["gp:a{$i}"] = vps_gp_gfi_url(VPS_GP_POG_URL, 'aktPlanowaniaprzestrzennego,strefaPlanistyczna', $p[0], $p[1]);
    }
    $urls['gp:draft'] = vps_gp_gfi_url(VPS_GP_POG_DRAFT_URL, 'aktPlanowaniaprzestrzennego', $points[0][0], $points[0][1]);
    return $urls;
}

/** Klucze zapytań, dla których dopuszczamy przekierowanie (rysunek MPZP → serwer gminy). */
const VPS_FOLLOW_KEYS = ['kimp:map'];

/**
 * Zapytania zapasowe dla analizy działki: plan ogólny z Geoportalu (punkty próbkowe) oraz MPZP
 * z krajowej integracji (opis w punkcie + sonda rysunku). Wysyłane razem z pierwszą rundą RU.
 */
function vps_planning_urls(array $parcel): array {
    return vps_gp_pog_urls($parcel) + vps_kimp_urls($parcel);
}

function vps_gp_pog_parcel(array $parcel, ?array $prefetched = null): array {
    $parcelArea = geo_area($parcel);
    $urls = vps_gp_pog_urls($parcel);
    $raws = $prefetched !== null ? array_intersect_key($prefetched, $urls) : vps_fetch_parallel($urls, 1000000, 6, ['mapy.geoportal.gov.pl']);
    $answered = 0; $hits = []; $acts = []; $draft = null;
    foreach ($raws as $key => $raw) {
        $features = is_string($raw) ? vps_gp_parse_gml($raw) : null;
        if ($features === null) continue;
        if ($key === 'gp:draft') {
            foreach ($features as $f) if ($f['layer'] === 'aktPlanowaniaprzestrzennego') $draft = $f['props'];
            continue;
        }
        $answered++;
        foreach ($features as $f) {
            $props = $f['props'];
            if ($f['layer'] === 'strefaPlanistyczna') {
                $id = $props['gml_id'] ?? ($props['oznaczenie'] ?? '');
                if ($id === '') continue;
                $hits[$id] = ($hits[$id] ?? ['props' => $props, 'n' => 0]);
                $hits[$id]['n']++;
            } elseif ($f['layer'] === 'aktPlanowaniaprzestrzennego') {
                $id = $props['gml_id'] ?? ($props['tytul'] ?? 'akt');
                $acts[$id] = ($acts[$id] ?? ['props' => $props, 'n' => 0]);
                $acts[$id]['n']++;
            }
        }
    }
    if ($answered === 0) return ['ok' => false, 'matches' => []];
    $share = fn(int $n): float => round($n / $answered * 100, 1);
    $matches = [];
    foreach ($acts as $a) {
        $p = $a['props'];
        $matches[] = ['source' => 'GUGiK — krajowa integracja planów ogólnych (online)', 'kind' => 'akt',
            'label' => mb_substr((string)($p['tytul'] ?? $p['nazwa'] ?? 'Plan ogólny'), 0, 160),
            'status' => 'prawnie wiążący lub realizowany', 'approximate' => true, 'samples' => $answered,
            'partPct' => $share($a['n']), 'areaM2' => round($parcelArea * $a['n'] / $answered, 1),
            'link' => (isset($p['lacze']) && preg_match('~^https://~', (string)$p['lacze'])) ? (string)$p['lacze'] : null,
            'linkLabel' => 'Uchwała w dzienniku urzędowym',
            'attributesWarning' => false, 'attributes' => array_filter(['Tytuł' => $p['tytul'] ?? null, 'Uchwała' => $p['lacze'] ?? null,
                'Obowiązuje od' => $p['obowiazujeOd'] ?? null], fn($v) => $v !== null && $v !== '')];
    }
    uasort($hits, fn($a, $b) => $b['n'] <=> $a['n']);
    foreach ($hits as $h) {
        $p = $h['props'];
        $symbol = strtoupper((string)($p['symbol'] ?? ''));
        $uom = (string)($p['maksWysokoscZabudowy_uom'] ?? 'm');
        $attrs = [
            'Nazwa' => VPS_POG_ZONE_NAMES[$symbol] ?? null,
            'Maksymalna wysokość zabudowy' => ($p['maksWysokoscZabudowy'] ?? '') !== '' ? $p['maksWysokoscZabudowy'] . ' ' . $uom : null,
            'Maksymalna nadziemna intensywność zabudowy' => ($p['maksNadziemnaIntensywnoscZabudowy'] ?? '') !== '' ? str_replace('.', ',', $p['maksNadziemnaIntensywnoscZabudowy']) : null,
            'Maksymalny udział powierzchni zabudowy' => ($p['maksUdzialPowierzchniZabudowy'] ?? '') !== '' ? $p['maksUdzialPowierzchniZabudowy'] . '%' : null,
            'Minimalny udział powierzchni biologicznie czynnej' => ($p['minUdzialPowierzchniBiologicznieCzynnej'] ?? '') !== '' ? $p['minUdzialPowierzchniBiologicznieCzynnej'] . '%' : null,
            'Obowiązuje od' => $p['obowiazujeOd'] ?? null,
            'Identyfikator' => $p['gml_id'] ?? null,
        ];
        $matches[] = ['source' => 'GUGiK — krajowa integracja planów ogólnych (online)', 'kind' => 'strefa',
            'label' => (string)($p['oznaczenie'] ?? $symbol), 'status' => null, 'approximate' => true, 'samples' => $answered,
            'partPct' => $share($h['n']), 'areaM2' => round($parcelArea * $h['n'] / $answered, 1), 'link' => null,
            'attributesWarning' => false, 'attributes' => array_filter($attrs, fn($v) => $v !== null && $v !== '')];
    }
    return ['ok' => true, 'matches' => $matches, 'samples' => $answered,
        'draft' => $draft ? ['title' => $draft['tytul'] ?? null, 'status' => 'projekt planu ogólnego w trakcie przyjmowania'] : null];
}

// ---------------------------------------------------------------------------
// 19.8.3: MPZP — zapas z krajowej integracji MPZP (Geoportal), gdy RU nie odpowiada albo nie ma planu.
// Integracja przekazuje zapytanie do serwera gminy; część gmin nie odpowiada na GetFeatureInfo
// („brak wyniku”), choć rysunek planu jest dostępny — wtedy sprawdzamy rysunek w punkcie.

const VPS_KIMP_URL = 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego';
const VPS_KIMP_LAYERS = 'granice,raster,wektor-str,wektor-lzb,wektor-lin,wektor-pow,wektor-pkt';

function vps_kimp_text(string $html): string {
    $t = (string)preg_replace('~(?is)<(style|script|head)\b.*?</\1>~', ' ', $html);
    $t = html_entity_decode(strip_tags((string)preg_replace('~<(br|/tr|/p|/li|/h\d)\b[^>]*>~i', "\n", $t)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = (string)preg_replace("~[ \t]+~", ' ', $t);
    return trim((string)preg_replace("~\n\s*\n+~", "\n", $t));
}

function vps_kimp_urls(array $parcel): array {
    [$x, $y] = geo_representative_point($parcel);
    $h = 64.0;
    return [
        'kimp:gfi' => VPS_KIMP_URL . '?' . http_build_query([
            'SERVICE' => 'WMS', 'REQUEST' => 'GetFeatureInfo', 'VERSION' => '1.1.1', 'SRS' => 'EPSG:2180',
            'BBOX' => sprintf('%.2F,%.2F,%.2F,%.2F', $x - $h, $y - $h, $x + $h, $y + $h),
            'WIDTH' => '128', 'HEIGHT' => '128', 'X' => '64', 'Y' => '64', 'FORMAT' => 'image/png', 'STYLES' => '',
            'LAYERS' => VPS_KIMP_LAYERS, 'QUERY_LAYERS' => VPS_KIMP_LAYERS, 'INFO_FORMAT' => 'text/html', 'FEATURE_COUNT' => '5',
        ], '', '&', PHP_QUERY_RFC3986),
        // Sonda rysunku (16 × 16 px, 1 m/px) w punkcie reprezentatywnym działki.
        'kimp:map' => VPS_KIMP_URL . '?' . http_build_query([
            'SERVICE' => 'WMS', 'VERSION' => '1.1.1', 'REQUEST' => 'GetMap', 'SRS' => 'EPSG:2180',
            'BBOX' => sprintf('%.2F,%.2F,%.2F,%.2F', $x - 8, $y - 8, $x + 8, $y + 8),
            'WIDTH' => '16', 'HEIGHT' => '16', 'FORMAT' => 'image/png', 'TRANSPARENT' => 'TRUE', 'STYLES' => '', 'LAYERS' => VPS_KIMP_LAYERS,
        ], '', '&', PHP_QUERY_RFC3986),
    ];
}

function vps_kimp_parcel(array $parcel, ?array $prefetched = null): array {
    $urls = vps_kimp_urls($parcel);
    $raws = $prefetched !== null ? array_intersect_key($prefetched, $urls)
        : vps_fetch_parallel($urls, 1500000, 6, ['mapy.geoportal.gov.pl'], VPS_FOLLOW_KEYS);
    $body = $raws['kimp:gfi'] ?? null;
    $status = is_string($body) ? 200 : 0;
    $text = ($status >= 200 && $status < 300) ? vps_kimp_text((string)$body) : '';
    $noResult = $text === '' || preg_match('~brak (wyniku|serwisu)~iu', $text);
    if (!$noResult) {
        return ['ok' => true, 'matches' => [[
            'source' => 'GUGiK — krajowa integracja MPZP (online)', 'kind' => 'plan', 'label' => 'Miejscowy plan zagospodarowania przestrzennego',
            'status' => null, 'approximate' => true, 'samples' => 1, 'partPct' => null, 'areaM2' => null, 'link' => null,
            'attributesWarning' => false, 'attributes' => ['Opis' => mb_substr($text, 0, 1200)],
        ]], 'checked' => 'gfi'];
    }
    $mBody = $raws['kimp:map'] ?? null;
    $img = (is_string($mBody) && function_exists('imagecreatefromstring')) ? @imagecreatefromstring($mBody) : false;
    // „Brak wyniku” bez czytelnego rysunku nie rozstrzyga — wynik nieznany, nie „brak planu”.
    if ($img === false) return ['ok' => false, 'matches' => [], 'checked' => 'gfi-empty-unverified'];
    $drawn = 0;
    for ($i = 6; $i <= 9; $i++) for ($j = 6; $j <= 9; $j++) {
        if (imagecolorsforindex($img, imagecolorat($img, $i, $j))['alpha'] < 100) $drawn++;
    }
    imagedestroy($img);
    if ($drawn < 9) return ['ok' => true, 'matches' => [], 'checked' => 'raster-empty'];
    return ['ok' => true, 'matches' => [[
        'source' => 'GUGiK — krajowa integracja MPZP (rysunek planu)', 'kind' => 'plan',
        'label' => 'Miejscowy plan zagospodarowania przestrzennego (wg rysunku planu)', 'status' => null,
        'approximate' => true, 'samples' => 1, 'partPct' => null, 'areaM2' => null, 'link' => null, 'attributesWarning' => false,
        'attributes' => ['Uwaga' => 'Serwer gminy nie udostępnia opisu przeznaczenia; oznaczenie terenu odczytaj z rysunku planu (warstwa MPZP) i uchwały.'],
    ]], 'checked' => 'raster'];
}
