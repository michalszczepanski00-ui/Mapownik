import { t } from '../i18n/index.js';
export const MAX_ROAD_LENGTH_M = 2000;
export const MAX_ROAD_VERTICES = 10000;
/** Reject oversized input before fixed-step sampling allocates large arrays. */
export function assertRoadBudget(points) {
    if (!Array.isArray(points) || points.length < 2 || points.length > MAX_ROAD_VERTICES)
        throw new Error(t('road.limitVertices', { limit: MAX_ROAD_VERTICES }));
    let length = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
            throw new Error(t('road.invalidCoordinates'));
        if (i) length += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]);
        if (length > MAX_ROAD_LENGTH_M) throw new Error(t('road.limitLength', { limit: MAX_ROAD_LENGTH_M }));
    }
    return length;
}
