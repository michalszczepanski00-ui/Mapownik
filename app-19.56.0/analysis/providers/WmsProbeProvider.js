import { t } from '../../i18n/index.js';
import { requestScope } from '../../core/requestScope.js';
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function sampleAxis(min, max, count) {
    if (count <= 1 || max <= min) return [(min + max) / 2];
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(min + ((max - min) * i) / (count - 1));
    return out;
}
async function fetchProbe(sourceKey, x, y, signal) {
    const url = new URL('./api/identify.php', window.location.href);
    url.searchParams.set('source', sourceKey);
    url.searchParams.set('x', String(x));
    url.searchParams.set('y', String(y));
    const scope = requestScope(12000, signal);
    try {
    const response = await fetch(url, { signal: scope.signal, headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
    } finally { scope.dispose(); }
}

/**
 * 17.7 — lekki provider dla źródeł WMS/GetFeatureInfo.
 * Nie udaje pełnego WFS: tworzy punkty trafień na regularnej siatce, dzięki czemu
 * wspólny silnik może wykonywać screeningowe "najbliższy / bufor / liczba w promieniu".
 * Metadane jawnie oznaczają wynik jako sampled/approximate.
 */
export class WmsProbeProvider {
    constructor({ id, title, sourceKey, description, sampleStepMeters = 250, maxSamples = 25 }) {
        this.id = id;
        this.title = title;
        this.sourceKey = sourceKey;
        this.description = description;
        this.sampleStepMeters = sampleStepMeters;
        this.maxSamples = maxSamples;
        this.testData = false;
        this.kind = 'screening';
    }
    async load({ extent, limit = 1200, signal }) {
        const [minX, minY, maxX, maxY] = extent.map(Number);
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const nominalX = Math.max(2, Math.ceil(width / this.sampleStepMeters) + 1);
        const nominalY = Math.max(2, Math.ceil(height / this.sampleStepMeters) + 1);
        const scale = Math.min(1, Math.sqrt(this.maxSamples / Math.max(1, nominalX * nominalY)));
        const nx = clamp(Math.floor(nominalX * scale), 2, 5);
        const ny = clamp(Math.floor(nominalY * scale), 2, 5);
        const xs = sampleAxis(minX, maxX, nx);
        const ys = sampleAxis(minY, maxY, ny);
        const features = [];
        let checked = 0;
        let failures = 0;
        const points = ys.flatMap((y) => xs.map((x) => [x, y]));
        let next = 0;
        const worker = async () => {
            while (next < points.length) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                const [x, y] = points[next++];
                checked += 1;
                try {
                    const payload = await fetchProbe(this.sourceKey, x, y, signal);
                    if (!payload.found) continue;
                    features.push({
                        type: 'Feature',
                        id: `${this.id}:${Math.round(x)}:${Math.round(y)}`,
                        geometry: { type: 'Point', coordinates: [x, y] },
                        properties: { sourceKey: this.sourceKey, info: payload.text || null, sampled: true },
                    });
                } catch (error) {
                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    failures += 1;
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, points.length) }, () => worker()));
        if (failures === checked) throw new Error(t('analysis.nieUdaloSieSprawdzicZadnego'));
        const limited = features.slice(0, limit);
        return {
            features: limited,
            metadata: {
                sampled: true,
                approximate: true,
                sampleCount: checked,
                hitCount: features.length,
                failedSamples: failures,
                sampleGrid: `${nx}×${ny}`,
                sampleExtent: [...extent],
                sampleSpacingMeters: [width / (nx - 1), height / (ny - 1)],
                note: t('analysis.zrodloWmsSprawdzonoTylkoW'),
                truncated: features.length > limit,
            },
        };
    }
}
