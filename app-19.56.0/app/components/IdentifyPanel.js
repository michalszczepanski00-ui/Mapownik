import { cachedJson } from '../../core/apiCache.js';
import { RCN_DEFAULTS, medianReliable, radiusLabel, yearsLabel } from '../../core/rcnDefaults.js';
import { createElement as h, memo, useEffect, useMemo, useState } from 'react';
import { transform } from 'ol/proj.js';
import { Check, Copy, LoaderCircle, Info, Pin, Minus, RotateCw, X } from 'lucide-react';
import { IconButton } from './IconButton.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { Button, EmptyState, PanelMinimized, PanelShell } from '../ui/index.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { openPanel, useAppDispatch } from '../../store/index.js';
import { t } from '../../i18n/index.js';
import { ParcelCard } from './ParcelCard.js';

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

export const IdentifyPanel = memo(function IdentifyPanel({ snapshot, manager, tools, onScreening = null, docked = false, window: win = null }) {
    // 18.9.11: geometria okna (styl i uchwyty) — tylko gdy panel jest odpięty.
    const shellWindow = docked || !win ? {} : {
        style: win.style, onDragStart: win.onDragStart, onResizeWidth: win.onResizeStart, onResizeHeight: win.onResizeHeightStart,
    };
    const [collapsed, setCollapsed] = useState(false);
    // 19.47.0: hook PRZED wczesnymi return (stan bez działki, zwinięty panel) — w 19.46.0 stał za nimi i przy
    // przełączeniu Sprawdź → Mierz React zgłaszał błąd #300 („mniej hooków niż poprzednio”), panel się wywracał.
    const layersAll = useMemo(() => (snapshot.layers ?? []).map(normalizeLayer), [snapshot.layers]);
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
    const title = snapshot.zoneOnly ? t('identify.title.zone') : parcel ? t('identify.title.parcel') : t('identify.title.place');
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
        // 19.51.0: uproszczona karta działki (propozycje P1–P10); 19.53.0: ta sama na telefonie (MobileParcelCard).
        h('div', { className: 'identify-panel-body identify-panel-body--card' }, h(ParcelCard, { snapshot, manager, layers, onScreening })));
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
