import VectorTileLayer from 'ol/layer/VectorTile.js';
import LayerGroup from 'ol/layer/Group.js';
import Graticule from 'ol/layer/Graticule.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import Text from 'ol/style/Text.js';
import { applyStyle } from 'ol-mapbox-style';
import { buildVectorStyle, styleBackgroundColor, OPENFREEMAP_ATTRIBUTION } from '../../../basemaps/vectorStyles.js';
import { createContourLayer, createReliefLayers, TERRARIUM_ATTRIBUTION } from './demAdapter.js';
import { toBaseLayerOptions } from './layerOptions.js';

/** Czeka, aż wczyta się kilka kafli; odrzuca, gdy żaden kafel nie przyszedł w czasie. */
function tilesLoadedWaiter(source, { minLoaded = 2, timeoutMs = 20000 } = {}) {
    return (signal) => new Promise((resolve, reject) => {
        let loaded = 0, failed = 0, settled = false;
        const finish = (fn) => { if (settled) return; settled = true; source.un('tileloadend', onEnd); source.un('tileloaderror', onError); window.clearTimeout(timer); signal?.removeEventListener('abort', onAbort); fn(); };
        const onEnd = () => { if (++loaded >= minLoaded) finish(resolve); };
        const onError = () => { if (++failed >= 8 && loaded === 0) finish(() => reject(new Error('Kafle mapy wektorowej nie odpowiadają.'))); };
        const onAbort = () => finish(() => reject(new DOMException('Przerwano.', 'AbortError')));
        const timer = window.setTimeout(() => finish(loaded > 0 ? resolve : () => reject(new Error('Mapa wektorowa nie wczytała się w czasie.'))), timeoutMs);
        source.on('tileloadend', onEnd); source.on('tileloaderror', onError);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * 19.30.0 — podkład wektorowy OpenStreetMap (OpenFreeMap) z paletą msportalu.
 * Wariant „kartograficzny” to grupa: mapa + cieniowanie + warstwice + siatka współrzędnych.
 */
export async function createVectorStyleLayer(definition, source, signal) {
    const style = await buildVectorStyle(source.variant, { baseUrl: source.styleUrl, signal });
    const base = toBaseLayerOptions(definition);
    // 19.30.1: tło stylu ustawiamy wprost. ol-mapbox-style rozpoznaje warstwę po klasie z pakietu „ol”,
    // a u nas to nakładki na pełny build — tło nie powstawało i pola, łąki itp. pokazywały szare tło mapy
    // (wyglądało to jak niewczytane fragmenty).
    const background = styleBackgroundColor(style) ?? undefined;
    const vector = new VectorTileLayer({ declutter: true, preload: 0, background, ...(source.variant === 'kartograficzny' ? {} : base) });
    // webfonts: bez pobierania fontów z CDN — napisy czcionką portalu (Inter).
    await applyStyle(vector, style, { webfonts: 'data:text/css,' });
    if (background && typeof vector.setBackground === 'function' && !vector.getBackground?.()) vector.setBackground(background);
    const vectorSource = vector.getSource();
    vectorSource?.setAttributions(OPENFREEMAP_ATTRIBUTION);
    if (source.variant !== 'kartograficzny') return { layer: vector, source: vectorSource, dispose: () => vector.dispose() };

    // 19.31.1: mocniejsza rzeźba — barwy wysokości i cieniowanie ×4 w jednym obrazie (mnożonym z mapą),
    // gęstsze i ciemniejsze warstwice od z10.
    const [hillshade, hillshadeNear] = createReliefLayers();
    const contours = createContourLayer({ maxZoom: 19, minZoom: 10 });
    const grid = new Graticule({
        // 19.32.1: siatka tylko do ok. 1:20 000 — bliżej jej niebieskie linie myliły się z granicami działek.
        showLabels: true, wrapX: false, targetSize: 140, maxZoom: 14.5,
        strokeStyle: new Stroke({ color: 'rgba(74,127,181,.55)', width: 0.7 }),
        lonLabelStyle: new Text({ font: '500 10px Inter, system-ui, sans-serif', textBaseline: 'bottom', fill: new Fill({ color: '#2c5f93' }), stroke: new Stroke({ color: 'rgba(246,241,227,.95)', width: 3 }) }),
        latLabelStyle: new Text({ font: '500 10px Inter, system-ui, sans-serif', textAlign: 'end', fill: new Fill({ color: '#2c5f93' }), stroke: new Stroke({ color: 'rgba(246,241,227,.95)', width: 3 }) }),
    });
    hillshade.getSource()?.setAttributions(TERRARIUM_ATTRIBUTION);
    const group = new LayerGroup({ ...base, layers: [vector, hillshade, hillshadeNear, contours, grid] });
    // 19.31.0: grupa nie zwalnia warstw podrzędnych sama — każdą zwalniamy jawnie (warstwice oddają też model wysokości).
    const dispose = () => { for (const child of [vector, hillshade, hillshadeNear, contours, grid]) child.dispose(); group.dispose(); };
    return { layer: group, source: vectorSource, dispose };
}

export { tilesLoadedWaiter };
