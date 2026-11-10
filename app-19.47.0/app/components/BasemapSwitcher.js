import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, TriangleAlert } from 'lucide-react';
import { dataCatalog } from '../../data/catalog/index.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { PHOTO_IDS } from '../../orthophoto/orthophotoApi.js';
import { openPanel, useAppDispatch } from '../../store/index.js';
import { t } from '../../i18n/index.js';

const EMPTY_BASEMAPS = Object.freeze({ activeId: null, pendingId: null, items: [] });
const PREFS_KEY = 'mapownik:basemap-switcher-v1';
/** Opóźnienie miniatur: nie konkurują z pierwszym wczytaniem mapy. */
const THUMBNAIL_DELAY_MS = 1200;

/**
 * Wspólny wycinek do miniatur: kafel z13 w okolicy Pelplina — miasto, pola,
 * dolina rzeki. Jedno małe zapytanie na podkład na przeglądarkę (potem cache).
 */
const SAMPLE_TILE = Object.freeze({ z: 13, x: 4521, y: 2633 });
const HALF_WORLD = 20037508.342789244;

const SHORT_LABELS = Object.freeze({
    'basemap.osm': 'Mapa',
    'basemap.vector.pastel': 'Pastel',
    'basemap.vector.zmierzch': 'Zmierzch',
    'basemap.vector.kartograficzny': 'Karto',
    'basemap.topography': 'Topo',
    'basemap.orthophoto': 'Orto',
    'basemap.orthophoto.archive': 'Archiwum',
    'basemap.orthophoto.true': 'True ortho',
    'basemap.nmt.shaded': 'NMT',
});

function tileBbox3857({ z, x, y }) {
    const span = (2 * HALF_WORLD) / 2 ** z;
    const minX = -HALF_WORLD + x * span;
    const maxY = HALF_WORLD - y * span;
    return [minX, maxY - span, minX + span, maxY];
}
function fillTemplate(template, { z, x, y }) {
    return String(template).replaceAll('{z}', String(z)).replaceAll('{x}', String(x)).replaceAll('{y}', String(y));
}

/**
 * Adres miniatury wyliczony z definicji podkładu w katalogu — ten sam kafel
 * dla każdego rodzaju źródła. WMS idzie przez serwerowe proxy msportalu
 * (walidacja i cache), jak zapasowa droga pobierania mapy.
 */
export function basemapThumbnailUrl(definition, tile = SAMPLE_TILE) {
    if (definition?.id === 'basemap.orthophoto.archive' || definition?.id === 'basemap.orthophoto.true') return null;
    const source = definition?.source;
    if (!source) return null;
    // 19.30.0: podkłady wektorowe — gotowa miniatura (nie ma jednego kafla rastrowego).
    if (source.kind === 'vector-style') return source.thumbnail ?? null;
    try {
        if (source.kind === 'xyz' && source.url) return fillTemplate(source.url, tile);
        if (source.kind === 'fast-wmts' && source.standardUrl) return fillTemplate(source.standardUrl, tile);
        if (source.kind === 'wms' && source.url) {
            const url = new URL(source.url, window.location.href);
            // 19.28.0: pełne parametry GetMap — sam adres źródła (?source=…) dawał zastępczy kafel 1×1 px
            // i pustą miniaturę NMT.
            const defaults = { SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: source.version ?? '1.1.1', LAYERS: source.layers ?? '', STYLES: source.styles ?? '', FORMAT: source.format ?? 'image/png', TRANSPARENT: source.transparent ? 'true' : 'false' };
            Object.entries(defaults).forEach(([key, value]) => { if (!url.searchParams.has(key)) url.searchParams.set(key, value); });
            url.searchParams.set('BBOX', tileBbox3857(tile).map((value) => value.toFixed(2)).join(','));
            url.searchParams.set('WIDTH', '128');
            url.searchParams.set('HEIGHT', '128');
            url.searchParams.set('SRS', 'EPSG:3857');
            return url.toString();
        }
    } catch { /* brak miniatury nie może zablokować przełącznika */ }
    return null;
}

function readCollapsed() {
    try {
        const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
        if (stored && typeof stored.collapsed === 'boolean') return stored.collapsed;
    } catch { /* tryb prywatny / zablokowany localStorage */ }
    // 19.9.0: domyślnie zwinięty do jednej miniatury — róg mapy dzieli z dokiem
    // narzędzi; rozwinięcie zapamiętuje przeglądarka.
    return true;
}
function writeCollapsed(collapsed) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ collapsed })); } catch { /* best effort */ }
}

function Thumbnail({ item, url, showImage }) {
    const [failed, setFailed] = useState(false);
    const kind = item.id.replace(/^basemap\./, '').replace(/\./g, '-');
    return h('span', { className: `basemap-thumb basemap-thumb--${kind}`, 'aria-hidden': true },
        showImage && url && !failed
            ? h('img', { src: url, alt: '', decoding: 'async', draggable: false, onError: () => setFailed(true), onLoad: (event) => { if (event.currentTarget.naturalWidth <= 1) setFailed(true); } })
            : null);
}

/**
 * 17.8.12 — przełącznik podkładów jako miniatury w rogu mapy.
 *
 * Zastępuje menu podkładów z paska górnego: jedno kliknięcie zamiast
 * rozwijania listy. Każda miniatura pokazuje ten sam wycinek w danym
 * podkładzie; wybór działa przez BasemapManager, więc zachowana jest
 * dwufazowa zmiana (stary podkład zostaje, dopóki nowy się nie wczyta),
 * a stan ładowania i błędu widać na miniaturze.
 */
// 19.28.0: `expanded` — w arkuszu Warstwy na telefonie wszystkie podkłady widać od razu (audyt C1).
export function BasemapSwitcher({ expanded = false } = {}) {
    const dispatch = useAppDispatch();
    const manager = useService('basemaps');
    const snapshot = useServiceSnapshot('basemaps', EMPTY_BASEMAPS);
    // 19.47.0: jak w Google Maps — zawsze jedna miniatura; rozwija się po najechaniu (albo fokusie, stuknięciu)
    // i zwija po odjechaniu i po wyborze. Wcześniej rozwinięcie (dwa rzędy miniatur) zostawało na stałe
    // i zajmowało dół ekranu obok legendy, paska narzędzi i paska stylu.
    void readCollapsed; void writeCollapsed;
    const [open, setOpen] = useState(false);
    const collapsed = expanded ? false : !open;
    const leaveTimer = useRef(null);
    const openNow = useCallback(() => { window.clearTimeout(leaveTimer.current); setOpen(true); }, []);
    const closeSoon = useCallback(() => { window.clearTimeout(leaveTimer.current); leaveTimer.current = window.setTimeout(() => setOpen(false), 350); }, []);
    useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
    const [showImages, setShowImages] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => setShowImages(true), THUMBNAIL_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, []);

    const urls = useMemo(() => {
        const map = new Map();
        for (const definition of dataCatalog.layers) {
            if (definition.role === 'basemap') map.set(definition.id, basemapThumbnailUrl(definition));
        }
        return map;
    }, []);

    const toggleCollapsed = useCallback(() => setOpen((current) => !current), []);

    const selectedId = snapshot.pendingId ?? snapshot.activeId;
    const photoId = PHOTO_IDS.includes(selectedId) ? selectedId : PHOTO_IDS[0];
    const items = collapsed
        ? snapshot.items.filter((item) => item.id === selectedId)
        : snapshot.items.filter((item) => !PHOTO_IDS.includes(item.id) || item.id === photoId);
    if (!snapshot.items.length) return null;

    return h('div', {
        className: `basemap-switcher${collapsed ? ' is-collapsed' : ''}`,
        role: 'radiogroup',
        'aria-label': t('basemap.label'),
        ...(expanded ? {} : {
            onMouseEnter: openNow,
            onMouseLeave: closeSoon,
            onFocus: openNow,
            onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeSoon(); },
            onKeyDown: (event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } },
        }),
    },
        items.map((item) => {
            const active = item.id === snapshot.activeId;
            const pending = item.id === snapshot.pendingId;
            const error = item.status === 'error' && !active;
            const label = SHORT_LABELS[item.id] ?? item.title;
            const title = error
                ? t('basemap.down', { title: item.title })
                : pending ? t('basemap.loading', { title: item.title })
                    : active ? t('basemap.active', { title: item.title })
                        : t('basemap.switch', { title: item.title });
            return h('button', {
                key: item.id,
                type: 'button',
                role: 'radio',
                'aria-checked': item.id === selectedId,
                'aria-label': title,
                title: collapsed ? t('basemap.collapsedHint', { title }) : title,
                className: `basemap-option${active ? ' is-active' : ''}${pending ? ' is-pending' : ''}${error ? ' is-error' : ''}`,
                disabled: !manager,
                onClick: () => {
                    if (collapsed) { toggleCollapsed(); return; }
                    manager?.setActive(item.id);
                    if (!expanded) setOpen(false);
                },
            },
                h(Thumbnail, { item, url: urls.get(PHOTO_IDS.includes(item.id) ? PHOTO_IDS[0] : item.id), showImage: showImages }),
                pending ? h('span', { className: 'basemap-option-state' }, h(LoaderCircle, { size: 16, className: 'is-spinning' })) : null,
                error ? h('span', { className: 'basemap-option-state basemap-option-state--error' }, h(TriangleAlert, { size: 15 })) : null,
                active && !pending && !collapsed ? h('span', { className: 'basemap-option-check' }, h(Check, { size: 11 })) : null,
                h('span', { className: 'basemap-option-label' }, label));
        }),
        // 19.28.0: „Zdjęcia ▾” usunięte — zdjęcia lotnicze mają jeden przycisk (szyna po prawej).
        !expanded ? h('button', {
            type: 'button',
            className: 'basemap-switcher-toggle',
            'aria-label': collapsed ? t('basemap.expand') : t('basemap.collapse'),
            title: collapsed ? t('basemap.expand') : t('basemap.collapse'),
            'aria-expanded': !collapsed,
            onClick: toggleCollapsed,
        }, collapsed ? h(ChevronRight, { size: 14 }) : h(ChevronLeft, { size: 14 })) : null);
}
