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
