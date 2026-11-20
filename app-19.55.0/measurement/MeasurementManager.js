import Feature from 'ol/Feature.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import { toViewGeometry } from '../objects/geometryConversion.js';
import Draw from 'ol/interaction/Draw.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import Text from 'ol/style/Text.js';
import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import { unByKey } from 'ol/Observable.js';
import { fromViewGeometry } from '../objects/index.js';
import { MAP_STYLE_TOKENS } from '../core/index.js';
import { t } from '../i18n/index.js';
import { formatArea, formatLength } from '../core/units.js';

// 18.0: jeden neutralny kolor pomiarów (grafit) — patrz core/object/mapStyleTokens.js.
const MEASURE_COLOR = MAP_STYLE_TOKENS.measurement;
function projectMeasurementLabel(geometry) {
    if (geometry.type === 'LineString') return formatLength(new LineString(geometry.coordinates).getLength());
    if (geometry.type === 'Polygon') return formatArea(new Polygon(geometry.coordinates).getArea());
    return null;
}
function measurementLabel(geometry) {
    try { return projectMeasurementLabel(fromViewGeometry(geometry)); }
    catch { return null; }
}

/** Persistent measurement tool. Finished measurements become normal msportal objects. */
export class MeasurementManager {
    constructor(host, objectManager, objectCommands) {
        this.eventKeys = [];
        this.listeners = new Set();
        this.disposed = false;
        this.host = host;
        this.objectManager = objectManager;
        this.objectCommands = objectCommands;
        this.temporarySource = new VectorSource({ wrapX: false });
        this.temporaryLayer = new VectorLayer({ source: this.temporarySource, zIndex: 10015, properties: { mapownikRole: 'temporary-measurement' }, style: (feature) => this.styleFor(feature) });
        host.addLayer(this.temporaryLayer);
        // 19.47.0: domyślnie pomiar tymczasowy — nie trafia do panelu Obiekty; zapis do projektu przyciskiem albo przełącznikiem „Pomiar”.
        this.snapshot = { temporary: true, temporaryResult: null, mode: null, drawing: false, count: 0, selectedCount: 0, error: null };
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => { this.assertAlive(); this.listeners.add(listener); return () => this.listeners.delete(listener); };
        this.lineInteraction = this.createDrawInteraction('LineString', 'length');
        this.areaInteraction = this.createDrawInteraction('Polygon', 'area');
        this.host.addInteraction(this.lineInteraction);
        this.host.addInteraction(this.areaInteraction);
        this.lineInteraction.setActive(false);
        this.areaInteraction.setActive(false);
        this.unsubscribeObjects = this.objectManager.subscribe(() => this.syncFromObjects());
        // Skrót Delete NIE należy już do tego menedżera. Obsługiwał tu tylko
        // pomiary, więc ten sam klawisz nad wymiarem usuwał, a nad budynkiem
        // nie robił nic. Właścicielem jest teraz polecenie core.delete
        // (features/builtin/coreFeature.js), które usuwa dowolny zaznaczony obiekt.
        this.syncFromObjects();
    }
    setTemporary(value) { this.updateSnapshot({ temporary: Boolean(value) }); }
    recordMeasurement(input) {
        if (this.snapshot.temporary) {
            this.temporaryInput = structuredClone(input);
            this.temporarySource.clear();
            this.temporarySource.addFeature(new Feature({ geometry: toViewGeometry(input.geometry) }));
            this.updateSnapshot({ temporaryResult: input.name });
            return null;
        }
        const id = this.objectCommands.create(input); this.objectManager.select(id); return id;
    }
    saveTemporary() {
        if (!this.temporaryInput) return null;
        const id = this.objectCommands.create(this.temporaryInput); this.clearTemporary(); this.objectManager.select(id); return id;
    }
    clearTemporary() { this.temporaryInput = null; this.temporarySource.clear(); this.updateSnapshot({ temporaryResult: null }); }
    activate(mode) {
        this.assertAlive();
        this.lineInteraction.setActive(mode === 'line');
        this.areaInteraction.setActive(mode === 'area');
        this.updateSnapshot({ mode, drawing: false, error: null });
    }
    deactivate() {
        this.assertAlive();
        this.lineInteraction.abortDrawing(); this.areaInteraction.abortDrawing();
        this.lineInteraction.setActive(false); this.areaInteraction.setActive(false);
        if (this.snapshot.mode || this.snapshot.drawing) this.updateSnapshot({ mode: null, drawing: false, error: null });
    }
    /** Porzuca rozpoczęty pomiar, zostając w narzędziu. Patrz EditingManager.abortSketch. */
    abortSketch() {
        this.assertAlive();
        if (!this.snapshot.drawing) return false;
        this.lineInteraction.abortDrawing(); this.areaInteraction.abortDrawing();
        this.updateSnapshot({ drawing: false });
        return true;
    }
    /** 18.0: aktywna interakcja rysowania pomiaru. */
    activeDraw() {
        if (this.snapshot.mode === 'line') return this.lineInteraction;
        if (this.snapshot.mode === 'area') return this.areaInteraction;
        return null;
    }
    finishSketch() {
        const interaction = this.activeDraw();
        if (!this.snapshot.drawing || !interaction) return false;
        const geometry = this.currentSketchFeature?.getGeometry();
        if (geometry?.getType() === 'LineString' && geometry.getCoordinates().length < 3) return false;
        if (geometry?.getType() === 'Polygon' && geometry.getCoordinates()[0].length < 5) return false;
        interaction.finishDrawing();
        return true;
    }
    undoLastPoint() {
        const interaction = this.activeDraw();
        if (!this.snapshot.drawing || !interaction) return false;
        interaction.removeLastPoint();
        return true;
    }
    removeSelected() {
        this.assertAlive();
        const selectedId = this.objectManager.getSnapshot().selectedId;
        if (!selectedId) return 0;
        const item = this.objectManager.getSnapshot().items.find((entry) => entry.id === selectedId);
        if (item?.kind !== 'measurement') return 0;
        this.objectCommands.remove(selectedId);
        return 1;
    }
    clear() {
        this.assertAlive();
        const ids = this.objectManager.getSnapshot().items.filter((item) => item.kind === 'measurement').map((item) => item.id);
        this.clearTemporary();
        this.objectCommands.removeMany(ids);
        return ids.length;
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.unsubscribeObjects?.();
        if (this.eventKeys.length) unByKey(this.eventKeys.splice(0));
        this.host.removeInteraction(this.lineInteraction); this.host.removeInteraction(this.areaInteraction);
        this.host.removeLayer(this.temporaryLayer); this.temporarySource.clear();
        this.listeners.clear();
    }
    createDrawInteraction(type, measurementType) {
        const interaction = new Draw({
            type,
            stopClick: true,
            clickTolerance: 6,
            snapTolerance: 12,
            style: (feature) => this.styleFor(feature),
        });
        this.eventKeys.push(interaction.on('drawstart', (event) => { this.currentSketchFeature = event.feature; this.updateSnapshot({ drawing: true, error: null }); }));
        this.eventKeys.push(interaction.on('drawabort', () => this.updateSnapshot({ drawing: false })));
        this.eventKeys.push(interaction.on('drawend', (event) => {
            try {
                const geometry = event.feature.getGeometry();
                if (!geometry) throw new Error(t('measurement.brakGeometriiPomiaru'));
                const projectGeometry = fromViewGeometry(geometry);
                const label = projectMeasurementLabel(projectGeometry);
                if (!label) throw new Error(t('measurement.nieUdaloSieObliczycWymiaru'));
                const area = measurementType === 'area';
                const id = this.recordMeasurement({
                    name: area ? t('measurement.powierzchnia', { label }) : t('measurement.wymiar', { label }),
                    geometry: projectGeometry,
                    kind: 'measurement',
                    properties: { measurementType },
                    origin: 'user',
                    visible: true,
                    style: {
                        strokeColor: MEASURE_COLOR,
                        strokeWidth: 2,
                        strokeOpacity: 1,
                        strokePattern: 'dash-medium',
                        fillColor: MEASURE_COLOR,
                        fillOpacity: area ? 0.10 : 0,
                        pointRadius: 4,
                    },
                });
                this.updateSnapshot({ drawing: false, error: null });
            } catch (error) {
                this.updateSnapshot({ drawing: false, error: error instanceof Error ? error.message : t('measurement.nieUdaloSieZapisacPomiaru') });
            }
        }));
        return interaction;
    }
    styleFor(feature) {
        const geometry = feature.getGeometry();
        const isPolygon = geometry?.getType() === 'Polygon';
        const label = geometry ? measurementLabel(geometry) : null;
        return new Style({
            stroke: new Stroke({ color: MEASURE_COLOR, width: 2, lineDash: [7, 5] }),
            fill: isPolygon ? new Fill({ color: 'rgba(194,65,12,0.10)' }) : undefined,
            image: new CircleStyle({ radius: 4, fill: new Fill({ color: MEASURE_COLOR }) }),
            text: label ? new Text({ text: label, font: '600 13px Segoe UI, Arial, sans-serif', fill: new Fill({ color: MAP_STYLE_TOKENS.measurementLabel }), stroke: new Stroke({ color: MEASURE_COLOR, width: 3 }), overflow: true, placement: isPolygon ? 'point' : 'line', textBaseline: 'bottom', offsetY: -6 }) : undefined,
        });
    }
    syncFromObjects() {
        if (this.disposed) return;
        const snapshot = this.objectManager.getSnapshot();
        const measurements = snapshot.items.filter((item) => item.kind === 'measurement');
        const selected = measurements.some((item) => item.id === snapshot.selectedId) ? 1 : 0;
        this.updateSnapshot({ count: measurements.length, selectedCount: selected });
    }
    updateSnapshot(patch) {
        if (this.disposed) return;
        const next = { ...this.snapshot, ...patch };
        if (!Object.keys(patch).some((key) => this.snapshot[key] !== next[key])) return;
        this.snapshot = next; for (const listener of this.listeners) listener();
    }
    assertAlive() { if (this.disposed) throw new Error('MeasurementManager has already been disposed.'); }
}
