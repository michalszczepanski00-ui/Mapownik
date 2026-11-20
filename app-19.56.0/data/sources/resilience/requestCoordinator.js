let generation = 0;
let nextId = 1;
const active = new Map();

export function getRasterRequestGeneration() {
    return generation;
}

export function registerRasterRequest(cancel, meta = {}) {
    if (typeof cancel !== 'function') return () => undefined;
    const id = nextId++;
    active.set(id, { cancel, generation, meta });
    return () => active.delete(id);
}

export function beginRasterRequestGeneration(reason = 'view-change') {
    generation += 1;
    for (const [id, item] of [...active.entries()]) {
        if (item.meta?.cancelOnGeneration === false) continue;
        active.delete(id);
        try { item.cancel(reason); } catch { /* cancellation must never break navigation */ }
    }
    return generation;
}

export function cancelRasterRequestsForSource(sourceId, reason = 'source-cancel') {
    for (const [id, item] of [...active.entries()]) {
        if (item.meta?.sourceId !== sourceId) continue;
        active.delete(id);
        try { item.cancel(reason); } catch { /* best effort */ }
    }
}

export function getRasterRequestCoordinatorSnapshot() {
    return {
        generation,
        active: active.size,
        sources: [...active.values()].reduce((result, item) => {
            const key = item.meta?.sourceId ?? 'unknown';
            result[key] = (result[key] ?? 0) + 1;
            return result;
        }, {}),
    };
}
