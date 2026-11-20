import { createElement as h } from 'react';
import { Magnet, Redo2, Undo2 } from 'lucide-react';
import { ToolIcon } from '../icons/tablerIcons.js';
import { IconButton } from './IconButton.js';
import { Button } from '../ui/index.js';
import { ContextField, ObjectMeasures, formatArea, formatLength } from './ContextBar.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { t } from '../../i18n/index.js';

/**
 * 19.49.0 (przebudowa UI, Etap 2) — pasek kontekstowy u góry mapy.
 *
 * Rozbudowa dawnego banera podpowiedzi (MapToolHint). Jeden wiersz:
 *   [ikona] Nazwa narzędzia · podpowiedź | opcje narzędzia | przyciąganie · ↶ · ↷ | Esc
 * Przy zaznaczonym obiekcie projektu (bez szkicu): nazwa obiektu i jego wymiary.
 * Znika, gdy nie ma aktywnego narzędzia ani zaznaczenia (Sprawdź / Przesuń bez zaznaczenia).
 *
 * Nic tu nie jest nową funkcją: opcje narzędzia pochodzą z deklaracji narzędzia (tools.options, jak dotąd
 * w lewej karcie — M1), przyciąganie / cofnij / ponów to te same wywołania co w górnym pasku (M2),
 * a „Esc” uruchamia to samo polecenie co klawisz Escape (core.escape).
 */
const EMPTY_TOOLS = Object.freeze({ items: [] });
const EMPTY_OBJECTS = Object.freeze({ selectedId: null, items: [] });
const EMPTY_COMMANDS = Object.freeze({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
const EMPTY_EDITING = Object.freeze({ snapEnabled: false, snapTargetCount: 0 });
const IDLE_SKETCH = Object.freeze({ active: false });
const NO_SERVICE = '__none__';
const QUIET = new Set(['core.pan', 'core.identify']);

function SketchReadout({ sketch }) {
    const parts = [];
    if (sketch.type === 'line') parts.push([t('context.length'), formatLength(sketch.lengthM)]);
    if (sketch.type === 'polygon') {
        parts.push([t('context.area'), formatArea(sketch.areaM2)]);
        parts.push([t('context.perimeter'), formatLength(sketch.perimeterM)]);
    }
    if (!parts.length) return null;
    return h('span', { className: 'mcb-readouts', role: 'status', 'aria-live': 'polite' },
        parts.map(([label, value]) => h('span', { key: label, className: 'ui-readout ui-readout--live' },
            h('span', { className: 'ui-field-label' }, label), h('strong', null, value))));
}

export function MapContextBar() {
    const ctx = useService('featureContext');
    const features = useService('features');
    const registry = useService('commandRegistry');
    const commandBus = useService('commands');
    const editingManager = useService('editing');
    useServiceSnapshot('settings', null);
    const tools = useServiceSnapshot('tools', EMPTY_TOOLS);
    const objects = useServiceSnapshot('objects', EMPTY_OBJECTS);
    const sketch = useServiceSnapshot('sketch', IDLE_SKETCH);
    const commands = useServiceSnapshot('commands', EMPTY_COMMANDS);
    const editing = useServiceSnapshot('editing', EMPTY_EDITING);
    const activeTool = tools.items.find((item) => item.active && !QUIET.has(item.id)) ?? null;
    const toolDef = activeTool ? features?.getTool(activeTool.id) : null;
    // Odświeżenie przy zmianie stanu serwisu narzędzia (np. odległość bufora, wynik pomiaru).
    useServiceSnapshot(toolDef?.service ?? NO_SERVICE, null);
    const selected = objects.items.find((item) => item.id === objects.selectedId) ?? null;
    if (!ctx || !features) return null;
    const task = Boolean(activeTool) || sketch.active;
    if (!task && !selected) return null;

    let hint = '';
    let options = [];
    if (toolDef) {
        try {
            hint = typeof toolDef.hint === 'function' ? toolDef.hint(ctx) : (toolDef.hint ?? '');
            options = toolDef.options ? toolDef.options(ctx) : [];
        } catch (error) {
            console.error(`[narzędzie ${toolDef.id}]`, error);
        }
    }
    const sketchOwner = sketch.active ? ctx.interactions.activeSketch() : null;
    const keys = sketch.active ? 'Enter — zakończ · Backspace — cofnij punkt · Esc — anuluj' : 'Esc — wyjście z narzędzia';
    const fullHint = [toolDef?.description, hint, activeTool?.error, keys].filter(Boolean).join(' · ');
    const escape = () => {
        try { if (registry?.get('core.escape')) { registry.run('core.escape', ctx); return; } } catch { /* niżej zapas */ }
        if (!ctx.interactions.abortActiveSketch()) void ctx.tools.activate('core.pan');
    };
    const finishDisabled = sketch.type === 'line' ? !(sketch.vertices >= 3 && sketch.lengthM > 0.01)
        : sketch.type === 'polygon' ? !(sketch.vertices >= 4 && sketch.areaM2 > 0.01) : false;

    return h('div', { className: `map-context-bar${sketch.active ? ' is-sketching' : ''}${task ? '' : ' is-object'}`, role: 'toolbar', 'aria-label': t('context.tool') },
        task && h('div', { className: 'mcb-zone mcb-zone--tool' },
            h('span', { className: 'mcb-icon', 'aria-hidden': true }, h(ToolIcon, { name: activeTool?.icon ?? 'pan', size: 16, strokeWidth: 2 })),
            h('strong', { className: 'mcb-name' }, activeTool?.title ?? 'Szkic'),
            hint && h('span', { className: 'mcb-hint', role: 'status', 'aria-live': 'polite', title: fullHint }, hint)),
        task && (options.length > 0 || sketch.active) && h('div', { className: 'mcb-zone mcb-zone--options' },
            options.map((field) => h(ContextField, { key: field.id, field })),
            sketch.active && h(SketchReadout, { sketch }),
            // „Cofnij punkt” w szkicu = przycisk ↶ w tym samym pasku (to samo wywołanie, skrót Backspace).
            sketchOwner?.finishSketch && h(Button, { size: 'sm', variant: 'primary', disabled: finishDisabled, onClick: () => ctx.interactions.finishActiveSketch(), title: 'Enter' }, t('context.finish'))),
        !task && selected && h('div', { className: 'mcb-zone mcb-zone--object' },
            h('span', { className: 'mcb-object-label' }, t('context.object')),
            h('strong', { className: 'mcb-name', title: selected.name }, selected.name),
            h(ObjectMeasures, { object: selected })),
        task && h('div', { className: 'mcb-zone mcb-zone--edit', role: 'group', 'aria-label': 'Przyciąganie i historia' },
            h(IconButton, {
                label: editing.snapEnabled ? t('appbar.snapOn', { count: editing.snapTargetCount ?? 0 }) : t('appbar.snapOff'),
                tooltipSide: 'bottom', className: `mcb-icon-button${editing.snapEnabled ? ' is-active' : ''}`,
                'aria-pressed': editing.snapEnabled, disabled: !editingManager, onClick: () => editingManager?.toggleSnap(),
            }, h(Magnet, { size: 15 })),
            h(IconButton, { className: 'mcb-icon-button', label: sketch.active ? 'Cofnij punkt szkicu (Backspace)' : commands.undoLabel ? t('appbar.undo', { label: commands.undoLabel }) : t('appbar.undoNone'), tooltipSide: 'bottom', disabled: !commandBus || (!sketch.active && !commands.canUndo), onClick: () => sketch.active ? ctx.interactions.undoLastPoint() : commandBus?.undo() }, h(Undo2, { size: 15 })),
            h(IconButton, { className: 'mcb-icon-button', label: commands.redoLabel ? t('appbar.redo', { label: commands.redoLabel }) : t('appbar.redoNone'), tooltipSide: 'bottom', disabled: !commandBus || !commands.canRedo, onClick: () => commandBus?.redo() }, h(Redo2, { size: 15 }))),
        task && h('button', { type: 'button', className: 'mcb-escape', title: sketch.active ? 'Anuluj szkic (Esc)' : 'Wyjdź z narzędzia (Esc)', 'aria-label': sketch.active ? 'Anuluj szkic (Esc)' : 'Wyjdź z narzędzia (Esc)', onClick: escape }, 'Esc'));
}
