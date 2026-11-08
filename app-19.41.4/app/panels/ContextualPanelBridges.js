import { createElement as h, Fragment, useEffect, useRef } from 'react';
import { useServiceSnapshot } from '../services/AppServicesContext.js';
import {
    CONTEXTUAL_PANEL_IDS,
    PANEL_DEFS,
    closePanel,
    openPanel,
    setPanelAvailable,
    useAppDispatch,
} from '../../store/index.js';

const EMPTY = Object.freeze({ open: false });

/**
 * Mostek między serwisem a stanem doku dla modułu kontekstowego.
 *
 * Profil terenu czy tabela wyników nie są czymś, co użytkownik otwiera z menu
 * — pojawiają się, gdy narzędzie coś policzy. Właścicielem tej decyzji jest
 * menedżer w runtimie mapy, a dok tylko za nim podąża. Bez mostka trzeba by
 * albo duplikować stan otwarcia, albo pozwolić powłoce sterować logiką
 * narzędzia.
 *
 * Manifest panelu deklaruje jeden z dwóch trybów, więc kolejne moduły
 * kontekstowe nie wymagają zmian w tym pliku.
 */

/**
 * `controlledBy` — moduł podąża za flagą `open` serwisu, ale wyłącznie przy
 * JEJ ZMIANIE.
 *
 * Wariant ciągle wymuszający stan wyglądał na prostszy i był błędny: gdy
 * w doku pojawił się drugi moduł kontekstowy, przełączenie zakładki było
 * natychmiast cofane, bo serwis wciąż raportował `open: true`. Właścicielem
 * decyzji „pokaż/ukryj" zostaje serwis, ale wyboru aktywnej zakładki — nie.
 */
function MirrorBridge({ id }) {
    const dispatch = useAppDispatch();
    const { controlledBy, reopenOn = null } = PANEL_DEFS[id];
    const snapshot = useServiceSnapshot(controlledBy, EMPTY);
    const wanted = Boolean(snapshot?.open);
    // 18.0: `reopenOn` — pole snapshotu, którego zmiana przy otwartym wyniku
    // (np. nowy punkt identyfikacji) ponownie pokazuje moduł.
    const signal = reopenOn ? (snapshot?.[reopenOn] ?? null) : null;
    const previous = useRef(wanted);
    const previousSignal = useRef(signal);

    useEffect(() => {
        const signalChanged = signal !== previousSignal.current;
        previousSignal.current = signal;
        if (wanted === previous.current) {
            if (wanted && signalChanged && signal !== null) dispatch(openPanel(id));
            return;
        }
        previous.current = wanted;
        dispatch(setPanelAvailable(id, wanted));
        dispatch(wanted ? openPanel(id) : closePanel(id));
    }, [dispatch, id, wanted, signal]);

    return null;
}

/**
 * `openOnSignal` — moduł otwiera się, gdy wskazane pole snapshotu zmieni
 * wartość na niezerową, i NIE jest zamykany automatycznie. Dzięki temu
 * zamknięcie przez użytkownika jest trwałe aż do następnego wyniku; wariant
 * lustrzany natychmiast by je cofnął.
 */
function SignalBridge({ id }) {
    const dispatch = useAppDispatch();
    const { service, field } = PANEL_DEFS[id].openOnSignal;
    const snapshot = useServiceSnapshot(service, EMPTY);
    const signal = snapshot?.[field] ?? null;
    const previous = useRef(signal);

    useEffect(() => {
        if (signal === previous.current) return;
        previous.current = signal;
        dispatch(setPanelAvailable(id, Boolean(signal)));
        if (signal) dispatch(openPanel(id));
    }, [dispatch, id, signal]);

    return null;
}

export function ContextualPanelBridges() {
    if (!CONTEXTUAL_PANEL_IDS.length) return null;
    return h(Fragment, null, CONTEXTUAL_PANEL_IDS.map((id) => (PANEL_DEFS[id].openOnSignal
        ? h(SignalBridge, { key: id, id })
        : h(MirrorBridge, { key: id, id }))));
}
