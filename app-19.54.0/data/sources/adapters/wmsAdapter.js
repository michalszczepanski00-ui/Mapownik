import ImageLayer from 'ol/layer/Image.js';
import { recordLayerImageCoverage } from '../coverageCache.js';
import TileLayer from 'ol/layer/Tile.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import TileWMS from 'ol/source/TileWMS.js';
import { get as getProjection } from 'ol/proj.js';
import { createXYZ } from 'ol/tilegrid.js';
import { toBaseLayerOptions } from './layerOptions.js';
import { tileLayerCacheSize, tileLayerPreload } from './tileLayerPolicy.js';
import { usesDirectTransport } from './wmsTransport.js';
// Resilience is attached centrally by SourceRegistry via attachResilientTileSource / attachResilientImageSource.
/** Czy obraz ma choć jeden nieprzezroczysty piksel (pomniejszony do 128 px — wystarcza do „są dane”). */
function imageHasPixels(img) {
    const scale = Math.min(1, 128 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)); const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return true;
    return false;
}
function commonParams(source) {
    return {
        LAYERS: source.layers,
        VERSION: source.version,
        FORMAT: source.format,
        TRANSPARENT: source.transparent,
        TILED: source.tiled,
        ...(source.time ? { TIME: source.time } : {}),
    };
}
function tileGridFor(source) {
    const size = Number(source.tileSize);
    if (size !== 512 || source.projection) return undefined;
    const extent = getProjection('EPSG:3857')?.getExtent?.();
    return extent ? createXYZ({ extent, tileSize: 512, maxZoom: 23 }) : undefined;
}
/**
 * WMS overlays normally use cached tiles. Layers whose server-side labels
 * must be unique in the current viewport (notably KIEG parcel numbers) can
 * set tiled:false and are then requested as one ImageWMS image. This avoids
 * the WMS server independently repeating the same label in neighbouring tiles.
 *
 * 17.8.3: with transport direct/direct-then-proxy OpenLayers builds GetMap
 * requests against the upstream service (no crossOrigin → no CORS needed;
 * PNG/PDF export is rendered server-side). Without an explicit projection the
 * request is made in the view projection EPSG:3857, which avoids client-side
 * raster reprojection and keeps tile BBOXes stable for caching.
 */
export function createWmsLayer(definition, source) {
    var _a;
    const direct = usesDirectTransport(source);
    const options = {
        url: direct ? source.directUrl : source.url,
        params: commonParams(source),
        attributions: (_a = definition.attribution) === null || _a === void 0 ? void 0 : _a.label,
        ...(direct ? {} : { crossOrigin: 'anonymous' }),
        ...(source.projection ? { projection: source.projection } : {}),
    };
    // 19.47.0: nakładki bez płynnego przejścia kafli — przy przybliżaniu stare i nowe półprzezroczyste kafle
    // nakładały się (łaty jaśniejszych i ciemniejszych kwadratów). Krycie ustawia warstwa, nie kafel.
    const overlay = definition.role !== 'basemap';
    if (source.tiled === false) {
        const imageSource = new ImageWMS({
            ...options,
            // 19.8.6: opcjonalny zapas wokół widoku (MPZP: 1.25), żeby małe przesunięcie
            // mapy nie wymagało nowego obrazu z wolnej kaskady GUGiK. Domyślnie jak dotąd 1.
            ratio: Number(source.ratio) >= 1 ? Number(source.ratio) : 1,
            hidpi: false,
        });
        // 19.47.0: warstwy planistyczne — czy obraz na mapie zawiera dane (licznik „W widoku” bez osobnej próbki).
        // Tylko obrazy w układzie mapy i z tej samej domeny (serwer pośredniczący); obraz bezpośrednio z usługi
        // jest nieczytelny dla skryptu (CORS) — wtedy panel warstw wysyła zwykłą próbkę.
        if (definition.group === 'Planowanie przestrzenne' && !source.projection) {
            imageSource.on('imageloadend', (event) => {
                try {
                    const img = event.image?.getImage?.();
                    if (!img || !(img.naturalWidth >= 16) || !/^(blob:|data:)/.test(String(img.currentSrc || img.src || ''))) return;
                    recordLayerImageCoverage(definition.id, event.image.getExtent(), imageHasPixels(img) ? 'yes' : 'no');
                } catch { /* obraz nieczytelny — zostaje próbka panelu warstw */ }
            });
        }
        return new ImageLayer({
            ...toBaseLayerOptions(definition),
            source: imageSource,
        });
    }
    const tileGrid = tileGridFor(source);
    return new TileLayer({
        ...toBaseLayerOptions(definition),
        preload: tileLayerPreload(definition, source),
        cacheSize: tileLayerCacheSize(definition, source),
        source: new TileWMS({
            ...options,
            ...(tileGrid ? { tileGrid } : {}),
            transition: overlay ? 0 : (source.transition ?? 150),
            // 19.47.0: margines kafla — napisy z usług WMS nie są ucinane na krawędziach kafli.
            ...(Number(source.gutter) > 0 ? { gutter: Number(source.gutter) } : {}),
            interpolate: source.interpolate ?? true,
        }),
    });
}
