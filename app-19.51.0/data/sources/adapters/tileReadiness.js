import { unByKey } from 'ol/Observable.js';
import TileState from 'ol/TileState.js';
import { t } from '../../../i18n/index.js';

const DEFAULT_RENDER_TIMEOUT_MS = 15000;
const DEFAULT_COVERAGE = 0.65;
const QUIET_MS = 220;
const FIRST_TILE_GRACE_MS = 900;

/**
 * Wait until a tile source has produced enough of the current render batch to
 * be useful on screen. A single successful tile is not sufficient for a
 * basemap switch because it could hide the previous basemap while most of the
 * viewport is still blank.
 */
export function createTileRenderWaiter(source, timeoutMs = DEFAULT_RENDER_TIMEOUT_MS, options = {}) {
    const minCoverage = Math.min(1, Math.max(0.25, Number(options.minCoverage ?? DEFAULT_COVERAGE)));
    const preferredMinLoaded = Math.max(1, Math.trunc(options.minLoaded ?? 3));
    return (signal) => new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException(t('sources.operacjaAnulowana'), 'AbortError'));
            return;
        }
        let settled = false;
        let timeout = null;
        let quietTimer = null;
        let firstLoadedAt = null;
        const keys = [];
        const started = new Set();
        const loaded = new Set();
        const failed = new Set();

        const cleanup = () => {
            if (timeout !== null) clearTimeout(timeout);
            if (quietTimer !== null) clearTimeout(quietTimer);
            timeout = null;
            quietTimer = null;
            if (keys.length) unByKey(keys.splice(0));
            signal?.removeEventListener('abort', onAbort);
        };
        const finish = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error); else resolve();
        };
        const onAbort = () => finish(new DOMException(t('sources.operacjaAnulowana'), 'AbortError'));

        const isReady = () => {
            const total = Math.max(1, started.size);
            const ok = loaded.size;
            const terminal = loaded.size + failed.size;
            const inFlight = Math.max(0, total - terminal);
            const coverage = ok / total;
            if (ok === 0) return false;
            if (total <= 2) return inFlight === 0;
            const minLoaded = Math.min(preferredMinLoaded, Math.max(2, Math.ceil(total * 0.35)));
            if (ok >= minLoaded && coverage >= minCoverage && inFlight <= Math.max(1, Math.floor(total * 0.35))) return true;
            // Avoid waiting forever for one slow/out-of-view tile after a mostly
            // successful batch. This still requires more than the first tile.
            return firstLoadedAt !== null
                && Date.now() - firstLoadedAt >= FIRST_TILE_GRACE_MS
                && ok >= 2
                && coverage >= 0.5;
        };
        const scheduleCheck = () => {
            if (quietTimer !== null) clearTimeout(quietTimer);
            quietTimer = setTimeout(() => {
                quietTimer = null;
                if (isReady()) finish();
            }, QUIET_MS);
        };
        const remember = (event, outcome) => {
            const tile = event?.tile;
            if (!tile) return;
            started.add(tile);
            if (outcome === 'loaded' && tile.getState?.() === TileState.LOADED) {
                loaded.add(tile);
                failed.delete(tile);
                if (firstLoadedAt === null) firstLoadedAt = Date.now();
            } else if (outcome === 'failed') {
                failed.add(tile);
                loaded.delete(tile);
            }
            scheduleCheck();
        };

        keys.push(
            source.on('tileloadstart', (event) => remember(event, 'start')),
            source.on('tileloadend', (event) => remember(event, 'loaded')),
            source.on('tileloaderror', (event) => remember(event, 'failed')),
        );
        signal?.addEventListener('abort', onAbort, { once: true });
        timeout = setTimeout(() => {
            const total = Math.max(1, started.size);
            const coverage = loaded.size / total;
            finish(new Error(t('sources.niepelnyRenderZrodlaPoS', { seconds: Math.round(timeoutMs / 1000), loaded: loaded.size, started: started.size || 0, percent: Math.round(coverage * 100) })));
        }, timeoutMs);
    });
}
