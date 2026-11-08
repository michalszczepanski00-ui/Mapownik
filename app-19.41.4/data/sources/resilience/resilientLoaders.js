import { acquireRasterSlot, serviceGroupKey } from './upstreamGate.js';
import {
    getRasterRequestGeneration,
    registerRasterRequest,
    cancelRasterRequestsForSource,
} from './requestCoordinator.js';
import { t } from '../../../i18n/index.js';

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRY_DELAYS = [500, 1500];
const FAILURE_WINDOW_MS = 30000;
const FAILURE_THRESHOLD = 8;
const CIRCUIT_COOLDOWN_MS = 60000;
const MIN_IMAGE_BYTES = 64;
const MIN_IMAGE_DIMENSION = 16;
const circuits = new Map();

function now() { return Date.now(); }
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException(t('sources.operacjaAnulowana'), 'AbortError'));
            return;
        }
        const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
        const onAbort = () => { clearTimeout(timer); cleanup(); reject(new DOMException(t('sources.operacjaAnulowana'), 'AbortError')); };
        const cleanup = () => signal?.removeEventListener('abort', onAbort);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

function isAbortError(error) {
    return error instanceof DOMException && error.name === 'AbortError';
}
function isTimeoutError(error) {
    return error instanceof Error && error.name === 'TimeoutError';
}
function timeoutError() {
    const error = new Error(t('sources.przekroczonoCzasLadowaniaZrodla'));
    error.name = 'TimeoutError';
    return error;
}
function validationError(message) {
    const error = new Error(message);
    error.name = 'ValidationError';
    return error;
}
function normalizeUrl(url) {
    try { return new URL(url, window.location.href).toString(); }
    catch { return String(url); }
}
function isSameOrigin(url) {
    try { return new URL(url, window.location.href).origin === window.location.origin; }
    catch { return false; }
}
function pruneFailures(state, timestamp = now()) {
    state.failures = state.failures.filter((item) => timestamp - item < FAILURE_WINDOW_MS);
}

/**
 * 18.16.1 — ręczne „Spróbuj ponownie” (podkład, warstwa) zeruje bezpiecznik źródła.
 * Automatyczne próby nadal respektują blokadę; świadoma decyzja użytkownika nie
 * może czekać minuty bez żadnego zapytania. Stan jest mutowany, bo loadery
 * trzymają referencję do obiektu.
 */
export function resetSourceCircuit(sourceId) {
    const state = circuits.get(serviceGroupKey(sourceId || 'source'));
    if (!state) return false;
    state.failures = [];
    state.openUntil = 0;
    state.halfOpenInFlight = false;
    return true;
}

export function createCircuitBreaker(sourceId, options = {}) {
    const key = serviceGroupKey(sourceId || 'source');
    if (!circuits.has(key)) circuits.set(key, { failures: [], openUntil: 0, halfOpenInFlight: false });
    const state = circuits.get(key);
    const threshold = options.failureThreshold ?? FAILURE_THRESHOLD;
    const cooldownMs = options.cooldownMs ?? CIRCUIT_COOLDOWN_MS;
    return {
        beforeRequest() {
            const timestamp = now();
            pruneFailures(state, timestamp);
            if (state.openUntil > timestamp) return { allowed: false, state: 'open', openUntil: state.openUntil };
            if (state.openUntil > 0) {
                if (state.halfOpenInFlight) return { allowed: false, state: 'half-open', openUntil: 0 };
                state.halfOpenInFlight = true;
                return { allowed: true, state: 'half-open', openUntil: 0 };
            }
            return { allowed: true, state: 'closed', openUntil: 0 };
        },
        success() {
            state.failures = [];
            state.openUntil = 0;
            state.halfOpenInFlight = false;
            return { state: 'closed', openUntil: 0 };
        },
        failure() {
            const timestamp = now();
            const wasHalfOpen = state.halfOpenInFlight || (state.openUntil > 0 && state.openUntil <= timestamp);
            state.halfOpenInFlight = false;
            pruneFailures(state, timestamp);
            state.failures.push(timestamp);
            if (wasHalfOpen || state.failures.length >= threshold) state.openUntil = timestamp + cooldownMs;
            return { state: state.openUntil > timestamp ? 'open' : 'closed', openUntil: state.openUntil, failures: state.failures.length };
        },
        releaseHalfOpen() {
            if (state.halfOpenInFlight) state.halfOpenInFlight = false;
            return {
                state: state.openUntil > now() ? 'open' : 'closed',
                openUntil: state.openUntil > now() ? state.openUntil : 0,
                failures: state.failures.length,
            };
        },
        snapshot() {
            const timestamp = now();
            pruneFailures(state, timestamp);
            return {
                state: state.openUntil > timestamp ? 'open' : state.halfOpenInFlight ? 'half-open' : 'closed',
                openUntil: state.openUntil > timestamp ? state.openUntil : 0,
                recentFailures: state.failures.length,
            };
        },
        reset() { state.failures = []; state.openUntil = 0; state.halfOpenInFlight = false; },
    };
}

/**
 * 17.8.11: wymiary obrazu z nagłówka pliku (PNG, JPEG, GIF) bez dekodowania.
 * Zwraca null dla innych formatów — wtedy działa pełne dekodowanie jak dawniej.
 */
async function sniffImageSize(blob) {
    const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
    if (head.length >= 24 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
        const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
        return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) {
        let i = 2;
        while (i + 9 < head.length) {
            if (head[i] !== 0xff) { i += 1; continue; }
            const marker = head[i + 1];
            if (marker === 0xff) { i += 1; continue; }
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
            const length = (head[i + 2] << 8) | head[i + 3];
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return { height: (head[i + 5] << 8) | head[i + 6], width: (head[i + 7] << 8) | head[i + 8] };
            }
            if (length < 2) return null;
            i += 2 + length;
        }
        return null;
    }
    if (head.length >= 10 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) {
        return { width: head[6] | (head[7] << 8), height: head[8] | (head[9] << 8) };
    }
    return null;
}

function parseRasterSizeHeader(value) {
    const match = /^(\d+)x(\d+)$/.exec(String(value ?? '').trim());
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

async function validateBlob(blob, minDimension, signal, sourceId, cancelOnGeneration, knownSize = null) {
    if (signal?.aborted) throw new DOMException(t('sources.operacjaAnulowana'), 'AbortError');
    if (!(blob instanceof Blob) || blob.size < MIN_IMAGE_BYTES) throw validationError(t('sources.odpowiedzObrazuJestZbytMala'));
    // 17.8.11: obraz z własnego serwera był dekodowany dwa razy — tutaj tylko
    // po to, by poznać wymiary, i drugi raz w <img>, który go wyświetla. Serwer
    // (api/wms.php) sprawdza obraz sam i podaje wymiary w X-msportal-Raster-Size;
    // gdy nagłówka brak, wymiary czytamy z nagłówka pliku. Pełne dekodowanie
    // zostaje tylko dla formatów, których nie umiemy tak odczytać.
    const size = knownSize ?? await sniffImageSize(blob).catch(() => null);
    if (size && size.width > 0 && size.height > 0) {
        if (size.width < minDimension || size.height < minDimension) {
            throw validationError(t('sources.nieprawidlowyWymiarObrazu', { width: size.width, height: size.height }));
        }
        return { width: size.width, height: size.height };
    }
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        try {
            if (bitmap.width < minDimension || bitmap.height < minDimension) {
                throw validationError(t('sources.nieprawidlowyWymiarObrazu', { width: bitmap.width, height: bitmap.height }));
            }
            return { width: bitmap.width, height: bitmap.height };
        } finally { bitmap.close?.(); }
    }
    const objectUrl = URL.createObjectURL(blob);
    try { return await probeImage(objectUrl, minDimension, 4000, signal, sourceId, cancelOnGeneration); }
    finally { URL.revokeObjectURL(objectUrl); }
}

function probeImage(url, minDimension, timeoutMs, signal, sourceId = 'probe', cancelOnGeneration = false, crossOrigin = null) {
    return new Promise((resolve, reject) => {
        const probe = new Image();
        // 19.37.1: dla źródeł z CORS (WMTS GUGiK) próbka musi mieć crossOrigin — kafel przejmuje ten element,
        // a bez tego płótno mapy jest „brudne” i eksport PNG/PDF się nie udaje.
        if (crossOrigin) probe.crossOrigin = crossOrigin;
        let settled = false;
        let timer = null;
        const unregister = registerRasterRequest((reason) => {
            if (settled) return;
            settled = true;
            probe.src = '';
            cleanup();
            const error = new DOMException(t('sources.operacjaAnulowana2', { reason }), 'AbortError');
            reject(error);
        }, { sourceId, cancelOnGeneration });
        const cleanup = () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            probe.onload = null;
            probe.onerror = null;
            signal?.removeEventListener('abort', onAbort);
            unregister();
        };
        const finish = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve({ width: probe.naturalWidth, height: probe.naturalHeight, element: probe });
        };
        const onAbort = () => finish(new DOMException(t('sources.operacjaAnulowana'), 'AbortError'));
        probe.onload = () => {
            if (probe.naturalWidth < minDimension || probe.naturalHeight < minDimension) {
                finish(validationError(t('sources.nieprawidlowyWymiarObrazu2', { naturalWidth: probe.naturalWidth, naturalHeight: probe.naturalHeight })));
                return;
            }
            finish();
        };
        probe.onerror = () => finish(new Error(t('sources.nieUdaloSieZdekodowacObrazu')));
        timer = setTimeout(() => finish(timeoutError()), timeoutMs);
        signal?.addEventListener('abort', onAbort, { once: true });
        probe.src = url;
    });
}

/**
 * 17.8.3 — load a cross-origin image straight into the element OpenLayers is
 * waiting on (ImageWMS). Error events, and load events of undersized images,
 * are stopped before they reach OpenLayers, so a failed direct attempt can
 * still fall back to the proxy. The response is downloaded exactly once.
 */
// Listeners of loadIntoElement use the capture flag: at the target they run
// before this (bubble) guard and before OpenLayers' own listeners.
function createErrorGuard(image) {
    let active = true;
    const onError = (event) => { if (active) event.stopImmediatePropagation(); };
    image.addEventListener('error', onError);
    return {
        release() {
            if (!active) return;
            active = false;
            image.removeEventListener('error', onError);
        },
    };
}

function loadIntoElement(image, url, minDimension, timeoutMs, signal, sourceId, cancelOnGeneration) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer = null;
        const cleanup = () => {
            if (timer !== null) clearTimeout(timer);
            timer = null;
            image.removeEventListener('load', onLoad, true);
            image.removeEventListener('error', onError, true);
            signal?.removeEventListener('abort', onAbort);
            unregister();
        };
        const fail = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            // Cancel the pending network request; the resulting error event is
            // swallowed by the caller's error guard.
            image.removeAttribute('src');
            reject(error);
        };
        const onLoad = (event) => {
            if (settled) return;
            if (image.naturalWidth < minDimension || image.naturalHeight < minDimension) {
                event.stopImmediatePropagation();
                fail(validationError(t('sources.nieprawidlowyWymiarObrazu2', { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })));
                return;
            }
            settled = true;
            cleanup();
            resolve({ width: image.naturalWidth, height: image.naturalHeight, inElement: true });
        };
        const onError = () => fail(new Error(t('sources.nieUdaloSieZdekodowacObrazu')));
        const onAbort = () => fail(new DOMException(t('sources.operacjaAnulowana'), 'AbortError'));
        const unregister = registerRasterRequest((reason) => fail(new DOMException(t('sources.operacjaAnulowana2', { reason }), 'AbortError')), { sourceId, cancelOnGeneration });
        image.addEventListener('load', onLoad, true);
        image.addEventListener('error', onError, true);
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => fail(timeoutError()), timeoutMs);
        // Deferred: OpenLayers inspects image.src right after the load function
        // returns and must keep using event listeners, not image.decode().
        queueMicrotask(() => { if (!settled) image.src = url; });
    });
}

async function fetchValidatedBlob(url, { timeoutMs, minDimension, signal, sourceId, cancelOnGeneration }) {
    const controller = new AbortController();
    let timedOut = false;
    let canceledReason = null;
    const onAbort = () => { canceledReason = 'outer-abort'; controller.abort(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const unregister = registerRasterRequest((reason) => {
        canceledReason = reason;
        controller.abort();
    }, { sourceId, cancelOnGeneration });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            cache: 'default',
            credentials: 'same-origin',
            headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.1' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        if (!contentType.includes('image/')) throw validationError(t('sources.zrodloZwrociloZamiastObrazu', { value: contentType || t('sources.unknownType') }));
        const blob = await response.blob();
        const dimensions = await validateBlob(blob, minDimension, signal, sourceId, cancelOnGeneration, parseRasterSizeHeader(response.headers.get('X-msportal-Raster-Size')));
        const cacheStatus = response.headers.get('X-msportal-Cache');
        const cacheAgeSeconds = Number(response.headers.get('X-msportal-Cache-Age'));
        const upstreamMs = Number(response.headers.get('X-msportal-Upstream-Ms'));
        return { blob, ...dimensions, responseMeta: {
            cacheStatus: cacheStatus || null,
            cacheAgeSeconds: Number.isFinite(cacheAgeSeconds) ? cacheAgeSeconds : null,
            upstreamMs: Number.isFinite(upstreamMs) ? upstreamMs : null,
        } };
    } catch (error) {
        if (timedOut) throw timeoutError();
        if (controller.signal.aborted || signal?.aborted) {
            const aborted = new DOMException(t('sources.operacjaAnulowana3', { value: canceledReason ? `: ${canceledReason}` : '' }), 'AbortError');
            throw aborted;
        }
        throw error;
    } finally {
        clearTimeout(timer);
        unregister();
        signal?.removeEventListener('abort', onAbort);
    }
}

function forceImageError(image) {
    image.src = 'data:application/octet-stream;base64,AA==';
}

function assignObjectUrl(image, blob) {
    const objectUrl = URL.createObjectURL(blob);
    const revoke = () => URL.revokeObjectURL(objectUrl);
    image.addEventListener('load', revoke, { once: true });
    image.addEventListener('error', revoke, { once: true });
    image.src = objectUrl;
}

function restoreLastGood(image, state, telemetry) {
    // 17.6.4: lastGood is always just a URL now (see the fetchedBlob branch
    // above) — same-origin and cross-origin alike — so this always falls
    // back through a fresh request (browser HTTP cache on a hit) rather
    // than holding a decoded blob copy alive for the tile's whole lifetime.
    if (!state.lastGood?.url) return false;
    telemetry?.recordStaleHit?.();
    image.src = state.lastGood.url;
    return true;
}

function healthPatchFromCircuit(result) {
    return { state: result.state, openUntil: result.openUntil ?? 0 };
}

function defaultCandidates(src, transport, retryDelays) {
    return [{ url: src, transport, retries: retryDelays.length, retryDelays }];
}

function createLoader({ sourceId, telemetry, transport, candidatesFor, onCandidateResult, adoptProbeElement = false, crossOrigin = null, timeoutMs = DEFAULT_TIMEOUT_MS, retryDelays = DEFAULT_RETRY_DELAYS, minDimension = MIN_IMAGE_DIMENSION, cancelOnGeneration = false, getImageElement }) {
    const reportCandidate = (candidate, ok) => {
        try { onCandidateResult?.(candidate, ok); } catch { /* policy hooks must never break loading */ }
    };
    const tileState = new WeakMap();
    const circuit = createCircuitBreaker(sourceId);

    const cancelPending = (reason = 'source-cancel') => cancelRasterRequestsForSource(sourceId, reason);

    const loadFunction = (target, src) => {
        const image = getImageElement(target);
        if (!image) return;
        let state = tileState.get(target);
        if (!state) {
            state = { token: 0, controller: null, lastGood: null };
            tileState.set(target, state);
        }
        state.controller?.abort();
        const controller = new AbortController();
        state.controller = controller;
        const token = ++state.token;
        const generation = getRasterRequestGeneration();
        const unregisterTask = registerRasterRequest(() => controller.abort(), { sourceId, generation, cancelOnGeneration });
        const errorGuard = adoptProbeElement ? null : createErrorGuard(image);
        let halfOpenProbe = false;

        const run = async () => {
            let gate = circuit.beforeRequest();
            // When the cooldown expires, only one request is allowed to probe the
            // source. Other requests wait briefly for that probe instead of
            // stampeding the recovered endpoint.
            for (let waitStep = 0; !gate.allowed && gate.state === 'half-open' && waitStep < 40; waitStep += 1) {
                telemetry?.setCircuit?.(healthPatchFromCircuit(gate));
                await sleep(150, controller.signal);
                gate = circuit.beforeRequest();
            }
            telemetry?.setCircuit?.(healthPatchFromCircuit(gate));
            if (!gate.allowed) {
                telemetry?.recordCircuitReject?.(gate.openUntil, gate.state);
                errorGuard?.release();
                if (!restoreLastGood(image, state, telemetry)) forceImageError(image);
                return;
            }

            halfOpenProbe = gate.state === 'half-open';

            const resolvedCandidates = await Promise.resolve(candidatesFor?.(src) ?? defaultCandidates(src, transport, retryDelays));
            const candidates = (resolvedCandidates ?? []).filter((item) => item?.url);
            let finalError = null;
            for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
                const candidate = candidates[candidateIndex];
                if (typeof candidate.beforeLoad === 'function') {
                    const allowed = await candidate.beforeLoad(controller.signal);
                    if (!allowed) continue;
                }
                if (candidateIndex > 0 && candidate.fallbackKind) telemetry?.recordFallback?.(candidate.fallbackKind);
                telemetry?.setTransport?.(candidate.transport ?? transport);
                const delays = Array.isArray(candidate.retryDelays) ? candidate.retryDelays : retryDelays;
                const retries = Number.isInteger(candidate.retries) ? candidate.retries : delays.length;
                let candidateFailed = false;
                for (let attempt = 0; attempt <= retries; attempt += 1) {
                    if (controller.signal.aborted || token !== state.token || (cancelOnGeneration && generation !== getRasterRequestGeneration())) {
                        telemetry?.recordAbort?.('generation');
                        try { candidate.onAbort?.(); } catch { /* ignore policy cleanup errors */ }
                        throw new DOMException(t('sources.operacjaAnulowana'), 'AbortError');
                    }
                    if (attempt > 0) {
                        telemetry?.recordRetry?.();
                        await sleep(delays[Math.min(attempt - 1, delays.length - 1)] ?? 500, controller.signal);
                    }
                    const candidateUrl = normalizeUrl(candidate.url);
                    let releaseSlot = null;
                    try {
                        releaseSlot = await acquireRasterSlot(candidateUrl, controller.signal);
                        let fetchedBlob = null;
                        let dimensions = null;
                        if (isSameOrigin(candidateUrl)) {
                            const result = await fetchValidatedBlob(candidateUrl, { timeoutMs: candidate.timeoutMs ?? timeoutMs, minDimension, signal: controller.signal, sourceId, cancelOnGeneration });
                            fetchedBlob = result.blob;
                            dimensions = { width: result.width, height: result.height };
                            telemetry?.recordResponseMeta?.(result.responseMeta);
                        } else if (errorGuard) {
                            dimensions = await loadIntoElement(image, candidateUrl, minDimension, candidate.timeoutMs ?? timeoutMs, controller.signal, sourceId, cancelOnGeneration);
                        } else {
                            dimensions = await probeImage(candidateUrl, minDimension, candidate.timeoutMs ?? timeoutMs, controller.signal, sourceId, cancelOnGeneration, crossOrigin);
                        }
                        if (controller.signal.aborted || token !== state.token || (cancelOnGeneration && generation !== getRasterRequestGeneration())) {
                            telemetry?.recordAbort?.('generation');
                            throw new DOMException(t('sources.operacjaAnulowana'), 'AbortError');
                        }
                        errorGuard?.release();
                        if (fetchedBlob) {
                            // 17.6.4: same-origin tiles (our own proxy/cache) are
                            // reachable again by URL, so there is no reason to keep
                            // the decoded blob itself alive in JS memory for as long
                            // as the tile stays in OpenLayers' own cache — that
                            // doubled retention for every cached same-origin tile.
                            // Remember only the URL, exactly like the cross-origin
                            // path below; restoreLastGood() re-requests it through
                            // the browser's own HTTP cache (near-instant on a hit).
                            state.lastGood = { url: candidateUrl, transport: candidate.transport ?? transport };
                            assignObjectUrl(image, fetchedBlob);
                        } else {
                            state.lastGood = { url: candidateUrl, transport: candidate.transport ?? transport };
                            // 17.8.3: a tile adopts the already decoded probe image, so a
                            // cross-origin WMS response (often sent without cache headers)
                            // is downloaded once instead of twice.
                            if (dimensions?.inElement) {
                                // Already loaded in place; OpenLayers received the load event.
                            } else if (adoptProbeElement && dimensions?.element && typeof target?.setImage === 'function') {
                                target.setImage(dimensions.element);
                            } else {
                                image.src = candidateUrl;
                            }
                        }
                        const { element: _probeElement, inElement: _inElement, ...validatedDimensions } = dimensions ?? {};
                        dimensions = validatedDimensions;
                        reportCandidate(candidate, true);
                        telemetry?.recordValidated?.(dimensions);
                        telemetry?.recordOutcome?.(true);
                        halfOpenProbe = false;
                        telemetry?.setCircuit?.(healthPatchFromCircuit(circuit.success()));
                        return;
                    } catch (error) {
                        if (isAbortError(error)) {
                            try { candidate.onAbort?.(); } catch { /* ignore policy cleanup errors */ }
                            throw error;
                        }
                        finalError = error;
                        if (isTimeoutError(error)) telemetry?.recordTimeout?.();
                        if (error instanceof Error && error.name === 'ValidationError') telemetry?.recordValidationError?.();
                        if (attempt >= retries) candidateFailed = true;
                    } finally { releaseSlot?.(); }
                }
                if (candidateFailed) reportCandidate(candidate, false);
            }
            errorGuard?.release();
            const circuitState = circuit.failure();
            halfOpenProbe = false;
            telemetry?.recordOutcome?.(false);
            telemetry?.setCircuit?.(healthPatchFromCircuit(circuitState));
            if (restoreLastGood(image, state, telemetry)) return;
            if (finalError) telemetry?.recordTerminalError?.(finalError.message ?? String(finalError));
            forceImageError(image);
        };

        void run().catch((error) => {
            errorGuard?.release();
            if (!isAbortError(error)) {
                telemetry?.recordTerminalError?.(error instanceof Error ? error.message : String(error));
                forceImageError(image);
            } else if (token === state.token) {
                // 17.8.11: przerwane, a nie zastąpione nowszym pobraniem tego
                // samego kafla — zdejmij je z licznika „w toku" i zakończ kafel
                // błędem. Kafel pozostawiony w stanie LOADING trzymał na stałe
                // jedno z 16 miejsc kolejki pobierania OpenLayers (także po
                // usunięciu warstwy), więc każde przerwanie spowalniało mapę.
                // Dotyczy tylko kafli (kolejka pobierania). Pojedynczy obraz WMS
                // nie zajmuje kolejki, a wymuszony błąd kończyłby się wpisem
                // „Image load error" w konsoli przy każdym przesunięciu mapy.
                telemetry?.markAborted?.(target);
                if (typeof target?.getTileCoord === 'function' && typeof target.getState === 'function' && target.getState() === 1) forceImageError(image);
            }
        }).finally(() => {
            if (halfOpenProbe) {
                halfOpenProbe = false;
                telemetry?.setCircuit?.(healthPatchFromCircuit(circuit.releaseHalfOpen()));
            }
            errorGuard?.release();
            unregisterTask();
            if (state.controller === controller) state.controller = null;
        });
    };

    return { loadFunction, cancelPending, circuit };
}

export function attachResilientTileSource(source, telemetry, options) {
    if (!source || typeof source.setTileLoadFunction !== 'function') return { dispose: () => undefined, cancelPending: () => undefined };
    const resilience = createLoader({
        adoptProbeElement: true,
        ...options,
        telemetry,
        getImageElement: (tile) => tile?.getImage?.() ?? null,
    });
    source.setTileLoadFunction(resilience.loadFunction);
    return {
        cancelPending: resilience.cancelPending,
        dispose() { resilience.cancelPending('dispose'); },
    };
}

export function attachResilientImageSource(source, telemetry, options) {
    if (!source || typeof source.setImageLoadFunction !== 'function') return { dispose: () => undefined, cancelPending: () => undefined };
    const resilience = createLoader({
        ...options,
        telemetry,
        getImageElement: (wrapper) => wrapper?.getImage?.() ?? null,
    });
    source.setImageLoadFunction(resilience.loadFunction);
    return {
        cancelPending: resilience.cancelPending,
        dispose() { resilience.cancelPending('dispose'); },
    };
}

export function resetResilienceCircuits() {
    circuits.clear();
}
