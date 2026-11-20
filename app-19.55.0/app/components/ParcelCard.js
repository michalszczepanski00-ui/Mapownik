import { createElement as h, Fragment, useMemo } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, ChevronRight, Eye, RotateCw } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { formatParcelArea } from '../../core/units.js';
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

/** 19.55.0: oznaczenie obszaru uzupełnienia zabudowy z odpowiedzi planu ogólnego („Oznaczenie: 93OUZ”, „Symbol: OUZ”) albo null. */
export function ouzMark(text) {
    const value = String(text ?? '');
    const mark = value.match(/^\s*Oznaczenie:\s*(\S*OUZ\S*)\s*$/mi);
    if (mark) return mark[1];
    return /^\s*Symbol:\s*OUZ\s*$/mi.test(value) ? 'OUZ' : null;
}

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

/**
 * @param {object} props
 * @param {boolean} [props.headless] 19.53.0: telefon — bez nagłówka i przycisków (ma je arkusz karty), te same grupy wyników.
 */
export function ParcelCard({ snapshot, manager, layers, onScreening = null, headless = false }) {
    const features = useService('features');
    const ctx = useService('featureContext');
    const bySource = useMemo(() => new Map(layers.map((l) => [l.sourceKey, l])), [layers]);
    const parcel = snapshot.parcel;
    const retry = (ids) => void manager?.retryFailed(ids);

    // --- działania (P2): z rejestru akcji (19.53.0, strefy inspector.*; deklaracje w features/builtin/parcelActionsFeature.js)
    const actions = features?.actions;
    const zone = (name) => (actions?.list(name, ctx) ?? []).filter((action) => onScreening || action.id !== 'parcel.screening');
    const runAction = (action) => actions?.run(action.id, ctx);
    const menuItems = zone('inspector.analyses').flatMap((action, index) => [
        action.separatorBefore && index > 0 ? h(DropdownMenu.Separator, { key: `${action.id}-sep`, className: 'dropdown-separator' }) : null,
        h(DropdownMenu.Item, { key: action.id, className: 'dropdown-item pc-menu-item', 'data-action-id': action.id, onSelect: () => runAction(action) },
            h('span', null, action.label), action.hint ? h('small', null, action.hint) : null),
    ]).filter(Boolean);
    const actionButton = (action, primary) => h('button', { key: action.id, type: 'button', className: `pc-btn${primary ? ' pc-btn--primary' : ''}`, 'data-action-id': action.id,
        title: action.hint ?? action.label, onClick: () => runAction(action) }, action.label);

    // --- Planowanie (zawsze)
    const mpzp = bySource.get('mpzp');
    const pogLayers = ['pog_adopted', 'pog_draft', 'pog_zones'].map((k) => bySource.get(k)).filter(Boolean);
    const mpzpState = !mpzp ? 'none' : mpzp.status === 'loading' ? 'loading' : mpzp.status === 'ready' ? 'yes-plan' : mpzp.status === 'error' && mpzp.code !== 'not_published' ? 'unknown' : 'no';
    const mpzpValue = !mpzp ? '' : mpzp.status === 'ready' ? 'obowiązuje' : mpzp.code === 'not_published' ? 'brak w integracji' : mpzp.status === 'error' ? 'nie sprawdzono' : 'brak planu';
    const pogRaw = pogLayers.length ? pogVerdict(bySource) : null;
    const pogState = !pogLayers.length ? 'none' : pogRaw?.[1] === 'loading' ? 'loading' : pogLayers.some((l) => l.status === 'ready') ? 'yes-plan' : pogLayers.some(isRetryableLayerError) ? 'unknown' : 'no';
    const pogValue = pogRaw ? String(pogRaw[0]).replace(/\s*\((\w+)\)$/, ' · $1') : '';
    const pogShow = bySource.get('pog_adopted')?.status === 'ready' || bySource.get('pog_zones')?.status === 'ready' ? ['overlay.pog.adopted', 'overlay.pog.zones'] : ['overlay.pog.draft', 'overlay.pog.draft.zones'];
    // 19.55.0: obszar uzupełnienia zabudowy (OUZ) — odpowiedź planu ogólnego zawiera „Symbol: OUZ”, gdy punkt leży w obszarze.
    // Wiersz tylko tam, gdzie w punkcie jest plan ogólny (uchwalony albo projekt); bez planu pojęcie nie ma zastosowania.
    const ouzAdopted = bySource.get('pog_adopted')?.status === 'ready' ? ouzMark(bySource.get('pog_adopted').text) : null;
    const ouzDraft = bySource.get('pog_draft')?.status === 'ready' ? ouzMark(bySource.get('pog_draft').text) : null;
    const pogHere = pogLayers.some((l) => l.status === 'ready');
    const ouz = ouzAdopted ?? ouzDraft;
    const ouzFromDraft = !ouzAdopted && Boolean(ouzDraft);

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
    // 19.54.0: „Janowo, gm. Starogard Gdański” — położenie w osobnej linii (dawniej ucinane po kropkach).
    const place = [region, parcel?.commune ? `gm. ${parcel.commune}` : null].filter(Boolean).join(', ');
    const fraction = !snapshot.zoneOnly && parcel?.parcel && /^[^/\s]+\/[^/\s]+$/.test(String(parcel.parcel)) ? String(parcel.parcel).split('/') : null;

    const note = !snapshot.zoneOnly && !parcel && !snapshot.parcelBusy ? h('p', { className: 'pc-note' }, snapshot.parcelError ? 'Nie udało się odczytać działki — wyniki dotyczą samego punktu.' : 'W tym punkcie nie odczytano działki — wyniki dotyczą samego punktu.') : null;
    return h('div', { className: `parcel-card${headless ? ' parcel-card--headless' : ''}` },
        // P1 + P2
        headless ? note : h('header', { className: 'pc-head' },
            // 19.54.0 (audyt, „jeden wyrazisty element”): numer działki zapisany jak na mapie ewidencyjnej —
            // ułamkiem (27 nad kreską, 1 pod nią); obok powierzchnia i położenie w dwóch liniach, bez skracania.
            fraction
                ? h('div', { className: 'pc-ident' },
                    h('h2', { className: 'pc-title pc-title--fraction' },
                        h('span', { className: 'visually-hidden' }, titleText),
                        h('span', { className: 'pc-num', 'aria-hidden': true }, h('span', { className: 'pc-num-top' }, fraction[0]), h('span', { className: 'pc-num-bot' }, fraction[1]))),
                    h('div', { className: 'pc-place' },
                        area ? h('div', { className: 'pc-area', title: snapshot.parcelAreaSqm ? formatParcelArea(snapshot.parcelAreaSqm) : null }, area) : null,
                        place ? h('div', { className: 'pc-where' }, place) : null))
                : h(Fragment, null,
                    h('h2', { className: 'pc-title' }, titleText),
                    sub ? h('div', { className: 'pc-sub', title: snapshot.parcelAreaSqm ? formatParcelArea(snapshot.parcelAreaSqm) : sub }, sub) : null),
            note,
            !snapshot.zoneOnly && parcel?.wkt ? h('div', { className: 'pc-actions' },
                zone('inspector.primary').map((action) => actionButton(action, true)),
                zone('inspector.secondary').map((action) => actionButton(action, false)),
                menuItems.length ? h(DropdownMenu.Root, null,
                    h(DropdownMenu.Trigger, { asChild: true }, h('button', { type: 'button', className: 'pc-btn', 'aria-label': 'Analizy działki' }, 'Analizy', h(ChevronDown, { size: 13, 'aria-hidden': true }))),
                    h(DropdownMenu.Portal, null, h(DropdownMenu.Content, { className: 'dropdown-content pc-menu', align: 'end', sideOffset: 5 }, menuItems))) : null) : null),
        // P3/P4 Planowanie
        h('section', { className: 'pc-group', 'aria-label': 'Planowanie' },
            h('h3', { className: 'pc-group-title' }, 'Planowanie'),
            mpzp ? h(ResultRow, { label: 'MPZP', value: mpzpValue, state: mpzpState, details: [detailOf(mpzp)].filter(Boolean), show: ['overlay.mpzp'], onRetry: () => retry([mpzp.id]) }) : null,
            pogLayers.length ? h(ResultRow, { label: 'Plan ogólny', value: pogValue, state: pogState, details: pogLayers.map(detailOf).filter(Boolean), show: pogShow, title: pogRaw?.[3] ?? null, onRetry: () => retry(pogLayers.filter(isRetryableLayerError).map((l) => l.id)) }) : null,
            pogHere ? h(ResultRow, { label: 'Uzupełnienie zabudowy', value: ouz ? `w obszarze${ouzFromDraft ? ' (projekt)' : ''} · ${ouz}` : 'poza obszarem', state: ouz ? 'yes-plan' : 'no',
                title: ouz ? 'Obszar uzupełnienia zabudowy (OUZ) z planu ogólnego — tylko w nim można uzyskać decyzję o warunkach zabudowy po wejściu planu w życie.' : 'Punkt nie leży w obszarze uzupełnienia zabudowy wyznaczonym w planie ogólnym.',
                details: [{ title: 'Obszar uzupełnienia zabudowy', text: ouz ? `Oznaczenie w planie ogólnym: ${ouz}${ouzFromDraft ? ' (projekt planu, przed uchwaleniem)' : ''}. Decyzję o warunkach zabudowy po wejściu planu ogólnego wydaje się tylko w obszarze uzupełnienia zabudowy.` : 'W tym punkcie plan ogólny nie wyznacza obszaru uzupełnienia zabudowy. Po wejściu planu w życie decyzji o warunkach zabudowy nie wyda się tu bez planu miejscowego.' }],
                show: ouzFromDraft || (!ouzAdopted && bySource.get('pog_draft')?.status === 'ready' && bySource.get('pog_adopted')?.status !== 'ready') ? ['overlay.pog.draft.ouz'] : ['overlay.pog.ouz'] }) : null),
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
