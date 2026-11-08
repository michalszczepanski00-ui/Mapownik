import { t } from '../i18n/index.js';
export const DEFAULT_BUFFER_DISTANCE_M = 25;

let jstsModulePromise = null;

function loadJstsBuffer() {
    if (!jstsModulePromise) {
        jstsModulePromise = import('../../vendor/geometry/jsts-buffer.esm.js').then((module) => {
            if (typeof module?.bufferGeoJsonGeometry !== 'function') throw new Error(t('geometry.brakSilnikaBuforowaniaJsts'));
            return module.bufferGeoJsonGeometry;
        }).catch((error) => {
            jstsModulePromise = null;
            throw error;
        });
    }
    return jstsModulePromise;
}

export function normalizeBufferDistance(value) {
    const distance = Number(value);
    if (!Number.isFinite(distance) || distance <= 0) return null;
    return Math.min(20000, Math.max(0.5, distance));
}

export async function createBufferGeometry(geometry, distanceMeters) {
    const distance = normalizeBufferDistance(distanceMeters);
    if (distance === null) throw new Error(t('geometry.odlegloscBuforaMusiBycLiczba'));
    if (!geometry || !['Point', 'LineString', 'Polygon', 'MultiPolygon'].includes(geometry.type))
        throw new Error(t('geometry.buforObslugujePunktLiniePoligon'));
    try {
        const bufferGeoJsonGeometry = await loadJstsBuffer();
        return bufferGeoJsonGeometry(geometry, distance);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(t('geometry.nieUdaloSieZbuforowacGeometrii', { message }));
    }
}
