import { dataCatalog } from '../data/catalog/index.js';
import { createWmsLayer } from '../data/sources/adapters/wmsAdapter.js';
import { usesDirectTransport } from '../data/sources/adapters/wmsTransport.js';
import { toLonLat } from 'ol/proj.js';

/**
 * 19.35.0 — eksport „jak na ekranie”: PNG składany w przeglądarce z płócien mapy.
 *
 * Obraz jest dokładnie tym, co widać na mapie (także podkłady Pastel / Zmierzch / Karto, rzeźba, narzędzia),
 * w rozdzielczości ekranu ×1, ×2 albo ×3. Skala jest robiona jak na ekranie o większej gęstości pikseli
 * (pixelRatio mapy), więc linie i napisy mają te same proporcje co na ekranie — nie są cieńsze.
 *
 * Warstwy WMS pobierane przez przeglądarkę wprost z serwerów GUGiK (bez CORS) „brudzą” płótno i przeglądarka
 * nie pozwala go zapisać. Na czas eksportu zastępujemy je bliźniaczymi warstwami przez własne proxy portalu
 * (./api/wms.php — ta sama domena), a po zapisie przywracamy oryginały.
 */
const DEFINITIONS = new Map(dataCatalog.layers.map((definition) => [definition.id, definition]));
const RENDER_TIMEOUT_MS = 45000;

function waitForRender(map, timeoutMs) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (complete) => { if (done) return; done = true; window.clearTimeout(timer); map.un('rendercomplete', onComplete); resolve(complete); };
        const onComplete = () => finish(true);
        const timer = window.setTimeout(() => finish(false), timeoutMs);
        map.on('rendercomplete', onComplete);
        map.render();
    });
}

/** Warstwy WMS z transportem bezpośrednim zamienione na czas eksportu warstwami przez proxy. */
function swapDirectWms(map) {
    const swaps = [];
    for (const layer of map.getAllLayers()) {
        if (!layer.getVisible()) continue;
        const definition = DEFINITIONS.get(layer.get('catalogId'));
        if (!definition || definition.source?.kind !== 'wms' || !usesDirectTransport(definition.source)) continue;
        const twin = createWmsLayer(definition, { ...definition.source, transport: 'proxy' });
        twin.setVisible(true); // definicja z katalogu ma visible:false (domyślnie wyłączona) — bliźniak musi być widoczny
        twin.setZIndex(layer.getZIndex());
        twin.setOpacity(layer.getOpacity());
        twin.setMinZoom(layer.getMinZoom());
        twin.setMaxZoom(layer.getMaxZoom());
        twin.set('mapownikRole', 'screen-export-twin');
        map.addLayer(twin);
        layer.setVisible(false);
        swaps.push({ layer, twin });
    }
    return () => { for (const { layer, twin } of swaps) { map.removeLayer(twin); twin.dispose(); layer.setVisible(true); } };
}

function parseMatrix(transform) {
    const match = /^matrix\(([^)]*)\)$/.exec(transform || '');
    return match ? match[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
}

/** Płótna warstw w kolejności rysowania → jeden obraz w pikselach eksportu. */
export function composeCanvases(map, scale) {
    const [width, height] = map.getSize();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const layerCanvas of map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer')) {
        if (!layerCanvas.width || !layerCanvas.height) continue;
        const container = layerCanvas.parentNode;
        const opacity = layerCanvas.style.opacity || container?.style?.opacity || '';
        context.globalAlpha = opacity === '' ? 1 : Number(opacity);
        const background = container?.style?.backgroundColor;
        const [a, b, c, d, e, f] = parseMatrix(layerCanvas.style.transform);
        if (background) { context.setTransform(1, 0, 0, 1, 0, 0); context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
        context.setTransform(a * scale, b * scale, c * scale, d * scale, e * scale, f * scale);
        context.drawImage(layerCanvas, 0, 0);
    }
    context.globalAlpha = 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
    return canvas;
}

function niceLength(meters) {
    const power = 10 ** Math.floor(Math.log10(meters));
    const n = meters / power;
    return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * power;
}

/** Pasek pod mapą: podziałka, skala, data i lista warstw. */
function withFooter(mapCanvas, map, scale, titles) {
    const view = map.getView();
    const center = toLonLat(view.getCenter());
    const ground = view.getResolution() * Math.cos(center[1] * Math.PI / 180); // m na piksel CSS
    const denominator = ground / 0.00028;
    const roundTo = denominator > 50000 ? 5000 : denominator > 5000 ? 500 : 50;
    const scaleText = `skala ok. 1:${(Math.round(denominator / roundTo) * roundTo).toLocaleString('pl-PL')}`;
    const barMeters = niceLength(ground * 120);
    const barPx = (barMeters / ground) * scale;
    const footerHeight = Math.round(44 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = mapCanvas.width;
    canvas.height = mapCanvas.height + footerHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(mapCanvas, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, mapCanvas.height, canvas.width, footerHeight);
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(0, mapCanvas.height, canvas.width, Math.max(1, scale));
    const y0 = mapCanvas.height;
    const pad = 12 * scale;
    // podziałka
    ctx.fillStyle = '#111827';
    ctx.fillRect(pad, y0 + 14 * scale, barPx, 3 * scale);
    ctx.fillRect(pad, y0 + 9 * scale, scale, 13 * scale);
    ctx.fillRect(pad + barPx - scale, y0 + 9 * scale, scale, 13 * scale);
    ctx.font = `600 ${11 * scale}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    const barLabel = barMeters >= 1000 ? `${barMeters / 1000} km` : `${barMeters} m`;
    ctx.fillText(barLabel, pad, y0 + 36 * scale);
    const textX = pad + Math.max(barPx, ctx.measureText(barLabel).width) + 16 * scale;
    ctx.fillText(`Mapownik · ${scaleText} · ${new Date().toLocaleDateString('pl-PL')}`, textX, y0 + 18 * scale);
    ctx.font = `400 ${10 * scale}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#4b5563';
    let layersText = titles.length ? `Warstwy: ${titles.join(', ')}` : 'Podkład mapy';
    const maxWidth = canvas.width - textX - pad;
    while (layersText.length > 20 && ctx.measureText(layersText).width > maxWidth) layersText = `${layersText.slice(0, -12)}…`;
    ctx.fillText(layersText, textX, y0 + 34 * scale);
    return canvas;
}

/**
 * Składa i zwraca PNG (Blob) bieżącego widoku mapy. scale: 1 | 2 | 3. footer: pasek ze skalą i warstwami.
 * Rzuca błąd z opisem po polsku, gdy przeglądarka nie pozwala zapisać obrazu.
 */
export async function exportScreenPng(map, { scale = 2, footer = true, onPhase = () => {} } = {}) {
    if (!map?.getSize()) throw new Error('Mapa nie jest gotowa.');
    const previousRatio = map.pixelRatio_;
    // Lista warstw do paska — przed podmianą na bliźniacze i tylko te, które przy tej skali są rysowane.
    const view = map.getView();
    const titles = [...new Set(map.getAllLayers().filter((l) => l.get('catalogTitle') && (typeof l.isVisible === 'function' ? l.isVisible(view) : l.getVisible())).map((l) => l.get('catalogTitle')))];
    const restoreLayers = swapDirectWms(map);
    let complete = false;
    try {
        onPhase('render');
        map.pixelRatio_ = scale;
        map.updateSize();
        complete = await waitForRender(map, RENDER_TIMEOUT_MS);
        onPhase('compose');
        let canvas = composeCanvases(map, scale);
        if (footer) canvas = withFooter(canvas, map, scale, titles);
        const blob = await new Promise((resolve, reject) => {
            try { canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Nie udało się zapisać obrazu.'))), 'image/png'); }
            catch (error) { reject(error); }
        });
        return { blob, complete, width: canvas.width, height: canvas.height };
    } catch (error) {
        if (error?.name === 'SecurityError') throw new Error('Przeglądarka nie pozwala zapisać obrazu z jednej z włączonych warstw (brak zgody serwera źródła). Wyłącz ją albo użyj eksportu z serwera poniżej.');
        throw error;
    } finally {
        map.pixelRatio_ = previousRatio;
        restoreLayers();
        map.updateSize();
        map.render();
    }
}
