import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import { MAP_OBJECT_PROJECTION } from '../core/index.js';
import { VIEW_PROJECTION, ensureProjectProjectionRegistered } from '../projections/index.js';
function position(value) {
    return [value[0], value[1]];
}
/** Convert canonical EPSG:2180 project geometry to a renderable EPSG:3857 OL geometry. */
export function toViewGeometry(geometry) {
    ensureProjectProjectionRegistered();
    let olGeometry;
    switch (geometry.type) {
        case 'Point':
            olGeometry = new Point(geometry.coordinates);
            break;
        case 'LineString':
            olGeometry = new LineString(geometry.coordinates);
            break;
        case 'Polygon':
            olGeometry = new Polygon(geometry.coordinates);
            break;
        case 'MultiPolygon':
            olGeometry = new MultiPolygon(geometry.coordinates);
            break;
    }
    return olGeometry.transform(MAP_OBJECT_PROJECTION, VIEW_PROJECTION);
}
/**
 * Convert an OpenLayers geometry from the map view (EPSG:3857) back to the
 * canonical project CRS (EPSG:2180). Prepared before Draw/Modify so editors do
 * not leak viewport coordinates into domain objects.
 */
export function fromViewGeometry(geometry) {
    ensureProjectProjectionRegistered();
    const projectGeometry = geometry.clone().transform(VIEW_PROJECTION, MAP_OBJECT_PROJECTION);
    switch (projectGeometry.getType()) {
        case 'Point':
            return {
                type: 'Point',
                coordinates: position(projectGeometry.getCoordinates()),
            };
        case 'LineString':
            return {
                type: 'LineString',
                coordinates: projectGeometry.getCoordinates().map(position),
            };
        case 'Polygon':
            return {
                type: 'Polygon',
                coordinates: projectGeometry.getCoordinates().map((ring) => ring.map(position)),
            };
        case 'MultiPolygon':
            return {
                type: 'MultiPolygon',
                coordinates: projectGeometry.getCoordinates()
                    .map((polygon) => polygon.map((ring) => ring.map(position))),
            };
        default:
            throw new Error(`Nieobsługiwany typ geometrii OpenLayers: ${projectGeometry.getType()}`);
    }
}
