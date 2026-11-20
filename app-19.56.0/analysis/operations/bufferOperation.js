import { formatNumber, t } from '../../i18n/index.js';
import { ANALYSIS_BUFFER_MODES, createAnalysisBuffers } from '../analysisBufferEngine.js';
import { normalizeBufferDistance } from '../../geometry/bufferEngine.js';

// Zapis osobnych buforów tworzy jeden obiekt na budynek — limit chroni projekt.
const MAX_SEPARATE_OBJECTS = 200;
const STYLE = Object.freeze({ strokeColor: '#c2410c', strokeWidth: 2, strokeOpacity: 0.95, strokePattern: 'solid', fillColor: '#c2410c', fillOpacity: 0.12, pointRadius: 5 });
const modeTitle = (id) => t(`analysis.buffer.mode.${id}`);

/** 18.2 — operacja „Bufor wokół obiektów” (strefa w zadanej odległości od pobranych obiektów). */
export const bufferOperation = Object.freeze({
    id: 'buffer',
    order: 20,
    title: t('analysis.operation.buffer'),
    description: t('analysis.operation.buffer.description'),
    requiresFullGeometry: true,
    producesResultLayer: true,
    params: Object.freeze([
        {
            id: 'distanceMeters', type: 'number', label: t('analysis.buffer.distance'), ariaLabel: t('analysis.buffer.distance.aria'),
            unit: 'm', min: 0.5, max: 20000, step: 10, default: 500,
            normalize: normalizeBufferDistance, invalid: t('analysis.buffer.invalid'),
        },
        {
            id: 'mode', type: 'select', label: t('analysis.buffer.mode'), ariaLabel: t('analysis.buffer.mode.aria'), default: 'merged',
            options: ANALYSIS_BUFFER_MODES.map((mode) => ({ value: mode.id, label: modeTitle(mode.id), description: t(`analysis.buffer.mode.${mode.id}.description`) })),
        },
    ]),
    texts: Object.freeze({
        run: t('analysis.run.buffer'),
        resultTitle: t('analysis.result.buffer'),
        save: t('analysis.result.saveBuffer'),
        showLayer: t('analysis.result.showBuffer'),
        hideLayer: t('analysis.result.hideBuffer'),
        focus: t('analysis.result.focusAll'),
    }),
    progress: (percent) => t('analysis.progress.buffer', { percent }),
    async run({ features, params, signal, onProgress }) {
        const result = await createAnalysisBuffers(features, { distanceMeters: params.distanceMeters, mode: params.mode, signal, onProgress });
        return {
            resultFeatures: result.features,
            details: { distanceMeters: result.distanceMeters, mode: result.mode, modeTitle: modeTitle(result.mode), sourceCount: result.sourceCount, failedCount: result.failedCount },
        };
    },
    summary: (result) => [
        [t('analysis.result.buffers'), formatNumber(result.resultCount)],
        [t('analysis.result.bufferDistance'), `${formatNumber(result.details?.distanceMeters, 1)} m`],
        [t('analysis.result.bufferMode'), result.details?.modeTitle ?? '—'],
    ],
    warnings: (result) => (result.details?.failedCount > 0 ? [t('analysis.result.bufferFailed', { count: result.details.failedCount })] : []),
    saveProperties: (result) => ({
        analysisBufferDistanceMeters: result.details?.distanceMeters ?? null,
        analysisBufferMode: result.details?.mode ?? null,
        analysisBufferFailedCount: result.details?.failedCount ?? 0,
    }),
    save({ result, resultFeatures, baseProperties, prefix, create, createMany, toMultiPolygon }) {
        const distance = formatNumber(result.details?.distanceMeters, 3);
        if (result.details?.mode === 'separate') {
            if (resultFeatures.length > MAX_SEPARATE_OBJECTS) throw new Error(t('analysis.save.separateLimit', { max: MAX_SEPARATE_OBJECTS }));
            return createMany(resultFeatures.map((feature, index) => ({
                name: `${prefix}${t('analysis.save.bufferPart', { distance, index: index + 1 })}`,
                geometry: structuredClone(feature.geometry),
                properties: { ...baseProperties, analysisResultCount: 1 },
                style: STYLE,
            })), t('analysis.save.separateHistory'));
        }
        const geometry = toMultiPolygon(resultFeatures);
        if (!geometry) throw new Error(t('analysis.save.noGeometry'));
        return create({ name: `${prefix}${t('analysis.save.buffer', { distance, source: result.sourceTitle })}`, geometry, properties: baseProperties, style: STYLE });
    },
});
