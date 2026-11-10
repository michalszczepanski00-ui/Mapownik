/** Jedna interpretacja kompletności dla podsumowania, wierszy i telefonu. */
export function screeningQuality(row) {
    if (row.code === 'CANCELLED') return 'incomplete';
    if (row.status === 'error') return 'unavailable';
    if ((row.status !== 'ready' && !(row.status === 'inconclusive' && row.approximate)) || row.metadata?.incomplete || row.metadata?.failedSamples > 0
        || (row.metadata?.truncated && !row.metadata?.nearestReliable)) return 'incomplete';
    if (row.approximate || row.metadata?.sampled) return 'approximate';
    return 'precise';
}
export function screeningCategory(row) {
    const quality = screeningQuality(row);
    if (quality === 'unavailable') return 'unavailable';
    if (quality === 'incomplete') return 'unknown';
    if (quality === 'approximate') return row.featureCount > 0 ? 'sampledHit' : 'unknown';
    if (row.collision) return 'collision';
    return row.nearestDistanceMeters != null ? 'within' : 'clear';
}
export function summarizeScreening(rows) {
    const summary = { collision: 0, within: 0, clear: 0, sampledHit: 0, unknown: 0, unavailable: 0 };
    for (const row of rows) summary[screeningCategory(row)] += 1;
    return summary;
}
export const QUALITY_LABELS = Object.freeze({ precise: 'Dane geometryczne', approximate: 'Przybliżone — próbkowanie', incomplete: 'Niepełne dane', unavailable: 'Brak odpowiedzi' });
