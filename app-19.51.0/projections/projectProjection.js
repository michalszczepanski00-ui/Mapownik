import proj4 from 'proj4';
import { get as getProjection, transform as transformCoordinate } from 'ol/proj.js';
import { register } from 'ol/proj/proj4.js';
export const PROJECT_PROJECTION = 'EPSG:2180';
export const VIEW_PROJECTION = 'EPSG:3857';
export const EPSG_2180_DEFINITION = '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 '
    + '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs';
const PROJECT_EXTENT = [
    144693.28,
    125837.02,
    876500.36,
    908411.19,
];
const PROJECT_WORLD_EXTENT = [
    14.14,
    49.0,
    24.15,
    55.93,
];
let registered = false;
/**
 * Układy, których msportal faktycznie używa. Tylko one trafiają do OpenLayers.
 */
const USED_PROJECTIONS = Object.freeze([PROJECT_PROJECTION, VIEW_PROJECTION, 'EPSG:4326']);

/**
 * 17.8.11: proj4 2.22 ma wbudowanych 130 definicji (m.in. wszystkie strefy
 * UTM), a `register(proj4)` z OpenLayers tworzy transformację dla KAŻDEJ pary
 * — ok. 16 800 obiektów proj4 przy starcie aplikacji (kilkaset ms na zwykłym
 * laptopie, plus sprzątanie pamięci). Aplikacja używa trzech układów, więc
 * OpenLayers dostaje widok proj4 ograniczony do nich: te same funkcje
 * i definicje, tylko bez zbędnych par.
 */
function proj4Subset(codes) {
    const subset = (from, to) => proj4(from, to);
    const defs = (code, definition) => (definition === undefined ? proj4.defs(code) : proj4.defs(code, definition));
    for (const code of codes) {
        if (proj4.defs[code]) defs[code] = proj4.defs[code];
    }
    subset.defs = defs;
    return subset;
}
/**
 * Registers Poland's ETRF2000-PL / CS92 once for OpenLayers + Proj4js.
 *
 * The map viewport remains EPSG:3857, while project/analysis geometry is stored
 * in EPSG:2180 so metric operations (buffers, lengths, areas) are performed in
 * a projected CRS intended for Poland.
 */
export function ensureProjectProjectionRegistered() {
    if (registered)
        return;
    proj4.defs(PROJECT_PROJECTION, EPSG_2180_DEFINITION);
    register(proj4Subset(USED_PROJECTIONS));
    const projection = getProjection(PROJECT_PROJECTION);
    projection === null || projection === void 0 ? void 0 : projection.setExtent(PROJECT_EXTENT);
    projection === null || projection === void 0 ? void 0 : projection.setWorldExtent(PROJECT_WORLD_EXTENT);
    registered = true;
}
export function projectToViewCoordinate(coordinate) {
    ensureProjectProjectionRegistered();
    return transformCoordinate(coordinate, PROJECT_PROJECTION, VIEW_PROJECTION);
}
export function viewToProjectCoordinate(coordinate) {
    ensureProjectProjectionRegistered();
    return transformCoordinate(coordinate, VIEW_PROJECTION, PROJECT_PROJECTION);
}
