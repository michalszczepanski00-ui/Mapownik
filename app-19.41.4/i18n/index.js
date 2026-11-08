import { PL } from './pl.js';

const catalogs = { pl: PL };
let active = PL;
const missing = new Set();

/**
 * Tekst interfejsu z katalogu. Parametry w nawiasach klamrowych:
 *   t('toast.deleted', { name: 'Poligon 1' })
 * Brakujący klucz zwraca sam klucz (widać go w interfejsie i w teście paczki),
 * zamiast pustego miejsca.
 */
export function t(key, params = null) {
    let text = active[key];
    if (text === undefined) {
        if (!missing.has(key)) {
            missing.add(key);
            if (typeof console !== 'undefined') console.warn(`[i18n] brak klucza: ${key}`);
        }
        text = key;
    }
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match));
}

const pluralRules = typeof Intl !== 'undefined' && Intl.PluralRules ? new Intl.PluralRules('pl-PL') : null;

/** Kategoria liczby mnogiej po polsku: one (1), few (2–4, 22–24…), many (0, 5–21…). */
export function pluralCategory(count) {
    const n = Math.abs(Number(count) || 0);
    if (!Number.isInteger(n)) return 'other';
    if (pluralRules) return pluralRules.select(n);
    if (n === 1) return 'one';
    const d = n % 10, dd = n % 100;
    return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'few' : 'many';
}

/**
 * 18.2 — tekst z liczbą: klucze `<klucz>.one`, `.few`, `.many` (i opcjonalnie
 * `.other` dla ułamków). {count} jest wstawiane automatycznie:
 *   tn('objects.count', 3) → „3 elementy”
 */
export function tn(key, count, params = null) {
    const category = pluralCategory(count);
    const chosen = [`${key}.${category}`, `${key}.many`, key].find((candidate) => hasText(candidate)) ?? `${key}.${category}`;
    return t(chosen, { count, ...(params ?? {}) });
}

/** 18.2 — liczba w zapisie polskim (spacja tysięcy, przecinek); domyślnie bez części ułamkowej. */
export function formatNumber(value, digits = 0) {
    const number = Number(value ?? 0);
    return (Number.isFinite(number) ? number : 0).toLocaleString('pl-PL', { maximumFractionDigits: digits });
}

/** Czy klucz istnieje (dla testów i warunkowych napisów). */
export function hasText(key) {
    return Object.prototype.hasOwnProperty.call(active, key);
}

/** Lista brakujących kluczy zgłoszonych od startu (diagnostyka). */
export function missingTextKeys() {
    return [...missing];
}

export function setLanguage(code) {
    if (!catalogs[code]) throw new Error(`Brak katalogu tekstów: ${code}`);
    active = catalogs[code];
}

export { PL };
