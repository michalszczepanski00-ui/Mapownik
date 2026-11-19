import { createElement as h, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
const EMPTY = Object.freeze({ status: 'idle', pendingChanges: 0 });
/**
 * 19.48.0 (M3) — stan zapisu projektu jako kropka przy „Projekt ▾”:
 * zielona — zapisano w tej przeglądarce; szara — brak zmian od otwarcia (albo wczytywanie, tylko odczyt);
 * pomarańczowa — niezapisane zmiany / trwa zapis; czerwona — błąd zapisu (istniejący kolor --danger).
 */
export function projectSaveStatus(session) {
    const time = (iso) => { try { return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
    if (session.error || session.status === 'error') return { tone: 'error', text: `Błąd zapisu w przeglądarce: ${session.error ?? 'spróbuję ponownie'}. Zapisz plik projektu z menu Projekt.` };
    if (session.readOnly) return { tone: 'idle', text: 'Projekt tylko do odczytu (otwarty z linku udostępniania).' };
    if (session.status === 'saving' || Number(session.pendingChanges) > 0) return { tone: 'pending', text: 'Niezapisane zmiany — zapisuję w tej przeglądarce…' };
    if (session.status === 'ready' && session.lastSavedAt) return { tone: 'saved', text: `Zapisano w tej przeglądarce o ${time(session.lastSavedAt)}. Plik kopii pobierzesz z menu Projekt.` };
    if (session.status === 'ready') return { tone: 'idle', text: 'Brak zmian od otwarcia. Projekt jest zapisywany w tej przeglądarce.' };
    return { tone: 'idle', text: 'Wczytuję projekt…' };
}
/**
 * 19.53.0 (Etap 6) — menu akcji strefy rejestru (topbar.project, topbar.share). Akcja uruchamia się
 * po zamknięciu menu (fokus wraca na przycisk, zanim otworzy się okno dialogowe albo wybór pliku).
 */
function ZoneMenu({ zone, trigger, label }) {
    const ctx = useService('featureContext');
    const features = useService('features');
    const pending = useRef(null);
    const actions = features?.actions.list(zone, ctx) ?? [];
    return h(DropdownMenu.Root, null,
        h(DropdownMenu.Trigger, { asChild: true }, trigger),
        h(DropdownMenu.Portal, null, h(DropdownMenu.Content, { className: 'dropdown-content topbar-menu', sideOffset: 6, align: 'end', 'aria-label': label,
            onCloseAutoFocus: (event) => { const id = pending.current; pending.current = null; if (id) { event.preventDefault(); features?.actions.run(id, ctx); } } },
        actions.flatMap((action, index) => [
            action.separatorBefore && index > 0 ? h(DropdownMenu.Separator, { key: `${action.id}-sep`, className: 'dropdown-separator' }) : null,
            h(DropdownMenu.Item, { key: action.id, className: 'dropdown-item', 'data-action-id': action.id, title: action.hint, onSelect: () => { pending.current = action.id; } }, action.label),
        ]))));
}

export function ProjectMenu() {
    const ctx = useService('featureContext');
    const transfer = useServiceSnapshot('transfers', EMPTY);
    const session = useServiceSnapshot('projectSession', EMPTY);
    const status = projectSaveStatus(session);
    return h('div', { className: 'project-menu-wrap' },
        h(ZoneMenu, { zone: 'topbar.project', label: 'Projekt', trigger: h('button', { className: 'project-trigger', type: 'button', disabled: !ctx || transfer.busy }, 'Projekt ▾') }),
        // 19.48.0 (M3): kropka statusu zamiast tekstu „✓ Zapis lokalny”; opis w podpowiedzi i dla czytnika ekranu.
        h('span', { className: `project-status-dot is-${status.tone}`, role: 'status', 'aria-label': status.text, title: status.text }));
}

/** 19.53.0 (Etap 6): Udostępnij ▾ — link, eksport mapy PNG/PDF, pliki GIS. Jedyny wypełniony przycisk górnego paska. */
export function ShareMenu() {
    const ctx = useService('featureContext');
    const transfer = useServiceSnapshot('transfers', EMPTY);
    return h(ZoneMenu, { zone: 'topbar.share', label: 'Udostępnij', trigger: h('button', { className: 'share-trigger export-map-trigger', type: 'button', disabled: !ctx || transfer.busy }, 'Udostępnij ▾') });
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
