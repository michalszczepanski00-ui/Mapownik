import { createElement as h, useCallback } from 'react';
import {
    Moon,
    Magnet,
    Focus,
    Sun,
    Undo2,
    Redo2,
} from 'lucide-react';
import { IconButton } from './IconButton.js';
import { ProjectMenu } from './ProjectMenu.js';
import { openPanel } from '../../store/index.js';
import { SettingsMenu } from './SettingsMenu.js';
import { SearchToolbar } from './SearchToolbar.js';
import { QuickHelp } from './QuickHelp.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { t } from '../../i18n/index.js';
import { openOverlay, setMapOnly, toggleTheme, useAppDispatch, useAppSelector } from '../../store/index.js';

const EMPTY_COMMANDS = Object.freeze({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, undoDepth: 0, redoDepth: 0, error: null });
const IDLE_SKETCH = Object.freeze({ active: false });
const NO_TOOLS = Object.freeze({ items: [] });
const NO_OBJECTS = Object.freeze({ count: 0 });
const EMPTY_EDITING = Object.freeze({ mode: 'pan', circleRadiusMeters: 25, snapEnabled: true, snapTargetCount: 0, error: null });

/**
 * Pasek aplikacji — to, co dotyczy całej sesji, a nie bieżącego zaznaczenia:
 * tożsamość, snap, historia operacji, wyszukiwarka i motyw (podkład: miniatury
 * na mapie, BasemapSwitcher).
 *
 * Aktywne narzędzie i zaznaczony obiekt mają pasek kontekstu (ContextBar),
 * a przełączniki paneli — zakładki doku.
 */
export function AppBar() {
    const dispatch = useAppDispatch();
    const theme = useAppSelector((state) => state.ui.theme);

    const commandBus = useService('commands');
    const editingManager = useService('editing');
    const searchManager = useService('search');

    const commands = useServiceSnapshot('commands', EMPTY_COMMANDS);
    const editing = useServiceSnapshot('editing', EMPTY_EDITING);

    const ctx = useService('featureContext');
    const sketch = useServiceSnapshot('sketch', IDLE_SKETCH);
    const onToggleTheme = useCallback(() => dispatch(toggleTheme()), [dispatch]);

    return h('div', { className: 'app-bar' },
        h('div', { className: 'brand', 'aria-label': 'Mapownik' },
            h('img', { className: 'brand-logo-image', src: './assets/mapownik-logo-icon.png?v=19.51.0', alt: '', 'aria-hidden': true }),
            h('div', { className: 'brand-copy' }, h('strong', null, 'Mapownik'))),

        h(ProjectMenu, null),
        h('div', { className: 'toolbar-divider toolbar-divider--snap' }),
        h(IconButton, {
            label: editing.snapEnabled
                ? t('appbar.snapOn', { count: editing.snapTargetCount ?? 0 })
                : t('appbar.snapOff'),
            tooltipSide: 'bottom',
            className: `topbar-primary-action${editing.snapEnabled ? ' is-active' : ''}`,
            'aria-pressed': editing.snapEnabled,
            disabled: !editingManager,
            onClick: () => editingManager?.toggleSnap(),
        }, h(Magnet, { size: 17 })),

        h('div', { className: 'toolbar-divider toolbar-divider--history' }),
        h(IconButton, { className: 'topbar-primary-action', label: sketch.active ? 'Cofnij punkt szkicu' : commands.undoLabel ? t('appbar.undo', { label: commands.undoLabel }) : t('appbar.undoNone'), tooltipSide: 'bottom', disabled: !commandBus || (!sketch.active && !commands.canUndo), onClick: () => sketch.active ? ctx?.interactions.undoLastPoint() : commandBus?.undo() }, h(Undo2, { size: 17 })),
        h(IconButton, { className: 'topbar-primary-action', label: commands.redoLabel ? t('appbar.redo', { label: commands.redoLabel }) : t('appbar.redoNone'), tooltipSide: 'bottom', disabled: !commandBus || !commands.canRedo, onClick: () => commandBus?.redo() }, h(Redo2, { size: 17 })),

        h('div', { className: 'top-spacer' }),
        h(SearchToolbar, { manager: searchManager }),
        h('button', { type: 'button', className: 'export-map-trigger', onClick: () => dispatch(openPanel('export')) }, 'Eksport mapy'),
        h(IconButton, { id: 'map-only-enter', className: 'topbar-primary-action', label: t('mapOnly.enter'), tooltipSide: 'bottom', onClick: () => dispatch(setMapOnly(true)) }, h(Focus, { size: 18 })),
        // 18.0: menu ustawień (motyw, podpisy narzędzi, gęstość, skróty, paleta
        // poleceń, układ paneli) zamiast menu „Widok” z jedną pozycją.
        h(SettingsMenu, null),
        h(IconButton, { className: 'topbar-primary-action', label: theme === 'dark' ? t('appbar.themeLight') : t('appbar.themeDark'), tooltipSide: 'bottom', onClick: onToggleTheme }, theme === 'dark' ? h(Sun, { size: 18 }) : h(Moon, { size: 18 })));
}

/**
 * 19.9.0 — pasek aplikacji rozłożony na mapie zamiast paska na całą szerokość.
 *
 * Lewy górny róg: znak (otwiera paletę poleceń, Ctrl+K) i wyszukiwarka
 * miejsca/działki, widoczna zawsze — także przy otwartym panelu i narzędziu.
 * Prawy górny róg: przyciąganie, historia, projekt, eksport, widok, ustawienia.
 * Te same kontrolki i polecenia co w AppBar; zmienia się tylko miejsce.
 */
export function MapTopBar() {
    const dispatch = useAppDispatch();
    const searchManager = useService('search');

    return h('div', { className: 'map-topbar' },
        h('div', { className: 'map-topbar-start' },
            h(IconButton, { className: 'map-brand-button', label: 'Mapownik — polecenia (Ctrl+K)', tooltipSide: 'bottom', onClick: () => dispatch(openOverlay('palette')) },
                h('img', { src: './assets/mapownik-logo-icon.png?v=19.51.0', alt: '', 'aria-hidden': true })),
            h(SearchToolbar, { manager: searchManager })),
        h('div', { className: 'map-topbar-end', role: 'toolbar', 'aria-label': 'Projekt i widok' },
            // 19.49.0 (M2, Etap 2): przyciąganie, cofnij i ponów przeniesione do paska kontekstowego (MapContextBar).
            h('div', { className: 'map-topbar-group map-topbar-project' }, h(ProjectMenu, null)),
            h('button', { type: 'button', className: 'export-map-trigger', onClick: () => dispatch(openPanel('export')) }, 'Eksport'),
            h(QuickHelp, null),
            h(SettingsMenu, null)));
}
