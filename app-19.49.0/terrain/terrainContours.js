import { insidePolygon } from './terrainSurface.js';

function niceStep(value) {
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(0.001, value)));
    const ratio = value / magnitude;
    return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * magnitude;
}

/** Clip segments against outer rings and holes, including subpixel holes. */
export function clipContourSegment(a, b, rings) {
    const ts = [0, 1], dx = b[0] - a[0], dy = b[1] - a[1];
    for (const ring of rings) for (let i = 1; i < ring.length; i++) {
        const c = ring[i - 1], d = ring[i];
        if (Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.min(c[0], d[0]) > Math.max(a[0], b[0])
            || Math.max(c[1], d[1]) < Math.min(a[1], b[1]) || Math.min(c[1], d[1]) > Math.max(a[1], b[1])) continue;
        const ex = d[0] - c[0], ey = d[1] - c[1], denominator = dx * ey - dy * ex;
        if (Math.abs(denominator) < 1e-12) continue;
        const cx = c[0] - a[0], cy = c[1] - a[1];
        const t = (cx * ey - cy * ex) / denominator, u = (cx * dy - cy * dx) / denominator;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    const at = (t) => [a[0] + t * dx, a[1] + t * dy], segments = [];
    for (let i = 1; i < ts.length; i++) {
        if (ts[i] - ts[i - 1] < 1e-10) continue;
        if (insidePolygon(at((ts[i] + ts[i - 1]) / 2), rings)) segments.push([at(ts[i - 1]), at(ts[i])]);
    }
    return segments;
}

function joinSegments(segments, elevation) {
    const key = (point) => point.map((n) => n.toFixed(6)).join(':');
    const links = new Map();
    for (let i = 0; i < segments.length; i++) for (const point of segments[i]) {
        const k = key(point); if (!links.has(k)) links.set(k, []); links.get(k).push(i);
    }
    const visited = new Set(), lines = [];
    const follow = (index, start) => {
        const coordinates = [start];
        while (!visited.has(index)) {
            visited.add(index);
            const segment = segments[index], end = key(segment[0]) === key(coordinates.at(-1)) ? segment[1] : segment[0];
            coordinates.push(end);
            const next = (links.get(key(end)) ?? []).find((i) => !visited.has(i));
            if (next === undefined) break;
            index = next;
        }
        if (coordinates.length > 1) lines.push({ elevation, coordinates });
    };
    // Open paths first, then closed loops.
    for (let i = 0; i < segments.length; i++) for (const point of segments[i]) {
        if (!visited.has(i) && links.get(key(point)).length !== 2) follow(i, point);
    }
    for (let i = 0; i < segments.length; i++) if (!visited.has(i)) follow(i, segments[i][0]);
    return lines;
}

export function buildContours(tiles, requestedInterval = 'auto', maxSegments = 24000) {
    let min = Infinity, max = -Infinity;
    for (const tile of tiles) for (const value of tile.values) if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); }
    if (!Number.isFinite(min) || max - min < 1e-5) return { lines: [], interval: null, adjusted: false };
    const requested = Number(requestedInterval);
    const base = requestedInterval === 'auto' || !Number.isFinite(requested) || requested <= 0 ? niceStep((max - min) / 12) : requested;
    let interval = Math.max(base, niceStep((max - min) / 48));
    for (let pass = 0; pass < 8; pass++, interval *= 2) {
        const lines = []; let count = 0, overflow = false;
        for (const tile of tiles) {
            const { width, height, values, extent, rings } = tile;
            const sx = (extent[2] - extent[0]) / width, sy = (extent[3] - extent[1]) / height;
            for (let levelIndex = Math.ceil(min / interval); levelIndex <= Math.floor(max / interval); levelIndex++) {
                const elevation = levelIndex * interval, segments = [];
                cells: for (let row = 0; row < height - 1; row++) for (let col = 0; col < width - 1; col++) {
                    const i = row * width + col, z = [values[i], values[i + 1], values[i + width + 1], values[i + width]];
                    if (!z.every(Number.isFinite)) continue;
                    const bits = z.map((v) => v >= elevation), mask = bits.reduce((s, bit, j) => s + (bit ? 1 << j : 0), 0);
                    if (mask === 0 || mask === 15) continue;
                    const corners = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]], crossings = new Map();
                    for (let edge = 0; edge < 4; edge++) {
                        const next = (edge + 1) % 4;
                        if (bits[edge] === bits[next]) continue;
                        const f = (elevation - z[edge]) / (z[next] - z[edge]);
                        crossings.set(edge, [extent[0] + (corners[edge][0] + 0.5 + f * (corners[next][0] - corners[edge][0])) * sx,
                            extent[3] - (corners[edge][1] + 0.5 + f * (corners[next][1] - corners[edge][1])) * sy]);
                    }
                    let pairs;
                    if (crossings.size === 2) pairs = [[...crossings.keys()]];
                    else {
                        const centreAbove = z.reduce((s, n) => s + n, 0) / 4 >= elevation;
                        pairs = (mask === 5) === centreAbove ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
                    }
                    for (const [a, b] of pairs) {
                        const clipped = clipContourSegment(crossings.get(a), crossings.get(b), rings);
                        for (const segment of clipped) if (Math.hypot(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1]) > 1e-8) {
                            segments.push(segment); count++;
                        }
                    }
                    if (count > maxSegments) { overflow = true; break cells; }
                }
                if (overflow) break;
                lines.push(...joinSegments(segments, elevation));
                if (lines.length > 2000) { overflow = true; break; }
            }
            if (overflow) break;
        }
        if (!overflow) return { lines, interval, adjusted: interval > base * 1.001 };
    }
    return { lines: [], interval, adjusted: true };
}
