import { Component as ReactComponent, createElement as h, lazy, Suspense } from 'react';
import { PANEL_DEFS, PANEL_IDS } from '../../store/panelsSlice.js';
import { Button, Message } from '../ui/index.js';
import { t } from '../../i18n/index.js';

/**
 * Rejestr komponentów paneli.
 *
 * Manifest panelu (tytuł, ikona, dok, kolejność) pochodzi z deklaracji funkcji
 * (slot `panels`, 18.1), a tutaj dopinany jest komponent, który go rysuje.
 * Dok, szyna ikon i okna pływające renderują to, co jest w rejestrze — nie
 * znają ani nazw paneli, ani ich importów.
 *
 * 18.1: komponent jest ładowany leniwie przez `load()` z deklaracji, więc
 * deklaracja funkcji nie importuje Reacta ani powłoki. Moduły paneli są
 * w liście modulepreload, więc pierwsze otwarcie nie czeka na sieć.
 */
const entries = new Map();

function toComponent(loaded, id) {
    const Component = typeof loaded === 'function' ? loaded : (loaded?.default ?? null);
    if (typeof Component !== 'function') throw new TypeError(`Panel ${id}: load() nie zwrócił komponentu.`);
    return { default: Component };
}

export function registerPanel(id, Component, overrides = {}) {
    const def = PANEL_DEFS[id];
    if (!def) throw new Error(`Nieznany panel: ${id}. Dodaj go w slocie „panels” funkcji.`);
    // Komponent albo obiekt komponentu Reacta (React.lazy, memo).
    const valid = typeof Component === 'function' || (Component && typeof Component === 'object' && '$$typeof' in Component);
    if (!valid) throw new TypeError(`Panel ${id} wymaga komponentu.`);
    entries.set(id, { ...def, ...overrides, id, Component });
}

/** Rejestracja leniwa: `load()` zwraca komponent (albo moduł z eksportem default). */
export function registerLazyPanel(id, load, overrides = {}) {
    if (typeof load !== 'function') throw new TypeError(`Panel ${id} wymaga load().`);
    // Pobieranie rusza od razu przy rejestracji (równolegle ze startem mapy),
    // więc panel jest gotowy, zanim użytkownik go otworzy.
    const ready = Promise.resolve().then(load).then((loaded) => toComponent(loaded, id));
    ready.catch((error) => console.error(`[panel ${id}]`, error));
    const lazyComponent = lazy(() => ready);
    registerPanel(id, lazyComponent, { ...overrides, load });
    // 19.48.0: po pobraniu kodu wpis dostaje zwykły komponent zamiast leniwego. React 19 przytrzymuje treść
    // zastępczą (Suspense) ok. 300 ms także dla gotowego modułu — panel pokazywał szkielet przy każdym
    // pierwszym otwarciu, choć kod był pobrany przy starcie.
    ready.then((module) => {
        // toComponent zwraca moduł w kształcie oczekiwanym przez React.lazy: { default: Komponent }.
        const Component = module?.default ?? module;
        const entry = entries.get(id);
        if (entry && entry.Component === lazyComponent && Component) entries.set(id, { ...entry, Component });
    }).catch(() => { /* błąd zgłoszony wyżej; zostaje leniwy komponent z PanelBoundary */ });
}

/** Ponowne pobranie panelu po błędzie (React.lazy zapamiętuje nieudany wynik). */
export function retryPanel(id) {
    const entry = entries.get(id);
    if (!entry?.load) return;
    const { Component: _previous, load, ...rest } = entry;
    registerLazyPanel(id, load, rest);
}

export function getPanel(id) {
    return entries.get(id) ?? null;
}

/** Zarejestrowane panele w kolejności z manifestów. */
export function listPanels() {
    return PANEL_IDS.map((id) => entries.get(id)).filter(Boolean);
}

/**
 * Błąd jednego panelu (nieudane pobranie modułu albo wyjątek w komponencie)
 * zostaje w tym panelu: reszta aplikacji działa, a panel pokazuje komunikat
 * z przyciskiem ponowienia zamiast zastępować cały interfejs ekranem błędu.
 */
class PanelBoundary extends ReactComponent {
    constructor(props) {
        super(props);
        this.state = { error: null, attempts: 0 };
        this.retry = () => {
            retryPanel(this.props.id);
            this.setState((state) => ({ error: null, attempts: state.attempts + 1 }));
        };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error) {
        console.error(`[panel ${this.props.id}]`, error);
    }

    render() {
        const { error, attempts } = this.state;
        if (!error) return this.props.children;
        // Część przeglądarek zapamiętuje nieudane pobranie modułu do końca
        // sesji — po nieudanej ponownej próbie główną akcją jest odświeżenie.
        const retried = attempts > 0;
        return h('div', { className: 'panel-load-error' },
            h(Message, { tone: 'danger' },
                h('strong', null, t('panel.loadError.title', { title: this.props.title })),
                h('p', null, retried ? t('panel.loadError.retriedHint') : t('panel.loadError.hint')),
                h('div', { className: 'panel-load-error-actions' },
                    h(Button, { variant: retried ? 'ghost' : 'primary', size: 'sm', onClick: this.retry }, t('panel.loadError.retry')),
                    h(Button, { variant: retried ? 'primary' : 'ghost', size: 'sm', onClick: () => globalThis.location?.reload() }, t('panel.loadError.reload'))),
                h('details', null,
                    h('summary', null, t('panel.loadError.details')),
                    h('code', null, String(error?.message ?? error)))));
    }
}

/** Rysuje panel z rejestru; leniwy komponent czeka w Suspense bez migotania układu. */
/**
 * 19.48.0 — szkielet treści panelu na czas pobierania jego kodu (zamiast pustego miejsca).
 * Statyczny (bez animacji), w kolorach powierzchni i obramowań z palety.
 */
export function PanelSkeleton({ title = '' } = {}) {
    const bar = (width, height = 10) => h('span', { className: 'panel-skeleton-bar', style: { width, height } });
    return h('div', { className: 'panel-skeleton', role: 'status', 'aria-busy': true, 'aria-label': title ? `Wczytywanie: ${title}` : 'Wczytywanie panelu' },
        h('div', { className: 'panel-skeleton-head' }, bar('46%', 13)),
        h('div', { className: 'panel-skeleton-body' }, bar('92%'), bar('78%'), bar('85%'), bar('64%'), bar('88%'), bar('55%')));
}
export function PanelView({ entry }) {
    // Wpis bierzemy z rejestru przy każdym renderze — po „Spróbuj ponownie”
    // jest tam nowy komponent leniwy.
    const current = entries.get(entry.id) ?? entry;
    return h(PanelBoundary, { id: entry.id, title: entry.title },
        h(Suspense, { fallback: h(PanelSkeleton, { title: entry.title }) }, h(current.Component, null)));
}
