import * as z from 'zod';
const capabilitySchema = z.object({
    identify: z.boolean().default(false),
    selectable: z.boolean().default(false),
    editable: z.boolean().default(false),
});
const attributionSchema = z.object({
    label: z.string().min(1),
    url: z.string().url().optional(),
});
const commonDefinitionShape = {
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9._-]*$/i),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    group: z.string().min(1),
    role: z.enum(['basemap', 'overlay']).default('overlay'),
    visible: z.boolean().default(false),
    opacity: z.number().min(0).max(1).default(1),
    minZoom: z.number().min(0).max(30).optional(),
    maxZoom: z.number().min(0).max(30).optional(),
    zIndex: z.number().int().default(0),
    attribution: attributionSchema.optional(),
    capabilities: capabilitySchema.default({
        identify: false,
        selectable: false,
        editable: false,
    }),
};
const xyzSourceSchema = z.object({
    kind: z.literal('xyz'),
    url: z.string().url().or(z.string().startsWith('/')).or(z.string().startsWith('./')),
    maxZoom: z.number().int().min(0).max(30).optional(),
    tileSize: z.number().int().positive().optional(),
    crossOrigin: z.string().optional(),
    preload: z.number().int().min(0).max(4).optional(),
    transition: z.number().int().min(0).max(2000).optional(),
    cacheSize: z.number().int().min(128).max(4096).optional(),
});
const fastWmtsSourceSchema = z.object({
    kind: z.literal('fast-wmts'),
    standardUrl: z.string().url(),
    highResolutionUrl: z.string().url().optional(),
    highResolutionWmsUrl: z.string().optional(),
    fallbackWmsUrl: z.string().url().or(z.string().startsWith('/')).or(z.string().startsWith('./')).optional(),
    switchZoom: z.number().int().min(0).max(30).default(18),
    maxZoom: z.number().int().min(0).max(30).default(23),
    tileSize: z.number().int().positive().default(256),
    preload: z.number().int().min(0).max(4).default(1),
    transition: z.number().int().min(0).max(2000).default(120),
    cacheSize: z.number().int().min(128).max(4096).optional(),
});
const wmsSourceSchema = z.object({
    kind: z.literal('wms'),
    url: z.string().url().or(z.string().startsWith('/')).or(z.string().startsWith('./')),
    layers: z.string().min(1),
    time: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/).optional(),
    version: z.enum(['1.1.1', '1.3.0']).default('1.3.0'),
    format: z.string().min(1).default('image/png'),
    transparent: z.boolean().default(true),
    tiled: z.boolean().default(true),
    projection: z.string().min(1).optional(),
    preload: z.number().int().min(0).max(4).optional(),
    transition: z.number().int().min(0).max(2000).optional(),
    cacheSize: z.number().int().min(128).max(4096).optional(),
    interpolate: z.boolean().optional(),
    // 17.8.3 — transport. `url` stays the same-origin proxy (/api/wms.php?source=…),
    // because export and identify derive the server-side source key from it.
    // `directUrl` is the upstream WMS used straight from the browser, like Geoportal does.
    transport: z.enum(['proxy', 'direct', 'direct-then-proxy']).default('proxy'),
    directUrl: z.string().url().optional(),
    directTimeoutMs: z.number().int().min(1000).max(60000).optional(),
    proxyTimeoutMs: z.number().int().min(1000).max(60000).optional(),
    // Larger tiles = fewer requests to aggregate services (KIMP, POG).
    tileSize: z.union([z.literal(256), z.literal(512)]).optional(),
    // Request N× more pixels for the same BBOX. The server then computes a
    // smaller scale denominator, so scale-dependent layers (POG zones: 1:5000)
    // render at lower zoom levels. Only honoured for tiled layers.
    dpiScale: z.number().min(1).max(3).optional(),
    // 19.8.6: zapas wokół widoku dla warstw rysowanych jednym obrazem (tiled: false).
    ratio: z.number().min(1).max(2).optional(),
    // 19.37.0: własna legenda (obraz) i własny adres informacji w punkcie (zamiast api/identify.php).
    legendUrl: z.string().startsWith('./').optional(),
    identifyUrl: z.string().startsWith('./api/').optional(),
});
const kowrSourceSchema = z.object({
    kind: z.literal('kowr-points'),
    url: z.string().startsWith('./'),
    listUrl: z.string().startsWith('./'),
});
const wmtsCapabilitiesSourceSchema = z.object({
    kind: z.literal('wmts-capabilities'),
    capabilitiesUrl: z.string().url().or(z.string().startsWith('/')).or(z.string().startsWith('./')),
    layer: z.string().min(1),
    matrixSet: z.string().min(1).optional(),
    style: z.string().min(1).optional(),
    format: z.string().min(1).optional(),
    preload: z.number().int().min(0).max(4).optional(),
    cacheSize: z.number().int().min(128).max(4096).optional(),
});
// 19.30.0: podkład wektorowy OpenStreetMap (OpenFreeMap) z paletą msportalu.
const vectorStyleSourceSchema = z.object({
    kind: z.literal('vector-style'),
    variant: z.enum(['pastel', 'zmierzch', 'kartograficzny']),
    styleUrl: z.string().url().optional(),
    thumbnail: z.string().startsWith('./').optional(),
});
// 19.30.0: warstwa liczona w przeglądarce z modelu wysokości (nachylenie, cieniowanie).
const demSourceSchema = z.object({
    kind: z.literal('dem'),
    mode: z.enum(['slope', 'hillshade']),
});
const sourceDefinitionSchema = z.discriminatedUnion('kind', [
    vectorStyleSourceSchema,
    demSourceSchema,
    xyzSourceSchema,
    fastWmtsSourceSchema,
    wmsSourceSchema,
    wmtsCapabilitiesSourceSchema,
    kowrSourceSchema,
]);
export const layerDefinitionSchema = z.object({
    ...commonDefinitionShape,
    source: sourceDefinitionSchema,
}).superRefine((definition, context) => {
    if (definition.source.kind === 'wms'
        && definition.source.transport !== 'proxy'
        && !definition.source.directUrl) {
        context.addIssue({
            code: 'custom',
            message: 'transport direct wymaga directUrl.',
            path: ['source', 'directUrl'],
        });
    }
    if (definition.minZoom !== undefined
        && definition.maxZoom !== undefined
        && definition.minZoom > definition.maxZoom) {
        context.addIssue({
            code: 'custom',
            message: 'minZoom nie może być większy niż maxZoom.',
            path: ['minZoom'],
        });
    }
});
