import { requestScope } from '../../core/requestScope.js';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, ChevronRight, Ellipsis, EyeOff, Focus, GripVertical, Info, Layers3, LoaderCircle, RefreshCw, Star, ZoomIn } from 'lucide-react';
import { hasRecentSourceIssue, sourceIsDown } from '../../data/sources/adapters/healthState.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { DEFAULT_EXPANDED_GROUPS, OVERLAY_GROUP_ORDER } from '../../data/catalog/index.js';
import { formatScale } from '../../projections/mapScale.js';
import { useAppSelector } from '../../store/index.js';
import { Button, EmptyState, IconButton, Message, PanelMinimized, PanelShell, RangeField, SearchField } from '../ui/index.js';
import { t } from '../../i18n/index.js';
import { useLayerCoverage } from './layerCoverage.js';

/**
 * Panel Warstwy (18.2: wspólne kontrolki i katalog tekstów).
 *
 * Ramka, wyszukiwarka, przyciski i suwak krycia pochodzą z app/ui; wiersz
 * warstwy i nagłówek grupy zostają własnymi elementami listy (przeciąganie,
 * stan źródła, legenda), ale wszystkie napisy biorą z katalogu.
 */
const EMPTY_SNAPSHOT = Object.freeze({ catalogVersion: 0, issues: [], layers: [] });
const PREFS_KEY = 'mapownik:layers-ui-v16.3';
const GROUP_MIGRATION = {'Granice i działki':'Działki i grunty','Grunty':'Działki i grunty','Środowisko':'Środowisko i wody','Infrastruktura':'Energetyka','Budynki':'Dane pomocnicze','Dane referencyjne':'Dane pomocnicze'};

function readPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return {
            favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
            expandedGroups: Array.isArray(parsed.expandedGroups) ? parsed.expandedGroups.map(group => GROUP_MIGRATION[group] ?? group) : [...DEFAULT_EXPANDED_GROUPS],
        };
    } catch {
        return { favorites: [], expandedGroups: [...DEFAULT_EXPANDED_GROUPS] };
    }
}
function writePrefs({ favorites, expandedGroups }) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ favorites, expandedGroups })); } catch {}
}
function statusLabel(layer) {
    switch (layer.status) {
        case 'loading': return t('layers.status.loading');
        case 'ready': return layer.visible ? t('layers.status.active') : t('layers.status.ready');
        case 'error': return t('layers.status.error');
        default: return t('layers.status.idle');
    }
}
function healthBadge(layer) {
    if (layer.status === 'error') return { label: t('layers.badge.down'), cls: 'down' };
    const telemetry = layer.sourceTelemetry;
    if (sourceIsDown(telemetry)) return { label: t('layers.badge.down'), cls: 'down' };
    if (layer.status === 'loading' || (telemetry?.inFlight ?? 0) > 0) return { label: t('layers.badge.busy'), cls: 'busy' };
    if (hasRecentSourceIssue(telemetry)) return { label: t('layers.badge.warn'), cls: 'warn' };
    // 18.0: znacznik tylko wtedy, gdy coś wymaga uwagi. „OK” przy każdej
    // włączonej warstwie było szumem — stan poprawny to brak znacznika.
    return null;
}
/** Poza zakresem przybliżenia — semantyka jak w OpenLayers (minZoom wyłączny). */
function scaleState(layer, zoom) {
    if (!Number.isFinite(zoom)) return 0;
    if (Number.isFinite(layer.minZoom) && zoom <= layer.minZoom) return -1;
    if (Number.isFinite(layer.maxZoom) && zoom > layer.maxZoom) return 1;
    return 0;
}
/**
 * 19.10.0 — rodziny statusów: obszary MPZP i POG z Rejestru Urbanistycznego / GUGiK
 * to osobne warstwy dla każdego etapu procedury. Na liście są jednym wierszem
 * z przełącznikami statusu (filtr), a „Pokaż warstwy” rozwija pełne wiersze
 * (krycie, legenda, menu). Pierwszy status to domyślny przy włączeniu.
 * Widok rodzin tylko w zakładce „Wszystkie” bez wyszukiwania — wyszukiwarka
 * i „Aktywne” pokazują pojedyncze warstwy.
 */
const STATUS_FAMILIES = Object.freeze([
    { id: 'mpzp-areas', title: 'MPZP — obszary planów', members: [
        ['overlay.ru.mpzp.prawniewiazacylubrealizowany', 'Obowiązujące'],
        ['overlay.ru.mpzp.wtrakcieprzyjmowania', 'W trakcie przyjmowania'],
        ['overlay.ru.mpzp.wopracowaniu', 'W opracowaniu'],
    ] },
    { id: 'pog-areas', title: 'POG — obszary planów ogólnych', members: [
        ['overlay.pog.adopted', 'Uchwalone'],
        ['overlay.pog.draft', 'W trakcie przyjmowania'],
        ['overlay.pog.preparation', 'W opracowaniu'],
    ] },
]);
const FAMILY_OF = new Map(STATUS_FAMILIES.flatMap((family) => family.members.map(([id]) => [id, family])));

const COVERAGE_TITLES = {
    yes: 'Dane w obecnym widoku mapy',
    no: 'Nie wykryto obiektów w próbce obrazu — nie potwierdza to braku danych',
    loading: 'Sprawdzanie, czy w widoku są dane…',
    unknown: 'Nie udało się sprawdzić danych w widoku (źródło nie odpowiedziało)',
};
function CoverageDot({ value }) {
    return _jsx('span', { className: `layer-coverage-dot layer-coverage-dot--${value}`, role: 'img', 'aria-label': COVERAGE_TITLES[value], title: COVERAGE_TITLES[value] });
}

function StatusFamilyRow({ family, layers, renderRow, setVisible, coverage = {} }) {
    const [expanded, setExpanded] = useState(false);
    const members = family.members.map(([id, label]) => ({ layer: layers.find((layer) => layer.id === id), label })).filter((entry) => entry.layer);
    const visible = members.filter((entry) => entry.layer.visible);
    const loading = members.some((entry) => entry.layer.status === 'loading');
    const on = visible.length > 0;
    const states = members.map((entry) => coverage[entry.layer.id]).filter(Boolean);
    const familyCoverage = states.includes('yes') ? 'yes' : states.includes('loading') ? 'loading' : states.includes('unknown') ? 'unknown' : states.length ? 'no' : null;
    const set = (entry, value) => setVisible(entry.layer.id, value);
    const toggle = () => {
        if (on) visible.forEach((entry) => set(entry, false));
        else if (members[0]) set(members[0], true);
    };
    if (!members.length) return null;
    return _jsxs('article', { className: `layer-row layer-row--compact layer-family${on ? ' is-visible' : ''}`, role: 'listitem', children: [
        _jsxs('div', { className: 'layer-row-main', children: [
            _jsx('button', { type: 'button', className: `layer-visibility${on ? ' is-visible' : ''}`, 'aria-pressed': on, 'aria-label': on ? t('layers.hide', { title: family.title }) : t('layers.show', { title: family.title }), onClick: toggle, children: loading
                ? _jsx(LoaderCircle, { size: 16, className: 'is-spinning' })
                : _jsx('span', { className: 'layer-visibility-box', 'aria-hidden': true, children: on ? _jsx(Check, { size: 12, strokeWidth: 3 }) : null }) }),
            _jsx('div', { className: 'layer-row-copy', onClick: toggle, children: _jsxs('div', { className: 'layer-row-titleline', children: [familyCoverage ? _jsx(CoverageDot, { value: familyCoverage }) : null, _jsx('strong', { title: family.title, children: family.title }), _jsx('small', { className: 'layer-family-count', children: `${visible.length}/${members.length}` })] }) }),
            _jsx(IconButton, { className: `layer-family-expand${expanded ? ' is-active' : ''}`, label: expanded ? 'Zwiń warstwy statusów' : 'Pokaż warstwy statusów (krycie, legenda)', tooltipSide: 'bottom', 'aria-expanded': expanded, onClick: () => setExpanded((value) => !value), children: expanded ? _jsx(ChevronDown, { size: 14 }) : _jsx(ChevronRight, { size: 14 }) }),
        ] }),
        on && _jsx('div', { className: 'layer-family-statuses', role: 'group', 'aria-label': `${family.title} — status procedury`, children: members.map((entry) => _jsx('button', {
            type: 'button', className: `layer-status-chip${entry.layer.visible ? ' is-active' : ''}`, 'aria-pressed': entry.layer.visible,
            title: entry.layer.title + (coverage[entry.layer.id] === 'yes' ? ' — dane w widoku' : coverage[entry.layer.id] === 'no' ? ' — nie wykryto obiektów w próbce' : ''),
            'data-coverage': coverage[entry.layer.id] ?? undefined,
            onClick: () => set(entry, !entry.layer.visible), children: entry.label,
        }, entry.layer.id)) }),
        expanded && _jsx('div', { className: 'layer-family-members', children: members.map((entry) => renderRow(entry.layer)) }),
    ] });
}

export function LayersPanel() {
    const manager = useService('layers');
    const tools = useService('tools');
    const terrain = useService('terrainProfile');
    const basemaps = useService('basemaps');
    const snapshot = useServiceSnapshot('layers', EMPTY_SNAPSHOT);
    const {
        open, collapsed, docked, style,
        restore: onRestore, onResizeStart, onResizeHeightStart, onDragStart,
    } = usePanel('layers');
    const initial = useMemo(() => readPrefs(), []);
    const [expandedGroups, setExpandedGroups] = useState(() => new Set(initial.expandedGroups));
    const [favorites, setFavorites] = useState(() => new Set(initial.favorites));
    const [query, setQuery] = useState('');
    const [filterMode, setFilterMode] = useState('all');
    const [dragId, setDragId] = useState(null);
    // Wynik sondy „w widoku” jest liczony niżej (po przybliżeniu mapy); filtr czyta go przez ref.
    const coverageRef = useRef({});
    const [coverageKey, setCoverageKey] = useState('');
    const dragIdRef = useRef(null);
    dragIdRef.current = dragId;
    // 17.8.11: stałe funkcje dla wierszy — razem z niezmiennymi obiektami
    // warstw z LayerManagera pozwalają pominąć przerysowanie wierszy, w których
    // nic się nie zmieniło (panel odświeżał się przy każdej partii kafli).
    const actions = useMemo(() => ({
        setVisible: (id, visible) => manager?.setVisibility(id, visible),
        toggleFavorite: (id) => setFavorites((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        }),
        showOnly: (id) => manager?.showOnlyOverlay?.(id),
        move: (id, direction) => manager?.moveLayer(id, direction),
        dragStart: (id) => setDragId(id),
        dragEnd: () => setDragId(null),
        drop: (targetId) => {
            const current = dragIdRef.current;
            if (current && current !== targetId) manager?.reorderOverlay?.(current, targetId);
            setDragId(null);
        },
    }), [manager]);
    const overlayLayers = useMemo(() => snapshot.layers.filter((layer) => layer.role === 'overlay'), [snapshot.layers]);
    const activeLayers = useMemo(() => overlayLayers.filter((layer) => layer.visible), [overlayLayers]);
    const favoriteCount = useMemo(() => overlayLayers.reduce((count, layer) => count + Number(favorites.has(layer.id)), 0), [overlayLayers, favorites]);
    const normalizedQuery = query.trim().toLocaleLowerCase('pl-PL');
    const filteredLayers = useMemo(() => {
        const candidates = filterMode === 'enabled'
            ? overlayLayers.filter((layer) => layer.visible)
            : filterMode === 'inview' ? overlayLayers.filter((layer) => coverageRef.current[layer.id] === 'yes')
            : filterMode === 'favorites' ? overlayLayers.filter((layer) => favorites.has(layer.id)) : overlayLayers;
        return normalizedQuery
            ? candidates.filter((layer) => `${layer.title} ${layer.group} ${layer.description ?? ''} ${layer.serviceName ?? ''} ${layer.attribution?.label ?? ''}`.toLocaleLowerCase('pl-PL').includes(normalizedQuery))
            : candidates;
    }, [overlayLayers, favorites, filterMode, normalizedQuery, coverageKey]);
    // Kolejność grup z katalogu, a nie z kolejności rysowania warstw. Grupa
    // spoza listy trafia na koniec, więc nowa warstwa nigdy nie zniknie.
    const groupedLayers = useMemo(() => {
        const groups = new Map();
        for (const layer of filteredLayers) {
            const current = groups.get(layer.group) ?? [];
            current.push(layer);
            current.sort((a,b) => Number(b.id === 'overlay.egib.arable-classes') - Number(a.id === 'overlay.egib.arable-classes'));
            groups.set(layer.group, current);
        }
        const rank = (group) => {
            const index = OVERLAY_GROUP_ORDER.indexOf(group);
            return index < 0 ? OVERLAY_GROUP_ORDER.length : index;
        };
        return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], 'pl'));
    }, [filteredLayers]);

    useEffect(() => {
        writePrefs({ favorites: [...favorites], expandedGroups: [...expandedGroups] });
    }, [favorites, expandedGroups]);

    // Bieżące przybliżenie mapy — jedyna rzecz, przez którą panel przerenderowuje
    // się przy nawigacji. `mapViewChanged` leci na moveend, a nie na każdą klatkę.
    const zoom = useAppSelector((state) => state.mapView.zoom);
    // 19.14.0: „dane w widoku” dla warstw planistycznych (layerCoverage.js).
    const coverage = useLayerCoverage(overlayLayers, open && !(collapsed && !docked));
    const inViewCount = Object.values(coverage).filter((value) => value === 'yes').length;
    // 19.47.0: w trakcie sprawdzania „…” zamiast 0 (przy starcie licznik pokazywał 0, choć dane były w widoku).
    const inViewChecking = inViewCount === 0 && Object.values(coverage).some((value) => value === 'loading');
    coverageRef.current = coverage;
    const nextCoverageKey = Object.keys(coverage).filter((id) => coverage[id] === 'yes').sort().join(',');
    useEffect(() => { if (nextCoverageKey !== coverageKey) setCoverageKey(nextCoverageKey); }, [nextCoverageKey, coverageKey]);

    if (!open) return null;
    const toggleGroup = (group) => setExpandedGroups((current) => {
        const next = new Set(current);
        if (next.has(group)) next.delete(group); else next.add(group);
        return next;
    });
    const title = t('panel.layers.title');
    if (collapsed && !docked) {
        return _jsx(PanelMinimized, { className: 'layers-panel panel-minimized--layers', title, icon: _jsx(Layers3, { size: 18 }), style, onRestore });
    }

    return _jsxs(PanelShell, {
        className: 'layers-panel layers-panel--v2',
        label: t('layers.panelLabel'),
        docked,
        style,
        icon: _jsx(Layers3, { size: 16 }),
        title,
        subtitle: t('layers.active', { active: activeLayers.length, total: overlayLayers.length }),
        actions: _jsx(PanelHeaderActions, { id: 'layers' }),
        onDragStart, onResizeWidth: onResizeStart, onResizeHeight: onResizeHeightStart, resizeSide: 'right',
        children: [
            snapshot.issues.length > 0 && _jsx(Message, { tone: 'warning', role: 'note', className: 'layers-catalog-warning', title: snapshot.issues.join('\n'), children: t('layers.catalogIssues', { count: snapshot.issues.length }) }, 'issues'),
            _jsxs('div', { className: 'layers-toolbar', children: [
                _jsx(SearchField, { className: 'layers-search', value: query, onChange: setQuery, placeholder: t('layers.search'), ariaLabel: t('layers.search.aria') }),
                _jsx(IconButton, { className: 'layers-off-button', label: t('layers.allOff.hint'), tooltipSide: 'left', disabled: activeLayers.length === 0, onClick: () => manager?.setAllOverlaysVisibility?.(false), children: _jsx(EyeOff, { size: 15 }) }),
            ] }, 'toolbar'),
            _jsxs('div', { className: 'layers-filter-bar', role: 'group', 'aria-label': t('layers.filter.aria'), children: [
                _jsxs('button', { type: 'button', className: `layers-filter${filterMode === 'all' ? ' is-active' : ''}`, 'aria-pressed': filterMode === 'all', onClick: () => setFilterMode('all'), children: [t('layers.filter.all'), _jsx('small', { children: overlayLayers.length })] }),
                _jsxs('button', { type: 'button', className: `layers-filter${filterMode === 'enabled' ? ' is-active' : ''}`, 'aria-pressed': filterMode === 'enabled', onClick: () => setFilterMode('enabled'), children: [t('layers.filter.enabled'), _jsx('small', { children: activeLayers.length })] }),
                _jsxs('button', { type: 'button', className: `layers-filter${filterMode === 'inview' ? ' is-active' : ''}`, 'aria-pressed': filterMode === 'inview', title: 'Warstwy planistyczne (MPZP, POG), które mają dane w obecnym widoku mapy — sprawdzane po zatrzymaniu mapy', onClick: () => setFilterMode('inview'), children: ['W widoku', _jsx('small', { children: inViewChecking ? '…' : inViewCount })] }),
                _jsxs('button', { type: 'button', className: `layers-filter${filterMode === 'favorites' ? ' is-active' : ''}`, 'aria-pressed': filterMode === 'favorites', onClick: () => setFilterMode('favorites'), children: [t('layers.filter.favorites'), _jsx('small', { children: favoriteCount })] }),
            ] }, 'filters'),
            _jsxs('div', { className: 'layers-list', role: 'list', 'aria-label': t('layers.list'), children: [
                groupedLayers.map(([group, layers]) => {
                    const groupCollapsed = !expandedGroups.has(group) && !normalizedQuery && filterMode === 'all';
                    const allGroupLayers = overlayLayers.filter((layer) => layer.group === group);
                    const visibleCount = allGroupLayers.filter((layer) => layer.visible).length;
                    const allOn = visibleCount === allGroupLayers.length || (group === 'Uzbrojenie terenu' && allGroupLayers.some(layer => layer.id === 'overlay.utilities.all' && layer.visible));
                    return _jsxs('section', { className: `layer-group${groupCollapsed ? ' is-collapsed' : ''}`, 'aria-label': group, children: [
                        _jsxs('div', { className: 'layer-group-title', children: [
                            _jsx('input', {
                                type: 'checkbox', className: 'layer-group-checkbox', checked: allOn,
                                'aria-checked': allOn ? true : visibleCount ? 'mixed' : false,
                                'aria-label': `Widoczność grupy ${group}`,
                                title: `${group}: ${allOn ? 'włączone' : visibleCount ? 'częściowo włączone' : 'wyłączone'}`,
                                ref: (node) => { if (node) node.indeterminate = !allOn && visibleCount > 0; },
                                onChange: () => {
                                    if (group === 'Uzbrojenie terenu' && !allOn) manager?.setVisibility('overlay.utilities.all', true);
                                    else for (const layer of allGroupLayers) manager?.setVisibility(layer.id, !allOn);
                                },
                            }),
                            _jsxs('button', { type: 'button', className: 'layer-group-toggle', onClick: () => toggleGroup(group), 'aria-expanded': !groupCollapsed, children: [groupCollapsed ? _jsx(ChevronRight, { size: 13 }) : _jsx(ChevronDown, { size: 13 }), _jsx('span', { children: group }), _jsxs('small', { children: [allOn ? allGroupLayers.length : visibleCount, '/', allGroupLayers.length] })] }),
                        ] }),
                        !groupCollapsed && group === 'Rzeźba i wysokości' && _jsx(Button, {size:'sm', className:'terrain-layer-action', onClick:()=>basemaps?.setActive('basemap.nmt.shaded'), children:'Podkład cieniowany NMT'}),
                        !groupCollapsed && group === 'Rzeźba i wysokości' && _jsx(Button, { size:'sm', className:'terrain-layer-action', onClick:async () => { await tools?.activate('core.terrain.area'); terrain?.setSurfaceMode('slope'); }, children:'Analizuj nachylenie obszaru' }),
                        !groupCollapsed && group === 'Energetyka' && _jsx(Button, {size:'sm', className:'terrain-layer-action', onClick:()=>manager?.setVisibility('overlay.kiut.power',true), children:'Pokaż sieć lokalną KIUT'}),
                        !groupCollapsed && (() => {
                            const renderRow = (layer) => _jsx(LayerRow, { layer, manager, scale: scaleState(layer, zoom), favorite: favorites.has(layer.id), dragging: dragId === layer.id, dragActive: dragId !== null, actions, coverage: coverage[layer.id] ?? null }, layer.id);
                            if (normalizedQuery || filterMode !== 'all') return layers.map(renderRow);
                            const shown = new Set();
                            return layers.map((layer) => {
                                const family = FAMILY_OF.get(layer.id);
                                if (!family) return renderRow(layer);
                                if (shown.has(family.id)) return null;
                                shown.add(family.id);
                                return _jsx(StatusFamilyRow, { family, layers, renderRow, coverage, setVisible: actions.setVisible }, family.id);
                            });
                        })(),
                    ] }, group);
                }),
                filteredLayers.length === 0 && _jsx(EmptyState, { title: normalizedQuery ? t('layers.empty.search') : t('layers.empty') }),
            ] }, 'list'),
        ],
    });
}

/**
 * Legenda warstwy — pobierana przy otwarciu informacji albo aktywacji stref.
 *
 * Spis jest osobnym zapytaniem od samych obrazków, bo kompozycje bywają
 * wielowarstwowe (BDOT10k transport ma 16 warstw). Serwer zwraca spis, a
 * przeglądarka pobiera obrazki normalnym <img> — dzięki temu każda legenda
 * z osobna korzysta z cache przeglądarki i żadna nie blokuje pozostałych.
 */
function KowrCoverage() {
    const [coverage, setCoverage] = useState(null);
    useEffect(() => {
        const scope = requestScope(20000); let active = true;
        fetch('./data/kowr/installations.json', { signal: scope.signal, cache: 'default' })
            .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
            .then((data) => { if (active && Array.isArray(data.records)) {
                const located = data.records.filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat)).length;
                setCoverage({ total: data.records.length, located, missing: data.records.length - located });
            } })
            .catch(() => { if (active) setCoverage(false); }).finally(() => scope.dispose());
        return () => { active = false; scope.controller.abort(); scope.dispose(); };
    }, []);
    return _jsx('p', { className: 'layer-coverage-note', children: coverage ? t('layers.kowrCoverage', coverage) : t('layers.kowrCoverageUnknown') });
}

function LayerLegend({ url, title }) {
    const [state, setState] = useState({ status: 'loading', entries: [], total: 0, error: null });

    useEffect(() => {
        let active = true;
        setState({ status: 'loading', entries: [], total: 0, error: null });
        fetch(url, { cache: 'default' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((data) => {
                if (!active) return;
                const entries = Array.isArray(data?.entries) ? data.entries : [];
                setState({ status: entries.length ? 'ready' : 'empty', entries, total: Number(data?.total) || entries.length, error: null });
            })
            .catch((error) => { if (active) setState({ status: 'error', entries: [], total: 0, error: error.message }); });
        return () => { active = false; };
    }, [url]);

    if (state.status === 'loading') {
        return _jsxs('div', { className: 'layer-legend layer-legend--loading', role: 'status', children: [_jsx(LoaderCircle, { size: 13, className: 'is-spinning', 'aria-hidden': true }), t('layers.legend.loading')] });
    }
    if (state.status === 'error' || state.status === 'empty') {
        return _jsx('div', { className: 'layer-legend layer-legend--empty', children: state.status === 'error' ? t('layers.legend.unavailable') : t('layers.legend.none') });
    }
    const hidden = state.total - state.entries.length;
    return _jsxs('div', { className: 'layer-legend', children: [
        state.entries.map((entry) => _jsx('img', {
            className: 'layer-legend-image',
            src: entry.url,
            alt: t('layers.legend.alt', { title, layer: entry.layer }),
            loading: 'lazy',
            // Pojedyncza warstwa kompozycji może nie mieć legendy, a reszta
            // owszem — brakujący obrazek znika zamiast zostawiać ikonę błędu.
            onError: (event) => { event.currentTarget.style.display = 'none'; },
        }, entry.layer)),
        hidden > 0 ? _jsx('p', { className: 'layer-legend-more', children: t('layers.legend.more', { count: hidden }) }) : null,
    ] });
}

// 18.0: warstwy z legendą widoczną zawsze, gdy są włączone (strefy planistyczne
// bez legendy są nieczytelne). Legenda stoi pod swoją warstwą, nie nad listą.
const ALWAYS_LEGEND = new Set(['overlay.pog.zones', 'overlay.pog.draft.zones']);

function RowMenu({ layer, favorite, actions }) {
    return _jsxs(DropdownMenu.Root, { children: [
        _jsx(DropdownMenu.Trigger, { asChild: true, children: _jsx('button', { type: 'button', className: 'icon-button layer-row-more', 'aria-label': t('layers.more.aria', { title: layer.title }), title: t('layers.more'), children: _jsx(Ellipsis, { size: 15 }) }) }),
        _jsx(DropdownMenu.Portal, { children: _jsxs(DropdownMenu.Content, { className: 'dropdown-content layer-row-menu', sideOffset: 4, align: 'end', children: [
            _jsx(DropdownMenu.Item, { className: 'dropdown-item', onSelect: () => actions.move(layer.id, 'up'), children: 'Przenieś wyżej' }),
            _jsx(DropdownMenu.Item, { className: 'dropdown-item', onSelect: () => actions.move(layer.id, 'down'), children: 'Przenieś niżej' }),
            _jsxs(DropdownMenu.Item, { className: 'dropdown-item dropdown-item--with-icon', onSelect: () => actions.showOnly(layer.id), children: [_jsx(Focus, { size: 15 }), _jsx('span', { children: t('layers.showOnly') })] }),
            _jsxs(DropdownMenu.Item, { className: 'dropdown-item dropdown-item--with-icon', onSelect: () => actions.toggleFavorite(layer.id), children: [_jsx(Star, { size: 15 }), _jsx('span', { children: favorite ? t('layers.favorite.remove') : t('layers.favorite.add') })] }),
        ] }) }),
    ] });
}

const LayerRow = memo(function LayerRow({ layer, manager, scale, favorite, dragging, dragActive, actions, coverage = null }) {
    const [infoOpen, setInfoOpen] = useState(false);
    // `minZoom` trafiał dotąd tylko do OpenLayers, więc warstwa poza zakresem
    // znikała bez słowa. Siedem warstw uzbrojenia terenu wymaga zoomu 17.
    const belowMinZoom = scale < 0;
    const aboveMaxZoom = scale > 0;
    const onToggleVisible = () => actions.setVisible(layer.id, !layer.visible);
    const outOfScale = layer.visible && (belowMinZoom || aboveMaxZoom);
    const minScaleLabel = formatScale(layer.minScale);
    const opacityPercent = Math.round(layer.opacity * 100);
    const loading = layer.status === 'loading';
    const error = layer.status === 'error';
    const telemetry = layer.sourceTelemetry;
    const badge = healthBadge(layer);
    const alwaysLegend = ALWAYS_LEGEND.has(layer.id) && layer.visible && layer.legendUrl;
    const metricTitle = layer.visible ? [
        telemetry?.lastGoodAt ? t('layers.lastGood', { time: new Date(telemetry.lastGoodAt).toLocaleTimeString('pl-PL') }) : null,
        telemetry?.lastTerminalError ?? null,
        error && layer.error ? layer.error : null,
    ].filter(Boolean).join(' · ') : '';
    const stateTitle = `${statusLabel(layer)}${metricTitle ? ` — ${metricTitle}` : ''}${error && layer.error ? ` — ${layer.error}` : ''}`;
    const badgeTitle = badge?.cls === 'warn'
        ? `${stateTitle} — ${t('layers.badge.warnHint')}`
        : stateTitle;
    return _jsxs('article', { className: `layer-row layer-row--compact${error ? ' layer-row--error' : ''}${layer.visible ? ' is-visible' : ''}${outOfScale ? ' layer-row--out-of-scale' : ''}${dragging ? ' is-dragging' : ''}${favorite ? ' is-favorite' : ''}`, role: 'listitem', onDragOver: (event) => { if (dragActive && !dragging) event.preventDefault(); }, onDrop: (event) => { event.preventDefault(); actions.drop(layer.id); }, children: [
        _jsxs('div', { className: 'layer-row-main', children: [
            _jsx('span', { className: 'layer-drag-handle', draggable: true, onDragStart: (event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', layer.id); actions.dragStart(layer.id); }, onDragEnd: actions.dragEnd, title: t('layers.drag'), 'aria-label': t('layers.drag.aria', { title: layer.title }), children: _jsx(GripVertical, { size: 15 }) }),
            // 18.0: przełącznik widoczności wygląda jak pole wyboru — ten sam
            // wzorzec co zaznaczanie całej grupy; „oczko” myliło się z podglądem.
            _jsx('button', { type: 'button', className: `layer-visibility${layer.visible ? ' is-visible' : ''}`, 'aria-label': layer.visible ? t('layers.hide', { title: layer.title }) : t('layers.show', { title: layer.title }), 'aria-pressed': layer.visible, onClick: onToggleVisible, children: loading
                ? _jsx(LoaderCircle, { size: 16, className: 'is-spinning' })
                : _jsx('span', { className: 'layer-visibility-box', 'aria-hidden': true, children: layer.visible ? _jsx(Check, { size: 12, strokeWidth: 3 }) : null }) }),
            // 18.0: klik w nazwę też przełącza widoczność — cały wiersz jest celem
            // (klawiatura: pole wyboru obok).
            _jsxs('div', { className: 'layer-row-copy', onClick: onToggleVisible, children: [_jsxs('div', { className: 'layer-row-titleline', children: [coverage ? _jsx(CoverageDot, { value: coverage }) : null, _jsx('strong', { title: layer.title, children: layer.title }), favorite ? _jsx(Star, { size: 11, className: 'layer-favorite-mark', 'aria-label': t('layers.favorite.mark') }) : null, badge ? _jsx('span', { className: `layer-health-badge layer-health-badge--${badge.cls}`, title: badgeTitle, children: badge.label }) : null] })] }),
            _jsx(IconButton, { label: infoOpen ? t('layers.info.hide') : t('layers.info'), tooltipSide: 'bottom', className: `layer-info-toggle${infoOpen ? ' is-active' : ''}`, 'aria-expanded': infoOpen, onClick: () => setInfoOpen((current) => !current), children: _jsx(Info, { size: 14 }) }),
            _jsx(RowMenu, { layer, favorite, actions }),
        ] }),
        outOfScale && _jsxs('div', { className: 'layer-scale-row', children: [
            _jsx('span', { children: belowMinZoom
                ? (minScaleLabel ? t('layers.scale.from', { scale: minScaleLabel }) : t('layers.scale.zoomIn'))
                : t('layers.scale.zoomOut') }),
            belowMinZoom ? _jsx(Button, { variant: 'ghost', size: 'sm', className: 'layer-scale-action', icon: _jsx(ZoomIn, { size: 12 }), onClick: () => manager?.zoomToLayerMinimum?.(layer.id), children: t('layers.scale.action') }) : null,
        ] }),
        alwaysLegend && _jsx('div', { className: 'zone-legend-panel layer-inline-legend', role: 'region', 'aria-label': t('layers.legend.region', { title: layer.title }), children: _jsx(LayerLegend, { url: layer.legendUrl, title: layer.title }) }),
        infoOpen && _jsxs('div', { className: 'layer-expanded-info', children: [
            layer.description ? _jsx('p', { children: layer.description }) : null,
            layer.attribution?.label ? _jsxs('p', { children: [_jsx('strong', { children: `${t('layers.source')} ` }), layer.attribution.label] }) : null,
            layer.listUrl ? _jsx('a', { href: layer.listUrl, target: '_blank', rel: 'noopener noreferrer', children: t('layers.csv') }) : null,
            layer.serviceName ? _jsxs('p', { children: [_jsx('strong', { children: `${layer.sourceKind?.toUpperCase() ?? 'WMS'}: ` }), layer.serviceName] }) : null,
            layer.visible && !error ? _jsx(RangeField, { className: 'layer-opacity', label: t('layers.opacity'), ariaLabel: t('layers.opacity.aria', { title: layer.title }), min: 0, max: 100, step: 5, value: opacityPercent, format: (value) => `${value}%`, onChange: (value) => manager?.setOpacity(layer.id, Number(value) / 100) }) : null,
            layer.legendUrl && !ALWAYS_LEGEND.has(layer.id) ? _jsx(LayerLegend, { url: layer.legendUrl, title: layer.title }) : null,
        ] }),
        layer.id === 'overlay.kowr.biogas' && layer.visible && _jsx(KowrCoverage, {}),
        error && _jsxs('div', { className: 'layer-error-row', children: [_jsx('span', { title: layer.error ?? undefined, children: t('layers.error') }), _jsx(IconButton, { className: 'layer-error-retry', label: t('layers.retry.aria', { title: layer.title }), tooltipSide: 'left', onClick: () => manager?.retry(layer.id), children: _jsx(RefreshCw, { size: 13 }) })] }),
    ] });
});
