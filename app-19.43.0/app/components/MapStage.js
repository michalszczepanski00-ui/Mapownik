import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { summarizeLayers } from '../../layers/layerSummary.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleDashed, Activity, Home, Layers3, LoaderCircle, Crosshair, LocateFixed, Minus, MousePointer2, Plus, ZoomIn, X } from 'lucide-react';
import { dataCatalog } from '../../data/catalog/index.js';
import { MapRuntime } from '../../runtime/index.js';
import { MapContextMenu } from './MapContextMenu.js';
import { StatusSlotItems } from './StatusSlotItems.js';
import { SourceHealthPanel } from './SourceHealthPanel.js';
import { MapScaleBar } from './MapScaleBar.js';
import { formatScale, niceScaleDenominator } from '../../projections/mapScale.js';
import { mapRuntimeStarted, mapRuntimeStopped, mapViewChanged, useAppDispatch, useAppSelector } from '../../store/index.js';
import { useService, useServiceHub, useServiceSnapshot } from '../services/AppServicesContext.js';
import { t } from '../../i18n/index.js';

const EMPTY_TOOLS_SNAPSHOT = Object.freeze({ items: [], loadingCount: 0, errorCount: 0 });
import { hasRecentSourceIssue, sourceIsDown } from '../../data/sources/adapters/healthState.js';
function downloadEmergencyBackup(transfers) {
    if (!transfers)
        return;
    // GeoJSON export reads straight from the in-memory ObjectManager
    // (exportObjects()) and never touches the repository/IndexedDB — the
    // one export path that still works when local persistence itself is
    // what's broken. The full .mapownik export goes through
    // session.exportProjectData() -> repository.loadProject(), which would
    // hit the very storage that just failed.
    transfers.exportGeoJson('EPSG:2180').then((result) => {
        const url = URL.createObjectURL(new Blob([result.text], { type: 'application/geo+json;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = result.filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch(() => { /* the transfer manager already records this as its own error */ });
}
const INITIAL_PERSISTENCE_SNAPSHOT = {
    status: 'idle',
    error: null,
    lastSavedAt: null,
    restoredObjectCount: 0,
    issues: [],
    readOnly: false,
};
const INITIAL_EDITING_SNAPSHOT = {
    mode: 'pan',
    drawing: false,
    modifying: false,
    suspended: false,
    selectedId: null,
    snapTargetCount: 0,
    error: null,
};
const INITIAL_MEASUREMENT_SNAPSHOT = {
    mode: null,
    drawing: false,
    count: 0,
    selectedCount: 0,
    error: null,
};
const INITIAL_BUFFER_SNAPSHOT = {
    active: false,
    distanceMeters: 25,
    busy: false,
    error: null,
    lastCreatedId: null,
};
const INITIAL_PARCEL_SNAPSHOT = {
    active: false,
    busy: false,
    error: null,
    lastParcelLabel: null,
    lastCreatedId: null,
};
const INITIAL_IDENTIFY_SNAPSHOT = {
    active: false,
    open: false,
    pinned: false,
    busy: false,
    parcelBusy: false,
    completed: 0,
    total: 0,
    error: null,
    coordinate2180: null,
    coordinateLonLat: null,
    parcel: null,
    parcelAreaSqm: null,
    parcelError: null,
    layers: [],
};
const INITIAL_LAYER_SNAPSHOT = {
    catalogVersion: dataCatalog.catalogVersion,
    issues: dataCatalog.issues.map((issue) => issue.id ? `${issue.id}: ${issue.message}` : issue.message),
    layers: dataCatalog.layers.map((definition, index) => ({
        id: definition.id,
        title: definition.title,
        group: definition.group,
        visible: definition.visible,
        opacity: definition.opacity,
        order: index,
        status: 'idle',
        error: null,
        role: definition.role,
        sourceKind: definition.source.kind,
        loadMs: null,
        sourceTelemetry: null,
        capabilities: definition.capabilities,
        attribution: definition.attribution,
    })),
};
// 17.8.11: formatter współdzielony — wywoływany przy każdym ruchu kursora.
const PL_INTEGER = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
function formatCoordinate(value) {
    return Number.isFinite(value) ? PL_INTEGER.format(Math.round(value)) : '—';
}
export function MapStage({ focusMap = false, mapOnly = false }) {
    const hostRef = useRef(null);
    const runtimeRef = useRef(null);
    const xRef = useRef(null);
    const yRef = useRef(null);
    const pointerFrameRef = useRef(null);
    const pendingPointerRef = useRef(null);
    const dispatch = useAppDispatch();
    const services = useServiceHub();
    // Pobrane z huba, a nie z runtimeRef: odczyt refa w trakcie renderu nie
    // odświeżałby panelu po zamontowaniu runtime'u.
    // Kursor mapy zależy od trybu działki / identyfikacji (klasy map-host).
    const parcelSnapshot = useServiceSnapshot('parcels', INITIAL_PARCEL_SNAPSHOT);
    const identifySnapshot = useServiceSnapshot('identify', INITIAL_IDENTIFY_SNAPSHOT);
    // 17.8.13: pasek stanu pokazuje aktywne narzędzie z rejestru narzędzi,
    // a nie tylko tryb edycji (przy Informacji o działce stało tam „Pan”).
    const toolsSnapshot = useServiceSnapshot('tools', EMPTY_TOOLS_SNAPSHOT);
    const viewStatus = useAppSelector((state) => state.mapView);
    const ready = viewStatus.ready;
    const [layerManager, setLayerManager] = useState(null);
    const [layerSnapshot, setLayerSnapshot] = useState(INITIAL_LAYER_SNAPSHOT);
    const [persistenceSnapshot, setPersistenceSnapshot] = useState(INITIAL_PERSISTENCE_SNAPSHOT);
    const [editingSnapshot, setEditingSnapshot] = useState(INITIAL_EDITING_SNAPSHOT);
    const [sourceHealthOpen, setSourceHealthOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const closeSourceHealth = useCallback(() => setSourceHealthOpen(false), []);
    const closeContextMenuState = useCallback(() => setContextMenu(null), []);
    // 17.8.11: podkład pierwszy (przy skracaniu paska jego podpis zostaje
    // widoczny — wymóg licencji OSM), bez powtórzeń tej samej etykiety.
    const loadedAttributions = useMemo(() => {
        const seen = new Set();
        return layerSnapshot.layers
            .filter((layer) => layer.visible && layer.status === 'ready' && layer.attribution)
            .sort((a, b) => (a.role === 'basemap' ? 0 : 1) - (b.role === 'basemap' ? 0 : 1))
            .filter((layer) => (seen.has(layer.attribution.label) ? false : (seen.add(layer.attribution.label), true)))
            .map((layer) => ({ id: layer.id, ...layer.attribution }));
    }, [layerSnapshot.layers]);
    useEffect(() => {
        const target = hostRef.current;
        if (!target)
            return;
        const runtime = new MapRuntime();
        let active = true;
        runtimeRef.current = runtime;
        dispatch(mapRuntimeStarted());
        runtime.mount(target);
        setLayerManager(runtime.layerManager);
        setLayerSnapshot(runtime.layerManager.getSnapshot());
        setPersistenceSnapshot(runtime.projectSession.getSnapshot());
        // 18.0: publikacja całej mapy serwisów runtime (rdzeń + funkcje z
        // features/). Nowa funkcja nie dopisuje się tutaj do żadnej listy.
        services.publish({ ...runtime.services, featureContext: runtime.context });
        setEditingSnapshot(runtime.editingManager.getSnapshot());
        const unsubscribeLayers = runtime.layerManager.subscribe(() => {
            if (active)
                setLayerSnapshot(runtime.layerManager.getSnapshot());
        });
        const unsubscribePersistence = runtime.projectSession.subscribe(() => {
            if (active)
                setPersistenceSnapshot(runtime.projectSession.getSnapshot());
        });
        const unsubscribeEditing = runtime.editingManager.subscribe(() => {
            if (active)
                setEditingSnapshot(runtime.editingManager.getSnapshot());
        });
        const unsubscribeMove = runtime.controller.onMoveEnd((snapshot) => {
            dispatch(mapViewChanged(snapshot));
        });
        const flushPointer = () => {
            pointerFrameRef.current = null;
            const snapshot = pendingPointerRef.current;
            const x = xRef.current;
            const y = yRef.current;
            if (!x || !y)
                return;
            if (!snapshot) {
                x.textContent = 'X: —';
                y.textContent = 'Y: —';
                return;
            }
            x.textContent = `X: ${formatCoordinate(snapshot.coordinate2180[0])}`;
            y.textContent = `Y: ${formatCoordinate(snapshot.coordinate2180[1])}`;
        };
        const unsubscribePointer = runtime.controller.onPointerMove((snapshot) => {
            pendingPointerRef.current = snapshot;
            if (pointerFrameRef.current !== null)
                return;
            pointerFrameRef.current = window.requestAnimationFrame(flushPointer);
        });
        const clearPointer = () => {
            pendingPointerRef.current = null;
            if (pointerFrameRef.current !== null)
                return;
            pointerFrameRef.current = window.requestAnimationFrame(flushPointer);
        };
        const handleContextMenu = (event) => {
            event.preventDefault();
            const coordinate = runtime.controller.coordinateFromBrowserEvent(event);
            if (!coordinate) return;
            setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 200), y: Math.min(event.clientY, window.innerHeight - 145), ...coordinate });
        };
        const closeContextMenu = () => setContextMenu(null);
        target.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('pointerdown', closeContextMenu);
        target.addEventListener('pointerleave', clearPointer);
        const resizeObserver = new ResizeObserver(() => runtime.controller.updateSize());
        resizeObserver.observe(target);
        void runtime.restoreAndStart();
        return () => {
            active = false;
            resizeObserver.disconnect();
            target.removeEventListener('pointerleave', clearPointer);
            target.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('pointerdown', closeContextMenu);
            unsubscribePointer();
            unsubscribeMove();
            unsubscribeLayers();
            unsubscribePersistence();
            unsubscribeEditing();
            if (pointerFrameRef.current !== null) {
                window.cancelAnimationFrame(pointerFrameRef.current);
                pointerFrameRef.current = null;
            }
            services.clear();
            setLayerManager((current) => current === runtime.layerManager ? null : current);
            if (runtimeRef.current === runtime)
                runtimeRef.current = null;
            dispatch(mapRuntimeStopped());
            void runtime.dispose();
        };
    }, [dispatch, services]);
    const layerSummary = summarizeLayers(layerSnapshot.layers);
    const runtimeErrors = layerSnapshot.layers.filter((layer) => layer.status === 'error');
    const catalogHealthy = layerSnapshot.issues.length === 0 && runtimeErrors.length === 0;
    const healthTitle = [
        ...layerSnapshot.issues,
        ...runtimeErrors.map((layer) => `${layer.id}: ${layer.error ?? t('map.health.sourceError')}`),
    ].join('\n') || t('map.health.ok');
    const projectStatusTitle = [
        ...persistenceSnapshot.issues,
        persistenceSnapshot.error,
    ].filter(Boolean).join('\n') || (
        persistenceSnapshot.status === 'error' ? t('map.project.error') :
        persistenceSnapshot.readOnly ? t('map.project.readOnly') :
        persistenceSnapshot.status === 'loading' ? t('map.project.loading') :
        persistenceSnapshot.status === 'saving' ? t('map.project.saving') :
        t('map.project.ok')
    );
    const activeTools = toolsSnapshot.items.filter((tool) => tool.active);
    const activeTool = activeTools.find((tool) => tool.id !== 'core.pan') ?? activeTools[0] ?? null;
    const editingModeTitle = editingSnapshot.error ?? (
        editingSnapshot.drawing ? t('map.mode.drawing') :
        editingSnapshot.modifying ? t('map.mode.modifying') :
        activeTool ? `${activeTool.title}${activeTool.description ? ` — ${activeTool.description}` : ''}` :
        t('map.mode.pan')
    );
    const editingShortLabel = editingSnapshot.drawing ? t('map.mode.drawing.short') :
        editingSnapshot.modifying ? t('map.mode.modifying.short') :
        activeTool?.id === 'core.pan' ? t('map.mode.pan.short') :
        activeTool?.title ?? t('map.mode.pan.short');
    const visibleBasemaps = layerSnapshot.layers.filter((layer) => layer.role === 'basemap' && layer.visible);
    const sourceLayer = visibleBasemaps.find((layer) => layer.status === 'loading')
        ?? visibleBasemaps.find((layer) => layer.status === 'ready')
        ?? visibleBasemaps[0]
        ?? null;
    const sourceTelemetry = sourceLayer?.sourceTelemetry ?? null;
    const sourceTransport = sourceTelemetry?.transport
        ?? (sourceLayer?.sourceKind === 'fast-wmts' ? 'WMTS' : sourceLayer?.sourceKind === 'wms' ? 'WMS' : sourceLayer?.sourceKind?.toUpperCase())
        ?? t('map.source.generic');
    const sourceLoadMs = sourceLayer?.loadMs ?? null;
    const sourceDown = sourceIsDown(sourceTelemetry);
    const sourceDegraded = !sourceDown && hasRecentSourceIssue(sourceTelemetry);
    const sourceBusy = sourceLayer?.status === 'loading' || (sourceTelemetry?.inFlight ?? 0) > 0;
    const sourceStatusClass = sourceLayer?.status === 'error' || sourceDown ? 'status-item--error' : sourceDegraded ? 'status-item--warning' : sourceBusy ? 'status-item--busy' : 'status-item--ok';
    const sourceStatusTitle = sourceLayer ? [
        t('map.source.basemap', { title: sourceLayer.title }),
        sourceLayer?.status === 'error' || sourceDown ? t('map.source.down') : sourceDegraded ? t('map.source.degraded') : sourceBusy ? t('map.source.loading') : t('map.source.ok'),
        sourceTransport ? t('map.source.transport', { transport: sourceTransport }) : null,
        Number.isFinite(sourceLoadMs) ? t('map.source.firstRender', { time: sourceLoadMs < 1000 ? `${sourceLoadMs} ms` : `${(sourceLoadMs / 1000).toFixed(1)} s` }) : null,
        t('map.source.tileErrors', { count: Number(sourceTelemetry?.tileErrors ?? 0) }),
        t('map.source.fallbacks', { count: Number(sourceTelemetry?.fallbackCount ?? 0) }),
        t('map.source.circuit', { state: sourceTelemetry?.circuitState ?? '—' }),
        sourceTelemetry?.cacheStatus === 'STALE' ? t('map.source.staleUsed') : t('map.source.stale', { count: sourceTelemetry?.staleHits ?? 0 }),
        sourceTelemetry?.lastGoodAt ? t('map.source.lastGood', { time: new Date(sourceTelemetry.lastGoodAt).toLocaleTimeString('pl-PL') }) : null,
        sourceLayer.error,
    ].filter(Boolean).join('\n') : t('map.source.none');

    return (_jsxs("section", {
        className: "map-stage",
        "aria-label": t('map.label'),
        children: [
            _jsx("div", {
                ref: hostRef,
                className: `map-host${parcelSnapshot.active ? ' is-parcel-mode' : ''}${identifySnapshot.active ? ' is-identify-mode' : ''}`,
                // 18.11.1: kursor zależny od narzędzia (CSS: krzyżyk przy rysowaniu, łapka przy przesuwaniu).
                'data-active-tool': (toolsSnapshot.items.find((item) => item.active && item.id !== 'core.pan') ?? toolsSnapshot.items.find((item) => item.active))?.id ?? 'core.pan',
                tabIndex: 0,
                // 19.43.0 (audyt A6): element z etykietą i fokusem musi mieć rolę (WCAG 4.1.2).
                role: 'application',
                "aria-roledescription": 'mapa',
                "aria-label": t('map.host')
            }),
            !ready && (_jsx("div", { className: "map-stage-loading", role: "status", "aria-live": "polite", children: t('map.starting') })),
            (persistenceSnapshot.status === 'error' || persistenceSnapshot.readOnly) && _jsxs('div', {
                className: 'map-persistence-banner',
                role: 'alert',
                children: [
                    _jsxs('span', { className: 'map-persistence-banner-text', children: [
                        _jsx(X, { size: 14 }),
                        persistenceSnapshot.status === 'error' ? t('map.banner.notSaved') : t('map.banner.otherTab'),
                    ] }),
                    _jsx('button', {
                        type: 'button',
                        className: 'map-persistence-banner-action',
                        onClick: () => downloadEmergencyBackup(runtimeRef.current?.projectTransfers),
                        children: t('map.banner.backup'),
                    }),
                ],
            }),
            !focusMap && !mapOnly && _jsx(SourceHealthPanel, { open: sourceHealthOpen, manager: layerManager, onClose: closeSourceHealth }),
            !focusMap && !mapOnly && contextMenu && _jsx(MapContextMenu, { place: contextMenu, onClose: closeContextMenuState }),
            focusMap && _jsx('div', { className: 'map-selection-hint', role: 'status', children: t('map.exportSelection') }),
            !focusMap && !mapOnly && _jsxs("div", {
                className: "map-view-controls",
                "aria-label": t('map.view.label'),
                children: [
                    _jsx("button", { type: "button", onClick: () => runtimeRef.current?.controller.zoomBy(1), "aria-label": t('map.view.zoomIn'), children: _jsx(Plus, { size: 17 }) }),
                    _jsx("button", { type: "button", onClick: () => runtimeRef.current?.controller.zoomBy(-1), "aria-label": t('map.view.zoomOut'), children: _jsx(Minus, { size: 17 }) }),
                    _jsx("button", { type: "button", onClick: () => runtimeRef.current?.controller.resetView(), "aria-label": t('map.view.reset'), children: _jsx(Home, { size: 16 }) })
                ]
            }),
            !focusMap && ready && _jsx(MapScaleBar, { zoom: viewStatus.zoom, latitude: viewStatus.centerLonLat[1] }),
            !focusMap && _jsxs("footer", {
                className: "map-statusbar",
                children: [
                    // 18.0: każda wartość z krótką etykietą (wcześniej „2180”, „6.2”, „1/1” bez opisu).
                    _jsxs("span", { className: "status-item status-crs", title: t('status.crs.title'), children: [_jsx(Crosshair, { size: 12 }), _jsx("span", { className: "status-label", children: t('status.crs') }), "EPSG:2180"] }),
                    _jsx("span", { className: "status-separator" }),
                    _jsx("span", { ref: xRef, className: "status-item status-coordinate", title: t('status.x.title'), children: "X: —" }),
                    _jsx("span", { ref: yRef, className: "status-item status-coordinate", title: t('status.y.title'), children: "Y: —" }),
                    _jsx("span", { className: "status-separator" }),
                    _jsxs("span", { className: "status-item status-zoom", title: t('status.zoom.title', { zoom: viewStatus.zoom.toFixed(1) }), children: [_jsx(ZoomIn, { size: 12 }), _jsx("span", { className: "status-label", children: t('status.zoom') }), viewStatus.zoom.toLocaleString('pl-PL', { maximumFractionDigits: 1, minimumFractionDigits: 1 })] }),
                    // 19.0.0: skala „1:x" obok poziomu przybliżenia (liczona dla szerokości środka mapy).
                    _jsxs("span", { className: "status-item status-scale", title: t('status.scale.title'), children: [_jsx("span", { className: "status-label", children: t('status.scale') }), formatScale(niceScaleDenominator(viewStatus.zoom, viewStatus.centerLonLat[1])) ?? '—'] }),
                    _jsx("span", { className: "status-separator" }),
                    _jsxs("span", {
                        className: `status-item status-layers ${catalogHealthy ? 'status-item--ok' : 'status-item--error'}`,
                        title: healthTitle,
                        children: [_jsx(Layers3, { size: 12 }), _jsx("span", { className: "status-label", children: t('status.layers') }), layerSummary.loading > 0 ? t('status.layers.loading', { active: layerSummary.active, loading: layerSummary.loading }) : t('status.layers.value', { active: layerSummary.active })]
                    }),
                    sourceLayer && _jsx("span", { className: "status-separator" }),
                    sourceLayer && _jsxs("button", {
                        type: "button",
                        className: `status-item status-source status-source-button ${sourceStatusClass}${sourceHealthOpen ? ' is-active' : ''}`,
                        title: `${sourceStatusTitle}\n${t('status.source.open')}`,
                        'aria-label': t('status.source.label'),
                        'aria-expanded': sourceHealthOpen,
                        onClick: () => setSourceHealthOpen((value) => !value),
                        children: [_jsx(Activity, { size: 12 }), sourceLayer?.status === 'error' ? t('status.source.down') : sourceDegraded ? t('status.source.degraded') : sourceBusy ? t('status.source.loading') : t('status.source.ok')]
                    }),
                    _jsx("span", { className: "status-spacer" }),
                    _jsxs("span", {
                        className: "status-item status-center",
                        title: t('status.center.title'),
                        children: [_jsx(LocateFixed, { size: 12 }), `${viewStatus.centerLonLat[1].toFixed(4)}°, ${viewStatus.centerLonLat[0].toFixed(4)}°`]
                    }),
                    // 17.8.11: atrybucje we wspólnym, skracanym kontenerze.
                    loadedAttributions.length > 0 && _jsx("span", {
                        className: "status-attributions",
                        title: loadedAttributions.map((attribution) => attribution.label).join('\n'),
                        children: loadedAttributions.map((attribution) => attribution.url
                            ? _jsx("a", { className: "map-attribution", href: attribution.url, target: "_blank", rel: "noreferrer", children: attribution.label }, attribution.id)
                            : _jsx("span", { className: "map-attribution", children: attribution.label }, attribution.id)),
                    }),
                    _jsx("span", { className: "status-separator" }),
                    _jsx("span", {
                        className: `status-item status-project-icon ${persistenceSnapshot.status === 'error' ? 'status-item--error' : persistenceSnapshot.readOnly ? 'status-item--warning' : (persistenceSnapshot.status === 'saving' || persistenceSnapshot.status === 'loading' ? 'status-item--busy' : 'status-item--ok')}`,
                        title: projectStatusTitle,
                        'aria-label': projectStatusTitle,
                        role: 'img',
                        children: persistenceSnapshot.status === 'error'
                            ? _jsx(X, { size: 13 })
                            : persistenceSnapshot.readOnly
                                ? _jsx(CircleDashed, { size: 13 })
                                : (persistenceSnapshot.status === 'saving' || persistenceSnapshot.status === 'loading')
                                    ? _jsx(LoaderCircle, { size: 13, className: "is-spinning" })
                                    : _jsx(Check, { size: 13 })
                    }),
                    _jsx("span", { className: "status-separator" }),
                    _jsxs("span", {
                        className: "status-item status-mode",
                        title: editingModeTitle,
                        children: [_jsx(MousePointer2, { size: 12 }), editingShortLabel]
                    }),
                    // 18.0: pozycje funkcji (bufor, działka, pomiar…) ze slotu statusItems.
                    _jsx(StatusSlotItems, {}),
                ]
            })
        ]
    }));
}
