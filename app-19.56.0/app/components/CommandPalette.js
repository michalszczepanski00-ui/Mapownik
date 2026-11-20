import { createElement as h, useCallback, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Kbd, ModalShell } from '../ui/index.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { closeOverlay, selectOverlay, useAppDispatch, useAppSelector } from '../../store/index.js';
import { t } from '../../i18n/index.js';

const EMPTY = Object.freeze({ items: [], revision: 0 });
const fold = (text) => String(text ?? '').toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

function available(registry, command, ctx) {
    try { return registry.isAvailable(command.id, ctx); }
    catch { return false; }
}

/**
 * 18.0 — paleta poleceń (Ctrl+K). Lista pochodzi z CommandRegistry: narzędzia
 * funkcji, polecenia rdzenia i powłoki. Nowe polecenie funkcji pojawia się
 * tu samo. Wyszukiwanie ignoruje polskie znaki („bufor”, „dzialka”).
 */
function PaletteWindow({ onClose }) {
    const registry = useService('commandRegistry');
    const ctx = useService('featureContext');
    const snapshot = useServiceSnapshot('commandRegistry', EMPTY);
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const inputRef = useRef(null);

    const items = useMemo(() => {
        const q = fold(query.trim());
        return snapshot.items
            .filter((command) => !command.hidden)
            .filter((command) => !q || fold(`${command.title} ${command.group ?? ''} ${command.keywords.join(' ')}`).includes(q))
            .map((command) => ({ command, enabled: available(registry, command, ctx) }))
            .sort((a, b) => Number(b.enabled) - Number(a.enabled));
    }, [snapshot, query, registry, ctx]);

    const run = useCallback((command) => {
        onClose();
        // Po zamknięciu okna — polecenie może otworzyć inne okno albo przenieść fokus.
        window.setTimeout(() => registry?.run(command.id, ctx), 0);
    }, [onClose, registry, ctx]);

    const onKeyDown = (event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((value) => Math.min(items.length - 1, value + 1)); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
        else if (event.key === 'Enter') {
            event.preventDefault();
            const item = items[index];
            if (item?.enabled) run(item.command);
        }
    };

    return h(ModalShell, { label: t('palette.title'), onClose, className: 'command-palette', initialFocusRef: inputRef },
        h('label', { className: 'command-palette-search' },
            h(Search, { size: 16, 'aria-hidden': true }),
            h('input', {
                ref: inputRef, type: 'text', value: query, placeholder: t('palette.placeholder'), 'aria-label': t('palette.placeholder'),
                role: 'combobox', 'aria-expanded': true, 'aria-controls': 'command-palette-list',
                'aria-activedescendant': items[index] ? `cmd-${items[index].command.id}` : undefined,
                onChange: (event) => { setQuery(event.target.value); setIndex(0); },
                onKeyDown,
            })),
        h('div', { id: 'command-palette-list', className: 'command-palette-list', role: 'listbox', 'aria-label': t('palette.title') },
            items.length === 0 && h('div', { className: 'command-palette-empty' }, t('palette.empty')),
            items.map(({ command, enabled }, i) => h('div', {
                key: command.id,
                id: `cmd-${command.id}`,
                role: 'option',
                'aria-selected': i === index,
                'aria-disabled': !enabled,
                className: `command-palette-item${i === index ? ' is-active' : ''}${enabled ? '' : ' is-disabled'}`,
                onMouseEnter: () => setIndex(i),
                onClick: () => enabled && run(command),
            },
                h('span', { className: 'command-palette-title' }, command.title),
                command.group && h('span', { className: 'command-palette-group' }, command.group),
                command.shortcutLabel && h(Kbd, null, command.shortcutLabel)))),
        h('div', { className: 'command-palette-hint' }, t('palette.hint')));
}

/** 18.0 — ekran skrótów klawiszowych („?”), zbudowany z tej samej listy poleceń. */
function ShortcutsWindow({ onClose }) {
    const snapshot = useServiceSnapshot('commandRegistry', EMPTY);
    const groups = useMemo(() => {
        const map = new Map();
        for (const command of snapshot.items) {
            if (!command.shortcutLabel || command.id === 'core.redo.shift') continue;
            const group = command.group ?? t('command.group.edit');
            if (!map.has(group)) map.set(group, []);
            map.get(group).push(command);
        }
        return [...map.entries()];
    }, [snapshot]);
    return h(ModalShell, { label: t('shortcuts.title'), onClose, className: 'shortcuts-dialog' },
        h('header', { className: 'shortcuts-head' },
            h('h2', { className: 'dialog-title' }, t('shortcuts.title')),
            h('button', { type: 'button', className: 'ui-button ui-button--ghost ui-button--sm', onClick: onClose }, 'Zamknij')),
        h('p', { className: 'shortcuts-intro' }, t('shortcuts.intro')),
        h('div', { className: 'shortcuts-grid' }, groups.map(([group, commands]) => h('section', { key: group, className: 'shortcuts-group' },
            h('h3', null, group),
            h('dl', null, commands.flatMap((command) => [
                h('dt', { key: `${command.id}-k` }, h(Kbd, null, command.shortcutLabel)),
                h('dd', { key: `${command.id}-t` }, command.title),
            ]))))));
}

export function CommandOverlays() {
    const overlay = useAppSelector(selectOverlay);
    const dispatch = useAppDispatch();
    const close = useCallback(() => dispatch(closeOverlay()), [dispatch]);
    if (overlay === 'palette') return h(PaletteWindow, { onClose: close });
    if (overlay === 'shortcuts') return h(ShortcutsWindow, { onClose: close });
    return null;
}
