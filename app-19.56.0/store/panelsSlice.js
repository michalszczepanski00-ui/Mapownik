/**
 * Jedno źródło prawdy o panelach powłoki.
 *
 * Prawy dok pokazuje jeden panel naraz. Szyna ikon pozostaje widoczna przy
 * otwartym i zamkniętym panelu. Dawne pola podziału są czytane wstecznie,
 * ale nie przywracają już wspólnego widoku kilku modułów.
 *
 * Faza 0 zebrała tu stan rozproszony wcześniej po trzech miejscach (uiSlice,
 * useState w App, useState w MapStage). Faza 1 dokłada model DOKU: panel może
 * być zadokowany w prawym doku (wtedy widoczny jest dokładnie jeden — dok jest
 * z natury wykluczający) albo odpięty do okna pływającego, zachowującego się
 * tak jak wszystkie panele przed przebudową.
 *
 * Panel jest opisany deklaratywnie w PANEL_DEFS; reducer zna wyłącznie
 * operacje generyczne na identyfikatorze. 18.1: dodanie modułu = wpis w slocie
 * `panels` funkcji (features/), bez zmian w reducerze, powłoce ani CSS.
 *
 * UWAGA na format .mapownik: plik projektu trzyma preferencje paneli
 * w historycznym, płaskim kształcie walidowanym zodem (projectSchemas.js).
 * Pola doku dołożone w Fazie 1 są w schemacie OPCJONALNE, więc starsze pliki
 * wczytują się bez zmian, a starsza wersja aplikacji zignoruje nowe pola
 * zamiast odmówić wczytania. Konwersję trzyma panelsPersistence.js.
 */

import { FEATURE_PANELS } from '../features/index.js';

/**
 * Definicje paneli — dane dla PanelRegistry, doku i szyny ikon.
 *
 * 18.1: manifesty pochodzą z deklaracji funkcji (slot `panels` w
 * features/builtin/*.js). Nowy moduł doku dopisuje się w swojej funkcji —
 * ten plik, reducer i powłoka się nie zmieniają. Tutaj zostają same dane
 * (bez `load`), bo stan doku nie zależy od komponentów.
 */
export const PANEL_DEFS = Object.freeze(Object.fromEntries(FEATURE_PANELS.map((panel) => {
    const { load, ...manifest } = panel;
    return [panel.id, Object.freeze(manifest)];
})));

export const PANEL_IDS = Object.freeze(
    Object.keys(PANEL_DEFS).sort((a, b) => PANEL_DEFS[a].order - PANEL_DEFS[b].order),
);

/**
 * Grupy, w których naraz może być otwarty tylko jeden panel PŁYWAJĄCY.
 * Panele zadokowane nie potrzebują takiej reguły — dok pokazuje jeden moduł.
 */
// 19.11.0: 'place-card' — Działka, Raport i Analizy dzielą jedno miejsce (zakładki karty miejsca).
const EXCLUSIVE_FLOAT_GROUPS = new Set(['right-overlay', 'place-card']);

export const PANEL_MODE = Object.freeze({ docked: 'docked', floating: 'floating' });

/* Ograniczenia geometrii */
export const PANEL_MIN_HEIGHT = 220;
export const PANEL_BOTTOM_MARGIN = 44;
export const PANEL_MAX_WIDTH_RATIO = 0.46;

/**
 * Doki. `size` to wymiar wzdłuż osi, którą dok odbiera mapie: szerokość dla
 * doku bocznego, wysokość dla dolnego. Dzięki jednemu opisowi ta sama logika
 * (aktywny moduł, zmiana rozmiaru, utrwalanie) obsługuje obie krawędzie.
 */
export const DOCK_DEFS = Object.freeze({
    right: Object.freeze({ id: 'right', axis: 'width', min: 220, max: 420, defaultSize: 250, maxRatio: 0.42 }),
    bottom: Object.freeze({ id: 'bottom', axis: 'height', min: 170, max: 560, defaultSize: 280, maxRatio: 0.6 }),
});
export const DOCK_IDS = Object.freeze(Object.keys(DOCK_DEFS));

/** Historyczne wartości pozostawione dla importów starszych ustawień. */
export const DOCK_SPLIT_DEFAULT_ID = 'objects';
export const DOCK_SPLIT_DEFAULT_RATIO = 0.58;
export const DOCK_SPLIT_MIN_RATIO = 0.2;
export const DOCK_SPLIT_MAX_RATIO = 0.8;
/** Doki, które obsługują podział (dolny dok ma moduły kontekstowe). */
const SPLITTABLE_DOCKS = new Set(['right']);

/* Zgodność nazw sprzed uogólnienia doku. */
export const DOCK_MIN_WIDTH = DOCK_DEFS.right.min;
export const DOCK_MAX_WIDTH = DOCK_DEFS.right.max;
export const DOCK_DEFAULT_WIDTH = DOCK_DEFS.right.defaultSize;
export const DOCK_MAX_WIDTH_RATIO = DOCK_DEFS.right.maxRatio;

export const DEFAULT_OBJECTS_PANEL_WIDTH = PANEL_DEFS.objects.defaultWidth;
export const DEFAULT_LAYERS_PANEL_WIDTH = PANEL_DEFS.layers.defaultWidth;

function defaultGeometry(id) {
    return { width: PANEL_DEFS[id].defaultWidth, height: null, position: null };
}
function defaultGeometryMap() {
    const geometry = {};
    for (const id of PANEL_IDS) geometry[id] = defaultGeometry(id);
    return geometry;
}
function uniformMap(value) {
    const map = {};
    for (const id of PANEL_IDS) map[id] = value;
    return map;
}

export const initialPanelsState = {
    /** Tryb każdego panelu: w doku czy odpięty. */
    mode: uniformMap(PANEL_MODE.docked),
    /** Każdy dok: aktywny moduł (null = zwinięty) i rozmiar wzdłuż swojej osi. */
    dock: {
        // 18.9.11: `lastId` — ostatni zwykły moduł doku (do skrótu Ctrl+\).
        // 19.28.0: przy pierwszym wejściu na ekranie < 1400 px Warstwy zamknięte — więcej mapy (audyt B11).
        // 19.33.0: spokojny start — panel Warstw zamknięty (otwiera go ikona „Warstwy”); zapisany układ wraca przy kolejnym wejściu.
        right: { activeId: null, lastId: 'layers', size: DOCK_DEFS.right.defaultSize, splitId: null, splitRatio: DOCK_SPLIT_DEFAULT_RATIO },
        bottom: { activeId: null, size: DOCK_DEFS.bottom.defaultSize },
    },
    /** Poniżej — stan używany wyłącznie przez panele pływające. */
    open: uniformMap(false),
    collapsed: uniformMap(false),
    geometry: defaultGeometryMap(),
    /** Moduły kontekstowe, które mają aktualnie treść do pokazania. */
    available: uniformMap(false),
};

const T = {
    open: 'panels/open',
    close: 'panels/close',
    toggle: 'panels/toggle',
    setCollapsed: 'panels/setCollapsed',
    setGeometry: 'panels/setGeometry',
    setMode: 'panels/setMode',
    setDockSize: 'panels/setDockSize',
    setDockSplit: 'panels/setDockSplit',
    setDockSplitRatio: 'panels/setDockSplitRatio',
    setAvailable: 'panels/setAvailable',
    hydrate: 'panels/hydrate',
    reset: 'panels/reset',
};

export const openPanel = (id) => ({ type: T.open, payload: { id } });
export const closePanel = (id) => ({ type: T.close, payload: { id } });
/**
 * Panel zadokowany: wchodzi na dok albo zwija dok, gdy był już aktywny.
 * Panel pływający: otwarty i zminimalizowany -> przywróć; otwarty -> zamknij;
 * zamknięty -> otwórz (zamykając pozostałe z jego grupy wykluczającej).
 */
export const togglePanel = (id) => ({ type: T.toggle, payload: { id } });
export const setPanelCollapsed = (id, collapsed) => ({ type: T.setCollapsed, payload: { id, collapsed } });
export const setPanelGeometry = (id, patch) => ({ type: T.setGeometry, payload: { id, patch } });
/** Odepnij panel z doku ('floating') albo wstaw go z powrotem ('docked'). */
export const setPanelMode = (id, mode) => ({ type: T.setMode, payload: { id, mode } });
export const setDockSize = (dockId, size) => ({ type: T.setDockSize, payload: { dockId, size } });
/** Nieaktywna zgodność ze starszymi akcjami; podział nie jest obsługiwany. */
export const setDockSplit = (dockId, splitId) => ({ type: T.setDockSplit, payload: { dockId, splitId } });
/** 17.8.12: udział górnej części doku w jego wysokości (0,2–0,8). */
export const setDockSplitRatio = (dockId, ratio) => ({ type: T.setDockSplitRatio, payload: { dockId, ratio } });
/**
 * Moduł kontekstowy „ma treść" i może być wybrany zakładką doku. Ustawiają to
 * mostki serwisów — bez tego moduł podmieniony przez inny znikałby bezpowrotnie,
 * bo kontekstowe moduły nie mają pozycji w szynie ikon.
 */
export const setPanelAvailable = (id, available) => ({ type: T.setAvailable, payload: { id, available } });
/** Zgodność nazwy sprzed uogólnienia doku. */
export const setDockWidth = (width) => setDockSize('right', width);
export const hydratePanels = (payload) => ({ type: T.hydrate, payload });
export const resetPanelLayout = () => ({ type: T.reset });

function isKnown(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PANEL_DEFS, id);
}
function isDocked(state, id) {
    return state.mode[id] === PANEL_MODE.docked;
}
/** Dok, do którego należy panel wg manifestu. */
function dockOf(id) {
    return PANEL_DEFS[id].dock;
}
function activeIn(state, dockId) {
    return state.dock[dockId].activeId;
}
function returnsToPrevious(id) {
    return PANEL_DEFS[id]?.rail === false || PANEL_DEFS[id]?.returnToPrevious === true;
}

function normalizePosition(payload) {
    if (payload === null) return null;
    if (!payload || typeof payload !== 'object') return undefined;
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x: Math.round(x), y: Math.round(y) };
}

function withDockActive(state, dockId, activeId) {
    const current = state.dock[dockId];
    // Pamiętamy ostatni zwykły moduł; kontekstowe (np. wynik identyfikacji)
    // mają własny mechanizm powrotu i nie nadpisują go.
    const lastId = activeId && !returnsToPrevious(activeId) ? activeId : (current.lastId ?? null);
    if (current.activeId === activeId && (current.lastId ?? null) === lastId) return state;
    return { ...state, dock: { ...state.dock, [dockId]: { ...current, activeId, lastId } } };
}
function withDockReturnTo(state, dockId, returnTo) {
    if ((state.dock[dockId].returnTo ?? null) === returnTo) return state;
    return { ...state, dock: { ...state.dock, [dockId]: { ...state.dock[dockId], returnTo } } };
}
function withDockSize(state, dockId, size) {
    const def = DOCK_DEFS[dockId];
    const value = Number(size);
    if (!def || !Number.isFinite(value)) return state;
    const clamped = Math.round(Math.min(Math.max(value, def.min), def.max));
    if (clamped === state.dock[dockId].size) return state;
    return { ...state, dock: { ...state.dock, [dockId]: { ...state.dock[dockId], size: clamped } } };
}

function withFloatOpen(state, id, open) {
    if (state.open[id] === open) return state;
    const next = { ...state.open, [id]: open };
    if (open) {
        const group = PANEL_DEFS[id].floatGroup;
        if (EXCLUSIVE_FLOAT_GROUPS.has(group)) {
            for (const other of PANEL_IDS) {
                if (other !== id && PANEL_DEFS[other].floatGroup === group) next[other] = false;
            }
        }
    }
    return { ...state, open: next };
}

function withCollapsed(state, id, collapsed) {
    const value = Boolean(collapsed) && PANEL_DEFS[id].collapsible;
    if (state.collapsed[id] === value) return state;
    return { ...state, collapsed: { ...state.collapsed, [id]: value } };
}

/** Zawsze zwraca null: prawy dok wyświetla jeden moduł. */
function effectiveSplitId(state, dockId) {
    return null;
}
function withDockSplit(state, dockId, splitId) {
    // Polecenia ze starych plików/wersji nie mogą ponownie łączyć paneli.
    if (!SPLITTABLE_DOCKS.has(dockId) || (splitId !== null && splitId !== undefined)) return state;
    if ((state.dock[dockId].splitId ?? null) === null) return state;
    return { ...state, dock: { ...state.dock, [dockId]: { ...state.dock[dockId], splitId: null } } };
}
function withDockSplitRatio(state, dockId, ratio) {
    if (!SPLITTABLE_DOCKS.has(dockId)) return state;
    const value = Number(ratio);
    if (!Number.isFinite(value)) return state;
    const clamped = Math.round(Math.min(Math.max(value, DOCK_SPLIT_MIN_RATIO), DOCK_SPLIT_MAX_RATIO) * 1000) / 1000;
    if (state.dock[dockId].splitRatio === clamped) return state;
    return { ...state, dock: { ...state.dock, [dockId]: { ...state.dock[dockId], splitRatio: clamped } } };
}
function withOpen(state, id, open) {
    if (isDocked(state, id)) {
        const dockId = dockOf(id);
        const activeId = activeIn(state, dockId);
        if (open) {
            // 18.0: moduł kontekstowy (np. Szczegóły działki) zajmuje górę doku
            // na czas wyniku; po jego zamknięciu wraca moduł, który był wcześniej.
            if (returnsToPrevious(id) && activeId && activeId !== id && !returnsToPrevious(activeId)) {
                return withDockReturnTo(withDockActive(state, dockId, id), dockId, activeId);
            }
            // Wybór zwykłego modułu kasuje „powrót” po module kontekstowym —
            // inaczej późniejsze zamknięcie Działki wracałoby do dawnej zakładki.
            const next = withDockActive(state, dockId, id);
            return !returnsToPrevious(id) && next.dock[dockId].returnTo ? withDockReturnTo(next, dockId, null) : next;
        }
        const returnTo = state.dock[dockId].returnTo;
        if (activeId === id && returnsToPrevious(id) && returnTo && returnTo !== id && isDocked(state, returnTo)) {
            return withDockReturnTo(withDockActive(state, dockId, returnTo), dockId, null);
        }
        if (activeId === id) {
            return withDockActive(state, dockId, null);
        }
        return state;
    }
    return withFloatOpen(state, id, open);
}

function withMode(state, id, mode) {
    if (mode !== PANEL_MODE.docked && mode !== PANEL_MODE.floating) return state;
    if (state.mode[id] === mode) return state;
    let next = { ...state, mode: { ...state.mode, [id]: mode } };
    if (mode === PANEL_MODE.floating) {
        // Odpięcie: panel znika z doku i pojawia się jako okno.
        if (activeIn(state, dockOf(id)) === id) next = withDockActive(next, dockOf(id), null);
        next = withCollapsed(next, id, false);
        next = withFloatOpen(next, id, true);
    } else {
        // Zadokowanie: okno znika, a moduł staje się aktywnym panelem.
        next = withFloatOpen(next, id, false);
        next = withCollapsed(next, id, false);
        const dockId = dockOf(id);
        next = withDockActive(next, dockId, id);
    }
    return next;
}

function applyGeometryPatch(state, id, patch) {
    if (!patch || typeof patch !== 'object') return state;
    const current = state.geometry[id] ?? defaultGeometry(id);
    const next = { ...current };
    let changed = false;

    if ('width' in patch) {
        const width = Number(patch.width);
        if (Number.isFinite(width)) {
            const rounded = Math.round(width);
            if (rounded !== current.width) { next.width = rounded; changed = true; }
        }
    }
    if ('height' in patch) {
        if (patch.height === null) {
            if (current.height !== null) { next.height = null; changed = true; }
        } else {
            const height = Number(patch.height);
            if (Number.isFinite(height)) {
                const rounded = Math.round(height);
                if (rounded !== current.height) { next.height = rounded; changed = true; }
            }
        }
    }
    if ('position' in patch) {
        const position = normalizePosition(patch.position);
        if (position !== undefined) {
            const same = position === null
                ? current.position === null
                : current.position !== null && current.position.x === position.x && current.position.y === position.y;
            if (!same) { next.position = position; changed = true; }
        }
    }
    if (!changed) return state;
    return { ...state, geometry: { ...state.geometry, [id]: next } };
}

export function panelsReducer(state = initialPanelsState, action = {}) {
    const id = action.payload?.id;
    switch (action.type) {
        case T.open:
            return isKnown(id) ? withCollapsed(withOpen(state, id, true), id, false) : state;
        case T.close:
            return isKnown(id) ? withOpen(state, id, false) : state;
        case T.toggle: {
            if (!isKnown(id)) return state;
            if (isDocked(state, id)) {
                const dockId = dockOf(id);
                if (activeIn(state, dockId) === id) return withOpen(state, id, false);
                return withOpen(state, id, true);
            }
            if (state.open[id] && state.collapsed[id]) return withCollapsed(state, id, false);
            if (state.open[id]) return withFloatOpen(state, id, false);
            return withCollapsed(withFloatOpen(state, id, true), id, false);
        }
        case T.setCollapsed:
            return isKnown(id) ? withCollapsed(state, id, action.payload.collapsed) : state;
        case T.setGeometry:
            return isKnown(id) ? applyGeometryPatch(state, id, action.payload.patch) : state;
        case T.setMode:
            return isKnown(id) ? withMode(state, id, action.payload.mode) : state;
        case T.setAvailable: {
            if (!isKnown(id)) return state;
            const value = Boolean(action.payload.available);
            if (state.available[id] === value) return state;
            const next = { ...state, available: { ...state.available, [id]: value } };
            // Moduł bez treści nie może pozostać aktywnym panelem.
            return value ? next : withOpen(next, id, false);
        }
        case T.setDockSize: {
            const dockId = action.payload.dockId;
            return DOCK_DEFS[dockId] ? withDockSize(state, dockId, action.payload.size) : state;
        }
        case T.setDockSplit: {
            const dockId = action.payload.dockId;
            return DOCK_DEFS[dockId] ? withDockSplit(state, dockId, action.payload.splitId) : state;
        }
        case T.setDockSplitRatio: {
            const dockId = action.payload.dockId;
            return DOCK_DEFS[dockId] ? withDockSplitRatio(state, dockId, action.payload.ratio) : state;
        }
        case T.hydrate: {
            const payload = action.payload;
            if (!payload || typeof payload !== 'object') return state;
            let next = state;
            // Tryb przed widocznością: withOpen() rozstrzyga dok vs okno na
            // podstawie trybu, więc kolejność ma znaczenie.
            if (payload.mode && typeof payload.mode === 'object') {
                for (const [panelId, value] of Object.entries(payload.mode)) {
                    if (!isKnown(panelId)) continue;
                    next = withMode(next, panelId, value);
                    // 19.27.0: odtworzone okno pływające NIE otwiera się samo (np. puste „Wyniki analizy”
                    // po ponownym wejściu) — widoczność ustala tylko zapisane `open` poniżej.
                    if (value === PANEL_MODE.floating) next = withFloatOpen(next, panelId, false);
                }
            }
            if (payload.dock && typeof payload.dock === 'object') {
                for (const dockId of DOCK_IDS) {
                    const entry = payload.dock[dockId];
                    if (!entry || typeof entry !== 'object') continue;
                    if ('activeId' in entry && (entry.activeId === null || isKnown(entry.activeId))) {
                        next = withDockActive(next, dockId, entry.activeId ?? null);
                    }
                    if ('size' in entry) next = withDockSize(next, dockId, entry.size);
                    if ('splitId' in entry) next = withDockSplit(next, dockId, entry.splitId);
                    if ('splitRatio' in entry) next = withDockSplitRatio(next, dockId, entry.splitRatio);
                }
            }
            if (payload.open && typeof payload.open === 'object') {
                for (const [panelId, value] of Object.entries(payload.open)) {
                    if (isKnown(panelId) && typeof value === 'boolean' && !isDocked(next, panelId)) {
                        next = withFloatOpen(next, panelId, value);
                    }
                }
            }
            if (payload.collapsed && typeof payload.collapsed === 'object') {
                for (const [panelId, value] of Object.entries(payload.collapsed)) {
                    if (isKnown(panelId) && typeof value === 'boolean') next = withCollapsed(next, panelId, value);
                }
            }
            if (payload.geometry && typeof payload.geometry === 'object') {
                for (const [panelId, patch] of Object.entries(payload.geometry)) {
                    if (isKnown(panelId)) next = applyGeometryPatch(next, panelId, patch);
                }
            }
            return next;
        }
        case T.reset:
            return {
                ...initialPanelsState,
                geometry: defaultGeometryMap(),
                mode: uniformMap(PANEL_MODE.docked),
                open: uniformMap(false),
                collapsed: uniformMap(false),
                dock: {
                    right: { ...initialPanelsState.dock.right },
                    bottom: { ...initialPanelsState.dock.bottom },
                },
            };
        default:
            return state;
    }
}

/* ---------------------------------------------------------------- selektory */

export function selectPanelMode(state, id) {
    return state.panels.mode[id] ?? PANEL_MODE.docked;
}
export function selectPanelDocked(state, id) {
    return selectPanelMode(state, id) === PANEL_MODE.docked;
}
/** Czy panel jest teraz widoczny — niezależnie od tego, gdzie mieszka. */
export function selectPanelOpen(state, id) {
    if (!selectPanelDocked(state, id)) return Boolean(state.panels.open[id]);
    const dockId = PANEL_DEFS[id].dock;
    return state.panels.dock[dockId].activeId === id || effectiveSplitId(state.panels, dockId) === id;
}
export function selectPanelCollapsed(state, id) {
    return Boolean(state.panels.collapsed[id]);
}
export function selectPanelGeometry(state, id) {
    return state.panels.geometry[id] ?? defaultGeometry(id);
}
/** Aktywny moduł wskazanego doku, albo null gdy dok jest zwinięty. */
export function selectDockActiveId(state, dockId = 'right') {
    const activeId = state.panels.dock[dockId]?.activeId ?? null;
    return activeId && selectPanelDocked(state, activeId) ? activeId : null;
}
/** 17.8.12: moduł widoczny w dolnej części doku albo null. */
export function selectDockSplitId(state, dockId = 'right') {
    return effectiveSplitId(state.panels, dockId);
}
/** 17.8.12: preferencja podziału (moduł dolnej części), także gdy chwilowo nieaktywna. */
export function selectDockSplitPreference(state, dockId = 'right') {
    return null;
}
export function selectDockSplitRatio(state, dockId = 'right') {
    return state.panels.dock[dockId]?.splitRatio ?? DOCK_SPLIT_DEFAULT_RATIO;
}
/** 18.9.11: ostatni zwykły moduł doku — cel skrótu „zwiń / rozwiń dok”. */
export function selectDockLastId(state, dockId = 'right') {
    const id = state.panels.dock[dockId]?.lastId ?? null;
    return id && PANEL_DEFS[id] && PANEL_DEFS[id].rail !== false && selectPanelDocked(state, id) ? id : null;
}
export function selectDockSize(state, dockId = 'right') {
    return state.panels.dock[dockId]?.size ?? DOCK_DEFS[dockId].defaultSize;
}
/** Zgodność nazwy sprzed uogólnienia doku. */
export function selectDockWidth(state) {
    return selectDockSize(state, 'right');
}
/**
 * Selektory wyliczające NOWĄ kolekcję muszą pamiętać ostatni wynik.
 * useAppSelector stoi na useSyncExternalStore, który porównuje snapshoty przez
 * tożsamość — świeża tablica przy każdym wywołaniu to nieskończona pętla
 * renderów, a nie tylko zbędna praca.
 *
 * Kluczem jest referencja state.panels: reducer tworzy nowy obiekt wyłącznie
 * przy realnej zmianie, więc wystarczy jednoelementowy cache.
 */
function memoizeByPanels(compute) {
    let key = null;
    let value = null;
    return (state) => {
        if (key === state.panels) return value;
        key = state.panels;
        value = compute(state);
        return value;
    };
}

/**
 * Moduły, których widoczność wynika ze stanu serwisu, a nie z decyzji
 * użytkownika. Dwa warianty:
 *  - `controlledBy` — moduł odwzorowuje flagę `open` serwisu (profil terenu),
 *  - `openOnSignal` — moduł otwiera się, gdy wskazane pole snapshotu zmieni
 *    wartość, i pozostaje zamknięty do następnej zmiany (wyniki analizy).
 */
export const CONTEXTUAL_PANEL_IDS = Object.freeze(
    PANEL_IDS.filter((id) => typeof PANEL_DEFS[id].controlledBy === 'string' || PANEL_DEFS[id].openOnSignal),
);

/**
 * Zakładki doku: moduły kontekstowe (spoza szyny ikon), które mają treść.
 * Dok prawy obsługiwany jest szyną, więc zwykle lista jest tam pusta.
 */
export const selectDockTabs = memoizeByPanels((state) => {
    const byDock = {};
    for (const dockId of DOCK_IDS) byDock[dockId] = [];
    for (const id of PANEL_IDS) {
        const def = PANEL_DEFS[id];
        if (def.rail !== false || !state.panels.available[id]) continue;
        if (!selectPanelDocked(state, id)) continue;
        byDock[def.dock].push({ id, title: def.title, icon: def.icon, active: state.panels.dock[def.dock].activeId === id });
    }
    return byDock;
});

/** Panele odpięte do okien — renderuje je warstwa nad mapą. */
export const selectFloatingPanelIds = memoizeByPanels(
    (state) => PANEL_IDS.filter((id) => state.panels.mode[id] === PANEL_MODE.floating),
);

/**
 * 17.8.12: zakładki prawego doku — moduły stałe (z szyny). `place` mówi, gdzie
 * moduł jest widoczny: 'primary' (górna część), 'split' (dolna), 'floating'
 * (odpięty do okna) albo null.
 */
export const selectDockRailTabs = memoizeByPanels((state) => {
    const byDock = {};
    for (const dockId of DOCK_IDS) byDock[dockId] = [];
    for (const id of PANEL_IDS) {
        const def = PANEL_DEFS[id];
        // 18.0: moduł kontekstowy dostaje zakładkę, gdy ma co pokazać
        // (np. Szczegóły działki po kliknięciu mapy).
        // Zakładka zostaje, dopóki serwis ma wynik — także po przełączeniu na
        // inny moduł; inaczej do wyniku nie dałoby się wrócić.
        if (def.rail === false && !state.panels.available[id]) continue;
        const docked = selectPanelDocked(state, id);
        const dock = state.panels.dock[def.dock];
        const place = !docked
            ? (state.panels.open[id] ? 'floating' : 'detached')
            : dock.activeId === id ? 'primary'
                : effectiveSplitId(state.panels, def.dock) === id ? 'split' : null;
        byDock[def.dock].push({ id, title: def.title, icon: def.icon, docked, place });
    }
    return byDock;
});

/** Moduły widoczne w szynie ikon, w kolejności z PANEL_DEFS. */
// 19.28.0: każda funkcja w jednym miejscu — Działka/Raport/Analizy są zakładkami karty miejsca,
// a Eksport ma przycisk w górnym pasku; szyna zostaje dla Warstw, Obiektów i Zdjęć.
const RAIL_ELSEWHERE = new Set(['export']);
export const selectRailItems = memoizeByPanels((state) => PANEL_IDS
    // 19.53.0 (Etap 5): widoki z `railGroup` (Ceny, Budowy, Otoczenie, Analiza działki) nie mają własnej ikony —
    // ikona grupy (Analizy) jest aktywna, gdy otwarty jest którykolwiek z nich.
    .filter((id) => PANEL_DEFS[id].rail !== false && !PANEL_DEFS[id].placeCard && !PANEL_DEFS[id].railGroup && !RAIL_ELSEWHERE.has(id))
    .map((id) => ({
        openChild: PANEL_IDS.find((child) => PANEL_DEFS[child].railGroup === id && selectPanelOpen(state, child)) ?? null,
        id,
        title: PANEL_DEFS[id].title,
        // 19.8.5: krótki podpis pod ikoną szyny (audyt UX A1).
        railLabel: PANEL_DEFS[id].railLabel ?? null,
        icon: PANEL_DEFS[id].icon,
        docked: selectPanelDocked(state, id),
        active: selectPanelOpen(state, id) || PANEL_IDS.some((child) => PANEL_DEFS[child].railGroup === id && selectPanelOpen(state, child)),
        // 18.10: moduł sterowany serwisem (Informacja) ma wynik do pokazania.
        hasResult: typeof PANEL_DEFS[id].controlledBy === 'string' && Boolean(state.panels.available[id]),
    })));

/**
 * Odsunięcie paneli pływających zakotwiczonych do prawej krawędzi obszaru
 * mapy, aby nie wchodziły pod odpięty panel Obiekty. Dok nie bierze w tym
 * udziału — leży poza obszarem mapy i nic nie zasłania.
 */
export function selectRightOverlayOffset(state) {
    const objectsFloating = !selectPanelDocked(state, 'objects')
        && state.panels.open.objects
        && !state.panels.collapsed.objects
        && !state.panels.geometry.objects.position;
    return objectsFloating ? state.panels.geometry.objects.width + 20 : 10;
}
