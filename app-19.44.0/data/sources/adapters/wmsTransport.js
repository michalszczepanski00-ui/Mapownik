import { t } from '../../../i18n/index.js';
/**
 * msportal 17.8.3 — coordinated WMS transport policy.
 *
 * For direct-then-proxy sources only one initial direct request is allowed to
 * probe the upstream. Other requests briefly wait for that decision instead of
 * creating a burst of parallel direct timeouts. A validated direct response is
 * trusted for a bounded period; repeated direct failures switch the source to
 * proxy-first mode.
 */

const STICKY_FAILURE_THRESHOLD = 2;
const STICKY_PROXY_MS = 10 * 60 * 1000;
const DIRECT_VERIFIED_MS = 5 * 60 * 1000;
// 17.6.4: these four constants bound the worst case per tile. Previously a
// request that waited out every stage (probe wait + direct + retry + proxy)
// could take ~54 s before the tile was ever marked failed, during which the
// layer simply never appeared and the app looked hung. The tightened budget
// below caps the worst case at ~18 s, and restoreLastGood() still covers the
// gap with the last good tile well before that.
const PROBE_WAIT_MS = 4000;
const MAX_WMS_PIXELS = 4096;
const DEFAULT_DIRECT_TIMEOUT_MS = 6000;
const DEFAULT_PROXY_TIMEOUT_MS = 12000;

const stickyStates = new Map();

function now() { return Date.now(); }
function abortError() { return new DOMException(t('sources.operacjaAnulowana'), 'AbortError'); }

function stickyStateFor(sourceId) {
    const key = String(sourceId || 'wms');
    if (!stickyStates.has(key)) {
        stickyStates.set(key, {
            directFailStreak: 0,
            preferProxyUntil: 0,
            directVerifiedUntil: 0,
            directOk: 0,
            directFailed: 0,
            proxyOk: 0,
            proxyFailed: 0,
            decision: 'unknown',
            probeInFlight: false,
            probeUntil: 0,
            waiters: new Set(),
        });
    }
    return stickyStates.get(key);
}

function notifyDecision(sticky) {
    for (const resolve of sticky.waiters) resolve(sticky.decision);
    sticky.waiters.clear();
}

function setDecision(sticky, decision) {
    sticky.decision = decision;
    sticky.probeInFlight = false;
    sticky.probeUntil = 0;
    if (decision === 'direct') {
        sticky.directVerifiedUntil = now() + DIRECT_VERIFIED_MS;
        sticky.preferProxyUntil = 0;
    } else if (decision === 'proxy') {
        sticky.directVerifiedUntil = 0;
        sticky.preferProxyUntil = Math.max(sticky.preferProxyUntil, now() + STICKY_PROXY_MS);
    }
    notifyDecision(sticky);
}

function refreshDecision(sticky) {
    const ts = now();
    if (sticky.decision === 'direct' && sticky.directVerifiedUntil <= ts) sticky.decision = 'unknown';
    if (sticky.decision === 'proxy' && sticky.preferProxyUntil <= ts) sticky.decision = 'unknown';
    if (sticky.probeInFlight && sticky.probeUntil > 0 && sticky.probeUntil <= ts) {
        sticky.probeInFlight = false;
        sticky.probeUntil = 0;
        if (sticky.decision === 'unknown') notifyDecision(sticky);
    }
    if (sticky.decision === 'unknown' && sticky.probeInFlight && sticky.preferProxyUntil > ts) {
        sticky.probeInFlight = false;
        sticky.decision = 'proxy';
        notifyDecision(sticky);
    }
}

function waitForDecision(sticky, signal, timeoutMs = PROBE_WAIT_MS) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(abortError()); return; }
        let settled = false;
        const finish = (value, error = null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            sticky.waiters.delete(onDecision);
            signal?.removeEventListener('abort', onAbort);
            if (error) reject(error); else resolve(value);
        };
        const onDecision = (value) => finish(value);
        const onAbort = () => finish(null, abortError());
        const timer = setTimeout(() => finish('proxy'), timeoutMs);
        sticky.waiters.add(onDecision);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

function findParamKey(params, name) {
    const wanted = name.toUpperCase();
    for (const key of params.keys()) if (key.toUpperCase() === wanted) return key;
    return null;
}
function readParam(params, name) {
    const key = findParamKey(params, name);
    return key === null ? null : params.get(key);
}

export function scaleWmsRequestSize(src, factor) {
    if (!(factor > 1)) return src;
    try {
        const url = new URL(src, window.location.href);
        for (const name of ['WIDTH', 'HEIGHT']) {
            const key = findParamKey(url.searchParams, name);
            if (key === null) continue;
            const value = Number(url.searchParams.get(key));
            if (!Number.isFinite(value) || value <= 0) continue;
            url.searchParams.set(key, String(Math.min(MAX_WMS_PIXELS, Math.round(value * factor))));
        }
        return url.toString();
    } catch { return src; }
}

export function buildProxyUrlFromDirect(proxyBase, directSrc) {
    try {
        const direct = new URL(directSrc, window.location.href);
        const params = direct.searchParams;
        const bbox = readParam(params, 'BBOX');
        const width = readParam(params, 'WIDTH');
        const height = readParam(params, 'HEIGHT');
        const crs = (readParam(params, 'CRS') ?? readParam(params, 'SRS') ?? 'EPSG:3857').toUpperCase();
        if (!bbox || !width || !height) return null;
        const proxy = new URL(proxyBase, window.location.href);
        proxy.searchParams.set('BBOX', bbox);
        proxy.searchParams.set('WIDTH', width);
        proxy.searchParams.set('HEIGHT', height);
        proxy.searchParams.set('SRS', crs);
        const time = readParam(params, 'TIME');
        if (time) proxy.searchParams.set('TIME', time);
        return proxy.toString();
    } catch { return null; }
}

export function usesDirectTransport(source) {
    return Boolean(source && source.directUrl && (source.transport ?? 'proxy') !== 'proxy');
}

export function createWmsTransport(definition) {
    const source = definition.source;
    const mode = usesDirectTransport(source) ? source.transport : 'proxy';
    const dpiScale = source.tiled !== false && Number(source.dpiScale) > 1 ? Number(source.dpiScale) : 1;
    const directTimeoutMs = source.directTimeoutMs ?? DEFAULT_DIRECT_TIMEOUT_MS;
    const proxyTimeoutMs = source.proxyTimeoutMs ?? DEFAULT_PROXY_TIMEOUT_MS;
    const sticky = stickyStateFor(definition.id);

    async function beforeDirect(signal, bypass = false) {
        if (mode === 'direct' || bypass) return true;
        refreshDecision(sticky);
        if (sticky.preferProxyUntil > now() || sticky.decision === 'proxy') return false;
        if (sticky.decision === 'direct') return true;
        if (!sticky.probeInFlight) {
            sticky.probeInFlight = true;
            sticky.probeUntil = now() + directTimeoutMs + 2000;
            return true;
        }
        const decision = await waitForDecision(sticky, signal);
        return decision === 'direct';
    }

    function releaseDirectProbe() {
        if (!sticky.probeInFlight) return;
        sticky.probeInFlight = false;
        sticky.probeUntil = 0;
        if (sticky.decision === 'unknown') notifyDecision(sticky);
    }

    function candidatesFor(src) {
        const scaled = scaleWmsRequestSize(src, dpiScale);
        if (mode === 'proxy') return [{ url: scaled, transport: 'WMS proxy', mode: 'proxy', timeoutMs: proxyTimeoutMs }];
        const direct = {
            url: scaled,
            transport: 'WMS direct',
            mode: 'direct',
            retries: 0,
            timeoutMs: directTimeoutMs,
            beforeLoad: (signal) => beforeDirect(signal, false),
            onAbort: releaseDirectProbe,
        };
        if (mode === 'direct') return [{ ...direct, retries: 1, retryDelays: [700], beforeLoad: undefined, onAbort: undefined }];
        const proxyUrl = buildProxyUrlFromDirect(source.url, src);
        if (!proxyUrl) return [direct];
        const proxy = {
            url: scaleWmsRequestSize(proxyUrl, dpiScale),
            transport: 'WMS proxy',
            mode: 'proxy',
            // 17.6.4: no retry here. This candidate is already the fallback after
            // a failed/skipped direct attempt — a second full proxyTimeoutMs pass
            // used to add up to 20.8 s on top of an already-failing chain. The
            // browser-level tile retry (resilientLoaders' own DEFAULT_RETRY_DELAYS)
            // still covers a genuinely transient proxy failure on the next tile load.
            retries: 0,
            timeoutMs: proxyTimeoutMs,
        };
        refreshDecision(sticky);
        if (sticky.preferProxyUntil > now() || sticky.decision === 'proxy') {
            return [proxy, { ...direct, fallbackKind: 'wms', beforeLoad: (signal) => beforeDirect(signal, true), onAbort: undefined }];
        }
        return [direct, { ...proxy, fallbackKind: 'wms' }];
    }

    function onCandidateResult(candidate, ok) {
        if (candidate?.mode === 'direct') {
            if (ok) {
                sticky.directOk += 1;
                sticky.directFailStreak = 0;
                setDecision(sticky, 'direct');
            } else {
                sticky.directFailed += 1;
                sticky.directFailStreak += 1;
                if (sticky.probeInFlight || sticky.directFailStreak >= STICKY_FAILURE_THRESHOLD) {
                    setDecision(sticky, 'proxy');
                    sticky.directFailStreak = 0;
                }
            }
        } else if (candidate?.mode === 'proxy') {
            if (ok) sticky.proxyOk += 1; else sticky.proxyFailed += 1;
        }
    }

    return {
        mode,
        dpiScale,
        candidatesFor,
        onCandidateResult,
        snapshot: () => {
            refreshDecision(sticky);
            const { waiters: _waiters, ...rest } = sticky;
            return { mode, dpiScale, ...rest, proxyPreferred: sticky.preferProxyUntil > now() };
        },
    };
}

export function getWmsTransportSnapshot() {
    const output = {};
    for (const [key, value] of stickyStates.entries()) {
        refreshDecision(value);
        const { waiters: _waiters, ...rest } = value;
        output[key] = { ...rest, proxyPreferred: value.preferProxyUntil > now() };
    }
    return output;
}

export function resetWmsTransportState() {
    for (const sticky of stickyStates.values()) {
        sticky.decision = 'unknown';
        sticky.probeInFlight = false;
        sticky.probeUntil = 0;
        notifyDecision(sticky);
    }
    stickyStates.clear();
}
