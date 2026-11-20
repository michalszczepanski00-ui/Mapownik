import { BdotBuildingsProvider } from './providers/BdotBuildingsProvider.js';
import { WmsProbeProvider } from './providers/WmsProbeProvider.js';

/**
 * 18.1 — tworzy dostawcę danych analizy z deklaracji funkcji (slot
 * `analysisSources`). Nowe źródło WMS do screeningu to jeden wpis
 * `{ type: 'wms-probe', sourceKey, … }` w deklaracji — bez zmian
 * w AnalysisManager. Źródło nietypowe podaje własne `create(ctx)`.
 */
const TYPES = Object.freeze({
    'bdot-buildings': (source) => new BdotBuildingsProvider(source),
    'wms-probe': (source) => new WmsProbeProvider(source),
});

export const ANALYSIS_SOURCE_TYPES = Object.freeze(Object.keys(TYPES));

export function createAnalysisProvider(source, ctx = null) {
    if (typeof source?.create === 'function') return source.create(ctx);
    const factory = TYPES[source?.type];
    if (!factory) throw new Error(`Nieznany typ źródła analizy: ${source?.type}. Dostępne: ${ANALYSIS_SOURCE_TYPES.join(', ')}.`);
    return factory(source);
}
