import { useEffect, useState } from 'react';

/**
 * 18.14.0 — czy pokazać powłokę mobilną („msportal w terenie”).
 *
 * Telefon = wąskie okno (do 760 px) albo — od 18.15.0 — ekran dotykowy o małej
 * wysokości, czyli telefon trzymany poziomo (844×390, 932×430…). Wcześniej
 * telefon obrócony poziomo dostawał pełną wersję komputerową. Tablet (dotyk,
 * ale wysoki ekran) zostaje przy wersji komputerowej.
 * Użytkownik może wymusić pełną wersję na telefonie („Więcej → Wersja na
 * komputer”); wybór zapamiętuje przeglądarka.
 *
 * Ten sam warunek jest w CSS (`@media (max-width: 760px), (pointer: coarse)
 * and (max-height: 500px)`) — zmieniać razem.
 */
export const MOBILE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)';
const FORCE_DESKTOP_KEY = 'mapownik:desktop-on-mobile';
const EVENT = 'mapownik-layout-change';

function readForced() {
    try { return localStorage.getItem(FORCE_DESKTOP_KEY) === '1'; } catch { return false; }
}

export function setDesktopOnMobile(value) {
    try {
        if (value) localStorage.setItem(FORCE_DESKTOP_KEY, '1');
        else localStorage.removeItem(FORCE_DESKTOP_KEY);
    } catch { /* tryb prywatny */ }
    window.dispatchEvent(new Event(EVENT));
}

export function isNarrowScreen() {
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.(MOBILE_QUERY).matches);
}

export function useIsMobile() {
    const compute = () => isNarrowScreen() && !readForced();
    const [mobile, setMobile] = useState(compute);
    useEffect(() => {
        const query = window.matchMedia?.(MOBILE_QUERY);
        const update = () => setMobile(compute());
        query?.addEventListener?.('change', update);
        window.addEventListener(EVENT, update);
        return () => {
            query?.removeEventListener?.('change', update);
            window.removeEventListener(EVENT, update);
        };
    }, []);
    return mobile;
}
