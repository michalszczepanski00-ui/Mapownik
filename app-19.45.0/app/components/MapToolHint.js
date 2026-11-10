import { createElement as h } from 'react';
import { ToolIcon } from '../icons/tablerIcons.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';

/**
 * 19.33.0 — podpowiedź aktywnego narzędzia przy mapie (u góry, na środku).
 * Ta sama treść co w karcie (nazwa narzędzia + co zrobić), ale tam, gdzie użytkownik klika — widoczna także przy
 * zwiniętej karcie. Dla trybów domyślnych (Przesuń, Sprawdź) się nie pokazuje.
 */
const EMPTY_TOOLS = Object.freeze({ items: [] });
const IDLE_SKETCH = Object.freeze({ active: false });
const NO_SERVICE = '__none__';
const QUIET = new Set(['core.pan', 'core.identify']);

export function MapToolHint() {
    const ctx = useService('featureContext');
    const features = useService('features');
    const tools = useServiceSnapshot('tools', EMPTY_TOOLS);
    const sketch = useServiceSnapshot('sketch', IDLE_SKETCH);
    const activeTool = tools.items.find((item) => item.active && !QUIET.has(item.id)) ?? null;
    const toolDef = activeTool ? features?.getTool(activeTool.id) : null;
    useServiceSnapshot(toolDef?.service ?? NO_SERVICE, null);
    if (!activeTool || !ctx || !features) return null;
    let hint = '';
    try { hint = typeof toolDef?.hint === 'function' ? toolDef.hint(ctx) : (toolDef?.hint ?? ''); } catch { hint = ''; }
    const keys = sketch.active ? 'Enter — zakończ · Backspace — cofnij punkt · Esc — anuluj' : 'Esc — wyjście z narzędzia';
    return h('div', { className: 'map-tool-hint', role: 'status', 'aria-live': 'polite' },
        h('span', { className: 'map-tool-hint-icon', 'aria-hidden': true }, h(ToolIcon, { name: activeTool.icon ?? 'pan', size: 16, strokeWidth: 2 })),
        h('strong', null, activeTool.title),
        hint && h('span', { className: 'map-tool-hint-text' }, hint),
        h('small', null, keys));
}
