import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import { transform, toLonLat } from 'ol/proj.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { PanelIcon } from './PanelIcon.js';
import { Button, CheckboxField, Message, PanelMinimized, PanelShell, SelectField } from '../ui/index.js';

/**
 * 19.32.0 — narzędzie „Pozwolenia na budowę”: wnioski, decyzje i zgłoszenia budowlane (RWDZ, GUNB) wokół
 * wybranej działki albo środka mapy. Dane: ./api/permits.php (baza z tools/build_rwdz_store.py; położenie działek
 * z ULDK, ustalane przy pierwszym zapytaniu i zapamiętywane na serwerze — wynik przychodzi stopniowo).
 */
const ID = 'buildingPermits';
const TYPES = [
    ['dom', 'Domy jednorodzinne', '#2f7d4f'], ['wielorodzinny', 'Budynki wielorodzinne', '#c2410c'],
    ['uslugi', 'Usługi i handel', '#7c3aed'], ['przemysl', 'Przemysł i magazyny', '#475569'],
    ['energia', 'Energia (PV, wiatr)', '#ca8a04'], ['infrastruktura', 'Drogi i sieci', '#0e7490'],
    ['rozbiorka', 'Rozbiórki', '#b91c1c'], ['inne', 'Inne', '#9ca3af'],
];
const TYPE = Object.fromEntries(TYPES.map(([id, label, color]) => [id, { label, color }]));
const RADII = [300, 500, 1000, 1500].map((v) => ({ value: String(v), label: v >= 1000 ? `${v / 1000} km` : `${v} m` }));
const PERIODS = [{ value: '1', label: 'ostatni rok' }, { value: '2', label: 'ostatnie 2 lata' }, { value: '3', label: 'ostatnie 3 lata' }];
const PREFS_KEY = 'msportal:building-permits:v1';
const num = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const day = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—');
const dist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`);
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? few : many}`;
const SRC = { P: 'Wniosek / pozwolenie', Z: 'Zgłoszenie' };

function readPrefs() { try { const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
function writePrefs(v) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(v)); } catch { /* tryb prywatny */ } }
function title(item) { return item.name || item.intent || item.kind || 'Zamierzenie budowlane'; }

function toCsv(items) {
    const head = ['data_wniosku', 'rodzaj_wpisu', 'typ', 'nazwa', 'zamierzenie', 'kategoria', 'kubatura_m3', 'inwestor', 'organ', 'numer', 'data_decyzji', 'stan', 'miejsce', 'dzialki', 'odleglosc_m', 'x_2180', 'y_2180'];
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + [head.join(';'), ...items.map((i) => [i.date, SRC[i.src], TYPE[i.type]?.label, i.name, i.intent, i.category, i.volume, i.investor, i.organ, i.number, i.dateDecision, i.status, i.place, i.parcels.join(' '), i.dist, i.x, i.y].map(esc).join(';'))].join('\r\n');
}

export function BuildingPermitsPanel() {
    const controller = useService('mapController');
    const identify = useServiceSnapshot('identify', { parcel: null, parcelCenterLonLat: null });
    const panel = usePanel(ID);
    const prefs = useMemo(readPrefs, []);
    const [radius, setRadius] = useState(String(prefs.radius ?? 500));
    const [years, setYears] = useState(String(prefs.years ?? 3));
    const [srcP, setSrcP] = useState(prefs.srcP ?? true);
    const [srcZ, setSrcZ] = useState(prefs.srcZ ?? true);
    const [types, setTypes] = useState(() => new Set(Array.isArray(prefs.types) && prefs.types.length ? prefs.types : TYPES.map(([id]) => id)));
    const [target, setTarget] = useState(null); // { lonLat, label }
    const [state, setState] = useState({ status: 'idle', data: null, error: '', code: '' });
    const [selectedId, setSelectedId] = useState(null);
    const layerRef = useRef(null), selectedRef = useRef(null), runRef = useRef(0), abortRef = useRef(null);
    selectedRef.current = selectedId;
    const active = panel.open;
    const parcelCenter = identify?.parcelCenterLonLat ?? null;
    const parcelLabel = identify?.parcel?.id ?? identify?.parcel?.teryt ?? identify?.parcel?.label ?? null;

    useEffect(() => { writePrefs({ radius: Number(radius), years: Number(years), srcP, srcZ, types: [...types] }); }, [radius, years, srcP, srcZ, types]);

    const mapCenterTarget = useCallback(() => {
        const center = controller?.map?.getView()?.getCenter();
        return center ? { lonLat: toLonLat(center), label: 'Środek mapy' } : null;
    }, [controller]);
    // Punkt analizy: zaznaczona działka (gdy jest), inaczej środek mapy w chwili otwarcia narzędzia.
    useEffect(() => {
        if (!active) return;
        if (parcelCenter) setTarget({ lonLat: parcelCenter, label: parcelLabel ? `Działka ${parcelLabel}` : 'Zaznaczona działka' });
        else setTarget((current) => current ?? mapCenterTarget());
    }, [active, parcelCenter?.[0], parcelCenter?.[1], parcelLabel, mapCenterTarget]);

    const query = useMemo(() => {
        if (!target) return null;
        const [x, y] = transform(target.lonLat, 'EPSG:4326', 'EPSG:2180');
        const src = [srcP && 'P', srcZ && 'Z'].filter(Boolean).join(',');
        return new URLSearchParams({ x: x.toFixed(1), y: y.toFixed(1), r: radius, years, types: [...types].join(','), src }).toString();
    }, [target, radius, years, srcP, srcZ, types]);

    // Zapytanie z dopytywaniem, dopóki serwer ustala położenie działek (pending > 0).
    useEffect(() => {
        if (!active || !query) return undefined;
        if (!srcP && !srcZ) { setState({ status: 'error', data: null, error: 'Wybierz pozwolenia albo zgłoszenia.', code: '' }); return undefined; }
        if (!types.size) { setState({ status: 'error', data: null, error: 'Wybierz co najmniej jeden typ inwestycji.', code: '' }); return undefined; }
        const run = ++runRef.current;
        abortRef.current?.abort();
        const abort = new AbortController(); abortRef.current = abort;
        setState((s) => ({ ...s, status: 'loading', error: '', code: '' }));
        setSelectedId(null);
        (async () => {
            for (let attempt = 0; attempt < 40 && !abort.signal.aborted; attempt++) {
                try {
                    const response = await fetch(`./api/permits.php?${query}`, { signal: abort.signal });
                    const payload = await response.json().catch(() => null);
                    if (!response.ok || !payload?.ok) { setState({ status: 'error', data: null, error: payload?.error || `HTTP ${response.status}`, code: payload?.code || '' }); return; }
                    if (run !== runRef.current) return;
                    const more = payload.pending > 0 && payload.geocoded > 0;
                    setState({ status: more ? 'locating' : 'ready', data: payload, error: '', code: '' });
                    if (!more) return;
                } catch (reason) {
                    if (abort.signal.aborted) return;
                    setState((s) => ({ ...s, status: 'error', error: reason instanceof Error ? reason.message : String(reason) }));
                    return;
                }
            }
        })();
        return () => abort.abort();
    }, [active, query]);

    const items = state.data?.items ?? [];

    // Warstwa: okrąg promienia, punkt analizy i inwestycje (kolor = typ; ciemna obwódka = zgłoszenie).
    useEffect(() => {
        if (!active || !controller || !target) return undefined;
        const center3857 = transform(target.lonLat, 'EPSG:4326', 'EPSG:3857');
        const scale = 1 / Math.cos(target.lonLat[1] * Math.PI / 180); // promień w metrach gruntu → jednostki Web Mercatora
        const ring = [];
        for (let i = 0; i <= 72; i++) { const a = 2 * Math.PI * i / 72; ring.push([center3857[0] + Math.cos(a) * Number(radius) * scale, center3857[1] + Math.sin(a) * Number(radius) * scale]); }
        const circle = new Feature({ geometry: new Polygon([ring]), role: 'ring', clickPassThrough: true });
        const centerFeature = new Feature({ geometry: new Point(center3857), role: 'center', clickPassThrough: true });
        const features = [circle, centerFeature, ...items.map((item) => {
            const f = new Feature({ geometry: new Point(transform([item.x, item.y], 'EPSG:2180', 'EPSG:3857')), role: 'item' });
            f.setId(item.id); f.set('permit', item); return f;
        })];
        const ringStyle = new Style({ stroke: new Stroke({ color: 'rgba(30,64,175,.75)', width: 1.5, lineDash: [6, 5] }), fill: new Fill({ color: 'rgba(30,64,175,.04)' }) });
        const centerStyle = new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: 'rgba(255,255,255,.6)' }), stroke: new Stroke({ color: '#1e40af', width: 3 }) }) });
        const cache = new Map();
        const layer = new VectorLayer({
            source: new VectorSource({ features }), zIndex: 966,
            properties: { title: 'msportal — pozwolenia na budowę', mapownikRole: 'building-permits', mapownikClickPriority: true },
            style: (feature) => {
                const role = feature.get('role');
                if (role === 'ring') return ringStyle;
                if (role === 'center') return centerStyle;
                const item = feature.get('permit'); const selected = feature.getId() === selectedRef.current;
                const key = `${item.type}|${item.src}|${selected}`;
                if (!cache.has(key)) {
                    const fill = new Fill({ color: TYPE[item.type]?.color ?? '#9ca3af' });
                    // zgłoszenie: mniejszy punkt z ciemną obwódką; wniosek/pozwolenie: biała obwódka
                    const stroke = new Stroke({ color: selected ? '#1d4ed8' : item.src === 'Z' ? '#1f2937' : '#ffffff', width: selected ? 3 : item.src === 'Z' ? 2 : 1.5 });
                    cache.set(key, new Style({
                        image: new CircleStyle({ radius: selected ? 8 : item.src === 'Z' ? 5 : 6, fill, stroke }),
                        zIndex: selected ? 3 : 1,
                    }));
                }
                return cache.get(key);
            },
        });
        const present = new Set(items.map((item) => item.type));
        layer.set('mapownikLegend', { title: 'Budowy i pozwolenia', items: [
            ...TYPES.filter(([id]) => present.has(id)).map(([, label, color]) => ({ color, label })),
            { color: '#d1d5db', label: 'pozwolenie (biała obwódka)', border: '#ffffff' }, { color: '#d1d5db', label: 'zgłoszenie (ciemna obwódka)', border: '#1f2937' }] });
        controller.addLayer(layer); layerRef.current = layer;
        const map = controller.map;
        const onClick = (event) => {
            const hit = map.forEachFeatureAtPixel(event.pixel, (f) => (f.get('role') === 'item' ? f : undefined), { layerFilter: (l) => l === layer, hitTolerance: 5 });
            if (hit) setSelectedId(hit.getId());
        };
        map.on('singleclick', onClick);
        return () => { map.un('singleclick', onClick); controller.removeLayer(layer); layer.dispose(); layerRef.current = null; };
    }, [active, controller, target, radius, items]);
    useEffect(() => { layerRef.current?.changed(); }, [selectedId]);

    if (!panel.open) return null;
    const panelTitle = 'Budowy i pozwolenia';
    if (panel.collapsed && !panel.docked) return h(PanelMinimized, { title: panelTitle, icon: h(PanelIcon, { name: 'building-permits' }), style: panel.style, onRestore: panel.restore });

    const data = state.data;
    const selected = items.find((i) => i.id === selectedId) ?? null;
    const toggleType = (id, on) => setTypes((current) => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
    const focus = (item) => {
        setSelectedId(item.id);
        const [cx, cy] = transform([item.x, item.y], 'EPSG:2180', 'EPSG:3857');
        controller?.fitExtent([cx - 70, cy - 70, cx + 70, cy + 70], { maxZoom: 18, duration: 250 });
    };
    const downloadCsv = () => {
        const url = URL.createObjectURL(new Blob([toCsv(items)], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `pozwolenia-${radius}m-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    return h(PanelShell, { className: 'permits-panel', title: panelTitle, subtitle: 'Wnioski, decyzje i zgłoszenia (GUNB)', label: panelTitle, docked: panel.docked, style: panel.style,
        icon: h(PanelIcon, { name: 'building-permits', size: 16 }), actions: h(PanelHeaderActions, { id: ID }),
        onDragStart: panel.onDragStart, onResizeWidth: panel.onResizeStart, onResizeHeight: panel.onResizeHeightStart },
    h('div', { className: 'permits-body' },
        h('div', { className: 'permits-summary' },
            h('strong', null, target?.label ?? 'Punkt analizy'),
            h('small', null, parcelCenter ? 'Kliknij inną działkę na mapie, aby zmienić miejsce.' : 'Zaznacz działkę na mapie albo użyj środka mapy.'),
            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                h(Button, { size: 'sm', onClick: () => setTarget(mapCenterTarget()) }, 'Użyj środka mapy'),
                parcelCenter && h(Button, { size: 'sm', onClick: () => setTarget({ lonLat: parcelCenter, label: parcelLabel ? `Działka ${parcelLabel}` : 'Zaznaczona działka' }) }, 'Wróć do działki'))),
        h('div', { className: 'permits-controls' },
            h(SelectField, { label: 'Promień', value: radius, onChange: setRadius, options: RADII }),
            h(SelectField, { label: 'Okres', value: years, onChange: setYears, options: PERIODS }),
            h(CheckboxField, { label: 'Wnioski i pozwolenia na budowę', checked: srcP, onChange: setSrcP }),
            h(CheckboxField, { label: 'Zgłoszenia (np. domy bez pozwolenia)', checked: srcZ, onChange: setSrcZ }),
            h('details', { className: 'permits-details' }, h('summary', null, `Typy inwestycji (${types.size} z ${TYPES.length})`),
                h('div', { className: 'permits-types' }, TYPES.map(([id, label]) => h(CheckboxField, { key: id, label, checked: types.has(id), onChange: (on) => toggleType(id, on) }))))),
        state.code === 'no-data' && h(Message, { tone: 'warning' }, 'Baza pozwoleń nie jest jeszcze wgrana na serwer — wgraj plik data/rwdz/rwdz.sqlite z paczki danych.'),
        state.status === 'error' && state.code !== 'no-data' && h(Message, { tone: 'danger' }, state.error),
        (state.status === 'loading' || state.status === 'locating') && h('small', { role: 'status', className: 'permits-status' },
            state.status === 'loading' ? 'Szukanie inwestycji w okolicy…' : `Ustalanie położenia działek w ULDK… (do sprawdzenia: ${plural(data?.pending ?? 0, 'inwestycja', 'inwestycje', 'inwestycji')})`),
        data && h('div', { className: 'permits-summary', role: 'status' },
            h('strong', null, `${plural(data.count, 'inwestycja', 'inwestycje', 'inwestycji')} w promieniu ${dist(data.radius)}`),
            h('small', null, `od ${day(data.from)} · dane GUNB z ${day(data.dataDate)}${data.unlocated ? ` · ${data.unlocated} bez położenia w ULDK` : ''}`),
            h('div', { className: 'permits-legend' }, TYPES.filter(([id]) => data.counts?.[id]).map(([id, label, color]) => h('span', { key: id, className: 'permits-legend-item' }, h('i', { style: { background: color } }), `${label}: ${data.counts[id]}`)),
                h('span', { className: 'permits-legend-item' }, 'biała obwódka: pozwolenie · ciemna: zgłoszenie'))),
        selected && h('div', { className: 'permits-selected' },
            h('strong', null, title(selected)),
            h('span', null, `${TYPE[selected.type]?.label ?? ''} · ${SRC[selected.src]} · ${dist(selected.dist)}`),
            selected.intent && h('span', null, selected.intent),
            h('small', null, `Wpływ: ${day(selected.date)}${selected.dateDecision ? ` · decyzja: ${day(selected.dateDecision)}` : ''}${selected.status ? ` · ${selected.status}` : ''}`),
            selected.volume ? h('small', null, `Kubatura: ${num.format(selected.volume)} m³${selected.category ? ` · kategoria ${selected.category}` : ''}`) : selected.category && h('small', null, `Kategoria obiektu: ${selected.category}`),
            selected.investor && h('small', null, `Inwestor: ${selected.investor}`),
            h('small', null, `${selected.organ ?? ''}${selected.number ? ` · nr ${selected.number}` : ''}`),
            selected.place && h('small', null, `Miejsce: ${selected.place}`),
            h('small', null, `Działki: ${selected.parcels.slice(0, 6).join(', ')}${selected.parcels.length > 6 ? ` i ${selected.parcels.length - 6} innych` : ''}`)),
        items.length > 0 && h('div', { className: 'permits-list' },
            h('div', { className: 'permits-list-head' }, h('strong', null, 'Najnowsze'), h(Button, { size: 'sm', onClick: downloadCsv }, 'CSV')),
            items.slice(0, 60).map((item) => h('button', { key: item.id, type: 'button', className: `permits-row${item.id === selectedId ? ' is-selected' : ''}`, onClick: () => focus(item) },
                h('i', { style: { background: TYPE[item.type]?.color ?? '#9ca3af', borderColor: item.src === 'Z' ? '#1f2937' : '#fff', borderWidth: item.src === 'Z' ? 2 : 1 } }),
                h('span', null, h('strong', { title: title(item) }, title(item)), h('small', null, `${day(item.date)} · ${TYPE[item.type]?.label ?? ''} · ${item.src === 'Z' ? 'zgłoszenie' : 'pozwolenie'}`)),
                h('small', null, dist(item.dist)))),
            items.length > 60 && h('small', null, `Pokazano 60 z ${items.length} — pełna lista w CSV.`)),
        data && !items.length && state.status === 'ready' && h(Message, { tone: 'info' }, 'Brak wpisów w tym promieniu i okresie dla wybranych typów.'),
        h('details', { className: 'permits-details' }, h('summary', null, 'O danych'),
            h('p', null, 'Rejestr Wniosków, Decyzji i Zgłoszeń w sprawach budowlanych (GUNB, dane.gov.pl), aktualizowany co miesiąc. Położenie inwestycji to środek działki z ULDK; pierwsze sprawdzenie nowej okolicy trwa do kilkunastu sekund, kolejne są natychmiastowe.'),
            h('p', null, 'Typ inwestycji jest ustalany z kategorii obiektu i nazwy zamierzenia — orientacyjnie. Wpis to wniosek albo zgłoszenie, nie dowód, że budowa trwa.'))));
}
