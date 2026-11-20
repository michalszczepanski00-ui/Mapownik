import WMTSCapabilities from 'ol/format/WMTSCapabilities.js';
import TileLayer from 'ol/layer/Tile.js';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS.js';
import { toBaseLayerOptions } from './layerOptions.js';
import { tileLayerCacheSize, tileLayerPreload } from './tileLayerPolicy.js';
import { t } from '../../../i18n/index.js';
export async function createWmtsCapabilitiesLayer(definition, source, signal) {
    var _a;
    const response = await fetch(source.capabilitiesUrl, {
        method: 'GET',
        signal,
        headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' },
    });
    if (!response.ok) {
        throw new Error(`WMTS GetCapabilities HTTP ${response.status} dla ${definition.id}`);
    }
    const capabilitiesText = await response.text();
    const parser = new WMTSCapabilities();
    const capabilities = parser.read(capabilitiesText);
    const options = optionsFromCapabilities(capabilities, {
        layer: source.layer,
        matrixSet: source.matrixSet,
        style: source.style,
        format: source.format,
    });
    if (!options) {
        throw new Error(t('sources.nieMoznaUtworzycKonfiguracjiWmts', { id: definition.id }));
    }
    return new TileLayer({
        ...toBaseLayerOptions(definition),
        preload: tileLayerPreload(definition, source),
        cacheSize: tileLayerCacheSize(definition, source),
        source: new WMTS({
            ...options,
            attributions: (_a = definition.attribution) === null || _a === void 0 ? void 0 : _a.label,
            crossOrigin: 'anonymous',
        }),
    });
}
