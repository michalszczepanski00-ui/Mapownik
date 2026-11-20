import { useCallback, useEffect, useMemo } from 'react';
import {
    DOCK_DEFS,
    DOCK_SPLIT_MAX_RATIO,
    DOCK_SPLIT_MIN_RATIO,
    PANEL_BOTTOM_MARGIN,
    PANEL_DEFS,
    PANEL_IDS,
    PANEL_MAX_WIDTH_RATIO,
    PANEL_MIN_HEIGHT,
    PANEL_MODE,
    closePanel,
    maxWidthFor,
    selectDockSize,
    selectPanelCollapsed,
    selectPanelDocked,
    selectPanelGeometry,
    selectPanelOpen,
    setDockSize,
    setDockSplitRatio,
    setPanelCollapsed,
    setPanelGeometry,
    setPanelMode,
    useAppDispatch,
    useAppSelector,
} from '../../store/index.js';

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Układ odniesienia gestu. Panele pływające są pozycjonowane względem obszaru
 * mapy (`.map-area`), a uchwyt doku leży poza nim — wtedy odniesieniem jest
 * cały obszar roboczy.
 */
function workspaceFrom(element) {
    return element?.closest?.('.map-area, .workspace') ?? null;
}

/**
 * 19.27.0: górna granica okien pływających — dolna krawędź paska aplikacji nad mapą
 * (`.map-topbar`) + odstęp. Wcześniej granicą było 8 px od krawędzi mapy, więc okno
 * bez zapamiętanej pozycji lądowało POD paskiem (który ma wyższą warstwę) i znikało.
 */
export function floatingTopSafe(workspace) {
    const bar = workspace?.querySelector?.(':scope > .map-topbar');
    if (!bar) return 8;
    const barBottom = [...bar.children].reduce((bottom, child) => Math.max(bottom, child.getBoundingClientRect().bottom), 0);
    const top = workspace.getBoundingClientRect().top;
    return barBottom > top ? Math.round(barBottom - top + 8) : 8;
}
/** Panele, które same ustalają położenie okna (karta miejsca, Analizy, Eksport — przy prawej szynie). */
const SELF_PLACED = new Set(['analysis', 'export']);

/**
 * Wspólna obsługa gestu wskaźnika dla wszystkich uchwytów paneli.
 *
 * `compute` liczy nową wartość z każdego ruchu, `commit` zapisuje ją do store.
 * Zapis jest dławiony do jednej klatki, żeby przeciąganie nie generowało
 * dispatchu na każde zdarzenie pointermove.
 *
 * pointercancel jest obsługiwany na równi z pointerup: gest przejęty przez
 * przeglądarkę lub system (gest dotykowy, odrzucenie dłoni, utrata przechwytu)
 * NIGDY nie wywoła pointerup. Bez tego nasłuch pointermove zostawał podpięty
 * na zawsze — wyciek listenera, który psuł następne, zupełnie niezwiązane
 * przeciąganie (regresja naprawiona w 17.6.4; nie usuwać).
 */
function trackPointer(event, compute, commit) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    let pending = null;
    let frame = null;

    const flush = () => {
        frame = null;
        if (pending !== null) commit(pending);
    };
    const onMove = (moveEvent) => {
        const next = compute(moveEvent);
        if (next === null || next === undefined) return;
        pending = next;
        if (frame === null) frame = window.requestAnimationFrame(flush);
    };
    const onEnd = () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
        if (pending !== null) commit(pending);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd, { once: true });
    window.addEventListener('pointercancel', onEnd, { once: true });
}

/** Otwarcie, minimalizacja, tryb i geometria jednego panelu. */
export function usePanelState(id) {
    const open = useAppSelector((state) => selectPanelOpen(state, id));
    const collapsed = useAppSelector((state) => selectPanelCollapsed(state, id));
    const docked = useAppSelector((state) => selectPanelDocked(state, id));
    const geometry = useAppSelector((state) => selectPanelGeometry(state, id));
    return { open, collapsed, docked, ...geometry };
}

/**
 * Uchwyt rozmiaru doku — ten sam dla obu krawędzi.
 *
 * Dok ma jeden rozmiar wspólny dla wszystkich swoich modułów: przeciągnięcie
 * krawędzi ustawia go raz, zamiast per panel. Kierunek wynika z krawędzi:
 * dok prawy rośnie przy ruchu w lewo, dolny przy ruchu w górę.
 */
export function useDockResize(dockId) {
    const dispatch = useAppDispatch();
    const size = useAppSelector((state) => selectDockSize(state, dockId));

    return useCallback((event) => {
        const def = DOCK_DEFS[dockId];
        if (!def) return;
        const workspace = workspaceFrom(event.currentTarget);
        const vertical = def.axis === 'height';
        const start = vertical ? event.clientY : event.clientX;
        const dockRect = event.currentTarget.closest('.dock')?.getBoundingClientRect();
        const startSize = dockRect ? (vertical ? dockRect.height : dockRect.width) : size;
        trackPointer(
            event,
            (moveEvent) => {
                const mapColumn = workspace?.querySelector?.('.map-column');
                const available = vertical
                    ? (mapColumn?.clientHeight ?? workspace?.clientHeight ?? window.innerHeight)
                    : (mapColumn?.clientWidth ?? workspace?.clientWidth ?? window.innerWidth);
                const max = Math.max(def.min, Math.min(def.max, available * def.maxRatio));
                const delta = (vertical ? moveEvent.clientY : moveEvent.clientX) - start;
                return Math.round(clamp(startSize - delta, def.min, max));
            },
            (value) => dispatch(setDockSize(dockId, value)),
        );
    }, [dispatch, dockId, size]);
}

/** Najniższa wysokość każdej z części podzielonego doku [px]. */
const SPLIT_PANE_MIN_PX = 130;

/** Dopuszczalny zakres udziału górnej części przy danej wysokości doku. */
function splitBounds(height) {
    const minByPx = height > 0 ? SPLIT_PANE_MIN_PX / height : DOCK_SPLIT_MIN_RATIO;
    const low = Math.max(DOCK_SPLIT_MIN_RATIO, minByPx);
    const high = Math.min(DOCK_SPLIT_MAX_RATIO, 1 - minByPx);
    return low <= high ? [low, high] : [0.5, 0.5];
}

/**
 * 17.8.12: uchwyt podziału doku (Warstwy nad Obiektami).
 *
 * Udział górnej części liczony jest z położenia wskaźnika w kontenerze części
 * doku; obie części mają co najmniej SPLIT_PANE_MIN_PX wysokości. Klawiatura:
 * strzałki w górę/w dół przesuwają podział o 5%, Home/End do skrajnych
 * położeń, Enter przywraca domyślny.
 */
export function useDockSplitResize(dockId, containerRef) {
    const dispatch = useAppDispatch();
    const onPointerDown = useCallback((event) => {
        const container = containerRef.current;
        if (!container) return;
        trackPointer(
            event,
            (moveEvent) => {
                const rect = container.getBoundingClientRect();
                if (!(rect.height > 0)) return null;
                const [low, high] = splitBounds(rect.height);
                return clamp((moveEvent.clientY - rect.top) / rect.height, low, high);
            },
            (value) => dispatch(setDockSplitRatio(dockId, value)),
        );
    }, [containerRef, dispatch, dockId]);
    const onKeyDown = useCallback((event, ratio, defaultRatio) => {
        const container = containerRef.current;
        const [low, high] = splitBounds(container?.getBoundingClientRect().height ?? 0);
        let next = null;
        if (event.key === 'ArrowUp') next = ratio - 0.05;
        else if (event.key === 'ArrowDown') next = ratio + 0.05;
        else if (event.key === 'Home') next = low;
        else if (event.key === 'End') next = high;
        else if (event.key === 'Enter') next = defaultRatio;
        if (next === null) return;
        event.preventDefault();
        dispatch(setDockSplitRatio(dockId, clamp(next, low, high)));
    }, [containerRef, dispatch, dockId]);
    return { onPointerDown, onKeyDown };
}

/**
 * Uchwyty zmiany szerokości, wysokości i położenia panelu.
 *
 * Jedna implementacja zamiast trzech kopii resizePanel/resizePanelHeight/
 * dragPanel w App.js — i dostępna dla każdego panelu z PANEL_DEFS, a nie tylko
 * dla Obiektów i Warstw.
 */
export function useDockGeometry(id) {
    const dispatch = useAppDispatch();
    const def = PANEL_DEFS[id];
    const { width } = useAppSelector((state) => selectPanelGeometry(state, id));

    const onResizeStart = useCallback((event) => {
        if (!def || !Number.isFinite(def.minWidth)) return;
        const workspace = workspaceFrom(event.currentTarget);
        const startX = event.clientX;
        const startWidth = width;
        trackPointer(
            event,
            (moveEvent) => {
                const workspaceWidth = workspace?.clientWidth ?? window.innerWidth;
                const responsiveMax = maxWidthFor(id, workspaceWidth, PANEL_MAX_WIDTH_RATIO) ?? def.maxWidth;
                const delta = def.resizeDirection * (moveEvent.clientX - startX);
                return Math.round(clamp(startWidth + delta, def.minWidth, responsiveMax));
            },
            (value) => dispatch(setPanelGeometry(id, { width: value })),
        );
    }, [def, dispatch, id, width]);

    const onResizeHeightStart = useCallback((event) => {
        const panel = event.currentTarget.closest('aside');
        const workspace = workspaceFrom(event.currentTarget);
        if (!panel || !workspace) return;
        const startHeight = panel.getBoundingClientRect().height;
        const startY = event.clientY;
        trackPointer(
            event,
            (moveEvent) => {
                const maxHeight = Math.max(PANEL_MIN_HEIGHT, workspace.clientHeight - 48);
                return Math.round(clamp(startHeight + (moveEvent.clientY - startY), PANEL_MIN_HEIGHT, maxHeight));
            },
            (value) => dispatch(setPanelGeometry(id, { height: value })),
        );
    }, [dispatch, id]);

    const onDragStart = useCallback((event) => {
        const panel = event.currentTarget.closest('aside');
        const workspace = workspaceFrom(event.currentTarget);
        if (!panel || !workspace) return;
        event.stopPropagation();
        const workspaceRect = workspace.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const startPointerX = event.clientX;
        const startPointerY = event.clientY;
        const startX = panelRect.left - workspaceRect.left;
        const startY = panelRect.top - workspaceRect.top;
        trackPointer(
            event,
            (moveEvent) => {
                const current = workspace.getBoundingClientRect();
                return {
                    x: Math.round(clamp(startX + moveEvent.clientX - startPointerX, 4, current.width - panel.offsetWidth - 4)),
                    y: Math.round(clamp(startY + moveEvent.clientY - startPointerY, floatingTopSafe(workspace), current.height - PANEL_BOTTOM_MARGIN)),
                };
            },
            (value) => dispatch(setPanelGeometry(id, { position: value })),
        );
    }, [dispatch, id]);

    return useMemo(
        () => ({ onResizeStart, onResizeHeightStart, onDragStart }),
        [onResizeStart, onResizeHeightStart, onDragStart],
    );
}

/**
 * Komplet tego, czego potrzebuje komponent panelu: stan, gotowy styl
 * i akcje. Dzięki temu panel nie przyjmuje już jedenastu propsów z App.
 */
export function usePanel(id) {
    const dispatch = useAppDispatch();
    const state = usePanelState(id);
    const handlers = useDockGeometry(id);

    // W doku o rozmiarze decyduje dok, nie panel — własna geometria panelu
    // czeka wtedy nieużywana na ewentualne odpięcie.
    const style = useMemo(() => {
        if (state.docked) return undefined;
        const next = {};
        if (Number.isFinite(state.width)) next.width = state.width;
        if (state.height) {
            next.height = state.height;
            next.bottom = 'auto';
        }
        if (state.position) {
            next.left = state.position.x;
            next.top = state.position.y;
            next.right = 'auto';
        }
        return next;
    }, [state.docked, state.width, state.height, state.position]);

    const close = useCallback(() => dispatch(closePanel(id)), [dispatch, id]);
    const collapse = useCallback(() => dispatch(setPanelCollapsed(id, true)), [dispatch, id]);
    const restore = useCallback(() => dispatch(setPanelCollapsed(id, false)), [dispatch, id]);
    const undock = useCallback(() => dispatch(setPanelMode(id, PANEL_MODE.floating)), [dispatch, id]);
    const dock = useCallback(() => dispatch(setPanelMode(id, PANEL_MODE.docked)), [dispatch, id]);

    return { ...state, style, close, collapse, restore, undock, dock, ...handlers };
}

/**
 * Utrzymuje panele w granicach obszaru roboczego po zmianie rozmiaru okna.
 *
 * Wcześniej ta logika była rozwinięta ręcznie dla dwóch paneli w App.js; tu
 * przechodzi po wszystkich panelach o swobodnej geometrii, więc panele dodane
 * w kolejnych fazach dostają to samo zachowanie bez dopisywania kodu.
 */
export function useWorkspaceGeometryGuard(workspaceRef) {
    const dispatch = useAppDispatch();
    const panels = useAppSelector((state) => state.panels);
    useEffect(() => {
        const workspace = workspaceRef.current;
        if (!workspace) return;
        const fit = () => {
            const width = workspace.clientWidth, height = workspace.clientHeight;
            if (width < 1 || height < 1) return;
            const topSafe = floatingTopSafe(workspace);
            const maxHeight = Math.max(48, height - topSafe - 16);
            const bottom = panels.dock?.bottom?.size;
            const columnHeight = workspace.closest('.map-column')?.clientHeight ?? height;
            const maximumDock = Math.max(170, Math.floor(columnHeight * 0.55));
            // CSS also limits the physical dock below its reducer minimum on short screens.
            if (Number.isFinite(bottom) && bottom > maximumDock) dispatch(setDockSize('bottom', maximumDock));
            for (const id of PANEL_IDS) {
                if (panels.mode[id] !== PANEL_MODE.floating) continue;
                const geometry = panels.geometry[id];
                const maxWidth = Math.min(width - 24, maxWidthFor(id, width, PANEL_MAX_WIDTH_RATIO) ?? width - 24);
                const effectiveWidth = Math.min(geometry.width, maxWidth);
                const patch = {};
                if (geometry.width > maxWidth) patch.width = Math.max(80, maxWidth);
                if (geometry.height && geometry.height > maxHeight) patch.height = maxHeight;
                // 19.27.0: okno bez zapamiętanej pozycji dostaje miejsce domyślne pod paskiem aplikacji —
                // okna z dolnego doku wyśrodkowane, z prawego przy szynie modułów.
                const def = PANEL_DEFS[id];
                const placed = geometry.position || id === 'terrainProfile' || !(def.placeCard || SELF_PLACED.has(id));
                if (placed) {
                    const effectiveHeight = Math.min(geometry.height || (id === 'terrainProfile' ? 560 : 220), maxHeight);
                    const fallback = def.dock === 'bottom'
                        ? { x: Math.round((width - effectiveWidth) / 2), y: topSafe }
                        : { x: width - effectiveWidth - 72, y: topSafe };
                    const current = geometry.position ?? fallback;
                    patch.position = {
                        x: clamp(current.x, 8, width - effectiveWidth - 8),
                        y: clamp(current.y, topSafe, height - effectiveHeight - 8),
                    };
                    if (geometry.position && patch.position.x === geometry.position.x && patch.position.y === geometry.position.y) delete patch.position;
                }
                if (Object.keys(patch).length) dispatch(setPanelGeometry(id, patch));
            }
        };
        fit();
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
        observer?.observe(workspace);
        const column = workspace.closest('.map-column');
        if (column && column !== workspace) observer?.observe(column);
        window.addEventListener('resize', fit);
        window.visualViewport?.addEventListener('resize', fit);
        return () => { observer?.disconnect(); window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); };
    }, [dispatch, panels, workspaceRef]);
}
