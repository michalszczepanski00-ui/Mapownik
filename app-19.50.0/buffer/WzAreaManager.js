import Collection from 'ol/Collection.js';
import Select from 'ol/interaction/Select.js';
import Interaction from 'ol/interaction/Interaction.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import { unByKey } from 'ol/Observable.js';
import { toViewGeometry, fromViewGeometry } from '../objects/geometryConversion.js';
import { createBufferGeometry } from '../geometry/bufferEngine.js';

/**
 * 19.50.0 — obszar analizowany dla decyzji o warunkach zabudowy (WZ).
 *
 * Rozporządzenie w sprawie sposobu ustalania wymagań dotyczących nowej zabudowy (Dz.U. 2003 nr 164 poz. 1588, § 3 ust. 2):
 * granice obszaru analizowanego wyznacza się wokół działki w odległości nie mniejszej niż trzykrotna szerokość
 * frontu działki, jednak nie mniejszej niż 50 m. Narzędzie wyznacza właśnie to minimum — urząd może przyjąć więcej.
 *
 * Kroki: 1) kliknij działkę (obiekt projektu), 2) kliknij krawędź od strony drogi (front; sąsiednie odcinki
 * w jednej linii są łączone), albo wpisz szerokość frontu, 3) zatwierdź podgląd. Silnik buforów ten sam co w narzędziu Bufor.
 */
export const WZ_MULTIPLIER = 3;
export const WZ_MIN_DISTANCE_M = 50;

export function wzDistance(frontMeters) {
    const front = Number(frontMeters);
    if (!Number.isFinite(front) || front <= 0) return null;
    return Math.max(WZ_MIN_DISTANCE_M, Math.round(WZ_MULTIPLIER * front * 10) / 10);
}

function outerRings(geometry) {
    if (geometry?.type === 'Polygon') return [geometry.coordinates[0]];
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
    return [];
}

function segmentDistance([px, py], [ax, ay], [bx, by]) {
    const dx = bx - ax; const dy = by - ay; const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Front działki przy wskazanym punkcie: najbliższy odcinek obrysu i sąsiednie odcinki leżące w jednej linii
 * (zmiana kierunku do 12°) — obrys z ewidencji dzieli prostą granicę na kilka odcinków.
 */
export function frontAt(geometry, point, maxTurnDeg = 12) {
    let best = null;
    for (const ring of outerRings(geometry)) {
        const n = ring.length - 1; // ostatni punkt = pierwszy
        for (let i = 0; i < n; i++) {
            const d = segmentDistance(point, ring[i], ring[i + 1]);
            if (!best || d < best.d) best = { d, ring, i, n };
        }
    }
    if (!best) return null;
    const { ring, i, n } = best;
    const dir = (k) => { const a = ring[(k + n) % n]; const b = ring[(k + 1 + n) % n]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
    const turn = (a, b) => { let x = Math.abs(a - b) % (2 * Math.PI); if (x > Math.PI) x = 2 * Math.PI - x; return (x * 180) / Math.PI; };
    const base = dir(i);
    let start = i; let end = i;
    for (let step = 0; step < n - 1 && turn(dir(start - 1), base) <= maxTurnDeg && (start - 1 + n) % n !== end; step++) start -= 1;
    for (let step = 0; step < n - 1 && turn(dir(end + 1), base) <= maxTurnDeg && (end + 1) % n !== (start + n) % n; step++) end += 1;
    const coords = [];
    let length = 0;
    for (let k = start; k <= end; k++) {
        const a = ring[(k + n) % n]; const b = ring[(k + 1 + n) % n];
        if (!coords.length) coords.push(a);
        coords.push(b);
        length += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return { length: Math.round(length * 10) / 10, line: { type: 'LineString', coordinates: coords } };
}

export class WzAreaManager {
    constructor(host, objectManager, objectCommands) {
        this.host = host; this.objectManager = objectManager; this.objectCommands = objectCommands;
        this.listeners = new Set(); this.selectFeatures = new Collection(); this.disposed = false; this.generation = 0;
        this.snapshot = { active: false, sourceId: null, sourceName: null, frontMeters: null, distanceMeters: null, busy: false, previewReady: false, error: null };
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => { this.assertAlive(); this.listeners.add(listener); return () => this.listeners.delete(listener); };
        this.previewSource = new VectorSource({ wrapX: false });
        const area = [new Style({ stroke: new Stroke({ color: '#ffffff', width: 5 }) }), new Style({ stroke: new Stroke({ color: '#6d28d9', width: 2, lineDash: [10, 6] }), fill: new Fill({ color: 'rgba(109,40,217,0.08)' }) })];
        const front = [new Style({ stroke: new Stroke({ color: '#ffffff', width: 9 }) }), new Style({ stroke: new Stroke({ color: '#6d28d9', width: 5 }) })];
        this.previewLayer = new VectorLayer({ source: this.previewSource, zIndex: 10060, properties: { mapownikRole: 'wz-area-preview' }, style: (feature) => (feature.get('role') === 'front' ? front : area) });
        this.host.addLayer(this.previewLayer);
        this.selectInteraction = new Select({ features: this.selectFeatures, layers: [objectManager.getInteractionLayer()], hitTolerance: 8, style: null,
            filter: (feature) => objectManager.isInteractionFeatureVisible(feature) && /Polygon/.test(this.objectOf(feature)?.geometry?.type ?? '') });
        this.host.addInteraction(this.selectInteraction); this.selectInteraction.setActive(false);
        // Drugie kliknięcie (po wyborze działki) wskazuje front — nie zmienia zaznaczenia.
        this.frontInteraction = new Interaction({ handleEvent: (event) => {
            if (event.type !== 'singleclick' || !this.snapshot.active || !this.snapshot.sourceId) return true;
            this.pickFront(event.coordinate);
            return false;
        } });
        this.host.addInteraction(this.frontInteraction); this.frontInteraction.setActive(false);
        this.eventKeys = [this.selectInteraction.on('select', (event) => this.handleSelect(event))];
    }
    objectOf(feature) {
        const id = this.objectManager.getInteractionObjectId(feature);
        try { return id ? this.objectManager.getObject(id) : null; } catch { return null; }
    }
    activate() {
        this.assertAlive(); this.updateSnapshot({ active: true, error: null });
        const id = this.objectManager.getSnapshot().selectedId;
        let selected = null; try { selected = id ? this.objectManager.getObject(id) : null; } catch { selected = null; }
        if (selected && /Polygon/.test(selected.geometry?.type ?? '')) this.selectSource(id);
        else this.selectInteraction.setActive(true);
    }
    deactivate() {
        this.assertAlive(); this.selectInteraction.setActive(false); this.frontInteraction.setActive(false); this.selectFeatures.clear();
        this.reset(); this.updateSnapshot({ active: false });
    }
    reset() {
        this.generation++; this.previewSource.clear(); this.areaGeometry = null; this.frontLine = null;
        this.updateSnapshot({ sourceId: null, sourceName: null, frontMeters: null, distanceMeters: null, busy: false, previewReady: false, error: null });
        if (this.snapshot.active) { this.frontInteraction.setActive(false); this.selectInteraction.setActive(true); }
    }
    handleSelect(event) {
        const feature = event.selected[0]; this.selectFeatures.clear();
        const id = feature && this.objectManager.getInteractionObjectId(feature);
        if (id) this.selectSource(id);
    }
    selectSource(id) {
        const source = this.objectManager.getObject(id);
        this.objectManager.select(id);
        this.selectInteraction.setActive(false); this.frontInteraction.setActive(true);
        this.updateSnapshot({ sourceId: id, sourceName: source.name, frontMeters: null, distanceMeters: null, previewReady: false, error: null });
    }
    pickFront(viewCoordinate) {
        const source = this.objectManager.getObject(this.snapshot.sourceId);
        const point = fromViewGeometry(new Point(viewCoordinate)).coordinates;
        const front = frontAt(source.geometry, point);
        if (!front) { this.updateSnapshot({ error: 'Nie znaleziono krawędzi działki.' }); return; }
        this.frontLine = front.line;
        return this.setFront(front.length, true);
    }
    setFront(value, fromClick = false) {
        const distance = wzDistance(value);
        if (distance === null) { this.updateSnapshot({ error: 'Szerokość frontu musi być liczbą większą od zera.', previewReady: false }); return null; }
        if (!fromClick) this.frontLine = null;
        this.updateSnapshot({ frontMeters: Math.round(Number(value) * 10) / 10, distanceMeters: distance, error: null });
        return this.refreshPreview();
    }
    async refreshPreview() {
        const generation = ++this.generation; this.previewSource.clear(); this.areaGeometry = null;
        if (!this.snapshot.sourceId || !this.snapshot.distanceMeters) return;
        const source = this.objectManager.getObject(this.snapshot.sourceId);
        this.updateSnapshot({ busy: true, previewReady: false });
        try {
            const geometry = await createBufferGeometry(source.geometry, this.snapshot.distanceMeters);
            if (this.disposed || generation !== this.generation) return;
            this.areaGeometry = geometry;
            this.previewSource.addFeature(new Feature({ geometry: toViewGeometry(geometry), role: 'area' }));
            if (this.frontLine) this.previewSource.addFeature(new Feature({ geometry: toViewGeometry(this.frontLine), role: 'front' }));
            this.updateSnapshot({ busy: false, previewReady: true });
        } catch (error) {
            if (generation !== this.generation || this.disposed) return;
            this.updateSnapshot({ busy: false, previewReady: false, error: error instanceof Error ? error.message : 'Nie udało się wyznaczyć obszaru.' });
        }
    }
    commit() {
        this.assertAlive();
        const { sourceId, previewReady, busy, frontMeters, distanceMeters } = this.snapshot;
        if (!sourceId || !previewReady || busy || !this.areaGeometry) return null;
        const source = this.objectManager.getObject(sourceId);
        const fmt = (v) => v.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
        const id = this.objectCommands.create({
            name: `Obszar analizowany WZ — ${fmt(distanceMeters)} m (${source.name})`,
            geometry: this.areaGeometry, origin: 'user', visible: true,
            properties: { sourceObjectId: source.id, wzFrontMeters: frontMeters, wzDistanceMeters: distanceMeters,
                opis: `Front ${fmt(frontMeters)} m × ${WZ_MULTIPLIER}, nie mniej niż ${WZ_MIN_DISTANCE_M} m (§ 3 ust. 2 rozporządzenia z 26.08.2003). Minimum — urząd może przyjąć większy obszar.` },
            style: { strokeColor: '#6d28d9', strokeWidth: 2, fillColor: '#6d28d9', fillOpacity: 0.06 },
        });
        this.reset(); this.objectManager.select(id);
        return id;
    }
    dispose() {
        if (this.disposed) return;
        this.generation++; unByKey(this.eventKeys);
        this.host.removeInteraction(this.selectInteraction); this.host.removeInteraction(this.frontInteraction);
        this.host.removeLayer(this.previewLayer); this.previewSource.clear();
        this.disposed = true; this.listeners.clear();
    }
    updateSnapshot(patch) {
        if (this.disposed || !Object.keys(patch).some((key) => this.snapshot[key] !== patch[key])) return;
        this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener();
    }
    assertAlive() { if (this.disposed) throw new Error('WzAreaManager has already been disposed.'); }
}
