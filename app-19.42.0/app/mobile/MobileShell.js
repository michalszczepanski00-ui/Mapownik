import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Check, Download, Ellipsis, FolderOpen, ImageDown, Layers3, LayoutGrid, LocateFixed, Monitor, Moon, ScanSearch, Sun, X } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { ContextField } from '../components/ContextBar.js';
import { SearchToolbar } from '../components/SearchToolbar.js';
import { BasemapSwitcher } from '../components/BasemapSwitcher.js';
import { ToolIcon } from '../icons/tablerIcons.js';
import { ProjectFiles } from '../components/ProjectFiles.js';
import { ProjectQuickActions } from '../components/ProjectMenu.js';
import { DOCK_LABELS, TOOL_GROUPS, groupOfTool } from '../components/toolGroups.js';
import { MobileParcelCard } from './MobileParcelCard.js';
import { MobileSheet } from './MobileSheet.js';
import { LocationTracker } from './geolocation.js';
import { MobileCrosshair } from './MobileCrosshair.js';
import { MobilePointMenu } from './MobilePointMenu.js';
import { MobileSketchBar } from './MobileSketchBar.js';
import { hasRecentSourceIssue, sourceIsDown } from '../../data/sources/adapters/healthState.js';
import { toLonLat } from 'ol/proj.js';
import { fromViewGeometry } from '../../objects/index.js';
import Point from 'ol/geom/Point.js';
import { setDesktopOnMobile } from '../hooks/useIsMobile.js';
import { PANEL_MODE, closePanel, openPanel, selectDockActiveId, selectFloatingPanelIds, setPanelMode, setTheme, toggleTheme, useAppDispatch, useAppSelector } from '../../store/index.js';
import { t } from '../../i18n/index.js';

const EMPTY_TOOLS = Object.freeze({ items: [] });
const EMPTY_LAYERS = Object.freeze({ layers: [] });
const EMPTY_BASEMAPS = Object.freeze({ activeId: null, items: [] });
const EMPTY_IDENTIFY = Object.freeze({ open: false });
const IDLE_SKETCH = Object.freeze({ active: false });

// Przełączniki warstw pod wyszukiwarką (jak kategorie w Mapach Google).
const ORTHO_ID = 'basemap.orthophoto';
const LOCATION_NOTICES = { denied: 'mobile.locate.denied', weak: 'mobile.locate.weak', unavailable: 'mobile.locate.unavailable', unsupported: 'mobile.locate.unavailable' };

const IDLE_TOOLS = new Set(['core.identify', 'core.pan']);
const MORE_PANELS = new Set(['analysis', 'vpsData', 'orthophoto', 'marketPrices', 'buildingPermits', 'export']);

function Chips({ onUtilities }) {
    const layers = useService('layers'), basemaps = useService('basemaps');
    const layerSnapshot = useServiceSnapshot('layers', EMPTY_LAYERS);
    const basemapSnapshot = useServiceSnapshot('basemaps', EMPTY_BASEMAPS);
    const previousBasemap = useRef('basemap.osm');
    const visible = new Set(layerSnapshot.layers.filter((layer) => layer.visible).map((layer) => layer.id));
    const utilities = layerSnapshot.layers.filter((layer) => layer.id.startsWith('overlay.kiut.'));
    const count = visible.has('overlay.utilities.all') ? 7 : utilities.filter((layer) => layer.visible).length;
    const orthoOn = basemapSnapshot.activeId === ORTHO_ID;
    return h('div', { className: 'm-chips', role: 'toolbar', 'aria-label': t('mobile.chips') },
        h('button', { type: 'button', className: `m-chip${orthoOn ? ' is-on' : ''}`, 'aria-pressed': orthoOn, onClick: () => { if (orthoOn) basemaps?.setActive(previousBasemap.current || 'basemap.osm'); else { previousBasemap.current = basemapSnapshot.activeId; basemaps?.setActive(ORTHO_ID); } } }, h(ImageDown, { size: 15 }), t('mobile.chip.ortho')),
        h('button', { type: 'button', className: `m-chip${count ? ' is-on' : ''}`, onClick: onUtilities }, `Uzbrojenie${count ? ` (${count})` : ''} ▾`),
        h('button', { type: 'button', className: `m-chip${visible.has('overlay.dzialki') ? ' is-on' : ''}`, 'aria-pressed': visible.has('overlay.dzialki'), onClick: () => layers?.setVisibility('overlay.dzialki', !visible.has('overlay.dzialki')) }, 'Działki'));
}
function UtilitiesSheet({ onClose }) {
    const manager = useService('layers');
    const snapshot = useServiceSnapshot('layers', EMPTY_LAYERS);
    const [snap, setSnap] = useState('half');
    const layers = snapshot.layers.filter((layer) => layer.id.startsWith('overlay.kiut.'));
    return h(MobileSheet, { snap, onSnap: setSnap, onClose, label: 'Uzbrojenie terenu', className: 'm-utilities-sheet',
        header: h('div', { className: 'm-card-head' }, h('strong', null, 'Uzbrojenie terenu'), h('button', { type: 'button', className: 'm-icon-button', 'aria-label': 'Zamknij uzbrojenie', onClick: onClose }, h(X, { size: 20 }))) },
        h('p', { className: 'm-note' }, 'Wybierz zestaw wszystkich sieci albo pojedyncze kategorie. Widoczność zależy od skali mapy.'),
        h('button', { type:'button', className:'m-list-button', 'aria-pressed':Boolean(snapshot.layers.find(l=>l.id==='overlay.utilities.all')?.visible), onClick:()=>manager?.setVisibility('overlay.utilities.all', !snapshot.layers.find(l=>l.id==='overlay.utilities.all')?.visible) }, 'Wszystkie sieci — jeden obraz'),
        layers.map((layer) => h('button', { key: layer.id, type: 'button', className: 'm-list-button', 'aria-pressed': layer.visible, onClick: () => manager?.setVisibility(layer.id, !layer.visible) }, `${layer.visible ? '✓ ' : '□ '}${layer.title}`, layer.awaitingZoom ? ' · Przybliż mapę' : '')),
        h('button', { type: 'button', className: 'm-list-button', onClick: () => { layers.forEach((layer) => manager?.setVisibility(layer.id, false)); manager?.setVisibility('overlay.utilities.all', false); } }, 'Wyłącz wszystkie sieci'));
}

function MobileBasemapHealth({ onLayers }) {
    const basemaps=useServiceSnapshot('basemaps', EMPTY_BASEMAPS);
    const manager=useService('layers');
    const active=basemaps.items.find(x=>x.id===basemaps.activeId);
    const failed=active && (active.status==='error' || sourceIsDown(active.sourceTelemetry) || hasRecentSourceIssue(active.sourceTelemetry));
    if(!failed)return null;
    return h('div',{className:'m-basemap-health',role:'status'},
      h('span',null,'Podkład niedostępny lub niestabilny'),
      h('button',{type:'button',onClick:()=>manager?.retry(active.id)},'Ponów'),
      h('button',{type:'button',onClick:onLayers},'Zmień podkład'));
}

function LayersSheet({ onClose, onUtilities }) {
    const dispatch = useAppDispatch();
    const [snap, setSnap] = useState('half');
    return h(MobileSheet, {
        snap, onSnap: setSnap, onClose, label: t('mobile.layers.title'), className: 'm-layers-sheet', peekHeight: 220,
        header: h('div', { className: 'm-card-head' }, h('div', { className: 'm-card-title' }, h('strong', null, t('mobile.layers.title'))),
            h('button', { type: 'button', className: 'm-icon-button', 'aria-label': t('mobile.close'), onClick: onClose }, h(X, { size: 20 }))),
    },
        h('h3', { className: 'm-section-title' }, t('mobile.layers.basemap')),
        h(BasemapSwitcher, { expanded: true }),
        h('h3', { className: 'm-section-title' }, t('mobile.layers.overlays')),
        h(Chips, { onUtilities }),
        h('button', { type: 'button', className: 'm-list-button', onClick: () => { onClose(); dispatch(openPanel('layers')); } }, h(Layers3, { size: 18 }), t('mobile.layers.all')));
}

// 18.14.1: na telefonie pomiary i profil terenu działają z celownikiem w środku ekranu.
const CROSSHAIR_TOOLS = { 'core.measure.line': 'line', 'core.measure.area': 'area', 'core.terrain.profile': 'profile' };

/**
 * 19.13.0: arkusz narzędzi jednej grupy (Szkic albo Pomiar) — wszystkie narzędzia
 * grupy naraz, w sekcjach jak w doku na komputerze. Bez `groupId`: wszystkie grupy
 * (pozycja „Wszystkie narzędzia” w menu Więcej).
 */
const GROUP_NOTES = {
    drawing: 'Rysuj palcem po mapie; „Zakończ” na pasku szkicu. Edytuj — przy zaznaczonym obiekcie.',
    measurement: 'Odległość, powierzchnię i profil dodajesz celownikiem; bufor i wysokości obszaru — dotknięciem mapy.',
};
function ToolsSheet({ onClose, onCrosshair, groupId = null }) {
    const tools = useService('tools');
    const snapshot = useServiceSnapshot('tools', EMPTY_TOOLS);
    const [snap, setSnap] = useState('half');
    const groups = groupId ? TOOL_GROUPS.filter((group) => group.id === groupId) : TOOL_GROUPS.filter((group) => group.id !== 'information');
    const title = groupId ? groups[0]?.title ?? 'Narzędzia' : 'Wszystkie narzędzia';
    const tool = (id) => {
        const item = snapshot.items.find((entry) => entry.id === id);
        if (!item) return null;
        return h('button', {
            key: item.id, type: 'button', className: `m-tool${item.active ? ' is-active' : ''}`,
            disabled: !item.enabled || item.loading || !tools, 'aria-pressed': item.active,
            onClick: () => { onClose(); if (CROSSHAIR_TOOLS[item.id]) onCrosshair(CROSSHAIR_TOOLS[item.id]); else void tools?.activate(item.id); },
        }, h('span', { className: 'm-tool-icon', 'aria-hidden': true }, h(ToolIcon, { name: item.icon, size: 24, strokeWidth: 1.8 })), h('span', null, DOCK_LABELS[item.id] ?? item.label ?? item.title));
    };
    return h(MobileSheet, {
        snap, onSnap: setSnap, onClose, label: title, className: 'm-tools-sheet', peekHeight: 260,
        header: h('div', { className: 'm-card-head' }, h('div', { className: 'm-card-title' }, h('strong', null, title), h('span', null, t('mobile.tools.hint'))),
            h('button', { type: 'button', className: 'm-icon-button', 'aria-label': t('mobile.close'), onClick: onClose }, h(X, { size: 20 }))),
    },
        groups.flatMap((group) => group.sections.map((section, index) => h('section', { key: `${group.id}-${index}`, className: 'm-tool-section' },
            h('h3', { className: 'm-section-title' }, groupId ? (section.title ?? group.title) : `${group.title} · ${section.title ?? ''}`),
            h('div', { className: 'm-tool-grid' }, section.tools.map(tool))))),
        h('p', { className: 'm-note' }, groupId ? GROUP_NOTES[groupId] ?? '' : 'Parametry aktywnego narzędzia pojawią się pod jego nazwą.'));
}

function MoreSheet({ onClose, onTools }) {
    const dispatch = useAppDispatch();
    const theme = useAppSelector((state) => state.ui.theme);
    const themeMode = useAppSelector((state) => state.ui.themeMode);
    const [snap, setSnap] = useState('half');
    const open = (id) => { onClose(); dispatch(openPanel(id)); };
    const item = (icon, label, onClick) => h('button', { type: 'button', className: 'm-list-button', onClick }, icon, h('span', null, label));
    return h(MobileSheet, {
        snap, onSnap: setSnap, onClose, label: t('mobile.more.title'), className: 'm-more-sheet', peekHeight: 220,
        header: h('div', { className: 'm-card-head' }, h('div', { className: 'm-card-title' }, h('strong', null, t('mobile.more.title'))),
            h('button', { type: 'button', className: 'm-icon-button', 'aria-label': t('mobile.close'), onClick: onClose }, h(X, { size: 20 }))),
    },
        // 19.28.0: bez „Narzędzi pomiaru i rysowania” — Rysuj i Mierz są w dolnym menu.
        item(h(ScanSearch, { size: 18 }), 'Raport działki', () => open('vpsData')),
        item(h(ScanSearch, { size: 18 }), t('mobile.more.analysis'), () => open('analysis')),
        item(h(ImageDown, { size: 18 }), t('mobile.more.ortho'), () => open('orthophoto')),
        // 19.32.0: narzędzia z prawej belki (na komputerze) — na telefonie tutaj.
        item(h(ToolIcon, { name: 'market-prices', size: 18 }), 'Ceny transakcyjne', () => open('marketPrices')),
        item(h(ToolIcon, { name: 'building-permits', size: 18 }), 'Budowy i pozwolenia', () => open('buildingPermits')),
        item(h(Download, { size: 18 }), t('mobile.more.export'), () => open('export')),
        h('a', { className: 'm-list-button', href: './monitor-zrodel.html', target: '_blank', rel: 'noopener noreferrer' }, h(Activity, { size: 18 }), h('span', null, 'Monitor źródeł danych')),
        item(theme === 'dark' ? h(Sun, { size: 18 }) : h(Moon, { size: 18 }), theme === 'dark' ? t('mobile.more.light') : t('mobile.more.dark'), () => dispatch(toggleTheme())),
        item(h('span', { className: 'm-list-icon-slot', 'aria-hidden': true }, themeMode === 'system' ? h(Check, { size: 18 }) : null), 'Motyw systemowy', () => dispatch(setTheme('system'))),
        item(h(Monitor, { size: 18 }), t('mobile.more.desktop'), () => { onClose(); setDesktopOnMobile(true); }));
}

function ActiveToolPill() {
    const ctx = useService('featureContext');
    const features = useService('features');
    const tools = useService('tools');
    useServiceSnapshot('settings', null);
    const snapshot = useServiceSnapshot('tools', EMPTY_TOOLS);
    const active = snapshot.items.find((item) => item.active && !IDLE_TOOLS.has(item.id));
    const definition = active && features?.getTool(active.id);
    useServiceSnapshot(definition?.service ?? '__none__', null);
    if (!active) return null;
    const hint = typeof definition?.hint === 'function' ? definition.hint(ctx) : definition?.hint;
    const options = definition?.options?.(ctx) ?? [];
    return h('div', { className: 'm-active-task' }, h('div', { className: 'm-tool-pill', role: 'status' },
        h(ToolIcon, { name: active.icon, size: 18, strokeWidth: 1.9 }),
        h('span', null, active.title),
        h('button', { type: 'button', 'aria-label': t('mobile.tool.end'), onClick: () => void tools?.activate('core.identify') }, h(X, { size: 18 }))),
        hint && h('p', { className: 'm-next-step' }, hint),
        options.length > 0 && h('div', { className: 'm-task-options' }, options.map((field) => h(ContextField, { key: field.id, field }))));
}

/**
 * 18.14.0 — powłoka mobilna „msportal w terenie”, wzorowana na Mapach Google:
 * mapa na całym ekranie, pływająca wyszukiwarka i przełączniki warstw u góry,
 * przyciski Warstwy i Moja lokalizacja po prawej, dolny pasek
 * (Mapa / Projekt / Więcej). Dotknięcie mapy = karta działki — bez wybierania
 * narzędzia (domyślnie aktywna jest „Informacja o działce”).
 */
export function MobileShell() {
    const dispatch = useAppDispatch();
    const tools = useService('tools');
    const searchManager = useService('search');
    const controller = useService('mapController');
    const identify = useServiceSnapshot('identify', EMPTY_IDENTIFY);
    const measurement = useService('measurement');
    const measurementState = useServiceSnapshot('measurement', IDLE_SKETCH);
    const toolSnapshot = useServiceSnapshot('tools', EMPTY_TOOLS);
    const sketching = useServiceSnapshot('sketch', IDLE_SKETCH).active;
    const rightActive = useAppSelector((state) => selectDockActiveId(state, 'right'));
    const [sheet, setSheet] = useState(null);
    const [projectSnap, setProjectSnap] = useState('half'); // 'layers' | 'more' | 'tools'
    const [location, setLocation] = useState({ status: 'off' });
    const [pointMenu, setPointMenu] = useState(null);   // współrzędne 3857 przytrzymanego miejsca
    const [crosshair, setCrosshair] = useState(null);   // { mode, start, key }
    const identifyManager = useService('identify');
    const featureContext = useService('featureContext');

    useEffect(() => { if (rightActive) dispatch(closePanel(rightActive)); }, []);
    const startCrosshair = (mode, start = null) => {
        setSheet(null);
        setPointMenu(null);
        identifyManager?.close();
        if (rightActive) dispatch(closePanel(rightActive));
        void tools?.activate('core.identify');
        setCrosshair({ mode, start, key: Date.now() });
    };
    const identifyAt = (coordinate) => {
        setPointMenu(null);
        const map = controller?.map;
        if (!map || !identifyManager) return;
        const coordinate2180 = fromViewGeometry(new Point(coordinate)).coordinates;
        void identifyManager.handleClick({ coordinate3857: coordinate, coordinate2180, coordinateLonLat: toLonLat(coordinate), pixel: map.getPixelFromCoordinate(coordinate) });
    };

    // 18.14.1: przytrzymanie palca (~0,5 s bez ruchu) otwiera menu punktu.
    // 18.14.3: tylko w trybie spoczynku (bez pomiaru i bez narzędzia rysowania);
    // drugi palec rozpoznawany przez isPrimary — bez własnego licznika palców,
    // który po zgubionym zdarzeniu „puszczono” blokował przytrzymanie na stałe.
    const activeToolId = toolSnapshot.items.find((item) => item.active)?.id ?? null;
    const longPressBlocked = useRef(false);
    longPressBlocked.current = Boolean(crosshair) || (activeToolId != null && !IDLE_TOOLS.has(activeToolId));
    useEffect(() => {
        const map = controller?.map;
        const viewport = map?.getViewport?.();
        if (!viewport) return undefined;
        let timer = null; let start = null;
        const cancel = () => { if (timer) window.clearTimeout(timer); timer = null; start = null; };
        const down = (event) => {
            cancel();
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (!event.isPrimary || longPressBlocked.current) return; // drugi palec = przybliżanie
            start = [event.clientX, event.clientY];
            const pixel = map.getEventPixel(event);
            timer = window.setTimeout(() => {
                timer = null;
                if (longPressBlocked.current) return;
                const coordinate = map.getCoordinateFromPixel(pixel);
                if (!coordinate) return;
                identifyManager?.suppressClicks(900);
                navigator.vibrate?.(20);
                setSheet(null);
                setPointMenu(coordinate);
            }, 520);
        };
        const move = (event) => { if (timer && start && Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 10) cancel(); };
        const menu = (event) => { event.preventDefault(); event.stopPropagation(); };
        const hidden = () => { if (document.visibilityState !== 'visible') cancel(); };
        viewport.addEventListener('pointerdown', down);
        viewport.addEventListener('pointermove', move);
        window.addEventListener('pointerup', cancel);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('blur', cancel);
        document.addEventListener('visibilitychange', hidden);
        viewport.addEventListener('contextmenu', menu);
        return () => {
            cancel();
            viewport.removeEventListener('pointerdown', down);
            viewport.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', cancel);
            window.removeEventListener('pointercancel', cancel);
            window.removeEventListener('blur', cancel);
            document.removeEventListener('visibilitychange', hidden);
            viewport.removeEventListener('contextmenu', menu);
        };
    }, [controller, identifyManager]);
    const tracker = useMemo(() => (controller ? new LocationTracker(controller, setLocation) : null), [controller]);
    useEffect(() => () => tracker?.dispose(), [tracker]);

    // 18.15.0: panel odpięty do okna na komputerze (stan zapisany w przeglądarce)
    // byłby na telefonie niewidoczny — powłoka mobilna nie ma okien pływających.
    // Otwarty panel pływający wraca więc do doku, czyli do arkusza nad paskiem.
    const floatingOpen = useAppSelector((state) => selectFloatingPanelIds(state).filter((id) => id !== 'identify' && state.panels.open[id]).join(','));
    useEffect(() => {
        if (!floatingOpen) return;
        for (const id of floatingOpen.split(',')) dispatch(setPanelMode(id, PANEL_MODE.docked));
    }, [floatingOpen, dispatch]);

    // Domyślny tryb telefonu: dotknięcie mapy pokazuje działkę.
    const ready = toolSnapshot.items.some((item) => item.id === 'core.identify');
    useEffect(() => {
        if (!ready) return;
        const active = toolSnapshot.items.find((item) => item.active);
        if (!active || active.id === 'core.pan') void tools?.activate('core.identify');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready]);

    // Panel z prawego doku (Projekt, Analizy…) i karta działki nie nakładają się.
    useEffect(() => { if (identify.open && rightActive && rightActive !== 'identify') dispatch(closePanel(rightActive)); }, [identify.open]);

    // 18.14.3: przycisk „Wstecz” (Android, gest iOS) zamyka najwyższą warstwę
    // interfejsu zamiast opuszczać aplikację: menu punktu → pomiar → arkusz →
    // karta działki → panel. Jeden wpis w historii, dopóki coś jest otwarte.
    const overlay = pointMenu ? 'point' : crosshair ? 'crosshair' : sketching ? 'sketch' : sheet ? 'sheet' : identify.open ? 'card' : rightActive ? 'panel' : null;
    const closeTop = useRef(null);
    closeTop.current = () => {
        if (pointMenu) setPointMenu(null);
        else if (crosshair) setCrosshair(null);
        else if (sketching) featureContext?.interactions?.abortActiveSketch?.();
        else if (sheet) setSheet(null);
        else if (identify.open) identifyManager?.close();
        else if (rightActive) dispatch(closePanel(rightActive));
    };
    const history = useRef({ pushed: false, ignorePop: false });
    useEffect(() => {
        const state = history.current;
        if (overlay && !state.pushed) {
            try { window.history.pushState({ mapownikOverlay: true }, ''); state.pushed = true; } catch { /* np. sandbox */ }
        } else if (!overlay && state.pushed) {
            // Zamknięte przyciskiem w aplikacji — zdejmij własny wpis z historii.
            state.pushed = false;
            state.ignorePop = true;
            window.history.back();
        }
    }, [overlay]);
    useEffect(() => {
        const onPop = () => {
            const state = history.current;
            if (state.ignorePop) { state.ignorePop = false; return; }
            if (!state.pushed) return;
            state.pushed = false;
            closeTop.current?.();
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // 18.14.3: komunikat o lokalizacji znika sam po kilku sekundach.
    const [locationNotice, setLocationNotice] = useState(null);
    const noticeTimer = useRef(null);
    useEffect(() => {
        if (!location.error) return;
        setLocationNotice(location.error);
        window.clearTimeout(noticeTimer.current);
        noticeTimer.current = window.setTimeout(() => setLocationNotice(null), location.error === 'denied' ? 7000 : 4500);
    }, [location.error, location.errorAt]);
    useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

    // 19.13.0: „Sprawdź” zastępuje „Mapa” — stan spoczynkowy to dotknięcie = karta działki.
    const goCheck = () => {
        setSheet(null); setCrosshair(null);
        if (rightActive) dispatch(closePanel(rightActive));
        void tools?.activate('core.identify');
    };
    const openSheet = (name) => { identifyManager?.close(); if (rightActive) dispatch(closePanel(rightActive)); setSheet(sheet === name ? null : name); };
    // Podświetlenie zakładki: otwarty arkusz, a bez niego — grupa aktywnego narzędzia.
    const activeGroup = activeToolId && !IDLE_TOOLS.has(activeToolId) ? groupOfTool(activeToolId)?.id : null;
    const tab = sheet === 'layers' || sheet === 'utilities' || rightActive === 'layers' ? 'layers'
        : sheet === 'sketch' || (!sheet && activeGroup === 'drawing') ? 'sketch'
            : sheet === 'measure' || crosshair || (!sheet && activeGroup === 'measurement') ? 'measure'
                : sheet === 'project' || rightActive === 'objects' ? 'project'
                    : sheet === 'more' || sheet === 'tools' || MORE_PANELS.has(rightActive) ? 'more' : 'check';
    const cardOpen = identify.open;
    const navButton = (id, label, icon, onClick) => h('button', { key: id, type: 'button', className: tab === id ? 'is-active' : '', 'aria-current': tab === id ? 'page' : undefined, onClick }, icon, h('span', null, label));
    const onUtilities = () => { identifyManager?.close(); if (rightActive) dispatch(closePanel(rightActive)); setSheet('utilities'); };

    return h('div', { className: `m-shell${cardOpen ? ' has-card' : ''}${rightActive ? ' has-panel' : ''}${crosshair ? ' is-measuring' : ''}${pointMenu ? ' has-point-menu' : ''}${sketching ? ' is-sketching' : ''}` },
        h('div', { className: 'm-top' },
            h('div', { className: 'm-search' }, h(SearchToolbar, { manager: searchManager }), h('button', { type: 'button', className: 'm-icon-button m-more-trigger', 'aria-label': 'Więcej', onClick: () => { if (rightActive) dispatch(closePanel(rightActive)); identifyManager?.close(); setSheet(sheet === 'more' ? null : 'more'); } }, h(Ellipsis, { size: 22 }))),
            h(Chips, { onUtilities }),
            h(ActiveToolPill, null)),
        h('button', {
            type: 'button',
            className: `m-fab m-fab--locate is-${location.status}${location.follow ? ' is-follow' : ''}`,
            'aria-label': location.follow ? t('mobile.locate.stop') : location.status === 'on' ? t('mobile.locate.follow') : t('mobile.locate.start'),
            title: location.accuracy ? t('mobile.locate.accuracy', { value: location.accuracy }) : undefined,
            onClick: () => tracker?.toggle(),
        }, h(LocateFixed, { size: 22 })),
        locationNotice ? h('div', { className: 'm-toast', role: 'status' }, t(LOCATION_NOTICES[locationNotice] ?? 'mobile.locate.unavailable')) : null,
        h(MobileParcelCard, null),
        measurementState.temporaryResult && !crosshair && !sheet && !identify.open && !rightActive && h('section', { className: 'm-temporary-result', 'aria-label': 'Pomiar tymczasowy' },
            h('strong', null, measurementState.temporaryResult),
            h('div', null, h('button', { type: 'button', onClick: () => measurement.saveTemporary() }, 'Dodaj do projektu'), h('button', { type: 'button', onClick: () => { void navigator.clipboard?.writeText(measurementState.temporaryResult).catch(() => {}); } }, 'Kopiuj'), h('button', { type: 'button', onClick: () => measurement.clearTemporary() }, 'Wyczyść'))),
        h(MobileBasemapHealth,{onLayers:()=>setSheet('layers')}),
        sheet === 'layers' ? h(LayersSheet, { onClose: () => setSheet(null), onUtilities }) : null,
        sheet === 'utilities' ? h(UtilitiesSheet, { onClose: () => setSheet(null) }) : null,
        sheet === 'more' ? h(MoreSheet, { onClose: () => setSheet(null), onTools: () => setSheet('tools') }) : null,
        sheet === 'project' ? h(MobileSheet, { snap: projectSnap, label: 'Projekt', className: 'm-project-sheet', onSnap: setProjectSnap, onClose: () => setSheet(null), header: h('div', { className: 'm-card-head' }, h('div', { className: 'm-card-title' }, h('strong', null, 'Projekt')), h('button', { type: 'button', className: 'm-icon-button', 'aria-label': 'Zamknij projekt', onClick: () => setSheet(null) }, h(X, { size: 20 }))) }, h('button', { type: 'button', className: 'm-list-button', onClick: () => { setSheet(null); dispatch(openPanel('objects')); } }, h(Layers3, { size: 18 }), h('span', null, 'Obiekty projektu')), h(ProjectQuickActions, null), h(ProjectFiles, null)) : null,
        sheet === 'measure' ? h(ToolsSheet, { groupId: 'measurement', onClose: () => setSheet(null), onCrosshair: (mode) => startCrosshair(mode) }) : null,
        sheet === 'sketch' ? h(ToolsSheet, { groupId: 'drawing', onClose: () => setSheet(null), onCrosshair: (mode) => startCrosshair(mode) }) : null,
        sheet === 'tools' ? h(ToolsSheet, { onClose: () => setSheet(null), onCrosshair: (mode) => startCrosshair(mode) }) : null,
        pointMenu ? h(MobilePointMenu, { coordinate: pointMenu, onClose: () => setPointMenu(null), onMeasure: (mode) => startCrosshair(mode, pointMenu), onParcel: () => identifyAt(pointMenu) }) : null,
        sketching && !crosshair ? h(MobileSketchBar, null) : null,
        crosshair ? h(MobileCrosshair, { key: crosshair.key, mode: crosshair.mode, start: crosshair.start, onClose: () => setCrosshair(null) }) : null,
        // 19.13.0: pięć pozycji jak w projekcie v2 — Sprawdź · Warstwy · Szkic · Pomiar · Projekt.
        h('nav', { className: 'm-nav m-nav--five', 'aria-label': t('mobile.nav') },
            navButton('check', 'Sprawdź', h(ToolIcon, { name: 'identify', size: 22 }), goCheck),
            navButton('layers', 'Warstwy', h(Layers3, { size: 22 }), () => openSheet('layers')),
            navButton('sketch', 'Rysuj', h(ToolIcon, { name: 'polygon', size: 22 }), () => openSheet('sketch')),
            navButton('measure', 'Mierz', h(ToolIcon, { name: 'measure-line', size: 22 }), () => openSheet('measure')),
            navButton('project', t('mobile.nav.project'), h(FolderOpen, { size: 22 }), () => openSheet('project'))));

}
