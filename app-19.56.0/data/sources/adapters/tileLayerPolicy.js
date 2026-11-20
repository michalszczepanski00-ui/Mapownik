/**
 * OpenLayers 10.10 keeps the tile cache on the TileLayer (source.cacheSize is
 * deprecated). Basemaps benefit from a larger cache because the user pans and
 * zooms them continuously; thematic overlays keep the documented two-zoom-level
 * budget without wasting browser memory.
 */
export function tileLayerCacheSize(definition, source = {}) {
    const configured = Number(source.cacheSize);
    if (Number.isFinite(configured) && configured >= 128) return Math.round(configured);
    // 17.6.4: basemaps used to get 1024 — a lot of resident decoded bitmaps
    // over a long session (continuous pan/zoom across a big area never
    // evicts them until the cache fills). 512 — the same budget thematic
    // overlays already used — still comfortably covers continuous pan/zoom
    // while roughly halving basemap tile memory.
    //
    // 17.8.11: budżet liczony w pikselach, a nie w sztukach. Kafel 512 px
    // z dpiScale 2 (plany ogólne, strefy) to obraz 1024×1024 — 16 razy więcej
    // pamięci niż kafel 256 px. 512 takich kafli to do ~2 GB zdekodowanych
    // bitmap. Teraz każda warstwa ma ten sam budżet co 512 kafli 256 px
    // (~33 Mpx, ~128 MB), ale z minimalnym zestawem kafli, z uwzględnieniem roli warstwy.
    const tilePx = Math.max(256, Number(source.tileSize) || 256) * (Number(source.dpiScale) > 1 ? Number(source.dpiScale) : 1);
    // Thematic layers are numerous; retain about two desktop views instead of a basemap-sized cache per overlay.
    const pixelBudget = definition?.role === 'basemap' ? TILE_BUDGET_PIXELS : OVERLAY_BUDGET_PIXELS;
    const budget = Math.round(pixelBudget / (tilePx * tilePx));
    return Math.max(MIN_CACHED_TILES, Math.min(512, budget));
}
const TILE_BUDGET_PIXELS = 512 * 256 * 256;
const OVERLAY_BUDGET_PIXELS = 128 * 256 * 256;
const MIN_CACHED_TILES = 16;

export function tileLayerPreload(definition, source = {}) {
    const configured = Number(source.preload);
    if (Number.isInteger(configured) && configured >= 0) return configured;
    return definition?.role === 'basemap' ? 1 : 0;
}
