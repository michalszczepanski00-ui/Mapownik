import { createElement as h } from 'react';
import { getPanel, PanelView } from '../panels/PanelRegistry.js';
import { PanelIcon } from './PanelIcon.js';
import { t } from '../../i18n/index.js';
import { useServiceSnapshot } from '../services/AppServicesContext.js';
import { useDockResize } from '../hooks/useDockGeometry.js';
import { DOCK_DEFS, openPanel, selectDockActiveId, selectDockSize, selectDockTabs, useAppDispatch, useAppSelector } from '../../store/index.js';

/**
 * Dok — jedno miejsce na moduły powłoki, sparametryzowane krawędzią.
 *
 * Dok rezerwuje miejsce w obszarze roboczym, zamiast kłaść się na mapie: mapa
 * kurczy się o jego rozmiar, więc nic nie chowa się pod panelem. Widoczny jest
 * jeden moduł naraz — dok jest z natury wykluczający.
 *
 * Dok nie wie, jakie moduły istnieją: bierze je z PanelRegistry po
 * identyfikatorze aktywnej zakładki. Ta sama implementacja obsługuje dok prawy
 * (szerokość, moduły stałe) i dolny (wysokość, moduły kontekstowe).
 */
const EMPTY_TERRAIN = Object.freeze({ view: 'line' });
export function Dock({ id }) {
    const dispatch = useAppDispatch();
    const def = DOCK_DEFS[id];
    const activeId = useAppSelector((state) => selectDockActiveId(state, id));
    const size = useAppSelector((state) => selectDockSize(state, id));
    const tabs = useAppSelector(selectDockTabs)[id] ?? [];
    const onResizeStart = useDockResize(id);
    const terrain = useServiceSnapshot('terrainProfile', EMPTY_TERRAIN);
    const areaDefault = id === 'bottom' && activeId === 'terrainProfile' && terrain.view === 'area' && size === def?.defaultSize;

    if (!def || !activeId) return null;
    const entry = getPanel(activeId);
    if (!entry) return null;

    return h('div', {
        className: `dock dock--${id}`,
        style: { [def.axis]: areaDefault ? 260 : size },
        'aria-label': t('dock.label', { title: entry.title }),
    },
        // Zakładki pokazują się tylko tam, gdzie moduły nie mają pozycji
        // w szynie ikon — inaczej po podmianie modułu kontekstowego nie dałoby
        // się do poprzedniego wrócić inaczej niż ponownym uruchomieniem
        // narzędzia.
        tabs.length > 1 ? h('div', { className: 'dock-tabs', role: 'tablist', 'aria-label': t('dock.tabsOf', { id }) },
            tabs.map((tab) => h('button', {
                key: tab.id,
                type: 'button',
                role: 'tab',
                className: `dock-tab${tab.active ? ' is-active' : ''}`,
                'aria-selected': tab.active,
                onClick: () => dispatch(openPanel(tab.id)),
            }, h(PanelIcon, { name: tab.icon, size: 14 }), tab.title))) : null,
        h(PanelView, { key: entry.id, entry }),
        // Uchwyt jest ostatnim dzieckiem i ma własne pasmo z-index: wnętrza
        // paneli mają pozycjonowane elementy (sticky nagłówki, wiersze
        // warstw), które przy wcześniejszej kolejności w DOM przykrywały go
        // i przechwytywały pointerdown.
        h('div', {
            className: 'dock-resizer',
            role: 'separator',
            'aria-orientation': def.axis === 'height' ? 'horizontal' : 'vertical',
            'aria-label': def.axis === 'height' ? t('dock.resizeHeight') : t('dock.resizeWidth'),
            onPointerDown: onResizeStart,
        }));
}
