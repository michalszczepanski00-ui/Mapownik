import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import { toBaseLayerOptions } from './layerOptions.js';
import { observeTileSource } from './sourceTelemetry.js';
import { attachResilientTileSource } from '../resilience/resilientLoaders.js';
import { tileLayerCacheSize, tileLayerPreload } from './tileLayerPolicy.js';

const WEB_MERCATOR_HALF_WORLD = 20037508.342789244;

function fillTemplate(template, z, x, y) {
    return template.replaceAll('{z}', String(z)).replaceAll('{x}', String(x)).replaceAll('{y}', String(y));
}
function parseTileAddress(src) {
    try {
        const url = new URL(src, window.location.href);
        const matrix = url.searchParams.get('TILEMATRIX') ?? url.searchParams.get('tileMatrix');
        const row = url.searchParams.get('TILEROW') ?? url.searchParams.get('tileRow');
        const col = url.searchParams.get('TILECOL') ?? url.searchParams.get('tileCol');
        const z = Number(String(matrix ?? '').split(':').pop());
        const y = Number(row);
        const x = Number(col);
        if (![z, x, y].every(Number.isFinite)) return null;
        return { z, x, y };
    } catch { return null; }
}
function buildWmsFallbackUrl(baseUrl, src, tileSize) {
    const tile = parseTileAddress(src);
    if (!tile) return null;
    return buildWmsTileUrl(baseUrl, tile, tileSize);
}
/** Kafel siatki XYZ (EPSG:3857) jako zapytanie WMS GetMap przez proxy portalu. */
function buildWmsTileUrl(baseUrl, tile, tileSize) {
    const n = 2 ** tile.z;
    const span = (2 * WEB_MERCATOR_HALF_WORLD) / n;
    const minX = -WEB_MERCATOR_HALF_WORLD + tile.x * span;
    const maxX = minX + span;
    const maxY = WEB_MERCATOR_HALF_WORLD - tile.y * span;
    const minY = maxY - span;
    const url = new URL(baseUrl, window.location.href);
    url.searchParams.set('BBOX', [minX, minY, maxX, maxY].join(','));
    url.searchParams.set('WIDTH', String(tileSize));
    url.searchParams.set('HEIGHT', String(tileSize));
    url.searchParams.set('SRS', 'EPSG:3857');
    return url.toString();
}

/** Fast WMTS with validated fallbacks and a per-source resilience policy. */
export function createFastWmtsLayer(definition, source) {
    const standardTemplate = source.standardUrl;
    const highTemplate = source.highResolutionUrl ?? null;
    // 19.18.0: GUGiK usunął EPSG:3857 z WMTS wysokiej rozdzielczości, a zwykły WMTS kończy się
    // na poziomie 19. Od `switchZoom` kafle idą z WMS HighResolution przez proxy (EPSG:3857 działa).
    const highWmsUrl = source.highResolutionWmsUrl ?? null;
    const fallbackWmsUrl = source.fallbackWmsUrl ?? null;
    const switchZoom = source.switchZoom ?? 18;
    const tileSize = source.tileSize ?? 256;
    const standardBase = standardTemplate.split('?')[0];
    const highBase = highTemplate?.split('?')[0] ?? null;

    const xyz = new XYZ({
        url: standardTemplate,
        maxZoom: source.maxZoom ?? 23,
        tileSize,
        transition: source.transition ?? 120,
        wrapX: false,
        // 19.37.1: GUGiK WMTS wysyła Access-Control-Allow-Origin: * — z crossOrigin obraz mapy da się zapisać (eksport PNG).
        crossOrigin: 'anonymous',
        attributions: definition.attribution?.label,
    });
    const telemetry = observeTileSource(xyz, 'WMTS Standard');

    xyz.setTileUrlFunction((tileCoord) => {
        if (!tileCoord) return undefined;
        const [z, x, y] = tileCoord;
        if (highWmsUrl && z >= switchZoom) return buildWmsTileUrl(highWmsUrl, { z, x, y }, tileSize);
        const template = highTemplate && z >= switchZoom ? highTemplate : standardTemplate;
        return fillTemplate(template, z, x, y);
    });

    const resilience = attachResilientTileSource(xyz, telemetry, {
        sourceId: definition.id,
        transport: 'WMTS Standard',
        crossOrigin: 'anonymous',
        timeoutMs: 8000,
        minDimension: 32,
        candidatesFor(src) {
            const candidates = [];
            const isHigh = Boolean(highBase && src.startsWith(highBase));
            if (highWmsUrl && src.includes(highWmsUrl.replace(/^\.\//, ''))) {
                // Kafel HD z WMS; w razie błędu — najbliższy poziom zwykłego WMTS rozciągnięty
                // przez OpenLayers nie jest dostępny tą drogą, więc druga próba to ten sam WMS.
                return [{ url: src, transport: 'WMS HD', retries: 1, retryDelays: [800], timeoutMs: 15000 }];
            }
            if (isHigh) {
                candidates.push({ url: src, transport: 'WMTS HD', retries: 0 });
                candidates.push({
                    url: src.replace(highBase, standardBase),
                    transport: 'WMTS Standard',
                    fallbackKind: 'standard',
                    retries: 1,
                    retryDelays: [500],
                });
            } else {
                candidates.push({ url: src, transport: 'WMTS Standard', retries: 1, retryDelays: [500] });
            }
            if (fallbackWmsUrl) {
                const wms = buildWmsFallbackUrl(fallbackWmsUrl, src, tileSize);
                if (wms) candidates.push({
                    url: wms,
                    transport: 'WMS fallback',
                    fallbackKind: 'wms',
                    retries: 1,
                    retryDelays: [800],
                    timeoutMs: 12000,
                });
            }
            return candidates;
        },
    });

    const layer = new TileLayer({
        ...toBaseLayerOptions(definition),
        preload: tileLayerPreload(definition, source),
        cacheSize: tileLayerCacheSize(definition, source),
        source: xyz,
    });
    return {
        layer,
        telemetry,
        cancelPending: resilience.cancelPending,
        dispose() {
            resilience.dispose();
            telemetry.dispose();
        },
    };
}
