import { coordinateExtent } from '../geometry/coordinateExtent.js';
import { AnalysisProviderRegistry } from './AnalysisProviderRegistry.js';
import { AnalysisVectorLayer } from './AnalysisVectorLayer.js';
import { AnalysisResultLayer } from './AnalysisResultLayer.js';
import { analyzeFeatureDistances, extentToPolygon } from './analysisDistanceEngine.js';
import { formatNumber, t } from '../i18n/index.js';
import { MAP_OBJECT_PROPERTY_KEYS } from '../persistence/projectSchemas.js';
import { FEATURE_ID_PATTERN } from '../core/object/objectKinds.js';

const AREA_MODES = new Set(['viewport', 'selected', 'box']);
const PREVIEW_STYLE = Object.freeze({ strokeColor: '#0e7490', strokeWidth: 2, strokeOpacity: 0.95, strokePattern: 'solid', fillColor: '#0e7490', fillOpacity: 0.13, pointRadius: 5 });

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function geometryExtent(geometry) {
    if (!geometry || !geometry.type) throw new Error(t('analysis.error.noGeometry'));
    const extent = coordinateExtent(geometry.coordinates);
    if (!extent) throw new Error(t('analysis.error.noExtent'));
    return extent;
}
function expandExtent(extent, margin) {
    const m = clamp(Number(margin) || 0, 0, 50000);
    return [extent[0]-m, extent[1]-m, extent[2]+m, extent[3]+m];
}
function toMultiPolygon(features) {
    const polygons = [];
    for (const feature of features ?? []) {
        const geometry = feature?.geometry;
        if (geometry?.type === 'Polygon') polygons.push(geometry.coordinates);
        else if (geometry?.type === 'MultiPolygon') polygons.push(...geometry.coordinates);
    }
    if (!polygons.length) return null;
    return { type: 'MultiPolygon', coordinates: polygons };
}
function formatExtent(extent) {
    const width = Math.max(0, extent[2]-extent[0]);
    const height = Math.max(0, extent[3]-extent[1]);
    return `${Math.round(width).toLocaleString('pl-PL')} × ${Math.round(height).toLocaleString('pl-PL')} m`;
}
const KNOWN_PROPERTIES = new Set(MAP_OBJECT_PROPERTY_KEYS);
/**
 * Właściwości zapisywanego obiektu z wkładu operacji. Pola znane schematowi
 * zapisu zostają na wierzchu; pozostałe (i wynik saveData) trafiają do
 * properties.features['<id funkcji>'] — inaczej zniknęłyby przy zapisie
 * projektu. Pola bazowe analizy mają pierwszeństwo przed polami operacji.
 */
function operationProperties(operation, result, baseProperties) {
    const contributed = operation?.saveProperties?.(result) ?? {};
    const known = {};
    const extra = { ...(operation?.saveData?.(result) ?? {}) };
    let features = null;
    for (const [key, value] of Object.entries(contributed)) {
        if (key === 'features' && value && typeof value === 'object') features = value;
        else if (KNOWN_PROPERTIES.has(key)) known[key] = value;
        else extra[key] = value;
    }
    const namespace = FEATURE_ID_PATTERN.test(operation?.feature ?? '') ? operation.feature : 'analysis';
    if (Object.keys(extra).length) features = { ...(features ?? {}), [namespace]: { ...(features?.[namespace] ?? {}), [operation.id]: extra } };
    return { ...known, ...(features ? { features } : {}), ...baseProperties };
}
function defaultParams(operation) {
    return Object.fromEntries((operation.params ?? []).map((param) => [param.id, param.default]));
}
/** Wartość parametru operacji po walidacji; null = niepoprawna liczba. */
function normalizeParam(param, value) {
    if (param.type === 'select') return (param.options ?? []).some((option) => option.value === value) ? value : undefined;
    if (param.type === 'number') {
        if (typeof param.normalize === 'function') return param.normalize(value);
        const n = Number(value);
        if (!Number.isFinite(n) || (param.positive && n <= 0)) return null;
        const clamped = clamp(n, param.min ?? -Infinity, param.max ?? Infinity);
        const factor = 10 ** (param.precision ?? 0);
        return Math.round(clamped * factor) / factor;
    }
    return value;
}

/**
 * Uniwersalny koordynator analiz przestrzennych.
 *
 * Źródło danych (provider) dostarcza pełne geometrie w EPSG:2180, a operacja
 * przestrzenna je przetwarza. 18.1: źródła deklarują funkcje (slot
 * analysisSources); 18.2: także operacje (slot analysisOperations) — podgląd,
 * bufor i odległość to deklaracje w analysis/operations/, a manager nie zna
 * żadnej z nich z nazwy. Runtime rejestruje je przez registerOperation().
 */
// 18.12.1: ile źródeł screeningu naraz.
const SCREENING_CONCURRENCY = 3;

export class AnalysisManager {
    constructor(host, objectManager, objectCommands, registry = null, { createPreviewLayer = null, createResultLayer = null } = {}) {
        this.host = host;
        this.objectManager = objectManager;
        this.objectCommands = objectCommands;
        this.registry = registry ?? new AnalysisProviderRegistry();
        this.operations = new Map();
        // Warstwy mapy można podmienić (testy bez OpenLayers).
        this.previewLayer = createPreviewLayer ? createPreviewLayer(host) : new AnalysisVectorLayer(host);
        this.previewLayer.setVisible(true);
        this.resultLayer = createResultLayer ? createResultLayer(host) : new AnalysisResultLayer(host);
        this.resultLayer.setVisible(true);
        const first = this.registry.list()[0]?.id ?? null;
        this.listeners = new Set();
        this.subscribe = (listener) => {
            this.assertAlive();
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.abortController = null;
        this.screeningAbortController = null;
        // Źródła zakładki „Screening działki” — z deklaracji (screening: true).
        this.screeningSourceIds = [];
        this.runSequence = 0;
        this.cancelBoxSelection = null;
        this.disposed = false;
        this.snapshot = {
            sources: this.registry.list(),
            operations: [],
            sourceId: first,
            operationId: null,
            operationParams: {},
            operationProgress: null,
            areaMode: 'viewport',
            marginMeters: 0,
            limit: 1200,
            selectingBox: false,
            customExtent: null,
            selectedObjectId: null,
            selectedObjectName: null,
            busy: false,
            error: null,
            lastResult: null,
            previewRevision: 0,
            previewVisible: true,
            previewCount: 0,
            previewSourceCount: 0,
            previewLimited: false,
            previewSimplificationTolerance: 0,
            resultVisible: true,
            resultCount: 0,
            selectedFeature: null,
            screeningBusy: false,
            screeningError: null,
            screeningRadiusMeters: 2000,
            screeningLimit: 5000, // 18.12.0: było na sztywno 1200
            screeningResults: [],
            screeningUpdatedAt: null,
            screeningContext: null,
        };
        this.getSnapshot = () => this.snapshot;
        this.unsubscribeObjects = objectManager.subscribe(() => this.syncSelectedObject());
        this.unsubscribeMutations = objectManager.subscribeMutations?.((mutation) => {
            if (mutation.type === 'clear' || mutation.id === this.snapshot.selectedObjectId || mutation.object?.id === this.snapshot.selectedObjectId) this.invalidateScreening();
        });
        this.unsubscribeMapClick = host.onSingleClick((click) => this.handleMapClick(click));
        this.syncSelectedObject();
    }
    /** 18.2: rejestruje operację (z deklaracji funkcji) z domyślnymi parametrami. */
    registerOperation(operation) {
        this.assertAlive();
        if (!operation?.id || typeof operation.run !== 'function') throw new Error('Operacja analizy wymaga id i run().'); // dev: błąd programisty, nie komunikat dla użytkownika
        if (this.operations.has(operation.id)) throw new Error(`Operacja analizy ${operation.id} jest już zarejestrowana.`); // dev: błąd programisty, nie komunikat dla użytkownika
        this.operations.set(operation.id, operation);
        const operations = [...this.operations.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        this.update({
            operations,
            operationId: this.snapshot.operationId ?? operations[0]?.id ?? null,
            operationParams: { ...this.snapshot.operationParams, [operation.id]: defaultParams(operation) },
        });
        return operation;
    }
    getOperation(id = this.snapshot.operationId) {
        return this.operations.get(id) ?? null;
    }
    setSourceId(id) {
        this.assertAlive();
        const provider = this.registry.get(id);
        // Źródło screeningu (punkty próbkowania) nie ma pełnej geometrii: operacja,
        // która jej wymaga, zmienia się na pierwszą, która działa na próbkach.
        let operationId = this.snapshot.operationId;
        if (provider.kind === 'screening' && this.getOperation(operationId)?.requiresFullGeometry) {
            operationId = this.snapshot.operations.find((operation) => !operation.requiresFullGeometry)?.id ?? operationId;
        }
        this.update({ sourceId: id, operationId, error: null });
    }
    setOperationId(id) {
        this.assertAlive();
        const operation = this.getOperation(id);
        if (!operation) throw new Error(`Nieznana operacja analizy: ${id}`);
        if (operation.requiresFullGeometry && this.registry.get(this.snapshot.sourceId).kind === 'screening') {
            this.update({ error: t('analysis.error.needsGeometry') });
            return;
        }
        this.update({ operationId: id, error: null, operationProgress: null });
    }
    /** Parametr operacji (np. odległość bufora) — walidacja z deklaracji parametru. */
    setOperationParam(operationId, paramId, value) {
        this.assertAlive();
        const param = this.getOperation(operationId)?.params?.find((item) => item.id === paramId);
        if (!param) throw new Error(`Nieznany parametr ${paramId} operacji ${operationId}.`); // dev: błąd programisty, nie komunikat dla użytkownika
        const normalized = normalizeParam(param, value);
        if (normalized === undefined) throw new Error(`Niedozwolona wartość parametru ${paramId}: ${value}`); // dev: błąd programisty, nie komunikat dla użytkownika
        if (normalized === null) { this.update({ error: param.invalid ?? t('analysis.error.invalidParam') }); return; }
        const current = this.snapshot.operationParams[operationId] ?? {};
        this.update({ operationParams: { ...this.snapshot.operationParams, [operationId]: { ...current, [paramId]: normalized } }, error: null });
    }
    setPanelMode(value) { this.update({ panelMode: value === 'manual' ? 'manual' : 'screening' }); }
    setAreaMode(mode) {
        this.assertAlive();
        if (!AREA_MODES.has(mode)) throw new Error(`Nieznany tryb obszaru: ${mode}`);
        this.update({ areaMode: mode, error: null });
    }
    setMarginMeters(value) {
        this.assertAlive();
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        this.update({ marginMeters: Math.round(clamp(n, 0, 50000)), error: null });
    }
    setLimit(value) {
        this.assertAlive();
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        this.update({ limit: Math.round(clamp(n, 1, 20000)), error: null });
    }
    selectBox() {
        this.assertAlive();
        this.cancelBoxSelection?.();
        this.update({ selectingBox: true, error: null });
        this.cancelBoxSelection = this.host.selectBoxExtent((extent) => {
            this.update({ customExtent: extent.map(Number), areaMode: 'box', error: null });
        }, () => {
            this.cancelBoxSelection = null;
            this.update({ selectingBox: false });
        });
    }
    clearBox() {
        this.assertAlive();
        this.cancelBoxSelection?.();
        this.cancelBoxSelection = null;
        this.update({ customExtent: null, selectingBox: false, error: null });
    }
    cancelRun() {
        this.runSequence += 1;
        this.abortController?.abort();
        this.abortController = null;
        this.update({ busy: false, operationProgress: null });
    }
    cancelScreening() {
        this.runSequence += 1;
        this.screeningAbortController?.abort();
        this.screeningAbortController = null;
        const completed = this.snapshot.screeningResults;
        const known = new Set(completed.map((row) => row.sourceId));
        const missing = this.screeningSourceIds.filter((id) => this.registry.providers.has(id) && !known.has(id)).map((sourceId) => ({ sourceId, title: this.registry.get(sourceId).title, status: 'error', code: 'CANCELLED', collision: false, featureCount: 0, approximate: true }));
        this.update({ screeningBusy: false, screeningError: t('analysis.screening.cancelled'), screeningResults: [...completed, ...missing], screeningUpdatedAt: new Date().toISOString(), screeningContext: this._screeningRun ? { selectedId: this._screeningRun.selectedId, name: this._screeningRun.name, revision: this._screeningRun.targetRevision, radius: this._screeningRun.radius } : null, screeningDetails: null, screeningProgress: null });
    }
    async run() {
        this.assertAlive();
        if (this.snapshot.screeningBusy) { this.update({ error: t('analysis.error.screeningBusy') }); return null; }
        this._showingScreening = false;
        const runId = ++this.runSequence;
        this.abortController?.abort();
        const controller = new AbortController();
        this.abortController = controller;
        // 18.12.0: poprzedni wynik znika od razu — wcześniej przy błędzie albo
        // anulowaniu panel i „Zapisz zestaw” pokazywały stary wynik obok nowych
        // geometrii na mapie.
        this.update({ busy: true, error: null, selectedFeature: null, operationProgress: null, lastResult: null, screeningDetails: null });
        const discardPartial = () => {
            this.previewLayer.clear?.();
            this.resultLayer.clear();
            this.update({ previewRevision: this.snapshot.previewRevision + 1, previewVisible: false, previewCount: 0, resultVisible: false, resultCount: 0, selectedFeature: null });
        };
        try {
            const provider = this.registry.get(this.snapshot.sourceId);
            const operation = this.getOperation();
            if (!operation) throw new Error(t('analysis.error.noOperation'));
            if (provider.kind === 'screening' && operation.requiresFullGeometry) throw new Error(t('analysis.error.screeningSource'));
            const params = { ...defaultParams(operation), ...(this.snapshot.operationParams[operation.id] ?? {}) };
            const extent = this.resolveExtent();
            const requestMargin = Math.max(this.snapshot.marginMeters, Number(operation.requestMargin?.(params)) || 0);
            const expanded = expandExtent(extent, requestMargin);
            const loaded = await provider.load({ extent: expanded, limit: this.snapshot.limit, signal: controller.signal });
            if (controller.signal.aborted || runId !== this.runSequence) return null;
            // Identyfikator nadajemy RAZ, przed narysowaniem podglądu: warstwa
            // wektorowa i operacja muszą widzieć te same klucze, inaczej tabela
            // nie dopasuje wyniku do wiersza. Dostawcy bywają niekonsekwentni —
            // część obiektów przychodzi bez id.
            const features = (Array.isArray(loaded?.features) ? loaded.features : [])
                .map((feature, index) => (feature?.id != null || feature?.properties?.id != null
                    ? feature
                    : { ...feature, id: `analysis-feature-${index + 1}` }));
            const providerMetadata = loaded?.metadata && typeof loaded.metadata === 'object' ? loaded.metadata : {};
            if (providerMetadata.failedSamples > 0) {
                providerMetadata.partial = true;
            }
            const renderedCount = this.previewLayer.replace(features, providerMetadata);
            const previewStats = this.previewLayer.getRenderStats();
            this.previewLayer.setVisible(true);
            this.resultLayer.clear();

            const output = await operation.run({
                features,
                extent,
                targetGeometry: () => this.resolveTargetGeometry(extent),
                params,
                signal: controller.signal,
                onProgress: (progress) => this.update({ operationProgress: progress }),
                metadata: providerMetadata,
            }) ?? {};
            if (controller.signal.aborted || runId !== this.runSequence) return null;
            const resultFeatures = Array.isArray(output.resultFeatures) ? output.resultFeatures : [];
            if (resultFeatures.length) {
                this.resultLayer.replace(resultFeatures);
                this.resultLayer.setVisible(true);
            }
            if (output.selectFeatureId != null) this.previewLayer.select(String(output.selectFeatureId));

            const result = {
                objectId: null,
                operationId: operation.id,
                params,
                featureCount: features.length,
                renderedCount,
                resultCount: resultFeatures.length,
                extent: expanded,
                extentLabel: formatExtent(expanded),
                areaMode: this.snapshot.areaMode,
                marginMeters: this.snapshot.marginMeters,
                requestMarginMeters: requestMargin,
                sourceId: provider.id,
                sourceTitle: provider.title,
                createdAt: new Date().toISOString(),
                testData: Boolean(provider.testData),
                truncated: Boolean(providerMetadata.truncated || providerMetadata.incomplete),
                metadata: providerMetadata,
                preview: previewStats,
                resultPreview: this.resultLayer.getRenderStats(),
                details: output.details ?? null,
            };
            this.update({
                busy: false,
                lastResult: result,
                previewRevision: this.snapshot.previewRevision + 1,
                previewVisible: true,
                previewCount: renderedCount,
                previewSourceCount: previewStats.sourceCount,
                previewLimited: previewStats.limited,
                previewSimplificationTolerance: previewStats.simplifyTolerance,
                resultVisible: true,
                resultCount: resultFeatures.length,
                selectedFeature: output.selectFeatureId != null ? this.previewLayer.getSelectedInfo() : null,
                operationProgress: null,
                error: null,
            });
            return result;
        } catch (error) {
            if (controller.signal.aborted || error?.name === 'AbortError' || runId !== this.runSequence) {
                if (runId === this.runSequence) { discardPartial(); this.update({ busy: false, operationProgress: null }); }
                return null;
            }
            if (runId === this.runSequence) { discardPartial(); this.update({ busy: false, operationProgress: null, error: error instanceof Error ? error.message : String(error) }); }
            return null;
        } finally {
            if (this.abortController === controller) this.abortController = null;
        }
    }
    /**
     * Zapis wyniku do projektu. Operacja może mieć własny save(api) (bufor,
     * odległość); bez niego zapisywany jest MultiPolygon z pobranych geometrii.
     */
    saveLastResultAsObject() {
        this.assertAlive();
        try {
            const last = this.snapshot.lastResult;
            if (!last) throw new Error(t('analysis.save.noResult'));
            if (last.truncated) throw new Error(t('analysis.save.truncated'));
            if (last.objectId || (Array.isArray(last.objectIds) && last.objectIds.length)) return last.objectId ?? last.objectIds[0];
            const operation = this.getOperation(last.operationId);
            const previewFeatures = this.previewLayer.getRawFeatures();
            const resultFeatures = this.resultLayer.getRawFeatures();
            const features = operation?.producesResultLayer ? resultFeatures : previewFeatures;
            if (!features.length) throw new Error(t('analysis.save.noGeometry'));
            const baseProperties = operationProperties(operation, last, {
                analysisProviderId: last.sourceId,
                analysisOperationId: last.operationId,
                analysisFeatureCount: last.featureCount,
                analysisResultCount: features.length,
                analysisAreaMode: last.areaMode,
                analysisMarginMeters: last.marginMeters,
                analysisGeneratedAt: last.createdAt,
                analysisTestData: Boolean(last.testData),
                analysisTruncated: Boolean(last.truncated),
                analysisDataVersion: last.metadata?.storeVersion ?? null,
                analysisDataGeneratedAt: last.metadata?.dataGeneratedAt ?? null,
                analysisCategory: last.metadata?.category ?? null,
            });
            const prefix = last.testData ? t('analysis.save.testPrefix') : '';
            const create = (input) => this.objectCommands.create({ origin: 'analysis', kind: 'analysis', ...input });
            const createMany = (inputs, label) => {
                const prepared = inputs.map((input) => ({ origin: 'analysis', kind: 'analysis', ...input }));
                return typeof this.objectCommands.createMany === 'function'
                    ? this.objectCommands.createMany(prepared, label)
                    : prepared.map((input) => this.objectCommands.create(input));
            };
            let saved;
            if (typeof operation?.save === 'function') {
                saved = operation.save({ result: last, previewFeatures, resultFeatures, baseProperties, prefix, create, createMany, toMultiPolygon });
            } else {
                const geometry = toMultiPolygon(features);
                if (!geometry) throw new Error(t('analysis.save.noGeometry'));
                saved = create({ name: `${prefix}${t('analysis.save.set', { source: last.sourceTitle, count: formatNumber(features.length) })}`, geometry, properties: baseProperties, style: PREVIEW_STYLE });
            }
            const objectIds = (Array.isArray(saved) ? saved : [saved]).filter((id) => id != null);
            const objectId = objectIds[0] ?? null;
            this.update({ lastResult: { ...last, objectId, objectIds }, error: null });
            return objectId;
        } catch (error) {
            this.update({ error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }
    setPreviewVisible(visible) {
        this.assertAlive();
        const next = Boolean(visible);
        this.previewLayer.setVisible(next);
        if (!next) this.previewLayer.select(null);
        this.update({ previewVisible: next, selectedFeature: next ? this.snapshot.selectedFeature : null });
    }
    setResultVisible(visible) {
        this.assertAlive();
        const next = Boolean(visible);
        this.resultLayer.setVisible(next);
        this.update({ resultVisible: next });
    }
    clearPreview() {
        this.assertAlive();
        this.previewLayer.clear();
        this.resultLayer.clear();
        this.update({ previewCount: 0, previewSourceCount: 0, previewLimited: false, previewSimplificationTolerance: 0, resultCount: 0, selectedFeature: null, lastResult: null, previewRevision: 0, operationProgress: null, error: null });
    }
    /** Wiersze tabeli wyników dla bieżącego podglądu. */
    getResultRows() {
        this.assertAlive();
        return this.previewLayer.getTableRows();
    }
    /** Zaznaczenie obiektu z tabeli: podświetlenie na mapie i dopasowanie widoku. */
    selectFeatureById(id, focus = true) {
        this.assertAlive();
        const selected = this.previewLayer.select(id == null ? null : String(id));
        this.update({ selectedFeature: selected ?? null });
        if (selected && focus) this.previewLayer.focusSelected();
        return selected;
    }
    clearSelectedFeature() {
        this.assertAlive();
        this.previewLayer.select(null);
        this.update({ selectedFeature: null });
    }
    focusSelectedFeature() {
        this.assertAlive();
        this.previewLayer.focusSelected();
    }
    focusAnalysisResult() {
        this.assertAlive();
        this.resultLayer.focus();
    }
    focusLastResult() {
        this.assertAlive();
        const id = this.snapshot.lastResult?.objectId;
        if (!id) return;
        try { this.objectManager.select(id); this.objectManager.focus(id); } catch {}
    }
    handleMapClick(click) {
        if (this.disposed || !this.snapshot.previewVisible || this.snapshot.previewCount <= 0 || this.snapshot.selectingBox) return;
        const selected = this.previewLayer.pick(click?.pixel, 6);
        if (selected) {
            this.update({ selectedFeature: selected });
            return;
        }
        if (this.snapshot.selectedFeature) {
            this.previewLayer.select(null);
            this.update({ selectedFeature: null });
        }
    }
    invalidateScreening() {
        if (this.screeningAbortController) { this.runSequence += 1; this.screeningAbortController.abort(); this.screeningAbortController = null; }
        this._screeningCache?.clear();
        if (this._showingScreening) { this.clearPreview(); this._showingScreening = false; }
        this.update({ screeningBusy: false, screeningResults: [], screeningUpdatedAt: null, screeningContext: null, screeningDetails: null, screeningProgress: null });
    }
    /** 18.12.0: limit budynków w screeningu (500–20 000), ustawiany w panelu. */
    setScreeningLimit(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        const limit = Math.round(clamp(n, 500, 20000));
        if (limit === this.snapshot.screeningLimit) return;
        this.invalidateScreening();
        this.update({ screeningLimit: limit, screeningError: null });
    }
    setScreeningRadius(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        const radius = Math.round(clamp(n, 100, 10000));
        if (radius === this.snapshot.screeningRadiusMeters) return;
        this.invalidateScreening();
        this.update({ screeningRadiusMeters: radius, screeningError: null });
    }
    async runParcelScreening() {
        this.assertAlive();
        this.setPanelMode('screening');
        if (this.snapshot.busy) { this.update({ screeningError: t('analysis.screening.error.busy') }); return null; }
        const selectedId = this.analysisSelectedId();
        if (!selectedId) { this.update({ screeningError: t('analysis.screening.error.noTarget') }); return null; }
        const object = this.objectManager.getObject(selectedId);
        const geometry = structuredClone(object.geometry);
        const targetRevision = this.snapshot.selectedObjectRevision;
        if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) { this.update({ screeningError: t('analysis.screening.error.polygon') }); return null; }
        const runId = ++this.runSequence;
        this.screeningAbortController?.abort();
        const controller = new AbortController();
        this.screeningAbortController = controller;
        const radius = this.snapshot.screeningRadiusMeters;
        const extent = geometryExtent(geometry);
        const requestExtent = expandExtent(extent, radius);
        const sourceIds = this.screeningSourceIds.filter((id) => this.registry.providers.has(id));
        if (!sourceIds.length) { this.update({ screeningError: t('analysis.screening.error.noSources') }); return null; }
        this._screeningCache = new Map();
        this._screeningRun = { geometry, extent, requestExtent, radius, selectedId, targetRevision, name: object.name };
        this.update({ screeningBusy: true, screeningError: null, screeningResults: [], screeningUpdatedAt: null, screeningProgress: { done: 0, total: sourceIds.length }, screeningDetails: null });
        return this.runScreeningSources(sourceIds, { runId, controller, replace: true });
    }
    /**
     * 18.12.1: źródła screeningu idą po 3 naraz (wcześniej jedno po drugim —
     * w najgorszym razie kilka minut) z postępem „N/M źródeł”. Ten sam kod
     * ponawia pojedyncze źródła z błędem (retryScreeningFailed).
     */
    async runScreeningSources(sourceIds, { runId, controller, replace }) {
        const run = this._screeningRun;
        const { geometry, extent, requestExtent, radius, selectedId, targetRevision } = run;
        const order = new Map((replace ? sourceIds : this.snapshot.screeningResults.map((row) => row.sourceId)).map((id, index) => [id, index]));
        const byId = new Map(replace ? [] : this.snapshot.screeningResults.map((row) => [row.sourceId, row]));
        let done = 0;
        const publish = () => this.update({
            screeningResults: [...byId.values()].sort((a, b) => (order.get(a.sourceId) ?? 99) - (order.get(b.sourceId) ?? 99)),
            screeningProgress: { done, total: sourceIds.length },
        });
        const processSource = async (sourceId) => {
            const provider = this.registry.get(sourceId);
            try {
                const loaded = await provider.load({ extent: requestExtent, limit: this.snapshot.screeningLimit, near: extent, signal: controller.signal });
                const features = (Array.isArray(loaded?.features) ? loaded.features : [])
                    .map((feature, index) => (feature?.id != null || feature?.properties?.id != null
                        ? feature
                        : { ...feature, id: `analysis-feature-${index + 1}` }));
                const approximate = Boolean(loaded?.metadata?.approximate);
                const analysis = approximate ? null : await analyzeFeatureDistances(geometry, features, { radiusMeters: radius, signal: controller.signal });
                if (controller.signal.aborted || runId !== this.runSequence) return;
                const nearest = analysis?.nearest;
                const distance = nearest ? nearest.distanceMeters : null;
                const collision = !approximate && distance !== null && distance <= 0.5;
                const row = {
                    sourceId, title: provider.title,
                    // 18.12.0: przy sortowaniu „najbliższe najpierw” obcięcie listy nie psuje
                    // odległości do najbliższego obiektu — tylko liczba w promieniu jest dolnym oszacowaniem.
                    status: (approximate && !features.length) || (!approximate && (loaded?.metadata?.incomplete || (loaded?.metadata?.truncated && !loaded?.metadata?.nearestReliable))) ? 'inconclusive' : 'ready', collision,
                    countLimited: Boolean(!approximate && loaded?.metadata?.truncated),
                    nearestDistanceMeters: distance, inRadiusCount: analysis?.inRadiusCount ?? null,
                    featureCount: features.length, approximate,
                    metadata: loaded?.metadata ?? {},
                };
                byId.set(sourceId, row);
                // 18.12.1: zachowujemy odległości do każdego obiektu — tabela wyników
                // screeningu pokazuje je w kolumnie i eksportuje do CSV.
                this._screeningCache.set(sourceId, {
                    features, analysisFeatures: analysis?.features ?? [], row,
                    distanceById: analysis ? Object.fromEntries(analysis.distances.map((entry) => [entry.id, entry.distanceMeters])) : null,
                    inRadiusIds: analysis ? [...analysis.inRadiusIds] : [],
                    radius,
                });
            } catch (error) {
                if (controller.signal.aborted || error?.name === 'AbortError') return;
                byId.set(sourceId, { sourceId, title: provider.title, status: 'error', collision: false, nearestDistanceMeters: null, inRadiusCount: 0, featureCount: 0, approximate: true, error: error instanceof Error ? error.message : String(error), code: error?.code ?? null });
            }
            done += 1;
            if (!controller.signal.aborted && runId === this.runSequence) publish();
        };
        try {
            const queue = [...sourceIds];
            const workers = Array.from({ length: Math.min(SCREENING_CONCURRENCY, queue.length) }, async () => {
                while (queue.length && !controller.signal.aborted && runId === this.runSequence) await processSource(queue.shift());
            });
            await Promise.all(workers);
            if (controller.signal.aborted || runId !== this.runSequence) return null;
            if (this.analysisSelectedId() !== selectedId || this.snapshot.selectedObjectRevision !== targetRevision) {
                this.update({ screeningBusy: false, screeningProgress: null, screeningError: t('analysis.screening.error.changed'), screeningResults: [] });
                return null;
            }
            publish();
            const results = this.snapshot.screeningResults;
            this.update({ screeningBusy: false, screeningProgress: null, screeningUpdatedAt: new Date().toISOString(), screeningContext: { selectedId, name: run.name, revision: targetRevision, radius }, screeningError: null });
            return results;
        } catch (error) {
            if (!controller.signal.aborted && runId === this.runSequence) {
                this.update({ screeningBusy: false, screeningProgress: null, screeningError: error instanceof Error ? error.message : String(error) });
            }
            return null;
        } finally {
            if (this.screeningAbortController === controller) this.screeningAbortController = null;
            if (controller.signal.aborted && runId === this.runSequence) this.update({ screeningBusy: false, screeningProgress: null });
        }
    }
    /** 18.12.1: ponawia tylko źródła screeningu z błędem, zostawiając pozostałe wyniki. */
    async retryScreeningFailed() {
        this.assertAlive();
        if (this.snapshot.screeningBusy || !this._screeningRun) return null;
        const failed = this.snapshot.screeningResults.filter((row) => row.status === 'error').map((row) => row.sourceId);
        if (!failed.length) return null;
        if (this.analysisSelectedId() !== this._screeningRun.selectedId) return this.runParcelScreening();
        const runId = ++this.runSequence;
        const controller = new AbortController();
        this.screeningAbortController = controller;
        this.update({ screeningBusy: true, screeningError: null, screeningProgress: { done: 0, total: failed.length } });
        return this.runScreeningSources(failed, { runId, controller, replace: false });
    }
    showScreeningResult(sourceId) {
        this.assertAlive();
        const cached = this._screeningCache?.get(sourceId);
        if (!cached) { this.update({ screeningError: t('analysis.screening.error.noData') }); return; }
        this._showingScreening = true;
        const previewCount = this.previewLayer.replace(cached.features, cached.row.metadata ?? {});
        this.previewLayer.setVisible(true);
        this.resultLayer.replace(cached.analysisFeatures ?? []);
        this.resultLayer.setVisible(true);
        this.update({ previewVisible: true, previewCount, previewRevision: this.snapshot.previewRevision + 1, resultVisible: true, resultCount: (cached.analysisFeatures ?? []).length, selectedFeature: null, lastResult: null, screeningError: null,
            screeningDetails: cached.distanceById ? { sourceId, title: cached.row.title, distanceById: cached.distanceById, inRadiusIds: cached.inRadiusIds, radiusMeters: cached.radius } : null });
        this.previewLayer.focus();
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.abortController?.abort();
        this.screeningAbortController?.abort();
        this.cancelBoxSelection?.();
        this.unsubscribeMapClick?.();
        this.unsubscribeObjects?.();
        this.unsubscribeMutations?.();
        this.previewLayer.dispose();
        this.resultLayer.dispose();
        this.listeners.clear();
        this.registry.clear();
    }
    resolveExtent() {
        if (this.snapshot.areaMode === 'viewport') return this.host.getViewportExtent2180();
        if (this.snapshot.areaMode === 'box') {
            if (!this.snapshot.customExtent) throw new Error(t('analysis.error.noBox'));
            return [...this.snapshot.customExtent];
        }
        const selectedId = this.analysisSelectedId();
        if (!selectedId) throw new Error(t('analysis.error.noAreaObject'));
        return geometryExtent(this.objectManager.getObject(selectedId).geometry);
    }
    resolveTargetGeometry(extent = null) {
        if (this.snapshot.areaMode === 'selected') {
            const selectedId = this.analysisSelectedId();
            if (!selectedId) throw new Error(t('analysis.error.noTargetObject'));
            return structuredClone(this.objectManager.getObject(selectedId).geometry);
        }
        const resolved = extent ?? this.resolveExtent();
        return extentToPolygon(resolved);
    }
    /**
     * 18.0: zaznaczony obiekt projektu, który może być obiektem analizy.
     * Pomiar (wymiar, powierzchnia) jest pomocą rysunkową, nie obiektem
     * projektu — nie wyznacza obszaru ani celu analizy.
     */
    analysisSelectedId() {
        const id = this.objectManager.getSnapshot().selectedId;
        if (!id) return null;
        return this.objectManager.getObject(id)?.kind === 'measurement' ? null : id;
    }
    /** 18.1: rejestruje źródło danych (z deklaracji funkcji) i odświeża listę w panelu. */
    registerSource(provider, { screening = false } = {}) {
        this.assertAlive();
        this.registry.register(provider);
        if (screening) this.screeningSourceIds.push(provider.id);
        const sources = this.registry.list();
        this.update({ sources, sourceId: this.snapshot.sourceId ?? sources[0]?.id ?? null });
        return provider;
    }
    /** 19.23.0: usuwa źródło, którego dane nie są dostępne na serwerze. */
    unregisterSource(id) {
        if (this.disposed || !this.registry.unregister(id)) return false;
        this.screeningSourceIds = this.screeningSourceIds.filter((sourceId) => sourceId !== id);
        const sources = this.registry.list();
        const sourceId = this.snapshot.sourceId === id ? sources[0]?.id ?? null : this.snapshot.sourceId;
        this.update({ sources, sourceId });
        return true;
    }
    syncSelectedObject() {
        if (this.disposed) return;
        const objectSnapshot = this.objectManager.getSnapshot();
        const id = this.analysisSelectedId();
        const item = id ? objectSnapshot.items.find((entry) => entry.id === id) : null;
        const revision = item?.updatedAt ?? null;
        if (this.snapshot.selectedObjectId === (id ?? null) && this.snapshot.selectedObjectName === (item?.name ?? null) && this.snapshot.selectedObjectRevision === revision) return;
        this.invalidateScreening();
        this.update({ selectedObjectId: id ?? null, selectedObjectName: item?.name ?? null, selectedObjectRevision: revision });
    }
    update(patch) {
        if (this.disposed) return;
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners) listener();
    }
    assertAlive() {
        if (this.disposed) throw new Error('AnalysisManager został już zamknięty.'); // dev: błąd programisty, nie komunikat dla użytkownika
    }
}
