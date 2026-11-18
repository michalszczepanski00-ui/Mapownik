import { useCallback, useSyncExternalStore } from 'react';
import { useService } from '../services/AppServicesContext.js';
/** Shell layout only needs start/stop, not every cursor-position metric. */
export function useSketchActive() {
    const service = useService('sketch');
    const subscribe = useCallback((listener) => service?.subscribe?.(listener) ?? (() => undefined), [service]);
    const getSnapshot = useCallback(() => Boolean(service?.getSnapshot?.().active), [service]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
