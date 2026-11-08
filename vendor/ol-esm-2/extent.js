import {ol} from './_ol.js';
// 19.30.0: moduł dla ol-mapbox-style — z pełnej biblioteki OpenLayers 10.10 (globalThis.ol).
export const getCenter = ol.extent.getCenter;
export const getTopLeft = ol.extent.getTopLeft;
export const getWidth = ol.extent.getWidth;
export const getHeight = ol.extent.getHeight;
export const containsCoordinate = ol.extent.containsCoordinate;
export const intersects = ol.extent.intersects;
