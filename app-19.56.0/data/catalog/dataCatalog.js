import { sourceProfiles } from './sourceProfiles.js';
import { validateDataCatalog } from './catalogValidation.js';
/**
 * msportal 14.3 data catalog.
 *
 * Basemaps remain isolated from thematic overlays. 15.3 adds direct WMTS tiling and preload; the curated set
 * of reference layers needed by later parcel screening: BDOT10k, PRG, PRNG,
 * KINA, GDOŚ, full KIUT/GESUT utilities and KIBDOT/BDOT500. All reference layers start disabled and use minZoom
 * where nationwide rendering would be wasteful. Same-origin api/wms.php keeps
 * upstream hosts and layer lists on a strict server-side allowlist.
 */
/*
 * 17.8.3 — transport and projection overhaul:
 *  - WMS layers load straight from upstream services in the browser
 *    (transport 'direct-then-proxy'); /api/wms.php is the fallback and still
 *    the source key for export and identify (source.url).
 *  - Layers request EPSG:3857 (the view projection) instead of EPSG:2180, so
 *    OpenLayers no longer reprojects rasters client-side. KIUT and KIBDOT stay
 *    on EPSG:2180 / WMS 1.1.1 until their 3857 support is confirmed.
 *  - POG uchwalone: tiled 512 px with dpiScale 2, because the service draws
 *    zones only at 1:5000 and larger. Strefy planistyczne start at zoom 16.
 *  - KIMP: 512 px tiles → ~4× fewer requests to the aggregate service.
 *
 * 17.6.4 — every WMS source here sets its own directTimeoutMs/proxyTimeoutMs,
 * which overrides wmsTransport.js's own (now tightened) defaults entirely.
 * These per-source values are cut roughly in the same proportion as the
 * defaults, so the worst-case wait for one tile — probe + direct + proxy
 * fallback, no more proxy retry — stays bounded even for the aggregate
 * KIEG/KIUT/KIMP/POG services that fan out to many municipal endpoints.
 */
const rawDataCatalog = {
    catalogVersion: 14,
    layers: [
        {
            id: 'basemap.osm',
            title: 'Mapa standardowa',
            group: 'Podkłady',
            role: 'basemap',
            visible: true,
            opacity: 1,
            zIndex: -100,
            attribution: {
                label: '© OpenStreetMap',
                url: 'https://www.openstreetmap.org/copyright',
            },
            capabilities: {
                identify: false,
                selectable: false,
                editable: false,
            },
            source: {
                kind: 'xyz',
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                maxZoom: 19,
                crossOrigin: 'anonymous',
                preload: 1,
                transition: 120,
            },
        },
        {
            id: 'basemap.topography',
            title: 'Topografia',
            group: 'Podkłady',
            role: 'basemap',
            visible: false,
            opacity: 1,
            zIndex: -100,
            attribution: {
                label: 'GUGiK / Geoportal.gov.pl',
                url: 'https://www.geoportal.gov.pl/',
            },
            capabilities: {
                identify: false,
                selectable: false,
                editable: false,
            },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=topography',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/service/img/guest/TOPO/MapServer/WMSServer',
                directTimeoutMs: 6000,
                layers: 'Raster',
                version: '1.1.1',
                format: 'image/jpeg',
                transparent: false,
                tiled: true,
                preload: 1,
                transition: 120,
            },
        },
        {
            id: 'basemap.orthophoto',
            title: 'Ortofotomapa',
            group: 'Podkłady',
            role: 'basemap',
            visible: false,
            opacity: 1,
            zIndex: -100,
            attribution: {
                label: 'GUGiK / Geoportal.gov.pl',
                url: 'https://www.geoportal.gov.pl/',
            },
            capabilities: {
                identify: false,
                selectable: false,
                editable: false,
            },
            source: {
                kind: 'fast-wmts',
                standardUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTOFOTOMAPA&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:{z}&TILEROW={y}&TILECOL={x}',
                // 19.18.0: WMTS HD nie ma już EPSG:3857 (HTTP 500), WMS StandardResolution wycofany (404).
                // Zwykły WMTS do poziomu 19, wyżej i jako zapas — WMS HighResolution przez proxy.
                highResolutionWmsUrl: './api/wms.php?source=orthophoto_high&SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&TRANSPARENT=false',
                fallbackWmsUrl: './api/wms.php?source=orthophoto_high&SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=Raster&STYLES=&FORMAT=image/jpeg&TRANSPARENT=false',
                switchZoom: 20,
                maxZoom: 23,
                tileSize: 256,
                preload: 1,
                transition: 100,
            },
        },
        // 19.48.0: podkład „Ortofotomapa archiwalna” usunięty razem z modułem zdjęć archiwalnych (decyzja właściciela).
        {
            id: 'basemap.orthophoto.true', title: 'Prawdziwa ortofotomapa', group: 'Podkłady', role: 'basemap',
            // 19.23.0: usługa rysuje do skali 1:25 099 (GetCapabilities); pokrycie tylko wybrane miasta.
            visible: false, opacity: 1, zIndex: -100, minZoom: 15,
            attribution: { label: 'GUGiK — prawdziwa ortofotomapa', url: 'https://www.geoportal.gov.pl/' },
            capabilities: { identify: false, selectable: false, editable: false },
            source: { kind: 'wms', url: './api/wms.php?source=orthophoto_true',
                transport: 'direct-then-proxy', directUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/TrueOrtho',
                layers: 'PrawdziwaOrtofotomapa', version: '1.1.1', format: 'image/png', transparent: true,
                tiled: true, tileSize: 512, preload: 0, directTimeoutMs: 10000 },
        },
        // 19.37.0: „Czyj las” — własność lasów z Banku Danych o Lasach (api/forest.php: mapa i informacja w punkcie).
        {
            id: 'overlay.forest.ownership',
            title: 'Lasy — własność (BDL)',
            group: 'Środowisko',
            role: 'overlay',
            visible: false,
            opacity: 0.85,
            minZoom: 12,
            zIndex: 18,
            description: 'Lasy Państwowe (zielone) i lasy poza LP — prywatne, gminne, inne (pomarańczowe). Kliknięcie w las pokazuje kategorię własności, nadleśnictwo i drzewostan.',
            attribution: { label: 'Bank Danych o Lasach — Lasy Państwowe', url: 'https://www.bdl.lasy.gov.pl/' },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/forest.php?wms=1&source=bdl_forest',
                transport: 'proxy',
                layers: 'bdl',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: true,
                tileSize: 512,
                legendUrl: './assets/legend/las-wlasnosc.svg?v=19.56.0',
                identifyUrl: './api/forest.php',
            },
        },
        {
            id: 'overlay.natura2000',
            title: 'Obszary chronione / Natura 2000',
            group: 'Środowisko',
            role: 'overlay',
            visible: false,
            opacity: 0.55,
            zIndex: 20,
            attribution: {
                label: 'GDOŚ — Geoserwis',
                url: 'https://geoserwis.gdos.gov.pl/',
            },
            capabilities: {
                identify: true,
                selectable: false,
                editable: false,
            },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=natura2000',
                transport: 'direct-then-proxy',
                directUrl: 'https://sdi.gdos.gov.pl/wms',
                directTimeoutMs: 6000,
                layers: 'GDOS:ObszarySpecjalnejOchrony,GDOS:SpecjalneObszaryOchrony',
                version: '1.3.0',
                format: 'image/png',
                transparent: true,
                tiled: true,
            },
        },
        {
            id: 'overlay.mpzp',
            title: 'MPZP (KIMP)',
            group: 'Planowanie przestrzenne',
            role: 'overlay',
            visible: false,
            opacity: 0.60,
            minZoom: 13,
            zIndex: 40,
            attribution: {
                label: 'GUGiK — Krajowa Integracja MPZP',
                url: 'https://www.geoportal.gov.pl/',
            },
            capabilities: {
                identify: true,
                selectable: false,
                editable: false,
            },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=mpzp',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                // 19.8.6: EPSG:3857 zostaje celowo — w tym układzie GUGiK sam składa obraz z serwerów
                // gmin (bez przekierowań); w EPSG:2180 odsyła do serwerów gmin, a część z nich
                // (Warszawa, Lublin, Białystok, Łódź) odrzuca zapytania. „granice” to jedyna
                // warstwa widoczna przy zoomie 14–16, więc też zostaje.
                layers: 'granice,raster,wektor-str,wektor-lzb,wektor-lin,wektor-pow,wektor-pkt',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                // 19.8.6: jeden obraz na widok zamiast kafli 512 (jak minigeoportal.pl). Kaskada GUGiK
                // odpowiada 3–6 s na KAŻDE zapytanie: ekran 1920×1080 to 12–15 kafli (10–13 s,
                // ~10× więcej pracy kaskady) wobec jednego obrazu (~6 s).
                tiled: false,
                ratio: 1.25,
            },
        },
        {
            id: 'overlay.dzialki',
            title: 'Działki ewidencyjne (KIEG)',
            group: 'Granice i działki',
            role: 'overlay',
            visible: false,
            opacity: 0.85,
            // 19.23.0: KIEG rysuje działki dopiero po przekierowaniu do serwera powiatu, które następuje
            // w dużych skalach; przy zoomie 14–16 integracja zwracała pusty obraz (audyt 30.10.2026).
            minZoom: 17,
            zIndex: 50,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Ewidencji Gruntów',
                url: 'https://integracja.gugik.gov.pl/',
            },
            capabilities: {
                identify: false,
                selectable: false,
                editable: false,
            },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=dzialki',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'dzialki,budynki,numery_dzialek',
                // 19.47.0: EPSG:2180 i WMS 1.1.1. W EPSG:3857 integracja GUGiK przekierowuje na integracja01,
                // który odpowiada błędem „Projection library error … init=epsg:3857” (XML zamiast obrazu —
                // przeglądarka blokuje go jako ORB, warstwa była „niedostępna”). W EPSG:2180 integracja
                // przekierowuje do serwera powiatu (np. walecki.webewid.pl), tak jak Geoportal. Obraz obraca
                // do widoku mapa (OpenLayers). Serwery powiatów zrywają połączenia z hostingu, więc pierwsza
                // próba idzie z przeglądarki, serwer pośredniczący jest zapasem.
                version: '1.1.1',
                projection: 'EPSG:2180',
                format: 'image/png',
                transparent: true,
                tiled: false,
                // Legenda KIEG (same linie i numery) nic nie wnosi, a jej pobieranie przez serwer kończyło się 502.
                legendUrl: false,
            },
        },
        {
            id: 'overlay.egib.arable-classes',
            title: 'Klasy gruntów ornych (EGiB)',
            description: 'Kontury EGiB: grunty orne RI, RII, RIIIa, RIIIb, RIVa, RIVb, RV, RVI (lokalnie RVIz). Widoczne są też inne użytki. Dane zależą od powiatu; pusta mapa nie potwierdza braku gruntów danej klasy. Status OK oznacza działanie usługi, nie kompletność danych. Sprawdź punkt w narzędziu „Informacja o działce”.',
            group: 'Grunty',
            role: 'overlay',
            visible: false,
            opacity: 0.9,
            minZoom: 16,
            zIndex: 56,
            attribution: {
                label: 'GUGiK — EGiB / Krajowa Integracja Użytków Gruntowych',
                url: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzytkowGruntowych',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=egib_classes',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzytkowGruntowych',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'kontury,uzytki',
                version: '1.1.1',
                projection: 'EPSG:2180',
                format: 'image/png',
                transparent: true,
                tiled: false,
            },
        },

        {
            id: 'overlay.bdot10k.buildings',
            title: 'Budynki (BDOT10k)',
            group: 'Budynki',
            role: 'overlay',
            visible: false,
            opacity: 0.82,
            minZoom: 13,
            zIndex: 60,
            attribution: {
                label: 'GUGiK — BDOT10k',
                url: 'https://www.geoportal.gov.pl/pl/dane/baza-danych-obiektow-topograficznych-bdot10k/',
            },
            capabilities: { identify: false, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=bdot10k_buildings',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
                directTimeoutMs: 6000,
                // 19.8.3: kompozycja BDOT10k GUGiK odpowiada w 5–12 s — dłuższe oczekiwanie na serwer pośredniczący.
                proxyTimeoutMs: 22000,
                layers: 'BudGo,BudPWy,BudP2,BudP1,BudUWy,BudU,BudMWy,BudMJ,BudMW',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: true, tileSize: 512, preload: 1, transition: 120,
            },
        },
        {
            id: 'overlay.bdot10k.transport',
            title: 'Drogi i kolej (BDOT10k)',
            group: 'Dane referencyjne',
            role: 'overlay',
            visible: false,
            opacity: 0.82,
            minZoom: 11,
            zIndex: 61,
            attribution: {
                label: 'GUGiK — BDOT10k',
                url: 'https://www.geoportal.gov.pl/pl/dane/baza-danych-obiektow-topograficznych-bdot10k/',
            },
            capabilities: { identify: false, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=bdot10k_transport',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
                directTimeoutMs: 6000,
                // 19.8.3: kompozycja BDOT10k GUGiK odpowiada w 5–12 s — dłuższe oczekiwanie na serwer pośredniczący.
                proxyTimeoutMs: 22000,
                layers: 'JDrLNUt,JDLNTw,JDrZTw,JDrG,JDrEk,JAu,LKNc,LKBu,LKWs,TSt,LKNelJ,LKNelD,LKNelW,LKZelJ,LKZelD,LKZelW',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: true, tileSize: 512, preload: 1, transition: 120,
            },
        },
        {
            id: 'overlay.bdot10k.water',
            title: 'Wody (BDOT10k)',
            group: 'Dane referencyjne',
            role: 'overlay',
            visible: false,
            opacity: 0.78,
            minZoom: 11,
            zIndex: 62,
            attribution: {
                label: 'GUGiK — BDOT10k',
                url: 'https://www.geoportal.gov.pl/pl/dane/baza-danych-obiektow-topograficznych-bdot10k/',
            },
            capabilities: { identify: false, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=bdot10k_water',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
                directTimeoutMs: 6000,
                // 19.8.3: kompozycja BDOT10k GUGiK odpowiada w 5–12 s — dłuższe oczekiwanie na serwer pośredniczący.
                proxyTimeoutMs: 22000,
                layers: 'WPow,LBrzN,LBrz,rz,kan,row,rzOk,kanOkr,RowEt,kanEt,rzEt',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: true, tileSize: 512, preload: 1, transition: 120,
            },
        },
        {
            id: 'overlay.bdot10k.landuse',
            title: 'Użytkowanie terenu i lasy (BDOT10k)',
            group: 'Dane referencyjne',
            role: 'overlay',
            visible: false,
            opacity: 0.55,
            minZoom: 10,
            zIndex: 63,
            attribution: {
                label: 'GUGiK — BDOT10k',
                url: 'https://www.geoportal.gov.pl/pl/dane/baza-danych-obiektow-topograficznych-bdot10k/',
            },
            capabilities: { identify: false, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=bdot10k_landuse',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/service/pub/guest/kompozycja_BDOT10k_WMS/MapServer/WMSServer',
                directTimeoutMs: 6000,
                // 19.8.3: kompozycja BDOT10k GUGiK odpowiada w 5–12 s — dłuższe oczekiwanie na serwer pośredniczący.
                proxyTimeoutMs: 22000,
                layers: 'TPrz,TLes,RKr,RTr,UTrw,GNu2,GNu1,TPi2,TPi1,TKa2,TKa1,RZab',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: true, tileSize: 512, preload: 1, transition: 120,
            },
        },
        {
            id: 'overlay.prg.boundaries',
            title: 'Granice administracyjne (PRG)',
            group: 'Granice i działki',
            role: 'overlay',
            visible: false,
            opacity: 0.78,
            minZoom: 6,
            zIndex: 70,
            attribution: {
                label: 'GUGiK — Państwowy Rejestr Granic',
                url: 'https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-granic-prg/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=prg_boundaries',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WMS/AdministrativeBoundaries',
                directTimeoutMs: 6000,
                layers: 'A01_Granice_wojewodztw,A02_Granice_powiatow,A03_Granice_gmin',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: true, tileSize: 512, preload: 1, transition: 120,
            },
        },
        {
            id: 'overlay.prng.names',
            title: 'Nazwy geograficzne (PRNG)',
            group: 'Dane referencyjne',
            role: 'overlay',
            visible: false,
            opacity: 0.88,
            minZoom: 9,
            zIndex: 75,
            attribution: {
                label: 'GUGiK — Państwowy Rejestr Nazw Geograficznych',
                url: 'https://www.geoportal.gov.pl/pl/dane/panstwowy-rejestr-nazw-geograficznych-prng/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=prng_names',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRNG/WMS/GeographicalNames',
                directTimeoutMs: 6000,
                layers: 'M1_UrzedoweNazwyMiejscowosci,M2_PozostaleNazwyMiejscowosci,O1_UrzedoweNazwyObiektowFizjograficznych,O2_ZestandaryzowaneNazwyObiektowFizjograficznych,O3_PozostaleNazwyObiektowFizjograficznych',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
            },
        },
        {
            id: 'overlay.kina.addresses',
            title: 'Adresy i ulice (KINA)',
            group: 'Dane referencyjne',
            role: 'overlay',
            visible: false,
            opacity: 0.92,
            minZoom: 14,
            zIndex: 76,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Numeracji Adresowej',
                url: 'https://www.geoportal.gov.pl/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kina_addresses',
                transport: 'direct-then-proxy',
                directUrl: 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaNumeracjiAdresowej',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'A07_Punkty_adresowe,A08_Ulice',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
            },
        },
        {
            id: 'overlay.gdos.protection',
            title: 'Rezerwaty, parki i OChK (GDOŚ)',
            group: 'Środowisko',
            role: 'overlay',
            visible: false,
            opacity: 0.52,
            minZoom: 8,
            zIndex: 80,
            attribution: {
                label: 'GDOŚ — Geoserwis / CRFOP',
                url: 'https://geoserwis.gdos.gov.pl/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=gdos_protection',
                transport: 'direct-then-proxy',
                directUrl: 'https://sdi.gdos.gov.pl/wms',
                directTimeoutMs: 6000,
                layers: 'GDOS:ParkiNarodowe,GDOS:ParkiKrajobrazowe,GDOS:Rezerwaty,GDOS:ObszaryChronionegoKrajobrazu,GDOS:UzytkiEkologiczne,GDOS:ZespolyPrzyrodniczoKrajobrazowe',
                version: '1.3.0',
                format: 'image/png',
                transparent: true,
                tiled: true, tileSize: 512, preload: 1, transition: 120,
            },
        },
        {
            id: 'overlay.kiut.power',
            title: 'Energia elektryczna',
            group: 'Uzbrojenie terenu',
            role: 'overlay',
            visible: false,
            opacity: 0.92,
            minZoom: 17,
            zIndex: 90,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Uzbrojenia Terenu',
                url: 'https://www.geoportal.gov.pl/pl/dane/uzbrojenie-terenu-gesut/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kiut_power',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'przewod_elektroenergetyczny',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
                projection: 'EPSG:2180',
            },
        },
        {
            id: 'overlay.kiut.gas',
            title: 'Gaz',
            group: 'Uzbrojenie terenu',
            role: 'overlay',
            visible: false,
            opacity: 0.92,
            minZoom: 17,
            zIndex: 91,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Uzbrojenia Terenu',
                url: 'https://www.geoportal.gov.pl/pl/dane/uzbrojenie-terenu-gesut/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kiut_gas',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'przewod_gazowy',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
                projection: 'EPSG:2180',
            },
        },
        {
            id: 'overlay.kiut.water',
            title: 'Wodociąg',
            group: 'Uzbrojenie terenu',
            role: 'overlay',
            visible: false,
            opacity: 0.92,
            minZoom: 17,
            zIndex: 92,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Uzbrojenia Terenu',
                url: 'https://www.geoportal.gov.pl/pl/dane/uzbrojenie-terenu-gesut/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kiut_water',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'przewod_wodociagowy',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
                projection: 'EPSG:2180',
            },
        },
        {
            id: 'overlay.kiut.sewer',
            title: 'Kanalizacja',
            group: 'Uzbrojenie terenu',
            role: 'overlay',
            visible: false,
            opacity: 0.92,
            minZoom: 17,
            zIndex: 93,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Uzbrojenia Terenu',
                url: 'https://www.geoportal.gov.pl/pl/dane/uzbrojenie-terenu-gesut/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kiut_sewer',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'przewod_kanalizacyjny',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
                projection: 'EPSG:2180',
            },
        },
        {
            id: 'overlay.kiut.telecom',
            title: 'Telekomunikacja',
            group: 'Uzbrojenie terenu',
            role: 'overlay',
            visible: false,
            opacity: 0.92,
            minZoom: 17,
            zIndex: 94,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Uzbrojenia Terenu',
                url: 'https://www.geoportal.gov.pl/pl/dane/uzbrojenie-terenu-gesut/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kiut_telecom',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'przewod_telekomunikacyjny',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
                projection: 'EPSG:2180',
            },
        },
        {
            id: 'overlay.kiut.heat',
            title: 'Sieć ciepłownicza',
            group: 'Uzbrojenie terenu',
            role: 'overlay',
            visible: false,
            opacity: 0.92,
            minZoom: 17,
            zIndex: 95,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Uzbrojenia Terenu',
                url: 'https://www.geoportal.gov.pl/pl/dane/uzbrojenie-terenu-gesut/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kiut_heat',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'przewod_cieplowniczy',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
                projection: 'EPSG:2180',
            },
        },
        {
            id: 'overlay.kiut.other',
            title: 'Pozostałe przewody i urządzenia',
            group: 'Uzbrojenie terenu',
            role: 'overlay',
            visible: false,
            opacity: 0.92,
            minZoom: 17,
            zIndex: 96,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Uzbrojenia Terenu',
                url: 'https://www.geoportal.gov.pl/pl/dane/uzbrojenie-terenu-gesut/',
            },
            capabilities: { identify: true, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kiut_other',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'przewod_specjalny,przewod_inny',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
                projection: 'EPSG:2180',
            },
        },
        {
            id: 'overlay.kibdot.bdot500',
            title: 'Obiekty topograficzne (BDOT500)',
            group: 'Dane referencyjne',
            role: 'overlay',
            visible: false,
            opacity: 0.94,
            minZoom: 17,
            zIndex: 88,
            attribution: {
                label: 'GUGiK — Krajowa Integracja Baz Danych Obiektów Topograficznych',
                url: 'https://www.geoportal.gov.pl/pl/dane/baza-danych-obiektow-topograficznych-bdot500/',
            },
            capabilities: { identify: false, selectable: false, editable: false },
            source: {
                kind: 'wms',
                url: './api/wms.php?source=kibdot_bdot500',
                transport: 'direct-then-proxy',
                directUrl: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaBazDanychObiektowTopograficznych',
                directTimeoutMs: 9000,
                proxyTimeoutMs: 15000,
                layers: 'bdot',
                version: '1.1.1',
                format: 'image/png',
                transparent: true,
                tiled: false,
                projection: 'EPSG:2180',
            },
        },

        {
            id: 'basemap.nmt.shaded',
            title: 'NMT — cieniowanie',
            group: 'Podkłady',
            role: 'basemap',
            visible: false,
            opacity: 1,
            zIndex: -100,
            attribution: { label: 'GUGiK — NMT', url: 'https://www.geoportal.gov.pl/pl/dane/numeryczny-model-terenu-nmt/' },
            capabilities: { identify: false, selectable: false, editable: false },
            // 19.23.0: usługa nie obsługuje EPSG:3857 (GetCapabilities) i losowo zwraca jednolity kafel
            // albo wyjątek — tylko przez proxy, które odrzuca takie odpowiedzi i ponawia zapytanie.
            source: { kind: 'wms', url: './api/wms.php?source=nmt_shaded', transport: 'proxy', directUrl: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WMS/ShadedRelief', proxyTimeoutMs: 20000, layers: 'Raster', version: '1.1.1', format: 'image/jpeg', transparent: false, projection: 'EPSG:2180', tiled: true, preload: 1, transition: 120 },
        },
        // 19.30.0: podkłady wektorowe OpenStreetMap (OpenFreeMap) z paletą msportalu.
        {
            id: 'basemap.vector.pastel', title: 'Pastel szczegółowy', group: 'Podkłady', role: 'basemap', visible: false, opacity: 1, zIndex: -100,
            description: 'Mapa OpenStreetMap w stonowanych barwach: budynki, numery adresowe, sklepy i usługi, przeznaczenie terenu. Spokojne tło pod warstwy planistyczne.',
            attribution: { label: '© OpenStreetMap · OpenMapTiles · OpenFreeMap', url: 'https://openfreemap.org/' },
            capabilities: { identify: false, selectable: false, editable: false },
            source: { kind: 'vector-style', variant: 'pastel', thumbnail: './assets/basemaps/pastel.jpg' },
        },
        {
            id: 'basemap.vector.zmierzch', title: 'Zmierzch grafitowy szczegółowy', group: 'Podkłady', role: 'basemap', visible: false, opacity: 1, zIndex: -100,
            description: 'Ciemna, grafitowo-niebieska mapa OpenStreetMap ze szczegółami — do pracy wieczorem i przy ciemnym motywie.',
            attribution: { label: '© OpenStreetMap · OpenMapTiles · OpenFreeMap', url: 'https://openfreemap.org/' },
            capabilities: { identify: false, selectable: false, editable: false },
            source: { kind: 'vector-style', variant: 'zmierzch', thumbnail: './assets/basemaps/zmierzch.jpg' },
        },
        {
            id: 'basemap.vector.kartograficzny', title: 'Kartograficzny', group: 'Podkłady', role: 'basemap', visible: false, opacity: 1, zIndex: -100,
            description: 'Styl mapy topograficznej: warstwice z opisem wysokości, cieniowanie rzeźby, siatka współrzędnych, drogi z obwiednią.',
            attribution: { label: '© OpenStreetMap · OpenMapTiles · OpenFreeMap · AWS Terrain Tiles', url: 'https://openfreemap.org/' },
            capabilities: { identify: false, selectable: false, editable: false },
            source: { kind: 'vector-style', variant: 'kartograficzny', thumbnail: './assets/basemaps/kartograficzny.jpg' },
        },
        // 19.30.0: spadki terenu liczone w przeglądarce z modelu wysokości (ok. 30 m) — nakładka na dowolny podkład.
        {
            id: 'overlay.terrain.slope',
            title: 'Nachylenie terenu (spadki %)',
            group: 'Rzeźba i wysokości',
            description: 'Spadek terenu w procentach: jasnozielony 2–5%, zielony 5–10%, żółty 10–15%, pomarańczowy 15–25%, czerwony 25–40%, purpurowy powyżej 40%. Z modelu wysokości ok. 30 m — pokazuje stoki i skarpy, nie drobne nasypy; dokładny spadek działki da profil terenu (NMT 1 m).',
            role: 'overlay', visible: false, opacity: 0.65, minZoom: 9, zIndex: 60,
            attribution: { label: 'Model wysokości: AWS Terrain Tiles', url: 'https://registry.opendata.aws/terrain-tiles/' },
            capabilities: { identify: false, selectable: false, editable: false },
            source: { kind: 'dem', mode: 'slope' },
        },
        {
            id: 'overlay.pog.adopted',
            title: 'Plan ogólny — uchwalony',
            group: 'Planowanie przestrzenne',
            role: 'overlay', visible: false, opacity: 0.62, minZoom: 11, zIndex: 101,
            attribution: { label: 'GUGiK — Plany Ogólne Gmin', url: 'https://www.geoportal.gov.pl/' },
            capabilities: { identify: true, selectable: false, editable: false },
            source: { kind: 'wms', url: './api/wms.php?source=pog_adopted', transport: 'direct-then-proxy', directUrl: 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin', directTimeoutMs: 9000, proxyTimeoutMs: 15000, layers: 'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy', version: '1.1.1', format: 'image/png', transparent: true, tiled: true, tileSize: 512, dpiScale: 2, transition: 120 },
        },
        {
            id: 'overlay.pog.draft',
            title: 'Plan ogólny — projektowany',
            group: 'Planowanie przestrzenne',
            role: 'overlay', visible: false, opacity: 0.58, minZoom: 10, zIndex: 102,
            attribution: { label: 'GUGiK — Projektowane Plany Ogólne Gmin', url: 'https://www.geoportal.gov.pl/' },
            capabilities: { identify: true, selectable: false, editable: false },
            source: { kind: 'wms', url: './api/wms.php?source=pog_draft_map', transport: 'direct-then-proxy', directUrl: 'https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin', directTimeoutMs: 9000, proxyTimeoutMs: 15000, layers: 'aktPlanowaniaprzestrzennego,strefaPlanistyczna,obszarStandardowDostepnosciInfrastrukturySpolecznej,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy', version: '1.1.1', format: 'image/png', transparent: true, tiled: false },
        },
        {
            id: 'overlay.pog.zones',
            title: 'Strefy planistyczne',
            group: 'Planowanie przestrzenne',
            role: 'overlay', visible: false, opacity: 0.56, minZoom: 12, zIndex: 103, // 18.15.2: usługa pokazuje strefy do skali 1:100 000 (≈ zoom 12); wcześniej 16
            attribution: { label: 'GUGiK — Plany Ogólne Gmin', url: 'https://www.geoportal.gov.pl/' },
            capabilities: { identify: true, selectable: false, editable: false },
            source: { kind: 'wms', url: './api/wms.php?source=pog_zones', transport: 'direct-then-proxy', directUrl: 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin', directTimeoutMs: 9000, proxyTimeoutMs: 15000, layers: 'strefaPlanistyczna', version: '1.1.1', format: 'image/png', transparent: true, tiled: true, tileSize: 512, dpiScale: 2, transition: 120 },
        },
        {
            // 19.55.0: obszar uzupełnienia zabudowy (OUZ) z planu ogólnego jako osobna, wyraźna warstwa —
            // decyzję o warunkach zabudowy po wejściu planu ogólnego wydaje się tylko w takim obszarze.
            // Styl własny (SLD po stronie serwera): ciemny obrys, lekkie wypełnienie; GUGiK rysuje go cienką kreską.
            id: 'overlay.pog.ouz',
            title: 'Obszary uzupełnienia zabudowy (plan ogólny)',
            description: 'Obszary, w których po wejściu planu ogólnego można uzyskać decyzję o warunkach zabudowy. Widoczne od skali ok. 1:100 000.',
            group: 'Planowanie przestrzenne',
            role: 'overlay', visible: false, opacity: 0.95, minZoom: 12, zIndex: 104,
            attribution: { label: 'GUGiK — Plany Ogólne Gmin', url: 'https://www.geoportal.gov.pl/' },
            capabilities: { identify: false, selectable: false, editable: false },
            source: { kind: 'wms', url: './api/wms.php?source=pog_ouz', transport: 'proxy', directUrl: 'https://mapy.geoportal.gov.pl/wss/ext/PlanyOgolneGmin', proxyTimeoutMs: 15000, layers: 'obszarUzupelnieniaZabudowy', version: '1.1.1', format: 'image/png', transparent: true, tiled: true, tileSize: 512, dpiScale: 2, transition: 120, legendUrl: false },
        },
        {
            // 19.55.0: obszar uzupełnienia zabudowy (OUZ) z planu ogólnego jako osobna, wyraźna warstwa —
            // decyzję o warunkach zabudowy po wejściu planu ogólnego wydaje się tylko w takim obszarze.
            // Styl własny (SLD po stronie serwera): ciemny obrys, lekkie wypełnienie; GUGiK rysuje go cienką kreską.
            id: 'overlay.pog.draft.ouz',
            title: 'Obszary uzupełnienia zabudowy (projekt planu)',
            description: 'Obszary uzupełnienia zabudowy w projektach planów ogólnych (przed uchwaleniem). Widoczne od skali ok. 1:100 000.',
            group: 'Planowanie przestrzenne',
            role: 'overlay', visible: false, opacity: 0.95, minZoom: 12, zIndex: 105,
            attribution: { label: 'GUGiK — Plany Ogólne Gmin', url: 'https://www.geoportal.gov.pl/' },
            capabilities: { identify: false, selectable: false, editable: false },
            source: { kind: 'wms', url: './api/wms.php?source=pog_draft_ouz', transport: 'proxy', directUrl: 'https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin', proxyTimeoutMs: 15000, layers: 'obszarUzupelnieniaZabudowy', version: '1.1.1', format: 'image/png', transparent: true, tiled: true, tileSize: 512, dpiScale: 2, transition: 120, legendUrl: false },
        },
        // 19.23.0: warstwa „Działki w zasobie KOWR” ukryta — usługa GUGiK ext/kowr zwraca puste
        // obrazy dla dzialki/dzialki_pkt/powiaty w każdej skali (audyt 30.10.2026). Źródło `kowr`
        // zostaje w api/_wms_sources.php; po przywróceniu danych wystarczy przywrócić ten wpis.
        {
            id: 'overlay.pgi.deposits',
            title: 'Złoża kopalin (MIDAS)',
            group: 'Środowisko',
            role: 'overlay', visible: false, opacity: 0.62, minZoom: 8, zIndex: 120,
            attribution: { label: 'PIG-PIB — MIDAS', url: 'https://baza.pgi.gov.pl/geoportal/uslugi/gis' },
            capabilities: { identify: true, selectable: false, editable: false },
            source: { kind: 'wms', url: './api/wms.php?source=pgi_deposits', transport: 'direct-then-proxy', directUrl: 'https://cbdgmapa.pgi.gov.pl/arcgis/services/midas/MapServer/WMSServer', directTimeoutMs: 6000, layers: '0', version: '1.1.1', format: 'image/png', transparent: true, tiled: true, tileSize: 512, preload: 1, transition: 120 },
        },
        {
            id: 'overlay.pgi.miningareas',
            title: 'Obszary górnicze (MIDAS)',
            group: 'Środowisko',
            role: 'overlay', visible: false, opacity: 0.62, minZoom: 8, zIndex: 121,
            attribution: { label: 'PIG-PIB — MIDAS', url: 'https://baza.pgi.gov.pl/geoportal/uslugi/gis' },
            capabilities: { identify: true, selectable: false, editable: false },
            source: { kind: 'wms', url: './api/wms.php?source=pgi_miningareas', transport: 'direct-then-proxy', directUrl: 'https://cbdgmapa.pgi.gov.pl/arcgis/services/midas/MapServer/WMSServer', directTimeoutMs: 6000, layers: '1', version: '1.1.1', format: 'image/png', transparent: true, tiled: true, tileSize: 512, preload: 1, transition: 120 },
        },
        {
            id: 'overlay.kowr.biogas',
            title: 'Biogazownie rolnicze (KOWR)',
            description: 'Pełny wykaz instalacji KOWR z punktami orientacyjnymi z tabeli geolokalizacyjnej. Metoda i źródło współrzędnych są podane przy każdym punkcie. Większość lokalizacji wskazuje kod pocztowy, a nie działkę instalacji; potwierdź położenie przed analizą odległości.',
            group: 'Infrastruktura',
            role: 'overlay', visible: false, opacity: 0.85, zIndex: 160,
            attribution: { label: 'KOWR — rejestr wytwórców biogazu rolniczego', url: 'https://www.gov.pl/web/kowr/rejestr-wytworcow-biogazu-rolniczego' },
            capabilities: { identify: false, selectable: false, editable: false },
            source: { kind: 'kowr-points', url: './data/kowr/installations.json', listUrl: './data/kowr/installations.csv' },
        },
    ],
};
/**
 * Kolejność grup w panelu Warstwy.
 *
 * Jawna lista, a nie kolejność wynikająca z `zIndex`: nagłówek grupy pojawiał
 * się tam, gdzie wypadła jej pierwsza warstwa w kolejności rysowania, więc
 * dołożenie warstwy o innym zIndeksie potrafiło przestawić całą sekcję.
 * Kolejność wewnątrz grupy nadal wynika z kolejności rysowania.
 *
 * Grupa spoza tej listy trafia na koniec — nowa warstwa nigdy nie zniknie
 * z panelu przez zapomniany wpis.
 */
/** Grupy rozwinięte w panelu Warstwy przy pierwszym uruchomieniu. */
// 19.53.0 (Etap 5): grupy domyślnie zwinięte — rozwinięte są tylko grupy z włączoną warstwą (LayersPanel).
export const DEFAULT_EXPANDED_GROUPS = Object.freeze([]);
const OVERLAY_GROUP_ORDER_ALL = ['Działki i grunty','Planowanie przestrzenne','Uzbrojenie terenu','Energetyka','Środowisko i wody','Uciążliwości','Dziedzictwo','Geologia i górnictwo','Rzeźba i wysokości','Dane pomocnicze','Archiwum'];

rawDataCatalog.catalogVersion = 15;
for (const layer of rawDataCatalog.layers) {
    if (['Granice i działki','Grunty'].includes(layer.group)) layer.group = 'Działki i grunty';
    if (['Budynki','Dane referencyjne'].includes(layer.group)) layer.group = 'Dane pomocnicze';
    if (layer.group === 'Środowisko') layer.group = 'Środowisko i wody';
    if (layer.group === 'Infrastruktura') layer.group = 'Energetyka';
    if (layer.id === 'overlay.mpzp') { layer.title = 'MPZP — rysunek planu (integracja)'; layer.description = 'Rysunek planu z usług gmin. Bieżący status i obszary sprawdzisz w warstwach MPZP Rejestru Urbanistycznego.'; }
    if (['overlay.natura2000','overlay.gdos.protection'].includes(layer.id)) { layer.group = 'Dane pomocnicze'; layer.title += ' — zestaw zbiorczy'; }
}
for (const [key, profile] of Object.entries(sourceProfiles)) {
    // 19.23.0: profil ukryty (usługa bez danych) zostaje dla proxy i monitora, ale nie trafia do panelu Warstwy.
    if (profile.hidden === true) continue;
    // 19.47.0: profil tylko do identyfikacji (np. pog_draft: akt + strefy w jednym zapytaniu; na mapie osobno).
    if (profile.map_layer === false) continue;
    let layer = rawDataCatalog.layers.find(item => item.source.url === './api/wms.php?source=' + key);
    // 19.47.0: jedna zasada drogi zapytań — przez serwer pośredniczący (pamięć podręczna), przeglądarka awaryjnie.
    // 19.50.0: `client_transport` w profilu (ekoportal GIOŚ: tylko serwer — przeglądarka dostaje odpowiedź blokowaną przez ORB).
    // 19.50.0: wyjątek — GDOŚ (zapora Incapsula odrzuca serwery, 403): najpierw przeglądarka, potem serwer,
    // który przy odmowie GDOŚ rysuje te same formy ochrony z danych EEA (api/_eea_protected.php).
    // Warstwy planistyczne (napisy uchwał, symbole stref) jako jeden obraz na widok: bez ucinania napisów na
    // krawędziach kafli, bez powtarzania symbolu strefy na każdym kaflu, jedno zapytanie zamiast kilkunastu.
    const planning = profile.group === 'Planowanie przestrzenne';
    // 19.50.0: `single_image` — jeden obraz na widok także poza planowaniem (hipsometria NMT: kafel 6–27 s, cały widok ok. 6 s).
    const single = planning || profile.single_image === true;
    const source = { kind:'wms', url:'./api/wms.php?source='+key, directUrl:profile.url, transport: profile.client_transport ?? (key.startsWith('gdos_') ? 'direct-then-proxy' : 'proxy-then-direct'), layers:profile.layers, version:profile.version, format:profile.format, transparent:profile.transparent, tiled: !single && !key.startsWith('kiut_') && key !== 'egib_classes', ...(single ? { ratio: 1.2 } : {}), tileSize:512, preload:0, transition:0, ...(single ? {} : { gutter: 64 }), directTimeoutMs: key.startsWith('gdos_') ? 6000 : 8000, proxyTimeoutMs: profile.client_timeout_ms ?? 12000, ...(profile.projection ? {projection:profile.projection} : {}) };
    if (!layer) {
        layer = { id:profile.layer_id, role:'overlay', visible:false, opacity:0.65, capabilities:{ identify:profile.identify !== false, selectable:false, editable:false } };
        rawDataCatalog.layers.push(layer);
    }
    Object.assign(layer, { title:profile.title, group:profile.group, description:profile.description, minZoom:profile.min_zoom, zIndex:profile.z_index, attribution:{ label:profile.provider, url:profile.provider_url }, source });
    // 19.18.0: zakres skal od góry (np. zasięg mapy glebowej rysuje się tylko w małych skalach)
    // i domyślne krycie warstw nieprzezroczystych (hipsometria NMT jako JPEG).
    if (Number.isFinite(profile.max_zoom)) layer.maxZoom = profile.max_zoom;
    if (Number.isFinite(profile.opacity)) layer.opacity = profile.opacity;
}
// Put the priority class map first within Grunty; drawing order is still explicit zIndex.

export const dataCatalog = validateDataCatalog(rawDataCatalog);
// 19.29.0: kolejność tylko istniejących grup — po ukryciu mapy wysokości (19.23) grupa „Rzeźba i wysokości” była pusta.
export const OVERLAY_GROUP_ORDER = Object.freeze(OVERLAY_GROUP_ORDER_ALL.filter((group) => dataCatalog.layers.some((layer) => layer.role === 'overlay' && layer.group === group)));
