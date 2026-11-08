import { createElement as h, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { openPanel, useAppDispatch } from '../../store/index.js';
const EMPTY = Object.freeze({ status: 'idle', pendingChanges: 0 });
export function ProjectMenu() {
    const ctx = useService('featureContext');
    const features = useService('features');
    const transfer = useServiceSnapshot('transfers', EMPTY);
    const session = useServiceSnapshot('projectSession', EMPTY);
    const dispatch = useAppDispatch();
    const input = useRef(null), pending = useRef(null);
    const format = features?.list('exportFormats').find((item) => item.id === 'project');
    const run = async (id, file) => {
        try { await format?.actions.find((item) => item.id === id)?.run(ctx, {}, file); }
        catch (error) { ctx?.toasts.show({ tone: 'danger', message: error instanceof Error ? error.message : String(error) }); }
    };
    const saved = session.status === 'ready' && session.pendingChanges === 0;
    return h('div', { className: 'project-menu-wrap' },
        h('input', { ref: input, type: 'file', hidden: true, accept: '.mapownik,application/json', onChange: (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run('open', file); } }),
        h(DropdownMenu.Root, null,
            h(DropdownMenu.Trigger, { asChild: true }, h('button', { className: 'project-trigger', type: 'button', disabled: !ctx || transfer.busy }, 'Projekt ▾')),
            h(DropdownMenu.Portal, null, h(DropdownMenu.Content, { className: 'dropdown-content', sideOffset: 6, align: 'start', onCloseAutoFocus: (event) => { const id = pending.current; pending.current = null; if (id) { event.preventDefault(); void run(id); } } },
                h(DropdownMenu.Label, { className: 'dropdown-label' }, 'Plik projektu .mapownik'),
                h(DropdownMenu.Item, { className: 'dropdown-item', onSelect: () => { input.current?.click(); } }, 'Otwórz projekt…'),
                h(DropdownMenu.Item, { className: 'dropdown-item', onSelect: () => { pending.current = 'save'; } }, 'Zapisz plik projektu'),
                h(DropdownMenu.Item, { className: 'dropdown-item', onSelect: () => { pending.current = 'share'; } }, 'Udostępnij przez link…'),
                h(DropdownMenu.Separator, { className: 'dropdown-separator' }),
                h(DropdownMenu.Item, { className: 'dropdown-item', onSelect: () => dispatch(openPanel('objects')) }, 'Obiekty i pliki GIS…')))),
        h('span', { className: `project-save-status${session.error ? ' has-error' : ''}`, title: session.error ?? 'Projekt jest zapisywany w tej przeglądarce. Plik kopii pobierzesz z menu Projekt.', role: 'status' },
            session.error ? 'Błąd zapisu' : session.readOnly ? 'Tylko odczyt' : saved ? '✓ Zapis lokalny' : session.status === 'saving' || session.pendingChanges ? 'Zapisuję…' : 'Wczytuję…'));
}

/** 19.28.0: Zapisz · Otwórz · Udostępnij wprost (arkusz Projekt na telefonie) — bez rozwijania sekcji plików. */
export function ProjectQuickActions() {
    const ctx = useService('featureContext');
    const features = useService('features');
    const transfer = useServiceSnapshot('transfers', EMPTY);
    const input = useRef(null);
    const format = features?.list('exportFormats').find((item) => item.id === 'project');
    const run = async (id, file) => {
        try { await format?.actions.find((item) => item.id === id)?.run(ctx, {}, file); }
        catch (error) { ctx?.toasts.show({ tone: 'danger', message: error instanceof Error ? error.message : String(error) }); }
    };
    const busy = !ctx || !format || transfer.busy;
    return h('div', { className: 'project-quick-actions', role: 'group', 'aria-label': 'Plik projektu' },
        h('input', { ref: input, type: 'file', hidden: true, accept: '.mapownik,application/json', onChange: (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run('open', file); } }),
        h('button', { type: 'button', className: 'm-list-button', disabled: busy, onClick: () => void run('save') }, 'Zapisz plik projektu'),
        h('button', { type: 'button', className: 'm-list-button', disabled: busy, onClick: () => input.current?.click() }, 'Otwórz projekt…'),
        h('button', { type: 'button', className: 'm-list-button', disabled: busy, onClick: () => void run('share') }, 'Udostępnij przez link…'));
}
