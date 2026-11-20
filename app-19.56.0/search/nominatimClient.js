import { requestScope } from '../core/requestScope.js';

/**
 * 19.23.0 — wyszukiwanie miejscowości i ulic w Nominatim (OSM) wprost z przeglądarki.
 *
 * Wcześniej zapytania szły przez api/search.php, więc wszyscy użytkownicy dzielili adres IP
 * hostingu i limit Nominatim (1 zapytanie/s); w audycie 30.10.2026 hosting dostawał seriami
 * HTTP 502. Nominatim wysyła CORS `*`, więc przeglądarka może pytać bezpośrednio — każdy
 * użytkownik ma wtedy własny limit. Normalizacja wyników jest taka sama jak w api/search.php
 * (search_localities / search_streets), żeby SearchToolbar dostawał identyczne obiekty.
 *
 * Zasady Nominatim: maks. 1 zapytanie/s, bez zapytań przy każdym znaku — dlatego kolejka
 * z odstępem MIN_INTERVAL_MS, dodatkowe opóźnienie SETTLE_MS (pole musi „ustać”) i pamięć
 * wyników na czas sesji. Błąd sieci lub HTTP 429 → wywołujący wraca do proxy PHP.
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1100;
const SETTLE_MS = 450;
const CACHE_LIMIT = 80;
const cache = new Map();
let nextSlot = 0;

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
        const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

const norm = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text !== '' ? text : null;
};
const normalizeCounty = (value) => {
    const text = norm(value);
    return text === null ? null : (text.replace(/^powiat\s+/iu, '') || text);
};
const toNumber = (value) => (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);
/** Nominatim: [south, north, west, east] → [west, south, east, north]. */
function normalizeBbox(bbox) {
    if (!Array.isArray(bbox) || bbox.length !== 4) return null;
    const values = bbox.map(toNumber);
    if (values.some((value) => value === null)) return null;
    return [values[2], values[0], values[3], values[1]];
}
function localityFromAddress(address, row) {
    for (const key of ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'locality']) {
        if (address[key]) return String(address[key]).trim();
    }
    for (const key of ['namedetails', 'display_name', 'name']) {
        if (typeof row[key] === 'string' && row[key]) {
            const candidate = row[key].split(',')[0].trim();
            if (candidate !== '') return candidate;
        }
    }
    return null;
}
function exactRank(query, candidate) {
    const q = query.trim().toLowerCase();
    const c = String(candidate ?? '').trim().toLowerCase();
    if (q === c) return 0;
    if (c.startsWith(q)) return 1;
    if (c.includes(q)) return 2;
    return 3;
}

async function nominatim(params, signal) {
    const url = new URL(ENDPOINT);
    Object.entries({ countrycodes: 'pl', 'accept-language': 'pl', addressdetails: '1', limit: '12', dedupe: '1', format: 'jsonv2', ...params })
        .forEach(([key, value]) => url.searchParams.set(key, value));
    const key = url.search;
    if (cache.has(key)) return cache.get(key);
    await sleep(SETTLE_MS, signal);
    const wait = nextSlot - Date.now();
    nextSlot = Math.max(Date.now(), nextSlot) + MIN_INTERVAL_MS;
    if (wait > 0) await sleep(wait, signal);
    const scope = requestScope(12000, signal);
    try {
        const response = await fetch(url, { signal: scope.signal, headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' });
        if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Nominatim: nieprawidłowa odpowiedź');
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(key, rows);
        return rows;
    } finally { scope.dispose(); }
}

export async function searchLocalitiesInBrowser(query, signal) {
    const rows = await nominatim({ q: query, namedetails: '1' }, signal);
    const items = [];
    const seen = new Set();
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const address = row.address && typeof row.address === 'object' ? row.address : {};
        const localityName = localityFromAddress(address, row);
        if (localityName === null) continue;
        const commune = norm(address.municipality ?? address.city ?? address.town ?? address.village ?? '');
        const county = normalizeCounty(address.county ?? null);
        const voivodeship = norm(address.state ?? '');
        const dedupeKey = `${localityName}|${commune ?? ''}|${county ?? ''}|${voivodeship ?? ''}`.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        items.push({
            id: String(row.place_id ?? dedupeKey), label: localityName, localityName, commune, county, voivodeship,
            lat: toNumber(row.lat), lon: toNumber(row.lon), boundingBox: normalizeBbox(row.boundingbox),
        });
    }
    items.sort((a, b) => (exactRank(query, a.localityName) - exactRank(query, b.localityName))
        || String(a.voivodeship ?? '').localeCompare(String(b.voivodeship ?? '')));
    return items.slice(0, 10);
}

export async function searchStreetsInBrowser(query, { locality = '', commune = '', voivodeship = '' } = {}, signal) {
    const parts = [query, locality];
    if (commune && commune.toLowerCase() !== locality.toLowerCase()) parts.push(commune);
    if (voivodeship) parts.push(voivodeship);
    parts.push('Polska');
    const rows = await nominatim({ q: parts.join(', ') }, signal);
    const items = [];
    const seen = new Set();
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const address = row.address && typeof row.address === 'object' ? row.address : {};
        const streetName = norm(address.road ?? address.pedestrian ?? address.footway ?? address.cycleway ?? address.path ?? row.name ?? '');
        if (streetName === null) continue;
        const localityName = localityFromAddress(address, { name: locality, display_name: locality });
        const itemCommune = norm(address.municipality ?? address.city ?? address.town ?? address.village ?? commune);
        const itemVoivodeship = norm(address.state ?? voivodeship);
        const dedupeKey = `${streetName}|${localityName ?? ''}|${itemCommune ?? ''}|${itemVoivodeship ?? ''}`.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        items.push({
            id: String(row.place_id ?? dedupeKey), label: streetName, streetName, localityName, commune: itemCommune, voivodeship: itemVoivodeship,
            lat: toNumber(row.lat), lon: toNumber(row.lon), boundingBox: normalizeBbox(row.boundingbox),
        });
    }
    items.sort((a, b) => (exactRank(query, a.streetName) - exactRank(query, b.streetName))
        || String(a.localityName ?? '').localeCompare(String(b.localityName ?? '')));
    return items.slice(0, 10);
}
