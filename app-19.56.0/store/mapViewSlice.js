export const initialMapViewState = {
    ready: false,
    zoom: 6.2,
    center3857: [0, 0],
    centerLonLat: [19.1451, 51.9194],
};
const T = {
    started: 'mapView/runtimeStarted',
    stopped: 'mapView/runtimeStopped',
    changed: 'mapView/viewChanged',
};
export const mapRuntimeStarted = () => ({ type: T.started });
export const mapRuntimeStopped = () => ({ type: T.stopped });
export const mapViewChanged = (payload) => ({ type: T.changed, payload });
function asPair(values, fallback) {
    if (!Array.isArray(values) || values.length < 2)
        return fallback;
    const x = Number(values[0]);
    const y = Number(values[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : fallback;
}
export function mapViewReducer(state = initialMapViewState, action = {}) {
    switch (action.type) {
        case T.started:
        case T.stopped:
            return state.ready ? { ...state, ready: false } : state;
        case T.changed: {
            const p = action.payload || {};
            const zoom = Number(p.zoom);
            return {
                ...state,
                zoom: Number.isFinite(zoom) ? zoom : state.zoom,
                center3857: asPair(p.center3857, state.center3857),
                centerLonLat: asPair(p.centerLonLat, state.centerLonLat),
                ready: true,
            };
        }
        default:
            return state;
    }
}
