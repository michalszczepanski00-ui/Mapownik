function ringArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length; i += 1) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
}
function polygonArea(rings) {
    if (!rings?.length) return 0;
    const outer = ringArea(rings[0]);
    const holes = rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0);
    return Math.max(0, outer - holes);
}
export function geometryArea(geometry) {
    if (geometry?.type === 'Polygon') return polygonArea(geometry.coordinates);
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
    return null;
}
function ringCentroid(ring) {
    let twiceArea = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
        const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
        const cross = x1 * y2 - x2 * y1;
        twiceArea += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }
    if (Math.abs(twiceArea) < 1e-8) return null;
    return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea), area: Math.abs(twiceArea) / 2 };
}
export function parcelCentroid(geometry) {
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.coordinates ?? [];
    let sum = 0, x = 0, y = 0;
    for (const rings of polygons) {
        rings.forEach((ring, index) => {
            const centroid = ringCentroid(ring);
            if (!centroid) return;
            const weight = index === 0 ? centroid.area : -centroid.area;
            x += centroid.x * weight;
            y += centroid.y * weight;
            sum += weight;
        });
    }
    return sum > 0 ? [x / sum, y / sum] : null;
}
