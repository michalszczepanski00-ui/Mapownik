import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, MapPin, Pentagon, Signpost, Search, X } from 'lucide-react';
import { isParcelIdentifier, isParcelIdentifierCandidate, normalizeParcelIdentifier } from '../../search/parcelIdentifier.js';
import { t } from '../../i18n/index.js';
import { requestScope } from '../../core/requestScope.js';
import { toLonLat, transform } from 'ol/proj.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { searchLocalitiesInBrowser, searchStreetsInBrowser } from '../../search/nominatimClient.js';

// 18.14.0: błąd serwera wyszukiwania po polsku, bez treści technicznych.
function friendlySearchError(error, fallback) {
    const message = error instanceof Error ? error.message : '';
    if (!message || /CONNECT|tunnel|HTTP|curl|timed out|circuit|fetch|network/i.test(message)) return t('search.error.unavailable');
    return message || fallback;
}
function trimText(value) { return String(value ?? '').trim(); }
function localityContextLabel(item) {
    const parts = [];
    if (item?.commune) parts.push(t('search.commune', { name: item.commune }));
    if (item?.county) parts.push(t('search.county', { name: item.county }));
    if (item?.voivodeship) parts.push(t('search.voivodeship', { name: item.voivodeship }));
    return parts.join(' · ');
}
function localityBadgeLabel(item) {
    if (!item) return '';
    return `${item.localityName ?? item.label ?? t('search.locality')}${item.commune ? ` · ${t('search.commune', { name: item.commune })}` : ''}`;
}
function streetContextLabel(item) {
    const parts = [];
    if (item?.localityName) parts.push(item.localityName);
    if (item?.commune) parts.push(t('search.commune', { name: item.commune }));
    if (item?.voivodeship) parts.push(t('search.voivodeship', { name: item.voivodeship }));
    return parts.join(' · ');
}
function parcelContextLabel(item) {
    const parts = [];
    if (item?.region) parts.push(t('search.region', { name: item.region }));
    if (item?.commune) parts.push(t('search.commune', { name: item.commune }));
    if (item?.voivodeship) parts.push(t('search.voivodeship', { name: item.voivodeship }));
    return parts.join(' · ');
}
// 19.23.0: miejscowości i ulice (Nominatim) najpierw wprost z przeglądarki; proxy PHP tylko jako zapas.
async function requestSearch(params, signal) {
    if (params.mode === 'locality' || params.mode === 'street') {
        try {
            return params.mode === 'locality'
                ? await searchLocalitiesInBrowser(params.q, signal)
                : await searchStreetsInBrowser(params.q, params, signal);
        } catch (error) {
            // Przerwane przez użytkownika — bez zapasu; timeout lub błąd Nominatim — proxy PHP.
            if (signal?.aborted) throw error;
        }
    }
    return requestSearchProxy(params, signal);
}
async function requestSearchProxy(params, signal) {
    const url = new URL('./api/search.php', window.location.href);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && String(value) !== '') url.searchParams.set(key, String(value));
    });
    // 19.26.0: działka po numerze przeszukuje obręby gminy (pierwszy raz w danej gminie — dłużej).
    const scope = requestScope(params.mode === 'parcel' ? 35000 : 20000, signal);
    try {
    const response = await fetch(url, { signal: scope.signal, cache: 'no-store' });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(t('search.error.invalid')); }
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || t('search.error.request'));
    return payload.items ?? [];
    } finally { scope.dispose(); }
}
function addressContextLabel(item) {
    const parts = [];
    if (item?.postcode) parts.push(item.postcode);
    if (item?.county && item.county !== item.localityName) parts.push(t('search.county', { name: item.county }));
    if (item?.voivodeship) parts.push(t('search.voivodeship', { name: item.voivodeship }));
    if (item?.approximate) parts.push('ulica — numer nieznany');
    if (item?.source) parts.push(item.source);
    return parts.join(' · ');
}
// 19.18.0: w pierwszym polu obok miejscowości także adresy i działki „obręb/miejscowość + numer”.
const QUERY_WITH_NUMBER = /\p{L}{2,}.*\d|\d.*\p{L}{2,}/u;
// 19.26.0: nazwa obrębu może zawierać cyfry („Wieliczka 1 432”, „S-61 15”).
const PLACE_AND_PARCEL = /^(\p{L}[\p{L}\d\s.-]*?)\s+(\d+(?:\/\d+)?)$/u;
const sameName = (a, b) => String(a ?? '').trim().toLocaleLowerCase('pl') === String(b ?? '').trim().toLocaleLowerCase('pl');
const lonLatOf = (item) => (Number.isFinite(item?.lon) && Number.isFinite(item?.lat) ? { lon: item.lon.toFixed(6), lat: item.lat.toFixed(6) } : {});
function resultCopy(item, kind) {
    kind = item?._kind ?? kind;
    if (kind === 'address') return { title: item.label ?? t('search.locality'), meta: addressContextLabel(item) };
    if (kind === 'locality') return { title: item.localityName ?? item.label ?? t('search.locality'), meta: localityContextLabel(item) };
    if (kind === 'street') return { title: item.streetName ?? item.label ?? t('search.street'), meta: streetContextLabel(item) };
    return { title: item.parcel ? t('search.parcelShort', { number: item.parcel }) : (item.label ?? t('search.parcel')), meta: parcelContextLabel(item) };
}
function ResultIcon({ kind }) {
    if (kind === 'street' || kind === 'address') return h(Signpost, { size: 15 });
    if (kind === 'parcel') return h(Pentagon, { size: 15 });
    return h(MapPin, { size: 15 });
}
function SearchDropdown({ open, loading, error, emptyLabel, items, kind, contextLabel, highlightedIndex, onHighlight, onSelect }) {
    if (!open) return null;
    return h('div', { className: 'map-search-dropdown', role: 'listbox', 'aria-label': contextLabel || t('search.results') },
        h('div', { className: 'map-search-dropdown-header' },
            h('strong', null, kind === 'locality' && items.some((item) => item._kind) ? 'Adresy, działki i miejscowości' : kind === 'locality' ? t('search.group.localities') : kind === 'street' ? t('search.group.streets') : t('search.group.parcels')),
            contextLabel ? h('span', { title: contextLabel }, contextLabel) : null
        ),
        loading ? h('div', { className: 'map-search-dropdown-state' }, h(LoaderCircle, { size: 15, className: 'is-spinning' }), h('span', null, t('search.loading'))) : null,
        !loading && error ? h('div', { className: 'map-search-dropdown-state is-error' }, error) : null,
        !loading && !error && !items.length ? h('div', { className: 'map-search-dropdown-state' }, emptyLabel) : null,
        !loading && !error && items.length ? h('div', { className: 'map-search-results' }, items.map((item, index) => {
            const copy = resultCopy(item, kind);
            return h('button', {
                type: 'button',
                key: `${kind}:${item.id ?? copy.title}:${copy.meta}`,
                className: `map-search-result${highlightedIndex === index ? ' is-highlighted' : ''}`,
                role: 'option',
                'aria-selected': highlightedIndex === index,
                onMouseDown: (event) => event.preventDefault(),
                onMouseEnter: () => onHighlight(index),
                onClick: () => onSelect(item),
            },
                h('span', { className: 'map-search-result-icon', 'aria-hidden': true }, h(ResultIcon, { kind: item._kind ?? kind })),
                h('span', { className: 'map-search-result-copy' }, h('strong', null, copy.title), copy.meta ? h('span', null, copy.meta) : null)
            );
        })) : null,
        items.length ? h('div', { className: 'map-search-dropdown-hint' }, t('search.hint')) : null
    );
}

/**
 * 19.34.0 — ostatnio sprawdzane działki (do 6, w przeglądarce): po kliknięciu w puste pole wyszukiwarki.
 * Wybór idzie tą samą drogą co wpisanie identyfikatora — granica działki jest pobierana z ULDK na nowo.
 */
const RECENT_KEY = 'msportal:recent-parcels:v1';
const RECENT_MAX = 6;
const NO_IDENTIFY = Object.freeze({ parcel: null });
function readRecent() { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((i) => i && typeof i.id === 'string').slice(0, RECENT_MAX) : []; } catch { return []; } }
function writeRecent(items) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_MAX))); } catch { /* tryb prywatny */ } }

export function SearchToolbar({ manager }) {
    const identify = useService('identify');
    const identifySnapshot = useServiceSnapshot('identify', NO_IDENTIFY);
    const [recent, setRecent] = useState(readRecent);
    const recentParcelId = identifySnapshot?.parcel?.id ?? null;
    useEffect(() => {
        const parcel = identifySnapshot?.parcel;
        if (!parcel?.id) return;
        const entry = { id: String(parcel.id), number: parcel.parcel ?? null, place: [parcel.commune, parcel.region ? `obręb ${parcel.region}` : null].filter(Boolean).join(' · ') };
        setRecent((current) => { const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, RECENT_MAX); writeRecent(next); return next; });
    }, [recentParcelId]);
    // 19.8.5: wybrana działka = działka sprawdzana: od razu karta z planem, ochroną i klasą gruntu
    // (wcześniej trzeba było włączyć „Sprawdź miejsce” i kliknąć w działkę — audyt UX B10).
    const focusParcel = (item) => {
        const point = manager?.focusParcel(item);
        if (!point || !identify?.identifyAt) return;
        try {
            void identify.identifyAt({ coordinate3857: point, coordinateLonLat: toLonLat(point), coordinate2180: transform(point, 'EPSG:3857', 'EPSG:2180') });
        } catch (error) { console.warn('[wyszukiwarka → karta działki]', error); }
    };
    const rootRef = useRef(null);
    const localityAbortRef = useRef(null);
    const streetAbortRef = useRef(null);
    const parcelAbortRef = useRef(null);
    const [selectedLocality, setSelectedLocality] = useState(null);
    const [placeInput, setPlaceInput] = useState('');
    const [parcelInput, setParcelInput] = useState('');
    const [localityItems, setLocalityItems] = useState([]);
    const [streetItems, setStreetItems] = useState([]);
    const [parcelItems, setParcelItems] = useState([]);
    const [parcelIdItems, setParcelIdItems] = useState([]);
    const [confirmedParcelId, setConfirmedParcelId] = useState(null);
    // 19.28.0: tekst wpisany do pola po wyborze wyniku (adres, działka) — bez ponownego wyszukiwania i listy.
    const [confirmedText, setConfirmedText] = useState(null);
    // 19.28.0: Enter naciśnięty, zanim przyszły wyniki — wybór pierwszego wyniku po ich nadejściu.
    const pendingEnterRef = useRef(false);
    const [openMenu, setOpenMenu] = useState(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [placeLoading, setPlaceLoading] = useState(false);
    const [parcelLoading, setParcelLoading] = useState(false);
    const [placeError, setPlaceError] = useState(null);
    const [parcelError, setParcelError] = useState(null);

    const localityMode = selectedLocality ? 'street' : 'locality';
    const activeItems = localityMode === 'locality' ? localityItems : streetItems;
    const mainMenu = isParcelIdentifierCandidate(placeInput) ? 'parcel-id' : localityMode;
    const activeKind = openMenu === 'parcel' || openMenu === 'parcel-id' ? 'parcel' : localityMode;
    const dropdownItems = openMenu === 'parcel' ? parcelItems : openMenu === 'parcel-id' ? parcelIdItems : activeItems;
    const dropdownLoading = openMenu === 'parcel' ? parcelLoading : placeLoading;
    const dropdownError = openMenu === 'parcel' ? parcelError : placeError;
    const localityId = useMemo(() => selectedLocality ? `${selectedLocality.localityName ?? ''}|${selectedLocality.commune ?? ''}|${selectedLocality.voivodeship ?? ''}` : '', [selectedLocality]);
    const contextLabel = openMenu === 'parcel-id' ? t('search.context.parcelId') : openMenu === 'parcel'
        ? (selectedLocality ? localityBadgeLabel(selectedLocality) : '')
        : (localityMode === 'street' && selectedLocality ? localityBadgeLabel(selectedLocality) : t('search.context.country'));

    useEffect(() => { setHighlightedIndex(0); }, [openMenu, dropdownItems.length]);
    useEffect(() => {
        const onPointerDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpenMenu(null); };
        window.addEventListener('pointerdown', onPointerDown);
        return () => window.removeEventListener('pointerdown', onPointerDown);
    }, []);

    useEffect(() => {
        const query = trimText(placeInput);
        if ((confirmedParcelId && normalizeParcelIdentifier(query) === confirmedParcelId) || (confirmedText !== null && placeInput === confirmedText)) {
            setPlaceLoading(false);
            return;
        }
        const byId = isParcelIdentifierCandidate(query);
        if (!query || query.length < 2) {
            localityAbortRef.current?.abort();
            streetAbortRef.current?.abort();
            setParcelIdItems([]);
            setPlaceLoading(false); setPlaceError(null);
            if (selectedLocality) setStreetItems([]); else setLocalityItems([]);
            return;
        }
        if (byId && !isParcelIdentifier(query)) {
            localityAbortRef.current?.abort(); streetAbortRef.current?.abort();
            setParcelIdItems([]); setPlaceLoading(false);
            setPlaceError(null);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            try {
                setPlaceLoading(true); setPlaceError(null); setOpenMenu(byId ? 'parcel-id' : selectedLocality ? 'street' : 'locality');
                if (byId) {
                    localityAbortRef.current?.abort(); streetAbortRef.current?.abort();
                    const items = await requestSearch({ mode: 'parcel-id', q: normalizeParcelIdentifier(query) }, controller.signal);
                    if (!controller.signal.aborted) setParcelIdItems(items);
                } else if (selectedLocality) {
                    streetAbortRef.current?.abort(); streetAbortRef.current = controller;
                    const items = await requestSearch({ mode: 'street', q: query, locality: selectedLocality.localityName, commune: selectedLocality.commune, voivodeship: selectedLocality.voivodeship }, controller.signal);
                    if (!controller.signal.aborted) setStreetItems(items);
                } else {
                    localityAbortRef.current?.abort(); localityAbortRef.current = controller;
                    // 19.18.0: zapytanie z numerem — równolegle adres (UUG/OSM) i działka „obręb + numer” (ULDK).
                    const withNumber = QUERY_WITH_NUMBER.test(query);
                    const parcelMatch = query.match(PLACE_AND_PARCEL);
                    const place = parcelMatch ? parcelMatch[1].trim() : query.replace(/[\d\/,]+/g, ' ').replace(/\s+/g, ' ').trim();
                    const quiet = (promise) => promise.catch(() => []);
                    const [addresses, parcels, localities] = await Promise.all([
                        withNumber ? quiet(requestSearch({ mode: 'address', q: query }, controller.signal)) : [],
                        parcelMatch ? quiet(requestSearch({ mode: 'parcel', q: parcelMatch[2], locality: place }, controller.signal)) : [],
                        place.length >= 2 ? (withNumber ? quiet(requestSearch({ mode: 'locality', q: place }, controller.signal)) : requestSearch({ mode: 'locality', q: place }, controller.signal)) : [],
                    ]);
                    // 19.26.0: „miejscowość + numer” — gdy znamy punkt tej miejscowości, działka jest szukana
                    // we wszystkich obrębach jej jednostki ewidencyjnej (obręby w miastach mają inne nazwy).
                    let parcelItems = parcels;
                    const town = parcelMatch ? localities.find((item) => sameName(item.localityName, place)) : null;
                    if (town && Number.isFinite(town.lon) && !controller.signal.aborted) {
                        parcelItems = await quiet(requestSearch({ mode: 'parcel', q: parcelMatch[2], locality: place, ...lonLatOf(town) }, controller.signal));
                    }
                    const items = [
                        ...addresses.map((item) => ({ ...item, _kind: 'address' })),
                        ...parcelItems.slice(0, 8).map((item) => ({ ...item, _kind: 'parcel' })),
                        ...localities,
                    ];
                    if (!controller.signal.aborted) setLocalityItems(items);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setPlaceError(friendlySearchError(error, t('search.error.list')));
                    if (byId) setParcelIdItems([]);
                    else if (selectedLocality) setStreetItems([]); else setLocalityItems([]);
                }
            } finally { if (!controller.signal.aborted) setPlaceLoading(false); }
        }, 220);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [placeInput, localityId, selectedLocality, confirmedParcelId, confirmedText]);

    useEffect(() => {
        const query = trimText(parcelInput);
        if (!selectedLocality || !query) {
            parcelAbortRef.current?.abort(); setParcelLoading(false); setParcelError(null); setParcelItems([]); return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            try {
                setParcelLoading(true); setParcelError(null); setOpenMenu('parcel');
                parcelAbortRef.current?.abort(); parcelAbortRef.current = controller;
                const items = await requestSearch({ mode: 'parcel', q: query, locality: selectedLocality.localityName, ...lonLatOf(selectedLocality) }, controller.signal);
                if (!controller.signal.aborted) setParcelItems(items);
            } catch (error) {
                if (!controller.signal.aborted) { setParcelError(friendlySearchError(error, t('search.error.parcel'))); setParcelItems([]); }
            } finally { if (!controller.signal.aborted) setParcelLoading(false); }
        }, 240);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [parcelInput, localityId, selectedLocality]);

    const selectLocality = (item) => {
        if (item?._kind === 'address') { selectAddress(item); return; }
        if (item?._kind === 'parcel') { setConfirmedParcelId(null); setConfirmedText(item.id ?? item.label ?? ''); setPlaceInput(item.id ?? item.label ?? ''); setLocalityItems([]); setOpenMenu(null); focusParcel(item); return; }
        setConfirmedParcelId(null);
        setSelectedLocality(item); setPlaceInput(''); setParcelInput('');
        setLocalityItems([]); setStreetItems([]); setParcelItems([]); setPlaceError(null); setParcelError(null); setOpenMenu(null);
        manager?.focusLocality(item);
    };
    // 19.18.0: adres → przybliżenie na punkt i karta działki w tym miejscu (jak przy wyborze działki).
    const selectAddress = (item) => {
        setConfirmedText(item.label ?? ''); setPlaceInput(item.label ?? ''); setLocalityItems([]); setOpenMenu(null);
        const point = manager?.focusAddress?.(item);
        if (!point || item.approximate || !identify?.identifyAt) return;
        try { void identify.identifyAt({ coordinate3857: point, coordinateLonLat: toLonLat(point), coordinate2180: transform(point, 'EPSG:3857', 'EPSG:2180') }); }
        catch (error) { console.warn('[wyszukiwarka → adres]', error); }
    };
    const clearLocality = () => {
        setConfirmedParcelId(null);
        setSelectedLocality(null); setPlaceInput(''); setParcelInput(''); setLocalityItems([]); setStreetItems([]); setParcelItems([]);
        setPlaceError(null); setParcelError(null); setOpenMenu(null); manager?.clearHighlight();
    };
    const selectStreet = (item) => { setPlaceInput(item.streetName ?? item.label ?? ''); setStreetItems([]); setOpenMenu(null); manager?.focusStreet(item); };
    const selectParcel = (item) => { setParcelInput(item.parcel ?? item.label ?? ''); setParcelItems([]); setOpenMenu(null); focusParcel(item); };
    const selectParcelId = (item) => {
        const id = normalizeParcelIdentifier(item.id);
        setSelectedLocality(null); setConfirmedParcelId(id); setPlaceInput(id);
        setParcelIdItems([]); setPlaceError(null); setOpenMenu(null);
        focusParcel(item);
    };

    useEffect(() => {
        if (!pendingEnterRef.current || placeLoading) return;
        const items = mainMenu === 'parcel-id' ? parcelIdItems : activeItems;
        if (!items.length) return; // wyniki jeszcze nie przyszły (debounce) albo brak wyników — czekamy do zmiany tekstu
        pendingEnterRef.current = false;
        const select = mainMenu === 'parcel-id' ? selectParcelId : localityMode === 'locality' ? selectLocality : selectStreet;
        select(items[0]);
    }, [placeLoading, parcelIdItems, activeItems]);

    const handleKey = (event, items, selectFn) => {
        // 19.28.0: Esc tylko zamyka listę — bez tego pole type=search czyściło tekst i otwierało pustą listę.
        if (event.key === 'Escape') { if (openMenu) event.preventDefault(); setOpenMenu(null); return true; }
        if (!items.length) {
            if (event.key === 'Enter' && trimText(placeInput).length >= 2) { event.preventDefault(); pendingEnterRef.current = true; return true; }
            return false;
        }
        if (event.key === 'ArrowDown') { event.preventDefault(); setHighlightedIndex((current) => (current + 1) % items.length); return true; }
        if (event.key === 'ArrowUp') { event.preventDefault(); setHighlightedIndex((current) => (current - 1 + items.length) % items.length); return true; }
        if (event.key === 'Enter') { event.preventDefault(); selectFn(items[Math.min(highlightedIndex, items.length - 1)]); return true; }
        return false;
    };

    return h('div', { className: `map-search map-search--refined${!manager ? ' is-disabled' : ''}`, ref: rootRef },
        h('div', { className: 'map-search-fields' },
            h('div', { className: 'map-search-place' },
                h(Search, { size: 15, 'aria-hidden': true }),
                selectedLocality ? h('span', { className: 'map-search-chip', title: localityBadgeLabel(selectedLocality) }, h(MapPin, { size: 12 }), h('span', null, localityBadgeLabel(selectedLocality)), h('button', { type: 'button', className: 'map-search-chip-clear', onClick: clearLocality, 'aria-label': t('search.clearLocality') }, h(X, { size: 12 }))) : null,
                h('label', { htmlFor: 'map-search-input', className: 'search-permanent-label' }, selectedLocality ? 'Ulica / pełny ID' : 'Miejsce / działka'),
                h('input', { id: 'map-search-input', type: 'search', value: placeInput, disabled: !manager, onFocus: () => { if (!placeInput.trim() && !selectedLocality && recent.length) { setOpenMenu('recent'); return; } if ((!confirmedParcelId || normalizeParcelIdentifier(placeInput) !== confirmedParcelId) && placeInput !== confirmedText) setOpenMenu(mainMenu); }, onChange: (event) => { const value = event.target.value; pendingEnterRef.current = false; setConfirmedParcelId(null); setConfirmedText(null); setPlaceInput(value); setOpenMenu(!value.trim() ? null : isParcelIdentifierCandidate(value) ? 'parcel-id' : localityMode); }, onKeyDown: (event) => handleKey(event, mainMenu === 'parcel-id' ? parcelIdItems : activeItems, mainMenu === 'parcel-id' ? selectParcelId : localityMode === 'locality' ? selectLocality : selectStreet), placeholder: selectedLocality ? t('search.place.streetPlaceholder') : t('search.place.placeholder'), 'aria-label': t('search.place.aria'), 'aria-expanded': openMenu === mainMenu }),
                placeLoading ? h(LoaderCircle, { size: 14, className: 'is-spinning map-search-spinner' }) : null
            ),
            selectedLocality && h('div', { className: `map-search-parcel${selectedLocality ? '' : ' is-disabled'}` },
                h(Pentagon, { size: 14, className: 'map-search-parcel-icon', 'aria-hidden': true }),
                h('input', { type: 'search', value: parcelInput, disabled: !manager || !selectedLocality, onFocus: () => setOpenMenu('parcel'), onChange: (event) => { setParcelInput(event.target.value); setOpenMenu('parcel'); }, onKeyDown: (event) => handleKey(event, parcelItems, selectParcel), placeholder: t('search.parcel.placeholder'), title: selectedLocality ? undefined : t('search.parcel.needLocality'), 'aria-label': t('search.parcel.aria'), 'aria-expanded': openMenu === 'parcel' }),
                parcelLoading ? h(LoaderCircle, { size: 14, className: 'is-spinning map-search-spinner' }) : null
            )
        ),
        openMenu === 'recent' ? h('div', { className: 'map-search-dropdown', role: 'listbox', 'aria-label': 'Ostatnio sprawdzane działki' },
            h('div', { className: 'map-search-dropdown-header' }, h('strong', null, 'Ostatnio sprawdzane działki'),
                h('button', { type: 'button', className: 'map-search-recent-clear', onMouseDown: (event) => event.preventDefault(), onClick: () => { writeRecent([]); setRecent([]); setOpenMenu(null); } }, 'Wyczyść')),
            h('div', { className: 'map-search-results' }, recent.map((item) => h('button', {
                key: item.id, type: 'button', role: 'option', className: 'map-search-result', onMouseDown: (event) => event.preventDefault(),
                onClick: () => { pendingEnterRef.current = true; setSelectedLocality(null); setConfirmedParcelId(null); setPlaceInput(item.id); setOpenMenu('parcel-id'); },
            },
                h('span', { className: 'map-search-result-icon', 'aria-hidden': true }, h(ResultIcon, { kind: 'parcel' })),
                h('span', { className: 'map-search-result-copy' }, h('strong', null, item.number ? `dz. ${item.number}` : item.id), h('span', null, item.place ? `${item.place} · ${item.id}` : item.id)))))) :
        h(SearchDropdown, { open: Boolean(openMenu), loading: dropdownLoading, error: dropdownError, items: dropdownItems, kind: activeKind, contextLabel, highlightedIndex, onHighlight: setHighlightedIndex, emptyLabel: openMenu === 'parcel-id' ? (isParcelIdentifier(placeInput) ? t('search.empty.parcelId') : t('search.empty.parcelIdHint')) : openMenu === 'parcel' ? (selectedLocality ? t('search.empty.parcel') : t('search.empty.needLocality')) : (localityMode === 'locality' ? t('search.empty.locality') : t('search.empty.street')), onSelect: openMenu === 'parcel-id' ? selectParcelId : openMenu === 'parcel' ? selectParcel : (localityMode === 'locality' ? selectLocality : selectStreet) })
    );
}
