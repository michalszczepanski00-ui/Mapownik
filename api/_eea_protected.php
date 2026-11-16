<?php
declare(strict_types=1);

/**
 * 19.50.0 — zapasowe źródło form ochrony przyrody: Europejska Agencja Środowiska (EEA).
 *
 * Serwer GDOŚ (sdi.gdos.gov.pl, za zaporą Incapsula) odpowiada serwerom 403 — z hostingu
 * werdykt „Natura 2000” i „Inne formy ochrony” kończył się „nie sprawdzono”, a warstwy nie rysowały się.
 * Te same obszary publikuje EEA (dane zgłaszane przez Polskę, wersja roczna):
 *  - Natura 2000 (baza Natura 2000, warstwa 0 = obszary siedliskowe, 1 = ptasie),
 *  - krajowe formy ochrony NatDA v24 (kody PL01 park narodowy, PL02 rezerwat, PL03 park krajobrazowy,
 *    PL04 obszar chronionego krajobrazu).
 * EEA NIE ma użytków ekologicznych, zespołów przyrodniczo-krajobrazowych, pomników przyrody ani
 * stanowisk dokumentacyjnych — dla tych wynik z EEA jest niepełny i tak go opisujemy.
 *
 * Kolejność: najpierw GDOŚ (aktualne dane), EEA tylko gdy GDOŚ nie odpowie albo odmówi.
 */

const EEA_PROTECTED_BASE = 'https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites';
const EEA_NATURA_LABEL = 'EEA — baza Natura 2000 (dane zgłoszone przez Polskę, wersja 2024)';
const EEA_NATDA_LABEL = 'EEA — krajowe formy ochrony NatDA v24 (dane zgłoszone przez Polskę)';
const EEA_NATDA_NAMES = [
    'PL01' => 'park narodowy',
    'PL02' => 'rezerwat przyrody',
    'PL03' => 'park krajobrazowy',
    'PL04' => 'obszar chronionego krajobrazu',
];
const EEA_NATURA_TYPES = [
    'A' => 'obszar specjalnej ochrony ptaków (OSO)',
    'B' => 'specjalny obszar ochrony siedlisk (SOO)',
    'C' => 'obszar ptasi i siedliskowy (OSO i SOO)',
];

/**
 * Definicja zapasu dla klucza źródła (wms.php / identify.php) albo null.
 * natura: lista warstw bazy Natura 2000; natda: lista kodów form krajowych;
 * partial: GDOŚ ma w tym źródle formy, których EEA nie publikuje.
 */
function eea_protected_fallback(string $key): ?array {
    static $defs = [
        'natura2000'      => ['natura' => [0, 1]],
        'gdos_birds'      => ['natura' => [1]],
        'gdos_habitats'   => ['natura' => [0]],
        'gdos_protection' => ['natda' => ['PL01', 'PL02', 'PL03', 'PL04'], 'partial' => 'użytków ekologicznych i zespołów przyrodniczo-krajobrazowych'],
        'gdos_national'   => ['natda' => ['PL01']],
        'gdos_reserves'   => ['natda' => ['PL02']],
        'gdos_landscape'  => ['natda' => ['PL03']],
        'gdos_protected'  => ['natda' => ['PL04']],
    ];
    return $defs[$key] ?? null;
}

/** Kolory wypełnienia (RGB) — jednolite, bez kreskowania: raport PDF liczy udział z kryjących pikseli. */
const EEA_COLORS = [
    'natura0' => [56, 142, 60],    // siedliskowe
    'natura1' => [41, 98, 181],    // ptasie
    'PL01' => [27, 94, 32],        // park narodowy
    'PL02' => [176, 58, 46],       // rezerwat
    'PL03' => [104, 159, 56],      // park krajobrazowy
    'PL04' => [175, 180, 43],      // obszar chronionego krajobrazu
];

function eea_symbol(array $rgb): array {
    return ['type' => 'esriSFS', 'style' => 'esriSFSSolid', 'color' => [...$rgb, 150],
        'outline' => ['type' => 'esriSLS', 'style' => 'esriSLSSolid', 'color' => [...$rgb, 255], 'width' => 1]];
}

/** Wariant obrazu dla wms.php (eksport ArcGIS: dowolny układ, w tym EPSG:2180). */
function eea_protected_wms_variant(array $def): array {
    if (isset($def['natura'])) {
        $dynamic = array_map(static fn($id) => ['id' => $id, 'source' => ['type' => 'mapLayer', 'mapLayerId' => $id],
            'drawingInfo' => ['transparency' => 0, 'renderer' => ['type' => 'simple', 'symbol' => eea_symbol(EEA_COLORS['natura' . $id])]]], $def['natura']);
        return [
            'kind' => 'arcgis_export',
            'url' => EEA_PROTECTED_BASE . '/Natura2000Sites/MapServer/export',
            'layers' => 'show:' . implode(',', $def['natura']),
            'dynamic_layers' => json_encode($dynamic, JSON_UNESCAPED_SLASHES),
        ];
    }
    $codes = implode(',', array_map(static fn($c) => "'" . $c . "'", $def['natda']));
    $dynamic = [[
        'id' => 4, 'source' => ['type' => 'mapLayer', 'mapLayerId' => 4],
        'definitionExpression' => "countryCode='PL' AND designationTypeCode IN (" . $codes . ')',
        'drawingInfo' => ['transparency' => 0, 'renderer' => ['type' => 'uniqueValue', 'field1' => 'designationTypeCode',
            'uniqueValueInfos' => array_map(static fn($c) => ['value' => $c, 'symbol' => eea_symbol(EEA_COLORS[$c])], $def['natda'])]],
    ]];
    return [
        'kind' => 'arcgis_export',
        'url' => EEA_PROTECTED_BASE . '/NatDAv24_Dyna_WM/MapServer/export',
        'layers' => 'show:4',
        'dynamic_layers' => json_encode($dynamic, JSON_UNESCAPED_SLASHES),
    ];
}

/**
 * Wynik identyfikacji z EEA w punkcie EPSG:2180, w kształcie odpowiedzi identify.php,
 * albo null, gdy EEA też nie odpowiedziało.
 */
function eea_protected_identify(array $def, float $x, float $y): ?array {
    [$lon, $lat] = geo_to4326($x, $y);
    $query = static function (string $layerUrl, string $where) use ($lon, $lat): ?array {
        $url = $layerUrl . '/query?' . http_build_query([
            'geometry' => sprintf('%.7F,%.7F', $lon, $lat), 'geometryType' => 'esriGeometryPoint', 'inSR' => '4326',
            'spatialRel' => 'esriSpatialRelIntersects', 'where' => $where, 'outFields' => '*',
            'returnGeometry' => 'false', 'f' => 'json',
        ], '', '&', PHP_QUERY_RFC3986);
        [$status, $body] = official_gis_remote_get($url, 'application/json', 8, 'identify-eea');
        if ($status < 200 || $status >= 300) return null;
        $data = json_decode((string)$body, true);
        if (!is_array($data) || isset($data['error']) || !is_array($data['features'] ?? null)) return null;
        return array_map(static fn($f) => (array)($f['attributes'] ?? []), $data['features']);
    };
    $blocks = [];
    if (isset($def['natura'])) {
        $seen = [];
        foreach ($def['natura'] as $layer) {
            $rows = $query(EEA_PROTECTED_BASE . '/Natura2000Sites/MapServer/' . (int)$layer, "MS='PL'");
            if ($rows === null) return null;
            foreach ($rows as $r) {
                $code = (string)($r['SITECODE'] ?? '');
                if ($code === '' || isset($seen[$code])) continue;
                $seen[$code] = true;
                $blocks[] = "nazwa: " . (string)($r['SITENAME'] ?? '') . "\nkod: " . $code
                    . "\nrodzaj: " . (EEA_NATURA_TYPES[(string)($r['SITETYPE'] ?? '')] ?? 'obszar Natura 2000')
                    . "\nźródło: " . EEA_NATURA_LABEL;
            }
        }
    } else {
        $codes = implode(',', array_map(static fn($c) => "'" . $c . "'", $def['natda']));
        $rows = $query(EEA_PROTECTED_BASE . '/NatDAv24_Dyna_WM/MapServer/4', "countryCode='PL' AND designationTypeCode IN (" . $codes . ')');
        if ($rows === null) return null;
        foreach ($rows as $r) {
            $year = (string)($r['legalFoundationDate'] ?? '');
            $blocks[] = "nazwa: " . (string)($r['siteName'] ?? '')
                . "\nforma ochrony: " . (EEA_NATDA_NAMES[(string)($r['designationTypeCode'] ?? '')] ?? 'forma ochrony przyrody')
                . ($year !== '' ? "\nrok utworzenia: " . $year : '')
                . "\nźródło: " . EEA_NATDA_LABEL;
        }
    }
    $label = isset($def['natura']) ? EEA_NATURA_LABEL : EEA_NATDA_LABEL;
    $note = 'Serwis GDOŚ nie odpowiedział — wynik z danych zapasowych: ' . $label . '.'
        . (!empty($def['partial']) ? ' Dane EEA nie obejmują ' . $def['partial'] . ' — ich nie sprawdzono.' : '');
    return [
        'ok' => true,
        'found' => (bool)$blocks,
        'text' => $blocks ? implode("\n\n", $blocks) : null,
        'count' => count($blocks),
        'basis' => 'structured',
        'fallback' => 'eea',
        'fallbackNote' => $note,
        'partial' => !empty($def['partial']),
    ];
}
