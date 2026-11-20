/** Streaming extent: no argument spreading or additional array of all vertices. */
export function extendCoordinates(extent, coordinates) {
    if (!Array.isArray(coordinates)) return extent;
    if (coordinates.length >= 2 && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
        extent[0] = Math.min(extent[0], coordinates[0]); extent[1] = Math.min(extent[1], coordinates[1]);
        extent[2] = Math.max(extent[2], coordinates[0]); extent[3] = Math.max(extent[3], coordinates[1]);
    } else for (const child of coordinates) extendCoordinates(extent, child);
    return extent;
}
export function coordinateExtent(coordinates) {
    const extent = extendCoordinates([Infinity, Infinity, -Infinity, -Infinity], coordinates);
    return extent.every(Number.isFinite) ? extent : null;
}
