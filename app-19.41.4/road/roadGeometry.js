import { t } from '../i18n/index.js';
import { assertRoadBudget } from './roadLimits.js';
import { computeSweptPath, EU_SEMITRAILER_16_5 } from './vehicleSweep.js';

const EPS = 1e-9;
export const DEFAULT_ROAD_WIDTH_M = 6;
export const DEFAULT_ROAD_RADIUS_M = 12;



function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function mul(a, scalar) { return [a[0] * scalar, a[1] * scalar]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
function cross(a, b) { return a[0] * b[1] - a[1] * b[0]; }
function length(a) { return Math.hypot(a[0], a[1]); }
function distance(a, b) { return length(sub(a, b)); }
function normalize(a) {
    const len = length(a);
    return len > EPS ? [a[0] / len, a[1] / len] : [1, 0];
}
function leftNormal(direction) { return [-direction[1], direction[0]]; }
function samePoint(a, b, tolerance = 1e-6) { return distance(a, b) <= tolerance; }
function pushUnique(target, point) {
    if (!target.length || !samePoint(target[target.length - 1], point)) target.push(point);
}

export function normalizeRoadWidth(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return clamp(number, 3, 20);
}
export function normalizeRoadRadius(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return clamp(number, 3, 100);
}

function sampleLine(target, start, end, stepM) {
    const len = distance(start, end);
    if (len <= EPS) {
        pushUnique(target, end);
        return;
    }
    const count = Math.max(1, Math.ceil(len / stepM));
    for (let index = 1; index <= count; index += 1) {
        const t = index / count;
        pushUnique(target, [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
    }
}

function fillet(prev, corner, next, requestedRadius) {
    const incomingVector = sub(corner, prev);
    const outgoingVector = sub(next, corner);
    const incomingLength = length(incomingVector);
    const outgoingLength = length(outgoingVector);
    if (incomingLength < 0.5 || outgoingLength < 0.5) return null;

    const incoming = normalize(incomingVector);
    const outgoing = normalize(outgoingVector);
    const turnCross = cross(incoming, outgoing);
    const cosAngle = clamp(dot(incoming, outgoing), -1, 1);
    const angle = Math.acos(cosAngle);
    if (Math.abs(turnCross) < 1e-5 || angle < 0.02 || angle > Math.PI - 0.05) return null;

    const tangentForRadius = requestedRadius * Math.tan(angle / 2);
    const tangent = Math.min(tangentForRadius, incomingLength * 0.45, outgoingLength * 0.45);
    if (tangent < 0.2) return null;
    const effectiveRadius = tangent / Math.tan(angle / 2);
    const start = sub(corner, mul(incoming, tangent));
    const end = add(corner, mul(outgoing, tangent));
    const turnSign = turnCross > 0 ? 1 : -1;
    const normal = mul(leftNormal(incoming), turnSign);
    const center = add(start, mul(normal, effectiveRadius));
    return { start, end, center, radius: effectiveRadius, turnSign };
}

function sampleArc(target, arc, stepM) {
    let startAngle = Math.atan2(arc.start[1] - arc.center[1], arc.start[0] - arc.center[0]);
    let endAngle = Math.atan2(arc.end[1] - arc.center[1], arc.end[0] - arc.center[0]);
    if (arc.turnSign > 0) {
        while (endAngle <= startAngle) endAngle += Math.PI * 2;
    } else {
        while (endAngle >= startAngle) endAngle -= Math.PI * 2;
    }
    const delta = endAngle - startAngle;
    const arcLength = Math.abs(delta) * arc.radius;
    const count = Math.max(2, Math.ceil(arcLength / stepM));
    for (let index = 1; index <= count; index += 1) {
        const angle = startAngle + delta * (index / count);
        pushUnique(target, [
            arc.center[0] + Math.cos(angle) * arc.radius,
            arc.center[1] + Math.sin(angle) * arc.radius,
        ]);
    }
}

function sampleRoundedAxisDetailed(axisGeometry, radiusMeters = DEFAULT_ROAD_RADIUS_M, stepMeters = 0.8) {
    assertRoadBudget(axisGeometry?.coordinates);
    if (!axisGeometry || axisGeometry.type !== 'LineString' || axisGeometry.coordinates.length < 2)
        throw new Error(t('road.drogaWymagaOsiZCo'));
    const input = axisGeometry.coordinates.map((point) => [Number(point[0]), Number(point[1])]);
    if (input.some((point) => !Number.isFinite(point[0]) || !Number.isFinite(point[1])))
        throw new Error(t('road.osDrogiZawieraNieprawidloweWspolrzedne'));
    const distinct = [];
    for (const point of input) {
        if (!distinct.some((candidate) => samePoint(candidate, point))) distinct.push(point);
        if (distinct.length >= 2) break;
    }
    if (distinct.length < 2)
        throw new Error(t('road.osDrogiMusiZawieracCo'));
    const radius = normalizeRoadRadius(radiusMeters) ?? DEFAULT_ROAD_RADIUS_M;
    const step = clamp(Number(stepMeters) || 0.8, 0.35, 3);
    const output = [[...input[0]]];
    const effectiveRadii = [];
    let cursor = input[0];
    for (let index = 1; index < input.length - 1; index += 1) {
        const arc = fillet(input[index - 1], input[index], input[index + 1], radius);
        if (!arc) {
            sampleLine(output, cursor, input[index], step);
            cursor = input[index];
            continue;
        }
        effectiveRadii.push(arc.radius);
        sampleLine(output, cursor, arc.start, step);
        sampleArc(output, arc, step);
        cursor = arc.end;
    }
    sampleLine(output, cursor, input[input.length - 1], step);
    const minimumEffectiveRadius = effectiveRadii.length ? Math.min(...effectiveRadii) : radius;
    const radiusAdjusted = effectiveRadii.some((value) => value < radius * 0.98);
    return { points: output, requestedRadius: radius, minimumEffectiveRadius, radiusAdjusted };
}

export function sampleRoundedAxis(axisGeometry, radiusMeters = DEFAULT_ROAD_RADIUS_M, stepMeters = 0.8) {
    return sampleRoundedAxisDetailed(axisGeometry, radiusMeters, stepMeters).points;
}

function tangentAt(points, index) {
    if (index <= 0) return normalize(sub(points[1], points[0]));
    if (index >= points.length - 1) return normalize(sub(points[points.length - 1], points[points.length - 2]));
    return normalize(sub(points[index + 1], points[index - 1]));
}

function corridorPolygon(points, leftDistances, rightDistances) {
    const left = [];
    const right = [];
    for (let index = 0; index < points.length; index += 1) {
        const tangent = tangentAt(points, index);
        const normal = leftNormal(tangent);
        left.push(add(points[index], mul(normal, leftDistances[index])));
        right.push(add(points[index], mul(normal, rightDistances[index])));
    }
    const ring = [...left, ...right.reverse()];
    if (ring.length) ring.push([...ring[0]]);
    return { type: 'Polygon', coordinates: [ring] };
}

function safeLineBuffer(points, distanceMeters) {
    const distance = Math.max(0.05, Number(distanceMeters) || 0.05);
    const offsets = new Array(points.length).fill(distance);
    return corridorPolygon(points, offsets, offsets);
}


export function createRoadSurfaceGeometry(axisGeometry, widthMeters = DEFAULT_ROAD_WIDTH_M, radiusMeters = DEFAULT_ROAD_RADIUS_M) {
    const width = normalizeRoadWidth(widthMeters) ?? DEFAULT_ROAD_WIDTH_M;
    const sampled = sampleRoundedAxisDetailed(axisGeometry, radiusMeters, 0.65);
    const roundedAxis = { type: 'LineString', coordinates: sampled.points };
    return {
        roundedAxis,
        surface: safeLineBuffer(sampled.points, width / 2),
        requestedRadius: sampled.requestedRadius,
        minimumEffectiveRadius: sampled.minimumEffectiveRadius,
        radiusAdjusted: sampled.radiusAdjusted,
        topologyAdjusted: false,
    };
}

// 18.13.0: obrys przejazdu z modelu kinematycznego (road/vehicleSweep.js) —
// przednia oś po osi drogi, tylna oś i naczepa po traktrysach, obrys jako
// suma położeń nadwozia. Zastępuje przybliżenie „szerokość odłożona w punkcie”.
function createApproximateSweptPathFromPoints(points) {
    if (points.length < 2) throw new Error(t('road.osDrogiJestZbytKrotka'));
    const result = computeSweptPath(points, EU_SEMITRAILER_16_5);
    return { geometry: result.sweptPath, wheelPath: result.wheelPath, topologyAdjusted: false, innerClamped: result.innerClamped };
}

export function createApproximateSweptPathGeometry(axisGeometry, radiusMeters = DEFAULT_ROAD_RADIUS_M) {
    const sampled = sampleRoundedAxisDetailed(axisGeometry, radiusMeters, 0.65);
    return createApproximateSweptPathFromPoints(sampled.points).geometry;
}

export function deriveRoadGeometries(axisGeometry, widthMeters = DEFAULT_ROAD_WIDTH_M, radiusMeters = DEFAULT_ROAD_RADIUS_M) {
    const width = normalizeRoadWidth(widthMeters) ?? DEFAULT_ROAD_WIDTH_M;
    const sampled = sampleRoundedAxisDetailed(axisGeometry, radiusMeters, 0.65);
    const roundedAxis = { type: 'LineString', coordinates: sampled.points };
    const roadSurface = safeLineBuffer(sampled.points, width / 2);
    const swept = createApproximateSweptPathFromPoints(sampled.points);
    const warnings = [];
    if (sampled.radiusAdjusted) warnings.push(t('road.promienLukuZostalLokalnieOgraniczony', { value: sampled.minimumEffectiveRadius.toFixed(1) }));
    if (swept.innerClamped) warnings.push(t('road.lukZbytCiasny'));
    return {
        roundedAxis,
        roadSurface,
        sweptPath: swept.geometry,
        wheelPath: swept.wheelPath,
        requestedRadius: sampled.requestedRadius,
        minimumEffectiveRadius: sampled.minimumEffectiveRadius,
        radiusAdjusted: sampled.radiusAdjusted,
        innerClamped: Boolean(swept.innerClamped),
        warnings,
    };
}
