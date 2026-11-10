import { requestScope } from '../../core/requestScope.js';
import { t } from '../../i18n/index.js';
function normalizeExtent(extent) {
    if (!Array.isArray(extent) || extent.length !== 4) throw new Error(t('analysis.nieprawidlowyObszarAnalizy'));
    const values = extent.map(Number);
    if (!values.every(Number.isFinite)) throw new Error(t('analysis.obszarAnalizyZawieraNieprawidloweWspolrz'));
    const [x1, y1, x2, y2] = values;
    const normalized = [Math.min(x1,x2), Math.min(y1,y2), Math.max(x1,x2), Math.max(y1,y2)];
    if (normalized[2] - normalized[0] <= 0 || normalized[3] - normalized[1] <= 0) throw new Error(t('analysis.obszarAnalizyMaZerowaPowierzchnie'));
    return normalized;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

/** Provider rzeczywistych danych z lokalnego magazynu BDOT10k. */
export class BdotBuildingsProvider {
    constructor({ id, title, category = 'single_family', description = '' } = {}) {
        if (!id || !title) throw new Error('BdotBuildingsProvider wymaga id i title.');
        this.id = id;
        this.title = title;
        this.category = category;
        this.description = description || t('analysis.lokalnyMagazynBdot10kNaSerwerze');
        this.status = 'server';
        this.testData = false;
        this.kind = 'precise';
        this.requestSerial = 0;
    }
    async load({ extent, limit = 1200, signal, near = null } = {}) {
        const requestId = ++this.requestSerial;
        const bbox = normalizeExtent(extent);
        if (signal?.aborted) throw new DOMException(t('analysis.przerwanoAnalize'), 'AbortError');
        const safeLimit = Math.round(clamp(Number(limit) || 1200, 1, 20000)); // 18.12.0: było 5000
        const params = new URLSearchParams({
            bbox: bbox.join(','),
            category: this.category,
            limit: String(safeLimit),
        });
        // 18.12.0: najbliższe budynki względem celu (np. działki), nie pierwsze z kafli.
        if (Array.isArray(near) && near.length === 4 && near.every(Number.isFinite)) params.set('near', near.map((v) => v.toFixed(1)).join(','));
        const started = performance.now();
        const scope = requestScope(45000, signal);
        try {
        const response = await fetch(`./api/analysis_buildings.php?${params.toString()}`, {
            method: 'GET',
            cache: 'default',
            headers: { Accept: 'application/geo+json, application/json' },
            signal: scope.signal,
        });
        if (requestId !== this.requestSerial) throw new DOMException(t('analysis.nieaktualneZapytanieBdot10k'), 'AbortError');
        let payload = null;
        try { payload = await response.json(); } catch {}
        if (requestId !== this.requestSerial) throw new DOMException(t('analysis.nieaktualneZapytanieBdot10k'), 'AbortError');
        if (!response.ok || !payload?.ok) {
            const message = payload?.error || (response.status === 503
                ? t('analysis.lokalnaBazaBdot10kNieJest')
                : `BDOT10k: HTTP ${response.status}`);
            const error = new Error(message);
            error.code = payload?.code ?? null; // 18.12.1: np. BDOT_STORE_UNAVAILABLE → czytelny komunikat w panelu
            throw error;
        }
        const features = Array.isArray(payload.features) ? payload.features : [];
        return {
            features,
            metadata: {
                ...(payload.meta ?? {}),
                source: this.id,
                category: this.category,
                testData: false,
                featureCount: features.length,
                queryMs: Math.round((performance.now() - started) * 10) / 10,
                cacheState: response.headers.get('X-msportal-BDOT-Cache') || 'UNKNOWN',
                etag: response.headers.get('ETag') || null,
            },
        };
        } finally { scope.dispose(); }
    }
}
