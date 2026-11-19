import { createElement as h, useCallback } from 'react';
import { IconButton } from './IconButton.js';
import { PanelIcon } from './PanelIcon.js';
import { t } from '../../i18n/index.js';
import { closePanel, selectRailItems, togglePanel, useAppDispatch, useAppSelector } from '../../store/index.js';
import { useServiceSnapshot } from '../services/AppServicesContext.js';
import { summarizeLayers } from '../../layers/layerSummary.js';

const EMPTY_LAYERS = Object.freeze({ layers: [] });
const EMPTY_OBJECTS = Object.freeze({ count: 0 });

/**
 * Szyna ikon przełączająca moduły prawego doku.
 *
 * Zawsze widoczna po prawej stronie mapy, również po otwarciu panelu. Jej
 * położenie i znaczenie nie zmieniają się podczas przełączania modułów.
 *
 * Lista pozycji pochodzi z PANEL_DEFS (przez selectRailItems), a nie z tego
 * komponentu — nowy moduł pojawia się w szynie bez dotykania tego pliku.
 */
export function ActivityBar() {
    const dispatch = useAppDispatch();
    const items = useAppSelector(selectRailItems);
    const layers = useServiceSnapshot('layers', EMPTY_LAYERS);
    const objects = useServiceSnapshot('objects', EMPTY_OBJECTS);
    const toggle = useCallback((id) => dispatch(togglePanel(id)), [dispatch]);

    return h('nav', { className: 'activity-bar', 'aria-label': t('activity.label') },
        h('span', { className: 'activity-bar-heading', 'aria-hidden': true }, t('activity.heading')),
        items.map((item) => {
            const badgeCount = item.id === 'layers'
                ? countVisibleLayers(layers)
                : item.id === 'objects' ? Number(objects.count) || 0 : 0;
            return h('div', { key: item.id, className: 'activity-bar-slot' },
                h(IconButton, {
                    label: (item.docked
                        ? (item.active ? t('activity.hide', { title: item.title }) : t('activity.show', { title: item.title }))
                        : (item.active ? t('activity.detachedClose', { title: item.title }) : t('activity.detached', { title: item.title })))
                        + (item.hasResult && !item.active ? t('activity.hasResult') : ''),
                    tooltipSide: 'left',
                    className: `activity-bar-button${item.active ? ' is-open' : ''}${item.docked ? '' : ' is-detached'}`,
                    // 18.10.1: przycisk zadokowanego modułu rozwija panel (aria-expanded +
                    // aria-controls); odpięte okno to przełącznik widoczności (aria-pressed).
                    ...(item.docked
                        ? { 'aria-expanded': item.active, 'aria-controls': item.active ? 'right-dock-panel' : undefined }
                        : { 'aria-pressed': item.active }),
                    'data-panel-id': item.id,
                    // 19.53.0: przy otwartym widoku grupy (np. Ceny) ikona Analizy zamyka ten widok.
                    onClick: () => (item.openChild ? dispatch(closePanel(item.openChild)) : toggle(item.id)),
                },
                    h(PanelIcon, { name: item.icon, size: 19 }),
                    // 19.53.0 (Etap 3): same ikony — trzy różne (Warstwy, Obiekty, Analizy); nazwa w dymku.
                    badgeCount > 0
                        ? h('span', { className: 'activity-bar-badge', 'aria-hidden': true }, badgeCount > 99 ? '99+' : badgeCount)
                        : null,
                    // 18.10: moduł kontekstowy ma wynik, którego akurat nie widać.
                    item.hasResult && !item.active ? h('span', { className: 'activity-bar-result', 'aria-hidden': true }) : null),
                // Kropka odróżnia moduł odpięty do okna od zamkniętego.
                item.docked ? null : h('span', { className: 'activity-bar-dot', 'aria-hidden': true }));
        }));
}

const countVisibleLayers = (snapshot) => summarizeLayers(snapshot.layers).active;
