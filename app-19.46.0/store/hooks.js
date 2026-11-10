import { useSyncExternalStore } from 'react';
import { store } from './store.js';
export function useAppDispatch() {
    return store.dispatch;
}
export function useAppSelector(selector) {
    if (typeof selector !== 'function')
        throw new TypeError('useAppSelector wymaga selektora.');
    return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}
