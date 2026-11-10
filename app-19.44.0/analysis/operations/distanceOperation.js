import { formatNumber, t } from '../../i18n/index.js';
import { analyzeFeatureDistances } from '../analysisDistanceEngine.js';

const LINE_STYLE = Object.freeze({ strokeColor: '#dc2626', strokeWidth: 2, strokeOpacity: 0.95, strokePattern: 'dash-medium', fillColor: '#dc2626', fillOpacity: 0.05, pointRadius: 5 });

/**
 * 18.2 — operacja „Odległość i obiekty w promieniu”: najbliższy obiekt względem
 * analizowanej geometrii i liczba obiektów w promieniu. Szczegóły wyniku
 * (distanceById, inRadiusIds) czyta też tabela Wyników analizy.
 */
export const distanceOperation = Object.freeze({
    id: 'distance',
    order: 30,
    title: t('analysis.operation.distance'),
    description: t('analysis.operation.distance.description'),
    requiresFullGeometry: true,
    producesResultLayer: true,
    params: Object.freeze([
        {
            id: 'radiusMeters', type: 'number', label: t('analysis.distance.radius'), ariaLabel: t('analysis.distance.radius.aria'),
            unit: 'm', min: 0.5, max: 50000, step: 50, default: 1000, precision: 1, positive: true, invalid: t('analysis.distance.invalid'),
        },
    ]),
    hint: t('analysis.distance.hint'),
    texts: Object.freeze({
        run: t('analysis.run.distance'),
        resultTitle: t('analysis.result.distance'),
        save: t('analysis.result.saveLine'),
        showLayer: t('analysis.result.showLine'),
        hideLayer: t('analysis.result.hideLine'),
        focus: t('analysis.result.focusDistance'),
        truncated: t('analysis.result.truncatedDistance'),
    }),
    progress: (percent) => t('analysis.progress.distance', { percent }),
    // Dane pobiera się z zapasem równym promieniowi — obiekt tuż za krawędzią obszaru też się liczy.
    requestMargin: (params) => params.radiusMeters,
    async run({ features, targetGeometry, params, signal, onProgress, metadata }) {
        const analysis = await analyzeFeatureDistances(targetGeometry(), features, { radiusMeters: params.radiusMeters, signal, onProgress });
        const nearest = analysis.nearest;
        return {
            resultFeatures: analysis.features,
            selectFeatureId: nearest?.feature?.id ?? null,
            details: {
                radiusMeters: analysis.radiusMeters,
                inRadiusCount: analysis.inRadiusCount,
                // Identyfikatory trafień pozwalają tabeli oznaczyć wiersze w promieniu.
                inRadiusIds: [...analysis.inRadiusIds],
                // Mapa id → metry: kolumna odległości w tabeli wyników.
                distanceById: Object.fromEntries(analysis.distances.map((entry) => [entry.id, entry.distanceMeters])),
                nearestDistanceMeters: nearest ? nearest.distanceMeters : null,
                nearestFeatureId: nearest ? String(nearest.feature?.id ?? '') : null,
                nearestFeatureProperties: nearest?.feature?.properties ? structuredClone(nearest.feature.properties) : null,
                targetPoint: nearest?.targetPoint ? [...nearest.targetPoint] : null,
                sourcePoint: nearest?.sourcePoint ? [...nearest.sourcePoint] : null,
                complete: !metadata?.truncated && !metadata?.incomplete,
            },
        };
    },
    summary: (result) => {
        const radius = formatNumber(result.details?.radiusMeters, 1);
        const nearest = result.details?.nearestDistanceMeters;
        return [
            [t('analysis.result.nearest'), nearest == null ? t('analysis.result.noneWithin', { radius }) : `${formatNumber(nearest, 1)} m`],
            [t('analysis.result.inRadius'), `${formatNumber(result.details?.inRadiusCount)} / ${radius} m`],
        ];
    },
    saveProperties: (result) => ({
        analysisDistanceRadiusMeters: result.details?.radiusMeters ?? null,
        analysisNearestDistanceMeters: result.details?.nearestDistanceMeters ?? null,
        analysisInRadiusCount: result.details?.inRadiusCount ?? null,
        analysisNearestFeatureId: result.details?.nearestFeatureId ?? null,
    }),
    save({ result, resultFeatures, baseProperties, prefix, create }) {
        const line = resultFeatures.find((feature) => feature?.geometry?.type === 'LineString');
        if (!line) throw new Error(t('analysis.save.noLine'));
        const distance = formatNumber(result.details?.nearestDistanceMeters ?? 0, 1);
        return create({ name: `${prefix}${t('analysis.save.distance', { distance })}`, geometry: structuredClone(line.geometry), properties: baseProperties, style: LINE_STYLE });
    },
});
