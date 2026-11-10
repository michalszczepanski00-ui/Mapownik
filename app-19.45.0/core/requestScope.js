import { t } from '../i18n/index.js';
/** Timer covers response consumption as well as waiting for headers. */
export function requestScope(timeoutMs = 30000, parentSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abort();
    else parentSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException(t('request.timeout'), 'TimeoutError')), timeoutMs);
    return { controller, signal: controller.signal, dispose() { clearTimeout(timer); parentSignal?.removeEventListener('abort', abort); } };
}
