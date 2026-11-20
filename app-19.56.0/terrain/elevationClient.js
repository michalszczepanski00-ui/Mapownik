import { t } from '../i18n/index.js';
import { normalizeElevation } from './profileChart.js';

const abortError = () => new DOMException(t('terrain.progress.aborted'), 'AbortError');
function pause(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(abortError());
        const abort = () => { clearTimeout(timer); reject(abortError()); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
        signal?.addEventListener('abort', abort, { once: true });
    });
}

/** Two short PHP requests at a time; retain successes and retry only gaps. */
export async function fetchElevations(points, {
    signal, initialHeights = [], onProgress = () => {}, onPartial = () => {}, fetchImpl = fetch,
    batchSize = 40, maxAttempts = 4, retryDelay = 600, timeoutMs = 20000,
} = {}) {
    if (signal?.aborted) throw abortError();
    const heights = points.map((_, i) => {
        const height = normalizeElevation(initialHeights[i]);
        return height !== null && height > -1000 && height < 10000 ? height : null;
    });
    const attempts = points.map(() => 0);
    const noDataReplies = points.map(() => 0);
    const failures = new Set();
    const diagnostics = [];
    let metadata = {}, active = 0, requests = 0, consecutiveFailures = 0, outage = false;
    const report = () => onProgress({ total: points.length,
        received: heights.filter(Number.isFinite).length,
        pending: heights.filter((h, i) => h === null && !failures.has(i)).length,
        failed: failures.size, active, requests, outage,
        retrying: attempts.some((n, i) => n > 1 && heights[i] === null && !failures.has(i)),
    });
    async function run(indices) {
        if (signal?.aborted) throw abortError();
        if (outage) { indices.forEach((i) => { if (heights[i] === null) failures.add(i); }); report(); return; }
        const attempt = Math.max(...indices.map((i) => attempts[i])) + 1;
        if (attempt > 1) await pause(retryDelay * 2 ** (attempt - 2), signal);
        if (outage) { indices.forEach((i) => { if (heights[i] === null) failures.add(i); }); report(); return; }
        indices.forEach((i) => { attempts[i] += 1; });
        const controller = new AbortController();
        const cancel = () => controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        const timeout = setTimeout(cancel, timeoutMs);
        const started = Date.now();
        let payload = null, error = null;
        active += 1; requests += 1; report();
        try {
            const response = await fetchImpl('./api/terrain.php', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                cache: 'no-store', signal: controller.signal,
                body: JSON.stringify({ points: indices.map((i) => points[i]), sampleIds: indices }),
            });
            payload = await response.json();
            if (!response.ok || !payload?.ok || !Array.isArray(payload.heights)
                || payload.heights.length !== indices.length
                || !Array.isArray(payload.sampleIds) || payload.sampleIds.some((id, j) => id !== indices[j])) {
                throw new Error(payload?.error || t('terrain.progress.invalidReply', { status: response.status }));
            }
            metadata = { source: payload.source, model: payload.model,
                verticalDatum: payload.verticalDatum, heightType: payload.heightType, heightUnit: payload.heightUnit };
            indices.forEach((i, j) => {
                const height = normalizeElevation(payload.heights[j]);
                if (height !== null && height > -1000 && height < 10000) heights[i] = height;
                else if (payload.statuses?.[j] === 'no_data') noDataReplies[i] += 1;
            });
            onPartial(heights.slice());
        } catch (caught) {
            if (signal?.aborted) throw abortError();
            error = controller.signal.aborted ? t('terrain.progress.timeout') : String(caught?.message || caught);
        } finally {
            clearTimeout(timeout); signal?.removeEventListener('abort', cancel);
            active -= 1;
            diagnostics.push({ samples: indices.length, attempt, durationMs: Date.now() - started,
                received: indices.filter((i) => heights[i] !== null).length, error,
                upstream: payload?.diagnostics ?? [] });
        }
        if (signal?.aborted) throw abortError();
        const upstreamFailed = payload?.diagnostics?.length > 0
            && payload.diagnostics.every((item) => item.received === 0 && (item.error || item.httpStatus >= 500));
        if (indices.some((i) => heights[i] !== null)) consecutiveFailures = 0;
        else if (error || upstreamFailed) consecutiveFailures += 1;
        // Bound requests during a service outage; a later explicit retry can resume.
        if (consecutiveFailures >= 6) outage = true;
        const missing = indices.filter((i) => heights[i] === null);
        const retry = missing.filter((i) => attempts[i] < maxAttempts);
        missing.filter((i) => attempts[i] >= maxAttempts).forEach((i) => failures.add(i));
        report();
        // A failing packet is split. Complete packets are never downloaded again.
        const size = Math.max(1, Math.ceil(indices.length / 2));
        for (let i = 0; i < retry.length; i += size) await run(retry.slice(i, i + size));
    }
    const remaining = points.map((_, i) => i).filter((i) => heights[i] === null);
    const queue = [];
    for (let i = 0; i < remaining.length; i += batchSize) queue.push(remaining.slice(i, i + batchSize));
    let next = 0;
    async function consume() {
        while (next < queue.length) { const task = queue[next++]; await run(task); }
    }
    report();
    await Promise.all([consume(), consume()]);
    if (signal?.aborted) throw abortError();
    return { ...metadata, heights, diagnostics, attempts,
        statuses: heights.map((h, i) => h !== null ? 'ok' : noDataReplies[i] >= 2 ? 'no_data' : 'failed'),
        complete: heights.every(Number.isFinite) };
}
