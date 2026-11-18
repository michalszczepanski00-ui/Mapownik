import { countGeometryVertices, GEOMETRY_LIMIT_MESSAGE } from './geometryLimits.js';
import { t } from '../i18n/index.js';
/* msportal 16.5.0 — polygonal topology validation.
 * Implements the OGC/JTS Simple Features validity rules relevant to the
 * Polygon and MultiPolygon geometry types accepted by msportal imports:
 * - closed, non-degenerate simple rings,
 * - no ring crossings / line overlaps,
 * - holes contained by their shell and not nested,
 * - ring contacts limited to a single point per ring pair,
 * - connected Polygon interior,
 * - MultiPolygon component interiors must not overlap.
 *
 * This module is dependency-free so the exact same validator is used by
 * project/GeoJSON parsing and the runtime ObjectManager.
 */
const COORD_EPS = 1e-9;
const AREA_EPS = 1e-8;
const MAX_TOPOLOGY_CHECKS = 60000;
let remainingTopologyChecks = MAX_TOPOLOGY_CHECKS;
function complexityError() { return validationError('GEOMETRY_COMPLEXITY_LIMIT', GEOMETRY_LIMIT_MESSAGE); }

function samePoint(a, b, tolerance = COORD_EPS) {
    return Array.isArray(a) && Array.isArray(b)
        && Math.abs(a[0] - b[0]) <= tolerance
        && Math.abs(a[1] - b[1]) <= tolerance;
}
function pointKey(point) {
    return `${Math.round(point[0] / COORD_EPS)},${Math.round(point[1] / COORD_EPS)}`;
}
function finitePoint(point) {
    return Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}
function cross(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function crossTolerance(a, b, c) {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ac = Math.hypot(c[0] - a[0], c[1] - a[1]);
    return Math.max(1e-10, 1e-12 * Math.max(1, ab * ac));
}
function orientation(a, b, c) {
    const value = cross(a, b, c);
    const tolerance = crossTolerance(a, b, c);
    return value > tolerance ? 1 : value < -tolerance ? -1 : 0;
}
function within(value, a, b, tolerance = COORD_EPS) {
    return value >= Math.min(a, b) - tolerance && value <= Math.max(a, b) + tolerance;
}
function pointOnSegment(point, a, b) {
    return orientation(a, b, point) === 0
        && within(point[0], a[0], b[0])
        && within(point[1], a[1], b[1]);
}
function uniquePoints(points) {
    const out = [];
    const keys = new Set();
    for (const point of points) {
        const key = pointKey(point);
        if (!keys.has(key)) {
            keys.add(key);
            out.push(point);
        }
    }
    return out;
}
function segmentIntersection(a, b, c, d) {
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    if (o1 * o2 < 0 && o3 * o4 < 0) return { type: 'cross', points: [] };

    const points = [];
    if (o1 === 0 && pointOnSegment(c, a, b)) points.push(c);
    if (o2 === 0 && pointOnSegment(d, a, b)) points.push(d);
    if (o3 === 0 && pointOnSegment(a, c, d)) points.push(a);
    if (o4 === 0 && pointOnSegment(b, c, d)) points.push(b);
    const shared = uniquePoints(points);
    if (!shared.length) return { type: 'none', points: [] };
    if (shared.length >= 2) return { type: 'overlap', points: shared };
    return { type: 'touch', points: shared };
}
function ringAreaSigned(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
        sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return sum / 2;
}
function pointInRing(point, ring) {
    for (let i = 0; i < ring.length - 1; i += 1) {
        if (pointOnSegment(point, ring[i], ring[i + 1])) return 0;
    }
    let inside = false;
    const x = point[0], y = point[1];
    for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersects = ((yi > y) !== (yj > y))
            && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
        if (intersects) inside = !inside;
    }
    return inside ? 1 : -1;
}
function pointInPolygon(point, polygon) {
    if (!polygon?.length) return -1;
    const shell = pointInRing(point, polygon[0]);
    if (shell <= 0) return shell;
    for (let i = 1; i < polygon.length; i += 1) {
        const relation = pointInRing(point, polygon[i]);
        if (relation === 0) return 0;
        if (relation === 1) return -1;
    }
    return 1;
}
function segmentRecord(a, b, ringIndex, segmentIndex) {
    return {
        a, b, ringIndex, segmentIndex,
        minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
        minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]),
    };
}
function ringSegments(ring, ringIndex) {
    const out = [];
    for (let i = 0; i < ring.length - 1; i += 1) out.push(segmentRecord(ring[i], ring[i + 1], ringIndex, i));
    return out;
}
function envelopesOverlap(a, b) {
    return a.maxX + COORD_EPS >= b.minX && b.maxX + COORD_EPS >= a.minX
        && a.maxY + COORD_EPS >= b.minY && b.maxY + COORD_EPS >= a.minY;
}
function sweepPairs(segments, callback) {
    const sorted = [...segments].sort((left, right) => left.minX - right.minX || left.minY - right.minY);
    const active = [];
    for (const current of sorted) {
        for (let i = active.length - 1; i >= 0; i -= 1) {
            if (active[i].maxX + COORD_EPS < current.minX) active.splice(i, 1);
        }
        for (const candidate of active) {
            if (--remainingTopologyChecks < 0) return complexityError();
            if (!envelopesOverlap(candidate, current)) continue;
            const stop = callback(candidate, current);
            if (stop) return stop;
        }
        active.push(current);
    }
    return null;
}
function adjacentSegments(first, second, segmentCount) {
    const diff = Math.abs(first - second);
    return diff === 1 || diff === segmentCount - 1;
}
function expectedAdjacentPoint(ring, first, second) {
    const count = ring.length - 1;
    if ((first + 1) % count === second) return ring[second];
    if ((second + 1) % count === first) return ring[first];
    return null;
}
function validationError(code, message, point = null) {
    return { valid: false, code, message, point: point ? [...point] : null };
}
function validateRingBasics(ring, label) {
    if (!Array.isArray(ring) || ring.length < 4) return validationError('RING_TOO_SHORT', t('geometry.pierscienMusiMiecCoNajmniej', { label }));
    if (!ring.every(finitePoint)) return validationError('INVALID_COORDINATE', t('geometry.pierscienZawieraNieprawidlowaWspolrzedna', { label }));
    if (!samePoint(ring[0], ring[ring.length - 1])) return validationError('RING_NOT_CLOSED', t('geometry.pierscienNieJestDomkniety', { label }), ring[ring.length - 1]);
    const unique = [];
    for (const point of ring.slice(0, -1)) if (!unique.some((item) => samePoint(item, point))) unique.push(point);
    if (unique.length < 3) return validationError('TOO_FEW_POINTS', t('geometry.pierscienWymagaCoNajmniej3', { label }));
    return { valid: true };
}
function representativeRelation(ring, targetRing) {
    for (const point of ring.slice(0, -1)) {
        const relation = pointInRing(point, targetRing);
        if (relation !== 0) return relation;
    }
    for (let i = 0; i < ring.length - 1; i += 1) {
        const midpoint = [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
        const relation = pointInRing(midpoint, targetRing);
        if (relation !== 0) return relation;
    }
    return 0;
}
function representativePolygonRelation(ring, polygon) {
    for (const point of ring.slice(0, -1)) {
        const relation = pointInPolygon(point, polygon);
        if (relation !== 0) return relation;
    }
    for (let i = 0; i < ring.length - 1; i += 1) {
        const midpoint = [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
        const relation = pointInPolygon(midpoint, polygon);
        if (relation !== 0) return relation;
    }
    return 0;
}
function graphHasCycle(nodeCount, edges) {
    const graph = Array.from({ length: nodeCount }, () => []);
    for (const [a, b] of edges) { graph[a].push(b); graph[b].push(a); }
    const visited = new Set();
    const visit = (node, parent) => {
        visited.add(node);
        for (const next of graph[node]) {
            if (!visited.has(next)) { if (visit(next, node)) return true; }
            else if (next !== parent) return true;
        }
        return false;
    };
    for (let i = 0; i < nodeCount; i += 1) if (!visited.has(i) && visit(i, -1)) return true;
    return false;
}
function validatePolygonCoordinates(polygon, polygonIndex = null) {
    const prefix = polygonIndex === null ? 'Polygon' : `MultiPolygon[${polygonIndex + 1}]`;
    if (!Array.isArray(polygon) || polygon.length === 0) return validationError('EMPTY_POLYGON', t('geometry.brakPierscieniaZewnetrznego', { prefix }));
    for (let i = 0; i < polygon.length; i += 1) {
        const result = validateRingBasics(polygon[i], `${prefix}, ${i === 0 ? t('geometry.outerRing') : t('geometry.hole', { index: i })}`);
        if (!result.valid) return result;
    }

    const allSegments = polygon.flatMap((ring, ringIndex) => ringSegments(ring, ringIndex));
    const contacts = new Map();
    const invalidIntersection = sweepPairs(allSegments, (first, second) => {
        const intersection = segmentIntersection(first.a, first.b, second.a, second.b);
        if (intersection.type === 'none') return null;
        if (first.ringIndex === second.ringIndex) {
            const ring = polygon[first.ringIndex];
            const segmentCount = ring.length - 1;
            if (adjacentSegments(first.segmentIndex, second.segmentIndex, segmentCount)) {
                if (intersection.type !== 'touch') return validationError('RING_SELF_INTERSECTION', t('geometry.sasiednieOdcinkiPierscieniaNakladajaSie', { prefix }), intersection.points[0] ?? first.a);
                const expected = expectedAdjacentPoint(ring, first.segmentIndex, second.segmentIndex);
                if (!expected || intersection.points.some((point) => !samePoint(point, expected))) {
                    return validationError('RING_SELF_INTERSECTION', t('geometry.pierscienMaNieprawidlowyStykSasiednich', { prefix }), intersection.points[0]);
                }
                return null;
            }
            return validationError('RING_SELF_INTERSECTION', t('geometry.pierscienPrzecinaLubStykaSam', { prefix }), intersection.points[0] ?? first.a);
        }
        if (intersection.type === 'cross') return validationError('RING_CROSSING', t('geometry.pierscieniePrzecinajaSie', { prefix }), first.a);
        if (intersection.type === 'overlap') return validationError('RING_OVERLAP', t('geometry.pierscienieNakladajaSieLiniowo', { prefix }), intersection.points[0] ?? first.a);
        const a = Math.min(first.ringIndex, second.ringIndex);
        const b = Math.max(first.ringIndex, second.ringIndex);
        const key = `${a}:${b}`;
        const set = contacts.get(key) ?? new Map();
        for (const point of intersection.points) set.set(pointKey(point), point);
        contacts.set(key, set);
        if (set.size > 1) return validationError('RING_TOUCH_MULTIPLE', t('geometry.dwaPierscienieStykajaSieW', { prefix }), [...set.values()][1]);
        return null;
    });
    if (invalidIntersection) return invalidIntersection;
    for (let i = 0; i < polygon.length; i += 1) {
        if (Math.abs(ringAreaSigned(polygon[i])) <= AREA_EPS) {
            return validationError('ZERO_AREA_RING', t('geometry.pierscienMaZeroweLubZbyt', { prefix, ring: i === 0 ? t('geometry.outerRing') : t('geometry.hole', { index: i }) }), polygon[i][0]);
        }
    }

    const shell = polygon[0];
    for (let i = 1; i < polygon.length; i += 1) {
        const relation = representativeRelation(polygon[i], shell);
        if (relation !== 1) return validationError('HOLE_OUTSIDE_SHELL', t('geometry.otworNieLezyWewnatrzObrysu', { prefix, i }), polygon[i][0]);
    }
    for (let i = 1; i < polygon.length; i += 1) {
        for (let j = i + 1; j < polygon.length; j += 1) {
            if (representativeRelation(polygon[i], polygon[j]) === 1 || representativeRelation(polygon[j], polygon[i]) === 1) {
                return validationError('NESTED_HOLES', t('geometry.otworyISaZagniezdzone', { prefix, i, j }), polygon[i][0]);
            }
        }
    }

    const contactEdges = [];
    for (const [key, points] of contacts) {
        if (!points.size) continue;
        const [a, b] = key.split(':').map(Number);
        contactEdges.push([a, b]);
    }
    if (graphHasCycle(polygon.length, contactEdges)) {
        return validationError('DISCONNECTED_INTERIOR', t('geometry.ukladStykajacychSiePierscieniRozlacza', { prefix }));
    }
    return { valid: true, code: null, message: null, point: null };
}
function validatePolygonPair(first, second, firstIndex, secondIndex) {
    const leftSegments = first.flatMap((ring, ringIndex) => ringSegments(ring, ringIndex));
    const rightSegments = second.flatMap((ring, ringIndex) => ringSegments(ring, ringIndex));
    const segments = [
        ...leftSegments.map((segment) => ({ ...segment, polygonIndex: firstIndex })),
        ...rightSegments.map((segment) => ({ ...segment, polygonIndex: secondIndex })),
    ];
    const invalid = sweepPairs(segments, (a, b) => {
        if (a.polygonIndex === b.polygonIndex) return null;
        const intersection = segmentIntersection(a.a, a.b, b.a, b.b);
        if (intersection.type === 'cross') return validationError('MULTIPOLYGON_CROSSING', t('geometry.multipolygonSkladoweIPrzecinajaSie', { first: firstIndex + 1, second: secondIndex + 1 }), a.a);
        if (intersection.type === 'overlap') return validationError('MULTIPOLYGON_BOUNDARY_OVERLAP', t('geometry.multipolygonSkladoweIWspoldzielaOdcinek', { first: firstIndex + 1, second: secondIndex + 1 }), intersection.points[0] ?? a.a);
        return null; // isolated point contacts are valid for MultiPolygon boundaries
    });
    if (invalid) return invalid;

    if (representativePolygonRelation(first[0], second) === 1 || representativePolygonRelation(second[0], first) === 1) {
        return validationError('MULTIPOLYGON_OVERLAP', t('geometry.multipolygonWnetrzaSkladowychINakladaja', { first: firstIndex + 1, second: secondIndex + 1 }));
    }
    return { valid: true };
}

export function validatePolygonalGeometryTopology(geometry) {
    remainingTopologyChecks = MAX_TOPOLOGY_CHECKS;
    try { countGeometryVertices(geometry); }
    catch { return complexityError(); }
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return { valid: true, code: null, message: null, point: null };
    if (geometry.type === 'Polygon') {
        if (geometry.coordinates?.length > 128) return complexityError();
        return validatePolygonCoordinates(geometry.coordinates);
    }
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return validationError('EMPTY_MULTIPOLYGON', t('geometry.multipolygonBrakSkladowychPoligonowych'));
    if (geometry.coordinates.length > 128 || geometry.coordinates.some((polygon) => polygon?.length > 128)) return complexityError();
    for (let i = 0; i < geometry.coordinates.length; i += 1) {
        const result = validatePolygonCoordinates(geometry.coordinates[i], i);
        if (!result.valid) return result;
    }
    for (let i = 0; i < geometry.coordinates.length; i += 1) {
        for (let j = i + 1; j < geometry.coordinates.length; j += 1) {
            if (--remainingTopologyChecks < 0) return complexityError();
            const result = validatePolygonPair(geometry.coordinates[i], geometry.coordinates[j], i, j);
            if (!result.valid) return result;
        }
    }
    return { valid: true, code: null, message: null, point: null };
}

export function assertValidPolygonalGeometryTopology(geometry) {
    const result = validatePolygonalGeometryTopology(geometry);
    if (!result.valid) {
        const suffix = result.point ? ` [${result.point[0].toFixed(3)}, ${result.point[1].toFixed(3)}]` : '';
        const error = new Error(`${result.message}${suffix}`);
        error.code = result.code;
        error.validationPoint = result.point;
        throw error;
    }
    return geometry;
}
