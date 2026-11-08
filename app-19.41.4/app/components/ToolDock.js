import { useSketchActive } from '../hooks/useSketchActive.js';
import { createElement as h, Fragment, useEffect, useRef } from 'react';
import { ToolIcon } from '../icons/tablerIcons.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { DOCK_LABELS, TOOL_GROUPS, IDLE_TOOL_IDS, groupOfTool } from './toolGroups.js';
import { ObjectStyleBar } from './ObjectStyleBar.js';

const EMPTY = Object.freeze({ items: [] });
const IDLE_SKETCH = Object.freeze({ active: false });
const IDLE_ANALYSIS = Object.freeze({ sources: [], operations: [], busy: false, screeningBusy: false });
const IDLE = new Set(IDLE_TOOL_IDS);
const IDENTIFY = 'core.identify';

/**
 * 19.9.0 — dok narzędzi na dole mapy (zastępuje lewą szynę FloatingTools).
 *
 * Dolny wiersz: trzy grupy (Sprawdź · Szkic · Pomiar) i pasek kontekstu
 * aktywnego narzędzia (instrukcja, parametry, odczyt szkicu, Zakończ/Anuluj).
 * Wybranie Szkicu albo Pomiaru rozwija nad nim wiersz ze WSZYSTKIMI
 * narzędziami grupy — bez rozwijanych list. Ponowne kliknięcie aktywnej grupy
 * albo Esc wraca do „Sprawdź”.
 */
export function ToolDock() {
    const registry = useService('tools');
    const snapshot = useServiceSnapshot('tools', EMPTY);
    const sketch = { active: useSketchActive() };
    const lastUsed = useRef({});
    const items = snapshot.items;
    const byId = (id) => items.find((item) => item.id === id);
    const active = items.find((item) => item.active && !IDLE.has(item.id)) ?? null;
    const activeGroup = active ? groupOfTool(active.id) : TOOL_GROUPS[0];
    if (active && activeGroup) lastUsed.current[activeGroup.id] = active.id;

    // Stan spoczynkowy na komputerze to „Sprawdź”, nie samo przesuwanie (jak na telefonie):
    // po zakończeniu rysowania i po Esc narzędzia wracają do core.pan — tu przechodzimy dalej.
    const panOnly = Boolean(registry) && !sketch.active && items.length > 0 && !active && !byId(IDENTIFY)?.active;
    useEffect(() => {
        if (panOnly) void registry.activate(IDENTIFY);
    }, [panOnly, registry]);

    const activate = (id) => { if (registry) void registry.activate(id); };
    const pickGroup = (entry) => {
        if (entry.id === 'information' || entry.id === activeGroup?.id) { activate(IDENTIFY); return; }
        activate(lastUsed.current[entry.id] ?? entry.defaultTool ?? entry.tools[0]);
    };
    const expanded = activeGroup && activeGroup.id !== 'information';
    const toolButton = (id) => {
        const tool = byId(id);
        if (!tool) return null;
        return h('button', {
            key: id, type: 'button', className: `tool-dock-tool${tool.active ? ' is-active' : ''}`,
            'data-tool-id': id, 'aria-label': tool.title, 'aria-pressed': tool.active, 'aria-busy': tool.loading || undefined,
            disabled: !registry || !tool.enabled || tool.loading,
            title: [tool.title, tool.shortcut?.label && `(${tool.shortcut.label})`].filter(Boolean).join(' ') + (tool.description ? `\n${tool.description}` : ''),
            onClick: () => activate(id),
        }, h(ToolIcon, { name: tool.icon, size: 20 }), h('span', { className: 'tool-secondary-label' }, DOCK_LABELS[id] ?? tool.label ?? tool.title),
            tool.shortcut && h('kbd', null, tool.shortcut.label));
    };

    const onKeys = (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const row = event.target.closest('.tool-dock-row');
        if (!row) return;
        const buttons = [...row.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(event.target);
        if (index < 0) return;
        event.preventDefault();
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    };

    return h('nav', { className: `tool-dock${expanded ? ' is-expanded' : ''}`, 'aria-label': 'Narzędzia mapy', onKeyDown: onKeys },
        // 19.24.0: pasek stylu zaznaczonego obiektu — nad narzędziami, tylko przy zaznaczeniu.
        h(ObjectStyleBar, null),
        expanded && h('div', { className: 'tool-dock-row tool-dock-tools', role: 'toolbar', 'aria-label': activeGroup.title },
            activeGroup.sections.map((section, index) => h(Fragment, { key: section.title ?? index },
                index > 0 && h('span', { className: 'tool-dock-sep', 'aria-hidden': true }),
                section.caption && h('span', { className: 'tool-dock-caption' }, section.caption),
                section.tools.map(toolButton)))),
        h('div', { className: 'tool-dock-row tool-dock-main' },
            h('div', { className: 'tool-dock-groups', role: 'group', 'aria-label': 'Grupy narzędzi' },
                TOOL_GROUPS.map((entry) => {
                    const on = entry.id === activeGroup?.id;
                    return h('button', {
                        key: entry.id, type: 'button', className: `tool-dock-group${on ? ' is-active' : ''}`,
                        'data-tool-group': entry.id, 'aria-pressed': on,
                        'aria-expanded': entry.id === 'information' ? undefined : on,
                        title: entry.id === 'information' ? 'Sprawdź miejsce (I) — kliknij mapę' : `${entry.title} — ${on ? 'zwiń (Esc)' : 'pokaż narzędzia'}`,
                        onClick: () => pickGroup(entry),
                    }, h(ToolIcon, { name: entry.icon, size: 17 }), h('span', null, entry.id === 'drawing' ? 'Rysuj' : entry.id === 'measurement' ? 'Mierz' : entry.title));
                }))));
}
