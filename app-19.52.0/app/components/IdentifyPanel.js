import { runTerrainFor } from '../../terrain/runTerrainFor.js';
import { cachedJson } from '../../core/apiCache.js';
import { RCN_DEFAULTS, medianReliable, radiusLabel, yearsLabel } from '../../core/rcnDefaults.js';
import { createElement as h, memo, useEffect, useMemo, useState } from 'react';
import { transform } from 'ol/proj.js';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Copy, Download, Eye, LoaderCircle, Info, Pin, Minus, RotateCw, ScanSearch, X } from 'lucide-react';
import { reportDialog } from './reportDialogStore.js';
import { IconButton } from './IconButton.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { Button, EmptyState, Message, PanelMinimized, PanelShell } from '../ui/index.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { openPanel, useAppDispatch } from '../../store/index.js';
import { t, tn } from '../../i18n/index.js';
import { formatParcelArea } from '../../core/units.js';
import { ParcelCard } from './ParcelCard.js';

const formatArea = (value) => formatParcelArea(value);
export function Fact({ label, value, wide = false, copy = false }) {
    const [copied, setCopied] = useState(false);
    const valid = value !== '—' && value !== '…' && value != null;
    const copyValue = async () => {
        try {
            await navigator.clipboard.writeText(String(value));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        } catch { setCopied(false); }
    };
    return h('div', { className: `identify-fact${wide ? ' identify-fact--wide' : ''}` },
        h('span', null, label), h('div', { className: 'identify-fact-value' }, h('strong', { title: String(value) }, value),
            copy && valid ? h('button', { type: 'button', onClick: copyValue, title: copied ? t('identify.copied') : t('identify.copy', { label }), 'aria-label': copied ? t('identify.copied') : t('identify.copy', { label }) }, h(copied ? Check : Copy, { size: 13 })) : null));
}
// Symbole stref planu ogólnego (rozporządzenie w sprawie planu ogólnego gminy); nazwy w katalogu tekstów.
const ZONE_SYMBOLS = ['SW', 'SJ', 'SZ', 'SU', 'SH', 'SP', 'SR', 'SI', 'SN', 'SC', 'SG', 'SO', 'SK'];
function zoneLabel(layer) {
    if (layer.sourceKey !== 'pog_zones' || layer.status !== 'ready') return layer.title;
    const match = String(layer.text ?? '').match(/\b(?:\d{1,4})?(SW|SJ|SZ|SU|SH|SP|SR|SI|SN|SC|SG|SO|SK)\b/i);
    const symbol = match?.[0]?.toUpperCase();
    const name = match && ZONE_SYMBOLS.includes(match[1].toUpperCase()) ? t(`identify.zone.${match[1].toUpperCase()}`) : null;
    return name ? `${name} (${symbol})` : layer.title;
}
function layerStatusText(status) {
    if (status === 'loading') return '…';
    if (status === 'ready') return t('identify.status.yes');
    if (status === 'empty') return t('identify.status.none');
    return t('identify.status.error');
}
/** 18.12.1: krótki, zrozumiały powód błędu zamiast surowego tekstu serwera. */
/** 19.43.0: „gmina nie publikuje danych” to nie awaria — nie liczy się do „źródła nie odpowiadają” i nie ma „Ponów”. */
export const isRetryableLayerError = (layer) => layer.status === 'error' && layer.code !== 'not_published';
export function errorShort(layer) {
    if (layer.code === 'not_published') return t('identify.err.notPublished');
    if (layer.code === 'timeout') return t('identify.err.timeout');
    if (layer.code === 'unavailable') return t('identify.err.unavailable');
    return t('identify.err.generic');
}
export function SummaryRow({ layer, onRetry }) {
    const preview = layer.status === 'ready' ? layer.text
        : layer.status === 'error' ? errorShort(layer)
            : layer.status === 'loading' ? t('identify.loading') : null;
    return h('details', { className: `parcelplus-row parcelplus-row--${layer.status}`, key: layer.id, open: false },
        h('summary', null,
            h('span', { className: `identify-layer-dot identify-layer-dot--${layer.status}` }),
            h('span', { className: 'identify-layer-copy' },
                h('strong', null, zoneLabel(layer)),
                preview ? h('small', { className: 'identify-layer-preview' }, preview) : null),
            h('span', { className: `parcelplus-status parcelplus-status--${layer.status}` }, layerStatusText(layer.status))
        ),
        layer.status === 'loading' ? h('div', { className: 'identify-layer-detail identify-loading' }, h(LoaderCircle, { size: 12, className: 'is-spinning' }), t('identify.loading')) : null,
        layer.status === 'ready' ? h('p', { className: 'identify-layer-detail' }, layer.text) : null,
        layer.status === 'empty' ? h('div', { className: 'identify-layer-detail identify-empty' }, t('identify.noData')) : null,
        layer.status === 'error' ? h('div', { className: 'identify-layer-detail identify-error' },
            h('span', null, errorShort(layer)),
            onRetry ? h(Button, { size: 'sm', variant: 'secondary', icon: h(RotateCw, { size: 13 }), onClick: () => onRetry([layer.id]) }, t('identify.retryOne')) : null) : null
    );
}
// 18.12.2: podsumowanie na górze wyniku — najważniejsze odpowiedzi w jednym
// rzucie oka, szczegóły niżej w sekcjach.
const VERDICT = [
    // 19.12.0: `show` — warstwy, które włącza „Pokaż na mapie” przy znalezionym planie.
    { key: 'mpzp', labelKey: 'identify.verdict.mpzp', ready: ['identify.verdict.mpzp.yes', 'info'], empty: ['identify.verdict.plan.none', 'neutral'], show: ['overlay.mpzp'] },
    { key: 'pog_adopted', labelKey: 'identify.verdict.pog', ready: ['identify.verdict.pog.yes', 'info'], empty: ['identify.verdict.plan.none', 'neutral'], show: ['overlay.pog.adopted', 'overlay.pog.zones'] },
    // 19.48.0: `show` dla każdego wiersza — warstwa na mapie, którą włącza oko (kolumna oka zawsze wyrównana).
    { key: 'natura2000', labelKey: 'identify.verdict.natura', ready: ['identify.verdict.inside', 'warning'], empty: ['identify.verdict.outside', 'ok'], show: ['overlay.gdos.birds', 'overlay.gdos.habitats'] },
    { key: 'gdos_protection', labelKey: 'identify.verdict.protection', ready: ['identify.verdict.inside', 'warning'], empty: ['identify.verdict.outside', 'ok'], show: ['overlay.gdos.national', 'overlay.gdos.landscape', 'overlay.gdos.reserves', 'overlay.gdos.protected', 'overlay.gdos.ecological', 'overlay.gdos.complexes'] },
    // 19.50.0: zabytek (rejestr NID) i powódź (obszar zagrożenia albo strefa ryzyka).
    { key: 'nid_immovable', labelKey: 'identify.verdict.monument', ready: ['identify.verdict.monument.yes', 'warning'], empty: ['identify.verdict.monument.no', 'ok'], show: ['overlay.nid.immovable'] },
    { key: 'flood_mzpmrp', keys: ['flood_mzpmrp', 'flood_risk'], labelKey: 'identify.verdict.flood', ready: ['identify.verdict.flood.hazard', 'warning'], empty: ['identify.verdict.flood.none', 'ok'], show: ['overlay.flood_river', 'overlay.flood_risk'] },
    { key: 'egib_classes', labelKey: 'identify.verdict.soil', ready: ['identify.verdict.read', 'info'], empty: ['identify.verdict.none', 'neutral'], show: ['overlay.egib.arable-classes'] },
    // 19.37.0: „Czyj las” (Bank Danych o Lasach).
    { key: 'bdl_forest', labelKey: 'identify.verdict.forest', ready: ['identify.verdict.read', 'info'], empty: ['identify.verdict.forest.none', 'neutral'], show: ['overlay.forest.ownership'] },
];
const SOIL_CLASS = /\b(?:R|Ł|Ps|Ls|Lz|N|W|B|Ba|Bi|Bp|Bz|dr|Tk|Ti|Tp|Wsr|Lzr|Psr|Br|S)(?:-?(?:I{1,3}|IV|V|VI)[ab]?)?\b/u;
/** 19.46.0: symbol strefy planu ogólnego z opisu („Oznaczenie: 4SU”). */
function zoneSymbol(text) {
    const m = String(text ?? '').match(new RegExp(`^\\s*Oznaczenie:\\s*(\\d*(?:${ZONE_SYMBOLS.join('|')}))\\s*$`, 'mi'));
    return m ? m[1].toUpperCase() : null;
}
/**
 * 19.46.0: plan ogólny w podsumowaniu z trzech źródeł — uchwalony, projektowany i strefy.
 * Wcześniej liczył się tylko uchwalony, więc przy projekcie w opracowaniu u góry było „brak planu”,
 * a niżej w sekcji Planowanie — projekt ze strefą.
 */
/** 19.50.0: powódź — obszar zagrożenia (MZP) ma pierwszeństwo przed samą strefą ryzyka (MRP). */
export function floodVerdict(bySource) {
    const hazard = bySource.get('flood_mzpmrp'); const risk = bySource.get('flood_risk');
    const all = [hazard, risk].filter(Boolean);
    if (hazard?.status === 'ready') return [t('identify.verdict.flood.hazard'), 'warning', false, t('identify.verdict.ready.title')];
    if (risk?.status === 'ready') return [t('identify.verdict.flood.risk'), 'warning', false, t('identify.verdict.flood.risk.title')];
    if (all.some((l) => l.status === 'loading')) return ['…', 'loading'];
    if (all.some((l) => l.status === 'error')) return [t('identify.verdict.unknown'), 'warning', false, t('identify.verdict.unknown.title')];
    return [t('identify.verdict.flood.none'), 'ok', false, t('identify.verdict.flood.none.title')];
}
export function pogVerdict(bySource) {
    const adopted = bySource.get('pog_adopted'); const draft = bySource.get('pog_draft'); const zones = bySource.get('pog_zones');
    const all = [adopted, draft, zones].filter(Boolean);
    const ready = (l) => l?.status === 'ready';
    const symbol = zoneSymbol(zones?.text) ?? zoneSymbol(adopted?.text) ?? zoneSymbol(draft?.text);
    const withZone = (text) => (symbol ? `${text} (${symbol})` : text);
    if (ready(adopted) || (ready(zones) && !/opracowan|projekt/i.test(zones.text ?? ''))) return [withZone(t('identify.verdict.pog.yes')), 'info', false, t('identify.verdict.ready.title')];
    if (ready(draft) || ready(zones)) return [withZone(t('identify.verdict.pog.draft')), 'info', false, t('identify.verdict.pog.draft.title')];
    if (all.some((l) => l.status === 'loading')) return ['…', 'loading'];
    if (all.some((l) => l.status === 'error')) {
        const notPublished = all.filter((l) => l.status === 'error').every((l) => l.code === 'not_published');
        return notPublished ? [t('identify.verdict.notPublished'), 'warning', false, t('identify.err.notPublished')] : [t('identify.verdict.unknown'), 'warning', false, t('identify.verdict.unknown.title')];
    }
    return [t('identify.verdict.plan.none'), 'neutral', false, t('identify.verdict.empty.title')];
}
/**
 * 19.46.0: odpowiedź ewidencji bez klasy gruntu (np. sam identyfikator i grupa rejestrowa) to nie trafienie —
 * w sekcji Grunty liczy się jako „bez wyniku”, a w podsumowaniu jest „brak w usłudze”.
 */
export function normalizeLayer(layer) {
    if (layer?.sourceKey === 'egib_classes' && layer.status === 'ready' && !soilClass(layer.text)) return { ...layer, status: 'empty', noClass: true };
    return layer;
}
/** 19.50.0: wynik z danych zapasowych EEA (GDOŚ nie odpowiedział) — dopisek i opis w dymku. */
function withFallback(layer, value) {
    if (layer?.fallback !== 'eea') return value;
    const [text, tone, named, title] = value;
    return [`${text} · dane EEA`, tone, named, layer.fallbackNote || title];
}
function verdictValue(item, layer) {
    if (!layer || layer.status === 'loading') return ['…', 'loading'];
    if (item.key === 'egib_classes' && layer.noClass) return [t('identify.verdict.soil.noClass'), 'neutral', false, t('identify.verdict.soil.noClass.title')];
    // 19.5.0: błąd usługi ≠ brak wyniku. Wcześniej „brak danych” (obok „brak”) sugerował, że planu nie ma.
    if (layer.status === 'error' && layer.code === 'not_published') return [t('identify.verdict.notPublished'), 'warning', false, t('identify.err.notPublished')];
    if (layer.status === 'error') return [t('identify.verdict.unknown'), 'warning', false, t('identify.verdict.unknown.title')];
    // 19.8.5: klasa gruntu tylko wtedy, gdy usługa ją podała. Wcześniej każda odpowiedź
    // (także sam kod QR) dawała „odczytano”, choć klasy w niej nie było.
    if (layer.status === 'ready' && item.key === 'egib_classes') {
        const soil = soilClass(layer.text);
        return soil ? [soil, 'info', false, t('identify.verdict.ready.title')] : [t('identify.verdict.soil.noClass'), 'neutral', false, t('identify.verdict.soil.noClass.title')];
    }
    if (layer.status === 'ready' && item.key === 'bdl_forest') {
        const owner = forestOwner(layer.text);
        return [owner, 'info', false, 'Bank Danych o Lasach — szczegóły w sekcji Środowisko'];
    }
    const [text, tone] = layer.status === 'ready' ? item.ready : item.empty;
    const hint = t(layer.status === 'ready' ? 'identify.verdict.ready.title' : 'identify.verdict.empty.title');
    // 18.18.3: przy obszarach chronionych pokazujemy, W KTÓRYM obszarze jest punkt.
    if (layer.status === 'ready' && (item.key === 'natura2000' || item.key === 'gdos_protection')) {
        const name = protectedAreaName(layer.text);
        if (name) return withFallback(layer, [`${t(text)}: ${name}`, tone, true]);
    }
    return withFallback(layer, [t(text), tone, false, hint]);
}
/** 19.37.0: krótka nazwa własności lasu z odpowiedzi api/forest.php („Własność: …”). */
export function forestOwner(text) {
    const line = String(text ?? '').match(/^Własność:\s*(.+)$/m)?.[1] ?? '';
    if (/Lasy Państwowe/i.test(line)) return 'Lasy Państwowe';
    const cat = line.replace(/\s*\(las poza Lasami Państwowymi\)/, '').trim().toLowerCase();
    const map = { prywatne: 'prywatny', gminne: 'gminny', komunalne: 'gminny', powiatowe: 'powiatowy', wojewódzkie: 'wojewódzki' };
    return cat ? `${map[cat] ?? cat}, poza LP` : 'poza LP';
}
/** Klasa gruntu z opisu EGiB: pola „Oznaczenie użytku/konturu” albo symbol w tekście (np. „RIIIa”). */
export function soilClass(text) {
    const source = String(text ?? '');
    const field = (name) => source.match(new RegExp(`^\\s*Oznaczenie ${name}\\s*:\\s*(\\S[^\\n]*)$`, 'mi'))?.[1]?.trim() ?? '';
    const use = field('użytku');
    const contour = field('konturu');
    if (use || contour) return [...new Set([use, contour].filter(Boolean))].join(' · ');
    const lines = source.split('\n').filter((line) => /klas|użyt|kontur|ofu|ozu|ozk/i.test(line));
    for (const line of lines) {
        const match = line.split(':').slice(1).join(':').match(SOIL_CLASS);
        if (match) return match[0];
    }
    return null;
}
/** Kod i nazwa obszaru z opisu obiektu (np. „PLH220033 Dolna Wisła"). */
export function protectedAreaName(text) {
    const source = String(text ?? '');
    const code = source.match(/\bPL[BHC]\d{6}\b/)?.[0] ?? null;
    const name = source.match(/^\s*(?:nazwa|name|NAZWA)\s*[:=·]\s*['"]?([^\n·'"]{2,80})/mi)?.[1]?.trim() ?? null;
    return [code, name].filter(Boolean).join(' ') || null;
}
/**
 * 19.33.0 — „W okolicy”: krótka droga z karty działki do narzędzi Ceny i Budowy (prawa belka).
 * Pobierana jest tylko mediana cen gruntów (lekkie zapytanie, pamiętane na serwerze 3 dni); budowy otwiera przycisk —
 * lokalizacja inwestycji w ULDK nie rusza przy każdym kliknięciu działki.
 */
const nearbyZl = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
export function Nearby({ center }) {
    const dispatch = useAppDispatch();
    const controller = useService('mapController');
    // Ceny liczą transakcje w widoku mapy — przed otwarciem ustawiamy widok na promień 500 m wokół działki,
    // żeby liczby w narzędziu zgadzały się z tym wierszem.
    const openPrices = () => {
        if (controller && Array.isArray(center)) {
            const [cx, cy] = transform(center, 'EPSG:4326', 'EPSG:3857');
            const r = 500 / Math.cos(center[1] * Math.PI / 180);
            controller.fitExtent([cx - r, cy - r, cx + r, cy + r], { maxZoom: 18, duration: 250, padding: [24, 24, 24, 24] });
        }
        dispatch(openPanel('marketPrices'));
    };
    const [price, setPrice] = useState(null);
    useEffect(() => {
        if (!Array.isArray(center)) return undefined;
        const abort = new AbortController();
        setPrice(null);
        const [x, y] = transform(center, 'EPSG:4326', 'EPSG:2180');
        // 19.43.0: przez pamięć zapytań (ta sama działka, raport) z jednym ponowieniem przy błędzie przejściowym.
        // 19.46.0: te same parametry co zakładka Raport i porównanie działek (core/rcnDefaults.js).
        cachedJson(`./api/rcn.php?x=${x.toFixed(1)}&y=${y.toFixed(1)}&r=${RCN_DEFAULTS.radius}&kind=${RCN_DEFAULTS.kind}&years=${RCN_DEFAULTS.years}`, { signal: abort.signal, retry: 2 })
            .then((payload) => setPrice({ median: payload.stats?.medianPerM2 ?? null, count: payload.stats?.perM2Count ?? payload.marketCount ?? 0, reliable: medianReliable(payload.stats) }))
            .catch(() => { if (!abort.signal.aborted) setPrice('error'); });
        return () => abort.abort();
    }, [center?.[0], center?.[1]]);
    // 19.46.0: mediana z 1–2 transakcji nie jest pokazywana jako wynik (jedna sprzedaż to nie cena rynkowa okolicy).
    const priceText = price === null ? '…' : price === 'error' ? 'niedostępne' : !price.median ? 'brak transakcji'
        : price.reliable ? `${nearbyZl.format(price.median)} zł/m²` : `za mało (${price.count})`;
    const period = `${radiusLabel(RCN_DEFAULTS.radius)}, ${yearsLabel(RCN_DEFAULTS.years)}`;
    return h('section', { className: 'identify-nearby', 'aria-label': 'W okolicy działki' },
        h('span', { className: 'identify-nearby-title' }, `W okolicy (${period})`),
        h('button', { type: 'button', className: 'identify-nearby-item', title: price && price !== 'error' && price.median && !price.reliable
            ? `Tylko ${price.count} ${price.count === 1 ? 'transakcja' : 'transakcje'} w statystyce — za mało na medianę. Szczegóły w narzędziu Ceny transakcyjne.`
            : `Otwórz narzędzie Ceny transakcyjne (${period} wokół działki)`, onClick: openPrices },
            h('span', null, price && price !== 'error' && price.count && price.reliable ? `Grunty — mediana (${price.count} trans.)` : 'Grunty — mediana cen'),
            h('strong', null, priceText)),
        h('button', { type: 'button', className: 'identify-nearby-item', title: 'Otwórz narzędzie Budowy i pozwolenia dla tej działki', onClick: () => dispatch(openPanel('buildingPermits')) },
            h('span', null, 'Budowy i pozwolenia'), h('strong', null, 'Pokaż ›')));
}

/**
 * 19.48.0 — trzy stany wiersza werdyktu (ikona i kolor):
 *  yes — jest / dotyczy (✓, zieleń palety), no — nie dotyczy (○, szary), unknown — brak danych („?”, szary),
 *  oraz loading w trakcie odczytu. Wcześniej „brak w usłudze” miał ikonę jak „poza”, a „nie sprawdzono” — ostrzeżenie.
 */
export function verdictState(item, bySource) {
    const states = (item.key === 'pog_adopted' ? ['pog_adopted', 'pog_draft', 'pog_zones'] : (item.keys ?? [item.key])).map((key) => bySource.get(key)).filter(Boolean);
    if (!states.length) return 'loading';
    if (states.some((layer) => layer.status === 'ready' && !layer.noClass)) return 'yes';
    if (states.some((layer) => layer.status === 'loading')) return 'loading';
    if (states.some((layer) => layer.status === 'error' || layer.noClass)) return 'unknown';
    return 'no';
}
const VERDICT_STATE_LABEL = { yes: 'jest / dotyczy', no: 'nie dotyczy', unknown: 'brak danych', loading: 'sprawdzanie' };
export function Verdict({ layers }) {
    const layerManager = useService('layers');
    const overlays = useServiceSnapshot('layers', NO_LAYERS).layers;
    const bySource = new Map(layers.map((layer) => [layer.sourceKey, layer]));
    const items = VERDICT.filter((item) => bySource.has(item.key));
    if (!items.length) return null;
    return h('section', { className: 'identify-verdict', 'aria-label': t('identify.verdict.title'), title: t('identify.verdict.legend') },
        items.map((item) => {
            const [value, , wide, hint] = item.key === 'pog_adopted' ? pogVerdict(bySource) : item.key === 'flood_mzpmrp' ? floodVerdict(bySource) : verdictValue(item, bySource.get(item.key));
            const state = verdictState(item, bySource);
            // 19.48.0: oko przy każdym wierszu z warstwą (poza sprawdzaniem) — także „poza” da się sprawdzić na mapie.
            const found = state !== 'loading';
            // 19.46.0: przy samym projekcie planu ogólnego „Pokaż na mapie” włącza warstwę projektów.
            const showList = item.key === 'pog_adopted' && bySource.get('pog_adopted')?.status !== 'ready' && bySource.get('pog_zones')?.status !== 'ready' ? ['overlay.pog.draft', 'overlay.pog.draft.zones'] : (item.show ?? []);
            const showIds = found ? showList.filter((id) => overlays.some((layer) => layer.id === id)) : [];
            const shown = showIds.length > 0 && showIds.every((id) => overlays.find((layer) => layer.id === id)?.visible);
            return h('div', { key: item.key, className: `identify-verdict-item identify-verdict-item--state-${state}${wide ? ' identify-verdict-item--wide' : ''}`, title: `${VERDICT_STATE_LABEL[state]}${hint ? ` — ${hint}` : ''}`, 'data-state': state },
                h('span', null, t(item.labelKey)), h('strong', null, value),
                showIds.length > 0 ? h('button', {
                    type: 'button', className: `identify-verdict-show${shown ? ' is-shown' : ''}`, disabled: shown || !layerManager,
                    title: shown ? 'Warstwa jest włączona' : 'Pokaż na mapie',
                    'aria-label': shown ? 'Warstwa planu jest włączona' : `Pokaż na mapie: ${t(item.labelKey)}`,
                    onClick: (event) => { event.stopPropagation(); showIds.forEach((id) => layerManager?.setVisibility(id, true)); },
                }, h(shown ? Check : Eye, { size: 14, 'aria-hidden': true }))
                    // 19.48.0: pusta kolumna oka (wyrównanie wierszy).
                    : h('span', { className: 'identify-verdict-show is-placeholder', 'aria-hidden': true }));
        }));
}
const NO_LAYERS = Object.freeze({ layers: [] });
/**
 * 17.8.10 — uproszczony widok: sekcja domyślnie pokazuje tylko źródła, które
 * COŚ znalazły (albo wciąż się ładują, albo zwróciły błąd — to realne
 * informacje, nie „szum"). Źródła bez wyniku ("brak") są liczone, ale nie
 * wypisywane jedna po drugiej — zamiast tego jedna wyciszona linijka na
 * końcu sekcji, żeby było jasne, że zostały sprawdzone, a nie pominięte.
 * Kliknięcie tej linijki pokazuje pełną listę, gdyby ktoś jednak chciał
 * zobaczyć wszystko (np. do potwierdzenia negatywnego wyniku w dokumentacji).
 */
function Section({ title, layers, note = null, defaultOpen = false, onRetry = null }) {
    const [showAll, setShowAll] = useState(false);
    const [open, setOpen] = useState(defaultOpen);
    if (!layers.length) return null;
    const readyCount = layers.filter((layer) => layer.status === 'ready').length;
    const errorCount = layers.filter(isRetryableLayerError).length;
    const loadingCount = layers.filter((layer) => layer.status === 'loading').length;
    const visible = showAll ? layers : layers.filter((layer) => layer.status !== 'empty');
    const hiddenCount = layers.length - visible.length;
    const counts = [
        `${readyCount}/${layers.length}`,
        errorCount ? tn('identify.section.errorsN', errorCount) : null,
        loadingCount ? tn('identify.section.pendingN', loadingCount) : null,
    ].filter(Boolean).join(' · ');
    return h('details', { className: 'parcelplus-section', open, onToggle: (event) => setOpen(event.currentTarget.open) },
        h('summary', { className: 'parcelplus-section-head' }, h('strong', null, title), h('small', { title: counts }, counts)),
        h('div', { className: 'parcelplus-section-content' },
        note ? h('div', { className: 'parcelplus-note' }, note) : null,
        visible.length
            ? h('div', { className: 'parcelplus-list' }, visible.map((layer) => h(SummaryRow, { key: layer.id, layer, onRetry })))
            : h('div', { className: 'parcelplus-note parcelplus-note--empty' }, tn('identify.allEmpty', layers.length)),
        hiddenCount > 0
            ? h(Button, { variant: 'ghost', size: 'sm', className: 'parcelplus-more-toggle', onClick: () => setShowAll(true) }, tn('identify.showEmpty', hiddenCount))
            : null,
        showAll && hiddenCount === 0 && layers.some((layer) => layer.status === 'empty')
            ? h(Button, { variant: 'ghost', size: 'sm', className: 'parcelplus-more-toggle', onClick: () => setShowAll(false) }, t('identify.hideEmpty'))
            : null)
    );
}

export const IdentifyPanel = memo(function IdentifyPanel({ snapshot, manager, tools, onScreening = null, docked = false, window: win = null }) {
    // 18.9.11: geometria okna (styl i uchwyty) — tylko gdy panel jest odpięty.
    const shellWindow = docked || !win ? {} : {
        style: win.style, onDragStart: win.onDragStart, onResizeWidth: win.onResizeStart, onResizeHeight: win.onResizeHeightStart,
    };
    const [collapsed, setCollapsed] = useState(false);
    const parcels = useService('parcels');
    const registeredTools = useService('tools');
    const terrainService = useService('terrainProfile');
    const objects = useService('objects');
    const dispatch = useAppDispatch();
    const toasts = useService('featureContext')?.toasts;
    // 19.47.0: hook PRZED wczesnymi return (stan bez działki, zwinięty panel) — w 19.46.0 stał za nimi i przy
    // przełączeniu Sprawdź → Mierz React zgłaszał błąd #300 („mniej hooków niż poprzednio”), panel się wywracał.
    const layersAll = useMemo(() => (snapshot.layers ?? []).map(normalizeLayer), [snapshot.layers]);
    const actOnParcel = async (action) => { try { const id = parcels?.addParcel(snapshot.parcel); if (!id) return; if (action === 'buffer') { manager?.close(); await registeredTools?.activate('core.buffer'); } else if (action === 'terrain') { manager?.close(); await registeredTools?.activate('core.terrain.area'); await runTerrainFor(terrainService, id); } else dispatch(openPanel('objects')); } catch (error) { toasts?.show({ tone: 'danger', message: error instanceof Error ? error.message : String(error) }); } };
    if (!snapshot?.open) {
        // 18.9.11: pusty stan jest też w oknie — odpięty pusty panel nie znika.
        const title = t('panel.identify.title');
        return h(PanelShell, {
            className: 'identify-panel identify-panel--compact identify-panel--empty',
            label: title,
            docked,
            ...shellWindow,
            icon: h(Info, { size: 16 }),
            title,
            subtitle: t('identify.empty.subtitle'),
            actions: h(PanelHeaderActions, { id: 'identify' }),
        },
        h('div', { className: 'identify-panel-body' },
            h(EmptyState, { icon: h(Info, { size: 22 }), title: t('identify.empty.title') }, t('identify.empty.hint')),
            h(Button, { variant: 'primary', size: 'sm', className: 'identify-empty-action', onClick: () => void tools?.activate('core.identify') }, t('identify.empty.action'))));
    }
    if (collapsed) {
        return h(PanelMinimized, { className: 'identify-panel identify-panel--compact panel-minimized--identify', title: t('panel.identify.title'), label: t('identify.minimized'), restoreLabel: t('identify.restore'), icon: h(Info, { size: 18 }), onRestore: () => setCollapsed(false) });
    }
    const parcel = snapshot.parcel;
    const layers = layersAll;
    const planning = layers.filter((layer) => layer.section === 'planning');
    const grunts = layers.filter((layer) => layer.section === 'grunts');
    const environment = layers.filter((layer) => layer.section === 'environment' || (layer.section === 'geology' && layer.sourceKey !== 'kowr'));
    const geology = layers.filter((layer) => layer.section === 'geology');
    const utilities = layers.filter((layer) => layer.section === 'utilities');
    const active = layers.filter((layer) => layer.section === 'active');
    const title = snapshot.zoneOnly ? t('identify.title.zone') : parcel ? t('identify.title.parcel') : t('identify.title.place');
    const center = snapshot.parcelCenterLonLat;
    const queryKey = Array.isArray(snapshot.coordinate2180) ? snapshot.coordinate2180.join(',') : 'none';
    const sectionKey = (id) => `${id}:${queryKey}`;
    const coordinates = Array.isArray(center) && center.every(Number.isFinite) ? `${center[1].toFixed(6)}° N, ${center[0].toFixed(6)}° E` : null;
    const pending = snapshot.parcelBusy ? '…' : '—';
    // 18.12.1: zbiorczy komunikat i „Ponów”, gdy kilka źródeł naraz nie odpowiada.
    const failedCount = layers.filter(isRetryableLayerError).length + (snapshot.parcelError ? 1 : 0);
    const onRetry = (ids) => void manager?.retryFailed(ids);
    // 19.0.0: współrzędne punktu także w układzie projektu (EPSG:2180), w tym samym zapisie co „Kopiuj współrzędne".
    const point2180 = Array.isArray(snapshot.coordinate2180) && snapshot.coordinate2180.length >= 2 && snapshot.coordinate2180.every(Number.isFinite)
        ? `X ${snapshot.coordinate2180[0].toFixed(2)}, Y ${snapshot.coordinate2180[1].toFixed(2)}`
        : null;
    const point = Array.isArray(snapshot.coordinateLonLat) && snapshot.coordinateLonLat.every(Number.isFinite)
        ? `${snapshot.coordinateLonLat[1].toFixed(6)}° N, ${snapshot.coordinateLonLat[0].toFixed(6)}° E`
        : null;

    return h(PanelShell, {
        className: `identify-panel identify-panel--compact identify-panel--parcelplus${snapshot.pinned ? ' is-pinned' : ''}`,
        headerClassName: 'identify-panel-header',
        // Wynik działki ma własne akcje przypięcia i zamknięcia.
        label: title,
        docked,
        ...shellWindow,
        icon: h(Info, { size: 16 }),
        title,
        subtitle: snapshot.pinned ? t('identify.pinned') : t('identify.refreshHint'),
        actions: h('div', { className: 'panel-actions' },
            h(IconButton, { label: snapshot.pinned ? t('identify.unpin') : t('identify.pin'), tooltipSide: 'bottom', className: snapshot.pinned ? 'is-active' : '', onClick: () => manager?.togglePinned() }, h(Pin, { size: 15 })),
            docked ? null : h(IconButton, { label: t('identify.minimize'), tooltipSide: 'bottom', onClick: () => setCollapsed(true) }, h(Minus, { size: 15 })),
            h(IconButton, { label: t('identify.close'), tooltipSide: 'bottom', onClick: () => manager?.close() }, h(X, { size: 16 }))),
        footer: snapshot.zoneOnly ? t('identify.footer.zone') : t('identify.footer.parcel'),
    },
        // 19.51.0: na komputerze (karta z narzędziami) uproszczona karta działki — propozycje P1–P10.
        // Telefon (bez narzędzi) zachowuje dotychczasowy układ poniżej.
        onScreening ? h('div', { className: 'identify-panel-body identify-panel-body--card' }, h(ParcelCard, { snapshot, manager, layers, onScreening })) :
        h('div', { className: 'identify-panel-body' },
            // 19.39.0: zwięzły nagłówek działki zamiast tabeli 5 wierszy — numer i obręb, gmina z powierzchnią,
            // identyfikator do skopiowania. Ta sama treść, ok. 90 px mniej (na 1366×768 „W okolicy” mieści się bez przewijania).
            snapshot.zoneOnly || (!parcel && !snapshot.parcelBusy) ? null : h('section', { className: 'identify-headline', 'aria-label': t('identify.parcel') },
                h('div', { className: 'identify-headline-title' },
                    h('strong', null, parcel?.parcel ? `Działka ${parcel.parcel}` : 'Działka…'),
                    parcel?.region ? h('span', null, `obręb ${parcel.region}`) : null),
                h('div', { className: 'identify-headline-sub' },
                    [parcel?.commune || (snapshot.parcelBusy ? '…' : null), snapshot.parcelBusy ? null : formatArea(snapshot.parcelAreaSqm)].filter(Boolean).join(' · ')),
                h('div', { className: 'identify-headline-id' }, h(Fact, { label: t('identify.fact.id'), value: parcel?.id || pending, wide: true, copy: true }))),
            // 19.8.5: powiat, województwo i trzy zestawy współrzędnych zwinięte — spychały
            // werdykty (plan, ochrona) poniżej pierwszego ekranu panelu (audyt UX A5).
            snapshot.zoneOnly ? null : h('details', { className: 'identify-more-facts' },
                h('summary', null, parcel ? t('identify.moreFacts') : t('identify.coordinates')),
                h('div', { className: 'identify-summary-grid' },
                    parcel ? h(Fact, { label: t('identify.fact.county'), value: parcel.county || '—' }) : null,
                    parcel ? h(Fact, { label: t('identify.fact.voivodeship'), value: parcel.voivodeship || '—' }) : null,
                    point ? h(Fact, { label: t('identify.fact.point'), value: point, wide: true, copy: true }) : null,
                    point2180 ? h(Fact, { label: t('identify.fact.point2180'), value: point2180, wide: true, copy: true }) : null,
                    coordinates ? h(Fact, { label: t('identify.fact.center'), value: coordinates, wide: true, copy: true }) : null)),
            !snapshot.zoneOnly && !parcel && !snapshot.parcelBusy && !snapshot.parcelError ? h('p', { className: 'identify-no-parcel', role: 'note' }, t('identify.noParcel')) : null,
            snapshot.zoneOnly ? null : h(Verdict, { layers }),
            // 18.12.3: z wyniku działki prosto do screeningu (działka trafia do projektu).
            // 19.16.0: jedna akcja główna (screening) i „Działania” — ten sam wzór co w panelu Obiekty.
            // 19.39.0: wszystkie działania na wierzchu (wcześniej trzy ukryte w menu „Działania”):
            // główne — Otoczenie i Raport PDF; pomocnicze — mniejsze przyciski w jednym wierszu.
            !snapshot.zoneOnly && parcel?.wkt && onScreening ? h('div', { className: 'identify-actions identify-actions--v3' },
                h('div', { className: 'identify-actions-main' },
                    h(Button, { variant: 'primary', size: 'sm', icon: h(ScanSearch, { size: 14 }), title: 'Sprawdź otoczenie działki (zakładka Analizy)', onClick: () => onScreening(parcel) }, t('identify.screening')),
                    h(Button, { variant: 'secondary', size: 'sm', icon: h(Download, { size: 14 }), title: 'Raport działki PDF — szablony i zakres do wyboru', onClick: () => reportDialog.open(parcel) }, 'Raport PDF')),
                h('div', { className: 'identify-actions-more', role: 'group', 'aria-label': 'Więcej działań dla działki' },
                    h('button', { type: 'button', title: 'Dodaj granicę działki do projektu (panel Obiekty)', onClick: () => void actOnParcel('save') }, 'Do projektu'),
                    h('button', { type: 'button', title: 'Bufor wokół działki (narzędzie Mierz → Bufor)', onClick: () => void actOnParcel('buffer') }, 'Bufor'),
                    h('button', { type: 'button', title: 'Wysokości i nachylenie terenu w działce (NMT)', onClick: () => void actOnParcel('terrain') }, 'Wysokości'),
                    h('button', { type: 'button', title: 'Teren 3D — model działki z otoczeniem (NMT GUGiK)', onClick: () => void import('../../terrain3d/terrain3dTool.js').then((m) => m.openParcel3D(snapshot.parcel)).catch((error) => toasts?.show({ tone: 'danger', message: error instanceof Error ? error.message : String(error) })) }, '3D'))) : null,
            // Bez narzędzi (np. karta na telefonie) — sam przycisk raportu.
            !snapshot.zoneOnly && parcel?.wkt && !onScreening ? h('div', { className: 'identify-report' },
                h(Button, { variant: 'secondary', size: 'sm', icon: h(Download, { size: 14 }), title: 'Raport działki PDF — szablony i zakres do wyboru', onClick: () => reportDialog.open(parcel) }, 'Raport PDF')) : null,
            !snapshot.zoneOnly && parcel?.wkt && snapshot.parcelCenterLonLat ? h(Nearby, { center: snapshot.parcelCenterLonLat }) : null,
            snapshot.parcelError && failedCount < 2 ? h(Message, { tone: 'danger', className: 'identify-message identify-message--error' }, t('identify.parcelError')) : null,
            failedCount >= 2 && !snapshot.busy ? h(Message, { tone: 'warning', className: 'identify-sources-down', role: 'status' },
                h('span', null, tn('identify.sourcesDown', failedCount)),
                h(Button, { size: 'sm', variant: 'secondary', icon: h(RotateCw, { size: 13 }), onClick: () => manager?.retryFailed() }, t('identify.retryAll'))) : null,
            snapshot.zoneOnly ? null : h('div', { className: 'parcelplus-disclaimer' }, t('identify.disclaimer')),
            h(Section, { key: sectionKey('planning'), title: t('identify.section.planning'), layers: planning, defaultOpen: true, onRetry }),
            snapshot.zoneOnly ? null : h(Section, { key: sectionKey('grunts'), title: t('identify.section.grunts'), layers: grunts, note: t('identify.section.grunts.note'), defaultOpen: true, onRetry }),
            snapshot.zoneOnly ? null : h(Section, { key: sectionKey('restrictions'), title: t('identify.section.restrictions'), layers: environment, defaultOpen: true, onRetry }),
            snapshot.zoneOnly ? null : h(Section, { key: sectionKey('other'), title: t('identify.section.other'), layers: [...geology.filter((layer) => layer.sourceKey === 'kowr'), ...utilities, ...active], defaultOpen: true, onRetry }),
            snapshot.error ? h(Message, { tone: 'danger', className: 'identify-message identify-message--error' }, snapshot.error) : null,
            snapshot.busy ? h('div', { className: 'identify-progress', role: 'status' }, h(LoaderCircle, { size: 13, className: 'is-spinning' }), t('identify.busy', { completed: snapshot.completed ?? 0, total: snapshot.total ?? 0 })) : null
        ));
});

const EMPTY_IDENTIFY = Object.freeze({ open: false });

/**
 * 18.0 — Szczegóły działki jako moduł doku (PANEL_DEFS.identify). Wynik
 * pojawia się w górnej części prawego doku, nad Obiektami, zamiast w oknie,
 * które nachodziło na paletę narzędzi. Po zamknięciu wraca poprzedni moduł.
 */
export function IdentifyDockPanel() {
    const manager = useService('identify');
    const tools = useService('tools');
    const snapshot = useServiceSnapshot('identify', EMPTY_IDENTIFY);
    const panel = usePanel('identify');
    const parcels = useService('parcels');
    const analysis = useService('analysis');
    const dispatch = useAppDispatch();
    const onScreening = (parcel) => {
        try {
            parcels?.addParcel(parcel);
            dispatch(openPanel('analysis'));
            window.setTimeout(() => void analysis?.runParcelScreening(), 0);
        } catch (error) { console.error('[screening z Informacji o działce]', error); }
    };
    // 19.10.0: jako karta miejsca (okno) panel istnieje tylko, gdy jest otwarty.
    if (!panel.docked && !panel.open) return null;
    return h(IdentifyPanel, { snapshot, manager, tools, onScreening, docked: panel.docked, window: panel });
}
