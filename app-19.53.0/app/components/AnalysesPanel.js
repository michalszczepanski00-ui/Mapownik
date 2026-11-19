import { createElement as h } from 'react';
import { ChevronRight } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { PanelIcon } from './PanelIcon.js';
import { PanelMinimized, PanelShell } from '../ui/index.js';

/**
 * 19.53.0 (Etap 5) — dok Analizy: lista narzędzi analiz. Każde otwiera swój widok w tym samym doku,
 * a przycisk „← Analizy” w nagłówku widoku wraca do listy. Kontekstem jest działka z karty (Inspektor);
 * w widokach jest „Wskaż inną działkę” tam, gdzie narzędzie to obsługuje.
 * Nic tu nie liczy — wywołuje te same panele co dotąd (Otoczenie, Analiza źródła, Ceny, Budowy, Analiza działki).
 */
const ID = 'analyses';
const NO_IDENTIFY = Object.freeze({ open: false });

export function AnalysesPanel() {
    const panel = usePanel(ID);
    const features = useService('features');
    const ctx = useService('featureContext');
    const identify = useServiceSnapshot('identify', NO_IDENTIFY);
    if (!panel.open) return null;
    const title = 'Analizy';
    if (panel.collapsed && !panel.docked) return h(PanelMinimized, { title, icon: h(PanelIcon, { name: 'analysis' }), style: panel.style, onRestore: panel.restore });
    const parcel = identify.open && identify.parcel?.parcel ? `Działka ${identify.parcel.parcel}` : null;
    return h(PanelShell, { className: 'analyses-panel', title, subtitle: parcel ? `${parcel} z karty` : 'Wybierz działkę na mapie albo pracuj na widoku mapy', label: title,
        docked: panel.docked, style: panel.style, icon: h(PanelIcon, { name: 'analysis', size: 16 }), actions: h(PanelHeaderActions, { id: ID }),
        onDragStart: panel.onDragStart, onResizeWidth: panel.onResizeStart, onResizeHeight: panel.onResizeHeightStart },
    h('div', { className: 'analyses-body' },
        h('p', { className: 'analyses-context' }, parcel ? `Kontekst: ${parcel} (karta działki).` : 'Brak wybranej działki — narzędzia działają na widoku mapy albo wskażesz działkę w widoku.'),
        // 19.53.0 (Etap 3): lista ze strefy „dock:analyses” rejestru akcji (features/builtin/parcelActionsFeature.js).
        h('ul', { className: 'analyses-list', role: 'list' }, (features?.actions.list('dock:analyses', ctx) ?? []).map((tool) => h('li', { key: tool.id },
            h('button', { type: 'button', className: 'analyses-item', 'data-tool': tool.id.replace(/^analyses\./, ''), onClick: () => features.actions.run(tool.id, ctx) },
                h('span', { className: 'analyses-item-icon', 'aria-hidden': true }, h(PanelIcon, { name: tool.icon, size: 17 })),
                h('span', { className: 'analyses-item-text' }, h('strong', null, tool.label), h('small', null, tool.description)),
                h(ChevronRight, { size: 15, 'aria-hidden': true })))))));
}
