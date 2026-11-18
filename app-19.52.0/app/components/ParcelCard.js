import { createElement as h, useMemo } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { transform } from 'ol/proj.js';
import { Check, ChevronDown, ChevronRight, Eye, RotateCw } from 'lucide-react';
import { reportDialog } from './reportDialogStore.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { openPanel, useAppDispatch } from '../../store/index.js';
import { formatParcelArea } from '../../core/units.js';
import { runTerrainFor } from '../../terrain/runTerrainFor.js';
import { Fact, SummaryRow, Nearby, protectedAreaName, forestOwner, soilClass, pogVerdict, isRetryableLayerError } from './IdentifyPanel.js';

/**
 * 19.51.0 — uproszczona karta działki (propozycje P1–P10, propozycje/PROPOZYCJA_LEWY_PANEL.md).
 *
 *  P1  nagłówek: numer, „ha · obręb · gmina”;
 *  P2  trzy przyciski: Raport PDF (jedyny wypełniony) · Do projektu · Analizy ▾ (wszystkie narzędzia działki);
 *  P3  wynik w grupach: Planowanie (zawsze), Ograniczenia (osobno tylko to, co dotyczy działki; reszta w linii „Brak: …”),
 *      Grunt; P4 szczegóły źródła rozwijane w wierszu (zastępują sekcje pod werdyktem);
 *  P5  krótkie wartości, źródło zapasowe EEA jako znacznik; P7 jedna linia stanu źródeł; P8 „Szczegóły i źródła”;
 *  P10 szkielet wartości w trakcie ładowania.
 * Każde działanie wywołuje tę samą funkcję co dotąd — zmienia się miejsce, nie logika.
 */

const NO_LAYERS = Object.freeze({ layers: [] });

/** Krótka powierzchnia: ha z dwoma miejscami albo m² dla działek poniżej 1 ha (pełny zapis w dymku). */
export function shortArea(squareMeters) {
    const n = Number(squareMeters);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 10000) return `${(n / 10000).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
    return `${Math.round(n).toLocaleString('pl-PL')} m²`;
}

const firstField = (text, names) => {
    for (const name of names) {
        const m = String(text ?? '').match(new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'mi'));
        if (m) return m[1].trim();
    }
    return null;
};
/** Krótka nazwa formy ochrony do wiersza (pełna w szczegółach i w dymku). */
export function shortProtectedName(name) {
    return String(name ?? '').replace(/\s+Park(?:u|iem)?\s+Narodow\w*/i, ' PN').replace(/\s+Park(?:u)?\s+Krajobrazow\w*/i, ' PK')
        .replace(/Obszar(?:y)?\s+Chronionego\s+Krajobrazu/i, 'OChK').replace(/^Park\s+Narodowy\s+/i, 'PN ').replace(/^Park\s+Krajobrazowy\s+/i, 'PK ')
        .replace(/^[Rr]ezerwat\s+przyrody\s+/, 'rez. ').trim();
}
/** Krótka własność lasu do wiersza. */
export function shortForestOwner(owner) {
    const v = String(owner ?? '');
    if (/parków narodowych/i.test(v)) return 'park narodowy';
    return v.replace(/,\s*poza LP$/, '');
}
/**
 * Ograniczenia: `keys` — źródła identyfikacji; `value` — krótka wartość przy trafieniu; `short` — nazwa w linii „Brak: …”.
 * Kolejność = kolejność wierszy.
 */
export const RESTRICTIONS = [
    { id: 'natura', keys: ['natura2000'], label: 'Natura 2000', short: 'Natura 2000', show: ['overlay.gdos.birds', 'overlay.gdos.habitats'],
        value: (l) => protectedAreaName(l[0]?.text)?.match(/PL[BHC]\d{6}/)?.[0] ?? 'w obszarze' },
    { id: 'protection', keys: ['gdos_protection'], label: 'Ochrona', short: 'formy ochrony',
        show: ['overlay.gdos.national', 'overlay.gdos.landscape', 'overlay.gdos.reserves', 'overlay.gdos.protected', 'overlay.gdos.ecological', 'overlay.gdos.complexes'],
        value: (l) => shortProtectedName(firstField(l[0]?.text, ['nazwa', 'name', 'NAZWA'])) || 'w obszarze' },
    { id: 'monument', keys: ['nid_immovable'], label: 'Zabytek', short: 'zabytek', show: ['overlay.nid.immovable'], value: () => 'w rejestrze' },
    { id: 'flood', keys: ['flood_mzpmrp', 'flood_risk'], label: 'Powódź', short: 'powódź', show: ['overlay.flood_river', 'overlay.flood_risk'],
        value: (l, by) => (by.get('flood_mzpmrp')?.status === 'ready' ? 'obszar zagrożenia' : 'strefa ryzyka') },
    { id: 'forest', keys: ['bdl_forest'], label: 'Las', short: 'las', show: ['overlay.forest.ownership'], value: (l) => shortForestOwner(forestOwner(l[0]?.text)) },
    { id: 'gzwp', keys: ['gzwp'], label: 'Wody podziemne', short: 'GZWP', show: ['overlay.pgi.gzwp'],
        value: (l) => { const nr = firstField(l[0]?.text, ['Nr GZWP', 'NrGZWP']); return nr ? `GZWP ${nr}` : 'GZWP'; } },
    { id: 'deposit', keys: ['pgi_deposits'], label: 'Złoże kopalin', short: 'złoże', show: ['overlay.pgi.deposits'], value: () => 'w złożu' },
    { id: 'mining', keys: ['pgi_miningareas'], label: 'Obszar górniczy', short: 'obszar górniczy', show: ['overlay.pgi.miningareas'], value: () => 'w obszarze' },
];
const RESTRICTION_KEYS = new Set(RESTRICTIONS.flatMap((r) => r.keys));
const PLANNING_KEYS = new Set(['mpzp', 'pog_adopted', 'pog_draft', 'pog_zones']);
const GROUND_KEYS = new Set(['egib_classes', 'kowr']);

/** Stan pozycji z kilku źródeł: yes / no / unknown / loading (jak verdictState). */
export function itemState(layers) {
    if (!layers.length) return 'none';
    if (layers.some((l) => l.status === 'ready' && !l.noClass)) return 'yes';
    if (layers.some((l) => l.status === 'loading')) return 'loading';
    if (layers.some((l) => l.status === 'error')) return 'unknown';
    return 'no';
}

function ShowOnMap({ ids }) {
    const layerManager = useService('layers');
    const overlays = useServiceSnapshot('layers', NO_LAYERS).layers;
    const present = ids.filter((id) => overlays.some((layer) => layer.id === id));
    if (!present.length) return null;
    const shown = present.every((id) => overlays.find((layer) => layer.id === id)?.visible);
    return h('button', { type: 'button', className: `pc-show${shown ? ' is-shown' : ''}`, disabled: shown || !layerManager,
        onClick: () => present.forEach((id) => layerManager?.setVisibility(id, true)) },
        h(shown ? Check : Eye, { size: 13, 'aria-hidden': true }), shown ? 'Warstwa na mapie' : 'Pokaż na mapie');
}

/** Wiersz wyniku: ikona stanu, nazwa, krótka wartość; rozwija się w miejscu (szczegóły źródła + „Pokaż na mapie”). */
function ResultRow({ label, value, state, details = [], show = [], eeaNote = null, onRetry = null, title = null }) {
    const icon = state === 'yes-plan' ? '✓' : state === 'warn' ? '!' : state === 'unknown' ? '?' : '';
    const valueNode = state === 'loading'
        ? h('span', { className: 'pc-skel', 'aria-label': 'sprawdzanie' })
        : h('span', { className: 'pc-value', title: title ?? value }, value, eeaNote ? h('sup', { className: 'pc-eea', title: eeaNote }, 'EEA') : null);
    const head = [h('span', { key: 'i', className: `pc-dot pc-dot--${state}`, 'aria-hidden': true }, icon), h('span', { key: 'l', className: 'pc-label' }, label), valueNode];
    const expandable = details.length > 0 || show.length > 0 || (state === 'unknown' && onRetry);
    if (!expandable) return h('div', { className: `pc-row pc-row--${state}`, 'data-state': state }, ...head, h('span', { className: 'pc-chev' }));
    return h('details', { className: `pc-row-wrap pc-row--${state}`, 'data-state': state },
        h('summary', { className: 'pc-row' }, ...head, h(ChevronRight, { size: 14, className: 'pc-chev', 'aria-hidden': true })),
        h('div', { className: 'pc-detail' },
            // Jeden blok — bez nagłówka (nazwa jest w wierszu); kilka (np. plan ogólny: akt, strefa) — z nazwą źródła.
            details.map((d, i) => h('div', { key: i, className: 'pc-detail-block' },
                d.title && details.length > 1 ? h('strong', null, d.title) : null,
                h('p', null, d.text))),
            eeaNote ? h('p', { className: 'pc-detail-note' }, eeaNote) : null,
            state === 'unknown' && onRetry ? h('button', { type: 'button', className: 'pc-show', onClick: onRetry }, h(RotateCw, { size: 13, 'aria-hidden': true }), 'Ponów sprawdzenie') : null,
            show.length ? h(ShowOnMap, { ids: show }) : null));
}

const detailOf = (layer) => (layer?.status === 'ready' && layer.text ? { title: layer.title, text: layer.text }
    : layer?.status === 'error' ? { title: layer.title, text: layer.error || 'Usługa nie odpowiedziała.' } : null);
const eeaOf = (layers) => layers.find((l) => l.fallback === 'eea')?.fallbackNote ?? null;

export function ParcelCard({ snapshot, manager, layers, onScreening }) {
    const dispatch = useAppDispatch();
    const parcels = useService('parcels');
    const registeredTools = useService('tools');
    const terrainService = useService('terrainProfile');
    const objects = useService('objects');
    const controller = useService('mapController');
    const toasts = useService('featureContext')?.toasts;
    const bySource = useMemo(() => new Map(layers.map((l) => [l.sourceKey, l])), [layers]);
    const parcel = snapshot.parcel;
    const fail = (error) => toasts?.show({ tone: 'danger', message: error instanceof Error ? error.message : String(error) });
    const retry = (ids) => void manager?.retryFailed(ids);

    // --- działania (P2): te same wywołania co dotychczasowe przyciski karty
    const addToProject = () => { try { return parcels?.addParcel(parcel) ?? null; } catch (error) { fail(error); return null; } };
    const run = {
        save: () => { if (addToProject()) dispatch(openPanel('objects')); },
        screening: () => onScreening?.(parcel),
        prices: () => {
            const c = snapshot.parcelCenterLonLat;
            if (controller && Array.isArray(c)) {
                const [cx, cy] = transform(c, 'EPSG:4326', 'EPSG:3857');
                const r = 500 / Math.cos(c[1] * Math.PI / 180);
                controller.fitExtent([cx - r, cy - r, cx + r, cy + r], { maxZoom: 18, duration: 250, padding: [24, 24, 24, 24] });
            }
            dispatch(openPanel('marketPrices'));
        },
        permits: () => dispatch(openPanel('buildingPermits')),
        server: () => dispatch(openPanel('vpsData')),
        buffer: async () => { if (!addToProject()) return; manager?.close(); await registeredTools?.activate('core.buffer'); },
        wz: async () => { const id = addToProject(); if (!id) return; try { objects?.select(id); } catch { /* zaznaczenie pomocnicze */ } manager?.close(); await registeredTools?.activate('core.wz.area'); },
        terrain: async () => { const id = addToProject(); if (!id) return; manager?.close(); await registeredTools?.activate('core.terrain.area'); await runTerrainFor(terrainService, id); },
        profile: async () => { await registeredTools?.activate('core.terrain.profile'); },
        model3d: () => void import('../../terrain3d/terrain3dTool.js').then((m) => m.openParcel3D(parcel)).catch(fail),
    };
    const menuItem = (label, onSelect, hint = null) => h(DropdownMenu.Item, { className: 'dropdown-item pc-menu-item', onSelect: () => { try { const r = onSelect(); if (r?.catch) r.catch(fail); } catch (error) { fail(error); } } },
        h('span', null, label), hint ? h('small', null, hint) : null);

    // --- Planowanie (zawsze)
    const mpzp = bySource.get('mpzp');
    const pogLayers = ['pog_adopted', 'pog_draft', 'pog_zones'].map((k) => bySource.get(k)).filter(Boolean);
    const mpzpState = !mpzp ? 'none' : mpzp.status === 'loading' ? 'loading' : mpzp.status === 'ready' ? 'yes-plan' : mpzp.status === 'error' && mpzp.code !== 'not_published' ? 'unknown' : 'no';
    const mpzpValue = !mpzp ? '' : mpzp.status === 'ready' ? 'obowiązuje' : mpzp.code === 'not_published' ? 'brak w integracji' : mpzp.status === 'error' ? 'nie sprawdzono' : 'brak planu';
    const pogRaw = pogLayers.length ? pogVerdict(bySource) : null;
    const pogState = !pogLayers.length ? 'none' : pogRaw?.[1] === 'loading' ? 'loading' : pogLayers.some((l) => l.status === 'ready') ? 'yes-plan' : pogLayers.some(isRetryableLayerError) ? 'unknown' : 'no';
    const pogValue = pogRaw ? String(pogRaw[0]).replace(/\s*\((\w+)\)$/, ' · $1') : '';
    const pogShow = bySource.get('pog_adopted')?.status === 'ready' || bySource.get('pog_zones')?.status === 'ready' ? ['overlay.pog.adopted', 'overlay.pog.zones'] : ['overlay.pog.draft', 'overlay.pog.draft.zones'];

    // --- Ograniczenia: osobno tylko to, co dotyczy; reszta w jednej linii
    const restrictions = RESTRICTIONS.map((r) => {
        const ls = r.keys.map((k) => bySource.get(k)).filter(Boolean);
        return { ...r, layers: ls, state: itemState(ls) };
    }).filter((r) => r.state !== 'none');
    const hits = restrictions.filter((r) => r.state === 'yes');
    const absent = restrictions.filter((r) => r.state === 'no');
    const unknown = restrictions.filter((r) => r.state === 'unknown');
    const loading = restrictions.filter((r) => r.state === 'loading');
    const absentEea = absent.some((r) => eeaOf(r.layers));

    // --- Grunt (19.52.0: bez pompy ciepła)
    const soil = bySource.get('egib_classes');
    const soilValue = soil?.status === 'ready' && !soil.noClass ? soilClass(soil.text) : null;
    const kowr = bySource.get('kowr');

    // --- Pozostałe trafienia (np. włączone warstwy) — wcześniej sekcja „Pozostałe dane”
    const known = new Set([...PLANNING_KEYS, ...RESTRICTION_KEYS, ...GROUND_KEYS, 'bdl_forest']);
    const others = layers.filter((l) => !known.has(l.sourceKey) && l.status === 'ready');

    // --- P7 stan źródeł
    const total = layers.length;
    const pending = layers.filter((l) => l.status === 'loading').length;
    const failed = layers.filter(isRetryableLayerError).length;
    const answered = total - pending - failed;

    const center = snapshot.parcelCenterLonLat;
    const point = Array.isArray(snapshot.coordinateLonLat) && snapshot.coordinateLonLat.every(Number.isFinite) ? `${snapshot.coordinateLonLat[1].toFixed(6)}° N, ${snapshot.coordinateLonLat[0].toFixed(6)}° E` : null;
    const point2180 = Array.isArray(snapshot.coordinate2180) && snapshot.coordinate2180.every(Number.isFinite) ? `X ${snapshot.coordinate2180[0].toFixed(2)}, Y ${snapshot.coordinate2180[1].toFixed(2)}` : null;
    const centerText = Array.isArray(center) && center.every(Number.isFinite) ? `${center[1].toFixed(6)}° N, ${center[0].toFixed(6)}° E` : null;
    const area = shortArea(snapshot.parcelAreaSqm);
    const titleText = snapshot.zoneOnly ? 'Wskazany punkt' : parcel?.parcel ? `Działka ${parcel.parcel}` : snapshot.parcelBusy ? 'Działka…' : 'Wskazany punkt';
    // Obręb bez nazwy (sam numer, np. „089”) — z dopiskiem „obręb”.
    const region = parcel?.region ? (/^\d+$/.test(parcel.region) ? `obręb ${parcel.region}` : parcel.region) : null;
    const sub = [area, region, parcel?.commune ? `gm. ${parcel.commune}` : null].filter(Boolean).join(' · ');

    return h('div', { className: 'parcel-card' },
        // P1 + P2
        h('header', { className: 'pc-head' },
            h('h2', { className: 'pc-title' }, titleText),
            sub ? h('div', { className: 'pc-sub', title: snapshot.parcelAreaSqm ? formatParcelArea(snapshot.parcelAreaSqm) : sub }, sub) : null,
            !snapshot.zoneOnly && !parcel && !snapshot.parcelBusy ? h('p', { className: 'pc-note' }, snapshot.parcelError ? 'Nie udało się odczytać działki — wyniki dotyczą samego punktu.' : 'W tym punkcie nie odczytano działki — wyniki dotyczą samego punktu.') : null,
            !snapshot.zoneOnly && parcel?.wkt ? h('div', { className: 'pc-actions' },
                h('button', { type: 'button', className: 'pc-btn pc-btn--primary', title: 'Raport działki PDF — szablony i zakres do wyboru', onClick: () => reportDialog.open(parcel) }, 'Raport PDF'),
                h('button', { type: 'button', className: 'pc-btn', title: 'Dodaj granicę działki do projektu (panel Obiekty)', onClick: run.save }, 'Do projektu'),
                h(DropdownMenu.Root, null,
                    h(DropdownMenu.Trigger, { asChild: true }, h('button', { type: 'button', className: 'pc-btn', 'aria-label': 'Analizy działki' }, 'Analizy', h(ChevronDown, { size: 13, 'aria-hidden': true }))),
                    h(DropdownMenu.Portal, null, h(DropdownMenu.Content, { className: 'dropdown-content pc-menu', align: 'end', sideOffset: 5 },
                        onScreening ? menuItem('Otoczenie działki', run.screening, 'screening') : null,
                        menuItem('Ceny transakcyjne', run.prices),
                        menuItem('Budowy i pozwolenia', run.permits),
                        menuItem('Analiza działki (serwer)', run.server),
                        h(DropdownMenu.Separator, { className: 'dropdown-separator' }),
                        menuItem('Bufor', run.buffer, 'B'),
                        menuItem('Obszar analizowany WZ', run.wz, 'Z'),
                        menuItem('Wysokości i nachylenie', run.terrain),
                        menuItem('Profil terenu', run.profile),
                        menuItem('Teren 3D', run.model3d))))) : null),
        // P3/P4 Planowanie
        h('section', { className: 'pc-group', 'aria-label': 'Planowanie' },
            h('h3', { className: 'pc-group-title' }, 'Planowanie'),
            mpzp ? h(ResultRow, { label: 'MPZP', value: mpzpValue, state: mpzpState, details: [detailOf(mpzp)].filter(Boolean), show: ['overlay.mpzp'], onRetry: () => retry([mpzp.id]) }) : null,
            pogLayers.length ? h(ResultRow, { label: 'Plan ogólny', value: pogValue, state: pogState, details: pogLayers.map(detailOf).filter(Boolean), show: pogShow, title: pogRaw?.[3] ?? null, onRetry: () => retry(pogLayers.filter(isRetryableLayerError).map((l) => l.id)) }) : null),
        // P3/P4 Ograniczenia
        restrictions.length ? h('section', { className: 'pc-group', 'aria-label': 'Ograniczenia' },
            h('h3', { className: 'pc-group-title' }, hits.length ? `Ograniczenia · ${hits.length}` : 'Ograniczenia'),
            hits.map((r) => h(ResultRow, { key: r.id, label: r.label, value: r.value(r.layers.filter((l) => l.status === 'ready'), bySource), state: 'warn',
                details: r.layers.map(detailOf).filter(Boolean), show: r.show, eeaNote: eeaOf(r.layers) })),
            unknown.map((r) => h(ResultRow, { key: r.id, label: r.label, value: 'nie sprawdzono', state: 'unknown', show: r.show,
                details: r.layers.map(detailOf).filter(Boolean), onRetry: () => retry(r.layers.filter(isRetryableLayerError).map((l) => l.id)) })),
            absent.length ? h('div', { className: 'pc-absent', title: absentEea ? eeaOf(absent.flatMap((r) => r.layers)) : 'Usługi odpowiedziały i nie znalazły tych ograniczeń w punkcie wskazania.' },
                h('span', { className: 'pc-dot pc-dot--no', 'aria-hidden': true }),
                h('span', null, 'Brak: ', absent.map((r, i) => [i ? ', ' : '', r.short, eeaOf(r.layers) ? h('sup', { key: `e${r.id}`, className: 'pc-eea' }, 'EEA') : null]))) : null,
            loading.length ? h('div', { className: 'pc-absent pc-absent--loading' }, h('span', { className: 'pc-skel pc-skel--dot', 'aria-hidden': true }), h('span', null, `Sprawdzam: ${loading.map((r) => r.short).join(', ')}`)) : null) : null,
        // Grunt
        soil || (kowr && kowr.status === 'ready') ? h('section', { className: 'pc-group', 'aria-label': 'Grunt' },
            h('h3', { className: 'pc-group-title' }, 'Grunt'),
            soil ? h(ResultRow, { label: 'Klasa gruntu', value: soil.status === 'loading' ? '' : soilValue ?? (soil.status === 'error' ? 'nie sprawdzono' : 'brak w usłudze'),
                state: soil.status === 'loading' ? 'loading' : soilValue ? 'info' : 'unknown', details: [detailOf(soil)].filter(Boolean), show: ['overlay.egib.arable-classes'],
                title: soilValue ? null : 'Ewidencja nie podała klasy w tym punkcie (zależy od publikacji powiatu).', onRetry: soil.status === 'error' ? () => retry([soil.id]) : null }) : null,
            kowr?.status === 'ready' ? h(ResultRow, { label: 'Zasób KOWR', value: 'w zasobie', state: 'warn', details: [detailOf(kowr)].filter(Boolean), show: ['overlay.kowr.parcels'] }) : null) : null,
        others.length ? h('section', { className: 'pc-group', 'aria-label': 'Włączone warstwy' },
            h('h3', { className: 'pc-group-title' }, 'Włączone warstwy'),
            others.map((l) => h(ResultRow, { key: l.id, label: l.title, value: 'jest', state: 'info', details: [detailOf(l)].filter(Boolean) }))) : null,
        // P6 W okolicy (bez zmian w treści)
        !snapshot.zoneOnly && parcel?.wkt && center ? h(Nearby, { center }) : null,
        // P8 Szczegóły i źródła
        h('details', { className: 'pc-more' },
            h('summary', null, h('span', null, 'Szczegóły i źródła'), h(ChevronRight, { size: 14, className: 'pc-chev', 'aria-hidden': true })),
            h('div', { className: 'pc-facts' },
                parcel?.id ? h(Fact, { label: 'Identyfikator', value: parcel.id, wide: true, copy: true }) : null,
                parcel ? h(Fact, { label: 'Powiat', value: parcel.county || '—' }) : null,
                parcel ? h(Fact, { label: 'Województwo', value: parcel.voivodeship || '—' }) : null,
                snapshot.parcelAreaSqm ? h(Fact, { label: 'Powierzchnia', value: formatParcelArea(snapshot.parcelAreaSqm), wide: true }) : null,
                point ? h(Fact, { label: 'Wskazany punkt (WGS84)', value: point, wide: true, copy: true }) : null,
                point2180 ? h(Fact, { label: 'Wskazany punkt (EPSG:2180)', value: point2180, wide: true, copy: true }) : null,
                centerText ? h(Fact, { label: 'Środek działki (WGS84)', value: centerText, wide: true, copy: true }) : null),
            h('p', { className: 'pc-help' }, 'Wyniki planowania, gruntów i ograniczeń dotyczą punktu wskazania. Nie określają udziału powierzchni klas ani przecięć całej działki — to liczy Raport PDF.'),
            h('div', { className: 'pc-sources', role: 'list', 'aria-label': 'Wszystkie źródła' }, layers.map((layer) => h(SummaryRow, { key: layer.id, layer, onRetry: retry })))),
        // P7 jedna linia stanu źródeł
        total ? h('div', { className: 'pc-status', role: 'status' },
            h('span', { title: `${answered} z ${total} źródeł odpowiedziało${failed ? `, ${failed} bez odpowiedzi` : ''}` }, pending ? `Sprawdzam… ${total - pending}/${total}` : `Źródła: ${answered}/${total}`,
                failed ? h('b', null, ` · ${failed} bez odpowiedzi`) : null),
            failed && !pending ? h('button', { type: 'button', onClick: () => manager?.retryFailed() }, 'Ponów') : null) : null,
        snapshot.error ? h('p', { className: 'pc-note pc-note--error' }, snapshot.error) : null);
}
