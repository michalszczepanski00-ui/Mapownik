// OpenLayers full build does not expose TileState on globalThis.ol.
// Values match ol/TileState.js in OpenLayers 10.x.
const TileState = Object.freeze({
  IDLE: 0,
  LOADING: 1,
  LOADED: 2,
  ERROR: 3,
  EMPTY: 4,
});
export default TileState;
