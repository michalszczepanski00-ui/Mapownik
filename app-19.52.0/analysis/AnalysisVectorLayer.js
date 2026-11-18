import Feature from 'ol/Feature.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import { toViewGeometry } from '../objects/geometryConversion.js';

const DEFAULT_MAX_RENDERED = 2500;

function polygonArea(rings) {
    if (!Array.isArray(rings) || !rings.length) return 0;
    const ringArea = (ring) => {
        let sum = 0;
        for (let i = 0; i < ring.length - 1; i += 1) {
            const [x1, y1] = ring[i];
            const [x2, y2] = ring[i + 1];
            sum += Number(x1) * Number(y2) - Number(x2) * Number(y1);
        }
        return Math.abs(sum) / 2;
    };
    const outer = ringArea(rings[0]);
    const holes = rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0);
    return Math.max(0, outer - holes);
}
function geometryArea(geometry) {
    if (geometry?.type === 'Polygon') return polygonArea(geometry.coordinates);
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
    return 0;
}
function categoryLabel(category) {
    if (category === 'single_family') return 'jednorodzinny';
    if (category === 'multi_family') return 'wielorodzinny';
    if (category === 'other_residential') return 'mieszkalny';
    return 'budynek';
}
function samePoint(a, b) { return Array.isArray(a) && Array.isArray(b) && Number(a[0]) === Number(b[0]) && Number(a[1]) === Number(b[1]); }
function pointSegmentDistanceSq(p, a, b) {
    const x = Number(a[0]); const y = Number(a[1]);
    const dx = Number(b[0]) - x; const dy = Number(b[1]) - y;
    if (dx === 0 && dy === 0) return (Number(p[0])-x)**2 + (Number(p[1])-y)**2;
    let t = ((Number(p[0])-x)*dx + (Number(p[1])-y)*dy) / (dx*dx + dy*dy);
    t = Math.max(0, Math.min(1, t));
    const px = x + t*dx; const py = y + t*dy;
    return (Number(p[0])-px)**2 + (Number(p[1])-py)**2;
}
function simplifyLine(points, tolerance) {
    if (!Array.isArray(points) || points.length <= 2 || tolerance <= 0) return points;
    const sq = tolerance * tolerance;
    const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length-1] = 1;
    const stack = [[0, points.length-1]];
    while (stack.length) {
        const [first,last] = stack.pop();
        let maxDist = sq; let index = -1;
        for (let i=first+1;i<last;i+=1) {
            const dist = pointSegmentDistanceSq(points[i], points[first], points[last]);
            if (dist > maxDist) { maxDist = dist; index = i; }
        }
        if (index > 0) { keep[index] = 1; stack.push([first,index],[index,last]); }
    }
    return points.filter((_,i)=>keep[i]);
}
function simplifyRing(ring, tolerance) {
    if (!Array.isArray(ring) || ring.length < 5 || tolerance <= 0) return ring;
    const closed = samePoint(ring[0], ring[ring.length-1]);
    const body = closed ? ring.slice(0,-1) : ring.slice();
    // Closed polygons need an artificial endpoint; split at the farthest point from vertex 0.
    let split = 1; let best = -1;
    for (let i=1;i<body.length;i+=1) {
        const d=(Number(body[i][0])-Number(body[0][0]))**2+(Number(body[i][1])-Number(body[0][1]))**2;
        if (d>best) { best=d; split=i; }
    }
    const a = simplifyLine(body.slice(0,split+1), tolerance);
    const b = simplifyLine([...body.slice(split), body[0]], tolerance);
    const merged = [...a.slice(0,-1), ...b.slice(0,-1)];
    if (merged.length < 3) return ring;
    return [...merged, merged[0]];
}
function simplifyGeometry(geometry, tolerance) {
    if (!geometry || tolerance <= 0) return geometry;
    if (geometry.type === 'Polygon') return { type:'Polygon', coordinates: geometry.coordinates.map((ring)=>simplifyRing(ring,tolerance)) };
    if (geometry.type === 'MultiPolygon') return { type:'MultiPolygon', coordinates: geometry.coordinates.map((poly)=>poly.map((ring)=>simplifyRing(ring,tolerance))) };
    return geometry;
}
function previewPolicy(count, requestedMax = DEFAULT_MAX_RENDERED) {
    const maxRendered = Math.max(250, Math.min(5000, Math.round(Number(requestedMax) || DEFAULT_MAX_RENDERED)));
    if (count > 4000) return { maxRendered, tolerance: 0.45 };
    if (count > 2500) return { maxRendered, tolerance: 0.30 };
    if (count > 1200) return { maxRendered, tolerance: 0.15 };
    return { maxRendered, tolerance: 0 };
}
function sampleFeatures(features, maxRendered) {
    if (features.length <= maxRendered) return features;
    const out=[]; const step=features.length/maxRendered;
    let previous=-1;
    for (let i=0;i<maxRendered;i+=1) {
        const index=Math.min(features.length-1, Math.floor(i*step));
        if (index!==previous) { out.push(features[index]); previous=index; }
    }
    return out;
}

const BASE_STYLES = {
    single_family: new Style({ fill: new Fill({ color: 'rgba(14,116,144,0.18)' }), stroke: new Stroke({ color: '#0e7490', width: 1.4 }) }),
    multi_family: new Style({ fill: new Fill({ color: 'rgba(124,58,237,0.16)' }), stroke: new Stroke({ color: '#7c3aed', width: 1.4 }) }),
    other_residential: new Style({ fill: new Fill({ color: 'rgba(37,99,235,0.14)' }), stroke: new Stroke({ color: '#2563eb', width: 1.3 }) }),
    other: new Style({ fill: new Fill({ color: 'rgba(71,85,105,0.12)' }), stroke: new Stroke({ color: '#475569', width: 1.2 }) }),
};
const SELECTED_STYLE = new Style({ fill: new Fill({ color: 'rgba(245,158,11,0.24)' }), stroke: new Stroke({ color: '#d97706', width: 2.6 }) });

/**
 * Robocza warstwa źródeł analitycznych. 17.6 przechowuje pełne geometrie tylko
 * raz, a na mapę trafia adaptacyjny podgląd (max 2500 obiektów + lekkie
 * uproszczenie). Operacje przestrzenne nadal pracują na pełnym zbiorze.
 */
export class AnalysisVectorLayer {
    constructor(host) {
        this.host = host;
        this.source = new VectorSource({ wrapX: false });
        this.layer = new VectorLayer({
            source: this.source,
            zIndex: 9600,
            updateWhileAnimating: false,
            updateWhileInteracting: false,
            style: (feature) => feature.get('analysisSelected') ? SELECTED_STYLE : (BASE_STYLES[feature.get('analysisCategory')] ?? BASE_STYLES.other),
            properties: { mapownikRole: 'analysis-preview', catalogId: 'runtime.analysis-preview' },
        });
        this.featureById = new Map();
        this.rawById = new Map();
        this.rawFeatures = [];
        this.selectedId = null;
        this.metadata = {};
        this.renderStats = { sourceCount:0, renderedCount:0, limited:false, simplifyTolerance:0 };
        this.host.addLayer(this.layer);
    }
    renderOne(raw, index = 0, tolerance = this.renderStats.simplifyTolerance) {
        const geometry = raw?.geometry;
        if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return null;
        const id = String(raw.id ?? raw.properties?.id ?? `analysis-feature-${index + 1}`);
        if (this.featureById.has(id)) return this.featureById.get(id);
        const properties = raw.properties && typeof raw.properties === 'object' ? raw.properties : {};
        const category = String(properties.category ?? raw.category ?? this.metadata.category ?? 'other');
        let viewGeometry;
        try { viewGeometry = toViewGeometry(simplifyGeometry(geometry, tolerance)); } catch { return null; }
        const feature = new Feature({ geometry: viewGeometry });
        feature.setId(id);
        feature.set('analysisFeatureId', id, true);
        feature.set('analysisCategory', category, true);
        feature.set('analysisCategoryLabel', categoryLabel(category), true);
        feature.set('analysisAreaSqm', geometryArea(geometry), true);
        feature.set('analysisSelected', false, true);
        this.featureById.set(id, feature);
        return feature;
    }
    replace(features, metadata = {}, options = {}) {
        this.clear();
        this.rawFeatures = Array.isArray(features) ? features : [];
        this.metadata = metadata && typeof metadata === 'object' ? { ...metadata } : {};
        this.rawFeatures.forEach((raw,index)=>{
            const id=String(raw?.id ?? raw?.properties?.id ?? `analysis-feature-${index+1}`);
            if (!this.rawById.has(id)) this.rawById.set(id,raw);
        });
        const policy=previewPolicy(this.rawFeatures.length, options.maxRendered);
        const preview=sampleFeatures(this.rawFeatures, policy.maxRendered);
        const rendered=[];
        preview.forEach((raw,index)=>{ const feature=this.renderOne(raw,index,policy.tolerance); if(feature) rendered.push(feature); });
        if (rendered.length) this.source.addFeatures(rendered);
        this.renderStats={ sourceCount:this.rawFeatures.length, renderedCount:rendered.length, limited:rendered.length<this.rawFeatures.length, simplifyTolerance:policy.tolerance };
        this.layer.setVisible(true);
        return rendered.length;
    }
    clear() {
        this.selectedId = null;
        this.source.clear(true);
        this.featureById.clear();
        this.rawById.clear();
        this.rawFeatures = [];
        this.metadata = {};
        this.renderStats = { sourceCount:0, renderedCount:0, limited:false, simplifyTolerance:0 };
    }
    setVisible(visible) { this.layer.setVisible(Boolean(visible)); }
    isVisible() { return this.layer.getVisible(); }
    getCount() { return this.source.getFeatures().length; }
    getRawFeatures() { return this.rawFeatures.map((item) => structuredClone(item)); }
    /**
     * Płaskie wiersze do tabeli wyników — dla WSZYSTKICH obiektów źródłowych,
     * także tych, których nie narysowano na mapie (podgląd bywa próbkowany).
     * Kategoria i powierzchnia liczone są z geometrii źródłowej, żeby tabela
     * nie zależała od tego, co akurat trafiło do warstwy wektorowej.
     */
    getTableRows() {
        return this.rawFeatures.map((raw, index) => {
            const id = String(raw?.id ?? raw?.properties?.id ?? `analysis-feature-${index + 1}`);
            const properties = raw?.properties && typeof raw.properties === 'object' ? raw.properties : {};
            const category = String(properties.category ?? raw?.category ?? this.metadata.category ?? 'other');
            let areaSqm = 0;
            try { areaSqm = raw?.geometry ? geometryArea(raw.geometry) : 0; } catch { areaSqm = 0; }
            return {
                id,
                category,
                categoryLabel: categoryLabel(category),
                areaSqm,
                name: properties.name ?? null,
                functionDetail: properties.functionDetail ?? properties.function ?? null,
                functionGeneral: properties.functionGeneral ?? null,
                floors: properties.floors ?? null,
                existence: properties.existence ?? null,
                rendered: this.featureById.has(id),
            };
        });
    }
    getMetadata() { return structuredClone(this.metadata); }
    getRenderStats() { return { ...this.renderStats }; }
    select(id) {
        const nextId = id == null ? null : String(id);
        if (this.selectedId === nextId) return this.getSelectedInfo();
        if (this.selectedId && this.featureById.has(this.selectedId)) this.featureById.get(this.selectedId).set('analysisSelected', false);
        this.selectedId = null;
        if (nextId) {
            let feature=this.featureById.get(nextId) ?? null;
            if (!feature && this.rawById.has(nextId)) {
                feature=this.renderOne(this.rawById.get(nextId), this.source.getFeatures().length, 0);
                if (feature) { this.source.addFeature(feature); this.renderStats.renderedCount=this.source.getFeatures().length; }
            }
            if (feature) { this.selectedId=nextId; feature.set('analysisSelected', true); }
        }
        this.layer.changed();
        return this.getSelectedInfo();
    }
    pick(pixel, hitTolerance = 5) {
        if (!this.layer.getVisible() || !Array.isArray(pixel)) return null;
        const features = this.host.getFeaturesAtPixel(pixel, { layer: this.layer, hitTolerance });
        const feature = features[0] ?? null;
        if (!feature) return null;
        const id = feature.get('analysisFeatureId');
        return id ? this.select(id) : null;
    }
    getSelectedInfo() {
        const feature = this.selectedId ? this.featureById.get(this.selectedId) : null;
        const raw = this.selectedId ? this.rawById.get(this.selectedId) : null;
        if (!feature || !raw) return null;
        const properties = raw.properties && typeof raw.properties === 'object' ? raw.properties : {};
        return {
            id: String(feature.get('analysisFeatureId') ?? ''),
            category: String(feature.get('analysisCategory') ?? 'other'),
            categoryLabel: String(feature.get('analysisCategoryLabel') ?? 'budynek'),
            areaSqm: Number(feature.get('analysisAreaSqm') ?? 0),
            properties: structuredClone(properties),
            geometry: structuredClone(raw.geometry),
        };
    }
    focusSelected() {
        const feature = this.selectedId ? this.featureById.get(this.selectedId) : null;
        const extent = feature?.getGeometry()?.getExtent();
        if (!extent) return;
        this.host.fitExtent(extent, { maxZoom: 20, duration: 220, padding: [96, 96, 96, 96] });
    }
    focus() {
        if (!this.source.getFeatures().length) return;
        const extent = this.source.getExtent();
        if (!extent || extent.some((value) => !Number.isFinite(value))) return;
        this.host.fitExtent(extent, { maxZoom: 19, duration: 240, padding: [88, 88, 88, 88] });
    }
    dispose() {
        this.clear();
        this.host.removeLayer(this.layer);
        this.layer.dispose?.();
    }
}
