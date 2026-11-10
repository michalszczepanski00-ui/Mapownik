import Collection from 'ol/Collection.js';
import Select from 'ol/interaction/Select.js';
import Feature from 'ol/Feature.js';
import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import { unByKey } from 'ol/Observable.js';
import { toViewGeometry } from '../objects/geometryConversion.js';
import { createBufferGeometry, normalizeBufferDistance, DEFAULT_BUFFER_DISTANCE_M } from '../geometry/bufferEngine.js';
import { t } from '../i18n/index.js';

/** Podgląd nie jest obiektem projektu. Dopiero commit() zapisuje jedną operację historii. */
export class BufferManager {
    constructor(host, objectManager, objectCommands) {
        this.host = host; this.objectManager = objectManager; this.objectCommands = objectCommands;
        this.listeners = new Set(); this.selectFeatures = new Collection(); this.disposed = false; this.generation = 0;
        this.snapshot = { active: false, distanceMeters: DEFAULT_BUFFER_DISTANCE_M, busy: false, error: null, sourceId: null, sourceName: null, previewReady: false, lastCreatedId: null };
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => { this.assertAlive(); this.listeners.add(listener); return () => this.listeners.delete(listener); };
        this.previewSource = new VectorSource({ wrapX: false });
        this.previewLayer = new VectorLayer({ source: this.previewSource, zIndex: 10025, properties: { mapownikRole: 'buffer-preview' }, style: [
            new Style({ stroke: new Stroke({ color: '#ffffff', width: 5 }) }),
            new Style({ stroke: new Stroke({ color: '#c2410c', width: 2, lineDash: [8, 5] }), fill: new Fill({ color: 'rgba(194,65,12,0.12)' }) }),
        ] });
        this.host.addLayer(this.previewLayer);
        this.selectInteraction = new Select({ features: this.selectFeatures, layers: [objectManager.getInteractionLayer()], hitTolerance: 8, style: null, filter: (feature) => objectManager.isInteractionFeatureVisible(feature) });
        this.host.addInteraction(this.selectInteraction); this.selectInteraction.setActive(false);
        this.eventKeys = [this.selectInteraction.on('select', (event) => this.handleSelect(event))];
        this.unsubscribeObjects = objectManager.subscribe(() => {
            if (!this.snapshot.active || !this.snapshot.sourceId) return;
            let source; try { source = objectManager.getObject(this.snapshot.sourceId); } catch { this.cancelPreview(); return; }
            if (JSON.stringify([source.geometry, source.name]) !== this.fingerprint) void this.refreshPreview();
        });
    }
    setDistance(value) {
        this.assertAlive(); clearTimeout(this.previewTimer); this.previewTimer = null; const distance = normalizeBufferDistance(value);
        if (distance === null) { this.generation++; this.previewSource.clear(); this.bufferedGeometry = null; this.updateSnapshot({ error: t('buffer.odlegloscBuforaMusiBycLiczba'), previewReady: false, busy: false }); return false; }
        this.updateSnapshot({ distanceMeters: distance, error: null });
        if (this.snapshot.active && this.snapshot.sourceId) {
            this.generation++; this.bufferedGeometry = null; this.previewSource.clear();
            this.updateSnapshot({ busy: true, previewReady: false });
            this.previewTimer = setTimeout(() => { this.previewTimer = null; void this.refreshPreview(); }, 140);
        }
        return true;
    }
    activate() {
        this.assertAlive(); this.selectInteraction.setActive(true); this.updateSnapshot({ active: true, error: null });
        const id = this.objectManager.getSnapshot().selectedId;
        if (id) void this.selectSource(id);
    }
    deactivate() {
        this.assertAlive(); this.selectInteraction.setActive(false); this.selectFeatures.clear(); this.cancelPreview();
        this.updateSnapshot({ active: false });
    }
    cancelPreview() {
        clearTimeout(this.previewTimer); this.previewTimer = null;
        this.generation++; this.bufferedGeometry = null; this.fingerprint = null; this.previewSource.clear();
        this.updateSnapshot({ sourceId: null, sourceName: null, previewReady: false, busy: false, error: null });
    }
    handleSelect(event) {
        const feature = event.selected[0]; this.selectFeatures.clear();
        const id = feature && this.objectManager.getInteractionObjectId(feature);
        return id ? this.selectSource(id) : Promise.resolve();
    }
    async selectSource(id) {
        this.assertAlive(); const source = this.objectManager.getObject(id);
        this.fingerprint = JSON.stringify([source.geometry, source.name]);
        this.updateSnapshot({ sourceId: id, sourceName: source.name, previewReady: false, error: null });
        this.objectManager.select(id); return this.refreshPreview();
    }
    async refreshPreview() {
        clearTimeout(this.previewTimer); this.previewTimer = null;
        const generation = ++this.generation;
        this.bufferedGeometry = null; this.previewSource.clear();
        const sourceId = this.snapshot.sourceId;
        if (!this.snapshot.active || !sourceId) return;
        const source = this.objectManager.getObject(sourceId);
        this.fingerprint = JSON.stringify([source.geometry, source.name]);
        const distance = this.snapshot.distanceMeters;
        this.updateSnapshot({ busy: true, previewReady: false, error: null, sourceName: source.name });
        try {
            const geometry = await createBufferGeometry(source.geometry, distance);
            if (this.disposed || !this.snapshot.active || generation !== this.generation) return;
            this.bufferedGeometry = geometry;
            this.previewSource.addFeature(new Feature({ geometry: toViewGeometry(geometry) }));
            this.updateSnapshot({ busy: false, previewReady: true });
        } catch (error) {
            if (generation !== this.generation || this.disposed) return;
            this.updateSnapshot({ busy: false, previewReady: false, error: error instanceof Error ? error.message : t('buffer.nieUdaloSieUtworzycBufora') });
        }
    }
    commit() {
        this.assertAlive();
        if (!this.snapshot.active || !this.snapshot.previewReady || this.snapshot.busy || !this.bufferedGeometry) return null;
        const source = this.objectManager.getObject(this.snapshot.sourceId);
        if (JSON.stringify([source.geometry, source.name]) !== this.fingerprint) { void this.refreshPreview(); return null; }
        const distance = this.snapshot.distanceMeters;
        const id = this.objectCommands.create({ name: t('buffer.bufor', { distanceLabel: `${distance.toLocaleString('pl-PL')} m`, name: source.name }), geometry: this.bufferedGeometry, origin: 'user', visible: true,
            properties: { sourceObjectId: source.id, bufferDistanceMeters: distance },
            style: { strokeColor: '#c2410c', strokeWidth: 2, fillColor: '#c2410c', fillOpacity: 0.1 } });
        this.cancelPreview(); this.objectManager.select(id); this.updateSnapshot({ lastCreatedId: id });
        return id;
    }
    dispose() {
        if (this.disposed) return;
        clearTimeout(this.previewTimer); this.previewTimer = null;
        this.generation++; this.unsubscribeObjects?.(); unByKey(this.eventKeys);
        this.host.removeInteraction(this.selectInteraction); this.host.removeLayer(this.previewLayer); this.previewSource.clear();
        this.disposed = true; this.listeners.clear();
    }
    updateSnapshot(patch) {
        if (this.disposed || !Object.keys(patch).some((key) => this.snapshot[key] !== patch[key])) return;
        this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener();
    }
    assertAlive() { if (this.disposed) throw new Error('BufferManager has already been disposed.'); }
}
