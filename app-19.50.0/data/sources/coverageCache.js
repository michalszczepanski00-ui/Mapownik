// Bounded, short-lived view probes. Importable without React/OpenLayers.
export const COVERAGE_CACHE_LIMIT = 400;
export const COVERAGE_CACHE_TTL_MS = 120000;
export const COVERAGE_INVALIDATED = 'mapownik-coverage-invalidated';
const entries = new Map();
export function readCoverage(key, now = Date.now()) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (now - entry.at >= COVERAGE_CACHE_TTL_MS) { entries.delete(key); return null; }
    entries.delete(key); entries.set(key, entry);
    return entry.value;
}
export function writeCoverage(key, value, now = Date.now()) {
    if (value !== 'yes' && value !== 'no') return;
    entries.delete(key); entries.set(key, { value, at: now });
    while (entries.size > COVERAGE_CACHE_LIMIT) entries.delete(entries.keys().next().value);
}
export function invalidateLayerCoverage(id = null) {
    for (const key of entries.keys()) if (!id || key.startsWith(`${id}|`)) entries.delete(key);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(COVERAGE_INVALIDATED));
}
export function coverageFromImage(found, headers) {
    const status = headers.get('x-msportal-cache') || '';
    if (/FALLBACK/i.test(status)) return 'unknown';
    if (found) return 'yes';
    // 19.37.2: brak danych w próbce to „nie wykryto” (kropka bez wypełnienia), a nie „źródło nie odpowiedziało”.
    // Wcześniej wymagany był nagłówek X-MSPortal-Completeness, którego api/wms.php nigdy nie wysyła — każdy
    // widok bez planu dawał ostrzeżenie (trójkąt) przy warstwach POG i MPZP. Niepewne zostają: obraz zastępczy,
    // nieaktualna kopia (STALE) i łączenie źródeł, w którym część nie odpowiedziała.
    if (/STALE/i.test(status) || headers.get('x-msportal-completeness') === 'partial') return 'unknown';
    const merge = /^(\d+)\/(\d+)/.exec(headers.get('x-msportal-wms-merge') || '');
    if (merge && merge[1] !== merge[2]) return 'unknown';
    return 'no';
}

/**
 * 19.47.0 — pokrycie z obrazu, który mapa właśnie wyświetliła (warstwy planistyczne jako jeden obraz na widok).
 * Dla włączonej warstwy licznik „W widoku” nie wysyła osobnej próbki — wystarcza obraz z mapy
 * (pobrany przez serwer pośredniczący, więc jego piksele są czytelne). Ważne 60 s i tylko dla kadru,
 * który obraz w całości obejmuje.
 */
export const LAYER_IMAGE_COVERAGE = 'mapownik-layer-image-coverage';
const IMAGE_TTL_MS = 60000;
const layerImages = new Map();
export function recordLayerImageCoverage(id, extent, value, now = Date.now()) {
    if (value !== 'yes' && value !== 'no') return;
    layerImages.set(id, { extent: [...extent], value, at: now });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(LAYER_IMAGE_COVERAGE));
}
export function readLayerImageCoverage(id, bbox, now = Date.now()) {
    const entry = layerImages.get(id);
    if (!entry || now - entry.at >= IMAGE_TTL_MS) return null;
    const [a, b, c, d] = entry.extent;
    const inside = bbox[0] >= a - 1 && bbox[1] >= b - 1 && bbox[2] <= c + 1 && bbox[3] <= d + 1;
    return inside ? entry.value : null;
}
