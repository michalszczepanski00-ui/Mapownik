import Draw from 'ol/interaction/Draw.js';
import { unByKey } from 'ol/Observable.js';
import { fromViewGeometry } from '../objects/index.js';
import { lineLength, ringArea } from '../geometry/planarMeasures.js';

const IDLE = Object.freeze({ active: false, type: null, lengthM: null, areaM2: null, perimeterM: null, vertices: 0 });

/**
 * Miary szkicu w układzie projektu (EPSG:2180, metry). Wydzielone jako czysta
 * funkcja — testowalna bez mapy.
 * @param {{type: string, coordinates: any}} projected geometria GeoJSON w EPSG:2180
 */
export function measureProjected(projected) {
    const next = { active: true, type: null, lengthM: null, areaM2: null, perimeterM: null, vertices: 0 };
    if (projected?.type === 'LineString') {
        next.type = 'line';
        next.vertices = projected.coordinates.length;
        next.lengthM = lineLength(projected.coordinates);
    } else if (projected?.type === 'Polygon') {
        const ring = projected.coordinates[0] ?? [];
        next.type = 'polygon';
        next.vertices = Math.max(0, ring.length - 1);
        next.areaM2 = ring.length >= 4 ? ringArea(ring.slice(0, -1)) : 0;
        next.perimeterM = lineLength(ring);
    } else if (projected?.type === 'Point') {
        next.type = 'point';
        next.vertices = 1;
    } else {
        return null;
    }
    return next;
}

/**
 * 18.0 — bieżący pomiar rysowanego szkicu (długość, powierzchnia, obwód)
 * dla paska kontekstu.
 *
 * Działa dla KAŻDEJ interakcji Draw dodanej przez kontroler mapy — rysowanie
 * obiektów, pomiary, profil terenu — bez zmian w ich menedżerach. Liczy
 * w EPSG:2180, czyli w metrach, tak jak zapisany obiekt.
 */
export class SketchMetrics {
    constructor() {
        this.snapshot = IDLE;
        this.listeners = new Set();
        this.attached = new WeakSet();
        this.current = null;
        this.frame = null;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
    }

    /** Podpina się pod kontroler mapy: każda nowa interakcja Draw jest mierzona. */
    watch(controller) {
        return controller.onInteractionAdded((interaction) => this.attach(interaction));
    }

    attach(interaction) {
        if (!(interaction instanceof Draw) || this.attached.has(interaction)) return;
        this.attached.add(interaction);
        interaction.on('drawstart', (event) => {
            this.release();
            const geometry = event.feature?.getGeometry?.();
            if (!geometry) return;
            const key = geometry.on('change', () => this.schedule(geometry));
            this.current = { key, geometry };
            this.measure(geometry);
        });
        const stop = () => this.release(true);
        interaction.on('drawend', stop);
        interaction.on('drawabort', stop);
        interaction.on('change:active', () => { if (!interaction.getActive()) stop(); });
    }

    schedule(geometry) {
        if (this.frame !== null) return;
        const run = () => { this.frame = null; if (this.current?.geometry === geometry) this.measure(geometry); };
        this.frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 16);
    }

    measure(geometry) {
        let projected;
        try { projected = fromViewGeometry(geometry); }
        catch { return; }
        const next = measureProjected(projected);
        if (!next) return;
        this.snapshot = Object.freeze(next);
        this.emit();
    }

    release(emit = false) {
        if (this.current) unByKey(this.current.key);
        this.current = null;
        if (emit && this.snapshot !== IDLE) {
            this.snapshot = IDLE;
            this.emit();
        }
    }

    emit() {
        for (const listener of this.listeners) listener();
    }

    dispose() {
        this.release();
        this.listeners.clear();
    }
}
