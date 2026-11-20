import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import VectorLayer from 'ol/layer/Vector.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import Text from 'ol/style/Text.js';
import CircleStyle from 'ol/style/Circle.js';
import { getCenter, getHeight, getWidth } from 'ol/extent.js';
import { toLonLat, transform } from 'ol/proj.js';
import { dataCatalog } from '../data/catalog/index.js';
import { createWmsLayer } from '../data/sources/adapters/wmsAdapter.js';
import { createXyzLayer } from '../data/sources/adapters/xyzAdapter.js';
import { createVectorStyleLayer } from '../data/sources/adapters/vectorStyleAdapter.js';
import { composeCanvases } from '../export/screenExport.js';

/**
 * 19.36.0 — mapy do raportu PDF. Każda mapa powstaje na osobnej, niewidocznej mapie OpenLayers
 * (widok użytkownika się nie zmienia). Usługi WMS idą przez proxy portalu (ta sama domena),
 * dlatego obraz można zapisać. Wynik: JPEG + metry na piksel (podziałka w PDF).
 */
const DEF = new globalThis.Map(dataCatalog.layers.map((d) => [d.id, d]));
const CSS_W = 1000;
const PIXEL_RATIO = 2;
const RENDER_TIMEOUT_MS = 40000;

const bufferExtent = (e, v) => [e[0] - v, e[1] - v, e[2] + v, e[3] + v];


async function basemapLayer(id, signal) {
    if (id === 'orto') {
        // 19.37.1: kafle WMTS StandardResolution (CORS: *) — działają w każdej skali. WMS HighResolution zwracał
        // dla części kraju białe obrazy (np. Witankowo, gm. Wałcz).
        const def = DEF.get('basemap.orthophoto');
        const source = new XYZ({ url: def.source.standardUrl, crossOrigin: 'anonymous', maxZoom: 19, transition: 0, wrapX: false });
        // 19.38.0: pojedyncze kafle GUGiK bywają wysyłane bez nagłówka CORS — druga próba innym adresem (bez kopii z pamięci).
        source.setTileLoadFunction((tile, src) => {
            const img = tile.getImage();
            const load = (url) => fetch(url, { mode: 'cors' }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
            load(src).catch(() => load(`${src}&_mapownik=${Date.now()}`))
                .then((blob) => { const url = URL.createObjectURL(blob); img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true }); img.src = url; })
                .catch(() => { img.src = src; });
        });
        return { layer: new TileLayer({ zIndex: -100, source }) };
    }
    if (id === 'topo') { const def = DEF.get('basemap.topography'); return { layer: createWmsLayer({ ...def, opacity: 1 }, { ...def.source, transport: 'proxy', tiled: false }) }; }
    if (id === 'karto') { const def = DEF.get('basemap.vector.kartograficzny'); const handle = await createVectorStyleLayer(def, def.source, signal); return handle; }
    const def = DEF.get('basemap.osm');
    return { layer: createXyzLayer({ ...def, opacity: 1 }, def.source) };
}

/** Czy obraz jest w całości przezroczysty (KIEG przy „zimnym” serwerze powiatu zwraca pusty PNG). */
async function isBlank(blob) {
    try {
        const bitmap = await createImageBitmap(blob);
        const c = document.createElement('canvas'); c.width = 64; c.height = 32;
        const ctx = c.getContext('2d'); ctx.drawImage(bitmap, 0, 0, 64, 32); bitmap.close?.();
        const data = ctx.getImageData(0, 0, 64, 32).data;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return false;
        return true;
    } catch { return false; }
}

/** Ładowanie obrazu WMS z ponowieniem pustej odpowiedzi (do 3 prób, co 2 s). */
function retryingImageLoad(image, src, retryBlank, signal, warn) {
    const img = image.getImage();
    (async () => {
        let blob = null;
        let diagnostic = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (attempt) await new Promise((r) => window.setTimeout(r, 2000));
            if (signal?.aborted) return;
            try {
                const response = await fetch(src, { signal, cache: attempt ? 'reload' : 'default' });
                if (!response.ok) continue;
                blob = await response.blob();
                const cache = response.headers.get('X-MSPortal-Cache');
                diagnostic = response.headers.get('X-MSPortal-Partial') === '1' ? 'częściowa odpowiedź WMS'
                    : cache === 'FALLBACK' ? 'źródło WMS niedostępne'
                    : cache === 'STALE' ? 'starsza kopia WMS' : null;
                if (!retryBlank || !(await isBlank(blob))) break;
            } catch { blob = null; }
        }
        if (signal?.aborted) return;
        if (!blob) { warn('brak potwierdzonej odpowiedzi WMS'); img.src = src; return; }
        if (diagnostic) warn(diagnostic);
        const url = URL.createObjectURL(blob);
        img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
        img.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
        img.src = url;
    })();
}

// 19.38.0: nakładki raportu — katalog, krycie, kolejność.
const OVERLAYS = {
    kieg: ['overlay.dzialki', 1, 50],
    pog: ['overlay.pog.zones', 0.62, 40],
    kiut: ['overlay.utilities.all', 1, 60],
    natura: ['overlay.natura2000', 0.55, 30],
    gdos: ['overlay.gdos.protection', 0.5, 31],
    // 19.40.0: nakładki mapy środowiska (źródła proxy bez pozycji w katalogu warstw).
    flood: ['report.flood', 0.6, 25],
    forest: ['report.forest', 0.55, 20],
    water: ['report.water', 0.8, 22],
};
const REPORT_DEFS = {
    'report.flood': { id: 'report.flood', title: 'Zagrożenie powodziowe (ISOK)', role: 'overlay', attribution: { label: 'Wody Polskie — ISOK' }, source: { kind: 'wms', url: './api/wms.php?source=flood_isok', transport: 'proxy', layers: 'NZ.Fluvial,NZ.SeaWater', version: '1.3.0', format: 'image/png', transparent: true, tiled: false } },
    'report.forest': { id: 'report.forest', title: 'Lasy (BDOT10k)', role: 'overlay', attribution: { label: 'GUGiK — BDOT10k' }, source: { kind: 'wms', url: './api/wms.php?source=bdot10k_forest', transport: 'proxy', layers: 'TLes', version: '1.1.1', format: 'image/png', transparent: true, tiled: false } },
    'report.water': { id: 'report.water', title: 'Wody (BDOT10k)', role: 'overlay', attribution: { label: 'GUGiK — BDOT10k' }, source: { kind: 'wms', url: './api/wms.php?source=bdot10k_water', transport: 'proxy', layers: 'WPow,rz,kan,row', version: '1.1.1', format: 'image/png', transparent: true, tiled: false } },
};

function overlayLayer(id, signal, warnings) {
    const [defId, opacity, zIndex] = OVERLAYS[id] ?? [];
    const def = DEF.get(defId) ?? REPORT_DEFS[defId];
    if (!def) return null;
    const layer = createWmsLayer({ ...def, minZoom: undefined, maxZoom: undefined, opacity, zIndex }, { ...def.source, transport: 'proxy', tiled: false });
    layer.getSource()?.setImageLoadFunction?.((image, src) => retryingImageLoad(image, src, id === 'kieg', signal, message => warnings.add(def.title + ' — ' + message)));
    layer.setVisible(true);
    return layer;
}

/** Działka z ULDK (EPSG:2180, {type, coordinates}) → geometria OL w EPSG:3857. */
export function parcelGeometry3857(geometry) {
    const geom = geometry.type === 'Polygon' ? new Polygon(geometry.coordinates) : new MultiPolygon(geometry.coordinates);
    geom.transform('EPSG:2180', 'EPSG:3857');
    return geom;
}

function circle2180(center, radius) {
    const ring = [];
    for (let i = 0; i <= 72; i += 1) { const a = (i / 72) * Math.PI * 2; ring.push([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius]); }
    return new Polygon([ring]).transform('EPSG:2180', 'EPSG:3857');
}

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Liczy wczytywane kafle i obrazy wszystkich warstw mapy (także w grupach). */
function trackLoading(map) {
    const state = { failed: false, pending: 0, last: Date.now() };
    const off = [];
    for (const layer of map.getAllLayers()) {
        const source = layer.getSource?.();
        if (!source?.on) continue;
        for (const [type, delta] of [['tileloadstart', 1], ['tileloadend', -1], ['tileloaderror', -1], ['imageloadstart', 1], ['imageloadend', -1], ['imageloaderror', -1]]) {
            const fn = () => { if (type.endsWith('error')) state.failed = true; state.pending = Math.max(0, state.pending + delta); state.last = Date.now(); };
            source.on(type, fn);
            off.push(() => source.un(type, fn));
        }
    }
    state.dispose = () => off.forEach((fn) => fn());
    return state;
}

/**
 * 19.37.1 — rysowanie bez requestAnimationFrame. Przeglądarka wstrzymuje animacje w karcie w tle
 * (np. gdy otworzy się nowa karta z PDF albo użytkownik przełączy kartę) i wtedy zdarzenie
 * „rendercomplete” nigdy nie przychodziło — mapy w raporcie były białe. Teraz rysujemy sami
 * (renderSync) co 200 ms, aż wszystkie kafle i obrazy się wczytają, a potem jeszcze kilka razy
 * (płynne pojawianie się kafli zależy od upływu czasu).
 */
async function renderUntilLoaded(map, signal) {
    const tracker = trackLoading(map);
    const start = Date.now();
    let quiet = 0;
    try {
        while (Date.now() - start < RENDER_TIMEOUT_MS) {
            if (signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
            map.renderSync();
            await sleep(200);
            const idle = tracker.pending === 0 && Date.now() - tracker.last > 350 && Date.now() - start > 700;
            quiet = idle ? quiet + 1 : 0;
            if (quiet >= 2) break;
        }
        for (let i = 0; i < 3; i += 1) { await sleep(180); map.renderSync(); }
        return tracker.pending === 0 && !tracker.failed;
    } finally { tracker.dispose(); }
}

/**
 * Rysuje mapę i zwraca { dataUrl, widthPx, heightPx, metersPerPx, complete }.
 * opts: geometry (2180), basemap, overlays ['kieg'|'pog'], aspect (wys./szer.), radius (m) i center2180 — mapa otoczenia,
 * points [{x, y, color}], label — numer działki na mapie.
 */
export async function renderReportMap(opts, signal) {
    const cssW = opts.cssWidth ?? CSS_W;
    const cssH = Math.round(cssW * (opts.aspect ?? 0.56));
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:-${cssW + 4000}px;top:0;width:${cssW}px;height:${cssH}px;pointer-events:none;`;
    document.body.appendChild(host);
    const disposers = [];
    const warnings = new Set();
    let map = null;
    try {
        const parcel = parcelGeometry3857(opts.geometry);
        const base = await basemapLayer(opts.basemap, signal);
        base.layer.setVisible(true);
        if (base.dispose) disposers.push(base.dispose); else disposers.push(() => base.layer.dispose());
        const layers = [base.layer];
        for (const id of opts.overlays ?? []) { const layer = overlayLayer(id, signal, warnings); if (layer) { layers.push(layer); disposers.push(() => layer.dispose()); } }

        const source = new VectorSource();
        const dark = opts.basemap === 'orto';
        if (opts.radius && opts.center2180) {
            const ring = new Feature(circle2180(opts.center2180, opts.radius));
            ring.setStyle(new Style({ stroke: new Stroke({ color: dark ? 'rgba(255,255,255,.95)' : 'rgba(46,107,63,.9)', width: 2, lineDash: [8, 6] }) }));
            source.addFeature(ring);
        }
        for (const p of opts.points ?? []) {
            const f = new Feature(new Point(transform([p.x, p.y], 'EPSG:2180', 'EPSG:3857')));
            f.setStyle([new Style({ image: new CircleStyle({ radius: (p.size ?? 7) + 1.6, fill: new Fill({ color: 'rgba(20,24,22,.55)' }) }), zIndex: p.z ?? 1 }), new Style({ image: new CircleStyle({ radius: p.size ?? 7, fill: new Fill({ color: p.color }), stroke: new Stroke({ color: '#ffffff', width: 1.8 }) }), zIndex: p.z ?? 1 })]);
            source.addFeature(f);
        }
        // 19.40.0: linie pomocnicze (np. największy prostokąt w terenie), współrzędne EPSG:2180.
        for (const line of opts.lines ?? []) {
            const f = new Feature(new LineString(line.coords).transform('EPSG:2180', 'EPSG:3857'));
            f.setStyle([new Style({ stroke: new Stroke({ color: 'rgba(20,24,22,.7)', width: (line.width ?? 2) + 2.5 }), zIndex: 5 }), new Style({ stroke: new Stroke({ color: line.color ?? '#ffd400', width: line.width ?? 2, lineDash: line.dash }), zIndex: 6 })]);
            source.addFeature(f);
        }
        const outline = new Feature(parcel);
        outline.setStyle([
            new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,.9)', width: 6 }) }),
            new Style({
                stroke: new Stroke({ color: '#e8432e', width: 3 }), fill: new Fill({ color: opts.radius || opts.marker ? 'rgba(232,67,46,.38)' : 'rgba(232,67,46,.08)' }),
                text: opts.label ? new Text({ text: opts.label, font: `700 ${opts.labelSize ?? 22}px Inter, system-ui, sans-serif`, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: 'rgba(20,24,22,.85)', width: 4 }), overflow: true }) : undefined,
            }),
        ]);
        source.addFeature(outline);
        if (opts.marker) {
            // Mapa położenia: działka bywa tu kilkupikselowa — wyraźny pierścień wokół niej.
            const ring = new Feature(new Point(getCenter(parcel.getExtent())));
            ring.setStyle([new Style({ image: new CircleStyle({ radius: 15, stroke: new Stroke({ color: 'rgba(255,255,255,.95)', width: 6 }) }) }), new Style({ image: new CircleStyle({ radius: 15, stroke: new Stroke({ color: '#e8432e', width: 3 }) }) })]);
            source.addFeature(ring);
        }
        const vector = new VectorLayer({ source, zIndex: 1000 });
        layers.push(vector);
        disposers.push(() => vector.dispose());

        map = new Map({ target: host, layers, controls: [], interactions: [], pixelRatio: PIXEL_RATIO, view: new View({ projection: 'EPSG:3857', maxZoom: 22 }) });
        let extent;
        if (opts.radius && opts.center2180) {
            extent = circle2180(opts.center2180, opts.radius * 1.08).getExtent();
        } else {
            extent = parcel.getExtent();
            const lat = toLonLat(getCenter(extent))[1];
            const minSpan = (opts.minSpanM ?? 110) / Math.cos((lat * Math.PI) / 180);
            const pad = Math.max(getWidth(extent), getHeight(extent)) * (opts.padRatio ?? 0.2);
            extent = bufferExtent(extent, Math.max(pad, (minSpan - Math.max(getWidth(extent), getHeight(extent))) / 2));
        }
        map.getView().fit(extent, { size: [cssW, cssH], nearest: false });
        if (opts.maxZoom) map.getView().setZoom(Math.min(map.getView().getZoom(), opts.maxZoom));
        const complete = await renderUntilLoaded(map, signal);
        if (signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
        const canvas = composeCanvases(map, PIXEL_RATIO);
        const view = map.getView();
        const lat = toLonLat(view.getCenter())[1];
        const metersPerPx = (view.getResolution() * Math.cos((lat * Math.PI) / 180)) / PIXEL_RATIO;
        let dataUrl;
        try { dataUrl = canvas.toDataURL('image/jpeg', 0.84); }
        catch { throw new Error('Przeglądarka nie pozwoliła zapisać obrazu mapy (źródło bez zgody CORS).'); }
        if (!complete) warnings.add('Nie udało się potwierdzić wczytania wszystkich obrazów mapy.');
        return { dataUrl, warning: [...warnings].join('; '), widthPx: canvas.width, heightPx: canvas.height, metersPerPx, complete: complete && !warnings.size };
    } finally {
        // Najpierw odpinamy warstwy: obraz WMS, który dojdzie po zamknięciu mapy, nie może już wywołać rysowania.
        try { map?.getLayers().clear(); map?.setTarget(undefined); } catch { /* nic */ }
        // Renderer kafli OpenLayers kończy kolejkę w odroczonym wywołaniu — warstwy zwalniamy chwilę później.
        await sleep(600);
        try { map?.dispose(); } catch { /* nic */ }
        for (const dispose of disposers) { try { dispose(); } catch { /* nic */ } }
        host.remove();
    }
}
