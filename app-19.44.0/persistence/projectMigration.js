import { viewToProjectCoordinate } from '../projections/index.js';
import { PROJECT_SCHEMA_VERSION } from './projectTypes.js';
import { t } from '../i18n/index.js';
function migratePosition(position) {
    const transformed = viewToProjectCoordinate([position[0], position[1]]);
    return [transformed[0], transformed[1]];
}
function migrateGeometry(geometry) {
    switch (geometry.type) {
        case 'Point':
            return { type: 'Point', coordinates: migratePosition(geometry.coordinates) };
        case 'LineString':
            return {
                type: 'LineString',
                coordinates: geometry.coordinates.map(migratePosition),
            };
        case 'Polygon':
            return {
                type: 'Polygon',
                coordinates: geometry.coordinates.map((ring) => ring.map(migratePosition)),
            };
    }
    throw new Error(t('persistence.nieobslugiwanyTypGeometriiProjektuV1'));
}
/** Project schema v1 stored object geometry in EPSG:3857. v2 stores it in EPSG:2180. */
export function migrateMapObjectV1(object) {
    return {
        ...object,
        geometry: migrateGeometry(object.geometry),
    };
}
export function migrateProjectStateV1(state) {
    return {
        ...state,
        schemaVersion: PROJECT_SCHEMA_VERSION,
    };
}
