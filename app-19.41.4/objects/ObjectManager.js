import Feature from 'ol/Feature.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Text from 'ol/style/Text.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import { DEFAULT_MAP_OBJECT_STYLE, MAP_STYLE_TOKENS as T } from '../core/index.js';
import { followCallout } from './linkedCallouts.js';
import { fromViewGeometry, toViewGeometry } from './geometryConversion.js';
import { deriveRoadGeometries, DEFAULT_ROAD_WIDTH_M, DEFAULT_ROAD_RADIUS_M } from '../road/index.js';
import { assertValidPolygonalGeometryTopology } from '../geometry/topologyValidation.js';
import { measureGeometry } from '../geometry/planarMeasures.js';
// 19.0.0: rodzaje obiektów, dla których zaznaczenie pokazuje pole/obwód/długość (pomiar ma wartość w nazwie).
const MEASURED_OBJECT_KINDS = new Set(['geometry', 'rectangle', 'circle', 'analysis']);
import { t } from '../i18n/index.js';
import { formatArea, formatLength } from '../core/units.js';
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.min(max, Math.max(min, value));
}
function withAlpha(color, opacity) {
    const safeOpacity = clamp(opacity, 0, 1);
    const hex = color.trim();
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match)
        return color;
    const raw = match[1];
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
}
function normalizeStyle(style) {
    var _a, _b, _c, _d, _e;
    return {
        strokeColor: (_a = style === null || style === void 0 ? void 0 : style.strokeColor) !== null && _a !== void 0 ? _a : DEFAULT_MAP_OBJECT_STYLE.strokeColor,
        strokeWidth: clamp((_b = style === null || style === void 0 ? void 0 : style.strokeWidth) !== null && _b !== void 0 ? _b : DEFAULT_MAP_OBJECT_STYLE.strokeWidth, 1, 12),
        strokeOpacity: clamp(style?.strokeOpacity ?? DEFAULT_MAP_OBJECT_STYLE.strokeOpacity, 0, 1),
        strokePattern: ['solid', 'dash-short', 'dash-medium', 'dash-long', 'dots', 'dash-dot', 'double'].includes(style?.strokePattern) ? style.strokePattern : DEFAULT_MAP_OBJECT_STYLE.strokePattern,
        fillColor: (_c = style === null || style === void 0 ? void 0 : style.fillColor) !== null && _c !== void 0 ? _c : DEFAULT_MAP_OBJECT_STYLE.fillColor,
        fillOpacity: clamp((_d = style === null || style === void 0 ? void 0 : style.fillOpacity) !== null && _d !== void 0 ? _d : DEFAULT_MAP_OBJECT_STYLE.fillOpacity, 0, 1),
        pointRadius: clamp((_e = style === null || style === void 0 ? void 0 : style.pointRadius) !== null && _e !== void 0 ? _e : DEFAULT_MAP_OBJECT_STYLE.pointRadius, 2, 20),
    };
}

/**
 * 18.0 — zaznaczenie jako obwódka niezależna od koloru obiektu.
 * Ciemna szersza linia pod spodem, biała węższa nad nią, na końcu właściwy
 * styl obiektu w jego własnym kolorze.
 */
function selectionHaloStyles(geometry, width) {
    const type = geometry?.getType?.();
    if (type === 'Point' || type === 'MultiPoint') {
        return [new Style({ image: new CircleStyle({ radius: 11, fill: new Fill({ color: 'rgba(255,255,255,0.01)' }), stroke: new Stroke({ color: T.selectionHalo, width: 3 }) }) }),
            new Style({ image: new CircleStyle({ radius: 9, stroke: new Stroke({ color: T.selectionInner, width: 2 }) }) })];
    }
    return [
        new Style({ stroke: new Stroke({ color: T.selectionHalo, width: width + 6, lineCap: 'round', lineJoin: 'round' }) }),
        new Style({ stroke: new Stroke({ color: T.selectionInner, width: width + 3, lineCap: 'round', lineJoin: 'round' }) }),
    ];
}
/** Uchwyty wierzchołków zaznaczonej linii lub poligonu. */
function vertexHandleStyle(geometry) {
    const type = geometry?.getType?.();
    let coordinates = null;
    if (type === 'LineString') coordinates = geometry.getCoordinates();
    else if (type === 'Polygon') coordinates = (geometry.getCoordinates()[0] ?? []).slice(0, -1);
    else if (type === 'MultiPolygon') coordinates = geometry.getCoordinates().flatMap((polygon) => (polygon[0] ?? []).slice(0, -1));
    if (!coordinates || !coordinates.length || coordinates.length > 400) return [];
    return [new Style({
        geometry: new MultiPoint(coordinates),
        image: new CircleStyle({ radius: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 7 : 4, fill: new Fill({ color: T.vertexFill }), stroke: new Stroke({ color: T.vertexStroke, width: 1.5 }) }),
    })];
}
/** Biała obwiednia obiektów projektu — oddziela je od nakładek WMS. */
function casingStyle(geometry, width) {
    const type = geometry?.getType?.();
    if (type === 'Point' || type === 'MultiPoint') return [];
    return [new Style({ stroke: new Stroke({ color: T.casing, width: width + 2.5, lineCap: 'round', lineJoin: 'round' }) })];
}

function dashForPattern(pattern, width) {
    const unit = Math.max(1, width);
    if (pattern === 'dash-short') return [4 * unit, 3 * unit];
    if (pattern === 'dash-medium') return [8 * unit, 5 * unit];
    if (pattern === 'dash-long') return [14 * unit, 7 * unit];
    if (pattern === 'dots') return [1 * unit, 4 * unit];
    if (pattern === 'dash-dot') return [9 * unit, 4 * unit, 1 * unit, 4 * unit];
    return undefined;
}
function textStyleForObject(object, selected, geometry) {
    const properties = object.properties ?? {};
    const fontSize = clamp(properties.fontSize ?? 14, 8, 72);
    const weight = properties.fontWeight ?? '600';
    const rotation = ((properties.rotationDeg ?? 0) * Math.PI) / 180;
    const backgroundOpacity = clamp(properties.backgroundOpacity ?? 0, 0, 1);
    const text = String(properties.text ?? object.name ?? '').slice(0, 500);
    const color = withAlpha(object.style.strokeColor, object.style.strokeOpacity ?? 1);
    // 18.0: zaznaczony tekst dostaje ramkę (kolor tekstu bez zmian).
    const boxed = selected || backgroundOpacity > 0;
    return new Style({
        geometry,
        text: new Text({
            text,
            font: `${weight} ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`,
            fill: new Fill({ color }),
            stroke: new Stroke({ color: backgroundOpacity > 0 ? T.textHaloStrong : T.textHalo, width: backgroundOpacity > 0 ? 3 : 2 }),
            backgroundFill: boxed ? new Fill({ color: `rgba(255,255,255,${selected ? Math.max(0.85, backgroundOpacity) : backgroundOpacity})` }) : undefined,
            backgroundStroke: boxed ? new Stroke({ color: selected ? T.selectionHalo : T.textBoxStroke, width: selected ? 2 : 1 }) : undefined,
            padding: boxed ? [3, 5, 3, 5] : [0, 0, 0, 0],
            rotation,
            textAlign: 'center',
            overflow: true,
        }),
    });
}
function oneArrowHead(geometry, color, width, resolution, atStart) {
    if (!geometry || geometry.getType() !== 'LineString') return [];
    const coordinates = geometry.getCoordinates();
    if (coordinates.length < 2) return [];
    const end = atStart ? coordinates[0] : coordinates[coordinates.length - 1];
    const previous = atStart ? coordinates[1] : coordinates[coordinates.length - 2];
    const angle = Math.atan2(end[1] - previous[1], end[0] - previous[0]);
    const length = Math.max(8, 10 + width * 2) * resolution;
    const spread = Math.PI / 7;
    const left = [end[0] - Math.cos(angle - spread) * length, end[1] - Math.sin(angle - spread) * length];
    const right = [end[0] - Math.cos(angle + spread) * length, end[1] - Math.sin(angle + spread) * length];
    return [left, right].map((wing) => new Style({
        geometry: new LineString([end, wing]),
        stroke: new Stroke({ color, width, lineCap: 'round' }),
    }));
}
function arrowHeadStyles(object, geometry, color, width, resolution) {
    const properties = object.properties ?? {};
    const styles = [];
    if (properties.arrowStart) styles.push(...oneArrowHead(geometry, color, width, resolution, true));
    if (properties.arrowEnd !== false) styles.push(...oneArrowHead(geometry, color, width, resolution, false));
    return styles;
}


function measurementLabelForObject(object) {
    const geometry = object.geometry;
    if (geometry?.type === 'LineString') {
        let total = 0;
        for (let i = 1; i < geometry.coordinates.length; i += 1) {
            const [x1, y1] = geometry.coordinates[i - 1];
            const [x2, y2] = geometry.coordinates[i];
            total += Math.hypot(x2 - x1, y2 - y1);
        }
        return formatLength(total);
    }
    if (geometry?.type === 'Polygon') {
        const ringArea = (ring) => {
            let sum = 0;
            for (let i = 0; i < ring.length; i += 1) {
                const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % ring.length];
                sum += x1 * y2 - x2 * y1;
            }
            return Math.abs(sum) / 2;
        };
        const rings = geometry.coordinates ?? [];
        const area = Math.max(0, (rings[0] ? ringArea(rings[0]) : 0) - rings.slice(1).reduce((acc, ring) => acc + ringArea(ring), 0));
        return formatArea(area);
    }
    return '';
}
function measurementNameForObject(object) {
    const label = measurementLabelForObject(object);
    if (!label) return object.name;
    return object.properties?.measurementType === 'area' || object.geometry?.type === 'Polygon' ? t('objects.powierzchnia', { label }) : t('objects.wymiar', { label });
}
function measurementStyles(object, selected, geometry, editing = false) {
    const label = measurementLabelForObject(object);
    // 18.0: pomiary mają jeden stały, neutralny kolor (grafit) z białą obwiednią;
    // zaznaczenie to obwódka, nie zmiana koloru.
    const color = T.measurement;
    const width = Math.max(2, object.style.strokeWidth || 2);
    const isPolygon = geometry?.getType() === 'Polygon';
    return [
        ...(selected ? selectionHaloStyles(geometry, width) : casingStyle(geometry, width)),
        new Style({
            stroke: new Stroke({ color, width, lineDash: [7, 5], lineCap: 'round', lineJoin: 'round' }),
            fill: isPolygon ? new Fill({ color: withAlpha(color, 0.10) }) : undefined,
            image: new CircleStyle({ radius: 4, fill: new Fill({ color }) }),
            text: label ? new Text({
                text: label,
                font: '600 13px Segoe UI, Arial, sans-serif',
                fill: new Fill({ color: T.measurementLabel }),
                stroke: new Stroke({ color, width: 3 }),
                overflow: true,
                placement: isPolygon ? 'point' : 'line',
                textBaseline: 'bottom',
                offsetY: -6,
            }) : undefined,
        }),
        ...(selected && editing ? vertexHandleStyle(geometry) : []),
    ];
}

function terrainProfileStyles(object, selected, geometry, editing = false) {
    const color = T.terrainProfile;
    return [
        ...(selected ? selectionHaloStyles(geometry, 3) : casingStyle(geometry, 3)),
        new Style({
            stroke: new Stroke({ color, width: 3, lineCap: 'round', lineJoin: 'round' }),
            image: new CircleStyle({ radius: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 7 : 4, fill: new Fill({ color: T.vertexFill }), stroke: new Stroke({ color, width: 2 }) }),
        }),
        ...(selected && editing ? vertexHandleStyle(geometry) : []),
    ];
}

function roadStyles(object, feature, selected) {
    const properties = object.properties ?? {};
    const width = Number(properties.roadWidthMeters) || DEFAULT_ROAD_WIDTH_M;
    const radius = Number(properties.curveRadiusMeters) || DEFAULT_ROAD_RADIUS_M;
    const cacheKey = `${object.updatedAt}|${width}|${radius}`;
    let cache = feature.get('mapownikRoadDerived');
    if (!cache || cache.key !== cacheKey) {
        try {
            const derived = deriveRoadGeometries(object.geometry, width, radius);
            cache = {
                key: cacheKey,
                roadSurface: toViewGeometry(derived.roadSurface),
                sweptPath: toViewGeometry(derived.sweptPath),
                wheelPath: derived.wheelPath ? toViewGeometry(derived.wheelPath) : null,
                roundedAxis: toViewGeometry(derived.roundedAxis),
                requestedRadius: derived.requestedRadius,
                minimumEffectiveRadius: derived.minimumEffectiveRadius,
                radiusAdjusted: Boolean(derived.radiusAdjusted),
                innerClamped: Boolean(derived.innerClamped),
                warnings: Array.isArray(derived.warnings) ? [...derived.warnings] : [],
            };
            feature.set('mapownikRoadDerived', cache, true);
        }
        catch {
            cache = null;
            feature.unset('mapownikRoadDerived', true);
        }
    }
    if (!cache) return [];
    // 18.0: zaznaczona droga dostaje obwódkę osi, kolory jezdni bez zmian.
    const haloGeometry = cache.roundedAxis;
    const halo = selected && haloGeometry ? selectionHaloStyles(haloGeometry, 1.5).map((style) => { style.setGeometry(haloGeometry); return style; }) : [];
    return [
        new Style({
            geometry: cache.roadSurface,
            fill: new Fill({ color: T.roadFill }),
            stroke: new Stroke({ color: selected ? T.selectionHalo : T.road, width: selected ? 2.5 : 1.5, lineJoin: 'round' }),
        }),
        new Style({
            geometry: cache.sweptPath,
            fill: new Fill({ color: T.sweptPathFill }),
            stroke: new Stroke({ color: T.sweptPath, width: selected ? 2.3 : 1.7, lineJoin: 'round' }),
        }),
        // 18.13.0: ślady kół (gdzie musi być nawierzchnia) — ciemniejsza linia przerywana.
        cache.wheelPath ? new Style({
            geometry: cache.wheelPath,
            stroke: new Stroke({ color: T.sweptPath, width: 1.2, lineDash: [3, 3], lineJoin: 'round' }),
        }) : null,
        ...halo,
        new Style({
            geometry: cache.roundedAxis,
            stroke: new Stroke({ color: T.roadAxis, width: 1.5, lineDash: [7, 5], lineCap: 'round', lineJoin: 'round' }),
        }),
    ].filter(Boolean);
}
function normalizeCanonicalGeometry(geometry) {
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return structuredClone(geometry);
    const same = (a, b) => Array.isArray(a) && Array.isArray(b) && Math.abs(a[0] - b[0]) <= 1e-9 && Math.abs(a[1] - b[1]) <= 1e-9;
    const normalizeRing = (ring) => {
        const out = [];
        for (const position of ring ?? []) {
            const point = [Number(position?.[0]), Number(position?.[1])];
            if (!out.length || !same(out[out.length - 1], point)) out.push(point);
        }
        if (out.length >= 3 && !same(out[0], out[out.length - 1])) out.push([...out[0]]);
        return out;
    };
    if (geometry.type === 'Polygon') return { ...structuredClone(geometry), coordinates: (geometry.coordinates ?? []).map(normalizeRing) };
    return { ...structuredClone(geometry), coordinates: (geometry.coordinates ?? []).map((polygon) => (polygon ?? []).map(normalizeRing)) };
}

function validateGeometry(geometry) {
    const isPosition = (position) => (Array.isArray(position)
        && position.length >= 2
        && Number.isFinite(position[0])
        && Number.isFinite(position[1]));
    const validateRing = (ring) => (Array.isArray(ring)
        && ring.length >= 4
        && ring.every(isPosition)
        && Math.abs(ring[0][0] - ring[ring.length - 1][0]) <= 1e-9
        && Math.abs(ring[0][1] - ring[ring.length - 1][1]) <= 1e-9);
    if (geometry.type === 'Point') {
        if (!isPosition(geometry.coordinates))
            throw new Error(t('objects.nieprawidlowaGeometriaPunktu'));
        return;
    }
    if (geometry.type === 'LineString') {
        if (geometry.coordinates.length < 2 || !geometry.coordinates.every(isPosition)) {
            throw new Error(t('objects.liniaMusiZawieracCoNajmniej'));
        }
        return;
    }
    if (geometry.type === 'Polygon') {
        if (geometry.coordinates.length === 0 || !geometry.coordinates.every(validateRing)) {
            throw new Error(t('objects.polygonMusiZawieracCoNajmniej'));
        }
        assertValidPolygonalGeometryTopology(geometry);
        return;
    }
    if (geometry.coordinates.length === 0
        || !geometry.coordinates.every((polygon) => (polygon.length > 0 && polygon.every(validateRing)))) {
        throw new Error(t('objects.multipolygonMusiZawieracCoNajmniej'));
    }
    assertValidPolygonalGeometryTopology(geometry);
}
function createId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        return crypto.randomUUID();
    return `obj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
/**
 * Runtime owner of project objects and their OpenLayers vector layer.
 * Geometry stays outside the UI store; React consumes only a lightweight immutable snapshot.
 */
export class ObjectManager {
    constructor(host) {
        this.objects = new Map();
        this.features = new Map();
        this.listeners = new Set();
        this.mutationListeners = new Set();
        this.source = new VectorSource({ wrapX: false });
        this.selectedId = null;
        this.geometryEditing = false;
        this.disposed = false;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.assertAlive();
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.subscribeMutations = (listener) => {
            this.assertAlive();
            this.mutationListeners.add(listener);
            return () => this.mutationListeners.delete(listener);
        };
        this.host = host;
        this.layer = new VectorLayer({
            source: this.source,
            zIndex: 10000,
            updateWhileAnimating: false,
            updateWhileInteracting: false,
            renderOrder: (left, right) => { var _a, _b; return (((_a = left.get('mapownikOrder')) !== null && _a !== void 0 ? _a : 0) - ((_b = right.get('mapownikOrder')) !== null && _b !== void 0 ? _b : 0)); },
            style: (feature, resolution) => this.getFeatureStyle(feature, resolution),
            properties: { mapownikRole: 'objects' },
        });
        this.host.addLayer(this.layer);
        this.snapshot = this.buildSnapshot();
    }
    setGeometryEditing(value) { if (this.geometryEditing === Boolean(value)) return; this.geometryEditing = Boolean(value); this.layer.changed(); }
    add(input) {
        var _a, _b, _c;
        this.assertAlive();
        const normalizedGeometry = normalizeCanonicalGeometry(input.geometry);
        validateGeometry(normalizedGeometry);
        const id = (_a = input.id) !== null && _a !== void 0 ? _a : createId();
        if (this.objects.has(id))
            throw new Error(`Obiekt o ID ${id} już istnieje.`); // dev: błąd programisty, nie komunikat dla użytkownika
        const now = new Date().toISOString();
        const object = {
            ...input,
            geometry: normalizedGeometry,
            id,
            name: input.name.trim() || t('objects.bezNazwy'),
            visible: (_b = input.visible) !== null && _b !== void 0 ? _b : true,
            origin: (_c = input.origin) !== null && _c !== void 0 ? _c : 'user',
            style: normalizeStyle(input.style),
            order: Number.isInteger(input.order) ? input.order : this.nextOrder(),
            createdAt: now,
            updatedAt: now,
        };
        const feature = new Feature({ geometry: toViewGeometry(object.geometry) });
        feature.setId(id);
        feature.set('mapownikObjectId', id, true);
        feature.set('mapownikOrder', object.order, true);
        this.objects.set(id, object);
        this.features.set(id, feature);
        this.source.addFeature(feature);
        this.emit();
        this.emitMutation({ type: 'upsert', object: structuredClone(object) });
        return id;
    }
    remove(id) {
        this.assertAlive();
        const feature = this.features.get(id);
        if (!feature)
            return;
        this.source.removeFeature(feature);
        this.features.delete(id);
        this.objects.delete(id);
        if (this.selectedId === id)
            this.selectedId = null;
        this.geometryEditing = false;
        this.emit();
        this.emitMutation({ type: 'remove', id });
    }
    clear() {
        this.assertAlive();
        if (this.objects.size === 0)
            return;
        this.source.clear(true);
        this.features.clear();
        this.objects.clear();
        this.selectedId = null;
        this.geometryEditing = false;
        this.emit();
        this.emitMutation({ type: 'clear' });
    }
    /** Restores persisted objects without generating persistence mutations. */
    replaceAll(objects) {
        this.assertAlive();
        this.source.clear(true);
        this.features.clear();
        this.objects.clear();
        this.selectedId = null;
        this.geometryEditing = false;
        objects.forEach((raw, index) => {
            const normalizedGeometry = normalizeCanonicalGeometry(raw.geometry);
            validateGeometry(normalizedGeometry);
            if (this.objects.has(raw.id))
                return;
            const object = {
                ...structuredClone(raw),
                geometry: normalizedGeometry,
                order: Number.isInteger(raw.order) ? raw.order : index,
            };
            const feature = new Feature({ geometry: toViewGeometry(object.geometry) });
            feature.setId(object.id);
            feature.set('mapownikObjectId', object.id, true);
            feature.set('mapownikOrder', object.order, true);
            this.objects.set(object.id, object);
            this.features.set(object.id, feature);
            this.source.addFeature(feature);
        });
        this.emit();
    }
    select(id) {
        this.assertAlive();
        if (id !== null && !this.objects.has(id))
            throw new Error(`Nieznany obiekt: ${id}`);
        if (this.selectedId === id)
            return;
        this.selectedId = id;
        this.layer.changed();
        this.emit();
    }
    setVisibility(id, visible) {
        this.patch(id, { visible });
    }
    setName(id, name) {
        const normalized = name.trim();
        if (!normalized)
            return;
        this.patch(id, { name: normalized });
    }
    setStyle(id, patch) {
        const current = this.requireObject(id);
        this.patch(id, { style: normalizeStyle({ ...current.style, ...patch }) });
    }
    setProperties(id, patch) {
        const current = this.requireObject(id);
        this.patch(id, { properties: { ...(current.properties ?? {}), ...patch } });
    }
    setGeometry(id, geometry) {
        this.assertAlive();
        const normalizedGeometry = normalizeCanonicalGeometry(geometry);
        validateGeometry(normalizedGeometry);
        const object = this.requireObject(id);
        const feature = this.requireFeature(id);
        const nextBase = { ...object, geometry: normalizedGeometry, updatedAt: new Date().toISOString() };
        const next = object.kind === 'measurement' ? { ...nextBase, name: measurementNameForObject(nextBase) } : nextBase;
        this.objects.set(id, next);
        feature.setGeometry(toViewGeometry(normalizedGeometry));
        this.emit();
        this.emitMutation({ type: 'upsert', object: structuredClone(next) });
    }
    focus(id) {
        this.assertAlive();
        const geometry = this.requireFeature(id).getGeometry();
        if (!geometry)
            return;
        this.host.fitExtent(geometry.getExtent(), { maxZoom: 18, duration: 250, padding: [72, 72, 72, 72] });
    }
    move(id, direction) {
        this.assertAlive();
        const ordered = [...this.objects.values()].sort((left, right) => left.order - right.order);
        const index = ordered.findIndex((object) => object.id === id);
        const targetIndex = direction === 'up' ? index + 1 : index - 1;
        if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length)
            return false;
        const current = ordered[index];
        const target = ordered[targetIndex];
        const now = new Date().toISOString();
        const nextCurrent = { ...current, order: target.order, updatedAt: now };
        const nextTarget = { ...target, order: current.order, updatedAt: now };
        this.objects.set(current.id, nextCurrent);
        this.objects.set(target.id, nextTarget);
        this.requireFeature(current.id).set('mapownikOrder', nextCurrent.order, true);
        this.requireFeature(target.id).set('mapownikOrder', nextTarget.order, true);
        this.layer.changed();
        this.emit();
        this.emitMutation({ type: 'upsert', object: structuredClone(nextCurrent) });
        this.emitMutation({ type: 'upsert', object: structuredClone(nextTarget) });
        return true;
    }
    /** Runtime-only bridge used by EditingManager. UI must not consume OL objects directly. */
    getInteractionLayer() {
        this.assertAlive();
        return this.layer;
    }
    /** Runtime-only bridge used by EditingManager. */
    getInteractionFeature(id) {
        var _a;
        this.assertAlive();
        return (_a = this.features.get(id)) !== null && _a !== void 0 ? _a : null;
    }
    /** Runtime-only bridge used by EditingManager. */
    getVisibleInteractionFeatures() {
        this.assertAlive();
        return [...this.features.entries()]
            .filter(([id]) => { var _a; return (_a = this.objects.get(id)) === null || _a === void 0 ? void 0 : _a.visible; })
            .map(([, feature]) => feature);
    }
    /** Runtime-only bridge used by EditingManager. */
    getInteractionObjectId(feature) {
        this.assertAlive();
        const id = feature.get('mapownikObjectId');
        return id && this.objects.has(id) ? id : null;
    }
    /** Runtime-only bridge used by EditingManager. */
    isInteractionFeatureVisible(feature) {
        var _a;
        const id = this.getInteractionObjectId(feature);
        return id ? Boolean((_a = this.objects.get(id)) === null || _a === void 0 ? void 0 : _a.visible) : false;
    }
    /**
     * Commit geometry already edited in the OpenLayers view (EPSG:3857) back to
     * canonical EPSG:2180 without replacing the runtime feature.
     */
    commitInteractionFeatureGeometry(feature) {
        this.assertAlive();
        const id = this.getInteractionObjectId(feature);
        if (!id)
            throw new Error('Edytowany obiekt nie należy do ObjectManagera.'); // dev: błąd programisty, nie komunikat dla użytkownika
        const geometry = feature.getGeometry();
        if (!geometry)
            throw new Error(t('objects.edytowanyObiektNieMaGeometrii'));
        const canonical = normalizeCanonicalGeometry(fromViewGeometry(geometry));
        validateGeometry(canonical);
        const current = this.requireObject(id);
        const nextBase = { ...current, geometry: canonical, updatedAt: new Date().toISOString() };
        const next = current.kind === 'measurement' ? { ...nextBase, name: measurementNameForObject(nextBase) } : nextBase;
        this.objects.set(id, next);
        this.layer.changed();
        this.emit();
        this.emitMutation({ type: 'upsert', object: structuredClone(next) });
    }
    /** Restore a runtime feature from the last valid canonical object geometry. */
    restoreInteractionFeatureGeometry(id) {
        this.assertAlive();
        const object = this.requireObject(id);
        this.requireFeature(id).setGeometry(toViewGeometry(object.geometry));
        this.layer.changed();
    }
    /**
     * Restore an exact canonical object snapshot for Command undo/redo.
     * This is intentionally not used by persistence restoreAll(), because command
     * history must emit a normal mutation so autosave observes undo/redo.
     */
    restoreObjectSnapshot(raw) {
        this.assertAlive();
        const normalizedGeometry = normalizeCanonicalGeometry(raw.geometry);
        validateGeometry(normalizedGeometry);
        const object = { ...structuredClone(raw), geometry: normalizedGeometry };
        const existing = this.features.get(object.id);
        if (existing) {
            this.objects.set(object.id, object);
            existing.setGeometry(toViewGeometry(object.geometry));
            existing.set('mapownikOrder', object.order, true);
        }
        else {
            const feature = new Feature({ geometry: toViewGeometry(object.geometry) });
            feature.setId(object.id);
            feature.set('mapownikObjectId', object.id, true);
            feature.set('mapownikOrder', object.order, true);
            this.objects.set(object.id, object);
            this.features.set(object.id, feature);
            this.source.addFeature(feature);
        }
        this.layer.changed();
        this.emit();
        this.emitMutation({ type: 'upsert', object: structuredClone(object) });
    }
    getRoadAnalysis(id) {
        const object = this.requireObject(id);
        if ((object.kind ?? 'geometry') !== 'road') return null;
        const feature = this.requireFeature(id);
        const width = Number(object.properties?.roadWidthMeters) || DEFAULT_ROAD_WIDTH_M;
        const radius = Number(object.properties?.curveRadiusMeters) || DEFAULT_ROAD_RADIUS_M;
        const cacheKey = `${object.updatedAt}|${width}|${radius}`;
        let cache = feature.get('mapownikRoadDerived');
        if (!cache || cache.key !== cacheKey) {
            const derived = deriveRoadGeometries(object.geometry, width, radius);
            cache = {
                key: cacheKey,
                roadSurface: toViewGeometry(derived.roadSurface),
                sweptPath: toViewGeometry(derived.sweptPath),
                wheelPath: derived.wheelPath ? toViewGeometry(derived.wheelPath) : null,
                roundedAxis: toViewGeometry(derived.roundedAxis),
                requestedRadius: derived.requestedRadius,
                minimumEffectiveRadius: derived.minimumEffectiveRadius,
                radiusAdjusted: Boolean(derived.radiusAdjusted),
                innerClamped: Boolean(derived.innerClamped),
                warnings: Array.isArray(derived.warnings) ? [...derived.warnings] : [],
            };
            feature.set('mapownikRoadDerived', cache, true);
        }
        return {
            requestedRadius: cache.requestedRadius,
            minimumEffectiveRadius: cache.minimumEffectiveRadius,
            radiusAdjusted: Boolean(cache.radiusAdjusted),
            innerClamped: Boolean(cache.innerClamped),
            warnings: Array.isArray(cache.warnings) ? [...cache.warnings] : [],
        };
    }
    getObject(id) {
        const object = this.requireObject(id);
        return structuredClone(object);
    }
    exportObjects() {
        return [...this.objects.values()].map((object) => structuredClone(object));
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.listeners.clear();
        this.mutationListeners.clear();
        this.source.clear(true);
        this.features.clear();
        this.objects.clear();
        this.host.removeLayer(this.layer);
    }
    patch(id, patch) {
        this.assertAlive();
        const current = this.requireObject(id);
        const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
        this.objects.set(id, next);
        if (Object.hasOwn(patch, 'order'))
            this.requireFeature(id).set('mapownikOrder', next.order, true);
        this.layer.changed();
        this.emit();
        this.emitMutation({ type: 'upsert', object: structuredClone(next) });
    }
    getFeatureStyle(feature, resolution = 1) {
        const id = feature.get('mapownikObjectId');
        if (!id)
            return [];
        const object = this.objects.get(id);
        if (!object || !object.visible)
            return [];
        const selected = id === this.selectedId;
        // 18.0: zaznaczenie nie zmienia koloru — obwódka i uchwyty (selectionHaloStyles).
        const strokeColor = withAlpha(object.style.strokeColor, object.style.strokeOpacity ?? 1);
        const strokeWidth = object.style.strokeWidth;
        const fillColor = withAlpha(object.style.fillColor, object.style.fillOpacity);
        const geometry = feature.getGeometry();
        if (!geometry)
            return [];

        if (object.kind === 'road') {
            return roadStyles(object, feature, selected);
        }
        if (object.kind === 'measurement') {
            return measurementStyles(object, selected, geometry, this.geometryEditing);
        }
        if (object.kind === 'terrain-profile') {
            return terrainProfileStyles(object, selected, geometry, this.geometryEditing);
        }
        if (object.kind === 'text') {
            return [textStyleForObject(object, selected, geometry)];
        }

        const lineDash = dashForPattern(object.style.strokePattern, strokeWidth);
        const baseStroke = new Stroke({ color: strokeColor, width: strokeWidth, lineDash, lineCap: 'round', lineJoin: 'round' });
        const styles = selected ? selectionHaloStyles(geometry, strokeWidth) : casingStyle(geometry, strokeWidth);
        if (object.style.strokePattern === 'double') {
            styles.push(new Style({
                stroke: new Stroke({ color: strokeColor, width: strokeWidth + 4, lineCap: 'round', lineJoin: 'round' }),
                fill: new Fill({ color: fillColor }),
                image: new CircleStyle({ radius: object.style.pointRadius + (selected ? 1 : 0), fill: new Fill({ color: fillColor }), stroke: new Stroke({ color: strokeColor, width: strokeWidth + 2 }) }),
            }));
            styles.push(new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.9)', width: Math.max(1, strokeWidth), lineCap: 'round', lineJoin: 'round' }) }));
        }
        else {
            styles.push(new Style({
                stroke: baseStroke,
                fill: new Fill({ color: fillColor }),
                image: new CircleStyle({
                    radius: object.style.pointRadius + (selected ? 1 : 0),
                    fill: new Fill({ color: fillColor }),
                    stroke: baseStroke,
                }),
            }));
        }

        if (object.kind === 'arrow') {
            styles.push(...arrowHeadStyles(object, geometry, strokeColor, strokeWidth, resolution));
        }
        if (object.kind === 'callout' && geometry.getType() === 'LineString') {
            const coordinates = geometry.getCoordinates();
            const labelPoint = coordinates.length ? new Point(coordinates[coordinates.length - 1]) : null;
            if (labelPoint)
                styles.push(textStyleForObject(object, selected, labelPoint));
        }
        if (selected && this.geometryEditing)
            styles.push(...vertexHandleStyle(geometry));
        return styles;
    }
    requireObject(id) {
        const object = this.objects.get(id);
        if (!object)
            throw new Error(`Nieznany obiekt: ${id}`);
        return object;
    }
    requireFeature(id) {
        const feature = this.features.get(id);
        if (!feature)
            throw new Error(`Brak geometrii obiektu: ${id}`);
        return feature;
    }
    emit() {
        if (this.disposed)
            return;
        for (const object of this.objects.values()) {
            const target = object.properties?.targetObjectId && this.objects.get(object.properties.targetObjectId);
            const next = target && followCallout(object, target);
            if (!next) continue;
            this.objects.set(object.id, next);
            this.features.get(object.id)?.setGeometry(toViewGeometry(next.geometry));
            this.emitMutation({ type: 'upsert', object: structuredClone(next) });
        }
        this.snapshot = this.buildSnapshot();
        for (const listener of this.listeners)
            listener();
    }
    emitMutation(mutation) {
        if (this.disposed)
            return;
        for (const listener of this.mutationListeners)
            listener(mutation);
    }
    buildSnapshot() {
        const items = [...this.objects.values()]
            .sort((left, right) => right.order - left.order)
            .map((object) => ({
            id: object.id,
            name: object.name,
            geometryType: object.geometry.type,
            visible: object.visible,
            origin: object.origin,
            kind: object.kind ?? 'geometry',
            properties: object.properties ? { ...object.properties } : undefined,
            style: { ...object.style },
            order: object.order,
            updatedAt: object.updatedAt,
            selected: object.id === this.selectedId,
            // 19.0.0: pole/obwód/długość tylko dla zaznaczonego obiektu — pasek kontekstu
            // pokazuje je po zakończeniu rysowania, a snapshot nie liczy ich dla całego projektu.
            ...(object.id === this.selectedId && MEASURED_OBJECT_KINDS.has(object.kind ?? 'geometry') ? { measures: measureGeometry(object.geometry) } : {}),
        }));
        return {
            count: items.length,
            visibleCount: items.filter((item) => item.visible).length,
            selectedId: this.selectedId,
            items,
        };
    }
    nextOrder() {
        let highest = -1;
        for (const object of this.objects.values())
            highest = Math.max(highest, Number.isInteger(object.order) ? object.order : -1);
        return highest + 1;
    }
    assertAlive() {
        if (this.disposed)
            throw new Error('ObjectManager has already been disposed.');
    }
}
