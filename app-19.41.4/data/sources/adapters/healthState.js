const RECENT_ISSUE_MS = 2 * 60 * 1000;

export function healthFromOutcomes(outcomes, circuitState) {
    if (circuitState === 'open') return 'circuit-open';
    if (!outcomes.length) return 'unknown';
    // Three consecutive successful images establish that a recovered service
    // works again, even while older failures remain in the diagnostic history.
    if (outcomes.length >= 3 && outcomes.slice(-3).every(Boolean)) return 'healthy';
    const success = outcomes.filter(Boolean).length / outcomes.length;
    if (success >= 0.90) return 'healthy';
    if (success >= 0.60) return 'degraded';
    return 'down';
}

export function hasRecentSourceIssue(telemetry, now = Date.now()) {
    if (!telemetry) return false;
    if (telemetry.health === 'degraded') return true;
    const lastGood = Number.isFinite(telemetry.lastGoodAt) ? telemetry.lastGoodAt : -Infinity;
    const unresolved = [telemetry.lastErrorAt, telemetry.lastStaleAt]
        .some((value) => Number.isFinite(value) && value > lastGood && now - value <= RECENT_ISSUE_MS);
    // A successful proxy fallback is a normal recovery path; it is not an
    // outstanding source issue after a valid image has been received.
    return unresolved;
}

export function sourceIsDown(telemetry) {
    return telemetry?.circuitState === 'open' || ['down', 'circuit-open'].includes(telemetry?.health);
}
