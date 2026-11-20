/**
 * 18.13.0 — kinematyczny obrys przejazdu (swept path) pojazdu członowego.
 *
 * Model (jak w programach do analizy skrętu, w uproszczeniu):
 *  - środek PRZEDNIEJ osi ciągnika jedzie dokładnie po narysowanej osi
 *    (kierowca prowadzi pojazd kołami skrętnymi);
 *  - tylna oś ciągnika podąża za przednią po traktrysie (rozstaw osi L);
 *  - siodło (sworzeń królewski) leży o `kingpinAheadOfRearAxleM` przed tylną osią;
 *  - środek zespołu osi naczepy podąża za sworzniem po traktrysie
 *    (odległość `kingpinToTrailerAxleM`);
 *  - obrys = suma kolejnych położeń nadwozia (prostokąty ciągnika i naczepy)
 *    co ~0,5 m drogi, ślady kół — suma położeń opon.
 *
 * Wcześniejszy model (do 18.12) odkładał boczny zasięg całego zestawu w punkcie,
 * w którym akurat była tylna oś ciągnika — ścięcie łuku przez naczepę (8–12 m
 * z tyłu) lądowało w złym miejscu łuku i miało zły kształt.
 *
 * Kontrola: w ustalonym ruchu po okręgu, przy zewnętrznym promieniu obrysu
 * 12,5 m, wewnętrzny wynosi ok. 5,3–5,4 m — zgodnie z wymogiem skrętności
 * pojazdów członowych w UE (dyrektywa 96/53/WE, pierścień 12,5 / 5,3 m).
 */

// Ciągnik siodłowy 4×2 + naczepa trzyosiowa, długość całkowita 16,5 m,
// szerokość 2,55 m — typowe wymiary dopuszczalne w UE.
import { assertRoadBudget } from './roadLimits.js';
export const EU_SEMITRAILER_16_5 = Object.freeze({
    id: 'eu-semitrailer-16.5',
    widthM: 2.55,
    tractorWheelbaseM: 3.8,
    tractorFrontOverhangM: 1.2,     // przednia oś → przód kabiny
    tractorRearOverhangM: 0.9,      // tylna oś → tył ramy ciągnika
    kingpinAheadOfRearAxleM: 0.5,   // wyprzedzenie siodła
    trailerFrontOverhangM: 1.6,     // sworzeń → przód naczepy
    kingpinToTrailerAxleM: 7.7,     // sworzeń → środek zespołu osi naczepy
    trailerRearOverhangM: 4.3,      // środek osi → tył naczepy (sworzeń → tył = 12,0 m)
    trailerAxleSpreadM: 1.31,       // rozstaw sąsiednich osi naczepy
    trailerAxles: 3,
    tyreWidthM: 0.6,                // szerokość pary kół bliźniaczych (zewnętrzna krawędź = szerokość pojazdu)
    modelMarginM: 0.2,              // zapas na niedokładność modelu i kierowcy
});

const STEP_M = 0.25;          // krok ruchu przedniej osi
const FOOTPRINT_EVERY = 2;    // obrys co 2 kroki (0,5 m)
const BIN_M = 0.5;            // rozdzielczość obwiedni wzdłuż osi
const PERIMETER_STEP_M = 0.5; // gęstość punktów na obwodzie nadwozia

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l] : [1, 0]; };
const left = (d) => [-d[1], d[0]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];

/** Równy podział polilinii co `step` metrów. */
export function resamplePolyline(points, step) {
    assertRoadBudget(points);
    if (!Number.isFinite(step) || step < 0.05) throw new Error('Krok próbkowania drogi musi wynosić co najmniej 0,05 m.');
    const out = [[...points[0]]];
    let carry = 0;
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const seg = len(sub(b, a));
        if (seg < 1e-9) continue;
        let d = step - carry;
        while (d <= seg + 1e-9) {
            out.push(add(a, mul(sub(b, a), d / seg)));
            d += step;
        }
        carry = seg - (d - step);
    }
    const last = points[points.length - 1];
    if (len(sub(out[out.length - 1], last)) > 1e-6) out.push([...last]);
    return out;
}

/** Punkty na obwodzie prostokąta (oś odniesienia, kierunek, przód/tył, szerokość). */
function rectanglePerimeter(ref, dir, front, back, width, step) {
    const n = left(dir);
    const h = width / 2;
    const corners = [
        add(add(ref, mul(dir, front)), mul(n, h)),
        add(add(ref, mul(dir, front)), mul(n, -h)),
        add(add(ref, mul(dir, -back)), mul(n, -h)),
        add(add(ref, mul(dir, -back)), mul(n, h)),
    ];
    const pts = [];
    for (let i = 0; i < 4; i += 1) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        const count = Math.max(1, Math.ceil(len(sub(b, a)) / step));
        for (let k = 0; k < count; k += 1) pts.push(add(a, mul(sub(b, a), k / count)));
    }
    return pts;
}

/** Punkty opon jednej osi (obie strony, zewnętrzna i wewnętrzna krawędź). */
function axleTyres(center, dir, vehicle) {
    const n = left(dir);
    const outer = vehicle.widthM / 2;
    const inner = outer - vehicle.tyreWidthM;
    const pts = [];
    for (const along of [-0.5, 0, 0.5]) {
        const c = add(center, mul(dir, along));
        for (const lat of [outer, inner, -inner, -outer]) pts.push(add(c, mul(n, lat)));
    }
    return pts;
}

/**
 * Położenia zestawu przy ruchu przedniej osi po `axis` (polilinia w metrach).
 * Na początku zestaw stoi prosto, w osi pierwszego odcinka (przed punktem startu).
 */
export function simulateVehicle(axis, vehicle = EU_SEMITRAILER_16_5) {
    const path = resamplePolyline(axis, STEP_M);
    if (path.length < 2) return [];
    const startDir = norm(sub(path[1], path[0]));
    let rear = sub(path[0], mul(startDir, vehicle.tractorWheelbaseM));
    let kingpin = add(rear, mul(startDir, vehicle.kingpinAheadOfRearAxleM));
    let trailerAxle = sub(kingpin, mul(startDir, vehicle.kingpinToTrailerAxleM));
    const states = [];
    for (let i = 0; i < path.length; i += 1) {
        const front = path[i];
        rear = sub(front, mul(norm(sub(front, rear)), vehicle.tractorWheelbaseM));
        const tractorDir = norm(sub(front, rear));
        kingpin = add(rear, mul(tractorDir, vehicle.kingpinAheadOfRearAxleM));
        trailerAxle = sub(kingpin, mul(norm(sub(kingpin, trailerAxle)), vehicle.kingpinToTrailerAxleM));
        const trailerDir = norm(sub(kingpin, trailerAxle));
        states.push({ station: i * STEP_M, front, rear, tractorDir, kingpin, trailerAxle, trailerDir });
    }
    return states;
}

function bodyPoints(state, vehicle) {
    return [
        ...rectanglePerimeter(state.rear, state.tractorDir, vehicle.tractorWheelbaseM + vehicle.tractorFrontOverhangM, vehicle.tractorRearOverhangM, vehicle.widthM, PERIMETER_STEP_M),
        ...rectanglePerimeter(state.kingpin, state.trailerDir, vehicle.trailerFrontOverhangM, vehicle.kingpinToTrailerAxleM + vehicle.trailerRearOverhangM, vehicle.widthM, PERIMETER_STEP_M),
    ];
}

function wheelPoints(state, vehicle) {
    const pts = [...axleTyres(state.front, state.tractorDir, vehicle), ...axleTyres(state.rear, state.tractorDir, vehicle)];
    const half = (vehicle.trailerAxles - 1) / 2;
    for (let k = 0; k < vehicle.trailerAxles; k += 1) {
        const offset = (k - half) * vehicle.trailerAxleSpreadM;
        pts.push(...axleTyres(add(state.trailerAxle, mul(state.trailerDir, offset)), state.trailerDir, vehicle));
    }
    return pts;
}

/**
 * Rzutowanie punktu na oś (szukanie w oknie odcinków wokół położenia pojazdu):
 * zwraca stację (m od początku osi) i odsunięcie w lewo (+) / prawo (−).
 */
function project(point, axis, cumulative, lo, hi) {
    let best = null;
    for (let i = Math.max(0, lo); i < Math.min(axis.length - 1, hi); i += 1) {
        const a = axis[i];
        const ab = sub(axis[i + 1], a);
        const l2 = ab[0] * ab[0] + ab[1] * ab[1];
        if (l2 < 1e-12) continue;
        const tt = Math.max(0, Math.min(1, ((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1]) / l2));
        const foot = add(a, mul(ab, tt));
        const d = len(sub(point, foot));
        if (!best || d < best.d) {
            const s = cumulative[i] + tt * Math.sqrt(l2);
            best = { d, s, lateral: Math.sign(cross(ab, sub(point, a))) * d, t: tt, i };
        }
    }
    return best;
}

/** Lokalny promień krzywizny osi (z okręgu przez punkty ±2 m). */
function localRadius(points, index, span) {
    const a = points[Math.max(0, index - span)];
    const b = points[index];
    const c = points[Math.min(points.length - 1, index + span)];
    const ab = len(sub(b, a)); const bc = len(sub(c, b)); const ca = len(sub(a, c));
    const area2 = Math.abs(cross(sub(b, a), sub(c, a)));
    if (area2 < 1e-9) return Infinity;
    return (ab * bc * ca) / (2 * area2);
}

/** Obwiednia (lewy/prawy zasięg na stacjach co BIN_M) dla danych punktów. */
function envelope(states, axisBins, cumulative, pointsOf, vehicle) {
    const n = axisBins.length;
    const leftExt = new Array(n).fill(-Infinity);
    const rightExt = new Array(n).fill(Infinity);
    const binLength = cumulative[cumulative.length - 1];
    const reachBack = vehicle.kingpinToTrailerAxleM + vehicle.trailerRearOverhangM + vehicle.tractorWheelbaseM + 4;
    const reachFront = vehicle.tractorFrontOverhangM + 3;
    for (let k = 0; k < states.length; k += FOOTPRINT_EVERY) {
        const state = states[k];
        const lo = Math.floor((state.station - reachBack) / BIN_M) - 2;
        const hi = Math.ceil((state.station + reachFront) / BIN_M) + 2;
        for (const point of pointsOf(state, vehicle)) {
            const hit = project(point, axisBins, cumulative, lo, hi);
            if (!hit) continue;
            // Tylko punkty „obok” osi, nie przed jej początkiem / za końcem.
            if ((hit.i === 0 && hit.t <= 0) || (hit.i === axisBins.length - 2 && hit.t >= 1) || hit.s > binLength) continue;
            const bin = Math.max(0, Math.min(n - 1, Math.round(hit.s / BIN_M)));
            if (hit.lateral > leftExt[bin]) leftExt[bin] = hit.lateral;
            if (hit.lateral < rightExt[bin]) rightExt[bin] = hit.lateral;
        }
    }
    return { leftExt, rightExt };
}

function finalizeOffsets(axisBins, ext, vehicle, minHalf) {
    const n = axisBins.length;
    const leftOut = new Array(n);
    const rightOut = new Array(n);
    let innerClamped = false;
    for (let i = 0; i < n; i += 1) {
        // Wygładzenie: maksimum z sąsiednich koszyków (bez „ząbków” od próbkowania).
        let l = -Infinity; let r = Infinity;
        for (let j = Math.max(0, i - 1); j <= Math.min(n - 1, i + 1); j += 1) {
            if (ext.leftExt[j] > l) l = ext.leftExt[j];
            if (ext.rightExt[j] < r) r = ext.rightExt[j];
        }
        if (!Number.isFinite(l)) l = minHalf;
        if (!Number.isFinite(r)) r = -minHalf;
        l = Math.max(minHalf, l + vehicle.modelMarginM);
        r = Math.min(-minHalf, r - vehicle.modelMarginM);
        // Po wewnętrznej stronie łuku odsunięcie nie może przekroczyć promienia osi
        // (obrys by się „przekręcił”). Ograniczamy i zgłaszamy ostrzeżenie.
        const radius = localRadius(axisBins, i, 4);
        if (Number.isFinite(radius)) {
            const prev = axisBins[Math.max(0, i - 4)];
            const next = axisBins[Math.min(n - 1, i + 4)];
            const turnLeft = cross(sub(axisBins[i], prev), sub(next, axisBins[i])) > 0;
            const limit = radius - 0.3;
            if (turnLeft && l > limit) { l = Math.max(minHalf, limit); innerClamped = true; }
            if (!turnLeft && -r > limit) { r = Math.min(-minHalf, -limit); innerClamped = true; }
        }
        leftOut[i] = l;
        rightOut[i] = r;
    }
    return { leftOut, rightOut, innerClamped };
}

function corridor(axisBins, leftOffsets, rightOffsets) {
    const L = []; const R = [];
    for (let i = 0; i < axisBins.length; i += 1) {
        const a = axisBins[Math.max(0, i - 1)];
        const b = axisBins[Math.min(axisBins.length - 1, i + 1)];
        const nrm = left(norm(sub(b, a)));
        L.push(add(axisBins[i], mul(nrm, leftOffsets[i])));
        R.push(add(axisBins[i], mul(nrm, rightOffsets[i])));
    }
    const ring = [...L, ...R.reverse()];
    ring.push([...ring[0]]);
    return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Obrys nadwozia i ślady kół dla osi (polilinia w metrach, EPSG:2180).
 * Zwraca też największe odsunięcia (do ostrzeżeń i testów).
 */
export function computeSweptPath(axis, vehicle = EU_SEMITRAILER_16_5) {
    const axisBins = resamplePolyline(axis, BIN_M);
    const cumulative = axisBins.map((_, i) => i * BIN_M);
    // Ostatni koszyk może być krótszy — poprawna długość końcowa.
    if (axisBins.length > 1) cumulative[cumulative.length - 1] = cumulative[cumulative.length - 2] + len(sub(axisBins[axisBins.length - 1], axisBins[axisBins.length - 2]));
    const states = simulateVehicle(axis, vehicle);
    const body = finalizeOffsets(axisBins, envelope(states, axisBins, cumulative, bodyPoints, vehicle), vehicle, vehicle.widthM / 2);
    const wheels = finalizeOffsets(axisBins, envelope(states, axisBins, cumulative, wheelPoints, { ...vehicle, modelMarginM: 0.1 }), { ...vehicle, modelMarginM: 0.1 }, vehicle.widthM / 2);
    return {
        sweptPath: corridor(axisBins, body.leftOut, body.rightOut),
        wheelPath: corridor(axisBins, wheels.leftOut, wheels.rightOut),
        maxLeftM: Math.max(...body.leftOut),
        maxRightM: Math.max(...body.rightOut.map((v) => -v)),
        innerClamped: body.innerClamped || wheels.innerClamped,
        states,
    };
}

/** Promień okręgu, po którym jeździ dany punkt zestawu w ustalonym skręcie (do testów). */
export function steadyStateRadii(frontAxleRadius, vehicle = EU_SEMITRAILER_16_5) {
    const rRear = Math.sqrt(Math.max(0, frontAxleRadius ** 2 - vehicle.tractorWheelbaseM ** 2));
    const rKing = Math.hypot(rRear, vehicle.kingpinAheadOfRearAxleM);
    const rTrailer = Math.sqrt(Math.max(0, rKing ** 2 - vehicle.kingpinToTrailerAxleM ** 2));
    const outer = Math.hypot(rRear + vehicle.widthM / 2, vehicle.tractorWheelbaseM + vehicle.tractorFrontOverhangM);
    const inner = rTrailer - vehicle.widthM / 2;
    return { rRear, rKing, rTrailer, outer, inner };
}
