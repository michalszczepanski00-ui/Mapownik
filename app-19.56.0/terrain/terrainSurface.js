/** Pure metric interpolation, shared by the worker and numerical tests. */
export function insideRing([x, y], ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j], [bx, by] = ring[i];
        const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
        if (Math.abs(cross) < 1e-6 && x >= Math.min(ax, bx) - 1e-6 && x <= Math.max(ax, bx) + 1e-6
            && y >= Math.min(ay, by) - 1e-6 && y <= Math.max(ay, by) + 1e-6) return true;
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
}
export function insidePolygon(point, rings) {
    return rings.length > 0 && insideRing(point, rings[0]) && !rings.slice(1).some((ring) => insideRing(point, ring));
}
function extentOf(rings) {
    const extent = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings) for (const [x, y] of ring) {
        extent[0] = Math.min(extent[0], x); extent[1] = Math.min(extent[1], y);
        extent[2] = Math.max(extent[2], x); extent[3] = Math.max(extent[3], y);
    }
    return extent;
}

export function createInterpolator(points, spacing) {
    const cell = Math.max(0.1, spacing);
    const buckets = new Map();
    for (const point of points) {
        const [x, y] = point.coordinate2180;
        const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(point);
    }
    const radiusSq = (cell * 2.5) ** 2;
    return (x, y) => {
        const bx = Math.floor(x / cell), by = Math.floor(y / cell);
        const nearest = [];
        let missingDistance = Infinity;
        for (let iy = by - 3; iy <= by + 3; iy++) for (let ix = bx - 3; ix <= bx + 3; ix++) {
            for (const point of buckets.get(`${ix}:${iy}`) ?? []) {
                const d = (x - point.coordinate2180[0]) ** 2 + (y - point.coordinate2180[1]) ** 2;
                if (d > radiusSq) continue;
                if (!Number.isFinite(point.elevation)) { missingDistance = Math.min(missingDistance, d); continue; }
                if (d < 1e-10) return point.elevation;
                let index = nearest.findIndex((candidate) => d < candidate.d);
                if (index < 0) index = nearest.length;
                if (index < 12) { nearest.splice(index, 0, { d, h: point.elevation }); if (nearest.length > 12) nearest.pop(); }
            }
        }
        if (nearest.length < 3 || (missingDistance < nearest[0].d && missingDistance < (cell * 0.65) ** 2)) return NaN;
        let sum = 0, weight = 0;
        for (const neighbor of nearest) { const w = 1 / neighbor.d; sum += neighbor.h * w; weight += w; }
        return sum / weight;
    };
}

function shadingField(values, width, height) {
    // Smooth only the derivative field: IDW sample ripples must not look like
    // real small hills. Keep original values for readout, colours and NoData.
    // 18.18.0: okno wygładzania jest zawsze symetryczne — przy krawędzi działki
    // i przy lukach w danych promień maleje zamiast przesuwać okno w jedną stronę.
    // Wcześniej jednostronne okno zaniżało spadek przy granicy (płaszczyzna 12%
    // dawała średnio ~10%), a dla wąskich działek błąd dotyczył większości powierzchni.
    const kernel = [1, 4, 7, 10, 12, 10, 7, 4, 1];
    const smoothLine = (get, length, out, set) => {
        for (let p = 0; p < length; p++) {
            const center = get(p);
            if (!Number.isFinite(center)) continue;
            let radius = Math.min(4, p, length - 1 - p);
            while (radius > 0) {
                let ok = true;
                for (let k = 1; k <= radius && ok; k++) ok = Number.isFinite(get(p - k)) && Number.isFinite(get(p + k));
                if (ok) break;
                radius -= 1;
            }
            let sum = center * kernel[4], weight = kernel[4];
            for (let k = 1; k <= radius; k++) { sum += (get(p - k) + get(p + k)) * kernel[4 + k]; weight += 2 * kernel[4 + k]; }
            set(p, sum / weight);
        }
    };
    const horizontal = new Float32Array(values.length).fill(NaN);
    const result = new Float32Array(values.length).fill(NaN);
    for (let row = 0; row < height; row++) {
        const base = row * width;
        smoothLine((col) => values[base + col], width, horizontal, (col, value) => { horizontal[base + col] = value; });
    }
    for (let col = 0; col < width; col++) {
        smoothLine((row) => horizontal[row * width + col], height, result, (row, value) => { result[row * width + col] = value; });
    }
    return result;
}

// 18.18.0: pięć klas nachylenia — dodana klasa ≥ 15% (granica typowa przy ocenie
// terenu pod farmy PV, magazyny energii i zabudowę techniczną).
export const SLOPE_BREAKS = Object.freeze([2, 5, 10, 15]);
export const SLOPE_COLORS = Object.freeze([[255, 247, 188], [254, 196, 79], [254, 153, 41], [236, 112, 20], [204, 76, 2]]);
export function slopeClass(value) {
    let index = 0;
    while (index < SLOPE_BREAKS.length && value >= SLOPE_BREAKS[index]) index += 1;
    return index;
}

/** Powierzchnia jednej komórki siatki powierzchni (m²) — siatka w EPSG:2180, metry. */
function cellArea(tile) {
    const [minX, minY, maxX, maxY] = tile.extent;
    return ((maxX - minX) / tile.width) * ((maxY - minY) / tile.height);
}

/**
 * 18.18.0 — spadki terenu na działce: udział powierzchni w klasach nachylenia,
 * średni (ważony powierzchnią) i 95. percentyl spadku. Liczone z tej samej
 * siatki, z której powstaje mapa nachyleń (interpolacja NMT, wygładzony gradient).
 */
export function slopeSummary(tiles) {
    const classes = SLOPE_COLORS.map(() => 0);
    const samples = [];
    let total = 0, weighted = 0;
    for (const tile of tiles) {
        const area = cellArea(tile);
        for (let i = 0; i < tile.slopes.length; i++) {
            const slope = tile.slopes[i];
            if (!Number.isFinite(slope)) continue;
            classes[slopeClass(slope)] += area;
            total += area; weighted += slope * area;
            samples.push(slope);
        }
    }
    if (!total) return null;
    samples.sort((a, b) => a - b);
    return {
        totalSqm: total,
        meanSlopePercent: weighted / total,
        p95SlopePercent: samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))],
        classes: classes.map((areaSqm) => ({ areaSqm, share: areaSqm / total })),
    };
}

/** Średnia wysokość terenu ważona powierzchnią — poziom, przy którym wykop = nasyp. */
export function balancedLevel(tiles) {
    let total = 0, sum = 0;
    for (const tile of tiles) {
        const area = cellArea(tile);
        for (const value of tile.values) if (Number.isFinite(value)) { total += area; sum += value * area; }
    }
    return total ? sum / total : null;
}

/**
 * 18.18.0 — roboty ziemne do poziomej platformy na wysokości `level` (m n.p.m.):
 * wykop = teren powyżej poziomu, nasyp = teren poniżej. Szacunek orientacyjny
 * (bez skarp, spulchnienia i warstwy humusu).
 */
export function earthworks(tiles, level) {
    if (!Number.isFinite(level)) return null;
    let cut = 0, fill = 0, total = 0, cutArea = 0, fillArea = 0;
    for (const tile of tiles) {
        const area = cellArea(tile);
        for (const value of tile.values) {
            if (!Number.isFinite(value)) continue;
            total += area;
            const dz = value - level;
            if (dz > 0) { cut += dz * area; cutArea += area; } else if (dz < 0) { fill += -dz * area; fillArea += area; }
        }
    }
    if (!total) return null;
    return { level, cutM3: cut, fillM3: fill, netM3: cut - fill, areaSqm: total, cutAreaSqm: cutArea, fillAreaSqm: fillArea };
}
export function surfaceDerivatives(tile) {
    const { width, height, values, extent } = tile;
    const sx = (extent[2] - extent[0]) / width, sy = (extent[3] - extent[1]) / height;
    const smooth = shadingField(values, width, height);
    const slopes = new Float32Array(values.length).fill(NaN);
    const shade = new Uint8Array(values.length).fill(180);
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
        const i = row * width + col, z = smooth[i];
        if (!Number.isFinite(z)) continue;
        const left = col > 0 ? smooth[i - 1] : NaN, right = col + 1 < width ? smooth[i + 1] : NaN;
        const north = row > 0 ? smooth[i - width] : NaN, south = row + 1 < height ? smooth[i + width] : NaN;
        const gx = Number.isFinite(left) && Number.isFinite(right) ? (right - left) / (2 * sx)
            : Number.isFinite(right) ? (right - z) / sx : Number.isFinite(left) ? (z - left) / sx : NaN;
        const gy = Number.isFinite(north) && Number.isFinite(south) ? (north - south) / (2 * sy)
            : Number.isFinite(north) ? (north - z) / sy : Number.isFinite(south) ? (z - south) / sy : NaN;
        if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
        slopes[i] = Math.hypot(gx, gy) * 100;
        const light = Math.max(0, (gx * 0.5 - gy * 0.5 + Math.SQRT1_2) / Math.hypot(gx, gy, 1));
        shade[i] = Math.round(60 + 195 * light);
    }
    return { slopes, shade };
}

export function buildSurface({ regions, points, maxPixels = 131072 }) {
    const parts = [];
    for (const region of regions) {
        const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
        for (const rings of polygons) {
            const samples = points.filter((p) => p.parcelId === region.id && insidePolygon(p.coordinate2180, rings));
            if (samples.filter((p) => Number.isFinite(p.elevation)).length >= 3) parts.push({ rings, samples });
        }
    }
    const budget = Math.max(64, Math.floor(maxPixels / Math.max(1, parts.length)));
    return parts.map(({ rings, samples }) => {
        const extent = extentOf(rings), dx = extent[2] - extent[0], dy = extent[3] - extent[1];
        const spacings = samples.map((p) => Math.max(p.spacingX || 0, p.spacingY || 0, p.spacing || 0)).filter((s) => Number.isFinite(s) && s > 0).sort((a, b) => a - b);
        const spacing = spacings[Math.floor(spacings.length / 2)] || Math.sqrt(dx * dy / samples.length);
        const step = Math.max(spacing / 4, Math.max(dx, dy) / 384, Math.sqrt(dx * dy / budget), 0.05);
        const width = Math.max(1, Math.floor(dx / step)), height = Math.max(1, Math.floor(dy / step));
        const sx = dx / width, sy = dy / height;
        const values = new Float32Array(width * height).fill(NaN);
        const interpolate = createInterpolator(samples, spacing);
        for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
            const x = extent[0] + (col + 0.5) * sx, y = extent[3] - (row + 0.5) * sy;
            if (insidePolygon([x, y], rings)) values[row * width + col] = interpolate(x, y);
        }
        const tile = { extent, width, height, values, rings, spacing };
        return { ...tile, ...surfaceDerivatives(tile) };
    });
}

export function surfaceValueAt(tiles, coordinate, field = 'values') {
    for (const tile of tiles) {
        const [minX, minY, maxX, maxY] = tile.extent;
        const [x, y] = coordinate;
        if (x < minX || x > maxX || y < minY || y > maxY || !insidePolygon(coordinate, tile.rings)) continue;
        const col = Math.min(tile.width - 1, Math.floor((x - minX) / (maxX - minX) * tile.width));
        const row = Math.min(tile.height - 1, Math.floor((maxY - y) / (maxY - minY) * tile.height));
        const value = tile[field]?.[row * tile.width + col];
        if (Number.isFinite(value)) return value;
    }
    return null;
}

export function paintSurface(tile, mode, min, max) {
    const colors = [[247,252,240], [224,243,219], [168,221,181], [67,162,202], [8,64,129]];
    const data = new Uint8ClampedArray(tile.width * tile.height * 4);
    const span = Math.max(0.01, max - min);
    for (let i = 0; i < tile.values.length; i++) {
        if (!Number.isFinite(tile.values[i]) || (mode === 'slope' && !Number.isFinite(tile.slopes[i]))) {
            const col = i % tile.width, row = Math.floor(i / tile.width);
            const point = [tile.extent[0] + (col + 0.5) / tile.width * (tile.extent[2] - tile.extent[0]), tile.extent[3] - (row + 0.5) / tile.height * (tile.extent[3] - tile.extent[1])];
            if (tile.rings && insidePolygon(point, tile.rings)) { const stripe = (row + col) % 8 < 2; data.set(stripe ? [107,114,128,180] : [229,231,235,90], i * 4); }
            continue;
        }
        if (mode === 'slope') {
            if (!Number.isFinite(tile.slopes[i])) continue;
            data.set(SLOPE_COLORS[slopeClass(tile.slopes[i])], i * 4);
            data[i * 4 + 3] = 255;
            continue;
        }
        const t = Math.max(0, Math.min(4, (tile.values[i] - min) / span * 4));
        const low = Math.min(3, Math.floor(t)), fraction = t - low;
        const multiplier = mode === 'combined' ? 0.55 + tile.shade[i] / 255 * 0.55 : 1;
        for (let channel = 0; channel < 3; channel++) data[i * 4 + channel] = mode === 'shade' ? tile.shade[i]
            : (colors[low][channel] * (1 - fraction) + colors[low + 1][channel] * fraction) * multiplier;
        data[i * 4 + 3] = 255;
    }
    return data;
}
