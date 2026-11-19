import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import VectorTileSource from 'ol/source/VectorTile.js';
import MVT from 'ol/format/MVT.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import Text from 'ol/style/Text.js';
import TileState from 'ol/TileState.js';
import mlcontour from 'maplibre-contour';

/**
 * 19.30.0 — warstwy liczone w przeglądarce z otwartego modelu wysokości (AWS Terrain Tiles, kodowanie
 * „terrarium”, ok. 30 m): nachylenie terenu w %, cieniowanie rzeźby i warstwice. Bez serwera i bez klucza.
 */
export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRARIUM_ATTRIBUTION = 'Model wysokości: AWS Terrain Tiles (SRTM, EU-DEM i in.)';
const DEM_MAX_ZOOM = 14;

/** Progi spadku (%) i kolory RGBA — te same, co w legendzie warstwy. */
export const SLOPE_CLASSES = Object.freeze([
    { max: 2, label: '< 2%', rgba: [0, 0, 0, 0] },
    { max: 5, label: '2–5%', rgba: [214, 233, 190, 110] },
    { max: 10, label: '5–10%', rgba: [168, 214, 140, 150] },
    { max: 15, label: '10–15%', rgba: [236, 228, 120, 170] },
    { max: 25, label: '15–25%', rgba: [245, 178, 84, 185] },
    { max: 40, label: '25–40%', rgba: [228, 104, 70, 200] },
    { max: Infinity, label: '> 40%', rgba: [176, 44, 72, 215] },
]);

function pixelSizeMeters(z, y) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / 2 ** z)));
    return (156543.03392804097 * Math.cos(lat)) / 2 ** z;
}

async function readTerrarium(url, signal) {
    const response = await fetch(url, { signal, mode: 'cors' });
    if (!response.ok) throw new Error(`Model wysokości: HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    return { canvas, context, data: context.getImageData(0, 0, bitmap.width, bitmap.height), size: bitmap.width };
}

function elevationAt(src, size) {
    return (x, y) => {
        const i = (Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))) * 4;
        return src[i] * 256 + src[i + 1] + src[i + 2] / 256 - 32768;
    };
}

/** Gradient z różnic centralnych; na krawędzi kafla — jednostronnych (bez widocznych szwów). */
function forEachGradient(data, size, px, callback) {
    const h = elevationAt(data.data, size);
    for (let y = 0; y < size; y++) {
        const yt = Math.max(0, y - 1), yb = Math.min(size - 1, y + 1);
        for (let x = 0; x < size; x++) {
            const xl = Math.max(0, x - 1), xr = Math.min(size - 1, x + 1);
            const dx = (h(xr, y) - h(xl, y)) / ((xr - xl) * px);
            const dy = (h(x, yb) - h(x, yt)) / ((yb - yt) * px);
            callback((y * size + x) * 4, dx, dy);
        }
    }
}

function renderSlope(tile, z, y) {
    const out = tile.context.createImageData(tile.size, tile.size);
    const o = out.data;
    forEachGradient(tile.data, tile.size, pixelSizeMeters(z, y), (i, dx, dy) => {
        const pct = Math.hypot(dx, dy) * 100;
        const rgba = SLOPE_CLASSES.find((entry) => pct < entry.max).rgba;
        o[i] = rgba[0]; o[i + 1] = rgba[1]; o[i + 2] = rgba[2]; o[i + 3] = rgba[3];
    });
    return out;
}

/** Cieniowanie (światło z północnego zachodu), przezroczyste na płaskim — nakłada się na mapę. */
function renderHillshade(tile, z, y, exaggeration = 2.5) {
    const out = tile.context.createImageData(tile.size, tile.size);
    const o = out.data;
    const azimuth = (315 * Math.PI) / 180, altitude = (45 * Math.PI) / 180;
    forEachGradient(tile.data, tile.size, pixelSizeMeters(z, y), (i, dx, dy) => {
        const slope = Math.atan(exaggeration * Math.hypot(dx, dy));
        const aspect = Math.atan2(dy, -dx);
        const light = Math.sin(altitude) * Math.cos(slope) + Math.cos(altitude) * Math.sin(slope) * Math.cos(azimuth - Math.PI / 2 - aspect);
        const shade = Math.max(0, Math.min(1, light));
        const flat = Math.sin(altitude);
        if (shade < flat) { o[i] = 58; o[i + 1] = 46; o[i + 2] = 34; o[i + 3] = Math.round(Math.min(1, (flat - shade) * 1.6) * 255); }
        else { o[i] = 255; o[i + 1] = 252; o[i + 2] = 240; o[i + 3] = Math.round(Math.min(1, (shade - flat) * 1.2) * 200); }
    });
    return out;
}

/**
 * 19.31.1: kolory hipsometryczne — od zieleni nizin przez żółć wyżyn do brązu gór i jasnej szarości szczytów.
 * Progi gęstsze w niskich wysokościach (większość Polski leży poniżej 300 m).
 */
const HYPSO_STOPS = [
    [-10, [196, 226, 214]], [0, [190, 222, 168]], [50, [205, 229, 168]], [100, [222, 235, 172]], [150, [236, 238, 178]],
    [200, [244, 234, 172]], [300, [243, 220, 156]], [400, [238, 204, 140]], [600, [228, 184, 124]], [800, [214, 164, 112]],
    [1000, [200, 146, 104]], [1300, [186, 140, 116]], [1700, [196, 178, 164]], [2200, [232, 228, 224]],
];
const HYPSO_MIN = -10, HYPSO_MAX = 2600;
const HYPSO_LUT = (() => {
    const lut = new Uint8ClampedArray((HYPSO_MAX - HYPSO_MIN + 1) * 3);
    for (let h = HYPSO_MIN; h <= HYPSO_MAX; h++) {
        let k = HYPSO_STOPS.findIndex(([e]) => e > h);
        if (k === -1) k = HYPSO_STOPS.length - 1;
        const [e0, c0] = HYPSO_STOPS[Math.max(0, k - 1)], [e1, c1] = HYPSO_STOPS[k];
        const t = e1 === e0 ? 0 : Math.max(0, Math.min(1, (h - e0) / (e1 - e0)));
        for (let c = 0; c < 3; c++) lut[(h - HYPSO_MIN) * 3 + c] = c0[c] + (c1[c] - c0[c]) * t;
    }
    return lut;
})();
/**
 * Rzeźba w jednym obrazie: barwa wysokości × cieniowanie (światło z NW, przewyższenie ×4).
 * Obraz jest nakładany trybem „multiply” (createReliefLayer), więc wyłącznie przyciemnia mapę:
 * biel = bez zmian, drogi, budynki i napisy pod spodem zostają widoczne.
 */
function renderRelief(tile, z, y) {
    const out = tile.context.createImageData(tile.size, tile.size);
    const o = out.data, src = tile.data.data;
    const azimuth = (315 * Math.PI) / 180, altitude = (45 * Math.PI) / 180, flat = Math.sin(altitude), exaggeration = 4;
    forEachGradient(tile.data, tile.size, pixelSizeMeters(z, y), (i, dx, dy) => {
        const h = Math.round(src[i] * 256 + src[i + 1] + src[i + 2] / 256 - 32768);
        const j = (Math.max(HYPSO_MIN, Math.min(HYPSO_MAX, h)) - HYPSO_MIN) * 3;
        const slope = Math.atan(exaggeration * Math.hypot(dx, dy));
        const aspect = Math.atan2(dy, -dx);
        const light = Math.sin(altitude) * Math.cos(slope) + Math.cos(altitude) * Math.sin(slope) * Math.cos(azimuth - Math.PI / 2 - aspect);
        // stoki w cieniu przyciemniane do 70%, strona oświetlona bez zmian
        const shade = 1 - 0.7 * Math.min(1, Math.max(0, flat - Math.max(0, light)) * 1.6);
        // barwa wysokości złagodzona o 35% w stronę bieli — mnożenie i tak ją wzmacnia
        for (let c = 0; c < 3; c++) o[i + c] = (255 - (255 - HYPSO_LUT[j + c]) * 0.65) * shade;
        o[i + 3] = 255;
    });
    return out;
}

function multiplyOnto(layer) {
    layer.on('prerender', (event) => { if (event.context) event.context.globalCompositeOperation = 'multiply'; });
    layer.on('postrender', (event) => { if (event.context) event.context.globalCompositeOperation = 'source-over'; });
    return layer;
}
/**
 * Warstwy rzeźby dla podkładu Kartograficznego: jeden obraz z modelu, nakładany trybem „multiply” na płótno mapy.
 * 19.32.1: dwie warstwy na tym samym źródle (obraz liczony raz) — pełna siła w małych skalach, a od skali pracy
 * z działkami (z ≥ 15,5, ok. 1:10 000) przygaszona, żeby nie zasłaniała granic działek i planów.
 */
export function createReliefLayers({ farOpacity = 0.9, nearOpacity = 0.4, switchZoom = 15.5 } = {}) {
    const far = multiplyOnto(createDemRasterLayer({ opacity: farOpacity, maxZoom: switchZoom }, 'relief'));
    const near = multiplyOnto(new TileLayer({ source: far.getSource(), opacity: nearOpacity, minZoom: switchZoom, preload: 0 }));
    return [far, near];
}

/**
 * Warstwa rastrowa z modelu wysokości; mode: 'slope' | 'hillshade' | 'relief'. layerOptions — opcje warstwy OpenLayers.
 * options.exaggeration — przewyższenie cieniowania (domyślnie 2,5).
 */
export function createDemRasterLayer(layerOptions, mode, { exaggeration } = {}) {
    const render = mode === 'slope' ? renderSlope
        : mode === 'relief' ? renderRelief
        : (tile, z, y) => renderHillshade(tile, z, y, exaggeration);
    const source = new XYZ({
        url: TERRARIUM_URL, maxZoom: DEM_MAX_ZOOM, crossOrigin: 'anonymous', transition: 150,
        attributions: TERRARIUM_ATTRIBUTION,
        tileLoadFunction: (imageTile, src) => {
            const [z, , y] = imageTile.getTileCoord();
            const controller = new AbortController();
            readTerrarium(src, controller.signal).then(async (tile) => {
                tile.context.putImageData(render(tile, z, y), 0, 0);
                const blob = await tile.canvas.convertToBlob({ type: 'image/png' });
                const image = imageTile.getImage();
                const url = URL.createObjectURL(blob);
                image.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
                image.src = url;
            }).catch(() => imageTile.setState(TileState.ERROR));
        },
    });
    return new TileLayer({ ...layerOptions, preload: 0, source });
}

let demManager = null;
let demManagerUsers = 0;
function contourManager() {
    // 19.31.0: pamięć podręczna 48 kafli modelu (ok. 12 MB) zamiast 120 (ok. 31 MB) — warstwice liczy się dla widoku,
    // nie dla całego miasta.
    if (!demManager) demManager = new mlcontour.LocalDemManager({ demUrlPattern: TERRARIUM_URL, cacheSize: 48, encoding: 'terrarium', maxzoom: 13, timeoutMs: 12000 });
    return demManager;
}
/** 19.31.0: menedżer modelu żyje tak długo jak warstwice — po zwolnieniu podkładu Karto oddaje pamięć. */
function acquireContourManager() { demManagerUsers += 1; }
function releaseContourManager() {
    demManagerUsers = Math.max(0, demManagerUsers - 1);
    if (demManagerUsers === 0) demManager = null;
}
/** Cięcie warstwic [zwykłe, pogrubione] w metrach dla poziomu przybliżenia. */
function contourLevels(z) {
    // 19.31.1: gęściej — co 10 m od z12, co 5 m od z13 (model ok. 30 m nie uzasadnia gęstszych).
    if (z <= 10) return [50, 250];
    if (z <= 11) return [20, 100];
    if (z <= 12) return [10, 50];
    return [5, 25];
}

/** Warstwice z opisem wysokości na pogrubionych liniach. */
export function createContourLayer(layerOptions, { color = '#9a5b2c', labelColor = '#6e3f1c', halo = 'rgba(246,241,227,.92)' } = {}) {
    const format = new MVT();
    const source = new VectorTileSource({
        format, url: 'msportal-contours://{z}/{x}/{y}', maxZoom: 15,
        tileLoadFunction: (tile) => {
            tile.setLoader(async (extent, resolution, projection) => {
                const [z, x, y] = tile.getTileCoord();
                try {
                    const result = await contourManager().fetchContourTile(z, x, y, { levels: contourLevels(z), contourLayer: 'contours', elevationKey: 'ele', levelKey: 'level', extent: 4096, buffer: 1 }, new AbortController());
                    tile.setFeatures(format.readFeatures(result.arrayBuffer, { extent, featureProjection: projection }));
                } catch { tile.setState(TileState.ERROR); }
            });
        },
    });
    // 19.32.1: od z ≈ 16 (rozdzielczość < 2,4 m/px) warstwice półprzezroczyste — tło dla granic działek, nie konkurencja.
    const faded = `${color}8c`;
    const minor = new Style({ stroke: new Stroke({ color, width: 0.8 }) });
    const minorFaded = new Style({ stroke: new Stroke({ color: faded, width: 0.7 }) });
    const cache = new Map();
    const style = (feature, resolution) => {
        const fade = resolution < 2.4;
        if (Number(feature.get('level')) < 1) return fade ? minorFaded : minor;
        const ele = Math.round(Number(feature.get('ele')));
        const key = `${ele}|${fade}`;
        if (!cache.has(key)) {
            cache.set(key, new Style({
                stroke: new Stroke({ color: fade ? faded : color, width: fade ? 1.2 : 1.6 }),
                text: new Text({ text: `${ele} m`, placement: 'line', font: 'italic 600 10.5px Inter, system-ui, sans-serif', fill: new Fill({ color: labelColor }), stroke: new Stroke({ color: halo, width: 3 }) }),
            }));
        }
        return cache.get(key);
    };
    const layer = new VectorTileLayer({ ...layerOptions, source, style, declutter: true, renderBuffer: 64 });
    acquireContourManager();
    // OpenLayers nie wysyła zdarzenia przy dispose() — zwolnienie menedżera modelu wpinamy w samo dispose().
    const disposeLayer = layer.dispose.bind(layer);
    let released = false;
    layer.dispose = () => { if (!released) { released = true; releaseContourManager(); } disposeLayer(); };
    return layer;
}
