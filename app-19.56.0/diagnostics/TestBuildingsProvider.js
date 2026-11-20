function normalizeExtent(extent) {
    if (!Array.isArray(extent) || extent.length !== 4) throw new Error('Nieprawidłowy obszar analizy.');
    const values = extent.map(Number);
    if (!values.every(Number.isFinite)) throw new Error('Obszar analizy zawiera nieprawidłowe współrzędne.');
    const [x1, y1, x2, y2] = values;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);
    if (maxX - minX <= 0 || maxY - minY <= 0) throw new Error('Obszar analizy ma zerową powierzchnię.');
    return [minX, minY, maxX, maxY];
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function rectangle(cx, cy, width, height) {
    const x1 = cx - width / 2; const x2 = cx + width / 2;
    const y1 = cy - height / 2; const y2 = cy + height / 2;
    return { type: 'Polygon', coordinates: [[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]] };
}
function hash(seed) {
    let x = Math.trunc(seed) | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967295;
}

/**
 * Provider wyłącznie do testów architektury 17.2. Generuje deterministyczne
 * prostokąty przypominające obrysy budynków. Nie reprezentuje danych BDOT10k.
 */
export class TestBuildingsProvider {
    constructor() {
        this.id = 'test-residential-buildings';
        this.title = 'Budynki mieszkalne — dane testowe';
        this.description = 'Provider techniczny 17.2. Geometrie syntetyczne do diagnostyki; źródłem produkcyjnym jest lokalna baza BDOT10k.';
        this.status = 'ready';
        this.testData = true;
    }
    async load({ extent, limit = 60, signal } = {}) {
        const [minX,minY,maxX,maxY] = normalizeExtent(extent);
        if (signal?.aborted) throw new DOMException('Przerwano analizę.', 'AbortError');
        const safeLimit = clamp(Math.trunc(Number(limit) || 60), 1, 300);
        const width = maxX - minX;
        const height = maxY - minY;
        const aspect = clamp(width / Math.max(1, height), 0.25, 4);
        const cols = Math.max(1, Math.ceil(Math.sqrt(safeLimit * aspect)));
        const rows = Math.max(1, Math.ceil(safeLimit / cols));
        const cellW = width / cols;
        const cellH = height / rows;
        const buildingW = clamp(cellW * 0.16, Math.min(2, cellW * 0.5), 18);
        const buildingH = clamp(cellH * 0.14, Math.min(2, cellH * 0.5), 14);
        const features = [];
        const baseSeed = Math.round(minX * 0.01) ^ Math.round(minY * 0.01) ^ Math.round(maxX * 0.01) ^ Math.round(maxY * 0.01);
        for (let row = 0; row < rows && features.length < safeLimit; row += 1) {
            for (let col = 0; col < cols && features.length < safeLimit; col += 1) {
                if (signal?.aborted) throw new DOMException('Przerwano analizę.', 'AbortError');
                const index = row * cols + col;
                const jx = (hash(baseSeed + index * 17) - 0.5) * cellW * 0.34;
                const jy = (hash(baseSeed + index * 31 + 7) - 0.5) * cellH * 0.34;
                const cx = minX + (col + 0.5) * cellW + jx;
                const cy = minY + (row + 0.5) * cellH + jy;
                features.push({
                    id: `test-building-${index + 1}`,
                    geometry: rectangle(cx, cy, buildingW, buildingH),
                    properties: { function: 'mieszkalny jednorodzinny', synthetic: true },
                });
            }
        }
        await Promise.resolve();
        return {
            features,
            metadata: {
                source: this.id,
                testData: true,
                extent: [minX,minY,maxX,maxY],
                featureCount: features.length,
            },
        };
    }
}
