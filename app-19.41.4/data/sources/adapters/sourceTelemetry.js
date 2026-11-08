import { unByKey } from 'ol/Observable.js';
import { healthFromOutcomes } from './healthState.js';
import { t } from '../../../i18n/index.js';

function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
function clone(state) { return { ...state, recentOutcomes: [...state.recentOutcomes] }; }
/** Lightweight runtime telemetry for raster sources. */
export function createSourceTelemetry(initialTransport = t('sources.zrodlo')) {
    const listeners = new Set();
    const tileStarts = new WeakMap();
    // 17.8.11: kafle, których pobieranie zostało przerwane albo które
    // OpenLayers zwolnił w trakcie ładowania. Dla nich nie przychodzi ani
    // tileloadend, ani tileloaderror, więc licznik inFlight rósł bez końca —
    // stąd trwałe „ładuje" przy ukrytych warstwach i „Ładowanie podkładu"
    // na pasku stanu przy w pełni wczytanej mapie.
    const settled = new WeakSet();
    const pending = new Set();
    let cachedSnapshot = null;
    let cycleStartedAt = null;
    let state = {
        transport: initialTransport,
        inFlight: 0,
        requests: 0,
        successes: 0,
        tileErrors: 0,
        fallbackCount: 0,
        fallbackStandardCount: 0,
        fallbackWmsCount: 0,
        lastFallbackAt: null,
        lastStaleAt: null,
        retries: 0,
        timeouts: 0,
        aborts: 0,
        validationErrors: 0,
        staleHits: 0,
        circuitRejects: 0,
        circuitState: 'closed',
        circuitOpenUntil: 0,
        health: 'unknown',
        recentOutcomes: [],
        lastBatchMs: null,
        lastTileMs: null,
        lastErrorAt: null,
        lastGoodAt: null,
        lastValidatedWidth: null,
        lastValidatedHeight: null,
        lastTerminalError: null,
        cacheStatus: null,
        cacheAgeSeconds: null,
        upstreamMs: null,
    };
    const emit = () => { for (const listener of listeners) listener(); };
    const update = (patch, shouldEmit = true) => {
        state = { ...state, ...patch };
        cachedSnapshot = null;
        if (shouldEmit) emit();
    };
    const finishCycle = (patch, timestamp) => {
        if (patch.inFlight === 0 && cycleStartedAt !== null) {
            patch.lastBatchMs = Math.round(timestamp - cycleStartedAt);
            cycleStartedAt = null;
        }
        return patch;
    };
    const recalcHealth = (recentOutcomes = state.recentOutcomes, circuitState = state.circuitState) => healthFromOutcomes(recentOutcomes, circuitState);

    return {
        // Ta sama referencja, dopóki stan się nie zmienił — pozwala panelom
        // pominąć przerysowanie wierszy warstw, w których nic się nie stało.
        getSnapshot: () => (cachedSnapshot ??= clone(state)),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        tileStart(tile) {
            const timestamp = nowMs();
            if (tile && typeof tile === 'object') {
                if (pending.has(tile)) return;
                tileStarts.set(tile, timestamp);
                settled.delete(tile);
                pending.add(tile);
            }
            if (state.inFlight === 0) cycleStartedAt = timestamp;
            update({ inFlight: state.inFlight + 1, requests: state.requests + 1 }, state.inFlight === 0);
        },
        /**
         * Kafel/obraz opuścił kolejkę bez zdarzenia końca (przerwanie,
         * zwolnienie przez OpenLayers). Zdejmuje go z licznika bez liczenia
         * jako błąd; ewentualne późniejsze zdarzenie tego kafla jest pomijane.
         */
        markAborted(tile) {
            if (!tile || typeof tile !== 'object' || !pending.has(tile)) return;
            pending.delete(tile);
            tileStarts.delete(tile);
            settled.add(tile);
            const timestamp = nowMs();
            const patch = finishCycle({ inFlight: Math.max(0, state.inFlight - 1), aborts: state.aborts + 1 }, timestamp);
            update(patch, patch.inFlight === 0);
        },
        tileEnd(tile) {
            const timestamp = nowMs();
            if (tile && typeof tile === 'object') {
                // Duplicate or late end events must not affect another active tile.
                if (!pending.has(tile)) return;
                pending.delete(tile);
            }
            const startedAt = tile && typeof tile === 'object' ? tileStarts.get(tile) : null;
            if (tile && typeof tile === 'object') tileStarts.delete(tile);
            const nextInFlight = Math.max(0, state.inFlight - 1);
            const patch = {
                inFlight: nextInFlight,
                successes: state.successes + 1,
                lastGoodAt: Date.now(),
                lastTileMs: Number.isFinite(startedAt) ? Math.round(timestamp - startedAt) : state.lastTileMs,
            };
            if (nextInFlight === 0 && cycleStartedAt !== null) {
                patch.lastBatchMs = Math.round(timestamp - cycleStartedAt);
                cycleStartedAt = null;
            }
            update(patch, nextInFlight === 0);
        },
        tileError(tile) {
            const timestamp = nowMs();
            if (tile && typeof tile === 'object') {
                if (!pending.has(tile)) return;
                pending.delete(tile);
            }
            const startedAt = tile && typeof tile === 'object' ? tileStarts.get(tile) : null;
            if (tile && typeof tile === 'object') tileStarts.delete(tile);
            const nextInFlight = Math.max(0, state.inFlight - 1);
            const patch = {
                inFlight: nextInFlight,
                tileErrors: state.tileErrors + 1,
                lastErrorAt: Date.now(),
                lastTileMs: Number.isFinite(startedAt) ? Math.round(timestamp - startedAt) : state.lastTileMs,
            };
            if (nextInFlight === 0 && cycleStartedAt !== null) {
                patch.lastBatchMs = Math.round(timestamp - cycleStartedAt);
                cycleStartedAt = null;
            }
            update(patch, true);
        },
        setTransport(transport) {
            if (!transport || state.transport === transport) return;
            update({ transport }, true);
        },
        recordFallback(kind) {
            const isWms = kind === 'wms';
            const transport = isWms ? 'WMS fallback' : kind === 'standard' ? 'WMTS Standard' : state.transport;
            update({
                transport,
                fallbackCount: state.fallbackCount + 1,
                fallbackStandardCount: state.fallbackStandardCount + (kind === 'standard' ? 1 : 0),
                fallbackWmsCount: state.fallbackWmsCount + (isWms ? 1 : 0),
                lastFallbackAt: Date.now(),
            }, true);
        },
        recordRetry() { update({ retries: state.retries + 1 }, true); },
        recordTimeout() { update({ timeouts: state.timeouts + 1, lastErrorAt: Date.now() }, true); },
        recordAbort() { update({ aborts: state.aborts + 1 }, false); },
        recordValidationError() { update({ validationErrors: state.validationErrors + 1, lastErrorAt: Date.now() }, true); },
        recordStaleHit() { update({ staleHits: state.staleHits + 1, lastStaleAt: Date.now() }, true); },
        recordCircuitReject(openUntil, circuitState = 'open') {
            const stateName = circuitState === 'half-open' ? 'half-open' : 'open';
            update({
                circuitRejects: state.circuitRejects + 1,
                circuitState: stateName,
                circuitOpenUntil: openUntil ?? state.circuitOpenUntil,
                health: stateName === 'open' ? 'circuit-open' : recalcHealth(state.recentOutcomes, stateName),
            }, true);
        },
        setCircuit(circuit) {
            const circuitState = circuit?.state ?? 'closed';
            update({
                circuitState,
                circuitOpenUntil: circuit?.openUntil ?? 0,
                health: recalcHealth(state.recentOutcomes, circuitState),
            }, true);
        },
        recordOutcome(ok) {
            const outcomes = [...state.recentOutcomes, Boolean(ok)].slice(-20);
            update({ recentOutcomes: outcomes, health: recalcHealth(outcomes, state.circuitState) }, false);
        },
        recordValidated(dimensions) {
            update({
                lastGoodAt: Date.now(),
                lastValidatedWidth: dimensions?.width ?? state.lastValidatedWidth,
                lastValidatedHeight: dimensions?.height ?? state.lastValidatedHeight,
                lastTerminalError: null,
            }, false);
        },
        recordResponseMeta(meta) {
            if (!meta || typeof meta !== 'object') return;
            update({
                cacheStatus: meta.cacheStatus ?? state.cacheStatus,
                cacheAgeSeconds: Number.isFinite(meta.cacheAgeSeconds) ? meta.cacheAgeSeconds : state.cacheAgeSeconds,
                upstreamMs: Number.isFinite(meta.upstreamMs) ? meta.upstreamMs : state.upstreamMs,
            }, false);
        },
        recordTerminalError(message) {
            update({ lastTerminalError: String(message || t('sources.bladZrodla')), lastErrorAt: Date.now() }, true);
        },
        clearRuntimeCounters() {
            cycleStartedAt = null;
            pending.clear();
            update({
                inFlight: 0, requests: 0, successes: 0, tileErrors: 0,
                fallbackCount: 0, fallbackStandardCount: 0, fallbackWmsCount: 0,
                lastFallbackAt: null, lastStaleAt: null,
                retries: 0, timeouts: 0, aborts: 0, validationErrors: 0,
                staleHits: 0, circuitRejects: 0, recentOutcomes: [], health: 'unknown',
                lastBatchMs: null, lastTileMs: null, lastErrorAt: null,
                lastGoodAt: null, lastTerminalError: null, cacheStatus: null, cacheAgeSeconds: null, upstreamMs: null,
            }, true);
        },
        dispose() { listeners.clear(); pending.clear(); },
    };
}

// Stany kafla/obrazu OpenLayers (ol/TileState, ol/ImageState): 0 IDLE, 4 EMPTY.
const STATE_IDLE = 0;
const STATE_EMPTY = 4;

/**
 * 17.8.11: OpenLayers zwalnia kafel w trakcie ładowania (np. przy przycinaniu
 * pamięci podręcznej podczas szybkiego przybliżania) bez zdarzenia końca.
 * Nasłuch na zmianę stanu samego kafla domyka taki kafel w telemetrii.
 */
function watchRelease(telemetry, item) {
    if (!item || typeof item.addEventListener !== 'function' || typeof item.getState !== 'function') return;
    const onChange = () => {
        const state = item.getState();
        if (state === STATE_EMPTY || state === STATE_IDLE) {
            item.removeEventListener('change', onChange);
            telemetry.markAborted(item);
        } else if (state !== 1) {
            item.removeEventListener('change', onChange);
        }
    };
    item.addEventListener('change', onChange);
}

export function observeTileSource(source, initialTransport) {
    const telemetry = createSourceTelemetry(initialTransport);
    const keys = [
        source.on('tileloadstart', (event) => { telemetry.tileStart(event.tile); watchRelease(telemetry, event.tile); }),
        source.on('tileloadend', (event) => telemetry.tileEnd(event.tile)),
        source.on('tileloaderror', (event) => telemetry.tileError(event.tile)),
    ];
    return {
        ...telemetry,
        dispose() { unByKey(keys); telemetry.dispose(); },
    };
}

export function observeImageSource(source, initialTransport) {
    const telemetry = createSourceTelemetry(initialTransport);
    const keys = [
        source.on('imageloadstart', (event) => { telemetry.tileStart(event.image); watchRelease(telemetry, event.image); }),
        source.on('imageloadend', (event) => telemetry.tileEnd(event.image)),
        source.on('imageloaderror', (event) => telemetry.tileError(event.image)),
    ];
    return {
        ...telemetry,
        dispose() { unByKey(keys); telemetry.dispose(); },
    };
}
