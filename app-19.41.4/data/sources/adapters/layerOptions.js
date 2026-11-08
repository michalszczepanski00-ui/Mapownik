/**
 * Keep common OpenLayers layer state in one place so every adapter behaves the
 * same way. The returned plain object is intentionally not coupled to a
 * specific OpenLayers layer subclass.
 */
export function toBaseLayerOptions(definition) {
    return {
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
