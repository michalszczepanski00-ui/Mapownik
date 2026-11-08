/**
 * Preferencje powłoki niezwiązane z konkretnym panelem.
 *
 * Stan paneli (otwarcie, minimalizacja, geometria) mieszkał tu historycznie
 * razem z motywem; od Fazy 0 refaktoru layoutu jest w panelsSlice.js, gdzie
 * panel jest opisany deklaratywnie i nie wymaga pary akcji na każdą nową
 * właściwość.
 *
 * 18.0: gęstość układu (preferencja stanowiska, zapisywana w przeglądarce,
 * nie w projekcie) oraz otwarta nakładka (paleta poleceń, ekran skrótów).
 *
 * 18.10.5: po usunięciu podpisów w palecie narzędzi (18.10.4) znikł też stan
 * `toolLabels` wraz z akcją i selektorem. Starszy zapis `toolLabels` w
 * localStorage jest ignorowany i znika przy najbliższym zapisie preferencji.
 */
export const UI_PREFS_STORAGE_KEY = 'mapownik:ui-prefs-v1';

export const initialUiState = {
    theme: typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    themeMode: 'system',
    fullToolPalette: false,
    density: 'comfortable',
    mapOnly: false,
    overlay: null,
};

const T = {
    systemTheme: 'ui/systemTheme',
    fullPalette: 'ui/fullPalette',
    toggleTheme: 'ui/toggleTheme',
    setTheme: 'ui/setTheme',
    setDensity: 'ui/setDensity',
    setMapOnly: 'ui/setMapOnly',
    openOverlay: 'ui/openOverlay',
    closeOverlay: 'ui/closeOverlay',
    hydratePrefs: 'ui/hydratePrefs',
};

export const setSystemTheme = (payload) => ({ type: T.systemTheme, payload });
export const setFullToolPalette = (payload) => ({ type: T.fullPalette, payload: Boolean(payload) });
export const toggleTheme = () => ({ type: T.toggleTheme });
export const setTheme = (payload) => ({ type: T.setTheme, payload });
export const setDensity = (payload) => ({ type: T.setDensity, payload });
export const setMapOnly = (payload) => ({ type: T.setMapOnly, payload: Boolean(payload) });
export const openOverlay = (payload) => ({ type: T.openOverlay, payload });
export const closeOverlay = () => ({ type: T.closeOverlay });
export const hydrateUiPrefs = (payload) => ({ type: T.hydratePrefs, payload });

export function uiReducer(state = initialUiState, action = {}) {
    switch (action.type) {
        case T.toggleTheme:
            return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark', themeMode: state.theme === 'dark' ? 'light' : 'dark' };
        case T.setTheme:
            return action.payload === 'system' ? { ...state, themeMode: 'system' }
                : action.payload === 'dark' || action.payload === 'light' ? { ...state, theme: action.payload, themeMode: action.payload } : state;
        case T.systemTheme:
            return state.themeMode === 'system' && ['dark', 'light'].includes(action.payload) ? { ...state, theme: action.payload } : state;
        case T.fullPalette:
            return { ...state, fullToolPalette: action.payload };
        case T.setDensity:
            return action.payload === 'compact' || action.payload === 'comfortable'
                ? { ...state, density: action.payload }
                : state;
        case T.setMapOnly:
            return state.mapOnly === action.payload ? state : { ...state, mapOnly: action.payload, overlay: null };
        case T.openOverlay:
            return { ...state, overlay: typeof action.payload === 'string' ? action.payload : null };
        case T.closeOverlay:
            return state.overlay === null ? state : { ...state, overlay: null };
        case T.hydratePrefs: {
            const prefs = action.payload ?? {};
            return {
                ...state,
                themeMode: ['system', 'light', 'dark'].includes(prefs.themeMode) ? prefs.themeMode : state.themeMode,
                theme: ['light', 'dark'].includes(prefs.theme) ? prefs.theme : state.theme,
                fullToolPalette: Boolean(prefs.fullToolPalette),
                density: prefs.density === 'compact' || prefs.density === 'comfortable' ? prefs.density : state.density,
            };
        }
        default:
            return state;
    }
}

export const selectDensity = (state) => state.ui.density;
export const selectOverlay = (state) => state.ui.overlay;
