import { mapViewReducer, initialMapViewState } from './mapViewSlice.js';
import { uiReducer, initialUiState } from './uiSlice.js';
import { panelsReducer, initialPanelsState } from './panelsSlice.js';
let state = {
    ui: initialUiState,
    panels: initialPanelsState,
    mapView: initialMapViewState,
};
const listeners = new Set();
let dispatching = false;
function getState() {
    return state;
}
function subscribe(listener) {
    if (typeof listener !== 'function')
        throw new TypeError('store.subscribe wymaga funkcji.');
    listeners.add(listener);
    return () => listeners.delete(listener);
}
function dispatch(action) {
    if (!action || typeof action.type !== 'string')
        throw new TypeError('Nieprawidłowa akcja store.');
    if (dispatching)
        throw new Error('Nie można dispatchować podczas redukcji stanu.');
    const prev = state;
    try {
        dispatching = true;
        const nextUi = uiReducer(prev.ui, action);
        const nextPanels = panelsReducer(prev.panels, action);
        const nextMapView = mapViewReducer(prev.mapView, action);
        if (nextUi !== prev.ui || nextPanels !== prev.panels || nextMapView !== prev.mapView) {
            state = { ui: nextUi, panels: nextPanels, mapView: nextMapView };
        }
    }
    finally {
        dispatching = false;
    }
    if (state !== prev) {
        for (const listener of [...listeners]) {
            try {
                listener();
            }
            catch (error) {
                console.error('msportal store listener error', error);
            }
        }
    }
    return action;
}
export const store = Object.freeze({ getState, subscribe, dispatch });
