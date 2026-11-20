import { cachedJson } from '../core/apiCache.js';
import Polygon from 'ol/geom/Polygon.js';
import { parseParcelWkt } from '../parcels/wkt.js';
import { geometryArea, parcelCentroid } from '../parcels/parcelGeometrySummary.js';
import { transform, toLonLat } from 'ol/proj.js';
import { insideGeometry, mergeParcelGeometries, shapeMetrics } from './reportGeometry.js';

/**
 * 19.36.0 — dane do raportu działki PDF. Każda sekcja zbiera dane sama i niezależnie:
 * błąd jednego źródła trafia do raportu jako „źródło nie odpowiedziało”, reszta raportu powstaje.
 * Wszystkie zapytania idą do własnego API portalu (api/*.php) — te same, których używa mapa.
 */
const TIMEOUT_MS = 45000;

/** 19.43.0 (audyt A2): serwer zajęty innymi analizami (HTTP 429 z krótkim Retry-After) — czekamy i ponawiamy,
 *  zamiast wpisywać do raportu „Trwa analiza. Ponów za chwilę.”. Limit na adres (Retry-After 60 s) nie jest ponawiany. */
export async function getJson(url, options = {}) {
    for (let attempt = 0; ; attempt += 1) {
        try { return await getJsonOnce(url, options); }
        catch (error) {
            const wait = Number(error?.retryAfter);
            if (!(error?.status === 429 && wait > 0 && wait <= 10 && attempt < 5) || options.signal?.aborted) throw error;
            await new Promise((resolve) => window.setTimeout(resolve, wait * 1000));
        }
    }
}
async function getJsonOnce(url, { signal, method = 'GET', body } = {}) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        // 19.43.0: zapytania GET przez pamięć zapytań — raport korzysta z wyników już pobranych dla karty działki.
        if (method === 'GET' && !body) return await cachedJson(url, { signal: controller.signal, retry: 1 });
        const response = await fetch(url, {
            method, signal: controller.signal, cache: 'no-store',
            ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.ok === false) {
            const failure = new Error(data?.error || data?.detail || `HTTP ${response.status}`);
            failure.status = response.status;
            failure.retryAfter = response.headers.get('Retry-After');
            throw failure;
        }
        return data;
    } catch (error) {
        if (signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
        if (error?.status) throw error; // odpowiedź serwera z kodem (np. 429) — zachowujemy status dla ponowienia
        throw new Error(controller.signal.aborted ? 'przekroczono czas odpowiedzi' : (error?.message || String(error)));
    } finally {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

export const identify = (source, [x, y], signal) => getJson(`./api/identify.php?source=${encodeURIComponent(source)}&x=${x.toFixed(2)}&y=${y.toFixed(2)}`, { signal });

/** „klucz: wartość” / „klucz = wartość” z odpowiedzi identyfikacji → obiekty (po jednym na obiekt). */
export function parseIdentifyText(text) {
    if (!text) return [];
    const objects = [];
    let current = {};
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (/^-{5,}$/.test(line) || /^Results for FeatureType/i.test(line)) { if (Object.keys(current).length) objects.push(current); current = {}; continue; }
        const m = /^([^:=]{1,60}?)\s*[:=]\s*(.*)$/.exec(line);
        if (!m) continue;
        const key = m[1].trim(); const value = m[2].trim();
        if (!value || value === 'null' || value === 'missing') continue;
        if (key in current) { objects.push(current); current = {}; }
        current[key] = value;
    }
    if (Object.keys(current).length) objects.push(current);
    return objects;
}

// Najpierw sprawdzamy wnętrze każdej części. Wolne miejsca w budżecie
// pięciu próbek wykorzystujemy na punkty bliżej granic.
export function probePoints(geometry) {
    const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (parts.length > 32) throw new Error('Analiza punktowa obejmuje do 32 części. Podziel teren na mniejsze grupy.');
    const points = [];
    const seen = new Set();
    function add(part, coordinate) {
        const point = coordinate.slice(0, 2).map(value => Number(value.toFixed(2)));
        if (!insideGeometry(part, point)) return false;
        const key = point.join(',');
        if (!seen.has(key)) { seen.add(key); points.push(point); }
        return true;
    }
    const regions = parts.map(coordinates => {
        const part = { type: 'Polygon', coordinates };
        const center = new Polygon(coordinates).getInteriorPoint().getCoordinates();
        if (!add(part, center)) throw new Error('Nie udało się wyznaczyć punktu wewnątrz części terenu.');
        return { part, center, ring: coordinates[0] };
    });
    for (const [axis, sign] of [[1, 1], [0, 1], [1, -1], [0, -1]]) {
        for (const { part, center, ring } of regions) {
            if (points.length >= 5) return points;
            const edge = ring.reduce((best, p) => sign * p[axis] > sign * best[axis] ? p : best);
            const candidate = edge.slice(0, 2).map((v, i) => v + (center[i] - v) * 0.15);
            add(part, candidate);
        }
    }
    return points;
}

// ---- analiza obrazów WMS (19.38.0) ------------------------------------------------

/** Obraz WMS przez proxy portalu (EPSG:2180) → piksele RGBA. */
async function wmsPixels(source, layers, bbox, width, height, signal) {
    const q = new URLSearchParams({ source, SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layers, STYLES: '', SRS: 'EPSG:2180',
        BBOX: bbox.map((v) => v.toFixed(2)).join(','), WIDTH: String(width), HEIGHT: String(height), FORMAT: 'image/png', TRANSPARENT: 'true' });
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(`./api/wms.php?${q}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok || !/^image\//.test(response.headers.get('content-type') || '')) throw new Error(`HTTP ${response.status}`);
        if (response.headers.get('X-MSPortal-Partial') === '1') throw new Error('Niepełny obraz źródła WMS');
        if (/FALLBACK/i.test(response.headers.get('x-msportal-cache') || '')) throw new Error('źródło nie odpowiedziało');
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
        ctx2d.drawImage(bitmap, 0, 0, width, height); bitmap.close?.();
        return ctx2d.getImageData(0, 0, width, height).data;
    } catch (error) {
        if (signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
        if (error?.status) throw error; // odpowiedź serwera z kodem (np. 429) — zachowujemy status dla ponowienia
        throw new Error(controller.signal.aborted ? 'przekroczono czas odpowiedzi' : (error?.message || String(error)));
    } finally { window.clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

function distanceToGeometry(geometry, x, y) {
    let best = Infinity;
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const poly of polys) for (const ring of poly) {
        for (let i = 1; i < ring.length; i += 1) {
            const [ax, ay] = ring[i - 1]; const [bx, by] = ring[i];
            const dx = bx - ax; const dy = by - ay; const len = dx * dx + dy * dy;
            const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
            best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
        }
    }
    return best;
}

/** Piksele z danymi (alfa > minAlpha): ile w działce i jak daleko najbliższy poza nią. */
function analyzePixels(data, bbox, width, height, geometry, minAlpha = 100) {
    const px = (bbox[2] - bbox[0]) / width;
    let count = 0; let insideCount = 0; let minDist = Infinity;
    const stride = width * height > 900000 ? 2 : 1;
    const hits = [];
    for (let j = 0; j < height; j += stride) {
        for (let i = 0; i < width; i += stride) {
            if (data[(j * width + i) * 4 + 3] <= minAlpha) continue;
            count += 1;
            const x = bbox[0] + (i + 0.5) * px; const y = bbox[3] - (j + 0.5) * px;
            if (insideGeometry(geometry, [x, y])) { insideCount += 1; minDist = 0; if (insideCount % 7 === 1) hits.push([x, y]); continue; }
            if (minDist > 0) minDist = Math.min(minDist, distanceToGeometry(geometry, x, y));
        }
    }
    // 19.40.0: kilka punktów rozłożonych po trafieniach w działce — do identyfikacji obiektów (nazwy, scenariusze).
    const samples = hits.length <= 4 ? hits : [0, 1, 2, 3].map((k) => hits[Math.floor(((k + 0.5) * hits.length) / 4)]);
    return { count, insideCount, minDist: count ? minDist : null, pixelM: px, stride, samples };
}

/**
 * 19.40.0 — udział powierzchni terenu pokryty warstwą WMS i odległość do najbliższego obiektu poza terenem.
 * Obraz zasięgu terenu + bufor; dokładność = rozmiar piksela (pixelM).
 */
async function coverage(ctx, source, layers, { buffer = 50, minAlpha = 60, maxSpanPx = 1100, minPx = 0.25 } = {}) {
    const e = geometryExtent(ctx.geometry);
    const bbox = [e[0] - buffer, e[1] - buffer, e[2] + buffer, e[3] + buffer];
    const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
    const px = Math.max(minPx, span / maxSpanPx);
    const width = Math.max(8, Math.round((bbox[2] - bbox[0]) / px)); const height = Math.max(8, Math.round((bbox[3] - bbox[1]) / px));
    const a = analyzePixels(await wmsPixels(source, layers, bbox, width, height, ctx.signal), bbox, width, height, ctx.geometry, minAlpha);
    const share = Math.min(1, (a.insideCount * a.pixelM * a.pixelM * a.stride * a.stride) / Math.max(1, ctx.areaM2));
    return { ...a, share, bufferM: buffer };
}

/** Zadania po kilka naraz (usługi GUGiK i powiatów nie lubią serii). */
async function mapLimit(items, limit, fn) {
    const out = new Array(items.length); let next = 0;
    const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}

/** Siatka punktów w terenie (ok. n punktów), zawsze z punktem środkowym. */
export function gridPoints(geometry, center, n) {
    const e = geometryExtent(geometry);
    const step = Math.max(2, Math.sqrt(((e[2] - e[0]) * (e[3] - e[1])) / (n * 1.6)));
    const pts = [];
    for (let x = e[0] + step / 2; x < e[2]; x += step) for (let y = e[1] + step / 2; y < e[3]; y += step) if (insideGeometry(geometry, [x, y])) pts.push([x, y]);
    let pick = pts;
    if (pts.length > n) { pick = []; for (let k = 0; k < n; k += 1) pick.push(pts[Math.floor(((k + 0.5) * pts.length) / n)]); }
    return [center, ...pick].slice(0, n + 1);
}

const symbolsAt = (text) => [...String(text ?? '').matchAll(/^symbol:\s*(\S+)/gim)].map((m) => m[1].toUpperCase());

function geometryExtent(geometry) {
    const all = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flatMap((p) => p[0]);
    const xs = all.map((p) => p[0]); const ys = all.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Sieci KIUT (kolory jak w usłudze GUGiK). */
export const NETWORKS = [
    ['kiut_power', 'przewod_elektroenergetyczny', 'Elektroenergetyczna', '#e10000'],
    ['kiut_gas', 'przewod_gazowy', 'Gazowa', '#b5b500'],
    ['kiut_water', 'przewod_wodociagowy', 'Wodociągowa', '#1d3fd8'],
    ['kiut_sewer', 'przewod_kanalizacyjny', 'Kanalizacyjna', '#7e3100'],
    ['kiut_telecom', 'przewod_telekomunikacyjny', 'Telekomunikacyjna', '#f08a00'],
    ['kiut_heat', 'przewod_cieplowniczy', 'Ciepłownicza', '#c800c8'],
];

/** Profil terenu: punkty co równy odstęp na odcinku przez środek działki. */
function profileLines(geometry, center) {
    const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
    let best = [0, 1]; let bestLen = 0;
    const verts = ring.length > 120 ? ring.filter((_, i) => i % Math.ceil(ring.length / 120) === 0) : ring;
    for (let i = 0; i < verts.length; i += 1) for (let j = i + 1; j < verts.length; j += 1) {
        const d = Math.hypot(verts[j][0] - verts[i][0], verts[j][1] - verts[i][1]);
        if (d > bestLen) { bestLen = d; best = [verts[j][0] - verts[i][0], verts[j][1] - verts[i][1]]; }
    }
    const az = (Math.atan2(best[0], best[1]) * 180 / Math.PI + 360) % 180; // azymut osi 0–180°
    const dirs = [['Północ – południe', [0, -1], 180], ['Zachód – wschód', [1, 0], 90], [`Najdłuższa oś (azymut ${Math.round(az)}°)`, [Math.sin(az * Math.PI / 180), Math.cos(az * Math.PI / 180)], az]];
    return dirs.map(([name, [dx, dy]]) => {
        let half = 0;
        for (const [x, y] of ring) half = Math.max(half, Math.abs((x - center[0]) * dx + (y - center[1]) * dy));
        half = Math.max(15, half * 1.15);
        const n = 61; const points = [];
        for (let k = 0; k < n; k += 1) {
            const t = -half + (2 * half * k) / (n - 1);
            const p = [center[0] + dx * t, center[1] + dy * t];
            points.push({ d: t + half, p, inside: insideGeometry(geometry, p) });
        }
        return { name, length: 2 * half, points };
    });
}

// ---- sekcje -----------------------------------------------------------------

const KOMPLEKS = {
    1: 'pszenny bardzo dobry', 2: 'pszenny dobry', 3: 'pszenny wadliwy', 4: 'żytni bardzo dobry', 5: 'żytni dobry', 6: 'żytni słaby',
    7: 'żytni bardzo słaby', 8: 'zbożowo-pastewny mocny', 9: 'zbożowo-pastewny słaby', 10: 'pszenny górski', 11: 'zbożowy górski',
    12: 'owsiano-ziemniaczany górski', 13: 'owsiano-pastewny górski', 14: 'orne przeznaczone pod użytki zielone',
    '1z': 'użytki zielone bardzo dobre i dobre', Tz: 'tereny zabudowane', Ls: 'lasy', N: 'nieużytki', W: 'wody', Wz: 'wody', Ł: 'łąki', Ps: 'pastwiska', R: 'grunty orne', '2z': 'użytki zielone średnie', '3z': 'użytki zielone słabe i bardzo słabe',
};
const GLEBA = { A: 'płowe', B: 'brunatne właściwe', Bw: 'brunatne wyługowane', Bk: 'brunatne kwaśne', C: 'czarnoziemy', D: 'czarne ziemie', Dz: 'czarne ziemie zdegradowane', E: 'rędziny', F: 'mady', T: 'torfowe', M: 'murszowo-mineralne', G: 'glejowe', R: 'rędziny', Ps: 'pseudobielicowe', Bi: 'bielicowe', N: 'nieużytki / tereny zabudowane' };

const collectors = {
    async plan(ctx) {
        // Plan ogólny, MPZP, gmina i powiat, odległości BDOT — jedno zapytanie do analizy działki.
        const one = (parcel) => getJson('./api/vps.php?route=parcel/analyze', { signal: ctx.signal, method: 'POST', body: { parcel_id: parcel.id, radius_m: ctx.options.radius, include_prg: true } });
        if (ctx.parcels.length < 2) return one(ctx.parcel);
        // 19.40.0: teren z kilku działek — analiza każdej działki i scalenie stref (powierzchnie w m² sumowane).
        const all = [];
        for (const [i, parcel] of ctx.parcels.entries()) {
            ctx.progress?.(`Plany: działka ${i + 1} z ${ctx.parcels.length}…`);
            try { all.push({ parcel, data: await one(parcel) }); } catch (error) { if (ctx.signal?.aborted) throw error; all.push({ parcel, error: error.message }); }
        }
        const ok = all.filter((a) => a.data);
        if (!ok.length) throw new Error(all[0]?.error || 'analiza działek nie odpowiedziała');
        if (ok.length !== all.length) throw new Error('Niepełna analiza planów. Brak odpowiedzi dla: ' + all.filter(x => x.error).map(x => x.parcel.id).join(', '));
        return mergePlans(ok, ctx);
    },
    async ceny(ctx) {
        const { options } = ctx;
        const [x, y] = ctx.center;
        return getJson(`./api/rcn.php?x=${x.toFixed(1)}&y=${y.toFixed(1)}&r=${options.radius}&kind=${options.priceKind}&years=${options.years}`, { signal: ctx.signal });
    },
    async budowy(ctx) {
        const [x, y] = ctx.center;
        const years = Math.min(3, ctx.options.years);
        let data = null;
        // Położenie części działek z rejestru jest ustalane przy pierwszym zapytaniu (ULDK) — pytamy ponownie, aż będzie komplet.
        for (let attempt = 0; attempt < 6; attempt += 1) {
            data = await getJson(`./api/permits.php?x=${x.toFixed(1)}&y=${y.toFixed(1)}&r=${ctx.options.radius}&years=${years}`, { signal: ctx.signal });
            ctx.progress?.(`Budowy: lokalizacja działek z rejestru${data.pending ? ` (zostało ${data.pending})` : ''}…`);
            if (!data.pending) break;
        }
        return { ...data, yearsCapped: years !== ctx.options.years };
    },
    async powodz(ctx) {
        // 19.40.0: udział powierzchni terenu w obszarach zagrożenia (obraz ISOK) + scenariusze z identyfikacji
        // w punktach kontrolnych i w miejscach, gdzie obraz pokazał zagrożenie.
        let cover = null; let coverError = null;
        try { cover = await coverage(ctx, 'flood_isok', 'NZ.Fluvial,NZ.SeaWater', { buffer: 150, minAlpha: 40 }); }
        catch (error) { if (ctx.signal?.aborted) throw error; coverError = error.message; }
        const points = [...probePoints(ctx.geometry), ...(cover?.samples ?? [])];
        const results = []; let errors = 0;
        await mapLimit(points, 3, async (point) => {
            try { const r = await identify('flood_mzpmrp', point, ctx.signal); if (r.found) results.push(...parseIdentifyText(r.text)); }
            catch (error) { if (ctx.signal?.aborted) throw error; errors += 1; }
        });
        if (!cover && !results.length) throw new Error('Brak rastra ISOK. Sprawdzone punkty: ' + (points.length - errors) + '/' + points.length + '. Zasięg nieustalony.');

        const scenarios = new Set(); const kinds = new Set(); const probs = []; const since = new Set();
        for (const o of results) {
            if (o.loo_qualitativelikelihood) scenarios.add(o.loo_qualitativelikelihood);
            if (o.hazardcategory) kinds.add(o.hazardcategory);
            const p = Number(o.loo_ql_probabilityofoccurrence); if (Number.isFinite(p)) probs.push(p);
            if (o.validityperiod_start) since.add(String(o.validityperiod_start).slice(0, 10));
        }
        const found = results.length > 0 || Boolean(cover?.insideCount);
        return {
            found, warning: errors || coverError ? 'ISOK: sprawdzone punkty ' + (points.length - errors) + '/' + points.length + (coverError ? ', raster niedostępny.' : '.') : null, scenarios: [...scenarios].sort(), kinds: [...kinds], probes: points.length,
            // Obszar szczególnego zagrożenia powodzią: scenariusze 10% i 1% (Prawo wodne, art. 16 pkt 34).
            oszp: probs.some((p) => p >= 0.01), share: cover ? cover.share : null, minDist: cover?.minDist ?? null, pixelM: cover?.pixelM ?? null,
            bufferM: cover?.bufferM ?? null, coverError, dataSince: [...since].sort()[0] ?? null,
        };
    },
    async przyroda(ctx) {
        const out = { natura: null, other: null, errors: [] };
        for (const [key, source] of [['natura', 'natura2000'], ['other', 'gdos_protection']]) {
            try {
                const r = await identify(source, ctx.center, ctx.signal);
                // 19.50.0: GDOŚ nie odpowiedział — wynik z danych zapasowych EEA (opis do raportu).
                if (r.fallback === 'eea' && r.fallbackNote) (out.notes ??= []).push(r.fallbackNote);
                const objs = r.found ? parseIdentifyText(r.text) : [];
                out[key] = objs.map((o) => o.nazwa || o.NAZWA || o.Nazwa || o.name || o.kod || o.KOD || Object.values(o)[0]).filter(Boolean);
            } catch (error) { out.errors.push(`${source === 'natura2000' ? 'Natura 2000' : 'inne formy ochrony'}: ${error.message}`); }
        }
        // 19.40.0: udział powierzchni terenu (obraz w skali terenu) i nazwy obszarów w miejscach trafień.
        out.share = {};
        for (const [key, source, layers] of [['natura', 'natura2000', 'GDOS:ObszarySpecjalnejOchrony,GDOS:SpecjalneObszaryOchrony'], ['other', 'gdos_protection', 'GDOS:ParkiNarodowe,GDOS:ParkiKrajobrazowe,GDOS:Rezerwaty,GDOS:ObszaryChronionegoKrajobrazu,GDOS:UzytkiEkologiczne,GDOS:ZespolyPrzyrodniczoKrajobrazowe']]) {
            try {
                const c = await coverage(ctx, source, layers, { buffer: 30, minAlpha: 60 });
                out.share[key] = c;
                if (c.insideCount && out[key] !== null) {
                    for (const pt of c.samples.slice(0, 2)) {
                        try { const r = await identify(source, pt, ctx.signal); const objs = r.found ? parseIdentifyText(r.text) : []; out[key] = [...new Set([...(out[key] ?? []), ...objs.map((o) => o.nazwa || o.NAZWA || o.Nazwa || o.name || o.kod || o.KOD || Object.values(o)[0]).filter(Boolean)])]; }
                        catch (error) { if (ctx.signal?.aborted) throw error; }
                    }
                }
            } catch (error) { if (ctx.signal?.aborted) throw error; out.share[key] = { error: error.message }; }
        }
        // 19.38.0: odległość od działki do najbliższego obszaru (obraz 6 × 6 km, ok. 10 m na piksel).
        const R = 3000; const [cx, cy] = ctx.center; const bbox = [cx - R, cy - R, cx + R, cy + R];
        out.dist = {};
        for (const [key, source, layers] of [['natura', 'natura2000', 'GDOS:ObszarySpecjalnejOchrony,GDOS:SpecjalneObszaryOchrony'], ['other', 'gdos_protection', 'GDOS:ParkiNarodowe,GDOS:ParkiKrajobrazowe,GDOS:Rezerwaty,GDOS:ObszaryChronionegoKrajobrazu,GDOS:UzytkiEkologiczne,GDOS:ZespolyPrzyrodniczoKrajobrazowe']]) {
            try { out.dist[key] = analyzePixels(await wmsPixels(source, layers, bbox, 600, 600, ctx.signal), bbox, 600, 600, ctx.geometry, 60); }
            catch (error) { if (ctx.signal?.aborted) throw error; out.dist[key] = { error: error.message }; }
        }
        out.radiusM = R;
        return out;
    },
    async uzbrojenie(ctx) {
        // 19.38.0: sieci KIUT wokół działki — każda sieć osobnym obrazem, analiza pikseli w przeglądarce.
        const buffer = Number(ctx.options.utilBuffer) || 60;
        const e = geometryExtent(ctx.geometry);
        const bbox = [e[0] - buffer, e[1] - buffer, e[2] + buffer, e[3] + buffer];
        const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
        const px = Math.max(0.2, span / 1100);
        const width = Math.round((bbox[2] - bbox[0]) / px); const height = Math.round((bbox[3] - bbox[1]) / px);
        const results = [];
        const queue = [...NETWORKS];
        const worker = async () => {
            while (queue.length) {
                const [source, layers, name, color] = queue.shift();
                ctx.progress?.(`Uzbrojenie: sieć ${name.toLowerCase()}…`);
                try { results.push({ source, name, color, ...analyzePixels(await wmsPixels(source, layers, bbox, width, height, ctx.signal), bbox, width, height, ctx.geometry, 100) }); }
                catch (error) { if (ctx.signal?.aborted) throw error; results.push({ source, name, color, error: error.message }); }
            }
        };
        await Promise.all([worker(), worker(), worker()]);
        if (results.every((r) => r.error)) throw new Error(results[0]?.error || 'KIUT nie odpowiedział');
        results.sort((a, b) => NETWORKS.findIndex((n) => n[0] === a.source) - NETWORKS.findIndex((n) => n[0] === b.source));
        return { networks: results, bufferM: buffer, pixelM: px };
    },
    async las(ctx) {
        // Środek i 4 skrajne punkty działki — działka bywa częściowo leśna.
        const hits = [];
        let errors = 0;
        const points = probePoints(ctx.geometry);
        for (const [x, y] of points) {
            try {
                const r = await getJson(`./api/forest.php?x=${x.toFixed(1)}&y=${y.toFixed(1)}`, { signal: ctx.signal });
                if (r.found) hits.push(r);
            } catch (error) { if (ctx.signal?.aborted) throw error; errors += 1; }
        }
        // 19.40.0: lasy z BDOT10k — udział powierzchni i odległość od granicy (bufor 300 m).
        let bdot = null;
        try { bdot = await coverage(ctx, 'bdot10k_forest', 'TLes', { buffer: 300, minAlpha: 60 }); }
        catch (error) { if (ctx.signal?.aborted) throw error; bdot = { error: error.message }; }
        if (errors === points.length && bdot?.error) throw new Error('Bank Danych o Lasach nie odpowiedział');
        const owners = [...new Set(hits.map((h) => h.owner))];
        return { found: hits.length > 0, share: `${hits.length} z ${points.length}`, owners, first: hits[0] ?? null, errors, bdl: errors < points.length, bdot };
    },
    async gleby(ctx) {
        // 19.40.0: siatka punktów w całym terenie (do 16 + środek) zamiast jednego punktu.
        const out = { soil: [], classes: [], errors: [], points: 0, complexes: {}, classCounts: {}, classPoints: 0, sourceNote: null };
        const points = gridPoints(ctx.geometry, ctx.center, 16);
        out.points = points.length;
        let soilErrors = 0; let egibErrors = 0;
        await mapLimit(points, 3, async (pt, i) => {
            try {
                const r = await identify('glebowa', pt, ctx.signal);
                const o = parseIdentifyText(r.found ? r.text : '').find((x) => x.KOMPLEKS || x.TYPPODTYP);
                if (o?.KOMPLEKS) out.complexes[o.KOMPLEKS] = (out.complexes[o.KOMPLEKS] ?? 0) + 1;
                if (o?.UWAGI && !out.sourceNote) out.sourceNote = o.UWAGI;
                if (i === 0 && o) out.soil.push({ kompleks: o.KOMPLEKS ? (KOMPLEKS[o.KOMPLEKS] ? `${o.KOMPLEKS} — ${KOMPLEKS[o.KOMPLEKS]}` : `kod ${o.KOMPLEKS}`) : null, typ: o.TYPPODTYP ? `${o.TYPPODTYP}${GLEBA[o.TYPPODTYP] ? ` — gleby ${GLEBA[o.TYPPODTYP]}` : ''}` : null, zrodlo: o.UWAGI || null });
            } catch (error) { if (ctx.signal?.aborted) throw error; soilErrors += 1; }
            try {
                const r = await identify('egib_classes', pt, ctx.signal);
                const objs = parseIdentifyText(r.found ? r.text : '');
                const found = new Set();
                for (const o of objs) for (const [key, value] of Object.entries(o)) {
                    if (!/OZK|OZU|klas|użyt/i.test(key) || /grupa/i.test(key)) continue;
                    for (const m of String(value).matchAll(/(?:^|[\s,;(])(R|Ł|Ps|Ls|Lz|N)\s*-?\s*(VI(?:z)?|IV[ab]?|V|I{1,3}[ab]?)(?![a-z])/g)) found.add(`${m[1]}${m[2]}`);
                    if (i === 0) out.classes.push(`${key}: ${value}`);
                }
                if (found.size) { out.classPoints += 1; for (const c of found) out.classCounts[c] = (out.classCounts[c] ?? 0) + 1; }
            } catch (error) { if (ctx.signal?.aborted) throw error; egibErrors += 1; }
        });
        if (soilErrors) out.errors.push(`mapa glebowo-rolnicza: ${soilErrors} z ${points.length} punktów bez odpowiedzi`);
        if (egibErrors) out.errors.push(`ewidencja (klasoużytki): ${egibErrors} z ${points.length} punktów bez odpowiedzi`);
        if (soilErrors === points.length && egibErrors === points.length) throw new Error('mapa glebowo-rolnicza i ewidencja nie odpowiedziały');
        out.classes = [...new Set(out.classes)].slice(0, 6);
        // Klasy I–III z ewidencji (gdy powiat je udostępnia) i kompleksy o wysokiej przydatności z mapy glebowej.
        out.highClassPoints = Object.entries(out.classCounts).filter(([c]) => /^(R|Ł|Ps)(I{1,3}[ab]?)$/.test(c)).reduce((a, [, n]) => a + n, 0);
        out.highComplexPoints = ['1', '2', '1z', '10'].reduce((a, k) => a + (out.complexes[k] ?? 0), 0);
        out.midComplexPoints = ['3', '4', '8', '11'].reduce((a, k) => a + (out.complexes[k] ?? 0), 0);
        return out;
    },
    async ouz(ctx) {
        // 19.40.0: obszar uzupełnienia zabudowy (plan ogólny) — symbol OUZ w punktach kontrolnych terenu.
        const points = probePoints(ctx.geometry);
        let hits = 0; let answered = 0; let pog = false; let oszs = 0;
        await mapLimit(points, 3, async (pt) => {
            try {
                const r = await identify('pog_adopted', pt, ctx.signal); answered += 1;
                if (!r.found) return;
                pog = true; const sym = symbolsAt(r.text);
                if (sym.includes('OUZ')) hits += 1; if (sym.includes('OZS')) oszs += 1;
            } catch (error) { if (ctx.signal?.aborted) throw error; }
        });
        if (!answered) throw new Error('usługa planów ogólnych nie odpowiedziała');
        return { pog, hits, oszs, warning: answered < points.length ? 'OUZ: odpowiedziało ' + answered + '/' + points.length + ' punktów.' : null, points: points.length, answered, summary: 'Trafienia OUZ: ' + hits + '. Sprawdzone punkty: ' + answered + '/' + points.length + '.' };
    },
    async inne(ctx) {
        // 19.40.0: zabytki (NID), złoża i obszary górnicze (MIDAS), wody (BDOT10k).
        const out = { nid: { immovable: [], archaeology: [], errors: 0, points: 0 }, errors: [] };
        const points = gridPoints(ctx.geometry, ctx.center, 6);
        out.nid.points = points.length;
        for (const [key, source] of [['immovable', 'nid_immovable'], ['archaeology', 'nid_archaeology']]) {
            await mapLimit(points, 3, async (pt) => {
                try { const r = await identify(source, pt, ctx.signal); if (r.found) for (const o of parseIdentifyText(r.text)) out.nid[key].push(o.nazwa || o.Nazwa || o.name || o.text || o.inspireid || o.id || Object.values(o).find((v) => v && v.length > 4) || 'obiekt z rejestru'); }
                catch (error) { if (ctx.signal?.aborted) throw error; out.nid.errors += 1; }
            });
            out.nid[key] = [...new Set(out.nid[key])].slice(0, 6);
        }
        if (out.nid.errors === points.length * 2) out.errors.push('NID nie odpowiedział');
        for (const [key, source, layers, buffer] of [['water', 'bdot10k_water', 'WPow,rz,kan,row', 300], ['deposits', 'pgi_deposits', '0', 100], ['mining', 'pgi_miningareas', '1', 100]]) {
            try { out[key] = await coverage(ctx, source, layers, { buffer, minAlpha: 60 }); }
            catch (error) { if (ctx.signal?.aborted) throw error; out[key] = { error: error.message }; }
        }
        return out;
    },
    async teren3d(ctx) {
        // 19.41.0: siatka modelu 3D (ta sama co w oknie Teren 3D: kafle NMT 1 m z cache serwera albo siatka punktów GUGiK).
        const { areaExtent, buildTerrainGrid, slopeShares } = await import('../terrain3d/terrainGrid.js');
        const extent = areaExtent([ctx.geometry], 50);
        const grid = await buildTerrainGrid(extent, { detail: 'standard', signal: ctx.signal, onProgress: (msg) => ctx.progress?.(`Teren 3D: ${msg}`) });
        const inside = slopeShares(grid, (x, y) => insideGeometry(ctx.geometry, [x, y]));
        let minIn = Infinity; let maxIn = -Infinity;
        for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
            const v = grid.values[r * grid.cols + c];
            if (Number.isFinite(v) && insideGeometry(ctx.geometry, [grid.extent[0] + c * grid.stepX, grid.extent[3] - r * grid.stepY])) { minIn = Math.min(minIn, v); maxIn = Math.max(maxIn, v); }
        }
        return { grid, inside, minIn: Number.isFinite(minIn) ? minIn : null, maxIn: Number.isFinite(maxIn) ? maxIn : null };
    },
    async otoczenie(ctx) {
        // 19.40.0: zabudowa mieszkaniowa (lokalny magazyn BDOT10k), biogazownie KOWR, inwestycje energetyczne (RWDZ).
        const out = {};
        const e = geometryExtent(ctx.geometry); const R = 1000;
        const bbox = [e[0] - R, e[1] - R, e[2] + R, e[3] + R];
        try {
            const data = await getJson(`./api/analysis_buildings.php?bbox=${bbox.map((v) => v.toFixed(0)).join(',')}&category=residential&limit=5000&near=${e.map((v) => v.toFixed(0)).join(',')}`, { signal: ctx.signal });
            // Brak kafli magazynu dla obszaru ≠ brak budynków: wtedy wynik jest niepewny (do weryfikacji), nie „0 budynków”.
            if (!(data.meta?.tilesRead > 0)) throw new Error('obszar poza zasięgiem lokalnej bazy BDOT10k');
            const rings = [100, 300, 500, 1000]; const counts = rings.map(() => 0);
            let nearest = Infinity; let insideCount = 0; let nearestCat = null; const points = [];
            for (const f of data.features ?? []) {
                const g = f.geometry; if (!g) continue;
                const verts = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flatMap((p) => p[0]);
                let d = Infinity;
                for (const [x, y] of verts) { if (insideGeometry(ctx.geometry, [x, y])) { d = 0; break; } d = Math.min(d, distanceToGeometry(ctx.geometry, x, y)); }
                if (d === 0) insideCount += 1;
                rings.forEach((r, i) => { if (d <= r) counts[i] += 1; });
                if (d <= 1000 && points.length < 800) { const cx = verts.reduce((a, p) => a + p[0], 0) / verts.length; const cy = verts.reduce((a, p) => a + p[1], 0) / verts.length; points.push({ x: cx, y: cy, d }); }
                if (d < nearest) { nearest = d; nearestCat = f.properties?.category ?? null; }
            }
            out.residential = { nearest: Number.isFinite(nearest) ? nearest : null, nearestCat, insideCount, rings, counts, points, truncated: Boolean(data.meta?.truncated), dataDate: data.meta?.dataGeneratedAt ?? null, tilesMissing: (data.meta?.tilesMissing ?? 0) + (data.meta?.coverageUnknown ?? 0) };
        } catch (error) { if (ctx.signal?.aborted) throw error; out.residential = { error: error.message }; }
        try {
            const kowr = await getJson('./data/kowr/installations.json', { signal: ctx.signal });
            const [lon, lat] = toLonLat(transform(ctx.center, 'EPSG:2180', 'EPSG:3857'));
            const hav = (a, b, c, d) => { const r = Math.PI / 180; const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(x)); };
            const items = (kowr.records ?? []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)).map((x) => ({ ...x, dist: hav(lat, lon, x.lat, x.lon) })).filter((x) => x.dist <= 20000).sort((a, b) => a.dist - b.dist);
            out.kowr = { date: kowr.date, within10: items.filter((x) => x.dist <= 10000).length, within20: items.length, items: items.slice(0, 8) };
        } catch (error) { if (ctx.signal?.aborted) throw error; out.kowr = { error: error.message }; }
        try {
            const [x, y] = ctx.center;
            const data = await getJson(`./api/permits.php?x=${x.toFixed(1)}&y=${y.toFixed(1)}&r=1500&years=3&types=energia,przemysl`, { signal: ctx.signal });
            out.permits = { count: data.count ?? 0, counts: data.counts ?? {}, items: (data.items ?? []).sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0)).slice(0, 8), dataDate: data.dataDate ?? null, pending: data.pending ?? 0 };
        } catch (error) { if (ctx.signal?.aborted) throw error; out.permits = { error: error.message }; }
        if (out.residential.error && out.kowr.error && out.permits.error) throw new Error(out.residential.error);
        return out;
    },
    async teren(ctx) {
        // Siatka punktów w działce (do 196), wysokości NMT 1 m z GUGiK przez api/terrain.php.
        const g = ctx.geometry;
        const all = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flatMap((p) => p[0]);
        const xs = all.map((p) => p[0]); const ys = all.map((p) => p[1]);
        const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const step = Math.max(1.5, Math.sqrt(((maxX - minX) * (maxY - minY)) / 180));
        const cells = [];
        for (let x = minX + step / 2; x < maxX; x += step) for (let y = minY + step / 2; y < maxY; y += step) if (insideGeometry(g, [x, y])) cells.push([x, y]);
        if (cells.length < 4) cells.push(...probePoints(g));
        const points = cells.slice(0, 196);
        // 19.38.0: 3 profile wysokości (N–S, W–E, najdłuższa oś) w tym samym zapytaniu (do 800 punktów).
        const profiles = profileLines(g, ctx.center);
        const allPoints = [...points, ...profiles.flatMap((pr) => pr.points.map((pt) => pt.p))];
        const data = await getJson('./api/terrain.php', { signal: ctx.signal, method: 'POST', body: { points: allPoints } });
        let offset = points.length;
        for (const pr of profiles) { pr.points.forEach((pt, i) => { const v = data.heights?.[offset + i]; pt.h = Number.isFinite(v) ? v : null; }); offset += pr.points.length; }
        const h = new globalThis.Map();
        points.forEach((p, i) => { const v = data.heights?.[i]; if (Number.isFinite(v)) h.set(`${Math.round((p[0] - minX) / step)}|${Math.round((p[1] - minY) / step)}`, { v, p }); });
        const values = [...h.values()].map((o) => o.v);
        if (values.length < 3) throw new Error('za mało wysokości z NMT');
        // Spadek z różnic sąsiednich punktów siatki (gradient w x i y).
        const slopes = []; const aspects = [];
        for (const [key, { v }] of h) {
            const [i, j] = key.split('|').map(Number);
            const e = h.get(`${i + 1}|${j}`); const n = h.get(`${i}|${j + 1}`);
            if (!e || !n) continue;
            const dx = (e.v - v) / step; const dy = (n.v - v) / step;
            slopes.push(Math.hypot(dx, dy) * 100);
            if (Math.hypot(dx, dy) > 0.02) aspects.push(((Math.atan2(-dx, -dy) * 180) / Math.PI + 360) % 360);
        }
        const share = (fn) => (slopes.length ? Math.round((slopes.filter(fn).length / slopes.length) * 100) : null);
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const names = { N: 'północ', NE: 'północny wschód', E: 'wschód', SE: 'południowy wschód', S: 'południe', SW: 'południowy zachód', W: 'zachód', NW: 'północny zachód' };
        const counts = Object.fromEntries(dirs.map((d) => [d, 0]));
        for (const a of aspects) counts[dirs[Math.round(a / 45) % 8]] += 1;
        const dominant = aspects.length >= Math.max(3, slopes.length * 0.3) ? dirs.reduce((a, b) => (counts[b] > counts[a] ? b : a)) : null;
        const mean = slopes.length ? slopes.reduce((a, b) => a + b, 0) / slopes.length : null;
        return {
            min: Math.min(...values), max: Math.max(...values), mean: values.reduce((a, b) => a + b, 0) / values.length, samples: values.length, step,
            slopeMean: mean, slopeMax: slopes.length ? Math.max(...slopes) : null,
            classes: [['0–2% (płasko)', share((s) => s < 2)], ['2–5%', share((s) => s >= 2 && s < 5)], ['5–10%', share((s) => s >= 5 && s < 10)], ['10–15%', share((s) => s >= 10 && s < 15)], ['ponad 15%', share((s) => s >= 15)]],
            aspect: dominant ? `${names[dominant]} (${Math.round((counts[dominant] / aspects.length) * 100)}% spadków)` : 'brak wyraźnego kierunku (teren płaski)',
            source: data.source || 'GUGiK NMT 1 m', datum: data.verticalDatum || 'PL-KRON86-NH',
            profiles: profiles.map((pr) => ({ name: pr.name, length: pr.length, points: pr.points.map(({ d, h, inside: isIn }) => ({ d, h, inside: isIn })) })),
        };
    },
};

/** Które zapytania są potrzebne dla wybranych sekcji. */
const NEEDS = { pog: ['plan', 'ouz'], mpzp: ['plan'], odleglosci: ['plan'], dzialka: ['plan'], ceny: ['ceny'], budowy: ['budowy'], powodz: ['powodz'], przyroda: ['przyroda'], gleby: ['gleby'], teren: ['teren'], las: ['las'], uzbrojenie: ['uzbrojenie'], inne: ['inne'], otoczenie: ['otoczenie'], teren3d: ['teren3d'] };
const LABEL = { plan: 'plany i dane działki', ceny: 'ceny transakcyjne', budowy: 'budowy i pozwolenia', powodz: 'zagrożenie powodziowe', przyroda: 'ochrona przyrody', gleby: 'gleby i użytki (siatka punktów)', teren: 'wysokości NMT', las: 'lasy (BDL, BDOT10k)', uzbrojenie: 'uzbrojenie terenu (KIUT)', ouz: 'obszar uzupełnienia zabudowy', inne: 'zabytki, złoża, wody', otoczenie: 'zabudowa mieszkaniowa i otoczenie', teren3d: 'model terenu 3D' };

/** 19.40.0: scalenie analiz kilku działek (strefy POG sumowane w m², MPZP bez powtórzeń, odległości BDOT — minimum). */
function mergePlans(list, ctx) {
    const first = list[0].data;
    const zones = new globalThis.Map(); const acts = new globalThis.Map(); const mpzp = new globalThis.Map();
    for (const { parcel, data } of list) {
        const area = geometryArea(parseParcelWkt(parcel.wkt)) ?? 0;
        for (const m of data.layers?.pog?.matches ?? []) {
            if (m.kind === 'akt') { if (!acts.has(m.label)) acts.set(m.label, m); continue; }
            if (m.kind !== 'strefa') continue;
            const part = m.areaM2 ?? (m.partPct != null ? (area * m.partPct) / 100 : area);
            const z = zones.get(m.label) ?? { ...m, areaM2: 0, approximate: false };
            z.areaM2 += part; z.approximate = z.approximate || Boolean(m.approximate) || m.areaM2 == null;
            zones.set(m.label, z);
        }
        for (const m of data.layers?.mpzp?.matches ?? []) { const key = `${m.label}|${m.link ?? ''}`; if (!mpzp.has(key)) mpzp.set(key, { ...m, partPct: null }); }
    }
    const zoneList = [...zones.values()].map((z) => ({ ...z, partPct: (z.areaM2 / Math.max(1, ctx.areaM2)) * 100 }));
    const bdots = list.map((x) => x.data.bdot).filter(Boolean);
    const bdot = bdots.length ? { ...bdots[0], groups: Object.fromEntries(Object.keys(bdots[0].groups ?? {}).map((k) => [k, { ...bdots[0].groups[k], nearestM: Math.min(...bdots.map((b) => b.groups?.[k]?.nearestM ?? Infinity)) }])) } : null;
    return { ...first, layers: { ...first.layers, pog: { ...(first.layers?.pog ?? {}), matches: [...acts.values(), ...zoneList] }, mpzp: { ...(first.layers?.mpzp ?? {}), matches: [...mpzp.values()] } }, bdot, merged: list.length };
}

/** Działka z ULDK → kontekst raportu (geometria 2180, środek, powierzchnia). */
export function parcelContext(parcel) {
    if (!parcel?.wkt) throw new Error('Brak geometrii działki — kliknij działkę na mapie jeszcze raz.');
    const geometry = parseParcelWkt(parcel.wkt);
    return { parcel, parcels: [parcel], geometry, center: parcelCentroid(geometry), areaM2: geometryArea(geometry) };
}

/**
 * 19.40.0 — teren inwestycji: jedna działka albo kilka (pierwsza = działka główna, od niej nazwy w nagłówku).
 * Zwraca kontekst jak parcelContext + parcels[] i shape (wymiary, największy prostokąt).
 */
export function terrainContext(parcels) {
    const list = parcels.filter((p) => p?.wkt);
    if (!list.length) throw new Error('Brak geometrii działki — kliknij działkę na mapie jeszcze raz.');
    const items = list.map((p) => parcelContext(p));
    const merged = items.length === 1 ? items[0] : { parcel: list[0], ...mergeParcelGeometries(items) };
    let shape = null;
    try { shape = shapeMetrics(merged.geometry, merged.areaM2, { single: items.length === 1 }); } catch { shape = null; }
    return { ...merged, parcel: list[0], parcels: list, parts: items.map((it) => ({ parcel: it.parcel, areaM2: it.areaM2 })), shape };
}

/**
 * Zbiera dane dla wybranych sekcji. Zwraca { results: {plan, ceny, …: {data} | {error}}, fetchedAt }.
 * Zapytania idą po dwa naraz (serwer współdzielony, usługi GUGiK nie lubią serii).
 */
export async function collectReportData(base, options, { signal, progress } = {}) {
    const ctx = { ...base, options, signal, progress };
    const needed = [...new Set(options.sections.flatMap((s) => NEEDS[s] ?? []))];
    const results = {};
    const queue = [...needed];
    let done = 0;
    const worker = async () => {
        while (queue.length) {
            const key = queue.shift();
            progress?.(`Pobieranie: ${LABEL[key]}…`, done / Math.max(1, needed.length));
            try { results[key] = { data: await collectors[key](ctx) }; }
            catch (error) {
                if (signal?.aborted) throw error;
                results[key] = { error: error?.message || String(error) };
            }
            done += 1;
        }
    };
    await Promise.all([worker(), worker()]);
    return { results, fetchedAt: new Date() };
}
