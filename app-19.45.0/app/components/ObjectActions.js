import { runTerrainFor } from '../../terrain/runTerrainFor.js';
import { createElement as h } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { openPanel, useAppDispatch } from '../../store/index.js';
import { Button } from '../ui/index.js';
const EMPTY = Object.freeze({ busy: false, screeningBusy: false });
/**
 * Czynność korzysta z obecnego zaznaczenia; nie wymaga ponownego trafienia w mapę.
 * 19.15.0: `menu` — jedno rozwijane „Działania” zamiast rzędów przycisków
 * (panel Obiekty na komputerze); bez `menu` — przyciski jak dotąd.
 */
export function ObjectActions({ object, compact = false, menu = false }) {
    const ctx = useService('featureContext');
    const dispatch = useAppDispatch();
    const analysis = useServiceSnapshot('analysis', EMPTY);
    const editing = useServiceSnapshot('editing', EMPTY);
    if (!object || !ctx) return null;
    const area = ['Polygon', 'MultiPolygon'].includes(object.geometryType);
    const line = object.geometryType === 'LineString';
    const run = async (action) => {
        try { await action(); } catch (error) { ctx.toasts.show({ tone: 'danger', message: error instanceof Error ? error.message : String(error) }); }
    };
    const select = () => ctx.get('objects').select(object.id);
    const actions = [
        ['Bufor', () => ctx.tools.activate('core.buffer')],
        area && ['Analizuj otoczenie', async () => { await ctx.tools.activate('core.pan'); dispatch(openPanel('analysis')); await ctx.get('analysis').runParcelScreening(); }, analysis.busy || analysis.screeningBusy],
        area && ['Wysokości', async () => { await ctx.tools.activate('core.terrain.area'); await runTerrainFor(ctx.get('terrainProfile'), object.id); }],
        (area || line) && ['Teren 3D', async () => { const { openObject3D } = await import('../../terrain3d/terrain3dTool.js'); openObject3D(ctx.get('objects').getObject(object.id)); }],
        line && ['Profil wysokości', async () => { await ctx.tools.activate('core.pan'); await ctx.get('terrainProfile').profileObject(object.id); }],
        area && ['Odległości', async () => { await ctx.tools.activate('core.pan'); const manager = ctx.get('analysis'); manager.setAreaMode('selected'); manager.setOperationId('distance'); manager.setPanelMode?.('manual'); dispatch(openPanel('analysis')); }],
        !compact && ['Duplikuj', () => { const [id] = ctx.get('objectCommands').duplicateMany([object.id]); if (id) ctx.get('objects').select(id); }],
        !compact && object.kind !== 'circle' && ['Edytuj kształt', () => ctx.tools.activate('core.select')],
        !compact && editing.mode === 'select' && !editing.suspended && ['Zakończ edycję', () => ctx.tools.activate('core.pan')],
    ].filter(Boolean);
    const perform = (action) => void run(async () => { select(); await action(); });
    if (menu) {
        return h(DropdownMenu.Root, null,
            h(DropdownMenu.Trigger, { asChild: true },
                h('button', { type: 'button', className: 'object-actions-trigger', 'aria-label': `Działania: ${object.name}` }, 'Działania', h(ChevronDown, { size: 13, 'aria-hidden': true }))),
            h(DropdownMenu.Portal, null,
                h(DropdownMenu.Content, { className: 'dropdown-content object-actions-menu', align: 'end', sideOffset: 4 },
                    actions.map(([label, action, disabled = false]) => h(DropdownMenu.Item, { key: label, className: 'dropdown-item', disabled, onSelect: () => perform(action) }, label)))));
    }
    return h('div', { className: `object-task-actions${compact ? ' is-compact' : ''}`, role: 'group', 'aria-label': `Działania: ${object.name}` },
        actions.map(([label, action, disabled = false]) => h(Button, { key: label, size: 'sm', disabled, onClick: () => perform(action) }, label)));
}
