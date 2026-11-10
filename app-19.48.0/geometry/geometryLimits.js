// Explicit work limits: no silent simplification or discarded features.
export const MAX_OBJECT_VERTICES = 20000;
export const MAX_TRANSFER_VERTICES = 100000;
export const MAX_TRANSFER_OBJECTS = 5000;
export const GEOMETRY_LIMIT_MESSAGE = 'Geometria jest zbyt złożona. Podziel dane na mniejsze pliki lub uprość geometrię w programie GIS.';
export function countGeometryVertices(geometry, limit = MAX_OBJECT_VERTICES) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return 0;
    const pending = [geometry.coordinates];
    let count = 0, visited = 0;
    while (pending.length) {
        const item = pending.pop();
        if (!Array.isArray(item)) continue;
        if (++visited > limit * 4) throw new Error(GEOMETRY_LIMIT_MESSAGE);
        if (item.length >= 2 && typeof item[0] === 'number') {
            if (++count > limit) throw new Error(GEOMETRY_LIMIT_MESSAGE);
        } else {
            // Bound stack allocation before expanding a hostile coordinate tree.
            if (pending.length + item.length > limit * 4) throw new Error(GEOMETRY_LIMIT_MESSAGE);
            for (const child of item) pending.push(child);
        }
    }
    return count;
}
export function assertTransferGeometryLimits(items) {
    if (items.length > MAX_TRANSFER_OBJECTS) throw new Error(`Plik zawiera ponad ${MAX_TRANSFER_OBJECTS} obiektów. Podziel dane na mniejsze pliki.`);
    let total = 0;
    for (const item of items) {
        total += countGeometryVertices(item?.geometry);
        if (total > MAX_TRANSFER_VERTICES) throw new Error(GEOMETRY_LIMIT_MESSAGE);
    }
}
