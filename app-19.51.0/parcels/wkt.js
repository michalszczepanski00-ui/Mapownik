import { t } from '../i18n/index.js';
function stripSrid(wkt) {
    return String(wkt !== null && wkt !== void 0 ? wkt : '').trim().replace(/^SRID\s*=\s*\d+\s*;\s*/i, '');
}
function stripOuterPair(text) {
    const value = text.trim();
    if (!value.startsWith('(') || !value.endsWith(')')) {
        throw new Error(t('parcels.nieprawidlowaGeometriaWktDzialki'));
    }
    let depth = 0;
    for (let i = 0; i < value.length; i += 1) {
        const char = value[i];
        if (char === '(')
            depth += 1;
        else if (char === ')')
            depth -= 1;
        if (depth === 0 && i < value.length - 1) {
            throw new Error(t('parcels.nieprawidloweNawiasyGeometriiWkt'));
        }
        if (depth < 0)
            throw new Error(t('parcels.nieprawidloweNawiasyGeometriiWkt'));
    }
    if (depth !== 0)
        throw new Error(t('parcels.nieprawidloweNawiasyGeometriiWkt'));
    return value.slice(1, -1).trim();
}
function splitTopLevel(text) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === '(')
            depth += 1;
        else if (char === ')')
            depth -= 1;
        else if (char === ',' && depth === 0) {
            parts.push(text.slice(start, i).trim());
            start = i + 1;
        }
        if (depth < 0)
            throw new Error(t('parcels.nieprawidloweNawiasyGeometriiWkt'));
    }
    if (depth !== 0)
        throw new Error(t('parcels.nieprawidloweNawiasyGeometriiWkt'));
    parts.push(text.slice(start).trim());
    return parts.filter(Boolean);
}
function coordinatePair(token) {
    const values = token.trim().split(/\s+/).map(Number);
    if (values.length < 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) {
        throw new Error(t('parcels.nieprawidlowaWspolrzednaWGeometriiDzialk'));
    }
    return [values[0], values[1]];
}
function parseRing(text) {
    const points = splitTopLevel(stripOuterPair(text)).map(coordinatePair);
    if (points.length < 3)
        throw new Error(t('parcels.granicaDzialkiZawieraZbytMalo'));
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1])
        points.push([...first]);
    if (points.length < 4)
        throw new Error(t('parcels.nieprawidlowyPierscienGranicyDzialki'));
    return points;
}
function parsePolygonBody(text) {
    const rings = splitTopLevel(stripOuterPair(text)).map(parseRing);
    if (!rings.length)
        throw new Error(t('parcels.dzialkaNieZawieraGeometriiPowierzchniowe'));
    return rings;
}
/** Parse ULDK POLYGON/MULTIPOLYGON WKT into msportal canonical EPSG:2180 geometry. */
export function parseParcelWkt(wkt) {
    const value = stripSrid(wkt);
    const match = /^(POLYGON|MULTIPOLYGON)(?:\s+ZM|\s+Z|\s+M)?\s*(\(.+\))$/is.exec(value);
    if (!match)
        throw new Error(t('parcels.uldkZwrocilNieobslugiwanyTypGeometrii'));
    const type = match[1].toUpperCase();
    const body = match[2];
    if (type === 'POLYGON') {
        return { type: 'Polygon', coordinates: parsePolygonBody(body) };
    }
    const polygons = splitTopLevel(stripOuterPair(body)).map(parsePolygonBody);
    if (!polygons.length)
        throw new Error(t('parcels.dzialkaNieZawieraGeometriiPowierzchniowe'));
    return { type: 'MultiPolygon', coordinates: polygons };
}
