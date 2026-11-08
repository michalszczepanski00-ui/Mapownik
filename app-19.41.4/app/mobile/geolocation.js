import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import Style from 'ol/style/Style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import CircleStyle from 'ol/style/Circle.js';
import { fromLonLat } from 'ol/proj.js';

/**
 * 18.14.0 — „Moja lokalizacja”: niebieska kropka z kołem dokładności GPS,
 * jak w Mapach Google. Pierwsze dotknięcie przybliża do pozycji, kolejne
 * włącza śledzenie (mapa jedzie za użytkownikiem), następne je wyłącza.
 */
const DOT = [
    new Style({ image: new CircleStyle({ radius: 10, fill: new Fill({ color: 'rgba(37, 99, 235, 0.25)' }) }) }),
    new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#2563eb' }), stroke: new Stroke({ color: '#ffffff', width: 2.5 }) }) }),
];
const ACCURACY = new Style({ fill: new Fill({ color: 'rgba(37, 99, 235, 0.12)' }), stroke: new Stroke({ color: 'rgba(37, 99, 235, 0.45)', width: 1 }) });

export class LocationTracker {
    constructor(controller, onChange) {
        this.controller = controller;
        this.onChange = onChange;
        this.source = new VectorSource();
        this.layer = new VectorLayer({ source: this.source, zIndex: 9000, properties: { mapownikInternal: true } });
        this.dot = new Feature(new Point([0, 0]));
        this.dot.setStyle(DOT);
        this.circle = new Feature();
        this.circle.setStyle(ACCURACY);
        this.watchId = null;
        this.follow = false;
        this.last = null;
        this.added = false;
        this.state = { status: 'off', accuracy: null, follow: false, error: null, errorAt: 0 };
        // 18.14.3: przesunięcie mapy palcem wyłącza śledzenie (jak w Mapach Google),
        // inaczej mapa przy każdym odczycie GPS wracała do pozycji i „walczyła” z palcem.
        this.onDrag = () => { if (this.follow) { this.follow = false; this.emit({ follow: false }); } };
        this.dragKey = null;
    }
    get supported() { return typeof navigator !== 'undefined' && Boolean(navigator.geolocation); }
    emit(patch) { this.state = { ...this.state, ...patch }; this.onChange?.(this.state); }
    ensureLayer() {
        if (this.added) return;
        this.controller.addLayer(this.layer);
        this.source.addFeatures([this.circle, this.dot]);
        this.added = true;
    }
    /** Dotknięcie przycisku: start → śledzenie → wyłączenie. */
    toggle() {
        if (!this.supported) { this.emit({ status: 'error', error: 'unsupported', errorAt: Date.now() }); return; }
        if (this.watchId === null) { this.start(); return; }
        if (!this.follow) { this.follow = true; this.emit({ follow: true }); if (this.last) this.center(this.last, false); return; }
        this.stop();
    }
    start() {
        this.ensureLayer();
        const map = this.controller.map;
        if (map && !this.dragKey) { map.on('pointerdrag', this.onDrag); this.dragKey = true; }
        this.emit({ status: 'searching', error: null, follow: false });
        this.last = null;
        let first = true;
        this.watchId = navigator.geolocation.watchPosition((position) => {
            const { longitude, latitude, accuracy } = position.coords;
            const coordinate = fromLonLat([longitude, latitude]);
            this.last = coordinate;
            this.dot.getGeometry().setCoordinates(coordinate);
            // Koło dokładności GPS liczone na sferze (metry), potem do układu mapy.
            const r = Math.max(1, accuracy) / Math.cos((latitude * Math.PI) / 180); // metry → jednostki EPSG:3857
            const ring = Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * 2 * Math.PI; return [coordinate[0] + r * Math.cos(a), coordinate[1] + r * Math.sin(a)]; });
            this.circle.setGeometry(new Polygon([ring]));
            this.emit({ status: 'on', accuracy: Math.round(accuracy), error: null });
            if (first || this.follow) this.center(coordinate, first);
            first = false;
        }, (error) => {
            // 18.14.3: tylko brak zgody kończy lokalizację. Przekroczony czas i chwilowy
            // brak pozycji (budynek, słaby sygnał) to stan przejściowy — przeglądarka
            // dalej próbuje, a użytkownik dostaje krótki komunikat.
            if (error.code === 1) {
                this.emit({ status: 'error', error: 'denied', errorAt: Date.now() });
                this.stop(false);
                return;
            }
            this.emit({ status: this.last ? 'on' : 'searching', error: 'weak', errorAt: Date.now() });
        }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }
    center(coordinate, zoomIn) {
        const view = this.controller.map?.getView?.();
        if (!view) return;
        view.animate({ center: coordinate, zoom: zoomIn ? Math.max(view.getZoom() ?? 0, 17) : view.getZoom(), duration: 350 });
    }
    stop(emit = true) {
        if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
        this.follow = false;
        if (this.dragKey) { this.controller.map?.un('pointerdrag', this.onDrag); this.dragKey = null; }
        this.source.clear();
        if (this.added) this.controller.removeLayer(this.layer);
        this.added = false;
        if (emit) this.emit({ status: 'off', accuracy: null, follow: false });
    }
    dispose() { this.stop(false); }
}
