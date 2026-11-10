import { createWmsLayer } from './adapters/wmsAdapter.js';
import { createWmtsCapabilitiesLayer } from './adapters/wmtsCapabilitiesAdapter.js';
import { createXyzLayer } from './adapters/xyzAdapter.js';
import { createFastWmtsLayer } from './adapters/fastWmtsAdapter.js';
import { createTileRenderWaiter } from './adapters/tileReadiness.js';
import { createImageRenderWaiter } from './adapters/imageReadiness.js';
import { observeImageSource, observeTileSource } from './adapters/sourceTelemetry.js';
import { attachResilientImageSource, attachResilientTileSource } from './resilience/resilientLoaders.js';
import { createWmsTransport } from './adapters/wmsTransport.js';
import { createKowrPointsLayer } from './adapters/kowrPointsAdapter.js';
import { createVectorStyleLayer, tilesLoadedWaiter } from './adapters/vectorStyleAdapter.js';
import { createDemRasterLayer } from './adapters/demAdapter.js';
import { toBaseLayerOptions } from './adapters/layerOptions.js';

export class UnsupportedSourceKindError extends Error {
    constructor(kind) {
        super(`Nieobsługiwany rodzaj źródła: ${kind}`);
        this.name = 'UnsupportedSourceKindError';
    }
}

function tileHandle(definition, layer, transport, timeout = 15000, resilient = false) {
    const source = layer.getSource();
    const telemetry = source ? observeTileSource(source, transport) : null;
    const resilience = source && resilient ? attachResilientTileSource(source, telemetry, {
        sourceId: definition.id,
        transport,
        timeoutMs: 12000,
        minDimension: 16,
    }) : null;
    return {
        layer,
        telemetry,
        cancelPending: resilience?.cancelPending ?? (() => undefined),
        waitUntilRenderable: source ? createTileRenderWaiter(source, timeout, { minCoverage: definition.role === 'basemap' ? 0.65 : 0.5, minLoaded: definition.role === 'basemap' ? 3 : 2 }) : undefined,
        dispose: () => { resilience?.dispose?.(); telemetry?.dispose(); },
    };
}

/** Registry of source-kind adapters. */
export class SourceRegistry {
    constructor() {
        this.adapters = new Map();
        // 19.30.0: podkłady wektorowe OSM (Pastel, Zmierzch, Kartograficzny) i warstwy z modelu wysokości.
        this.register('vector-style', async (definition, signal) => {
            if (definition.source.kind !== 'vector-style') throw new Error('Nieprawidłowy adapter mapy wektorowej.');
            const { layer, source, dispose } = await createVectorStyleLayer(definition, definition.source, signal);
            const telemetry = source ? observeTileSource(source, 'Wektor OSM') : null;
            return { layer, telemetry, waitUntilRenderable: source ? tilesLoadedWaiter(source) : undefined, dispose: () => { telemetry?.dispose(); dispose?.(); } };
        });
        this.register('dem', (definition) => {
            if (definition.source.kind !== 'dem') throw new Error('Nieprawidłowy adapter modelu wysokości.');
            return tileHandle(definition, createDemRasterLayer(toBaseLayerOptions(definition), definition.source.mode), 'Model wysokości', 20000);
        });
        this.register('xyz', (definition) => {
            if (definition.source.kind !== 'xyz') throw new Error('Nieprawidłowy adapter XYZ.');
            // OSM/XYZ already has a very mature browser cache. Keep native loading
            // here; the resilience layer targets WMS/WMTS services that are less stable.
            return tileHandle(definition, createXyzLayer(definition, definition.source), 'XYZ');
        });
        this.register('fast-wmts', (definition) => {
            if (definition.source.kind !== 'fast-wmts') throw new Error('Nieprawidłowy adapter Fast WMTS.');
            const handle = createFastWmtsLayer(definition, definition.source);
            const source = handle.layer.getSource();
            return {
                ...handle,
                waitUntilRenderable: source ? createTileRenderWaiter(source, 15000, { minCoverage: definition.role === 'basemap' ? 0.65 : 0.5, minLoaded: definition.role === 'basemap' ? 3 : 2 }) : undefined,
            };
        });
        this.register('wms', (definition) => {
            if (definition.source.kind !== 'wms') throw new Error('Nieprawidłowy adapter WMS.');
            const layer = createWmsLayer(definition, definition.source);
            const source = layer.getSource();
            if (!source) return { layer };
            // 17.8.3: direct upstream first, same-origin proxy as fallback (per catalog).
            const wmsTransport = createWmsTransport(definition);
            const readyTimeout = Math.max(15000, (definition.source.transport === 'proxy' ? 0 : definition.source.directTimeoutMs ?? 6000) + (definition.source.proxyTimeoutMs ?? 15000) + 2000);
            const transportOptions = {
                candidatesFor: wmsTransport.candidatesFor,
                onCandidateResult: wmsTransport.onCandidateResult,
            };
            if (definition.source.tiled === false) {
                const telemetry = observeImageSource(source, wmsTransport.mode === 'proxy' ? 'ImageWMS' : 'ImageWMS direct');
                const resilience = attachResilientImageSource(source, telemetry, {
                    sourceId: definition.id,
                    transport: 'ImageWMS',
                    timeoutMs: 13000,
                    minDimension: 16,
                    // 19.47.0: jeden obraz na widok NIE jest przerywany przy zmianie widoku. OpenLayers zamawia go
                    // na początku przybliżenia, a „movestart” (nowa generacja zapytań) przychodzi chwilę później —
                    // zapytanie było przerywane przed wysłaniem, obraz zostawał na zawsze w stanie „ładuje”
                    // i warstwa (np. rysunek MPZP) przestawała się odświeżać przy przybliżaniu. Po zatrzymaniu
                    // mapy OpenLayers zamawia nowy obraz sam, a starszą odpowiedź pomija.
                    cancelOnGeneration: false,
                    ...transportOptions,
                });
                return {
                    layer,
                    telemetry,
                    cancelPending: resilience.cancelPending,
                    waitUntilRenderable: createImageRenderWaiter(source, readyTimeout),
                    dispose: () => { resilience.dispose(); telemetry.dispose(); },
                };
            }
            const telemetry = observeTileSource(source, wmsTransport.mode === 'proxy' ? 'TileWMS' : 'TileWMS direct');
            const resilience = attachResilientTileSource(source, telemetry, {
                sourceId: definition.id,
                transport: 'TileWMS',
                timeoutMs: 12000,
                minDimension: 16,
                ...transportOptions,
            });
            return {
                layer,
                telemetry,
                cancelPending: resilience.cancelPending,
                waitUntilRenderable: createTileRenderWaiter(source, readyTimeout, { minCoverage: definition.role === 'basemap' ? 0.65 : 0.5, minLoaded: definition.role === 'basemap' ? 3 : 2 }),
                dispose: () => { resilience.dispose(); telemetry.dispose(); },
            };
        });
        this.register('wmts-capabilities', async (definition, signal) => {
            if (definition.source.kind !== 'wmts-capabilities') throw new Error('Nieprawidłowy adapter WMTS.');
            const layer = await createWmtsCapabilitiesLayer(definition, definition.source, signal);
            return tileHandle(definition, layer, 'WMTS', 15000, true);
        });
        this.register('kowr-points', createKowrPointsLayer);
    }
    register(kind, adapter, options = {}) {
        if (this.adapters.has(kind) && !options.replace) throw new Error(`Adapter źródła ${kind} jest już zarejestrowany.`);
        this.adapters.set(kind, adapter);
    }
    unregister(kind) { this.adapters.delete(kind); }
    has(kind) { return this.adapters.has(kind); }
    async createLayer(definition, signal) {
        const kind = definition.source.kind;
        const adapter = this.adapters.get(kind);
        if (!adapter) throw new UnsupportedSourceKindError(kind);
        return adapter(definition, signal);
    }
}
