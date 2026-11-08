import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import { toBaseLayerOptions } from './layerOptions.js';
import { tileLayerCacheSize, tileLayerPreload } from './tileLayerPolicy.js';
export function createXyzLayer(definition, source) {
    var _a;
    return new TileLayer({
        ...toBaseLayerOptions(definition),
        preload: tileLayerPreload(definition, source),
        cacheSize: tileLayerCacheSize(definition, source),
        source: new XYZ({
            url: source.url,
            maxZoom: source.maxZoom,
            tileSize: source.tileSize,
            crossOrigin: source.crossOrigin,
            transition: source.transition ?? 150,
            attributions: (_a = definition.attribution) === null || _a === void 0 ? void 0 : _a.label,
        }),
    });
}
