import { createElement as h } from 'react';
import { IconButton } from './IconButton.js';
import { ProjectMenu, ShareMenu } from './ProjectMenu.js';
import { SettingsMenu } from './SettingsMenu.js';
import { SearchToolbar } from './SearchToolbar.js';
import { QuickHelp } from './QuickHelp.js';
import { useService } from '../services/AppServicesContext.js';
import { openOverlay, useAppDispatch } from '../../store/index.js';

/**
 * 19.9.0 — pasek aplikacji rozłożony na mapie zamiast paska na całą szerokość
 * (19.53.0, Etap 7: dawny pasek na całą szerokość `AppBar` usunięty — nieużywany od 19.9.0).
 *
 * 19.53.0 (Etap 6): znak (paleta poleceń, Ctrl+K) · wyszukiwarka · odstęp · Projekt ▾ z kropką zapisu ·
 * Udostępnij ▾ (jedyny wypełniony przycisk: link, eksport mapy PNG/PDF, pliki GIS) · pomoc · ustawienia.
 * Pozycje menu pochodzą z rejestru akcji (strefy topbar.project i topbar.share).
 */
export function MapTopBar() {
    const dispatch = useAppDispatch();
    const searchManager = useService('search');

    return h('div', { className: 'map-topbar' },
        h('div', { className: 'map-topbar-start' },
            h(IconButton, { className: 'map-brand-button', label: 'Mapownik — polecenia (Ctrl+K)', tooltipSide: 'bottom', onClick: () => dispatch(openOverlay('palette')) },
                h('img', { src: './assets/mapownik-logo-icon.png?v=19.54.0', alt: '', 'aria-hidden': true })),
            h(SearchToolbar, { manager: searchManager })),
        h('div', { className: 'map-topbar-end', role: 'toolbar', 'aria-label': 'Projekt i widok' },
            h('div', { className: 'map-topbar-group map-topbar-project' }, h(ProjectMenu, null)),
            h(ShareMenu, null),
            h(QuickHelp, null),
            h(SettingsMenu, null)));
}
