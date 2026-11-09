<?php
declare(strict_types=1);
require __DIR__ . '/_common.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const IDENTIFY_SOURCES = [
    'egib_classes' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzytkowGruntowych',
        'layers' => 'kontury,uzytki',
        'query_layers' => 'kontury,uzytki',
        'version' => '1.1.1',
    ],
    'mpzp' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego',
        'layers' => 'granice,raster,wektor-str,wektor-lzb,wektor-lin,wektor-pow,wektor-pkt',
        'query_layers' => 'granice,raster,wektor-str,wektor-lzb,wektor-lin,wektor-pow,wektor-pkt',
        'raster_probe' => 'Na rysunku planu w tym miejscu obowiązuje miejscowy plan zagospodarowania przestrzennego. '
            . 'Serwer gminy nie udostępnia opisu przeznaczenia przez integrację krajową — sprawdź oznaczenie na rysunku planu (warstwa MPZP) i uchwałę.',
    ],
    'natura2000' => [
        'url' => 'https://sdi.gdos.gov.pl/wms',
        'layers' => 'GDOS:ObszarySpecjalnejOchrony,GDOS:SpecjalneObszaryOchrony',
        'query_layers' => 'GDOS:ObszarySpecjalnejOchrony,GDOS:SpecjalneObszaryOchrony',
    ],
    'glebowa' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/MapaGlebowoRolnicza/MapServer/WMSServer',
        'layers' => '0',
        'query_layers' => '0',
        'variants' => [
            ['layers' => 'KONTURY_GLEBOWE', 'query_layers' => 'KONTURY_GLEBOWE'],
        ],
        'version' => '1.1.1',
    ],
    'prg_boundaries' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WMS/AdministrativeBoundaries',
        'layers' => 'A01_Granice_wojewodztw,A02_Granice_powiatow,A03_Granice_gmin',
        'query_layers' => 'A01_Granice_wojewodztw,A02_Granice_powiatow,A03_Granice_gmin',
        'version' => '1.1.1',
    ],
    'prng_names' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRNG/WMS/GeographicalNames',
        'layers' => 'M1_UrzedoweNazwyMiejscowosci,M2_PozostaleNazwyMiejscowosci,O1_UrzedoweNazwyObiektowFizjograficznych,O2_ZestandaryzowaneNazwyObiektowFizjograficznych,O3_PozostaleNazwyObiektowFizjograficznych',
        'query_layers' => 'M1_UrzedoweNazwyMiejscowosci,M2_PozostaleNazwyMiejscowosci,O1_UrzedoweNazwyObiektowFizjograficznych,O2_ZestandaryzowaneNazwyObiektowFizjograficznych,O3_PozostaleNazwyObiektowFizjograficznych',
        'version' => '1.1.1',
    ],
    'kina_addresses' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaNumeracjiAdresowej',
        'layers' => 'A07_Punkty_adresowe,A08_Ulice',
        'query_layers' => 'A07_Punkty_adresowe,A08_Ulice',
        'version' => '1.1.1',
    ],
    'gdos_protection' => [
        'url' => 'https://sdi.gdos.gov.pl/wms',
        'layers' => 'GDOS:ParkiNarodowe,GDOS:ParkiKrajobrazowe,GDOS:Rezerwaty,GDOS:ObszaryChronionegoKrajobrazu,GDOS:UzytkiEkologiczne,GDOS:ZespolyPrzyrodniczoKrajobrazowe',
        'query_layers' => 'GDOS:ParkiNarodowe,GDOS:ParkiKrajobrazowe,GDOS:Rezerwaty,GDOS:ObszaryChronionegoKrajobrazu,GDOS:UzytkiEkologiczne,GDOS:ZespolyPrzyrodniczoKrajobrazowe',
    ],
    'bdot10k_forest' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
        'layers' => 'TLes', 'query_layers' => 'TLes', 'version' => '1.1.1',
    ],
    'bdot10k_water' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
        'layers' => 'WPow,rz,kan,row', 'query_layers' => 'WPow,rz,kan,row', 'version' => '1.1.1',
    ],
    'flood_mzpmrp' => [
        'url' => 'https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS',
        // 19.31.0: usługa ISOK nie ma już warstwy NZ.HazardArea — obszary zagrożenia są w trzech warstwach scenariuszy.
        'layers' => 'NZ.Fluvial,NZ.SeaWater,NZ.ArtificialWaterBearingInfrastructure',
        'query_layers' => 'NZ.Fluvial,NZ.SeaWater,NZ.ArtificialWaterBearingInfrastructure', 'version' => '1.3.0',
        // GeoJSON tej usługi niesie całą geometrię strefy (kilka MB) — tekst ma kilka kB.
        'info_formats' => ['text/plain', 'text/html'],
        'variants' => [
            ['layers' => 'NZ.Fluvial', 'query_layers' => 'NZ.Fluvial'],
        ],
    ],
    'nid_immovable' => [
        'url' => 'https://usluga.zabytek.gov.pl/INSPIRE_IMD/service.svc/get',
        'layers' => 'Immovable_Monuments', 'query_layers' => 'Immovable_Monuments', 'version' => '1.3.0',
    ],
    'nid_archaeology' => [
        'url' => 'https://usluga.zabytek.gov.pl/INSPIRE_AMD/service.svc/get',
        'layers' => 'Archaeological_Monuments', 'query_layers' => 'Archaeological_Monuments', 'version' => '1.3.0',
        'variants' => [ ['layers' => 'ArchaeologicalMonuments', 'query_layers' => 'ArchaeologicalMonuments'] ],
    ],
    'kiut_power' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_elektroenergetyczny',
        'query_layers' => 'przewod_elektroenergetyczny',
        'version' => '1.1.1',
    ],
    'kiut_gas' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_gazowy',
        'query_layers' => 'przewod_gazowy',
        'version' => '1.1.1',
    ],
    'kiut_water' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_wodociagowy',
        'query_layers' => 'przewod_wodociagowy',
        'version' => '1.1.1',
    ],
    'kiut_sewer' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_kanalizacyjny',
        'query_layers' => 'przewod_kanalizacyjny',
        'version' => '1.1.1',
    ],
    'kiut_telecom' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_telekomunikacyjny',
        'query_layers' => 'przewod_telekomunikacyjny',
        'version' => '1.1.1',
    ],
    'kiut_heat' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_cieplowniczy',
        'query_layers' => 'przewod_cieplowniczy',
        'version' => '1.1.1',
    ],
    'kiut_other' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_specjalny,przewod_inny',
        'query_layers' => 'przewod_specjalny,przewod_inny',
        'variants' => [
            ['layers' => 'przewod_inny', 'query_layers' => 'przewod_inny'],
            ['layers' => 'przewod_specjalny', 'query_layers' => 'przewod_specjalny'],
        ],
        'version' => '1.1.1',
    ],
    // 18.18.0: aktualne nazwy warstw planów ogólnych (patrz _wms_sources.php).
    'pog_adopted' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin',
        'layers' => 'aktPlanowaniaprzestrzennego,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy',
        'query_layers' => 'aktPlanowaniaprzestrzennego,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy',
        'version' => '1.1.1',
        'capabilities_ordinals' => [3,2,1],
        'capabilities_titles' => [
            ['aktPlanowaniaprzestrzennego', 'POG - Akt Planowania Przestrzennego', 'Akt Planowania Przestrzennego'],
            ['obszarZabSrodmiejskiej', 'POG - Obszar Zabudowy Śródmiejskiej', 'Obszar Zabudowy Śródmiejskiej'],
            ['obszarUzupelnieniaZabudowy', 'POG - Obszar Uzupełnienia Zabudowy', 'Obszar Uzupełnienia Zabudowy'],
        ],
        'variants' => [
            ['layers' => 'akt_planowania_przestrzennego,obszar_zabudowy_srodmiejskiej,obszar_uzupelnienia_zabudowy', 'query_layers' => 'akt_planowania_przestrzennego,obszar_zabudowy_srodmiejskiej,obszar_uzupelnienia_zabudowy'],
        ],
    ],
    'pog_draft' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin',
        'layers' => 'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy,obszarStandardowDostepnosciInfrastrukturySpolecznej',
        'query_layers' => 'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy,obszarStandardowDostepnosciInfrastrukturySpolecznej',
        'version' => '1.1.1',
        'capabilities_ordinals' => [4,0,3,2,1],
        'capabilities_titles' => [
            ['aktPlanowaniaprzestrzennego', 'POG projektowane - Akt Planowania Przestrzennego', 'Akt Planowania Przestrzennego'],
            ['strefaPlanistyczna', 'POG projektowane - Strefa Planistyczna', 'Strefa Planistyczna', 'Strefy Planistyczne'],
            ['obszarZabSrodmiejskiej', 'POG projektowane - Obszar Zabudowy Śródmiejskiej', 'Obszar Zabudowy Śródmiejskiej'],
            ['obszarUzupelnieniaZabudowy', 'POG projektowane- Obszar Uzupełnienia Zabudowy', 'POG projektowane - Obszar Uzupełnienia Zabudowy', 'Obszar Uzupełnienia Zabudowy'],
            ['obszarStandardowDostepnosciInfrastrukturySpolecznej', 'POG projektowane - Obszar Standardów Dostępności Infrastruktury Społecznej', 'Obszar Standardów Dostępności Infrastruktury Społecznej'],
        ],
        'variants' => [
            ['layers' => 'POG projektowane - Akt Planowania Przestrzennego,POG projektowane - Obszar Zabudowy Śródmiejskiej,POG projektowane - Obszar Uzupełnienia Zabudowy,POG projektowane - Obszar Standardów Dostępności Infrastruktury Społecznej', 'query_layers' => 'POG projektowane - Akt Planowania Przestrzennego,POG projektowane - Obszar Zabudowy Śródmiejskiej,POG projektowane - Obszar Uzupełnienia Zabudowy,POG projektowane - Obszar Standardów Dostępności Infrastruktury Społecznej'],
        ],
    ],
    'pog_zones' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin',
        'layers' => 'strefaPlanistyczna',
        'query_layers' => 'strefaPlanistyczna',
        'version' => '1.1.1',
        'capabilities_ordinals' => [0],
        'capabilities_titles' => [
            ['strefaPlanistyczna', 'POG - Strefa Planistyczna', 'Strefa Planistyczna', 'Strefy Planistyczne'],
        ],
        'variants' => [
            ['layers' => 'strefy_planistyczne', 'query_layers' => 'strefy_planistyczne'],
        ],
    ],
    'kowr' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/kowr',
        'layers' => 'dzialki',
        'query_layers' => 'dzialki',
        'version' => '1.1.1',
        'variants' => [
            ['layers' => 'Dzialki', 'query_layers' => 'Dzialki'],
            ['layers' => 'kowr', 'query_layers' => 'kowr'],
        ],
    ],
    'pgi_deposits' => [
        'url' => 'https://cbdgmapa.pgi.gov.pl/arcgis/services/midas/MapServer/WMSServer',
        'layers' => '0',
        'query_layers' => '0',
        'version' => '1.1.1',
    ],
    'pgi_miningareas' => [
        'url' => 'https://cbdgmapa.pgi.gov.pl/arcgis/services/midas/MapServer/WMSServer',
        'layers' => '1',
        'query_layers' => '1',
        'version' => '1.1.1',
    ],
];

function identify_fail(string $message, int $status = 502, string $code = 'error'): never {
    http_response_code($status);
    // 18.18.0: kod błędu dla interfejsu (komunikat po polsku po stronie klienta),
    // `retryable` mówi, czy przycisk „Ponów” ma sens.
    echo json_encode([
        'ok' => false,
        'error' => $message,
        'code' => $code,
        'retryable' => in_array($code, ['timeout', 'unavailable', 'upstream'], true),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function numeric_param(string $key): float {
    $raw = $_GET[$key] ?? null;
    if (!is_string($raw) || $raw === '' || !is_numeric($raw)) identify_fail('Nieprawidłowe współrzędne.', 400);
    $value = (float)$raw;
    if (!is_finite($value)) identify_fail('Nieprawidłowe współrzędne.', 400);
    return $value;
}

require_once __DIR__ . '/_identify_parse.php';
require_once __DIR__ . '/_source_profiles.php';
require_once __DIR__ . '/_vps_geo.php';
$identifySources = array_replace(IDENTIFY_SOURCES, mapownik_profile_identify_sources());
$action = (string)($_GET['action'] ?? '');
if ($action === 'sources') {
    echo json_encode([
        'ok' => true,
        'sources' => array_keys($identifySources),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$key = (string)($_GET['source'] ?? '');
if ($key === '' || !isset($identifySources[$key])) identify_fail('Nieznane źródło identyfikacji.', 404);
$x = numeric_param('x');
$y = numeric_param('y');
if ($x < 100000 || $x > 950000 || $y < 50000 || $y > 1000000) identify_fail('Punkt poza zakresem EPSG:2180.', 400);

$source = $identifySources[$key];
$radius = 128.0;
$bbox = sprintf('%.3F,%.3F,%.3F,%.3F', $x - $radius, $y - $radius, $x + $radius, $y + $radius);
$bboxYx = sprintf('%.3F,%.3F,%.3F,%.3F', $y - $radius, $x - $radius, $y + $radius, $x + $radius);

$candidates = [];
$resolvedIdentifyLayers = resolve_wms_layers_from_capabilities($source);
if ($resolvedIdentifyLayers !== null && $resolvedIdentifyLayers !== '') {
    $candidates[] = array_merge($source, [
        'layers' => $resolvedIdentifyLayers,
        'query_layers' => $resolvedIdentifyLayers,
    ]);
}
$candidates[] = $source;
foreach (($source['variants'] ?? []) as $variant) {
    if (!is_array($variant)) continue;
    $candidates[] = array_merge($source, $variant);
}
$uniqueCandidates = [];
$seenCandidates = [];
foreach ($candidates as $candidate) {
    $candidateKey = (string)($candidate['url'] ?? '') . "\0" . (string)($candidate['layers'] ?? '') . "\0"
        . (string)($candidate['query_layers'] ?? $candidate['layers'] ?? '') . "\0" . (string)($candidate['version'] ?? '1.1.1');
    if (isset($seenCandidates[$candidateKey])) continue;
    $seenCandidates[$candidateKey] = true;
    $uniqueCandidates[] = $candidate;
}
$candidates = $uniqueCandidates;

// 18.18.0: limity jak w wms.php (17.8.3). Wcześniej niedziałające źródło
// trzymało proces PHP do ~60 s (warianty × formaty × 10 s), a wszystkie
// źródła dzieliły jeden bezpiecznik na adres usługi.
$requestBudget = 16.0;
$upstreamTimeout = 7;
$circuitKey = 'identify:' . $key;
// 19.8.6: tryb „merge” (plany ogólne: GUGiK + Rejestr Urbanistyczny). Pusty wynik jednego
// źródła nie przesądza o braku planu, dopóki nie odpowie źródło z innego hosta — żadne
// nie ma wszystkich gmin (Starogard Gdański tylko w GUGiK, Szczecin tylko w RU).
$mergeMode = !empty($source['merge']);
$deadHosts = [];
$candidateHost = static fn(array $c): string => strtolower((string)parse_url((string)($c['url'] ?? ''), PHP_URL_HOST));
$startedAt = microtime(true);
@set_time_limit((int)ceil($requestBudget + $upstreamTimeout + 5));
// Zapamiętany działający wariant warstw (i format odpowiedzi) idzie na początek listy.
$winnerFile = cache_root() . '/identify-winner/' . preg_replace('/[^a-z0-9_]/i', '_', $key) . '.json';
// 19.8.5: zapamiętany wariant = adres usługi + warstwy, ważny 24 h i tylko w tej samej wersji portalu.
// Wcześniej pamiętana była sama nazwa warstw bez terminu ważności — po zmianie źródła podstawowego
// (POG: Rejestr Urbanistyczny → krajowa integracja GUGiK) serwer nadal pytał najpierw RU, a jego
// „brak obiektów” kończył sprawdzanie (Starogard Gdański: plan ogólny „brak planu”).
$candidateSig = static fn(array $c): string => (string)($c['url'] ?? '') . "\0" . (string)($c['layers'] ?? '');
$primarySig = $candidates ? $candidateSig($candidates[0]) : '';
$winner = is_file($winnerFile) && (time() - (int)@filemtime($winnerFile)) < 86400
    ? json_decode((string)@file_get_contents($winnerFile), true) : null;
if (!is_array($winner) || ($winner['v'] ?? '') !== MAPOWNIK_USER_AGENT || !isset($winner['sig'])) $winner = null;
// 19.8.6: w trybie merge kolejność źródeł jest stała (GUGiK, potem Rejestr Urbanistyczny).
if ($winner !== null && !$mergeMode) {
    usort($candidates, static fn($a, $b) => ($candidateSig($b) === $winner['sig']) <=> ($candidateSig($a) === $winner['sig']));
}
// 18.18.3: najpierw formaty strukturalne (liczba obiektów), HTML/tekst jako rezerwa.
$formats = array_merge(IDENTIFY_STRUCTURED_FORMATS, IDENTIFY_TEXT_FORMATS);
// 19.31.0: źródło może wskazać kolejność formatów (np. tekst bez geometrii zamiast ciężkiego GeoJSON).
if (is_array($source['info_formats'] ?? null)) {
    $formats = array_values(array_unique(array_merge(array_values(array_filter($source['info_formats'], 'is_string')), $formats)));
}
$winnerFormat = is_array($winner) ? (string)($winner['format'] ?? '') : '';
if ($winnerFormat !== '' && in_array($winnerFormat, $formats, true)) {
    $formats = array_values(array_unique(array_merge([$winnerFormat], $formats)));
}
$stopReason = '';

$lastError = '';
// 19.43.0: serwer (w integracji krajowej — serwer gminy) odrzucił nazwy warstw (LayerNotDefined).
// To nie awaria usługi, tylko brak publikacji danych przez gminę — „Ponów” nic nie zmieni.
$layerRejected = false;
$validEmptyResponse = false;
$emptyBasis = 'html';
$remember = static function (array $candidate, string $format) use ($winnerFile, $candidateSig): void {
    @mkdir(dirname($winnerFile), 0775, true);
    if (function_exists('atomic_write')) atomic_write($winnerFile, json_encode(['sig' => $candidateSig($candidate), 'format' => $format, 'v' => MAPOWNIK_USER_AGENT, 'at' => time()], JSON_UNESCAPED_SLASHES) ?: '{}');
};
foreach ($candidates as $candidate) {
    $identifyVersion = (string)($candidate['version'] ?? '1.1.1');
    $base = [
        'SERVICE' => 'WMS',
        'VERSION' => $identifyVersion,
        'REQUEST' => 'GetFeatureInfo',
        // 19.8.3: WMS 1.3.0 w EPSG:2180 ma kolejność osi northing, easting (jak w wms.php).
        // Wcześniej pytaliśmy o punkt z zamienionymi współrzędnymi — np. zabytki NID i zagrożenie
        // powodziowe ISOK zawsze zwracały „brak obiektów”.
        'BBOX' => $identifyVersion === '1.3.0' ? $bboxYx : $bbox,
        'WIDTH' => '256',
        'HEIGHT' => '256',
        ($identifyVersion === '1.3.0' ? 'I' : 'X') => '128',
        ($identifyVersion === '1.3.0' ? 'J' : 'Y') => '128',
        'FORMAT' => 'image/png',
        'TRANSPARENT' => 'TRUE',
        'LAYERS' => $candidate['layers'],
        'QUERY_LAYERS' => $candidate['query_layers'] ?? $candidate['layers'],
        'FEATURE_COUNT' => '10',
    ];
    $base[$identifyVersion === '1.3.0' ? 'CRS' : 'SRS'] = 'EPSG:2180';

    if ($stopReason !== '') break;
    $host = $candidateHost($candidate);
    if ($deadHosts[$host] ?? false) continue;
    foreach ($formats as $infoFormat) {
        $remaining = $requestBudget - (microtime(true) - $startedAt);
        if ($remaining < 1.5) { $stopReason = 'timeout'; break; }
        $params = $base;
        $params['INFO_FORMAT'] = $infoFormat;
        $url = $candidate['url'] . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
        // 19.8.6: bezpiecznik per źródło i host — awaria RU nie blokuje GUGiK.
        [$status, $body, $type, $error] = official_gis_remote_get($url, $infoFormat . ',application/json;q=0.9,application/xml;q=0.8,text/xml;q=0.8,text/html;q=0.5,*/*;q=0.2', (int)max(2, min($upstreamTimeout, floor($remaining))), $circuitKey . '@' . $host);
        $lastError = $error;
        // Usługa nie odpowiada albo bezpiecznik jest otwarty — kolejne warianty TEGO hosta nic nie dadzą.
        // 19.8.6: w trybie merge sprawdzamy jeszcze źródło z innego hosta.
        $unreachable = gis_is_timeout_error((string)$error) ? 'timeout'
            : ((str_starts_with((string)$error, 'circuit ') || $status === 0) ? 'unavailable' : '');
        if ($unreachable !== '') {
            if ($mergeMode) { $deadHosts[$host] = $unreachable; continue 2; }
            $stopReason = $unreachable;
            break;
        }
        if ($status < 200 || $status >= 300 || trim($body) === '') continue;
        $result = identify_analyze($body, $infoFormat, (string)$type);
        if ($result['state'] === 'invalid') {
            if (preg_match('~LayerNotDefined|Invalid layer\(s\)~i', substr($body, 0, 8000))) $layerRejected = true;
            continue; // format nieobsługiwany albo wyjątek — następny format
        }
        $structured = in_array($result['basis'], ['json', 'gml', 'xml'], true);
        if ($result['state'] === 'found') {
            $remember($candidate, $infoFormat);
            echo json_encode([
                'ok' => true,
                'found' => true,
                'text' => $result['text'],
                'count' => $result['count'],
                'basis' => $structured ? 'structured' : 'text',
                'contentType' => $type,
                'variant' => $candidate['layers'],
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        // Pusta odpowiedź strukturalna jest rozstrzygająca: usługa przyjęła warstwy i policzyła 0 obiektów.
        // 19.8.6: w trybie merge rozstrzyga dopiero po sprawdzeniu pozostałych hostów.
        if ($structured && $mergeMode) {
            $validEmptyResponse = true;
            $emptyBasis = 'structured';
            $deadHosts[$host] = 'empty';
            continue 2;
        }
        if ($structured) {
            // Pusty wynik źródła zapasowego nie może przestawić kolejności na kolejne 24 h.
            if ($candidateSig($candidate) === $primarySig) $remember($candidate, $infoFormat);
            echo json_encode(['ok' => true, 'found' => false, 'text' => null, 'count' => 0, 'basis' => 'structured'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        // Pusta odpowiedź HTML/tekst nie przesądza jeszcze o braku obiektu: usługa
        // mogła przyjąć nieaktualną nazwę warstwy — sprawdzamy kolejny wariant warstw.
        $validEmptyResponse = true;
        $emptyBasis = 'text';
        break;
    }
}

/**
 * 19.8.3: czy rysunek planu ma w punkcie narysowany obiekt (kafel 16 × 16 px, 1 m/px, środek 4 × 4).
 * Krajowa integracja MPZP dla części gmin odpowiada na GetFeatureInfo „brak wyniku”, choć
 * rysunek planu (przekierowany do serwera gminy) pokazuje w tym miejscu plan — np. Starogard Gdański.
 */
function identify_raster_drawn(array $source, float $x, float $y): ?bool {
    // 19.8.6: najpierw EPSG:3857 — w tym układzie krajowa integracja MPZP sama składa obraz
    // z serwerów gmin. W EPSG:2180 przekierowuje do serwera gminy, a część z nich odrzuca
    // takie zapytania (m.in. Warszawa, Lublin, Białystok, Łódź). 2180 zostaje jako drugie podejście.
    [$lon, $lat] = geo_to4326($x, $y);
    $mx = $lon * 20037508.342789244 / 180;
    $my = log(tan((90 + $lat) * M_PI / 360)) * 20037508.342789244 / M_PI;
    // 1 m terenu ≈ 1/cos(φ) m w EPSG:3857; ten sam obszar 16 × 16 m.
    $h3857 = 8.0 / cos(deg2rad($lat));
    // 32 px (≈ 0,8 m/px w 3857): kaskada GUGiK rysuje plany dopiero od ok. 1,2 m/px.
    $first = identify_raster_probe($source, 'EPSG:3857', $mx - $h3857, $my - $h3857, $mx + $h3857, $my + $h3857, 32);
    if ($first === true) return true;
    $second = identify_raster_probe($source, 'EPSG:2180', $x - 8.0, $y - 8.0, $x + 8.0, $y + 8.0, 16);
    return $second ?? $first;
}

/** Czy środek obrazu (¼ boku) jest w większości narysowany — jak dotąd 4 × 4 px dla 16 px. */
function identify_raster_probe(array $source, string $srs, float $minX, float $minY, float $maxX, float $maxY, int $size): ?bool {
    if (!function_exists('imagecreatefromstring')) return null;
    $url = $source['url'] . '?' . http_build_query([
        'SERVICE' => 'WMS', 'VERSION' => '1.1.1', 'REQUEST' => 'GetMap', 'SRS' => $srs,
        'BBOX' => sprintf('%.2F,%.2F,%.2F,%.2F', $minX, $minY, $maxX, $maxY),
        'WIDTH' => (string)$size, 'HEIGHT' => (string)$size, 'FORMAT' => 'image/png', 'TRANSPARENT' => 'TRUE', 'STYLES' => '',
        'LAYERS' => $source['layers'],
    ], '', '&', PHP_QUERY_RFC3986);
    [$status, $body, $type] = official_gis_remote_get($url, 'image/png,image/*;q=0.8', 8, 'identify-raster:' . md5($url));
    if ($status < 200 || $status >= 300 || !str_contains(strtolower((string)$type), 'image/')) return null;
    $img = @imagecreatefromstring($body);
    if ($img === false) return null;
    $from = intdiv($size * 3, 8);
    $to = $from + intdiv($size, 4) - 1;
    $drawn = 0;
    for ($i = $from; $i <= $to; $i++) for ($j = $from; $j <= $to; $j++) {
        $c = imagecolorsforindex($img, imagecolorat($img, $i, $j));
        if ($c['alpha'] < 100) $drawn++;
    }
    imagedestroy($img);
    $cells = ($to - $from + 1) ** 2;
    return $drawn * 16 >= $cells * 9;
}

if ($mergeMode && !$validEmptyResponse && $stopReason === '' && $deadHosts) {
    $stopReason = in_array('timeout', $deadHosts, true) ? 'timeout' : 'unavailable';
}

if ($validEmptyResponse) {
    if (!empty($source['raster_probe']) && identify_raster_drawn($source, $x, $y) === true) {
        echo json_encode(['ok' => true, 'found' => true, 'count' => null, 'basis' => 'raster',
            'text' => (string)$source['raster_probe'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    echo json_encode(['ok' => true, 'found' => false, 'text' => null, 'count' => 0, 'basis' => $emptyBasis], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($layerRejected && $stopReason === '') {
    // Rysunek planu bywa dostępny, choć opis (GetFeatureInfo) nie — jak przy pustej odpowiedzi.
    if (!empty($source['raster_probe']) && identify_raster_drawn($source, $x, $y) === true) {
        echo json_encode(['ok' => true, 'found' => true, 'count' => null, 'basis' => 'raster',
            'text' => (string)$source['raster_probe'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    identify_fail('Serwer gminy nie udostępnia tych danych w krajowej integracji GUGiK.', 502, 'not_published');
}
if ($stopReason === 'timeout') identify_fail('Serwis nie odpowiedział na czas.', 504, 'timeout');
if ($stopReason === 'unavailable') identify_fail('Serwis jest chwilowo niedostępny.', 503, 'unavailable');
identify_fail('Serwis nie zwrócił informacji o tym miejscu.', 502, 'upstream');
