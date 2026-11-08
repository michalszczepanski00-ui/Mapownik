import { mergeOcclusion, fitPaddingWithOcclusion } from './occlusion.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { unByKey } from 'ol/Observable.js';
import { ensureProjectProjectionRegistered, viewToProjectCoordinate } from '../projections/index.js';
import Draw from 'ol/interaction/Draw.js';
import { defaults as interactionDefaults } from 'ol/interaction/defaults.js';

// W pełnej wersji OpenLayers (vendor/static/openlayers.js) `ol.interaction.defaults`
// jest przestrzenią nazw z funkcją `defaults`; w pakiecie ESM — samą funkcją.
const defaultInteractions = typeof interactionDefaults === 'function' ? interactionDefaults : interactionDefaults?.defaults;
import Polygon from 'ol/geom/Polygon.js';
import { beginRasterRequestGeneration } from '../data/sources/resilience/requestCoordinator.js';
import { t } from '../i18n/index.js';
const INITIAL_CENTER_LON_LAT = [19.1451, 51.9194];
const INITIAL_ZOOM = 6.2;
const MIN_ZOOM = 3;
const MAX_ZOOM = 22;

function createBoxGeometryFunction() {
    return (coordinates, geometry) => {
        const start = coordinates?.[0];
        const end = coordinates?.[1];
        if (!Array.isArray(start) || !Array.isArray(end)) return geometry;
        const minX = Math.min(start[0], end[0]);
        const minY = Math.min(start[1], end[1]);
        const maxX = Math.max(start[0], end[0]);
        const maxY = Math.max(start[1], end[1]);
        const ring = [[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY]];
        if (geometry) {
            geometry.setCoordinates([ring]);
            return geometry;
        }
        return new Polygon([ring]);
    };
}
/**
 * Thin owner of the OpenLayers runtime.
 *
 * Step 4 invariant:
 * - this controller owns ol/Map and viewport lifecycle,
 * - it does NOT know OSM/WMS/WMTS or any catalog source kind,
 * - layers are created outside through SourceRegistry and passed in as
 *   already constructed OpenLayers layers.
 */
export class OpenLayersMapController {
    constructor() {
        this.eventKeys = [];
        this.destroyed = false;
        ensureProjectProjectionRegistered();
        this.view = new View({
            center: fromLonLat(INITIAL_CENTER_LON_LAT),
            zoom: INITIAL_ZOOM,
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            enableRotation: false,
        });
        this.map = new Map({
            controls: [],
            // 18.15.1: OpenLayers domyślnie tworzy gesty z `onFocusOnly: true` — gdy
            // element mapy ma tabindex (msportal ma: obsługa klawiatury), przesuwanie
            // palcem/myszą i kółko działają TYLKO, gdy mapa ma fokus. Dotknięcie
            // wyszukiwarki, karty działki czy przycisku zabierało mapie fokus i pierwsze
            // przeciągnięcie nic nie robiło („raz działa, raz nie”). msportal zajmuje
            // cały ekran, więc gesty mapy działają zawsze. Obrót jest wyłączony
            // (enableRotation: false), więc gesty obrotu nie konkurują ze szczypaniem.
            interactions: defaultInteractions({ onFocusOnly: false, altShiftDragRotate: false, pinchRotate: false }),
            layers: [],
            maxTilesLoading: 16,
            moveTolerance: 3,
            view: this.view,
        });
        // Any in-flight raster request targeting the previous viewport is stale
        // once navigation starts. Cancel it before the new generation of tiles
        // is scheduled; this prevents old responses from racing newer ones.
        this.eventKeys.push(this.map.on('movestart', () => beginRasterRequestGeneration('view-change')));
    }
    mount(target) {
        this.assertAlive();
        this.map.setTarget(target);
        this.map.updateSize();
    }
    addLayer(layer) {
        this.assertAlive();
        this.map.addLayer(layer);
    }
    addInteraction(interaction) {
        this.assertAlive();
        this.map.addInteraction(interaction);
        // 18.0: obserwatorzy nowych interakcji (np. bieżący pomiar szkicu),
        // także tych tworzonych dynamicznie przez narzędzia.
        for (const listener of this.interactionListeners ?? []) {
            try { listener(interaction); } catch (error) { console.error('[interakcja]', error); }
        }
    }
    /** 18.0: powiadamia o każdej interakcji dodanej przez addInteraction(). */
    onInteractionAdded(listener) {
        if (!this.interactionListeners) this.interactionListeners = new Set();
        this.interactionListeners.add(listener);
        return () => this.interactionListeners.delete(listener);
    }
    removeInteraction(interaction) {
        if (this.destroyed)
            return;
        this.map.removeInteraction(interaction);
    }
    removeLayer(layer) {
        if (this.destroyed)
            return;
        this.map.removeLayer(layer);
    }
    updateSize() {
        if (this.destroyed || !this.map.getTarget())
            return;
        this.map.updateSize();
    }
    zoomBy(delta) {
        var _a;
        this.assertAlive();
        const current = (_a = this.view.getZoom()) !== null && _a !== void 0 ? _a : INITIAL_ZOOM;
        this.view.setZoom(this.clampZoom(current + delta));
    }
    resetView() {
        this.assertAlive();
        this.view.setCenter(fromLonLat(INITIAL_CENTER_LON_LAT));
        this.view.setZoom(INITIAL_ZOOM);
    }
    setViewState(state) {
        this.assertAlive();
        const [x, y] = state.center3857;
        if (Number.isFinite(x) && Number.isFinite(y))
            this.view.setCenter([x, y]);
        if (Number.isFinite(state.zoom))
            this.view.setZoom(this.clampZoom(state.zoom));
    }
    /**
     * 18.10 — część mapy przykryta panelem (piksele CSS od prawej i od dołu).
     * Dopasowanie widoku dolicza ją do marginesu, żeby obiekt nie trafiał pod
     * panel. Ustawia ją powłoka (RightPanelDock), kontroler tylko zapamiętuje.
     */
    setOcclusion(inset) {
        this.occlusion = mergeOcclusion(this.occlusion, inset);
    }
    fitExtent(extent, options = {}) {
        var _a, _b, _c;
        this.assertAlive();
        const size = this.map.getSize();
        const [top, right, bottom, left] = (_c = options.padding) !== null && _c !== void 0 ? _c : [64, 64, 64, 64];
        const fitPadding = fitPaddingWithOcclusion([top, right, bottom, left], this.occlusion, size);
        this.view.fit(extent, {
            size,
            maxZoom: (_a = options.maxZoom) !== null && _a !== void 0 ? _a : 18,
            duration: (_b = options.duration) !== null && _b !== void 0 ? _b : 250,
            padding: fitPadding,
        });
    }
    getViewportExtent2180() {
        this.assertAlive();
        const size = this.map.getSize();
        if (!size) throw new Error(t('map.mapaNieMaJeszczeUstalonego'));
        const extent = this.view.calculateExtent(size);
        return this.transformExtentToProject(extent);
    }
    selectBoxExtent(onSelected, onFinished = null) {
        this.assertAlive();
        if (typeof onSelected !== 'function') throw new Error('Brak callbacku wyboru obszaru.'); // dev: błąd programisty, nie komunikat dla użytkownika
        const previousInteractions = this.map.getInteractions().getArray().map((item) => [item, item.getActive()]);
        for (const [item] of previousInteractions) item.setActive(false);
        const interaction = new Draw({ type: 'Circle', geometryFunction: createBoxGeometryFunction(), stopClick: true });
        this.map.addInteraction(interaction);
        let finished = false;
        const cleanup = () => {
            if (finished) return;
            finished = true;
            this.map.removeInteraction(interaction);
            for (const [item, wasActive] of previousInteractions) {
                if (this.map.getInteractions().getArray().includes(item)) item.setActive(wasActive);
            }
            document.removeEventListener('keydown', onKeyDown, true);
            try { onFinished?.(); } catch {}
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') cleanup();
        };
        document.addEventListener('keydown', onKeyDown, true);
        interaction.once('drawend', (event) => {
            try {
                const extent = event.feature.getGeometry()?.getExtent();
                if (!extent) throw new Error(t('map.nieUdaloSieOdczytacZaznaczonego'));
                onSelected(this.transformExtentToProject(extent));
            } finally {
                window.setTimeout(cleanup, 0);
            }
        });
        return cleanup;
    }
    transformExtentToProject(extent) {
        const [minX, minY, maxX, maxY] = extent;
        const corners = [
            viewToProjectCoordinate([minX, minY]),
            viewToProjectCoordinate([minX, maxY]),
            viewToProjectCoordinate([maxX, minY]),
            viewToProjectCoordinate([maxX, maxY]),
        ];
        return [
            Math.min(...corners.map((point) => point[0])),
            Math.min(...corners.map((point) => point[1])),
            Math.max(...corners.map((point) => point[0])),
            Math.max(...corners.map((point) => point[1])),
        ];
    }
    coordinateFromBrowserEvent(event) {
        this.assertAlive();
        const pixel = this.map.getEventPixel(event);
        const coordinate = this.map.getCoordinateFromPixel(pixel);
        if (!coordinate) return null;
        const coordinate3857 = coordinate.slice();
        return {
            pixel: pixel.slice(),
            coordinate3857,
            coordinate2180: viewToProjectCoordinate(coordinate3857),
            coordinateLonLat: toLonLat(coordinate3857),
        };
    }
    getViewSnapshot() {
        var _a, _b, _c;
        const center3857 = (_b = (_a = this.view.getCenter()) === null || _a === void 0 ? void 0 : _a.slice()) !== null && _b !== void 0 ? _b : fromLonLat(INITIAL_CENTER_LON_LAT);
        return {
            zoom: (_c = this.view.getZoom()) !== null && _c !== void 0 ? _c : INITIAL_ZOOM,
            center3857,
            centerLonLat: toLonLat(center3857),
        };
    }
    onMoveEnd(listener) {
        this.assertAlive();
        listener(this.getViewSnapshot());
        const key = this.map.on('moveend', () => listener(this.getViewSnapshot()));
        this.eventKeys.push(key);
        return () => this.removeEventKey(key);
    }
    onPointerMove(listener) {
        this.assertAlive();
        const key = this.map.on('pointermove', (event) => {
            if (event.dragging) {
                listener(null);
                return;
            }
            const coordinate3857 = event.coordinate.slice();
            listener({
                coordinate3857,
                coordinate2180: viewToProjectCoordinate(coordinate3857),
                coordinateLonLat: toLonLat(coordinate3857),
            });
        });
        this.eventKeys.push(key);
        return () => this.removeEventKey(key);
    }
    getFeaturesAtPixel(pixel, options = {}) {
        this.assertAlive();
        if (!Array.isArray(pixel)) return [];
        const layer = options.layer ?? null;
        return this.map.getFeaturesAtPixel(pixel, {
            hitTolerance: Number.isFinite(options.hitTolerance) ? options.hitTolerance : 4,
            layerFilter: layer ? (candidate) => candidate === layer : undefined,
        });
    }
    onSingleClick(listener) {
        this.assertAlive();
        const key = this.map.on('singleclick', (event) => {
            // 19.33.0: kliknięcie w punkt narzędzia (Ceny, Budowy, ceny w Raporcie) należy tylko do narzędzia —
            // nie uruchamia sprawdzania działki pod spodem (warstwy z właściwością mapownikClickPriority).
            const toolHit = event.pixel && this.map.forEachFeatureAtPixel(event.pixel, (feature) => (feature.get('clickPassThrough') ? undefined : true),
                { layerFilter: (layer) => layer.get('mapownikClickPriority') === true, hitTolerance: 5 });
            if (toolHit) return;
            const coordinate3857 = event.coordinate.slice();
            listener({
                pixel: event.pixel?.slice?.() ?? this.map.getPixelFromCoordinate(coordinate3857),
                coordinate3857,
                coordinate2180: viewToProjectCoordinate(coordinate3857),
                coordinateLonLat: toLonLat(coordinate3857),
            });
        });
        this.eventKeys.push(key);
        return () => this.removeEventKey(key);
    }
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        if (this.eventKeys.length > 0) {
            unByKey(this.eventKeys.splice(0));
        }
        this.map.setTarget(undefined);
        this.map.getLayers().clear();
        this.map.getOverlays().clear();
    }
    removeEventKey(key) {
        const index = this.eventKeys.indexOf(key);
        if (index >= 0)
            this.eventKeys.splice(index, 1);
        unByKey(key);
    }
    clampZoom(value) {
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    }
    assertAlive() {
        if (this.destroyed) {
            throw new Error('OpenLayersMapController has already been destroyed.');
        }
    }
}
