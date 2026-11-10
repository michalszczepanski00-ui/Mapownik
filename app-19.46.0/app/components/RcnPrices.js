import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RCN_DEFAULTS, medianReliable } from '../../core/rcnDefaults.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import Text from 'ol/style/Text.js';
import { transform } from 'ol/proj.js';
import { useService } from '../services/AppServicesContext.js';
import { Button, Message } from '../ui/index.js';

/**
 * 19.29.0 — ceny transakcyjne w okolicy działki z Rejestru Cen Nieruchomości GUGiK (api/rcn.php).
 * Mediana i typowy przedział zł/m², ostatnie transakcje, punkty na mapie i pobranie CSV.
 */
const KINDS = [['grunty', 'Grunty'], ['domy', 'Domy'], ['mieszkania', 'Mieszkania']];
const PREFS_KEY = 'msportal:rcn:v1';
const LIST_SHORT = 6;
const LIST_LONG = 40;
const zl = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const m2 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const monthYear = (iso) => (iso ? `${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—');
const transactions = (n) => `${n} ${n === 1 ? 'transakcja' : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? 'transakcje' : 'transakcji'}`;
const MARKET = { rynekPierwotny: 'pierwotny', rynekWtorny: 'wtórny' };

function readPrefs() {
    try { const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (v && typeof v === 'object') return v; } catch { /* tryb prywatny */ }
    return {};
}
function writePrefs(prefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* best effort */ } }

function toCsv(data) {
    const head = ['data', 'cena_zl', 'powierzchnia_m2', 'zl_za_m2', 'opis', 'odleglosc_m', 'rynek', 'rodzaj_transakcji', 'w_statystyce', 'uwagi', 'x_2180', 'y_2180'];
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = data.items.map((i) => [i.date, i.price, i.area, i.perM2, i.label, i.dist, MARKET[i.market] ?? i.market, i.type, i.inStats ? 'tak' : 'nie', i.note, i.x, i.y].map(esc).join(';'));
    return '﻿' + [head.join(';'), ...rows].join('\r\n');
}

function pointStyle(item, stats, selected, resolution) {
    const v = item.perM2;
    const tone = !item.inStats ? '#9aa3a0' : v === null || stats.p25PerM2 === null ? '#2f6b4f'
        : v < stats.p25PerM2 ? '#7fb79a' : v > stats.p75PerM2 ? '#1d4732' : '#3f8a64';
    return new Style({
        image: new CircleStyle({ radius: selected ? 8 : 5.5, fill: new Fill({ color: tone }), stroke: new Stroke({ color: selected ? '#f59e0b' : '#ffffff', width: selected ? 3 : 1.5 }) }),
        text: resolution < 1.6 || selected ? new Text({
            text: v !== null ? `${zl.format(v)} zł/m²` : `${zl.format(item.price ?? 0)} zł`, offsetY: -13, font: '600 11px Inter, system-ui, sans-serif',
            fill: new Fill({ color: '#1f2a24' }), stroke: new Stroke({ color: 'rgba(255,255,255,.95)', width: 3 }),
        }) : undefined,
        zIndex: selected ? 2 : 1,
    });
}

/** center: [lon, lat] (EPSG:4326) — środek działki z raportu, karty albo mapy. */
export function RcnPrices({ center, centerLabel, defaultRadius }) {
    const controller = useService('mapController');
    const prefs = useMemo(readPrefs, []);
    // 19.46.0: domyślnie te same parametry co karta działki i porównanie (core/rcnDefaults.js); własny wybór użytkownika zostaje.
    void defaultRadius;
    const [kind, setKind] = useState(prefs.kind ?? RCN_DEFAULTS.kind);
    const [years, setYears] = useState(String(prefs.years ?? RCN_DEFAULTS.years));
    const [radius, setRadius] = useState(String(prefs.radius ?? RCN_DEFAULTS.radius));
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const [showMap, setShowMap] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const layerRef = useRef(null);
    const selectedRef = useRef(null);
    selectedRef.current = selectedId;
    const abortRef = useRef(null);
    const centerKey = Array.isArray(center) ? center.map((v) => v.toFixed(5)).join(',') : '';

    useEffect(() => { writePrefs({ kind, years: Number(years), radius: Number(radius) }); }, [kind, years, radius]);

    const load = useCallback(async () => {
        if (!Array.isArray(center)) return;
        abortRef.current?.abort();
        const controllerAbort = new AbortController(); abortRef.current = controllerAbort;
        setPending(true); setError(''); setSelectedId(null);
        try {
            const [x, y] = transform(center, 'EPSG:4326', 'EPSG:2180');
            const params = new URLSearchParams({ x: x.toFixed(1), y: y.toFixed(1), r: radius, kind, years });
            const response = await fetch(`./api/rcn.php?${params}`, { signal: controllerAbort.signal });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
            if (!controllerAbort.signal.aborted) { setData(payload); setExpanded(false); }
        } catch (reason) {
            if (controllerAbort.signal.aborted) return;
            setData(null);
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally { if (!controllerAbort.signal.aborted) setPending(false); }
    }, [centerKey, radius, kind, years]);

    useEffect(() => { void load(); return () => abortRef.current?.abort(); }, [load]);

    // Punkty transakcji na mapie (warstwa tymczasowa, nie trafia do projektu).
    useEffect(() => {
        if (!controller || !showMap || !data?.items?.length) return undefined;
        const stats = data.stats;
        const features = data.items.map((item) => {
            const feature = new Feature({ geometry: new Point(transform([item.x, item.y], 'EPSG:2180', 'EPSG:3857')) });
            feature.setId(item.id); feature.set('rcn', item);
            return feature;
        });
        const layer = new VectorLayer({
            source: new VectorSource({ features }), zIndex: 960, declutter: true,
            style: (feature, resolution) => pointStyle(feature.get('rcn'), stats, feature.getId() === selectedRef.current, resolution),
            properties: { title: 'Mapownik — ceny transakcyjne RCN' },
        });
        controller.addLayer(layer); layerRef.current = layer;
        return () => { controller.removeLayer(layer); layerRef.current = null; };
    }, [controller, data, showMap]);
    useEffect(() => { layerRef.current?.changed(); }, [selectedId]);

    const focus = (item) => {
        setSelectedId(item.id);
        if (!controller) return;
        const [cx, cy] = transform([item.x, item.y], 'EPSG:2180', 'EPSG:3857');
        controller.fitExtent([cx - 60, cy - 60, cx + 60, cy + 60], { maxZoom: 18, duration: 250 });
    };
    const downloadCsv = () => {
        if (!data) return;
        const blob = new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `ceny-rcn-${data.kind}-${data.radius}m-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.append(a); a.click(); a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    const stats = data?.stats;
    const items = data?.items ?? [];
    const shown = items.slice(0, expanded ? LIST_LONG : LIST_SHORT);
    const unit = data?.unit ?? 'm²';
    const excludedCount = data ? Object.values(data.excluded ?? {}).reduce((a, b) => a + b, 0) : 0;
    const select = (label, value, set, options) => h('label', { className: 'rcn-select' }, h('span', null, label),
        h('select', { value, onChange: (event) => set(event.target.value), 'aria-label': label }, options.map(([v, l]) => h('option', { key: v, value: v }, l))));

    return h('section', { className: 'rcn-prices', 'aria-label': 'Ceny transakcyjne w okolicy' },
        h('div', { className: 'rcn-head' },
            h('strong', null, 'Ceny transakcyjne w okolicy'),
            h('small', null, centerLabel ? `wokół: ${centerLabel}` : 'Rejestr Cen Nieruchomości GUGiK')),
        h('div', { className: 'rcn-kinds', role: 'radiogroup', 'aria-label': 'Rodzaj nieruchomości' },
            KINDS.map(([id, label]) => h('button', { key: id, type: 'button', role: 'radio', 'aria-checked': kind === id, className: `rcn-kind${kind === id ? ' is-active' : ''}`, onClick: () => setKind(id) }, label))),
        h('div', { className: 'rcn-filters' },
            select('Okres', years, setYears, [['2', '2 lata'], ['3', '3 lata'], ['5', '5 lat'], ['10', '10 lat']]),
            select('Promień', radius, setRadius, [['300', '300 m'], ['500', '500 m'], ['1000', '1 km'], ['1500', '1,5 km']])),
        !Array.isArray(center) && h('p', { className: 'rcn-empty' }, 'Wybierz działkę, aby zobaczyć ceny w jej okolicy.'),
        pending && h('p', { className: 'rcn-empty', role: 'status' }, 'Pobieranie transakcji z rejestru GUGiK…'),
        error && !pending && h(Message, { tone: 'warning' }, error, ' ', h('button', { type: 'button', className: 'rcn-link', onClick: () => void load() }, 'Ponów')),
        data && !pending && h('div', { className: 'rcn-result' },
            data.marketCount === 0
                ? h('p', { className: 'rcn-empty' }, `Brak transakcji rynkowych w promieniu ${data.radius} m od ${monthYear(data.from)}. Zwiększ promień albo okres.`)
                : h('div', { className: 'rcn-summary' },
                    // Domy: główna wartość to cena całej nieruchomości (pow. użytkowa w RCN bywa pusta).
                    kind !== 'domy' && stats.medianPerM2 !== null
                        ? h('div', { className: 'rcn-main' }, h('span', null, 'Mediana'), h('strong', null, `${zl.format(stats.medianPerM2)} zł/m²`), h('small', null, unit),
                            // 19.46.0: mediana z 1–2 transakcji — ostrzeżenie zamiast pozorów statystyki.
                            !medianReliable(stats) && h('small', { className: 'rcn-warning', role: 'note' }, `Tylko ${transactions(stats.perM2Count)} — za mało na wiarygodną medianę; traktuj orientacyjnie albo zwiększ promień lub okres.`))
                        : h('div', { className: 'rcn-main' }, h('span', null, 'Mediana ceny'), h('strong', null, `${zl.format(stats.medianPrice)} zł`), h('small', null, 'cała nieruchomość')),
                    kind !== 'domy' && stats.p25PerM2 !== null && stats.perM2Count >= 4 && h('div', { className: 'rcn-row' }, h('span', null, 'Typowo (50% transakcji)'), h('strong', null, `${zl.format(stats.p25PerM2)}–${zl.format(stats.p75PerM2)} zł/m²`)),
                    kind === 'domy' && stats.medianPerM2 !== null && stats.perM2Count >= 3 && h('div', { className: 'rcn-row' }, h('span', null, `Mediana zł/m² pow. użytk. (${stats.perM2Count})`), h('strong', null, `${zl.format(stats.medianPerM2)} zł/m²`)),
                    kind !== 'domy' && h('div', { className: 'rcn-row' }, h('span', null, 'Mediana ceny'), h('strong', null, `${zl.format(stats.medianPrice)} zł`)),
                    stats.medianArea !== null && h('div', { className: 'rcn-row' }, h('span', null, kind === 'grunty' ? 'Mediana powierzchni' : 'Mediana pow. użytkowej'), h('strong', null, `${zl.format(stats.medianArea)} m²`)),
                    h('div', { className: 'rcn-row' }, h('span', null, 'Podstawa'), h('strong', null, `${transactions(data.marketCount)} · ${monthYear(stats.firstDate)}–${monthYear(stats.lastDate)}`))),
            items.length > 0 && h('ol', { className: 'rcn-list', 'aria-label': 'Ostatnie transakcje' },
                shown.map((item) => h('li', { key: item.id },
                    h('button', { type: 'button', className: `rcn-item${item.id === selectedId ? ' is-selected' : ''}${item.inStats ? '' : ' is-muted'}`, onClick: () => focus(item), title: 'Pokaż na mapie' },
                        h('span', { className: 'rcn-item-top' },
                            h('span', null, monthYear(item.date)),
                            h('strong', null, item.perM2 !== null ? `${zl.format(item.perM2)} zł/m²` : `${zl.format(item.price ?? 0)} zł`)),
                        h('span', { className: 'rcn-item-sub' },
                            [item.label || 'bez adresu', item.perM2 !== null ? `${zl.format(item.price)} zł` : null,
                                item.area !== null ? `${m2.format(item.area)} m²` : null, item.rooms ? `${item.rooms} pok.` : null,
                                MARKET[item.market] ? `rynek ${MARKET[item.market]}` : null, item.usufruct ? 'użytk. wieczyste' : null, `${zl.format(item.dist)} m`].filter(Boolean).join(' · ')),
                        item.note && h('span', { className: 'rcn-item-note' }, item.note))))),
            items.length > LIST_SHORT && h('button', { type: 'button', className: 'rcn-link', onClick: () => setExpanded((v) => !v) },
                expanded ? 'Pokaż mniej' : `Pokaż więcej (${Math.min(items.length, LIST_LONG)} z ${data.count})`),
            items.length > 0 && h('div', { className: 'rcn-actions' },
                h('label', { className: 'vps-toggle' }, h('input', { type: 'checkbox', checked: showMap, onChange: (event) => setShowMap(event.target.checked) }), 'Punkty na mapie'),
                h(Button, { variant: 'ghost', size: 'sm', onClick: downloadCsv }, 'Pobierz CSV')),
            h('small', { className: 'rcn-note' },
                'Ceny brutto z aktów notarialnych (RCN). Statystyka pomija sprzedaż udziałów, grunty pod drogami, transakcje nierynkowe i nietypowe',
                excludedCount ? ` (${excludedCount})` : '', '. Nie uwzględnia stanu nieruchomości.',
                data.truncated ? ' Wynik obcięty do limitu rekordów — zmniejsz promień albo okres.' : '',
                data.stale ? ' Rejestr chwilowo nie odpowiada — pokazano ostatni zapisany wynik.' : '')));
}
