import { resetWorkCardPreferences } from '../components/workspaceLayout.js';
import { useEffect } from 'react';
import { useService } from '../services/AppServicesContext.js';
import {
    openOverlay, closeOverlay, openPanel, resetPanelLayout, setDensity, setMapOnly, toggleTheme,
    selectOverlay, useAppDispatch, store, selectDockActiveId, selectDockLastId, togglePanel, PANEL_IDS, PANEL_DEFS,
} from '../../store/index.js';
import { appDialogs } from '../../core/index.js';
import { t } from '../../i18n/index.js';

/**
 * 18.0 — polecenia powłoki w CommandRegistry: paleta poleceń, ekran skrótów,
 * wyszukiwarka, motyw, podpisy narzędzi, gęstość, panele, układ.
 * Te polecenia potrzebują stanu interfejsu (store), więc rejestruje je React;
 * polecenia mapy rejestrują funkcje (features/builtin/coreFeature.js).
 */
// Słowa kluczowe palety poleceń są w katalogu jako lista rozdzielona przecinkami.
const keywords = (key) => t(key).split(',').map((word) => word.trim()).filter(Boolean);

export async function confirmResetLayout(dispatch) {
    const accepted = await appDialogs.confirm({
        title: t('layout.reset.title'),
        message: t('layout.reset.message'),
        hint: t('layout.reset.hint'),
        confirmLabel: t('layout.reset.confirm'),
    });
    if (accepted) {
        dispatch(resetPanelLayout());
        let storage; try { storage = window.localStorage; } catch {}
        resetWorkCardPreferences(storage);
    }
}

export function useShellCommands() {
    const registry = useService('commandRegistry');
    const dispatch = useAppDispatch();
    useEffect(() => {
        if (!registry) return undefined;
        const state = () => store.getState();
        const toggleOverlay = (name) => (selectOverlay(state()) === name ? dispatch(closeOverlay()) : dispatch(openOverlay(name)));
        const view = t('command.group.view');
        const panels = t('command.group.panels');
        const help = t('command.group.help');
        const definitions = [
            {
                // Ctrl+K działa także w otwartej palecie (zamyka ją), ale nie nad
                // oknem potwierdzenia — tam paleta otwierałaby się pod tłem okna.
                id: 'shell.palette', title: t('command.palette'), group: help, shortcut: { key: 'k', ctrl: true }, allowInInput: true, allowInDialog: true, order: 900,
                when: () => !appDialogs.getSnapshot().request, run: () => toggleOverlay('palette'),
            },
            { id: 'shell.shortcuts', title: t('command.shortcuts'), group: help, shortcut: { key: '?', label: '?' }, order: 901, run: () => toggleOverlay('shortcuts') },
            {
                id: 'shell.search', title: t('command.search'), group: help, shortcut: { key: '/', label: '/' }, order: 902, keywords: keywords('command.search.keywords'),
                run: () => { const input = document.getElementById('map-search-input'); input?.focus(); input?.select?.(); },
            },
            { id: 'shell.theme', title: t('command.theme'), group: view, order: 910, keywords: keywords('command.theme.keywords'), run: () => dispatch(toggleTheme()) },
            { id: 'shell.resetLayout', title: t('command.resetLayout'), group: view, order: 913, run: () => confirmResetLayout(dispatch) },
            { id: 'shell.mapOnly', title: t('command.mapOnly'), group: view, order: 914, shortcut: { key: 'm', ctrl: true, shift: true }, run: () => dispatch(setMapOnly(!state().ui.mapOnly)) },
            // 18.9.11: polecenia „Pokaż panel …” wynikają z manifestów paneli
            // (te z pozycją w szynie), więc nowy moduł nie wymaga zmian tutaj.
            ...PANEL_IDS.filter((id) => PANEL_DEFS[id].rail !== false).map((id, index) => ({
                id: `shell.panel.${id}`, title: t('command.openPanel', { title: PANEL_DEFS[id].title }), group: panels, order: 920 + index, run: () => dispatch(openPanel(id)),
            })),
            // 19.45.0: porównanie działek projektu (panel bez pozycji w szynie).
            { id: 'shell.panel.parcelCompare', title: 'Porównaj działki projektu', group: panels, order: 939, keywords: ['porównanie', 'działki', 'tabela', 'csv', 'zestawienie'], run: () => dispatch(openPanel('parcelCompare')) },
            {
                // Zwija aktywny moduł albo przywraca ostatnio używany (nie zawsze Warstwy).
                id: 'shell.dock.toggle', title: t('command.toggleDock'), group: panels, order: 940, shortcut: { key: '\\', ctrl: true, label: '\\' },
                run: () => {
                    const active = selectDockActiveId(state(), 'right');
                    dispatch(active ? togglePanel(active) : openPanel(selectDockLastId(state()) ?? 'layers'));
                },
            },
        ];
        const disposers = [];
        for (const definition of definitions) {
            try { disposers.push(registry.register(definition)); }
            catch (error) { console.error('[polecenia powłoki]', error); }
        }
        return () => disposers.forEach((dispose) => dispose());
    }, [registry, dispatch]);
}
