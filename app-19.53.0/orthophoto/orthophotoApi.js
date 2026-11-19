import { requestScope } from '../core/requestScope.js';
import { t } from '../i18n/index.js';
let datesCache = null;
// 19.48.0: bez ortofotomapy archiwalnej (moduł zdjęć archiwalnych usunięty).
export const PHOTO_IDS = Object.freeze(['basemap.orthophoto', 'basemap.orthophoto.true']);
export function monthForYear(months, year, currentMonth) {
    const requested = `${year}-${currentMonth.slice(5)}`;
    const choices = months.filter((month) => month.startsWith(`${year}-`));
    return choices.includes(requested) ? requested : choices.at(-1) ?? currentMonth;
}
export function center2180(controller) {
    const extent = controller.getViewportExtent2180();
    return [Math.round((extent[0] + extent[2]) / 2), Math.round((extent[1] + extent[3]) / 2)];
}
export async function orthophotoRequest(params, signal) {
    const scope = requestScope(18000, signal);
    try {
        const response = await fetch(`./api/orthophoto.php?${new URLSearchParams(params)}`, { signal: scope.signal });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error || t('ortho.loadError'));
        return body;
    } finally { scope.dispose(); }
}
export async function loadOrthoDates(signal, force = false) {
    if (!force && datesCache && Date.now() - datesCache.loadedAt < (datesCache.rangeStale ? 300000 : 86400000)) return datesCache;
    const result = await orthophotoRequest({ mode: 'dates' }, signal);
    const months = result.months?.filter((month) => /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)) ?? [];
    if (!months.length) throw new Error(t('ortho.loadError'));
    datesCache = { ...result, months: [...new Set(months)].sort(), loadedAt: Date.now() };
    return datesCache;
}
