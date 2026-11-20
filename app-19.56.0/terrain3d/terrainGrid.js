import { fetchElevations } from '../terrain/elevationClient.js';
import { SLOPE_BREAKS } from '../terrain/terrainSurface.js';

/**
 * 19.41.0 — siatka wysokości dla widoku „Teren 3D” (EPSG:2180, metry, wiersz 0 = północ).
 *
 * Dwa źródła GUGiK, nigdy mieszane w jednej siatce:
 *   1. kafle NMT 1 m z WCS przez api/dem.php (piramida 1–16 m) — gdy są w cache serwera albo gdy użytkownik
 *      zgodzi się poczekać na pobranie z GUGiK (WCS odpowiada wolno: kilkadziesiąt sekund na kafel);
 *   2. siatka punktów z obecnej usługi punktowej (api/terrain.php, ta sama co profil) — zawsze dostępna,
 *      rzadsza (24–64 punkty na dłuższym boku), cache punktów na serwerze.
 */
export const DETAIL = Object.freeze({
    fast: { label: 'Szybka', tiles: 128, points: 24 },
    standard: { label: 'Standardowa', tiles: 256, points: 40 },
    detailed: { label: 'Szczegółowa', tiles: 512, points: 64 },
});
export const MARGINS = Object.freeze([0, 50, 150, 300]);
export const MAX_SPAN_M = 3000;
export const MAX_SPAN_DETAILED_M = 1500;
const LEVELS = [1, 2, 4, 8, 16];
const TILE = 256;
const NODATA = 65535;
const tileCache = new globalThis.Map(); // klucz p/tx/ty → kafel (najwyżej 48 w pamięci)

const abortError = () => new DOMException('Przerwano', 'AbortError');

/** Prostokąt obszaru: zasięg geometrii (2180) + otoczenie; wyrównany do metra. */
export function areaExtent(geometries, margin) {
    const e = [Infinity, Infinity, -Infinity, -Infinity];
    const visit = (c) => { if (typeof c[0] === 'number') { e[0] = Math.min(e[0], c[0]); e[1] = Math.min(e[1], c[1]); e[2] = Math.max(e[2], c[0]); e[3] = Math.max(e[3], c[1]); } else c.forEach(visit); };
    for (const g of geometries) visit(g.coordinates);
    if (!Number.isFinite(e[0])) throw new Error('Brak geometrii obszaru.');
    // Linia albo bardzo mała działka: co najmniej 60 m wokół.
    const pad = Math.max(margin, Math.max(0, (60 - Math.min(e[2] - e[0], e[3] - e[1])) / 2));
    return [Math.floor(e[0] - pad), Math.floor(e[1] - pad), Math.ceil(e[2] + pad), Math.ceil(e[3] + pad)];
}

/** Plan siatki: krok, liczba węzłów, poziom piramidy i kafle. */
export function planGrid(extent, detailKey, source) {
    const d = DETAIL[detailKey] ?? DETAIL.standard;
    const w = extent[2] - extent[0]; const h = extent[3] - extent[1]; const span = Math.max(w, h);
    const n = source === 'tiles' ? d.tiles : d.points;
    const step = Math.max(1, span / (n - 1));
    const cols = Math.max(2, Math.round(w / step) + 1); const rows = Math.max(2, Math.round(h / step) + 1);
    const p = LEVELS.filter((l) => l <= step).pop() ?? 1;
    const size = TILE * p;
    const tiles = [];
    for (let tx = Math.floor(extent[0] / size); tx <= Math.floor((extent[2] - 1e-6) / size); tx++) for (let ty = Math.floor(extent[1] / size); ty <= Math.floor((extent[3] - 1e-6) / size); ty++) tiles.push([tx, ty]);
    return { extent, step: Math.max(w / (cols - 1), h / (rows - 1)), stepX: w / (cols - 1), stepY: h / (rows - 1), cols, rows, p, tiles, detail: detailKey, span };
}

function parseTile(buffer) {
    const v = new DataView(buffer);
    if (String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) !== 'MDM1') throw new Error('Nieprawidłowy kafel NMT.');
    const width = v.getUint16(4, true); const height = v.getUint16(6, true);
    if (width !== TILE || height !== TILE || buffer.byteLength !== 40 + TILE * TILE * 2) throw new Error('Niekompletny kafel NMT.');
    return { width, height, min: v.getFloat64(8, true), scale: v.getFloat64(16, true), x0: v.getFloat64(24, true), y1: v.getFloat64(32, true), data: new Uint16Array(buffer.slice(40, 40 + width * height * 2)) };
}

async function fetchTile(p, tx, ty, { signal, cachedOnly }) {
    const key = `${p}/${tx}/${ty}`;
    if (tileCache.has(key)) return tileCache.get(key);
    const response = await fetch(`./api/dem.php?p=${p}&tx=${tx}&ty=${ty}${cachedOnly ? '&cached=1' : ''}`, { signal });
    if (response.status === 204) return null;
    if (!response.ok) { const j = await response.json().catch(() => null); throw new Error(j?.error || `Kafel NMT: HTTP ${response.status}`); }
    const tile = { ...parseTile(await response.arrayBuffer()), p, upstreamMs: Number(response.headers.get('x-mapownik-dem-ms')) || null, cache: response.headers.get('x-mapownik-dem-cache') };
    tileCache.set(key, tile);
    if (tileCache.size > 48) tileCache.delete(tileCache.keys().next().value);
    return tile;
}

/** Wysokość z kafli w punkcie (dwuliniowo między środkami komórek); NaN przy braku danych. */
function sampleTiles(tiles, p, x, y) {
    const size = TILE * p;
    const fx = (x - Math.floor(x / size) * size) / p - 0.5; const fy = ((Math.floor(y / size) + 1) * size - y) / p - 0.5;
    const tile = tiles.get(`${Math.floor(x / size)}/${Math.floor(y / size)}`);
    if (!tile) return NaN;
    const c0 = Math.max(0, Math.min(TILE - 2, Math.floor(fx))); const r0 = Math.max(0, Math.min(TILE - 2, Math.floor(fy)));
    const ax = Math.max(0, Math.min(1, fx - c0)); const ay = Math.max(0, Math.min(1, fy - r0));
    const at = (r, c) => { const q = tile.data[r * TILE + c]; return q === NODATA ? NaN : tile.min + q * tile.scale; };
    const v00 = at(r0, c0); const v01 = at(r0, c0 + 1); const v10 = at(r0 + 1, c0); const v11 = at(r0 + 1, c0 + 1);
    const vals = [[v00, (1 - ax) * (1 - ay)], [v01, ax * (1 - ay)], [v10, (1 - ax) * ay], [v11, ax * ay]].filter(([vv]) => Number.isFinite(vv));
    const wsum = vals.reduce((s, [, w]) => s + w, 0);
    return wsum > 0 ? vals.reduce((s, [vv, w]) => s + vv * w, 0) / wsum : NaN;
}

/** Uzupełnia pojedyncze braki średnią sąsiadów (kilka przejść); zwraca liczbę pozostałych braków. */
function fillHoles(values, cols, rows) {
    for (let pass = 0; pass < 40; pass++) {
        let left = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const i = r * cols + c; if (Number.isFinite(values[i])) continue;
            let s = 0; let n = 0;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + dr; const cc = c + dc; if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && Number.isFinite(values[rr * cols + cc])) { s += values[rr * cols + cc]; n++; } }
            if (n) values[i] = s / n; else left++;
        }
        if (!left) return 0;
    }
    return values.reduce((a, v) => a + (Number.isFinite(v) ? 0 : 1), 0);
}

/** Spadek w % (różnice centralne) i statystyki siatki. */
export function gridDerivatives(grid) {
    const { values, cols, rows, stepX, stepY } = grid;
    const slopes = new Float32Array(cols * rows);
    let min = Infinity; let max = -Infinity;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; const v = values[i];
        if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
        const xl = values[r * cols + Math.max(0, c - 1)]; const xr = values[r * cols + Math.min(cols - 1, c + 1)];
        const yu = values[Math.max(0, r - 1) * cols + c]; const yd = values[Math.min(rows - 1, r + 1) * cols + c];
        const dx = (xr - xl) / (stepX * (Math.min(cols - 1, c + 1) - Math.max(0, c - 1)));
        const dy = (yu - yd) / (stepY * (Math.min(rows - 1, r + 1) - Math.max(0, r - 1)));
        slopes[i] = Math.hypot(dx, dy) * 100;
    }
    return { slopes, min, max };
}

/** Wysokość w punkcie siatki (dwuliniowo), x/y w EPSG:2180. */
export function heightAt(grid, x, y) {
    const fc = (x - grid.extent[0]) / grid.stepX; const fr = (grid.extent[3] - y) / grid.stepY;
    if (fc < 0 || fr < 0 || fc > grid.cols - 1 || fr > grid.rows - 1) return NaN;
    const c0 = Math.min(grid.cols - 2, Math.floor(fc)); const r0 = Math.min(grid.rows - 2, Math.floor(fr));
    const ax = fc - c0; const ay = fr - r0; const v = grid.values; const k = grid.cols;
    return v[r0 * k + c0] * (1 - ax) * (1 - ay) + v[r0 * k + c0 + 1] * ax * (1 - ay) + v[(r0 + 1) * k + c0] * (1 - ax) * ay + v[(r0 + 1) * k + c0 + 1] * ax * ay;
}

/** Udział węzłów siatki w klasach spadku (0–2 / 2–5 / 5–10 / 10–15 / >15 %), opcjonalnie tylko w wielokątach. */
export function slopeShares(grid, inside = null) {
    const counts = [0, 0, 0, 0, 0]; let n = 0;
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
        if (inside && !inside(grid.extent[0] + c * grid.stepX, grid.extent[3] - r * grid.stepY)) continue;
        const s = grid.slopes[r * grid.cols + c]; if (!Number.isFinite(s)) continue;
        counts[SLOPE_BREAKS.filter((b) => s >= b).length] += 1; n += 1;
    }
    return { counts, n, shares: counts.map((k) => (n ? k / n : 0)) };
}

/**
 * Buduje siatkę. options: { detail, allowSlowTiles, signal, onProgress(msg, fraction) }.
 * Kolejność: kafle WCS z cache serwera → (opcjonalnie) kafle pobierane z GUGiK → siatka punktów.
 * Zwraca { ...plan, values, slopes, min, max, source, sourceLabel, datum, holes, tilesUsed, upstreamMs }.
 */
export async function buildTerrainGrid(extent, { detail = 'standard', allowSlowTiles = false, signal, onProgress = () => {} } = {}) {
    const span = Math.max(extent[2] - extent[0], extent[3] - extent[1]);
    if (span > MAX_SPAN_M) throw new Error(`Obszar ${Math.round(span)} m przekracza limit ${MAX_SPAN_M} m — zmniejsz otoczenie albo wybierz mniejszy teren.`);
    if (detail === 'detailed' && span > MAX_SPAN_DETAILED_M) detail = 'standard';
    // 1. Kafle WCS (z cache serwera; pobieranie z GUGiK tylko na wyraźną zgodę).
    const plan = planGrid(extent, detail, 'tiles');
    if (plan.tiles.length <= 16) {
        try {
            const tiles = new globalThis.Map(); let done = 0; let missing = 0; const ms = [];
            onProgress('Sprawdzanie kafli NMT 1 m na serwerze…', 0);
            const queue = [...plan.tiles];
            const worker = async () => {
                while (queue.length) {
                    const [tx, ty] = queue.shift();
                    const tile = await fetchTile(plan.p, tx, ty, { signal, cachedOnly: !allowSlowTiles });
                    if (!tile) { missing++; continue; }
                    if (tile.upstreamMs) ms.push(tile.upstreamMs);
                    tiles.set(`${tx}/${ty}`, tile); done++;
                    onProgress(`Kafle NMT 1 m: ${done} z ${plan.tiles.length}${allowSlowTiles ? ' (pobieranie z GUGiK może trwać kilka minut)' : ''}`, done / plan.tiles.length);
                }
            };
            await Promise.all([worker(), worker()]);
            if (signal?.aborted) throw abortError();
            if (!missing) {
                const values = new Float32Array(plan.cols * plan.rows);
                for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) values[r * plan.cols + c] = sampleTiles(tiles, plan.p, extent[0] + c * plan.stepX, extent[3] - r * plan.stepY);
                if (!values.some(Number.isFinite)) throw new Error('Brak wysokości w kaflach NMT.');
                const holes = fillHoles(values, plan.cols, plan.rows);
                const grid = { ...plan, values, holes, source: 'tiles', sourceLabel: `NMT 1 m GUGiK (WCS), kafle ${plan.p} m`, datum: 'PL-KRON86-NH', tilesUsed: tiles.size, upstreamMs: ms.length ? Math.max(...ms) : null, missingTiles: 0 };
                return { ...grid, ...gridDerivatives(grid) };
            }
        } catch (error) {
            if (signal?.aborted || error?.name === 'AbortError') throw abortError();
            if (allowSlowTiles) throw error;
        }
    }
    // 2. Siatka punktów z usługi punktowej GUGiK (jak profil terenu).
    const pp = planGrid(extent, detail, 'points');
    const coords = [];
    for (let r = 0; r < pp.rows; r++) for (let c = 0; c < pp.cols; c++) coords.push([extent[0] + c * pp.stepX, extent[3] - r * pp.stepY]);
    onProgress(`Wysokości NMT: 0 z ${coords.length} punktów`, 0);
    const payload = await fetchElevations(coords, {
        signal, batchSize: 120, timeoutMs: 30000,
        onProgress: ({ received, total }) => onProgress(`Wysokości NMT: ${received} z ${total} punktów`, received / Math.max(1, total)),
    });
    const values = Float32Array.from(payload.heights.map((h) => (Number.isFinite(h) ? h : NaN)));
    // Wysokość 0 przy terenie wyraźnie powyżej poziomu morza to błąd odpowiedzi usługi — traktujemy jako brak.
    const sorted = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length && sorted[Math.floor(sorted.length / 2)] > 5) values.forEach((v, i) => { if (v === 0) values[i] = NaN; });
    const received = values.reduce((a, v) => a + (Number.isFinite(v) ? 1 : 0), 0);
    if (received < Math.max(4, values.length * 0.5)) throw new Error('Usługa wysokości GUGiK nie zwróciła wystarczającej liczby punktów — spróbuj ponownie za chwilę.');
    const holes = fillHoles(values, pp.cols, pp.rows);
    const grid = { ...pp, values, holes, source: 'points', sourceLabel: `NMT GUGiK — siatka ${pp.cols} × ${pp.rows} punktów (usługa punktowa)`, datum: payload.verticalDatum || 'PL-KRON86-NH', tilesUsed: 0, upstreamMs: null, missingTiles: plan.tiles.length };
    return { ...grid, ...gridDerivatives(grid) };
}
