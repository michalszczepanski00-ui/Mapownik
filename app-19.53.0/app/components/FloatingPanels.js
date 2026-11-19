import { createElement as h, Fragment } from 'react';
import { getPanel, PanelView } from '../panels/PanelRegistry.js';
import { PANEL_DEFS, selectFloatingPanelIds, useAppSelector } from '../../store/index.js';

/**
 * Warstwa okien pływających nad mapą.
 *
 * Renderuje te moduły, które użytkownik odpiął z doku. Panel sam wie, że jest
 * odpięty (usePanel -> docked === false) i dorysowuje wtedy uchwyty
 * przeciągania i zmiany rozmiaru — tutaj chodzi wyłącznie o to, gdzie
 * w drzewie ląduje: wewnątrz obszaru mapy, względem którego jest pozycjonowany.
 */
export function FloatingPanels({ excludePlaceCards = false } = {}) {
    const allIds = useAppSelector(selectFloatingPanelIds);
    const ids = excludePlaceCards ? allIds.filter((id) => !PANEL_DEFS[id]?.placeCard) : allIds;
    if (!ids.length) return null;
    return h(Fragment, null, ids.map((id) => {
        const entry = getPanel(id);
        if (!entry) return null;
        if (PANEL_DEFS[id]?.placeCard) return h('div', { key: id, id: `place-panel-${id}`, role: 'tabpanel', 'aria-labelledby': `place-tab-${id}`, className: 'place-card-panel-host' }, h(PanelView, { entry }));
        return h(PanelView, { key: id, entry });
    }));
}
