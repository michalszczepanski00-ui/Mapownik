import { Fragment, createElement as h, useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';
import { getPanel, PanelView } from '../panels/PanelRegistry.js';
import { ActivityBar } from './ActivityBar.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useDockResize } from '../hooks/useDockGeometry.js';
import { useService } from '../services/AppServicesContext.js';
import { DOCK_DEFS, closePanel, selectDockActiveId, selectDockSize, setDockSize, useAppDispatch, useAppSelector } from '../../store/index.js';

const DOCK_ID = 'right';
const MOBILE_SHEET_MIN = 160;

function sheetBounds(element) {
    const workspace = element?.closest?.('.workspace') ?? (element?.classList?.contains('workspace') ? element : null);
    const available = workspace?.clientHeight ?? window.innerHeight;
    // 18.15.0: w powłoce mobilnej panel stoi nad dolnym paskiem (Mapa/Projekt/Więcej),
    // a u góry zostaje miejsce na wyszukiwarkę — jak w arkuszach MobileSheet.
    const shell = workspace?.closest?.('.app-shell.is-mobile');
    const nav = shell ? (shell.querySelector('.m-nav')?.getBoundingClientRect().height ?? 64) : 0;
    const max = shell ? Math.max(120, available - nav - 64) : Math.max(120, available - 26 - 24);
    return { min: Math.min(MOBILE_SHEET_MIN, max), max };
}

/** 18.15.0: wysokości, do których dociąga panel na telefonie: niski, pół ekranu, prawie pełny. */
function mobileSnaps(bounds) {
    const half = clampSheetHeight(Math.round((bounds.max + 50) * 0.54), bounds);
    return [...new Set([bounds.min, half, bounds.max])].sort((a, b) => a - b);
}

function clampSheetHeight(value, bounds) {
    return Math.max(bounds.min, Math.min(bounds.max, value));
}

/**
 * Stała szyna nawigacji i pojedynczy panel po jej lewej stronie.
 *
 * Szyna nie znika po otwarciu modułu. Jej przyciski przełączają zawartość
 * panelu, a ponowne kliknięcie aktywnego przycisku lub przycisk „Zwiń panel”
 * w nagłówku zwija go. Moduły nie są łączone ani dzielone na części.
 */
export function RightPanelDock() {
    const dispatch = useAppDispatch();
    const activeId = useAppSelector((state) => selectDockActiveId(state, DOCK_ID));
    const size = useAppSelector((state) => selectDockSize(state, DOCK_ID));
    const onResizeStart = useDockResize(DOCK_ID);
    const [mobileHeight, setMobileHeight] = useState(() => Math.round((typeof window === 'undefined' ? 700 : window.innerHeight) * 0.54));
    const [mobileBounds, setMobileBounds] = useState({ min: MOBILE_SHEET_MIN, max: 700 });
    // 18.14.0: na telefonie wynik działki pokazuje karta (MobileParcelCard), nie panel doku.
    const mobile = useIsMobile();
    const entry = activeId && !(mobile && activeId === 'identify') ? getPanel(activeId) : null;
    const controller = useService('mapController');
    const dockRef = useRef(null);
    const userSized = useRef(false);
    const panelTrigger = useRef(null);
    const previousPanel = useRef(null);
    useEffect(() => {
        const capture = (event) => {
            const trigger = event.target.closest?.('[data-panel-id], .export-map-trigger, .project-trigger, .object-task-actions button, .m-nav button, .m-list-button');
            if (trigger) panelTrigger.current = { element: trigger, keyboard: event.type === 'keydown' };
        };
        const key = (event) => { if (event.key === 'Enter' || event.key === ' ') capture(event); };
        document.addEventListener('pointerdown', capture, true); document.addEventListener('keydown', key, true);
        return () => { document.removeEventListener('pointerdown', capture, true); document.removeEventListener('keydown', key, true); };
    }, []);
    useEffect(() => {
        if (!entry) {
            if (previousPanel.current && panelTrigger.current?.element?.isConnected) panelTrigger.current.element.focus({ preventScroll: true });
            previousPanel.current = null; return undefined;
        }
        previousPanel.current = entry.id;
        if (!panelTrigger.current?.keyboard) return undefined;
        const focus = () => { const title = dockRef.current?.querySelector('.panel-title'); if (!title) return false; title.focus({ preventScroll: true }); return true; };
        if (focus()) return undefined;
        const observer = new MutationObserver(() => { if (focus()) observer.disconnect(); });
        if (dockRef.current) observer.observe(dockRef.current, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [entry?.id]);
    const hasEntry = Boolean(entry);

    // 18.10: panel leży na mapie, więc zgłaszamy, ile jej przykrywa. CSS przesuwa
    // o tyle przyciski widoku (--dock-inset-*), a kontroler dolicza to do
    // marginesu dopasowania widoku. Na telefonie panel jest arkuszem od dołu.
    useEffect(() => {
        const workspace = document.querySelector('.workspace');
        const element = dockRef.current;
        const apply = () => {
            let right = 0;
            let bottom = 0;
            if (element) {
                const rect = element.getBoundingClientRect();
                if (mobile) bottom = Math.round(rect.height);
                else right = Math.round(rect.width);
            }
            workspace?.style.setProperty('--dock-inset-right', `${right}px`);
            workspace?.style.setProperty('--dock-inset-bottom', `${bottom}px`);
            controller?.setOcclusion?.({ right, bottom });
        };
        apply();
        let observer = null;
        if (element && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(apply);
            observer.observe(element);
        }
        window.addEventListener('resize', apply);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', apply);
            workspace?.style.setProperty('--dock-inset-right', '0px');
            workspace?.style.setProperty('--dock-inset-bottom', '0px');
            controller?.setOcclusion?.({ right: 0, bottom: 0 });
        };
    }, [hasEntry, controller, mobile]);

    // 18.11.0: panel kończy się nad dolnym dokiem (Profil terenu, Analiza wysokości),
    // zamiast zachodzić na niego. Mierzymy, ile miejsca pod mapą zajmuje dok.
    useEffect(() => {
        const workspace = document.querySelector('.workspace');
        const mapArea = document.querySelector('.map-area');
        if (!workspace || !mapArea) return undefined;
        const apply = () => {
            const gap = Math.max(0, Math.round(workspace.getBoundingClientRect().bottom - mapArea.getBoundingClientRect().bottom));
            workspace.style.setProperty('--map-bottom-gap', `${gap}px`);
        };
        apply();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(apply);
        observer.observe(mapArea);
        observer.observe(workspace);
        return () => observer.disconnect();
    }, [hasEntry]);

    // 18.10: Escape zamyka panel i oddaje fokus przyciskowi modułu na szynie.
    // Pomijamy Escape obsłużone wyżej (pole wyszukiwania, menu) i listy rozwijane.
    const onPanelKeyDown = useCallback((event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || !activeId) return;
        if (event.target?.closest?.('select, [role="menu"], [role="listbox"], [role="dialog"]')) return;
        event.preventDefault();
        dispatch(closePanel(activeId));
        window.requestAnimationFrame(() => document.querySelector(`.activity-bar [data-panel-id="${activeId}"]`)?.focus());
    }, [dispatch, activeId]);

    useEffect(() => {
        const workspace = document.querySelector('.workspace');
        if (!workspace) return undefined;
        const update = () => {
            const bounds = sheetBounds(workspace);
            setMobileBounds((previous) => previous.min === bounds.min && previous.max === bounds.max ? previous : bounds);
            // 18.15.0: dopóki użytkownik nie zmienił wysokości, panel stoi na „pół ekranu”.
            setMobileHeight((current) => (userSized.current ? clampSheetHeight(current, bounds) : mobileSnaps(bounds)[Math.min(1, mobileSnaps(bounds).length - 1)]));
        };
        update();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(update);
            observer.observe(workspace);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    // 18.15.0: na telefonie panel zachowuje się jak arkusz Map Google — po
    // puszczeniu uchwytu dociąga do jednej z trzech wysokości (niski / pół
    // ekranu / prawie pełny), dotknięcie uchwytu przełącza wysokość, a
    // przeciągnięcie w dół poniżej najniższej zamyka panel. Wcześniej wysokość
    // była dowolna i panel dawało się zamknąć tylko krzyżykiem.
    const onMobileResizeStart = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const bounds = sheetBounds(event.currentTarget);
        const startY = event.clientY;
        const startHeight = clampSheetHeight(mobileHeight, bounds);
        const floor = Math.max(80, bounds.min - 160); // poniżej najniższej wysokości — do zamknięcia
        userSized.current = true;
        let moved = false;
        let last = startHeight;
        const move = (next) => {
            if (Math.abs(next.clientY - startY) > 6) moved = true;
            if (!moved) return;
            last = Math.max(floor, Math.min(bounds.max, startHeight + startY - next.clientY));
            setMobileHeight(last);
        };
        const stop = (end) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
            const snaps = mobileSnaps(bounds);
            if (!moved) {
                if (end?.type === 'pointercancel') return;
                // Dotknięcie: następna wyższa wysokość, z najwyższej — najniższa.
                setMobileHeight(snaps.find((value) => value > startHeight + 24) ?? snaps[0]);
                return;
            }
            if (last < bounds.min - 60 && activeId) {
                setMobileHeight(snaps[1]);
                dispatch(closePanel(activeId));
                return;
            }
            setMobileHeight(snaps.reduce((best, value) => (Math.abs(value - last) < Math.abs(best - last) ? value : best), snaps[0]));
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
        window.addEventListener('pointercancel', stop, { once: true });
    };

    const onMobileResizeKeyDown = (event) => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const bounds = sheetBounds(event.currentTarget);
        const next = event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max
            : mobileHeight + (event.key === 'ArrowUp' ? 40 : -40);
        userSized.current = true;
        setMobileHeight(clampSheetHeight(next, bounds));
    };

    return h(Fragment, null,
        entry && h('div', {
            ref: dockRef,
            id: 'right-dock-panel',
            onKeyDown: onPanelKeyDown,
            className: 'dock dock--right dock--right-panel',
            style: { '--dock-panel-width': `${size}px`, '--mobile-sheet-height': `${mobileHeight}px` },
            role: 'group',
            'aria-label': t('dock.label', { title: entry.title }),
        },
            h('div', {
                className: 'mobile-sheet-grip',
                role: 'separator',
                tabIndex: 0,
                'aria-orientation': 'horizontal',
                'aria-label': t('dock.resizeMobileHeight'),
                'aria-valuemin': mobileBounds.min,
                'aria-valuemax': mobileBounds.max,
                'aria-valuenow': clampSheetHeight(mobileHeight, mobileBounds),
                onPointerDown: onMobileResizeStart,
                onKeyDown: onMobileResizeKeyDown,
            }),
            h(PanelView, { key: entry.id, entry }),
            h('div', {
                className: 'dock-resizer',
                role: 'separator',
                tabIndex: 0,
                'aria-orientation': 'vertical',
                'aria-label': t('dock.resizeWidth'),
                'aria-valuemin': DOCK_DEFS.right.min,
                'aria-valuemax': DOCK_DEFS.right.max,
                'aria-valuenow': size,
                onKeyDown: (event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const def = DOCK_DEFS.right;
                    const workspace = event.currentTarget.closest('.workspace');
                    const available = workspace?.querySelector('.map-column')?.clientWidth ?? workspace?.clientWidth ?? window.innerWidth;
                    const max = Math.max(def.min, Math.min(def.max, available * def.maxRatio));
                    const next = event.key === 'Home' ? def.min : event.key === 'End' ? max : size + (event.key === 'ArrowLeft' ? 20 : -20);
                    const bounded = Math.max(def.min, Math.min(max, next));
                    dispatch(setDockSize(DOCK_ID, bounded));
                },
                onPointerDown: onResizeStart,
            })),
        h(ActivityBar, null));
}
