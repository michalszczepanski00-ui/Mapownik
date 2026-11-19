/**
 * 19.0.0: miary geometrii obiektu w układzie projektu (EPSG:2180, metry).
 *
 * Wcześniej pole i obwód istniały tylko w trakcie rysowania (SketchMetrics) oraz dla
 * obiektów z pomiaru, więc zaznaczony narysowany „Poligon 1" nie mówił nic o swojej
 * wielkości. Czyste funkcje, bez OpenLayers — wspólne dla szkicu i zaznaczonego obiektu,
 * dzięki czemu obie wartości są liczone tak samo.
 */

/** Długość łamanej [m]. */
export function lineLength(coordinates) {
    let total = 0;
    for (let i = 1; i < coordinates.length; i += 1) {
        const [x1, y1] = coordinates[i - 1];
        const [x2, y2] = coordinates[i];
        total += Math.hypot(x2 - x1, y2 - y1);
    }
    return total;
}

/** Pole pierścienia [m²] (wzór sznurowadłowy); pierścień zamknięty lub nie. */
export function ringArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length; i += 1) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
}

function polygonMeasures(rings) {
    if (!Array.isArray(rings) || !rings.length)
        return { areaM2: 0, perimeterM: 0 };
    const [outer, ...holes] = rings;
    const areaM2 = Math.max(0, ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0));
    const perimeterM = rings.reduce((sum, ring) => sum + lineLength(ring), 0);
    return { areaM2, perimeterM };
}

/**
 * Miary geometrii GeoJSON w EPSG:2180.
 * Zwraca `{ type: 'line', lengthM }`, `{ type: 'polygon', areaM2, perimeterM }`
 * albo null dla punktów i geometrii nieobsługiwanych.
 */
export function measureGeometry(geometry) {
    switch (geometry?.type) {
        case 'LineString':
            return { type: 'line', lengthM: lineLength(geometry.coordinates) };
        case 'MultiLineString':
            return { type: 'line', lengthM: geometry.coordinates.reduce((sum, line) => sum + lineLength(line), 0) };
        case 'Polygon':
            return { type: 'polygon', ...polygonMeasures(geometry.coordinates) };
        case 'MultiPolygon': {
            let areaM2 = 0;
            let perimeterM = 0;
            for (const rings of geometry.coordinates) {
                const part = polygonMeasures(rings);
                areaM2 += part.areaM2;
                perimeterM += part.perimeterM;
            }
            return { type: 'polygon', areaM2, perimeterM };
        }
        default:
            return null;
    }
}
