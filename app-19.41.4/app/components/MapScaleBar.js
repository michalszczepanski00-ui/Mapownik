import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { scaleBarForZoom } from '../../projections/mapScale.js';
import { t } from '../../i18n/index.js';
/**
 * 19.0.0: podziałka liniowa w lewym dolnym rogu mapy.
 *
 * Wcześniej aplikacja mówiła tylko „Zoom 6,2", a panel warstw „widoczna od ~1:160 000",
 * więc nie dało się ocenić odległości bez narzędzia pomiaru. Podziałka liczy długość
 * odcinka z poziomu przybliżenia i szerokości geograficznej środka mapy (m/px = rozdzielczość
 * Web Mercatora × cos φ), czyli zgadza się z pomiarem także poza 52°N.
 * Własny komponent zamiast ol/control/ScaleLine: paczka vendor nie zawiera tego modułu,
 * a jego dodanie wymagałoby ponownego budowania katalogu vendor na serwerze.
 */
export function MapScaleBar({ zoom, latitude }) {
    const bar = scaleBarForZoom(zoom, latitude);
    if (!bar)
        return null;
    return _jsxs('div', {
        className: 'map-scalebar',
        role: 'img',
        'aria-label': t('map.scalebar.label', { length: bar.label }),
        title: t('map.scalebar.title'),
        children: [
            _jsx('span', { className: 'map-scalebar-label', children: bar.label }),
            _jsx('span', { className: 'map-scalebar-line', style: { width: `${bar.widthPx}px` } }),
        ],
    });
}
