import { fetchElevations } from './elevationClient.js';
import { balancedLevel, earthworks, paintSurface, slopeSummary, surfaceValueAt } from './terrainSurface.js';
import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import Text from 'ol/style/Text.js';
import Draw from 'ol/interaction/Draw.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { fromViewGeometry, toViewGeometry } from '../objects/geometryConversion.js';
import { projectToViewCoordinate } from '../projections/index.js';
import { t } from '../i18n/index.js';

const FLAT_SLOPE_THRESHOLD_PERCENT = 0.01;

const AREA_ACCURACY_PRESETS = Object.freeze({
    fast: Object.freeze({ samples: 50, label: t('terrain.szybka') }),
    accurate: Object.freeze({ samples: 200, label: t('terrain.dokladna') }),
    veryAccurate: Object.freeze({ samples: 400, label: t('terrain.bardzoDokladna') }),
    dense: Object.freeze({ samples: 800, label: t('terrain.dense') }),
});

const AREA_FRAME_STYLE = new Style({
    stroke: new Stroke({ color: '#0284c7', width: 2, lineDash: [7, 5] }),
    fill: new Fill({ color: 'rgba(14,165,233,0.06)' }),
});

const EMPTY_SNAPSHOT = Object.freeze({
    active: false,
    mode: null,
    view: 'line',
    drawing: false,
    busy: false,
    open: false,
    objectId: null,
    error: null,
    profile: null,
    hoverIndex: null,
    availableParcels: [],
    selectedParcelIds: [],
    areaSelectionMode: 'parcels',
    areaAccuracy: 'accurate',
    areaRectangle: null,
    areaAnalysis: null,
    progress: null,
    surfaceMode: 'combined',
    surfaceOpacity: 65,
    showAreaSamples: false,
    surfaceBusy: false,
    surfaceError: null,
    slopeAvailable: false,
    // 18.18.0: spadki terenu (udziały klas) i roboty ziemne do poziomu projektowego.
    slopeSummary: null,
    earthworkMode: 'balanced',
    earthworkLevel: null,
    earthworkBalancedLevel: null,
    earthworks: null,
    areaHover: null,
    slopeHover: null,
    showContours: false,
    contourInterval: 'auto',
    contourStep: null,
    contourAdjusted: false,
    contourBusy: false,
    contourError: null,
    exportBusy: false,
    exportError: null,
});

function lineLength(coordinates) {
    let total = 0;
    for (let i = 1; i < coordinates.length; i += 1) {
        total += Math.hypot(coordinates[i][0] - coordinates[i - 1][0], coordinates[i][1] - coordinates[i - 1][1]);
    }
    return total;
}

function sampleLine(coordinates) {
    const total = lineLength(coordinates);
    if (!(total > 0)) throw new Error(t('terrain.liniaProfiluMusiMiecDodatnia'));
    const count = Math.max(25, Math.min(220, Math.ceil(total / 10) + 1));
    const distances = [0];
    for (let i = 1; i < coordinates.length; i += 1) {
        distances.push(distances[i - 1] + Math.hypot(coordinates[i][0] - coordinates[i - 1][0], coordinates[i][1] - coordinates[i - 1][1]));
    }
    const points = [];
    for (let i = 0; i < count; i += 1) {
        const target = (total * i) / (count - 1);
        let segment = 0;
        while (segment < distances.length - 2 && distances[segment + 1] < target) segment += 1;
        const startD = distances[segment];
        const endD = distances[segment + 1];
        const span = Math.max(1e-9, endD - startD);
        const t = Math.max(0, Math.min(1, (target - startD) / span));
        const a = coordinates[segment];
        const b = coordinates[segment + 1];
        points.push({
            distance: target,
            coordinate2180: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        });
    }
    return { total, points };
}

function percentile(sorted, q) {
    if (!sorted.length) return null;
    const pos = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * q));
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function directionLabel(azimuth) {
    if (!Number.isFinite(azimuth)) return '—';
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return labels[Math.round(azimuth / 45) % 8];
}

export function terrainStats(points, lengthMeters = null) {
    const valid = points.filter((point) => Number.isFinite(point.elevation));
    if (valid.length < 2) throw new Error(t('terrain.brakWystarczajacejLiczbyDanychWysokoscio'));
    const elevations = valid.map((point) => point.elevation);
    const sorted = [...elevations].sort((a, b) => a - b);
    const minElevation = sorted[0];
    const maxElevation = sorted[sorted.length - 1];
    const meanElevation = elevations.reduce((sum, value) => sum + value, 0) / elevations.length;
    const variance = elevations.reduce((sum, value) => sum + ((value - meanElevation) ** 2), 0) / elevations.length;

    let maxSlopePercent = 0;
    let averageSlopePercent = null;
    let profileCoveragePercent = null;
    let validDistanceStart = null;
    let validDistanceEnd = null;
    if (Number.isFinite(lengthMeters) && lengthMeters > 0 && valid.every((p) => Number.isFinite(p.distance))) {
        let coveredDistance = 0;
        for (let i = 1; i < points.length; i += 1) {
            if (!Number.isFinite(points[i].elevation) || !Number.isFinite(points[i - 1].elevation)) continue;
            const dx = points[i].distance - points[i - 1].distance;
            if (dx <= 0) continue;
            coveredDistance += dx;
            maxSlopePercent = Math.max(maxSlopePercent, Math.abs((points[i].elevation - points[i - 1].elevation) / dx) * 100);
        }
        validDistanceStart = valid[0].distance;
        validDistanceEnd = valid[valid.length - 1].distance;
        const validSpan = validDistanceEnd - validDistanceStart;
        if (validSpan > 0) {
            averageSlopePercent = ((valid[valid.length - 1].elevation - valid[0].elevation) / validSpan) * 100;
            profileCoveragePercent = Math.max(0, Math.min(100, (coveredDistance / lengthMeters) * 100));
            if (coveredDistance === 0) maxSlopePercent = null;
        }
    }

    // Least-squares terrain plane z = a*x + b*y + c. The negative gradient
    // gives the approximate downhill direction across the analysed parcel(s).
    const xy = valid.filter((p) => Array.isArray(p.coordinate2180));
    let planeSlopePercent = null;
    let downhillAzimuth = null;
    if (xy.length >= 3) {
        const mx = xy.reduce((s, p) => s + p.coordinate2180[0], 0) / xy.length;
        const my = xy.reduce((s, p) => s + p.coordinate2180[1], 0) / xy.length;
        const mz = xy.reduce((s, p) => s + p.elevation, 0) / xy.length;
        let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
        for (const p of xy) {
            const x = p.coordinate2180[0] - mx;
            const y = p.coordinate2180[1] - my;
            const z = p.elevation - mz;
            sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z;
        }
        const det = (sxx * syy) - (sxy * sxy);
        if (Math.abs(det) > 1e-9) {
            const a = ((sxz * syy) - (syz * sxy)) / det;
            const b = ((syz * sxx) - (sxz * sxy)) / det;
            planeSlopePercent = Math.hypot(a, b) * 100;
            if (planeSlopePercent >= FLAT_SLOPE_THRESHOLD_PERCENT) {
                const dx = -a;
                const dy = -b;
                downhillAzimuth = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
            } else {
                downhillAzimuth = null;
            }
        }
    }

    const minPoint = valid.reduce((best, p) => p.elevation < best.elevation ? p : best, valid[0]);
    const meanPoint = valid.reduce((best, p) => Math.abs(p.elevation - meanElevation) < Math.abs(best.elevation - meanElevation) ? p : best, valid[0]);
    const maxPoint = valid.reduce((best, p) => p.elevation > best.elevation ? p : best, valid[0]);
    return {
        ...(Number.isFinite(lengthMeters) ? { lengthMeters } : {}),
        minElevation,
        maxElevation,
        meanElevation,
        medianElevation: percentile(sorted, 0.5),
        p10Elevation: percentile(sorted, 0.10),
        p90Elevation: percentile(sorted, 0.90),
        elevationRange: maxElevation - minElevation,
        standardDeviation: Math.sqrt(variance),
        averageSlopePercent,
        maxSlopePercent: Number.isFinite(lengthMeters) ? maxSlopePercent : null,
        profileCoveragePercent,
        validDistanceStart,
        validDistanceEnd,
        planeSlopePercent,
        downhillAzimuth,
        downhillDirection: directionLabel(downhillAzimuth),
        validSamples: valid.length,
        sampleCount: points.length,
        minPoint: minPoint.coordinate2180 ?? null,
        maxPoint: maxPoint.coordinate2180 ?? null,
        meanPoint: meanPoint.coordinate2180 ?? null,
        meanPointElevation: meanPoint.elevation,
    };
}

function geometryParts(geometry) {
    if (geometry?.type === 'Polygon') return [geometry.coordinates];
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
    return [];
}
function ringArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        sum += (a[0] * b[1]) - (b[0] * a[1]);
    }
    return Math.abs(sum) / 2;
}
function geometryArea(geometry) {
    return geometryParts(geometry).reduce((sum, polygon) => {
        if (!polygon?.length) return sum;
        return sum + Math.max(0, ringArea(polygon[0]) - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0));
    }, 0);
}
function geometryExtent(geometry) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const polygon of geometryParts(geometry)) {
        for (const ring of polygon) {
            for (const point of ring) {
                minX = Math.min(minX, point[0]); minY = Math.min(minY, point[1]);
                maxX = Math.max(maxX, point[0]); maxY = Math.max(maxY, point[1]);
            }
        }
    }
    return [minX, minY, maxX, maxY];
}
function pointInRing(point, ring) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
function pointInGeometry(point, geometry) {
    return geometryParts(geometry).some((polygon) => {
        if (!polygon?.length || !pointInRing(point, polygon[0])) return false;
        return !polygon.slice(1).some((hole) => pointInRing(point, hole));
    });
}
function appendUnique(points, point, keySet) {
    const key = `${Math.round(point[0] * 10)},${Math.round(point[1] * 10)}`;
    if (keySet.has(key)) return;
    keySet.add(key);
    points.push(point);
}
function sampleGeometry(geometry, target) {
    const area = Math.max(1, geometryArea(geometry));
    const [minX, minY, maxX, maxY] = geometryExtent(geometry);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return { points: [], spacing: null, area };
    let spacing = Math.sqrt(area / Math.max(4, target));
    spacing = Math.max(1.5, Math.min(1000, spacing));
    const candidates = [];
    const keys = new Set();
    let loops = 0;
    for (let y = minY + spacing / 2; y <= maxY; y += spacing) {
        for (let x = minX + spacing / 2; x <= maxX; x += spacing) {
            if (++loops > 30000) break;
            if (pointInGeometry([x, y], geometry)) appendUnique(candidates, [x, y], keys);
        }
        if (loops > 30000) break;
    }
    // Wąskie / nieregularne działki mogą ominąć środki komórek siatki.
    // Dodajemy wtedy reprezentatywne punkty obrysu.
    if (candidates.length < Math.min(8, target)) {
        for (const polygon of geometryParts(geometry)) {
            const outer = polygon[0] ?? [];
            const stride = Math.max(1, Math.ceil(outer.length / Math.max(4, target - candidates.length)));
            for (let i = 0; i < outer.length && candidates.length < target; i += stride) appendUnique(candidates, outer[i], keys);
        }
    }
    if (candidates.length <= target) return { points: candidates, spacing, area };
    const points = [];
    for (let i = 0; i < target; i += 1) {
        const index = Math.min(candidates.length - 1, Math.floor(((i + 0.5) * candidates.length) / target));
        points.push(candidates[index]);
    }
    return { points, spacing, area };
}
export function sampleParcels(objects, maxTotal = 200) {
    if (!objects.length) throw new Error(t('terrain.wybierzCoNajmniejJednaDzialke'));
    if (objects.length > 12) throw new Error(t('terrain.jednoczesnieMoznaAnalizowacMaksymalnie12'));
    const areas = objects.map((object) => Math.max(1, geometryArea(object.geometry)));
    const totalArea = areas.reduce((sum, value) => sum + value, 0);
    const minimumPerParcel = Math.max(2, Math.min(8, Math.floor(maxTotal / objects.length)));
    const reserved = minimumPerParcel * objects.length;
    const spare = Math.max(0, maxTotal - reserved);
    const result = [];
    for (let index = 0; index < objects.length; index += 1) {
        const target = Math.max(2, Math.min(maxTotal, minimumPerParcel + Math.round(spare * (areas[index] / totalArea))));
        const sampled = sampleGeometry(objects[index].geometry, target);
        for (const coordinate2180 of sampled.points) {
            result.push({
                parcelId: objects[index].id,
                parcelName: objects[index].name,
                coordinate2180,
                spacing: sampled.spacing,
                parcelAreaSqm: sampled.area,
            });
        }
    }
    if (result.length < 2) throw new Error(t('terrain.nieUdaloSieWygenerowacSiatki'));
    if (result.length <= maxTotal) return result;
    const reduced = [];
    for (let i = 0; i < maxTotal; i += 1) {
        const index = Math.min(result.length - 1, Math.floor(((i + 0.5) * result.length) / maxTotal));
        reduced.push(result[index]);
    }
    return reduced;
}
function rectangleGeometryFunction(coordinates, geometry) {
    const start = coordinates?.[0];
    const end = coordinates?.[1];
    if (!start || !end) return geometry;
    const ring = [
        [start[0], start[1]],
        [start[0], end[1]],
        [end[0], end[1]],
        [end[0], start[1]],
        [start[0], start[1]],
    ];
    if (geometry) {
        geometry.setCoordinates([ring]);
        return geometry;
    }
    return new Polygon([ring]);
}
export function sampleRectangle(geometry, target) {
    const [minX, minY, maxX, maxY] = geometryExtent(geometry);
    const width = maxX - minX;
    const height = maxY - minY;
    if (![minX, minY, maxX, maxY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        throw new Error(t('terrain.wskazProstokatODodatniejSzerokosci'));
    }
    const wanted = Math.max(4, Math.min(800, Math.round(target)));
    const aspect = width / height;
    let columns = 2, rows = Math.floor(wanted / 2), best = Infinity;
    // Presets all have factor pairs: keep the requested count exactly while
    // selecting the grid whose metric cells are closest to squares.
    for (let candidate = 2; candidate <= Math.floor(wanted / 2); candidate++) {
        if (wanted % candidate !== 0) continue;
        const candidateRows = wanted / candidate;
        const difference = Math.abs(Math.log((candidate / candidateRows) / aspect));
        if (difference < best) { best = difference; columns = candidate; rows = candidateRows; }
    }
    const spacingX = width / columns;
    const spacingY = height / rows;
    const points = [];
    for (let row = 0; row < rows; row += 1) {
        const y = minY + (row + 0.5) * spacingY;
        for (let col = 0; col < columns; col += 1) {
            const x = minX + (col + 0.5) * spacingX;
            points.push({
                parcelId: 'manual-rectangle',
                parcelName: t('terrain.area.rectangle'),
                coordinate2180: [x, y],
                spacing: Math.sqrt(spacingX * spacingY),
                spacingX,
                spacingY,
                parcelAreaSqm: width * height,
            });
        }
    }
    return { points, width, height, area: width * height, columns, rows, spacingX, spacingY };
}

function elevationStyle(index) {
    const t = Math.max(0, Math.min(1, index / 8));
    const hue = Math.round(220 - (200 * t));
    return new Style({
        image: new CircleStyle({
            radius: 5,
            fill: new Fill({ color: `hsla(${hue},78%,48%,0.76)` }),
            stroke: new Stroke({ color: 'rgba(255,255,255,0.82)', width: 1 }),
        }),
    });
}
const ELEVATION_STYLES = Array.from({ length: 9 }, (_, index) => elevationStyle(index));
const HOVER_STYLE = new Style({
    image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#111827', width: 2.5 }) }),
});
const MISSING_STYLE = new Style({
    image: new CircleStyle({ radius: 4, fill: new Fill({ color: 'rgba(255,255,255,0.2)' }), stroke: new Stroke({ color: '#64748b', width: 2 }) }),
});

/** 18.12.1: obiekt, który można analizować w „Analizie wysokości”. */
function isAreaCandidate(kind, origin, geometryType) {
    if (!['Polygon', 'MultiPolygon'].includes(geometryType)) return false;
    return !['measurement', 'text', 'callout'].includes(kind ?? 'geometry');
}

export class TerrainProfileManager {
    constructor(host, objectManager, objectCommands) {
        this.host = host;
        this.objectManager = objectManager;
        this.objectCommands = objectCommands;
        this.listeners = new Set();
        this.interaction = null;
        this.abortController = null;
        this.profileFingerprint = null;
        this.disposed = false;
        this.snapshot = EMPTY_SNAPSHOT;
        this.surfaceLayers = [];
        this.surfaceTiles = [];
        this.surfaceGeneration = 0;
        this.surfaceWorker = null;
        this.surfaceUrls = [];
        this.contourGeneration = 0;
        this.contourResult = null;
        this.contourStyles = new Map();
        this.pendingArea = null;
        this.pendingLine = null;
        this.areaFrameSource = new VectorSource({ wrapX: false });
        this.areaFrameLayer = new VectorLayer({
            source: this.areaFrameSource,
            zIndex: 10019,
            properties: { mapownikRole: 'terrain-area-frame' },
            style: AREA_FRAME_STYLE,
        });
        this.analysisSource = new VectorSource({ wrapX: false });
        this.analysisLayer = new VectorLayer({
            source: this.analysisSource,
            zIndex: 10020,
            updateWhileAnimating: false,
            updateWhileInteracting: false,
            properties: { mapownikRole: 'terrain-analysis' },
            style: (feature) => {
                if (feature.get('terrainHover')) return HOVER_STYLE;
                if (feature.get('terrainMarkerStyle')) return feature.get('terrainMarkerStyle');
                if (!this.snapshot.showAreaSamples) return null;
                if (feature.get('terrainMissing')) return MISSING_STYLE;
                const bucket = Number(feature.get('terrainBucket'));
                return ELEVATION_STYLES[Number.isFinite(bucket) ? Math.max(0, Math.min(8, bucket)) : 4];
            },
        });
        this.contourSource = new VectorSource({ wrapX: false });
        this.contourLayer = new VectorLayer({ source: this.contourSource, zIndex: 10019.5, visible: false, declutter: true,
            properties: { mapownikRole: 'terrain-contours' }, style: (feature) => {
                const elevation = feature.get('terrainContourElevation');
                const step = this.snapshot.contourStep || 1;
                const major = Math.abs(elevation / step / 5 - Math.round(elevation / step / 5)) < 1e-5;
                const key = `${elevation}:${step}`;
                if (!this.contourStyles.has(key)) this.contourStyles.set(key, [
                    new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.65)', width: major ? 3 : 2 }) }),
                    new Style({ stroke: new Stroke({ color: '#334155', width: major ? 1.4 : 0.7 }),
                        text: major ? new Text({ text: `${Number(elevation.toFixed(2))} m`, placement: 'line', repeat: 220,
                            font: '11px sans-serif', fill: new Fill({ color: '#111827' }), stroke: new Stroke({ color: '#fff', width: 3 }) }) : undefined }),
                ]);
                return this.contourStyles.get(key);
            } });
        this.host.addLayer(this.contourLayer);
        this.host.addLayer(this.areaFrameLayer);
        this.host.addLayer(this.analysisLayer);
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
        this.unsubscribeObjects = this.objectManager.subscribe(() => {
            this.refreshParcelCandidates();
            this.syncSelection();
        });
        this.unsubscribePointer = null;
        this.refreshParcelCandidates();
    }
    async profileObject(id) {
        this.assertAlive();
        const object = this.objectManager.getObject(id);
        if (object.geometry.type !== 'LineString') return;
        if (object.kind === 'terrain-profile') return this.loadObjectProfile(id, false);
        const profileId = this.objectCommands.create({ name: `Profil: ${object.name}`, geometry: object.geometry,
            kind: 'terrain-profile', origin: 'user', visible: true, properties: { sourceObjectId: object.id } });
        this.objectManager.select(profileId);
        return this.loadObjectProfile(profileId, false);
    }
    activate() { this.activateLine(); }
    activateLine() {
        this.assertAlive();
        this.abortController?.abort();
        this.abortController = null;
        this.removeDrawInteraction();
        this.clearHoverMarker();
        this.clearAreaOverlay();
        this.clearAreaFrame();
        const interaction = new Draw({ type: 'LineString', stopClick: true });
        this.interaction = interaction;
        this.host.addInteraction(interaction);
        interaction.on('drawstart', () => this.update({ active: true, mode: 'line', view: 'line', drawing: true, open: true, error: null }));
        interaction.on('drawend', (event) => {
            try {
                const geometry = event.feature.getGeometry();
                if (!geometry) throw new Error(t('terrain.nieUdaloSieOdczytacLinii'));
                const projectGeometry = fromViewGeometry(geometry);
                if (projectGeometry.type !== 'LineString') throw new Error(t('terrain.profilWymagaGeometriiLiniowej'));
                const length = lineLength(projectGeometry.coordinates);
                const id = this.objectCommands.create({
                    name: t('terrain.profilTerenuM', { value: Math.round(length).toLocaleString('pl-PL') }),
                    geometry: projectGeometry,
                    visible: true,
                    origin: 'analysis',
                    kind: 'terrain-profile',
                    properties: { terrainProfileModel: 'NMT', terrainVerticalDatum: 'PL-KRON86-NH' },
                    style: { strokeColor: '#059669', strokeWidth: 3, strokeOpacity: 1, strokePattern: 'solid', fillColor: '#10b981', fillOpacity: 0.10, pointRadius: 5 },
                });
                // 18.12.0: najpierw start pobierania, potem zaznaczenie — wcześniej
                // zaznaczenie uruchamiało pobieranie, a zaraz potem drugie (force).
                this.update({ busy: false, progress: null, active: true, mode: 'line', view: 'line', drawing: false, objectId: id, open: true, error: null });
                void this.loadObjectProfile(id, true);
                this.objectManager.select(id);
            } catch (error) {
                this.update({ drawing: false, error: error instanceof Error ? error.message : String(error) });
            }
        });
        this.update({ busy: false, progress: null, active: true, mode: 'line', view: 'line', open: true, error: null });
    }
    activateArea() {
        this.assertAlive();
        this.abortController?.abort();
        this.abortController = null;
        this.removeDrawInteraction();
        this.clearHoverMarker();
        this.clearAreaOverlay();
        this.clearAreaFrame();
        this.refreshParcelCandidates(true);
        this.update({ busy: false, progress: null, active: true, mode: 'area', view: 'area', drawing: false, open: true, error: null, areaRectangle: null, areaAnalysis: null });
        // 19.18.0: bez poligonów w projekcie od razu rysowanie prostokąta na mapie — jak w innych
        // narzędziach Pomiaru (wcześniej kliknięcia w mapę nic nie robiły, trzeba było szukać
        // przycisku „Prostokąt” w dolnym panelu).
        if (!this.snapshot.availableParcels?.length) this.startAreaRectangleSelection();
    }
    /** Porzuca rozpoczęty szkic, zostając w narzędziu. Patrz EditingManager.abortSketch. */
    abortSketch() {
        if (this.disposed || !this.snapshot.drawing) return false;
        this.interaction?.abortDrawing?.();
        this.update({ drawing: false });
        return true;
    }
    /** 18.0: kończy szkic linii profilu (pasek kontekstu, Enter). */
    finishSketch() {
        if (this.disposed || !this.snapshot.drawing || !this.interaction?.finishDrawing) return false;
        this.interaction.finishDrawing();
        return true;
    }
    /** 18.0: cofa ostatni wierzchołek linii profilu (Backspace). */
    undoLastPoint() {
        if (this.disposed || !this.snapshot.drawing || !this.interaction?.removeLastPoint) return false;
        this.interaction.removeLastPoint();
        return true;
    }
    deactivate() {
        this.cancelLoading();
        this.removeDrawInteraction();
        if (this.snapshot.mode === 'area') {
            this.clearAreaOverlay();
            this.clearAreaFrame();
        }
        // 18.11.0: pusty dolny panel (bez wyniku, błędu i trwającego pobierania)
        // zamyka się razem z narzędziem — inaczej zabierał ~1/3 wysokości mapy.
        // Panel z wynikiem zostaje, żeby można było do niego wrócić.
        const s = this.snapshot;
        const hasResult = s.view === 'area' ? Boolean(s.areaAnalysis) : Boolean(s.profile);
        const keepOpen = hasResult || Boolean(s.error) || Boolean(s.busy);
        this.update({ active: false, mode: null, drawing: false, ...(keepOpen ? {} : { open: false }) });
    }
    closePanel() {
        this.cancelLoading();
        this.clearHoverMarker();
        if (this.snapshot.view === 'area') {
            this.clearAreaOverlay();
            this.clearAreaFrame();
        }
        this.update({ open: false, hoverIndex: null });
    }
    async retry() {
        if (this.snapshot.view === 'area') return this.analyzeArea();
        const id = this.snapshot.objectId;
        if (id) await this.loadObjectProfile(id, true);
    }
    setProfileHover(index) {
        const points = this.snapshot.profile?.points ?? [];
        const normalized = Number.isInteger(index) && index >= 0 && index < points.length ? index : null;
        if (normalized === this.snapshot.hoverIndex) return;
        this.clearHoverMarker();
        if (normalized !== null) {
            const point = points[normalized];
            if (Array.isArray(point.coordinate2180)) {
                const feature = new Feature({ geometry: new Point(projectToViewCoordinate(point.coordinate2180)) });
                feature.set('terrainHover', true, true);
                this.analysisSource.addFeature(feature);
            }
        }
        this.update({ hoverIndex: normalized });
    }
    clearHoverMarker() {
        for (const feature of this.analysisSource.getFeatures()) {
            if (feature.get('terrainHover')) this.analysisSource.removeFeature(feature);
        }
    }
    refreshParcelCandidates(resetSelection = false) {
        if (this.disposed) return;
        const items = this.objectManager.getSnapshot().items
            // 18.12.1: każdy poligon projektu (działka z ULDK, obrys farmy, bufor…),
            // nie tylko działki — pomiary powierzchni pomijamy. Działki pierwsze.
            .filter((item) => isAreaCandidate(item.kind, item.origin, item.geometryType))
            .sort((a, b) => Number(b.origin === 'parcel') - Number(a.origin === 'parcel'))
            .map((item) => ({ id: item.id, name: item.name, visible: item.visible, parcel: item.origin === 'parcel' }));
        let selected = this.snapshot.selectedParcelIds.filter((id) => items.some((item) => item.id === id));
        if (resetSelection || selected.length === 0) {
            const selectedObjectId = this.objectManager.getSnapshot().selectedId;
            const selectedItem = items.find((item) => item.id === selectedObjectId);
            selected = selectedItem ? [selectedItem.id] : items.filter((item) => item.visible).slice(0, 12).map((item) => item.id);
        }
        const sameItems = JSON.stringify(items) === JSON.stringify(this.snapshot.availableParcels);
        const sameSelection = JSON.stringify(selected) === JSON.stringify(this.snapshot.selectedParcelIds);
        if (!sameItems || !sameSelection) this.update({ availableParcels: items, selectedParcelIds: selected });
        if (this.currentAreaRegions?.some((region) => {
            if (region.id === 'manual-rectangle') return false;
            try { return JSON.stringify(this.objectManager.getObject(region.id).geometry) !== JSON.stringify(region.geometry); }
            catch { return true; }
        })) this.invalidateArea();
    }
    setAreaParcelSelected(id, selected) {
        this.invalidateArea();
        const exists = this.snapshot.availableParcels.some((item) => item.id === id);
        if (!exists) return;
        const set = new Set(this.snapshot.selectedParcelIds);
        if (selected) set.add(id); else set.delete(id);
        if (set.size > 12) {
            this.update({ error: t('terrain.jednoczesnieMoznaAnalizowacMaksymalnie12') });
            return;
        }
        this.update({ selectedParcelIds: [...set], error: null });
    }
    selectVisibleParcels() {
        this.invalidateArea();
        this.update({ selectedParcelIds: this.snapshot.availableParcels.filter((item) => item.visible).slice(0, 12).map((item) => item.id), error: null });
    }
    clearAreaSelection() { this.invalidateArea(); this.update({ selectedParcelIds: [], error: null }); }
    /** 18.12.0: osobne przerwanie pobierania obszaru i profilu linii. */
    cancelLoading(scope = 'all') {
        this.abortController?.abort();
        this.abortController = null;
        if (scope !== 'area') { this.lineController?.abort(); this.lineController = null; }
        this.update({ busy: false, progress: this.snapshot.progress ? { ...this.snapshot.progress, canceled: true } : null });
    }
    invalidateArea() {
        if (this.abortController) this.cancelLoading('area');
        this.pendingArea = null;
        this.currentAreaRegions = null;
        this.clearAreaOverlay();
        this.update({ areaAnalysis: null, progress: null, error: null });
    }
    attachSurfacePointer() {
        this.unsubscribePointer = this.host.onPointerMove?.((pointer) => {
            if (!this.surfaceTiles.length || this.snapshot.view !== 'area' || !this.snapshot.open) return;
            const elevation = pointer ? surfaceValueAt(this.surfaceTiles, pointer.coordinate2180) : null;
            const rounded = elevation === null ? null : Math.round(elevation * 10) / 10;
            const slope = pointer ? surfaceValueAt(this.surfaceTiles, pointer.coordinate2180, 'slopes') : null;
            const slopeRounded = slope === null ? null : Math.round(slope * 10) / 10;
            if (rounded !== this.snapshot.areaHover || slopeRounded !== this.snapshot.slopeHover) this.update({ areaHover: rounded, slopeHover: slopeRounded });
        });
    }
    /**
     * 18.18.0 — poziom projektowy platformy: 'balanced' (wykop = nasyp, średnia
     * wysokość terenu) albo 'custom' (wysokość podana przez użytkownika, m n.p.m.).
     */
    setEarthworkLevel(mode, value = this.snapshot.earthworkLevel) {
        const nextMode = mode === 'custom' ? 'custom' : 'balanced';
        const level = Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : null;
        this.update({ earthworkMode: nextMode, earthworkLevel: level });
        this.recomputeEarthworks();
    }
    recomputeEarthworks() {
        const s = this.snapshot;
        const level = s.earthworkMode === 'custom' ? s.earthworkLevel : s.earthworkBalancedLevel;
        const result = this.surfaceTiles?.length && Number.isFinite(level) ? earthworks(this.surfaceTiles, level) : null;
        this.update({ earthworks: result ? { ...result, mode: s.earthworkMode } : null });
    }
    setSurfaceMode(mode) {
        if (!['colors', 'shade', 'combined', 'slope'].includes(mode)) return;
        this.update({ surfaceMode: mode });
        for (const entry of this.surfaceLayers) entry.layer.setSource(entry.sources[mode]);
    }
    setSurfaceOpacity(value) {
        const opacity = Math.max(10, Math.min(100, Number(value)));
        if (!Number.isFinite(opacity)) return;
        this.update({ surfaceOpacity: opacity });
        for (const entry of this.surfaceLayers) entry.layer.setOpacity(opacity / 100);
    }
    setShowAreaSamples(value) {
        this.update({ showAreaSamples: Boolean(value) });
        this.analysisLayer.changed();
    }
    setShowContours(value) {
        this.update({ showContours: Boolean(value) });
        this.contourLayer.setVisible(Boolean(value));
        if (value) void this.refreshContours();
        else {
            this.contourGeneration++;
            this.cancelContours?.(); this.cancelContours = null;
            this.update({ contourBusy: false });
        }
    }
    setContourInterval(value) {
        if (!['auto', '0.5', '1', '2', '5', '10', '20'].includes(String(value))) return;
        this.update({ contourInterval: String(value) });
        this.contourResult = null;
        this.contourSource.clear(true);
        if (this.snapshot.showContours) void this.refreshContours();
    }
    clearContours() {
        this.contourGeneration++;
        this.cancelContours?.(); this.cancelContours = null;
        this.contourSource?.clear(true);
        this.contourStyles?.clear();
        this.contourResult = null;
        this.update({ contourBusy: false, contourStep: null, contourError: null, contourAdjusted: false });
    }
    async refreshContours() {
        if (!this.snapshot.showContours || !this.surfaceTiles.length) return;
        if (this.contourResult?.key === this.snapshot.contourInterval) return;
        this.cancelContours?.();
        const generation = ++this.contourGeneration, key = this.snapshot.contourInterval;
        this.update({ contourBusy: true, contourError: null });
        try {
            const result = await new Promise((resolve, reject) => {
                const worker = new Worker(new URL('./terrainSurface.worker.js', import.meta.url), { type: 'module' });
                const cancel = () => { worker.terminate(); reject(new DOMException(t('terrain.progress.aborted'), 'AbortError')); };
                this.cancelContours = cancel;
                const finish = (data, error) => { worker.terminate(); if (this.cancelContours === cancel) this.cancelContours = null;
                    if (error) reject(error); else resolve(data); };
                worker.onmessage = ({ data }) => finish(data, data.error ? new Error(data.error) : null);
                worker.onerror = () => finish(null, new Error(t('terrain.contours.error')));
                worker.postMessage({ action: 'contours', interval: key,
                    tiles: this.surfaceTiles.map(({ values, width, height, extent, rings }) => ({ values, width, height, extent, rings })) });
            });
            if (generation !== this.contourGeneration || this.disposed) return;
            this.contourSource.clear(true); this.contourStyles.clear();
            this.update({ contourStep: result.interval, contourAdjusted: result.adjusted, contourBusy: false });
            this.contourResult = { ...result, key };
            const features = result.lines.map((line) => {
                const feature = new Feature({ geometry: toViewGeometry({ type: 'LineString', coordinates: line.coordinates }) });
                feature.set('terrainContourElevation', line.elevation, true); return feature;
            });
            this.contourSource.addFeatures(features);
            this.contourLayer.setVisible(this.snapshot.showContours);
        } catch (error) {
            if (generation !== this.contourGeneration || this.disposed) return;
            this.update({ contourBusy: false, contourError: String(error?.message || error) });
        }
    }
    async exportArea(format) {
        if (!['png', 'pdf'].includes(format) || this.snapshot.exportBusy || this.snapshot.busy || this.snapshot.surfaceBusy || this.snapshot.contourBusy) return;
        const snapshot = this.snapshot, tiles = this.surfaceTiles, generation = this.surfaceGeneration;
        if (!snapshot.areaAnalysis || !tiles.length) return;
        this.update({ exportBusy: true, exportError: null });
        try {
            const { createTerrainReportBlob, downloadTerrainReport } = await import('./terrainReport.js');
            const blob = await createTerrainReportBlob(snapshot, tiles, this.contourResult, format);
            if (generation !== this.surfaceGeneration || this.disposed) return;
            downloadTerrainReport(blob, format);
        } catch (error) {
            if (generation === this.surfaceGeneration && !this.disposed) this.update({ exportError: String(error?.message || error) });
        } finally {
            if (generation === this.surfaceGeneration && !this.disposed) this.update({ exportBusy: false });
        }
    }
    retrySurface() {
        const analysis = this.snapshot.areaAnalysis;
        if (analysis) void this.renderAreaOverlay(analysis.points, analysis.stats, analysis.regions);
    }
    setAreaSelectionMode(mode) {
        if (!['parcels', 'rectangle'].includes(mode)) return;
        this.invalidateArea();
        this.removeDrawInteraction();
        this.clearAreaOverlay();
        if (mode === 'parcels') this.clearAreaFrame();
        else if (this.snapshot.areaRectangle?.geometry) this.renderAreaFrame(this.snapshot.areaRectangle.geometry);
        this.update({ areaSelectionMode: mode, drawing: false, areaAnalysis: null, error: null });
    }
    setAreaAccuracy(value) {
        if (!AREA_ACCURACY_PRESETS[value]) return;
        this.invalidateArea();
        this.clearAreaOverlay();
        this.update({ areaAccuracy: value, areaAnalysis: null, error: null });
    }
    startAreaRectangleSelection() {
        this.assertAlive();
        this.abortController?.abort();
        this.abortController = null;
        this.removeDrawInteraction();
        this.clearAreaOverlay();
        this.clearAreaFrame();
        const interaction = new Draw({ type: 'Circle', geometryFunction: rectangleGeometryFunction, stopClick: true });
        this.interaction = interaction;
        this.host.addInteraction(interaction);
        interaction.on('drawstart', () => this.update({ areaSelectionMode: 'rectangle', drawing: true, open: true, error: null, areaAnalysis: null, areaRectangle: null }));
        interaction.on('drawend', (event) => {
            try {
                const olGeometry = event.feature.getGeometry();
                if (!olGeometry) throw new Error(t('terrain.nieUdaloSieOdczytacProstokata'));
                const geometry = fromViewGeometry(olGeometry);
                if (geometry.type !== 'Polygon') throw new Error(t('terrain.analizaPowierzchniWymagaProstokata'));
                const [minX, minY, maxX, maxY] = geometryExtent(geometry);
                const width = maxX - minX;
                const height = maxY - minY;
                if (!(width > 0 && height > 0)) throw new Error(t('terrain.prostokatMusiMiecDodatnieWymiary'));
                const areaRectangle = { geometry, widthMeters: width, heightMeters: height, areaSqm: width * height };
                this.renderAreaFrame(geometry);
                this.update({ areaSelectionMode: 'rectangle', drawing: false, open: true, error: null, areaRectangle, areaAnalysis: null });
            } catch (error) {
                this.update({ drawing: false, error: error instanceof Error ? error.message : String(error) });
            } finally {
                this.removeDrawInteraction();
            }
        });
        this.update({ busy: false, progress: null, areaSelectionMode: 'rectangle', drawing: true, open: true, error: null });
    }
    async analyzeArea() {
        this.assertAlive();
        const selectionMode = this.snapshot.areaSelectionMode === 'rectangle' ? 'rectangle' : 'parcels';
        const accuracyKey = AREA_ACCURACY_PRESETS[this.snapshot.areaAccuracy] ? this.snapshot.areaAccuracy : 'accurate';
        const accuracy = AREA_ACCURACY_PRESETS[accuracyKey];
        let samples = [];
        let objects = [];
        let rectangleSampling = null;
        if (selectionMode === 'rectangle') {
            const rectangle = this.snapshot.areaRectangle;
            if (!rectangle?.geometry) {
                this.update({ view: 'area', open: true, error: t('terrain.najpierwWskazProstokatNaMapie') });
                return;
            }
            try {
                rectangleSampling = sampleRectangle(rectangle.geometry, accuracy.samples);
                samples = rectangleSampling.points;
            } catch (error) {
                this.update({ error: error instanceof Error ? error.message : String(error), open: true, view: 'area' });
                return;
            }
        } else {
            const ids = this.snapshot.selectedParcelIds;
            if (!ids.length) {
                this.update({ view: 'area', open: true, error: t('terrain.zaznaczCoNajmniejJednaDzialke') });
                return;
            }
            objects = ids.map((id) => {
                try { return this.objectManager.getObject(id); } catch { return null; }
            }).filter((object) => object && isAreaCandidate(object.kind, object.origin, object.geometry.type));
            if (!objects.length) {
                this.update({ error: t('terrain.wybraneObiektyNieSaDzialkami') });
                return;
            }
            try { samples = sampleParcels(objects, accuracy.samples); }
            catch (error) {
                this.update({ error: error instanceof Error ? error.message : String(error), open: true, view: 'area' });
                return;
            }
        }
        const regions = selectionMode === 'rectangle'
            ? [{ id: 'manual-rectangle', geometry: structuredClone(this.snapshot.areaRectangle.geometry) }]
            : objects.map((object) => ({ id: object.id, geometry: structuredClone(object.geometry) }));
        const fingerprint = JSON.stringify({ regions, coordinates: samples.map((sample) => sample.coordinate2180) });
        const reuse = this.pendingArea?.fingerprint === fingerprint;
        if (!reuse) { this.clearAreaOverlay(); this.update({ areaAnalysis: null }); }
        this.currentAreaRegions = regions;
        this.areaFrameSource.clear(true);
        for (const region of regions) this.areaFrameSource.addFeature(new Feature({ geometry: toViewGeometry(region.geometry) }));
        this.abortController?.abort();
        const controller = new AbortController();
        this.abortController = controller;
        this.update({ busy: true, open: true, view: 'area', error: null, progress: null, surfaceError: null });
        try {
            const payload = await fetchElevations(samples.map((sample) => sample.coordinate2180), {
                signal: controller.signal,
                initialHeights: this.pendingArea?.fingerprint === fingerprint ? this.pendingArea.heights : [],
                onPartial: (heights) => { if (this.abortController === controller) this.pendingArea = { fingerprint, heights }; },
                onProgress: (progress) => { if (this.abortController === controller) this.update({ progress }); },
            });
            if (controller.signal.aborted) return;
            this.pendingArea = { fingerprint, heights: payload.heights };
            const points = samples.map((sample, index) => ({ ...sample, elevation: payload.heights[index], status: payload.statuses[index] }));
            const combinedStats = terrainStats(points);
            const parcels = selectionMode === 'parcels' ? objects.map((object) => {
                const parcelPoints = points.filter((point) => point.parcelId === object.id);
                let stats = null;
                try { stats = terrainStats(parcelPoints); } catch { stats = null; }
                return {
                    id: object.id,
                    name: object.name,
                    stats,
                    sampleCount: parcelPoints.length,
                    approximateSpacing: parcelPoints.find((point) => Number.isFinite(point.spacing))?.spacing ?? null,
                };
            }) : [];
            if (controller.signal.aborted) return;
            void this.renderAreaOverlay(points, combinedStats, regions);
            this.update({
                busy: false,
                error: null,
                open: true,
                view: 'area',
                areaAnalysis: {
                    source: payload.source || 'GUGiK NMT',
                    model: payload.model || 'NMT',
                    verticalDatum: payload.verticalDatum || 'PL-KRON86-NH',
                    heightType: payload.heightType || t('terrain.wysokoscNormalna'),
                    heightUnit: payload.heightUnit || 'm',
                    points,
                    complete: payload.complete,
                    statuses: payload.statuses,
                    diagnostics: payload.diagnostics,
                    regions,
                    stats: combinedStats,
                    parcels,
                    selectionMode,
                    accuracy: accuracyKey,
                    accuracyLabel: accuracy.label,
                    targetSamples: accuracy.samples,
                    rectangle: selectionMode === 'rectangle' && rectangleSampling ? {
                        widthMeters: rectangleSampling.width,
                        heightMeters: rectangleSampling.height,
                        areaSqm: rectangleSampling.area,
                        columns: rectangleSampling.columns,
                        rows: rectangleSampling.rows,
                        spacingX: rectangleSampling.spacingX,
                        spacingY: rectangleSampling.spacingY,
                    } : null,
                    spacingRange: selectionMode === 'rectangle' && rectangleSampling
                        ? [Math.min(rectangleSampling.spacingX, rectangleSampling.spacingY), Math.max(rectangleSampling.spacingX, rectangleSampling.spacingY)]
                        : (() => {
                            const values = parcels.map((parcel) => parcel.approximateSpacing).filter(Number.isFinite);
                            return values.length ? [Math.min(...values), Math.max(...values)] : null;
                        })(),
                },
            });
        } catch (error) {
            if (controller.signal.aborted) return;
            this.clearAreaOverlay();
            this.update({ busy: false, error: error instanceof Error ? error.message : String(error), open: true, view: 'area', areaAnalysis: null });
        } finally {
            if (this.abortController === controller) this.abortController = null;
        }
    }
    async renderAreaOverlay(points, stats, regions) {
        this.clearAreaOverlay();
        const generation = this.surfaceGeneration;
        this.update({ surfaceBusy: true, surfaceError: null });
        const span = Math.max(0.01, stats.maxElevation - stats.minElevation);
        for (const point of points) {
            const normalized = (point.elevation - stats.minElevation) / span;
            const feature = new Feature({ geometry: new Point(projectToViewCoordinate(point.coordinate2180)) });
            if (!Number.isFinite(point.elevation)) feature.set('terrainMissing', true, true);
            feature.set('terrainBucket', Math.round(normalized * 8), true);
            feature.set('terrainElevation', point.elevation, true);
            feature.set('terrainParcelId', point.parcelId, true);
            this.analysisSource.addFeature(feature);
        }
        const markers = new Map();
        for (const [label, coordinate, elevation, color] of [
            ['MIN', stats.minPoint, stats.minElevation, '#2563eb'],
            [t('terrain.surface.meanMarker'), stats.meanPoint, stats.meanPointElevation, '#059669'],
            ['MAX', stats.maxPoint, stats.maxElevation, '#dc2626'],
        ]) {
            if (!coordinate) continue;
            const key = coordinate.join(':');
            const marker = markers.get(key) ?? { coordinate, elevation, color, labels: [] };
            marker.labels.push(label); markers.set(key, marker);
        }
        for (const { coordinate, elevation, color, labels } of markers.values()) {
            const feature = new Feature({ geometry: new Point(projectToViewCoordinate(coordinate)) });
            feature.set('terrainMarkerStyle', new Style({
                image: new CircleStyle({ radius: 6, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
                text: new Text({ text: `${labels.join(' / ')} ${elevation.toFixed(1)} m`, offsetY: labels.length === 1 && labels[0] === t('terrain.surface.meanMarker') ? 20 : -18,
                    font: '600 12px sans-serif', fill: new Fill({ color: '#111827' }), stroke: new Stroke({ color: '#fff', width: 4 }) }),
            }), true);
            this.analysisSource.addFeature(feature);
        }
        try {
            const tiles = await new Promise((resolve, reject) => {
                const worker = new Worker(new URL('./terrainSurface.worker.js', import.meta.url), { type: 'module' });
                this.surfaceWorker = worker;
                this.cancelSurface = () => { worker.terminate(); reject(new DOMException(t('terrain.progress.aborted'), 'AbortError')); };
                const finish = (result, error) => {
                    worker.terminate();
                    if (this.surfaceWorker === worker) { this.surfaceWorker = null; this.cancelSurface = null; }
                    if (error) reject(error); else resolve(result);
                };
                worker.onmessage = ({ data }) => finish(data.tiles, data.error ? new Error(data.error) : null);
                worker.onerror = () => finish(null, new Error(t('terrain.surface.workerError')));
                worker.postMessage({ points, regions });
            });
            if (generation !== this.surfaceGeneration || this.disposed) return;
            if (!tiles.length) throw new Error(t('terrain.surface.insufficient'));
            for (const tile of tiles) {
                const sources = {};
                for (const mode of ['colors', 'shade', 'combined', 'slope']) {
                    const canvas = document.createElement('canvas');
                    canvas.width = tile.width; canvas.height = tile.height;
                    canvas.getContext('2d').putImageData(new ImageData(paintSurface(tile, mode, stats.minElevation, stats.maxElevation), tile.width, tile.height), 0, 0);
                    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
                    if (generation !== this.surfaceGeneration || this.disposed) return;
                    if (!blob) throw new Error(t('terrain.surface.workerError'));
                    const url = URL.createObjectURL(blob);
                    this.surfaceUrls.push(url);
                    sources[mode] = new ImageStatic({ url, projection: 'EPSG:2180', imageExtent: tile.extent, interpolate: true });
                }
                const layer = new ImageLayer({ source: sources[this.snapshot.surfaceMode], opacity: this.snapshot.surfaceOpacity / 100,
                    zIndex: 10018, properties: { mapownikRole: 'terrain-surface' } });
                this.surfaceLayers.push({ layer, sources });
                this.host.addLayer(layer);
            }
            this.surfaceTiles = tiles;
            this.attachSurfacePointer();
            const balanced = balancedLevel(tiles);
            this.update({ surfaceBusy: false, slopeAvailable: tiles.some((tile) => tile.slopes.some(Number.isFinite)),
                slopeSummary: slopeSummary(tiles), earthworkBalancedLevel: balanced });
            this.recomputeEarthworks();
            if (this.snapshot.showContours) void this.refreshContours();
        } catch (error) {
            if (generation !== this.surfaceGeneration || this.disposed) return;
            this.clearSurface();
            this.update({ surfaceBusy: false, surfaceError: String(error?.message || error) });
        }
    }
    renderAreaFrame(geometry) {
        this.areaFrameSource.clear(true);
        if (!geometry) return;
        const feature = new Feature({ geometry: toViewGeometry(geometry) });
        feature.set('terrainAreaFrame', true, true);
        this.areaFrameSource.addFeature(feature);
    }
    clearAreaFrame() {
        this.areaFrameSource.clear(true);
    }
    clearAreaOverlay() {
        this.clearSurface();
        for (const feature of this.analysisSource.getFeatures()) {
            if (!feature.get('terrainHover')) this.analysisSource.removeFeature(feature);
        }
    }
    clearSurface() {
        this.clearContours();
        this.unsubscribePointer?.();
        this.unsubscribePointer = null;
        this.surfaceGeneration += 1;
        this.cancelSurface?.();
        this.surfaceWorker = null; this.cancelSurface = null;
        for (const entry of this.surfaceLayers) {
            this.host.removeLayer(entry.layer);
            entry.layer.dispose();
            for (const source of Object.values(entry.sources)) source.dispose();
        }
        this.surfaceLayers = [];
        for (const url of this.surfaceUrls) URL.revokeObjectURL(url);
        this.surfaceUrls = [];
        this.surfaceTiles = [];
        this.update({ surfaceBusy: false, slopeAvailable: false, areaHover: null, slopeHover: null, surfaceError: null, exportBusy: false, exportError: null,
            slopeSummary: null, earthworkBalancedLevel: null, earthworks: null });
    }
    async loadObjectProfile(id, force = false) {
        this.assertAlive();
        let object;
        try { object = this.objectManager.getObject(id); } catch { return; }
        if (object.kind !== 'terrain-profile' || object.geometry.type !== 'LineString') return;
        const fingerprint = `${id}:${object.updatedAt}:${JSON.stringify(object.geometry.coordinates)}`;
        // 18.12.0: ta sama linia w trakcie pobierania nie restartuje pobierania
        // (wcześniej każda zmiana innego obiektu — np. nowy pomiar — przerywała je).
        if (!force && this.profileFingerprint === fingerprint && (this.snapshot.profile || (this.snapshot.busy && this.lineController))) {
            this.update({ open: true, view: 'line', objectId: id });
            return;
        }
        this.profileFingerprint = fingerprint;
        this.lineController?.abort();
        const controller = new AbortController();
        this.lineController = controller;
        this.clearAreaOverlay();
        this.update({ busy: true, progress: null, open: true, view: 'line', objectId: id, error: null, profile: force ? null : this.snapshot.profile, hoverIndex: null });
        try {
            const sampled = sampleLine(object.geometry.coordinates);
            const payload = await fetchElevations(sampled.points.map((point) => point.coordinate2180), {
                signal: controller.signal,
                initialHeights: this.pendingLine?.fingerprint === fingerprint ? this.pendingLine.heights : [],
                onPartial: (heights) => { if (this.lineController === controller) this.pendingLine = { fingerprint, heights }; },
                onProgress: (progress) => { if (this.lineController === controller) this.update({ progress }); },
            });
            if (controller.signal.aborted) return;
            this.pendingLine = { fingerprint, heights: payload.heights };
            const points = sampled.points.map((point, index) => ({ ...point, elevation: payload.heights[index], status: payload.statuses[index] }));
            const stats = terrainStats(points, sampled.total);
            if (controller.signal.aborted) return;
            this.update({
                busy: false,
                error: null,
                open: true,
                view: 'line',
                objectId: id,
                profile: { objectId: id, complete: payload.complete, diagnostics: payload.diagnostics, name: object.name, source: payload.source || 'GUGiK NMT', model: payload.model || 'NMT', verticalDatum: payload.verticalDatum || object.properties?.terrainVerticalDatum || 'PL-KRON86-NH', heightType: payload.heightType || t('terrain.wysokoscNormalna'), heightUnit: payload.heightUnit || 'm', points, stats },
            });
        } catch (error) {
            if (controller.signal.aborted) return;
            this.update({ busy: false, error: error instanceof Error ? error.message : String(error), open: true, view: 'line', objectId: id, profile: null });
        } finally {
            if (this.lineController === controller) this.lineController = null;
        }
    }
    syncSelection() {
        if (this.disposed || this.snapshot.mode === 'area') return;
        const selectedId = this.objectManager.getSnapshot().selectedId;
        if (!selectedId) return;
        let object;
        try { object = this.objectManager.getObject(selectedId); } catch { return; }
        if (object.kind === 'terrain-profile') void this.loadObjectProfile(selectedId, false);
    }
    removeDrawInteraction() {
        if (this.interaction) {
            this.host.removeInteraction(this.interaction);
            this.interaction = null;
        }
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.abortController?.abort();
        this.abortController = null;
        this.lineController?.abort();
        this.lineController = null;
        this.removeDrawInteraction();
        this.unsubscribeObjects?.();
        this.unsubscribePointer?.();
        this.clearAreaOverlay();
        this.analysisSource.clear(true);
        this.areaFrameSource.clear(true);
        this.host.removeLayer(this.contourLayer);
        this.contourLayer.dispose();
        this.contourSource.dispose();
        this.host.removeLayer(this.analysisLayer);
        this.host.removeLayer(this.areaFrameLayer);
        this.listeners.clear();
    }
    update(patch) {
        if (this.disposed) return;
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners) listener();
    }
    assertAlive() { if (this.disposed) throw new Error('TerrainProfileManager został już zamknięty.'); } // dev: błąd programisty, nie komunikat dla użytkownika
}
