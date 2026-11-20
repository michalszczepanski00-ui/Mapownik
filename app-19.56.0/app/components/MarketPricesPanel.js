import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJsonWithRetry } from '../../core/fetchRetry.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import Text from 'ol/style/Text.js';
import { transform, transformExtent } from 'ol/proj.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { RcnPrices } from './RcnPrices.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { PanelIcon } from './PanelIcon.js';
import { Button, CheckboxField, Message, PanelMinimized, PanelShell, SelectField } from '../ui/index.js';
import { MAP_SELECTION } from '../../map/selectionColors.js';

/**
 * 19.32.0 — narzędzie „Ceny transakcyjne”: transakcje z Rejestru Cen Nieruchomości (GUGiK) w bieżącym widoku mapy.
 * Punkty mają kolor według ceny za m² (5 klas liczonych z transakcji w widoku), etykietę przy dużym zbliżeniu
 * i szczegóły po kliknięciu. Dane: ./api/rcn.php?bbox=… (ten sam filtr nietypowych transakcji co w Raporcie).
 */
const ID = 'marketPrices';
const KINDS = [{ value: 'grunty', label: 'Grunty' }, { value: 'domy', label: 'Domy' }, { value: 'mieszkania', label: 'Mieszkania' }];
const YEARS = [1, 2, 3, 5, 10].map((v) => ({ value: String(v), label: v === 1 ? 'ostatni rok' : `ostatnie ${v} lata`.replace('5 lata', '5 lat').replace('10 lata', '10 lat') }));
const COLORS = ['#fde9b8', '#f9bf6f', '#ef8a47', '#d4552f', '#9e2a20'];
const GREY = '#9aa3a0';
const MAX_SIDE_M = 8000;
const PREFS_KEY = 'msportal:market-prices:v1';
const zl = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const monthYear = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—');
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? few : many}`;

function readPrefs() { try { const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
function writePrefs(v) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(v)); } catch { /* tryb prywatny */ } }

/** Progi 5 klas (kwintyle) z transakcji w statystyce; mniej niż 5 wartości — jedna klasa. */
function classBreaks(items) {
    const values = items.filter((i) => i.inStats && Number.isFinite(i.perM2)).map((i) => i.perM2).sort((a, b) => a - b);
    if (values.length < 5) return values.length ? { breaks: [], min: values[0], max: values.at(-1) } : null;
    const q = (p) => values[Math.min(values.length - 1, Math.floor(p * values.length))];
    return { breaks: [q(0.2), q(0.4), q(0.6), q(0.8)], min: values[0], max: values.at(-1) };
}
function classOf(value, classes) {
    if (!classes || !Number.isFinite(value)) return -1;
    if (!classes.breaks.length) return 2;
    const i = classes.breaks.findIndex((b) => value < b);
    return i === -1 ? 4 : i;
}

function toCsv(items) {
    const head = ['data', 'cena_zl', 'powierzchnia_m2', 'zl_za_m2', 'opis', 'dzialki', 'rynek', 'rodzaj_transakcji', 'w_statystyce', 'uwagi', 'x_2180', 'y_2180'];
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + [head.join(';'), ...items.map((i) => [i.date, i.price, i.area, i.perM2, i.label, (i.parcels || []).join(' '), i.market, i.type, i.inStats ? 'tak' : 'nie', i.note, i.x, i.y].map(esc).join(';'))].join('\r\n');
}

const SCOPE_KEY = 'mapownik:market-prices-scope';
const NO_IDENTIFY = Object.freeze({ open: false });
function readScope() { try { return window.localStorage.getItem(SCOPE_KEY); } catch { return null; } }

/** Przełącznik zakresu: „Wokół działki” (ceny wokół działki z karty) | „W widoku mapy” (transakcje w widoku). */
function ScopeSwitch({ scope, onChange, hasParcel }) {
    return h('div', { className: 'market-scope', role: 'radiogroup', 'aria-label': 'Zakres cen' },
        [['parcel', 'Wokół działki'], ['view', 'W widoku mapy']].map(([value, label]) => h('button', {
            key: value, type: 'button', role: 'radio', 'aria-checked': scope === value, className: `market-scope-option${scope === value ? ' is-active' : ''}`,
            title: value === 'parcel' && !hasParcel ? 'Wybierz działkę na mapie — ceny liczone wokół niej' : undefined,
            onClick: () => onChange(value),
        }, label)));
}

/**
 * 19.53.0 (Etap 5) — jeden widok „Ceny transakcyjne” z przełącznikiem zakresu (decyzja właściciela po Etapie 0).
 * „Wokół działki” to ceny z dawnej zakładki Raport (RcnPrices), „W widoku mapy” — dotychczasowe narzędzie Ceny.
 * Obie części liczą jak dotąd (api/rcn.php: x,y,r albo bbox).
 */
export function MarketPricesPanel() {
    const identify = useServiceSnapshot('identify', NO_IDENTIFY);
    const center = identify.open ? (identify.parcelCenterLonLat ?? identify.coordinateLonLat ?? null) : null;
    const [scope, setScopeState] = useState(() => readScope() ?? 'parcel');
    const setScope = (value) => { setScopeState(value); try { window.localStorage.setItem(SCOPE_KEY, value); } catch { /* prywatny tryb */ } };
    const switcher = h(ScopeSwitch, { scope, onChange: setScope, hasParcel: Boolean(center) });
    if (scope === 'parcel') return h(ParcelPricesPanel, { switcher, center, label: identify.parcel?.parcel ? `dz. ${identify.parcel.parcel}` : (center ? 'wskazany punkt' : '') });
    return h(ViewPricesPanel, { switcher });
}

function ParcelPricesPanel({ switcher, center, label }) {
    const panel = usePanel(ID);
    if (!panel.open) return null;
    const title = 'Ceny transakcyjne';
    if (panel.collapsed && !panel.docked) return h(PanelMinimized, { title, icon: h(PanelIcon, { name: 'market-prices' }), style: panel.style, onRestore: panel.restore });
    return h(PanelShell, { className: 'market-panel', title, subtitle: 'Rejestr Cen Nieruchomości · wokół działki', label: title, docked: panel.docked, style: panel.style,
        icon: h(PanelIcon, { name: 'market-prices', size: 16 }), actions: h(PanelHeaderActions, { id: ID }),
        onDragStart: panel.onDragStart, onResizeWidth: panel.onResizeStart, onResizeHeight: panel.onResizeHeightStart },
    h('div', { className: 'market-body' }, switcher,
        center ? h(RcnPrices, { center, centerLabel: label })
            : h(Message, { tone: 'info' }, 'Wybierz działkę na mapie (karta działki) — ceny policzymy wokół niej. Bez działki przełącz na „W widoku mapy”.')));
}

function ViewPricesPanel({ switcher }) {
    const controller = useService('mapController');
    const panel = usePanel(ID);
    const prefs = useMemo(readPrefs, []);
    const [kind, setKind] = useState(prefs.kind ?? 'grunty');
    const [years, setYears] = useState(String(prefs.years ?? 3));
    const [follow, setFollow] = useState(prefs.follow ?? true);
    const [onlyStats, setOnlyStats] = useState(prefs.onlyStats ?? false);
    const [state, setState] = useState({ status: 'idle', data: null, error: '' });
    const [selectedId, setSelectedId] = useState(null);
    const [revision, setRevision] = useState(0);
    const layerRef = useRef(null), selectedRef = useRef(null), abortRef = useRef(null);
    selectedRef.current = selectedId;
    const active = panel.open;

    useEffect(() => { writePrefs({ kind, years: Number(years), follow, onlyStats }); }, [kind, years, follow, onlyStats]);

    const load = useCallback(async () => {
        const map = controller?.map;
        if (!map?.getSize()) return;
        abortRef.current?.abort();
        const abort = new AbortController(); abortRef.current = abort;
        const extent = transformExtent(map.getView().calculateExtent(map.getSize()), 'EPSG:3857', 'EPSG:2180');
        if (extent[2] - extent[0] > MAX_SIDE_M || extent[3] - extent[1] > MAX_SIDE_M) { setState({ status: 'zoom', data: null, error: '' }); return; }
        setState((s) => ({ ...s, status: 'loading', error: '' }));
        try {
            const params = new URLSearchParams({ bbox: extent.map((v) => v.toFixed(0)).join(','), kind, years });
            // 19.47.0: do 2 ponowień przy zerwanym połączeniu z GUGiK; komunikat bez tekstu technicznego.
            const payload = await fetchJsonWithRetry(`./api/rcn.php?${params}`, { signal: abort.signal });
            if (!abort.signal.aborted) setState({ status: 'ready', data: payload, error: '' });
        } catch (reason) {
            if (abort.signal.aborted) return;
            setState({ status: 'error', data: null, error: reason instanceof Error ? reason.message : String(reason) });
        }
    }, [controller, kind, years]);

    // Wczytanie przy otwarciu, zmianie opcji i (gdy włączone) po przesunięciu mapy.
    useEffect(() => { if (active) void load(); return () => abortRef.current?.abort(); }, [active, load, revision]);
    useEffect(() => {
        if (!active || !follow || !controller) return undefined;
        let timer = null, first = true; // onMoveEnd woła od razu raz — pierwsze wczytanie robi efekt wyżej
        const unsubscribe = controller.onMoveEnd(() => { if (first) { first = false; return; } window.clearTimeout(timer); timer = window.setTimeout(() => setRevision((v) => v + 1), 450); });
        return () => { window.clearTimeout(timer); unsubscribe?.(); };
    }, [active, follow, controller]);

    const items = useMemo(() => (state.data?.items ?? []).filter((i) => !onlyStats || i.inStats), [state.data, onlyStats]);
    const classes = useMemo(() => classBreaks(state.data?.items ?? []), [state.data]);

    // Warstwa punktów (tymczasowa — nie trafia do projektu).
    useEffect(() => {
        if (!active || !controller || !items.length) return undefined;
        const features = items.map((item) => {
            const feature = new Feature({ geometry: new Point(transform([item.x, item.y], 'EPSG:2180', 'EPSG:3857')) });
            feature.setId(item.id); feature.set('rcn', item); return feature;
        });
        const cache = new Map();
        const layer = new VectorLayer({
            source: new VectorSource({ features }), zIndex: 965, declutter: true,
            properties: { title: 'MSportal — ceny transakcyjne (widok)', mapownikRole: 'market-prices', mapownikClickPriority: true },
            style: (feature, resolution) => {
                const item = feature.get('rcn'); const selected = feature.getId() === selectedRef.current;
                const cls = item.inStats ? classOf(item.perM2, classes) : -1;
                const showLabel = selected || resolution < 1.2;
                const key = `${cls}|${selected}|${showLabel ? item.id : ''}`;
                if (!cache.has(key)) {
                    cache.set(key, new Style({
                        image: new CircleStyle({ radius: selected ? 8 : 6, fill: new Fill({ color: cls < 0 ? GREY : COLORS[cls] }), stroke: new Stroke({ color: selected ? MAP_SELECTION : '#3b2a20', width: selected ? 3 : 1 }) }),
                        text: showLabel ? new Text({ text: item.perM2 !== null && item.inStats ? `${zl.format(item.perM2)} zł/m²` : `${zl.format(item.price ?? 0)} zł`, offsetY: -14, font: '600 11px Inter, system-ui, sans-serif',
                            fill: new Fill({ color: '#2a1d14' }), stroke: new Stroke({ color: 'rgba(255,255,255,.95)', width: 3 }) }) : undefined,
                        zIndex: selected ? 3 : cls + 1,
                    }));
                }
                return cache.get(key);
            },
        });
        // 19.33.0: legenda dla wspólnego przycisku „Legenda” (MapLegend).
        const legendItems = classes && classes.breaks.length
            ? [classes.min, ...classes.breaks].map((from, i) => ({ color: COLORS[i], label: i < 4 ? `${zl.format(from)}–${zl.format(classes.breaks[i])} zł/m²` : `≥ ${zl.format(from)} zł/m²` }))
            : classes ? [{ color: COLORS[2], label: `${zl.format(classes.min)}–${zl.format(classes.max)} zł/m²` }] : [];
        layer.set('mapownikLegend', { title: `Ceny transakcyjne — ${kind}`, items: [...legendItems, { color: GREY, label: 'poza statystyką' }] });
        controller.addLayer(layer); layerRef.current = layer;
        const map = controller.map;
        const onClick = (event) => {
            const hit = map.forEachFeatureAtPixel(event.pixel, (f) => f, { layerFilter: (l) => l === layer, hitTolerance: 5 });
            if (hit) setSelectedId(hit.getId());
        };
        map.on('singleclick', onClick);
        return () => { map.un('singleclick', onClick); controller.removeLayer(layer); layer.dispose(); layerRef.current = null; };
    }, [active, controller, items, classes, kind]);
    useEffect(() => { layerRef.current?.changed(); }, [selectedId]);
    useEffect(() => { if (!active) setSelectedId(null); }, [active]);

    if (!panel.open) return null;
    const title = 'Ceny transakcyjne';
    if (panel.collapsed && !panel.docked) return h(PanelMinimized, { title, icon: h(PanelIcon, { name: 'market-prices' }), style: panel.style, onRestore: panel.restore });

    const data = state.data, stats = data?.stats;
    const selected = (data?.items ?? []).find((i) => i.id === selectedId) ?? null;
    const unit = data?.unit === 'lokalu' || kind === 'mieszkania' ? 'm² lokalu' : kind === 'domy' ? 'm² budynku' : 'm² gruntu';
    const recent = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 25);
    const focus = (item) => {
        setSelectedId(item.id);
        const [cx, cy] = transform([item.x, item.y], 'EPSG:2180', 'EPSG:3857');
        controller?.fitExtent([cx - 80, cy - 80, cx + 80, cy + 80], { maxZoom: 18, duration: 250 });
    };
    const downloadCsv = () => {
        const url = URL.createObjectURL(new Blob([toCsv(items)], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `ceny-rcn-widok-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    const legend = classes && classes.breaks.length
        ? [classes.min, ...classes.breaks].map((from, i) => ({ color: COLORS[i], label: i < 4 ? `${zl.format(from)}–${zl.format(classes.breaks[i])}` : `≥ ${zl.format(from)}` }))
        : classes ? [{ color: COLORS[2], label: `${zl.format(classes.min)}–${zl.format(classes.max)}` }] : [];

    return h(PanelShell, { className: 'market-panel', title, subtitle: 'Rejestr Cen Nieruchomości · widok mapy', label: title, docked: panel.docked, style: panel.style,
        icon: h(PanelIcon, { name: 'market-prices', size: 16 }), actions: h(PanelHeaderActions, { id: ID }),
        onDragStart: panel.onDragStart, onResizeWidth: panel.onResizeStart, onResizeHeight: panel.onResizeHeightStart },
    h('div', { className: 'market-body' }, switcher,
        h('div', { className: 'market-controls' },
            h(SelectField, { label: 'Rodzaj', value: kind, onChange: setKind, options: KINDS }),
            h(SelectField, { label: 'Okres', value: years, onChange: setYears, options: YEARS }),
            h(CheckboxField, { label: 'Odświeżaj po przesunięciu mapy', checked: follow, onChange: setFollow }),
            h(CheckboxField, { label: 'Tylko transakcje w statystyce', checked: onlyStats, onChange: setOnlyStats, title: 'Bez udziałów, dróg, transakcji nierynkowych i nietypowych' })),
        !follow && h(Button, { size: 'sm', variant: 'primary', onClick: () => setRevision((v) => v + 1) }, 'Pokaż dla bieżącego widoku'),
        state.status === 'zoom' && h(Message, { tone: 'info' }, 'Przybliż mapę — narzędzie pokazuje transakcje w widoku do 8 × 8 km (ok. 1:70 000 i bliżej).'),
        state.status === 'loading' && h('small', { role: 'status', className: 'market-status' }, 'Pobieranie transakcji z rejestru…'),
        state.status === 'error' && h(Message, { tone: 'danger' }, `Rejestr cen nie odpowiedział: ${state.error}`, h(Button, { size: 'sm', onClick: () => setRevision((v) => v + 1) }, 'Ponów')),
        data && h('div', { className: 'market-summary', role: 'status' },
            h('div', { className: 'market-stat' }, h('span', null, `Mediana (${unit})`), h('strong', null, stats?.medianPerM2 ? `${zl.format(stats.medianPerM2)} zł` : '—')),
            h('div', { className: 'market-stat' }, h('span', null, 'Typowo (50% transakcji)'), h('strong', null, stats?.p25PerM2 ? `${zl.format(stats.p25PerM2)}–${zl.format(stats.p75PerM2)} zł` : '—')),
            h('small', null, `${plural(data.count, 'transakcja', 'transakcje', 'transakcji')} w widoku · ${data.marketCount} w statystyce`, data.truncated || data.count >= 1500 ? ' · pokazano część — przybliż mapę' : '')),
        legend.length > 0 && h('div', { className: 'market-legend', 'aria-label': `Legenda: zł/${unit}` },
            legend.map((l) => h('span', { key: l.label, className: 'market-legend-item' }, h('i', { style: { background: l.color } }), l.label)),
            h('span', { className: 'market-legend-item' }, h('i', { style: { background: GREY } }), 'poza statystyką')),
        selected && h('div', { className: 'market-selected' },
            h('strong', null, selected.perM2 !== null && selected.inStats ? `${zl.format(selected.perM2)} zł/m²` : `${zl.format(selected.price ?? 0)} zł`),
            h('span', null, `${monthYear(selected.date)} · ${zl.format(selected.price ?? 0)} zł · ${selected.area ? `${zl.format(selected.area)} m²` : 'pow. —'}`),
            h('span', null, selected.label, selected.market === 'rynekPierwotny' ? ' · rynek pierwotny' : selected.market === 'rynekWtorny' ? ' · rynek wtórny' : ''),
            selected.note && h('small', null, selected.note), !selected.inStats && h('small', null, 'Poza statystyką (np. udział, droga, transakcja nietypowa).')),
        recent.length > 0 && h('div', { className: 'market-list' },
            h('div', { className: 'market-list-head' }, h('strong', null, 'Ostatnie transakcje'), h(Button, { size: 'sm', onClick: downloadCsv }, 'CSV')),
            recent.map((item) => h('button', { key: item.id, type: 'button', className: `market-row${item.id === selectedId ? ' is-selected' : ''}`, onClick: () => focus(item) },
                h('i', { style: { background: item.inStats ? COLORS[classOf(item.perM2, classes)] ?? GREY : GREY } }),
                // 19.47.0: zł/m² tylko w statystyce; poza nią cena łączna (udział, pakiet, pas gruntu z budynkiem).
                h('span', null, monthYear(item.date)), h('strong', null, item.perM2 !== null && item.inStats ? `${zl.format(item.perM2)} zł/m²` : `${zl.format(item.price ?? 0)} zł${item.inStats ? '' : ' łącznie'}`),
                h('small', null, item.label)))),
        h('details', { className: 'market-details' }, h('summary', null, 'O danych'),
            h('p', null, 'Ceny brutto z aktów notarialnych w Rejestrze Cen Nieruchomości GUGiK. Kolory: 5 klas ceny za m² liczonych z transakcji w widoku (kwintyle). Statystyka pomija sprzedaż udziałów, grunty pod drogami, transakcje nierynkowe i nietypowe.'),
            h('p', null, 'Kliknij punkt na mapie, aby zobaczyć szczegóły.'))));
}
