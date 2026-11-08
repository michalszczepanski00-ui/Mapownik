<?php
declare(strict_types=1);
$sources = [
    'topography' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/img/guest/TOPO/MapServer/WMSServer',
        'layers' => 'Raster',
        'version' => '1.1.1',
        'format' => 'image/jpeg',
        'transparent' => false,
        'ttl' => 30 * 86400,
    ],
    // 19.27.0: ORTO/WMS/StandardResolution wycofany przez GUGiK (HTTP 404) — „orthophoto”
    // korzysta z WMS HighResolution (EPSG:3857 działa, choć nie jest w Capabilities).
    'orthophoto' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution',
        'layers' => 'Raster',
        'version' => '1.1.1',
        'format' => 'image/jpeg',
        'transparent' => false,
        'ttl' => 30 * 86400,
        'variants' => [
            ['version' => '1.1.1', 'layers' => 'Raster'],
            ['version' => '1.3.0', 'layers' => 'Raster'],
        ],
    ],
    'orthophoto_high' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution',
        'layers' => 'Raster',
        'version' => '1.1.1',
        'format' => 'image/jpeg',
        'transparent' => false,
        'ttl' => 30 * 86400,
        'variants' => [
            ['url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution', 'version' => '1.1.1', 'layers' => 'Raster'],
            ['url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution', 'version' => '1.1.1', 'layers' => 'Raster'],
        ],
    ],
    'orthophoto_archive' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime',
        'layers' => 'Raster', 'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true,
        'ttl' => 30 * 86400, 'timeout' => 12, 'error_mode' => 'http',
    ],
    'orthophoto_true' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/TrueOrtho',
        'layers' => 'PrawdziwaOrtofotomapa', 'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true,
        'ttl' => 30 * 86400, 'timeout' => 12, 'error_mode' => 'http',
    ],
    'dzialki' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',
        'layers' => 'dzialki,budynki,numery_dzialek',
        'version' => '1.3.0',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 14 * 86400,
    ],
    'egib_classes' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzytkowGruntowych',
        'layers' => 'kontury,uzytki',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 2 * 86400,
        'error_mode' => 'http',
    ],
    'natura2000' => [
        'url' => 'https://sdi.gdos.gov.pl/wms',
        'layers' => 'GDOS:ObszarySpecjalnejOchrony,GDOS:SpecjalneObszaryOchrony',
        'version' => '1.3.0',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 30 * 86400,
    ],
    'mpzp' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego',
        'layers' => 'granice,raster,wektor-str,wektor-lzb,wektor-lin,wektor-pow,wektor-pkt',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 14 * 86400,
        // TileWMS must receive a real error on upstream failure. A transparent
        // 1x1 HTTP-200 placeholder would otherwise replace a previously visible plan.
        'error_mode' => 'http',
    ],
    'glebowa' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/MapaGlebowoRolnicza/MapServer/WMSServer',
        'layers' => '0',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 30 * 86400,
        'variants' => [
            // ArcGIS WMS commonly exposes technical layer Name as numeric id while
            // Geoportal UI shows the title KONTURY_GLEBOWE. Try both safely.
            ['version' => '1.1.1', 'layers' => '0'],
            ['version' => '1.3.0', 'layers' => '0'],
            ['version' => '1.1.1', 'layers' => 'KONTURY_GLEBOWE'],
            ['version' => '1.3.0', 'layers' => 'KONTURY_GLEBOWE'],
        ],
    ],
    // MSPortal 16.5.0 — curated reference data. BDOT10k is split into a few
    // practical thematic compositions rather than exposing all 165 WMS layers.
    'bdot10k_buildings' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
        'layers' => 'BudGo,BudPWy,BudP2,BudP1,BudUWy,BudU,BudMWy,BudMJ,BudMW',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'timeout' => 18, // 19.8.3: usługa odpowiada w 5–12 s; domyślne 10 s dawało puste kafle
        'ttl' => 30 * 86400,
    ],
    'bdot10k_transport' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
        'layers' => 'JDrLNUt,JDLNTw,JDrZTw,JDrG,JDrEk,JAu,LKNc,LKBu,LKWs,TSt,LKNelJ,LKNelD,LKNelW,LKZelJ,LKZelD,LKZelW',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'timeout' => 18, // 19.8.3: usługa odpowiada w 5–12 s; domyślne 10 s dawało puste kafle
        'ttl' => 30 * 86400,
    ],
    'bdot10k_water' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
        'layers' => 'WPow,LBrzN,LBrz,rz,kan,row,rzOk,kanOkr,RowEt,kanEt,rzEt',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'timeout' => 18, // 19.8.3: usługa odpowiada w 5–12 s; domyślne 10 s dawało puste kafle
        'ttl' => 30 * 86400,
    ],
    'bdot10k_landuse' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
        'layers' => 'TPrz,TLes,RKr,RTr,UTrw,GNu2,GNu1,TPi2,TPi1,TKa2,TKa1,RZab',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'timeout' => 18, // 19.8.3: usługa odpowiada w 5–12 s; domyślne 10 s dawało puste kafle
        'ttl' => 30 * 86400,
    ],
    'prg_boundaries' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WMS/AdministrativeBoundaries',
        'layers' => 'A01_Granice_wojewodztw,A02_Granice_powiatow,A03_Granice_gmin',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 30 * 86400,
    ],
    'prng_names' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRNG/WMS/GeographicalNames',
        'layers' => 'M1_UrzedoweNazwyMiejscowosci,M2_PozostaleNazwyMiejscowosci,O1_UrzedoweNazwyObiektowFizjograficznych,O2_ZestandaryzowaneNazwyObiektowFizjograficznych,O3_PozostaleNazwyObiektowFizjograficznych',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 30 * 86400,
    ],
    'kina_addresses' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaNumeracjiAdresowej',
        'layers' => 'A07_Punkty_adresowe,A08_Ulice',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
        'variants' => [
            ['version' => '1.1.1', 'layers' => 'A07_Punkty_adresowe,A08_Ulice'],
            ['version' => '1.1.1', 'layers' => 'prg-adresy,prg-ulice,prg-place', 'styles' => ','],
            ['version' => '1.3.0', 'layers' => 'A07_Punkty_adresowe,A08_Ulice'],
        ],
    ],
    'gdos_protection' => [
        'url' => 'https://sdi.gdos.gov.pl/wms',
        'layers' => 'GDOS:ParkiNarodowe,GDOS:ParkiKrajobrazowe,GDOS:Rezerwaty,GDOS:ObszaryChronionegoKrajobrazu,GDOS:UzytkiEkologiczne,GDOS:ZespolyPrzyrodniczoKrajobrazowe',
        'version' => '1.3.0',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 30 * 86400,
    ],
    'kiut_power' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_elektroenergetyczny',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
    ],
    'kiut_gas' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_gazowy',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
    ],
    'kiut_water' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_wodociagowy',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
    ],
    'kiut_sewer' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_kanalizacyjny',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
    ],
    'kiut_telecom' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_telekomunikacyjny',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
    ],
    'kiut_heat' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_cieplowniczy',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
    ],
    'kiut_other' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
        'layers' => 'przewod_specjalny,przewod_inny',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
        'variants' => [
            // Official GUGiK KIUT example lists these two catch-all utility classes.
            ['version' => '1.1.1', 'layers' => 'przewod_specjalny,przewod_inny'],
            ['version' => '1.3.0', 'layers' => 'przewod_specjalny,przewod_inny'],
            // Last-resort single-layer probes: one bad layer must not invalidate both.
            ['version' => '1.3.0', 'layers' => 'przewod_inny'],
            ['version' => '1.3.0', 'layers' => 'przewod_specjalny'],
        ],
    ],
    'kibdot_bdot500' => [
        'url' => 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaBazDanychObiektowTopograficznych',
        // KIBDOT exposes the integrated BDOT500 composition as the WMS layer "bdot".
        'layers' => 'bdot',
        'version' => '1.1.1',
        'format' => 'image/png',
        'transparent' => true,
        'ttl' => 7 * 86400,
        'variants' => [
            ['version' => '1.1.1', 'layers' => 'bdot'],
            ['version' => '1.3.0', 'layers' => 'bdot'],
        ],
    ],

    // MSPortal 14.2 — planning, public land, geology and terrain imagery.
    'nmt_shaded' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WMS/ShadedRelief',
        'layers' => 'Raster', 'version' => '1.1.1', 'format' => 'image/jpeg', 'transparent' => false, 'ttl' => 30 * 86400,
    ],
    // 18.18.0: GUGiK zmienił nazwy warstw w usługach planów ogólnych (GetCapabilities
    // z 10.2026: strefaPlanistyczna, obszarUzupelnieniaZabudowy, obszarZabSrodmiejskiej,
    // aktPlanowaniaprzestrzennego; tytuły „POG - …”, strefa w liczbie pojedynczej).
    // Stary tytuł „Strefy Planistyczne” przestał pasować i zapasowe dopasowanie po
    // pozycji wybierało granicę aktu zamiast stref. Teraz: aktualne nazwy jako
    // główne, aliasy dla starych i nowych tytułów, stare nazwy tylko jako wariant.
    // Plan ogólny pokazuje też strefy planistyczne (wcześniej tylko obszary zabudowy).
    // Kolejność = kolejność rysowania (pierwsza na spodzie).
    'pog_adopted' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin',
        'layers' => 'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy',
        'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true, 'ttl' => 86400,
        'capabilities_ordinals' => [3,0,2,1],
        'capabilities_titles' => [
            ['aktPlanowaniaprzestrzennego', 'POG - Akt Planowania Przestrzennego', 'Akt Planowania Przestrzennego'],
            ['strefaPlanistyczna', 'POG - Strefa Planistyczna', 'Strefa Planistyczna', 'Strefy Planistyczne'],
            ['obszarZabSrodmiejskiej', 'POG - Obszar Zabudowy Śródmiejskiej', 'Obszar Zabudowy Śródmiejskiej'],
            ['obszarUzupelnieniaZabudowy', 'POG - Obszar Uzupełnienia Zabudowy', 'Obszar Uzupełnienia Zabudowy'],
        ],
        'variants' => [
            ['version'=>'1.1.1','layers'=>'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy'],
            ['version'=>'1.3.0','layers'=>'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy'],
            ['version'=>'1.1.1','layers'=>'akt_planowania_przestrzennego,strefy_planistyczne,obszar_zabudowy_srodmiejskiej,obszar_uzupelnienia_zabudowy'],
        ],
    ],
    'pog_draft' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin',
        'layers' => 'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarStandardowDostepnosciInfrastrukturySpolecznej,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy',
        'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true, 'ttl' => 86400,
        'capabilities_ordinals' => [4,0,1,3,2],
        'capabilities_titles' => [
            ['aktPlanowaniaprzestrzennego', 'POG projektowane - Akt Planowania Przestrzennego', 'Akt Planowania Przestrzennego'],
            ['strefaPlanistyczna', 'POG projektowane - Strefa Planistyczna', 'Strefa Planistyczna', 'POG projektowane - Strefy Planistyczne', 'Strefy Planistyczne'],
            ['obszarStandardowDostepnosciInfrastrukturySpolecznej', 'POG projektowane - Obszar Standardów Dostępności Infrastruktury Społecznej', 'Obszar Standardów Dostępności Infrastruktury Społecznej'],
            ['obszarZabSrodmiejskiej', 'POG projektowane - Obszar Zabudowy Śródmiejskiej', 'Obszar Zabudowy Śródmiejskiej'],
            ['obszarUzupelnieniaZabudowy', 'POG projektowane- Obszar Uzupełnienia Zabudowy', 'POG projektowane - Obszar Uzupełnienia Zabudowy', 'Obszar Uzupełnienia Zabudowy'],
        ],
        'variants' => [
            ['version'=>'1.1.1','layers'=>'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarStandardowDostepnosciInfrastrukturySpolecznej,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy'],
            ['version'=>'1.3.0','layers'=>'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarStandardowDostepnosciInfrastrukturySpolecznej,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy'],
            ['version'=>'1.1.1','layers'=>'akt_planowania_przestrzennego,strefy_planistyczne,obszar_standardow_dostepnosci_infrastruktury_spolecznej,obszar_zabudowy_srodmiejskiej,obszar_uzupelnienia_zabudowy'],
        ],
    ],
    'pog_zones' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin',
        'layers' => 'strefaPlanistyczna', 'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true, 'ttl' => 86400,
        'capabilities_ordinals' => [0],
        'capabilities_titles' => [
            ['strefaPlanistyczna', 'POG - Strefa Planistyczna', 'Strefa Planistyczna', 'Strefy Planistyczne'],
        ],
        'variants' => [
            ['version'=>'1.1.1','layers'=>'strefaPlanistyczna'],
            ['version'=>'1.3.0','layers'=>'strefaPlanistyczna'],
            ['version'=>'1.1.1','layers'=>'strefy_planistyczne'],
        ],
    ],
    'kowr' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/ext/kowr',
        'layers' => 'dzialki', 'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true, 'ttl' => 7 * 86400,
        'variants' => [
            ['version'=>'1.1.1','layers'=>'dzialki'],
            ['version'=>'1.1.1','layers'=>'Dzialki'],
            ['version'=>'1.1.1','layers'=>'kowr'],
            ['version'=>'1.3.0','layers'=>'dzialki'],
        ],
    ],
    // 19.40.0: raport PDF — lasy z BDOT10k (udział powierzchni działki i odległość).
    'bdot10k_forest' => [
        'url' => 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
        'layers' => 'TLes', 'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true, 'timeout' => 18, 'ttl' => 30 * 86400,
    ],
    // 19.40.0: obszary zagrożenia powodziowego (ISOK) jako obraz — raport PDF liczy udział powierzchni działki.
    'flood_isok' => [
        'url' => 'https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS',
        'layers' => 'NZ.Fluvial,NZ.SeaWater', 'version' => '1.3.0', 'format' => 'image/png', 'transparent' => true, 'ttl' => 30 * 86400,
    ],
    'pgi_deposits' => [
        'url' => 'https://cbdgmapa.pgi.gov.pl/arcgis/services/midas/MapServer/WMSServer',
        'layers' => '0', 'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true, 'ttl' => 7 * 86400,
        'variants' => [ ['version'=>'1.1.1','layers'=>'0'], ['version'=>'1.3.0','layers'=>'0'] ],
    ],
    'pgi_miningareas' => [
        'url' => 'https://cbdgmapa.pgi.gov.pl/arcgis/services/midas/MapServer/WMSServer',
        'layers' => '1', 'version' => '1.1.1', 'format' => 'image/png', 'transparent' => true, 'ttl' => 7 * 86400,
        'variants' => [ ['version'=>'1.1.1','layers'=>'1'], ['version'=>'1.3.0','layers'=>'1'] ],
    ],
];

require_once __DIR__ . '/_source_profiles.php';
$sources = array_replace($sources, mapownik_source_profiles());
foreach ($sources as $wmsProfileKey => &$wmsProfileValue) {
    if ($wmsProfileKey === 'dzialki' || $wmsProfileKey === 'mpzp' || str_starts_with($wmsProfileKey, 'kiut_')) $wmsProfileValue['ttl'] = 86400;
    if (str_starts_with($wmsProfileKey, 'kiut_')) { unset($wmsProfileValue['variants']); $wmsProfileValue['error_mode'] = 'http'; }
}
unset($wmsProfileValue, $wmsProfileKey);
return $sources;
