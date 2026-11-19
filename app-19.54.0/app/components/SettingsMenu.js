import { createElement as h, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Command, Focus, Keyboard, Moon, RotateCcw, Settings2, Sun } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { setTheme, useAppDispatch, selectDensity, useAppSelector } from '../../store/index.js';
import { t } from '../../i18n/index.js';

const OPENS_WINDOW = new Set(['shell.palette', 'shell.shortcuts', 'shell.resetLayout']);
const EMPTY_SETTINGS = Object.freeze({ values: {} });

function Item({ icon, label, checked = null, onSelect, shortcut = null, title }) {
    // Pozycja z zaznaczeniem to menuitemcheckbox — czytnik ekranu podaje stan.
    const Kind = checked === null ? DropdownMenu.Item : DropdownMenu.CheckboxItem;
    const state = checked === null ? {} : { checked: Boolean(checked) };
    return h(Kind, { className: 'dropdown-item dropdown-item--with-icon', onSelect, title: title || undefined, ...state },
        checked === null ? icon : h('span', { className: 'dropdown-check', 'aria-hidden': true }, checked ? h(Check, { size: 15 }) : null),
        h('span', null, label),
        shortcut && h('kbd', { className: 'ui-kbd dropdown-kbd' }, shortcut));
}

/**
 * 18.0 — menu ustawień w pasku aplikacji (zastępuje menu „Widok” z jedną
 * pozycją). Każda pozycja wywołuje polecenie z CommandRegistry, więc to samo
 * da się zrobić z palety poleceń albo skrótem.
 */
export function SettingsMenu() {
    const registry = useService('commandRegistry');
    const ctx = useService('featureContext');
    const dispatch = useAppDispatch();
    const themeMode = useAppSelector((state) => state.ui.themeMode);
    const theme = useAppSelector((state) => state.ui.theme);
    // Polecenie uruchamia się dopiero po zamknięciu menu (onCloseAutoFocus).
    // Jeśli otwiera okno (paleta, skróty, potwierdzenie), menu NIE oddaje
    // fokusu przyciskowi Ustawień — inaczej wpisywany tekst i Enter trafiały
    // do przycisku zamiast do okna.
    const pending = useRef(null);
    const run = (id) => { pending.current = id; };
    const onCloseAutoFocus = (event) => {
        const id = pending.current;
        pending.current = null;
        if (!id || !registry?.get(id)) return;
        if (OPENS_WINDOW.has(id)) event.preventDefault();
        registry.run(id, ctx);
    };
    const label = (id) => registry?.get(id)?.shortcutLabel || null;
    // 18.1: ustawienia zadeklarowane przez funkcje (slot `settings`).
    const settings = useService('settings');
    const settingsSnapshot = useServiceSnapshot('settings', EMPTY_SETTINGS);
    const featureSettings = settings?.list?.() ?? [];
    return h(DropdownMenu.Root, null,
        h(DropdownMenu.Trigger, { asChild: true },
            h('button', { type: 'button', className: 'icon-button topbar-primary-action', title: t('settings.label'), 'aria-label': t('settings.label') }, h(Settings2, { size: 18 }))),
        h(DropdownMenu.Portal, null,
            h(DropdownMenu.Content, { className: 'dropdown-content settings-menu', sideOffset: 8, align: 'end', onCloseAutoFocus },
                h(DropdownMenu.Label, { className: 'dropdown-label' }, t('settings.title')),
                h(DropdownMenu.Label, { className: 'dropdown-label' }, 'Motyw'),
                [['system', 'System'], ['light', 'Jasny'], ['dark', 'Ciemny']].map(([value, label]) => h(Item, { key: value, checked: themeMode === value, label, onSelect: () => dispatch(setTheme(value)) })),
                h(DropdownMenu.Separator, { className: 'dropdown-separator' }),
                h(Item, { icon: h(Focus, { size: 15 }), label: t('settings.mapOnly'), shortcut: label('shell.mapOnly'), onSelect: () => run('shell.mapOnly') }),
                featureSettings.length > 0 && h(DropdownMenu.Separator, { className: 'dropdown-separator' }),
                featureSettings.length > 0 && h(DropdownMenu.Label, { className: 'dropdown-label' }, t('settings.work')),
                featureSettings.map((setting) => h(Item, {
                    key: setting.id,
                    checked: Boolean(settingsSnapshot.values[setting.id]),
                    label: setting.label,
                    title: setting.description,
                    onSelect: () => settings.set(setting.id, !settingsSnapshot.values[setting.id]),
                })),
                h(DropdownMenu.Separator, { className: 'dropdown-separator' }),
                h(DropdownMenu.Item, { asChild: true }, h('a', { className: 'dropdown-item', href: './monitor-zrodel.html', target: '_blank', rel: 'noopener noreferrer' }, 'Monitor źródeł danych')),
                h(Item, { icon: h(Command, { size: 15 }), label: t('settings.palette'), shortcut: label('shell.palette'), onSelect: () => run('shell.palette') }),
                h(Item, { icon: h(Keyboard, { size: 15 }), label: t('settings.shortcuts'), shortcut: label('shell.shortcuts'), onSelect: () => run('shell.shortcuts') }),
                h(DropdownMenu.Separator, { className: 'dropdown-separator' }),
                h(Item, { icon: h(RotateCcw, { size: 15 }), label: t('settings.resetLayout'), onSelect: () => run('shell.resetLayout') }))));
}
