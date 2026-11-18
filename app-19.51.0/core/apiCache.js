/**
 * 19.43.0 — pamięć zapytań do API portalu (TanStack Query, rdzeń bez Reacta).
 *
 *  - Ten sam adres w ciągu 5 minut → wynik z pamięci (ponowne otwarcie działki, raport po karcie działki).
 *  - Równoczesne zapytania o ten sam adres → jedno zapytanie do serwera.
 *  - Współrzędne x/y w adresie są zaokrąglane do 0,1 m: karta (x.toFixed(3)) i raport (x.toFixed(2))
 *    trafiają w ten sam wpis — 10 cm nie zmienia wyniku usług mapowych.
 *  - Błędy NIE są zapamiętywane („Ponów” zawsze pyta serwer). Ponowienie automatyczne tylko gdy wywołujący
 *    na nie pozwala (retry) i serwer oznaczył błąd jako przejściowy (retryable / 502–504).
 *  - Przerwanie (AbortSignal) przez ostatniego oczekującego anuluje zapytanie — nie blokuje połączeń.
 */
import { QueryClient } from '@tanstack/query-core';

export const apiQueryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, gcTime: 15 * 60 * 1000, retry: 0, networkMode: 'always' } },
});

/** Adres kanoniczny (klucz pamięci i adres faktycznego zapytania). */
export function canonicalApiUrl(url) {
    const parsed = new URL(String(url), typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
    for (const name of ['x', 'y']) {
        const value = Number(parsed.searchParams.get(name));
        if (parsed.searchParams.has(name) && Number.isFinite(value)) parsed.searchParams.set(name, value.toFixed(1));
    }
    parsed.searchParams.sort();
    return parsed.toString();
}

export class ApiError extends Error {
    constructor(message, { status = 0, payload = null, retryAfter = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload;
        this.retryAfter = retryAfter;
        this.retryable = payload?.retryable === true || [502, 503, 504].includes(status);
    }
}

const waiting = new Map(); // klucz → liczba oczekujących wywołań

/**
 * GET z odpowiedzią JSON `{ ok: true, … }`, przez pamięć zapytań.
 * @param {string} url
 * @param {{ signal?: AbortSignal, staleTime?: number, retry?: number }} [options]
 */
export function cachedJson(url, { signal, staleTime, retry = 0 } = {}) {
    const href = canonicalApiUrl(url);
    const queryKey = ['api', href];
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    const query = apiQueryClient.fetchQuery({
        queryKey,
        ...(staleTime !== undefined ? { staleTime } : {}),
        retry: (count, error) => count < retry && error?.retryable === true,
        retryDelay: (count) => Math.min(4000, 800 * 2 ** count),
        queryFn: async ({ signal: querySignal }) => {
            const response = await fetch(href, { signal: querySignal, cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload || payload.ok === false) {
                throw new ApiError(payload?.error || payload?.detail || `HTTP ${response.status}`, { status: response.status, payload, retryAfter: response.headers.get('Retry-After') });
            }
            return payload;
        },
    });
    if (!signal) return query;
    waiting.set(href, (waiting.get(href) ?? 0) + 1);
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = () => {
            if (settled) return false;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            const left = (waiting.get(href) ?? 1) - 1;
            if (left > 0) waiting.set(href, left); else waiting.delete(href);
            return left;
        };
        const onAbort = () => {
            const left = finish();
            if (left === false) return;
            if (left === 0) void apiQueryClient.cancelQueries({ queryKey, exact: true });
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        query.then((value) => { if (finish() !== false) resolve(value); }, (error) => { if (finish() !== false) reject(error); });
    });
}
