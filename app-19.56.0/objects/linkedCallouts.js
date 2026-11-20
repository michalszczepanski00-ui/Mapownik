/** Łączenie etykiet: kotwica zachowuje przesunięcie względem środka celu. Koniec opisu pozostaje na miejscu. */
export function geometryCenter(geometry) {
    const points = geometry.type === 'Point' ? [geometry.coordinates] : geometry.type === 'LineString' ? geometry.coordinates
        : geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x,y] of points) { minX = Math.min(minX,x); minY = Math.min(minY,y); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y); }
    return [(minX+maxX)/2, (minY+maxY)/2];
}
export function followCallout(object, target) {
    if (object.kind !== 'callout' || object.geometry.type !== 'LineString' || !target) return null;
    const before = object.properties?.targetCenter2180;
    if (!before) return null;
    const center = geometryCenter(target.geometry), dx = center[0] - before[0], dy = center[1] - before[1];
    if (Math.abs(dx) + Math.abs(dy) < 1e-8) return null;
    const coordinates = object.geometry.coordinates.map((point,i) => i === 0 ? [point[0]+dx,point[1]+dy] : [...point]);
    return { ...object, geometry: { type:'LineString', coordinates }, properties: { ...object.properties, targetCenter2180: center }, updatedAt: new Date().toISOString() };
}
