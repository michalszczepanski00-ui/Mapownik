import { unByKey } from 'ol/Observable.js';
import { t } from '../../../i18n/index.js';
const DEFAULT_RENDER_TIMEOUT_MS = 15000;
/** Wait until an ImageWMS source produces its first image. */
export function createImageRenderWaiter(source, timeoutMs = DEFAULT_RENDER_TIMEOUT_MS) {
    return (signal) => new Promise((resolve, reject) => {
        if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
            reject(new DOMException(t('sources.operacjaAnulowana'), 'AbortError'));
            return;
        }
        let settled = false;
        let timeout = null;
        const keys = [];
        const cleanup = () => {
            if (timeout !== null)
                clearTimeout(timeout);
            timeout = null;
            if (keys.length)
                unByKey(keys.splice(0));
            signal === null || signal === void 0 ? void 0 : signal.removeEventListener('abort', onAbort);
        };
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            error ? reject(error) : resolve();
        };
        const onAbort = () => finish(new DOMException(t('sources.operacjaAnulowana'), 'AbortError'));
        keys.push(source.on('imageloadend', () => finish()), source.on('imageloaderror', () => undefined));
        signal === null || signal === void 0 ? void 0 : signal.addEventListener('abort', onAbort, { once: true });
        timeout = setTimeout(() => finish(new Error(t('sources.brakPoprawnieWyrenderowanegoObrazuWms', { value: Math.round(timeoutMs / 1000) }))), timeoutMs);
    });
}
