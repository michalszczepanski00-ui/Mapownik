/**
 * 19.30.0 — style podkładów wektorowych OpenStreetMap (OpenFreeMap, schemat OpenMapTiles).
 *
 * Bazą jest styl „liberty” z OpenFreeMap; tu podmieniamy kolory (palety Pastel i Zmierzch), dokładamy
 * szczegóły (numery adresowe, przeznaczenie terenu) i motyw kartograficzny.
 * Wynik to zwykły obiekt stylu Mapbox/MapLibre, który ol-mapbox-style nakłada na warstwę OpenLayers.
 */
export const OPENFREEMAP_BASE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const OPENFREEMAP_ATTRIBUTION = '© OpenStreetMap · OpenMapTiles · OpenFreeMap';

const PALETTES = Object.freeze({
    pastel: {
        bg: '#f3efe7', res: '#e9e0d3', park: '#d5e8c8', wood: '#c9e0bb', grass: '#dcebd0', water: '#b9d8ea', river: '#8fbfdc',
        bld: '#ded0bf', bldLine: '#a8927a', mw: '#ee9f6a', primary: '#f5c98a', secondary: '#f9e4a5', minor: '#ffffff',
        caseMajor: '#d39a62', caseSec: '#d8b878', caseMinor: '#c8bdae', path: '#c99a89', rail: '#9d97ab',
        text: '#3b3631', textPoi: '#6a5e78', textWater: '#3f7699', halo: '#f7f4ee', houseNumber: '#7a6c5e',
        sand: '#f1e7c6', aeroway: '#e6e1da', boundary: '#9b8fa8', wetlandOpacity: 0.6,
        special: { landuse_hospital: '#f3dcdc', landuse_school: '#f0e6cc', landuse_cemetery: '#d3e2cc' },
        landuse: { commercial: '#eadbe4', retail: '#f1dbd2', industrial: '#ddd8e6', railway: '#e3dfe6' },
        iconOpacity: 0.75,
    },
    zmierzch: {
        bg: '#2b3547', res: '#36425b', park: '#2f4a43', wood: '#2b4a40', grass: '#324649', water: '#2d5878', river: '#3c6d90',
        bld: '#3f4c63', bldLine: '#5d6c88', mw: '#f2c46d', primary: '#e3b35c', secondary: '#c9a76a', minor: '#7b88a4',
        caseMajor: '#4b3b20', caseSec: '#4a4231', caseMinor: '#3b4559', path: '#66728d', rail: '#8a93a8',
        text: '#edf1f7', textPoi: '#c7d0de', textWater: '#9cc8e6', halo: '#2b3547', houseNumber: '#aab6c8',
        sand: '#46473f', aeroway: '#3a4458', boundary: '#8f9ab3', wetlandOpacity: 0.12,
        special: { landuse_hospital: '#3e3a4d', landuse_school: '#3a3f4b', landuse_cemetery: '#2f453b' },
        landuse: { commercial: '#3a3b52', retail: '#41394e', industrial: '#353f4f', railway: '#363a46' },
        iconOpacity: 0.85, roadAreaOpacity: 0.15,
    },
});

/** Napisy czcionką portalu (Inter), bez pobierania fontów z zewnętrznego serwera; nazwy po polsku. */
function useAppFonts(style) {
    for (const layer of style.layers) {
        // Styl bazowy pokazuje nazwy w zapisie łacińskim („Gdansk”, „Poland”) — bierzemy name:pl, a gdy brak, nazwę lokalną.
        const field = layer.layout?.['text-field'];
        if (field && JSON.stringify(field).includes('name:latin')) layer.layout['text-field'] = ['coalesce', ['get', 'name:pl'], ['get', 'name']];
        const fonts = layer.layout?.['text-font'];
        if (!Array.isArray(fonts)) continue;
        layer.layout['text-font'] = fonts.map((font) => /bold/i.test(font) ? 'Inter Bold' : /italic/i.test(font) ? 'Inter Italic' : 'Inter Regular');
    }
}

function applyPalette(style, c) {
    style.layers = style.layers.filter((layer) => layer.id !== 'building-3d' && layer.id !== 'natural_earth');
    const fills = { landuse_residential: c.res, park: c.park, landcover_wood: c.wood, landcover_grass: c.grass, landuse_pitch: c.grass, landuse_track: c.grass, water: c.water, landcover_sand: c.sand, aeroway_fill: c.aeroway, ...c.special };
    for (const layer of style.layers) {
        const id = layer.id;
        const paint = layer.paint = layer.paint || {};
        if (layer.type === 'background') paint['background-color'] = c.bg;
        if (layer.type === 'fill' && fills[id]) { paint['fill-color'] = fills[id]; if (paint['fill-opacity'] !== undefined) paint['fill-opacity'] = 1; }
        // Styl bazowy chowa tereny mieszkaniowe od z12 — bez nich miasto zlewa się z tłem.
        if (id === 'landuse_residential') delete layer.maxzoom;
        if (id === 'landcover_wetland') paint['fill-opacity'] = c.wetlandOpacity;
        if (layer.type === 'line' && /^boundary/.test(id)) paint['line-color'] = c.boundary;
        if (layer.type === 'line' && /^aeroway_(runway|taxiway)/.test(id)) paint['line-color'] = c.aeroway;
        if (id === 'park_outline') paint['line-color'] = c.wood;
        if (layer.type === 'line' && /^waterway/.test(id)) paint['line-color'] = c.river;
        if (id === 'building') { delete layer.maxzoom; paint['fill-color'] = c.bld; paint['fill-outline-color'] = c.bldLine; paint['fill-opacity'] = 1; }
        if (layer.type === 'line' && /_casing$/.test(id)) {
            paint['line-color'] = /motorway|trunk|primary/.test(id) ? c.caseMajor : /secondary|tertiary/.test(id) ? c.caseSec : c.caseMinor;
        } else if (layer.type === 'line' && /^(road|bridge|tunnel)_/.test(id) && !/rail|path|pedestrian/.test(id)) {
            paint['line-color'] = /motorway/.test(id) ? c.mw : /trunk_primary/.test(id) ? c.primary : /secondary_tertiary/.test(id) ? c.secondary : c.minor;
        }
        if (layer.type === 'line' && /path_pedestrian/.test(id)) { paint['line-color'] = c.path; paint['line-opacity'] = 0.7; }
        if (layer.type === 'line' && /major_rail$|transit_rail$/.test(id)) paint['line-color'] = c.rail;
        if (id === 'road_area_pattern' && c.roadAreaOpacity !== undefined) paint['fill-opacity'] = c.roadAreaOpacity;
        // Tabliczki z numerem drogi to biały znak z ciemnym napisem — zostają jak w stylu bazowym.
        if (layer.type === 'symbol' && !/shield/.test(id)) {
            paint['text-color'] = /water/.test(id) ? c.textWater : /^poi/.test(id) ? c.textPoi : c.text;
            paint['text-halo-color'] = c.halo;
            paint['text-halo-width'] = Math.max(Number(paint['text-halo-width']) || 0, 1.4);
            if (/^poi/.test(id)) paint['icon-opacity'] = c.iconOpacity;
        }
    }
}

/**
 * Więcej szczegółów: numery adresowe i przeznaczenie terenu.
 * 19.31.0: punkty usług i nazwy ulic zostają na progach stylu bazowego (główne od z15, pozostałe od z16–17).
 * Wcześniejsze progi (wszystkie od z14,5) mnożyły napisy i ikony do rozmieszczenia — przesuwanie mapy
 * blokowało przeglądarkę ok. 3 razy dłużej (pomiar: 7,3 s → 2,6 s zadań > 50 ms na tej samej trasie).
 */
function addDetail(style, c) {
    const before = style.layers.findIndex((layer) => layer.id === 'waterway_tunnel');
    style.layers.splice(before < 0 ? 1 : before, 0, {
        id: 'msportal-landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['commercial', 'industrial', 'retail', 'railway', 'garages', 'quarry'], true, false],
        paint: { 'fill-color': ['match', ['get', 'class'], 'commercial', c.landuse.commercial, 'retail', c.landuse.retail, 'industrial', c.landuse.industrial, 'railway', c.landuse.railway, 'quarry', c.landuse.industrial, c.landuse.commercial], 'fill-opacity': 0.9 },
    });
    style.layers.push({
        id: 'msportal-housenumber', type: 'symbol', source: 'openmaptiles', 'source-layer': 'housenumber', minzoom: 16,
        layout: { 'text-field': ['get', 'housenumber'], 'text-font': ['Inter Regular'], 'text-size': 9.5 },
        paint: { 'text-color': c.houseNumber, 'text-halo-color': c.halo, 'text-halo-width': 1 },
    });
}

/** Motyw kartograficzny: papier, ciemne budynki, drogi z czarną obwiednią, cieki niebieską linią. */
function applyCartographic(style) {
    // 19.32.1: bez ikon i nazw punktów usług oraz strzałek jednokierunkowych — na mapie kartograficznej przykrywały
    // warstwy portalu (napisy podkładu rysują się nad nakładkami), a do pracy z działkami nic nie wnosiły.
    style.layers = style.layers.filter((layer) => layer.id !== 'building-3d' && layer.id !== 'natural_earth' && !/^poi|one_way_arrow/.test(layer.id));
    for (const layer of style.layers) {
        const id = layer.id;
        const paint = layer.paint = layer.paint || {};
        if (layer.type === 'background') paint['background-color'] = '#f6f1e3';
        if (id === 'landuse_residential') { delete layer.maxzoom; paint['fill-color'] = '#ece0c8'; }
        if (id === 'landcover_wood') { paint['fill-color'] = '#c5dcae'; paint['fill-opacity'] = 1; }
        if (id === 'park' || id === 'landcover_grass') { paint['fill-color'] = '#dce9c4'; paint['fill-opacity'] = 1; }
        if (id === 'water') paint['fill-color'] = '#a9cfe5';
        if (layer.type === 'line' && /^waterway/.test(id)) paint['line-color'] = '#3f86bd';
        // 19.32.1: budynki jaśniejsze i coraz bardziej przejrzyste przy zbliżeniu — granice działek i plany są nad nimi czytelne.
        if (id === 'building') { delete layer.maxzoom; paint['fill-color'] = '#a39282'; paint['fill-outline-color'] = '#6f5f51'; paint['fill-opacity'] = ['interpolate', ['linear'], ['zoom'], 14, 0.9, 17, 0.55]; }
        if (layer.type === 'line' && /_casing$/.test(id)) paint['line-color'] = '#2b2522';
        else if (layer.type === 'line' && /^(road|bridge|tunnel)_/.test(id) && !/rail|path|pedestrian/.test(id)) {
            paint['line-color'] = /motorway/.test(id) ? '#d1453b' : /trunk_primary/.test(id) ? '#e0653e' : /secondary_tertiary/.test(id) ? '#f2cb52' : '#fffdf6';
        }
        if (layer.type === 'line' && /path_pedestrian/.test(id)) { paint['line-color'] = '#a3876f'; paint['line-opacity'] = 0.75; }
        if (layer.type === 'line' && /major_rail$/.test(id)) paint['line-color'] = '#2b2522';
        if (layer.type === 'symbol' && !/shield/.test(id)) {
            paint['text-color'] = /water/.test(id) ? '#2c6b9d' : '#2b2522';
            paint['text-halo-color'] = 'rgba(246,241,227,.9)';
            if (/^poi/.test(id)) paint['icon-opacity'] = 0.7;
        }
    }
}

let baseStylePromise = null;
async function loadBaseStyle(url, signal) {
    if (!baseStylePromise) {
        baseStylePromise = fetch(url, { signal, cache: 'default' }).then((response) => {
            if (!response.ok) throw new Error(`Styl mapy wektorowej: HTTP ${response.status}`);
            return response.json();
        }).catch((error) => { baseStylePromise = null; throw error; });
    }
    return baseStylePromise;
}

/** Kolor tła stylu (warstwa „background”) — OpenLayers rysuje go osobno, patrz vectorStyleAdapter. */
export function styleBackgroundColor(style) {
    return style.layers.find((layer) => layer.type === 'background')?.paint?.['background-color'] ?? null;
}

/** Gotowy styl dla wariantu: 'pastel' | 'zmierzch' | 'kartograficzny'. */
export async function buildVectorStyle(variant, { baseUrl = OPENFREEMAP_BASE_STYLE, signal } = {}) {
    const style = structuredClone(await loadBaseStyle(baseUrl, signal));
    if (variant === 'kartograficzny') applyCartographic(style);
    else {
        const palette = PALETTES[variant];
        if (!palette) throw new Error(`Nieznany wariant mapy wektorowej: ${variant}`);
        applyPalette(style, palette);
        addDetail(style, palette);
    }
    useAppFonts(style);
    return style;
}
