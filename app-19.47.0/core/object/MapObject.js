export const MAP_OBJECT_PROJECTION = 'EPSG:2180';
import { MAP_STYLE_TOKENS } from './mapStyleTokens.js';
import { t } from '../../i18n/index.js';

// 18.0: domyślny kolor obiektu jest inny niż akcent interfejsu (#2563eb) —
// na mapie obiekt projektu nie myli się z aktywnym przyciskiem ani z nakładkami WMS.
export const DEFAULT_MAP_OBJECT_STYLE = {
    strokeColor: MAP_STYLE_TOKENS.defaultObject,
    strokeWidth: 2,
    strokeOpacity: 1,
    strokePattern: 'solid',
    fillColor: MAP_STYLE_TOKENS.defaultObject,
    fillOpacity: 0.18,
    pointRadius: 6,
};

export const MAPOWNIK_PRESET_COLORS = [
    '#dc2626', '#ea580c', '#eab308', '#16a34a',
    '#0d9488', '#0284c7', '#1d4ed8', '#4338ca',
    '#9333ea', '#db2777', '#78716c', '#111827',
];

export const MAPOWNIK_STROKE_PATTERNS = [
    { id: 'solid', label: t('core.liniaCiagla') },
    { id: 'dash-short', label: t('core.kreskowanieKrotkie') },
    { id: 'dash-medium', label: t('core.kreskowanieSrednie') },
    { id: 'dash-long', label: t('core.kreskowanieDlugie') },
    { id: 'dots', label: t('core.kropki') },
    { id: 'dash-dot', label: t('core.kreskaKropka') },
    { id: 'double', label: t('core.liniaPodwojna') },
];
