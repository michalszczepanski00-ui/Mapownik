/**
 * Utrwalanie i konwersja układu paneli.
 *
 * Dwa niezależne odbiorniki tego samego stanu:
 *  1. localStorage — układ powłoki między sesjami przeglądarki,
 *  2. plik projektu .mapownik — pełne preferencje UI (LocalProjectSession).
 *
 * Oba używają jednego, PŁASKIEGO kształtu `{ objectsOpen, ..., dockRightWidth }`.
 * Historyczne pola zostają bez zmian, a wszystko, co dołożyła Faza 1 (dok,
 * tryb panelu), jest w schemacie zoda opcjonalne. Dzięki temu:
 *  - starszy plik projektu wczytuje się bez migracji,
 *  - plik zapisany po Fazie 1 otworzy się w starszej wersji aplikacji
 *    (zod pominie nieznane pola, panele wrócą do wartości domyślnych).
 */
import { DOCK_DEFAULT_WIDTH, PANEL_DEFS, PANEL_IDS, PANEL_MODE, selectPanelOpen } from './panelsSlice.js';

export const PANEL_PREFS_KEY = 'mapownik:workspace-v18';
/** Klucz sprzed Fazy 1 — czytany raz, żeby nie gubić ustawień użytkownika. */
const LEGACY_PREFS_KEY = 'mapownik:panel-layout-v16.4';

/* --------------------------------------------- konwersja kształtu płaskiego */

function panelVisible(panels, id) {
    // Widoczność obejmuje wyłącznie aktywny moduł doku.
    return selectPanelOpen({ panels }, id);
}

function persistableActive(dock) {
    const id = dock.activeId;
    if (typeof id === 'string' && PANEL_DEFS[id]?.rail === false) return dock.returnTo ?? null;
    return id;
}

/** Stan panelsSlice -> płaski kształt zapisywany w .mapownik. */
export function toLegacyPanelPrefs(panels) {
    return {
        // Pola historyczne — znaczenie niezmienione: „czy panel jest widoczny".
        objectsOpen: panelVisible(panels, 'objects'),
        layersOpen: panelVisible(panels, 'layers'),
        objectsCollapsed: panels.collapsed.objects,
        layersCollapsed: panels.collapsed.layers,
        objectsWidth: panels.geometry.objects.width,
        layersWidth: panels.geometry.layers.width,
        objectsHeight: panels.geometry.objects.height,
        layersHeight: panels.geometry.layers.height,
        objectsPosition: panels.geometry.objects.position,
        layersPosition: panels.geometry.layers.position,
        // Pola Fazy 1 i 2 — opcjonalne w schemacie.
        // 18.0: moduł kontekstowy (np. „Działka”) nie jest zapisywany jako
        // aktywny — po starcie wracamy do modułu, z którego go otwarto.
        dockRightActiveId: persistableActive(panels.dock.right),
        dockRightWidth: panels.dock.right.size,
        // Zachowaj pola dla zgodności ze starymi plikami; podział nie jest
        // już przywracany ani zapisywany jako aktywna preferencja.
        dockRightSplitId: null,
        dockRightSplitRatio: panels.dock.right.splitRatio,
        dockBottomActiveId: panels.dock.bottom.activeId,
        dockBottomHeight: panels.dock.bottom.size,
        floatingPanels: PANEL_IDS.filter((id) => panels.mode[id] === PANEL_MODE.floating),
    };
}

/**
 * Płaski kształt -> ładunek dla hydratePanels(). Pola nieobecne w źródle są
 * pomijane, więc ta sama funkcja obsługuje pełne preferencje projektu,
 * częściowe z localStorage i pliki sprzed Fazy 1.
 */
export function fromLegacyPanelPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') return null;
    const open = {};
    const collapsed = {};
    const geometry = { objects: {}, layers: {}, analysis: {}, export: {} };
    const mode = {};

    if (Array.isArray(prefs.floatingPanels)) {
        for (const id of PANEL_IDS) {
            mode[id] = prefs.floatingPanels.includes(id) ? PANEL_MODE.floating : PANEL_MODE.docked;
        }
    }

    if (typeof prefs.objectsOpen === 'boolean') open.objects = prefs.objectsOpen;
    if (typeof prefs.layersOpen === 'boolean') open.layers = prefs.layersOpen;
    if (typeof prefs.objectsCollapsed === 'boolean') collapsed.objects = prefs.objectsCollapsed;
    if (typeof prefs.layersCollapsed === 'boolean') collapsed.layers = prefs.layersCollapsed;

    if (Number.isFinite(Number(prefs.objectsWidth))) geometry.objects.width = Number(prefs.objectsWidth);
    if (Number.isFinite(Number(prefs.layersWidth))) geometry.layers.width = Number(prefs.layersWidth);
    if (prefs.objectsHeight === null || Number.isFinite(Number(prefs.objectsHeight))) {
        geometry.objects.height = prefs.objectsHeight === null ? null : Number(prefs.objectsHeight);
    }
    if (prefs.layersHeight === null || Number.isFinite(Number(prefs.layersHeight))) {
        geometry.layers.height = prefs.layersHeight === null ? null : Number(prefs.layersHeight);
    }
    if (prefs.objectsPosition === null || prefs.objectsPosition) geometry.objects.position = prefs.objectsPosition ?? null;
    if (prefs.layersPosition === null || prefs.layersPosition) geometry.layers.position = prefs.layersPosition ?? null;

    const dock = { right: {}, bottom: {} };
    if (prefs.dockRightActiveId === null || (typeof prefs.dockRightActiveId === 'string' && PANEL_DEFS[prefs.dockRightActiveId] && PANEL_DEFS[prefs.dockRightActiveId].rail !== false)) {
        dock.right.activeId = prefs.dockRightActiveId;
    } else if (!('dockRightActiveId' in prefs)) {
        // Plik sprzed Fazy 1 nie zna doku. Wybieramy moduł, który użytkownik
        // miał wtedy otwarty, zamiast wracać do wartości domyślnej.
        if (prefs.layersOpen) dock.right.activeId = 'layers';
        else if (prefs.objectsOpen) dock.right.activeId = 'objects';
        else if (prefs.objectsOpen === false && prefs.layersOpen === false) dock.right.activeId = null;
    }
    if (Number.isFinite(Number(prefs.dockRightWidth))) dock.right.size = Number(prefs.dockRightWidth);
    // Celowo ignoruj historyczne dockRightSplitId: nowy prawy panel zawsze
    // pokazuje jeden moduł. Zapis lokalny po migracji nadpisze dawną wartość.
    if (Number.isFinite(Number(prefs.dockRightSplitRatio)) && prefs.dockRightSplitRatio !== null) dock.right.splitRatio = Number(prefs.dockRightSplitRatio);

    // Dolny dok trzyma moduły kontekstowe (profil terenu), więc przywracamy
    // wyłącznie jego rozmiar — o tym, czy jest otwarty, decyduje narzędzie,
    // a nie zapisany układ.
    if (Number.isFinite(Number(prefs.dockBottomHeight))) dock.bottom.size = Number(prefs.dockBottomHeight);

    return { mode, dock, open, collapsed, geometry };
}

/* -------------------------------------------------------------- localStorage */

/**
 * localStorage bywa niedostępny (tryb prywatny, zablokowane ciasteczka,
 * wyczerpany limit) — każdy dostęp jest best-effort i nigdy nie może wywrócić
 * startu aplikacji.
 */
function readKey(key) {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

export function readStoredPanelLayout() {
    const current = readKey(PANEL_PREFS_KEY);
    if (current) return fromLegacyPanelPrefs(current);
    const legacy = readKey(LEGACY_PREFS_KEY);
    return legacy ? fromLegacyPanelPrefs(legacy) : null;
}

export function writeStoredPanelLayout(panels) {
    try {
        const flat = toLegacyPanelPrefs(panels);
        localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify({
            objectsWidth: flat.objectsWidth,
            objectsHeight: flat.objectsHeight,
            objectsPosition: flat.objectsPosition,
            layersWidth: flat.layersWidth,
            layersHeight: flat.layersHeight,
            layersPosition: flat.layersPosition,
            dockRightActiveId: flat.dockRightActiveId,
            dockRightWidth: flat.dockRightWidth,
            dockRightSplitId: flat.dockRightSplitId,
            dockRightSplitRatio: flat.dockRightSplitRatio,
            dockBottomHeight: flat.dockBottomHeight,
            floatingPanels: flat.floatingPanels,
        }));
    } catch {
        /* brak pamięci trwałej nie może przerwać pracy z mapą */
    }
}

/* ------------------------------------------------------ ograniczenia wymiaru */

/**
 * Górna granica szerokości panelu pływającego, zależna od szerokości obszaru
 * roboczego. Używana zarówno przy przeciąganiu uchwytu, jak i przy zmianie
 * rozmiaru okna, żeby obie ścieżki nie rozjechały się przy kolejnych zmianach.
 */
export function maxWidthFor(id, workspaceWidth, ratio) {
    const def = PANEL_DEFS[id];
    if (!def || !Number.isFinite(def.minWidth) || !Number.isFinite(def.maxWidth)) return null;
    return Math.max(def.minWidth, Math.min(def.maxWidth, workspaceWidth * ratio));
}

export { DOCK_DEFAULT_WIDTH };
