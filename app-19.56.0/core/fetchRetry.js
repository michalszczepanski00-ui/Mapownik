/**
 * 19.47.0 — zapytanie JSON do własnego API z automatycznym ponowieniem (do 2 razy) przy błędzie przejściowym:
 * brak połączenia, HTTP 502/503/504 albo odpowiedź `retryable: true` (np. GUGiK zerwał połączenie z serwerem).
 * Użytkownik widzi błąd dopiero po wszystkich próbach — i zwykły komunikat zamiast tekstu technicznego.
 */
const TRANSIENT = new Set([0, 502, 503, 504]);
export const FRIENDLY_ERROR = 'Usługa chwilowo nie odpowiada. Spróbuj ponownie za chwilę.';

const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Przerwano', 'AbortError')); }, { once: true });
});

/** Czy komunikat wygląda na techniczny (OpenSSL, cURL, HTTP) — wtedy pokazujemy FRIENDLY_ERROR. */
export function friendlyMessage(message) {
    const text = String(message ?? '');
    if (!text || /SSL_|errno|curl|cURL|OpenSSL|Connection reset|HTTP \d{3}|Failed to fetch|NetworkError|timed out/i.test(text)) return FRIENDLY_ERROR;
    return text;
}

export async function fetchJsonWithRetry(url, { signal, retries = 2, delays = [800, 2000], fetchImpl = fetch } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (attempt > 0) await sleep(delays[Math.min(attempt - 1, delays.length - 1)], signal);
        let status = 0;
        try {
            const response = await fetchImpl(url, { signal });
            status = response.status;
            const payload = await response.json().catch(() => null);
            if (response.ok && payload?.ok !== false) return payload;
            const error = new Error(friendlyMessage(payload?.error || `HTTP ${response.status}`));
            error.status = status;
            lastError = error;
            if (!(TRANSIENT.has(status) || payload?.retryable === true)) throw error;
        } catch (error) {
            if (signal?.aborted || error?.name === 'AbortError') throw error;
            if (error?.status && !TRANSIENT.has(error.status) && lastError === error) throw error;
            lastError = error?.status ? error : new Error(FRIENDLY_ERROR);
        }
    }
    throw lastError ?? new Error(FRIENDLY_ERROR);
}
