import { createBufferGeometry, normalizeBufferDistance } from '../geometry/bufferEngine.js';
import { t } from '../i18n/index.js';

export const ANALYSIS_BUFFER_MODES = Object.freeze([
    { id: 'merged', title: t('analysis.buffer.mode.merged'), description: t('analysis.buffer.mode.merged.description') },
    { id: 'separate', title: t('analysis.buffer.mode.separate'), description: t('analysis.buffer.mode.separate.description') },
]);

const BUFFER_MODE_IDS = new Set(ANALYSIS_BUFFER_MODES.map((item) => item.id));

function abortError() {
    try { return new DOMException(t('analysis.operacjaAnulowana'), 'AbortError'); }
    catch {
        const error = new Error(t('analysis.operacjaAnulowana'));
        error.name = 'AbortError';
        return error;
    }
}
function assertNotAborted(signal) {
    if (signal?.aborted) throw abortError();
}
function polygonFeatures(features) {
    return (Array.isArray(features) ? features : []).filter((feature) => ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type));
}
function combinedMultiPolygon(features) {
    const polygons = [];
    for (const feature of features) {
        const geometry = feature?.geometry;
        if (geometry?.type === 'Polygon') polygons.push(geometry.coordinates);
        else if (geometry?.type === 'MultiPolygon') polygons.push(...geometry.coordinates);
    }
    if (!polygons.length) return null;
    return { type: 'MultiPolygon', coordinates: polygons };
}
function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Tworzy bufory dla funkcji analitycznych w metrycznym EPSG:2180.
 * Tryb merged przekazuje cały MultiPolygon do JSTS BufferOp, dzięki czemu
 * zachodzące na siebie strefy są rozpuszczane w spójny wynik.
 * Tryb separate przetwarza geometrię porcjami, aby nie blokować interfejsu.
 */
export async function createAnalysisBuffers(features, options = {}) {
    const distanceMeters = normalizeBufferDistance(options.distanceMeters);
    if (distanceMeters === null) throw new Error(t('analysis.buffer.invalid'));
    const mode = BUFFER_MODE_IDS.has(options.mode) ? options.mode : 'merged';
    const signal = options.signal ?? null;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const valid = polygonFeatures(features);
    if (!valid.length) return { features: [], sourceCount: 0, failedCount: 0, mode, distanceMeters };
    assertNotAborted(signal);

    if (mode === 'merged') {
        onProgress?.({ completed: 0, total: valid.length, percent: 5, phase: 'buffer' });
        await yieldToBrowser();
        assertNotAborted(signal);
        const geometry = combinedMultiPolygon(valid);
        const buffered = await createBufferGeometry(geometry, distanceMeters);
        assertNotAborted(signal);
        onProgress?.({ completed: valid.length, total: valid.length, percent: 100, phase: 'buffer' });
        return {
            features: [{
                id: 'analysis-buffer-merged',
                geometry: buffered,
                properties: { sourceCount: valid.length, bufferDistanceMeters: distanceMeters, bufferMode: mode },
            }],
            sourceCount: valid.length,
            failedCount: 0,
            mode,
            distanceMeters,
        };
    }

    const results = [];
    let failedCount = 0;
    const batchSize = 20;
    for (let index = 0; index < valid.length; index += 1) {
        assertNotAborted(signal);
        const feature = valid[index];
        try {
            const geometry = await createBufferGeometry(feature.geometry, distanceMeters);
            results.push({
                id: `analysis-buffer-${String(feature.id ?? index + 1)}`,
                geometry,
                properties: {
                    sourceFeatureId: String(feature.id ?? ''),
                    sourceCategory: feature.properties?.category ?? feature.category ?? null,
                    bufferDistanceMeters: distanceMeters,
                    bufferMode: mode,
                },
            });
        } catch {
            failedCount += 1;
        }
        const completed = index + 1;
        onProgress?.({ completed, total: valid.length, percent: Math.round((completed / valid.length) * 100), phase: 'buffer' });
        if (completed % batchSize === 0 && completed < valid.length) await yieldToBrowser();
    }
    if (!results.length && valid.length) throw new Error(t('analysis.nieUdaloSieUtworzycZadnego'));
    return { features: results, sourceCount: valid.length, failedCount, mode, distanceMeters };
}
