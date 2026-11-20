/**
 * Keep common OpenLayers layer state in one place so every adapter behaves the
 * same way. The returned plain object is intentionally not coupled to a
 * specific OpenLayers layer subclass.
 */
// 19.56.0: biała obwódka pod rysunkiem działek i klas gruntów (CSS .ol-layer--halo) — numery i klasy czytelne na każdym podkładzie.
const HALO_LAYERS = new Set(['overlay.dzialki', 'overlay.egib.arable-classes']);
export function toBaseLayerOptions(definition) {
    return {
        ...(HALO_LAYERS.has(definition.id) ? { className: 'ol-layer ol-layer--halo' } : {}),
        opacity: definition.opacity,
        visible: definition.visible,
        minZoom: definition.minZoom,
        maxZoom: definition.maxZoom,
        zIndex: definition.zIndex,
        properties: {
            catalogId: definition.id,
            catalogTitle: definition.title,
            catalogGroup: definition.group,
            capabilities: definition.capabilities,
            sourceKind: definition.source.kind,
        },
    };
}
