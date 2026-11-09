/**
 * 19.40.0 — geometria terenu do raportu PDF (EPSG:2180, metry):
 *   - teren złożony z kilku działek (MultiPolygon z wielokątów wszystkich działek);
 *   - wymiary prostokąta opisanego o najmniejszym polu, najmniejsza szerokość, wydłużenie, zwartość;
 *   - największy prostokąt wpisany (w osiach prostokąta opisanego) — czy zmieści się układ technologiczny.
 * Bez bibliotek: otoczka wypukła, obracające się suwmiarki, siatka i największy prostokąt w macierzy.
 */

export const polygonsOf = (geometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates);

function ringArea(ring) {
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return s / 2;
}

/** Czy punkt leży w geometrii (z otworami). */
export function insideGeometry(geometry, [x, y]) {
    for (const poly of polygonsOf(geometry)) {
        let inOuter = false;
        poly.forEach((ring, idx) => {
            let hit = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
                if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
            }
            if (idx === 0) inOuter = hit; else if (hit) inOuter = false;
        });
        if (inOuter) return true;
    }
    return false;
}

/** Teren inwestycji z kilku działek: geometria, powierzchnia, środek (ważony powierzchnią). */
export function mergeParcelGeometries(items) {
    const coordinates = [];
    let area = 0; let cx = 0; let cy = 0;
    for (const { geometry, areaM2, center } of items) {
        coordinates.push(...polygonsOf(geometry));
        area += areaM2; cx += center[0] * areaM2; cy += center[1] * areaM2;
    }
    const geometry = coordinates.length === 1 ? { type: 'Polygon', coordinates: coordinates[0] } : { type: 'MultiPolygon', coordinates };
    let center = area ? [cx / area, cy / area] : items[0].center;
    // Środek ważony może wypaść poza teren (działki w kształcie litery L) — wtedy środek największej działki.
    if (!insideGeometry(geometry, center)) center = [...items.reduce((a, b) => (b.areaM2 > a.areaM2 ? b : a)).center];
    return { geometry, areaM2: area, center };
}

function convexHull(points) {
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = []; const upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
    for (let i = pts.length - 1; i >= 0; i -= 1) { const p = pts[i]; while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Największy prostokąt z jedynek w macierzy (wiersze × kolumny) — metoda histogramu. */
function maximalRectangle(grid, rows, cols) {
    const heights = new Array(cols).fill(0);
    let best = { area: 0, r0: 0, r1: 0, c0: 0, c1: 0 };
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) heights[c] = grid[r * cols + c] ? heights[c] + 1 : 0;
        const stack = [];
        for (let c = 0; c <= cols; c += 1) {
            const h = c === cols ? 0 : heights[c];
            let start = c;
            while (stack.length && stack.at(-1)[1] >= h) {
                const [s, sh] = stack.pop();
                const area = sh * (c - s);
                if (area > best.area) best = { area, r0: r - sh + 1, r1: r, c0: s, c1: c - 1 };
                start = s;
            }
            stack.push([start, h]);
        }
    }
    return best;
}

/**
 * Wymiary i kształt. Zwraca { length, width, minWidth, azimuth, elongation, compactness|null, perimeter|null,
 * rect: { a, b, area, corners } } — długości w m, azymut dłuższego boku 0–180°.
 */
export function shapeMetrics(geometry, areaM2, { single = true } = {}) {
    const polys = polygonsOf(geometry);
    const pts = polys.flatMap((p) => p[0]);
    const hull = convexHull(pts);
    if (hull.length < 3) return null;
    let bestRect = null; let minWidth = Infinity;
    for (let i = 0; i < hull.length; i += 1) {
        const [ax, ay] = hull[i]; const [bx, by] = hull[(i + 1) % hull.length];
        const len = Math.hypot(bx - ax, by - ay); if (len < 1e-6) continue;
        const ux = (bx - ax) / len; const uy = (by - ay) / len;
        let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
        for (const [px, py] of hull) {
            const u = (px - ax) * ux + (py - ay) * uy; const v = -(px - ax) * uy + (py - ay) * ux;
            minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
        }
        const w = maxV - minV; const l = maxU - minU;
        minWidth = Math.min(minWidth, w);
        if (!bestRect || l * w < bestRect.area) bestRect = { area: l * w, ux, uy, ox: ax, oy: ay, minU, maxU, minV, maxV };
    }
    const { ux, uy, ox, oy, minU, maxU, minV, maxV } = bestRect;
    let L = maxU - minU; let W = maxV - minV;
    // Oś dłuższego boku.
    const longAlongU = L >= W;
    const dirX = longAlongU ? ux : -uy; const dirY = longAlongU ? uy : ux;
    const azimuth = ((Math.atan2(dirX, dirY) * 180) / Math.PI + 360) % 180;
    if (!longAlongU) [L, W] = [W, L];

    // Największy prostokąt wpisany na siatce w układzie prostokąta opisanego.
    const span = Math.max(maxU - minU, maxV - minV);
    const cell = Math.max(0.5, span / 220);
    const cols = Math.max(1, Math.ceil((maxU - minU) / cell)); const rows = Math.max(1, Math.ceil((maxV - minV) / cell));
    const grid = new Uint8Array(rows * cols);
    const toXY = (u, v) => [ox + u * ux - v * uy, oy + u * uy + v * ux];
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
        // Komórka liczy się, gdy jej środek i cztery narożniki leżą w terenie.
        const u0 = minU + c * cell; const v0 = minV + r * cell;
        const ok = [[0.5, 0.5], [0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98]].every(([a, b]) => insideGeometry(geometry, toXY(u0 + a * cell, v0 + b * cell)));
        grid[r * cols + c] = ok ? 1 : 0;
    }
    const best = maximalRectangle(grid, rows, cols);
    let rect = null;
    if (best.area > 0) {
        const u0 = minU + best.c0 * cell; const u1 = minU + (best.c1 + 1) * cell;
        const v0 = minV + best.r0 * cell; const v1 = minV + (best.r1 + 1) * cell;
        const a = Math.max(u1 - u0, v1 - v0); const b = Math.min(u1 - u0, v1 - v0);
        rect = { a, b, area: (u1 - u0) * (v1 - v0), corners: [toXY(u0, v0), toXY(u1, v0), toXY(u1, v1), toXY(u0, v1), toXY(u0, v0)], cell };
    }
    let perimeter = null; let compactness = null;
    if (single) {
        perimeter = polys.reduce((sum, p) => sum + p.reduce((s, ring) => s + ring.slice(1).reduce((acc, pt, i) => acc + Math.hypot(pt[0] - ring[i][0], pt[1] - ring[i][1]), 0), 0), 0);
        compactness = perimeter ? (4 * Math.PI * areaM2) / (perimeter * perimeter) : null;
    }
    return { length: L, width: W, minWidth, azimuth, elongation: W ? L / W : null, compactness, perimeter, rect, hullArea: Math.abs(ringArea([...hull, hull[0]])) };
}
