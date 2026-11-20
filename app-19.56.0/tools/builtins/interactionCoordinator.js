/**
 * At most one of {EditingManager's native interactions, MeasurementManager, TerrainProfileManager,
 * BufferManager, ParcelManager, IdentifyManager} may own map clicks/keys at a time. Every tool activate()
 * calls this first, naming which one it is about to turn on.
 */
export function suspendOtherInteractionModes(coordinator, keep) {
    // 18.0: tryby deklarują się w manifestach funkcji (InteractionRegistry) —
    // lista poniżej zostaje wyłącznie jako zapas dla koordynatora bez rejestru.
    if (coordinator.interactions) {
        coordinator.interactions.suspendOthers(keep);
        return;
    }
    if (keep !== 'editing')
        coordinator.editingManager.suspend();
    if (keep !== 'measurement')
        coordinator.measurementManager.deactivate();
    if (keep !== 'buffer')
        coordinator.bufferManager.deactivate();
    if (keep !== 'parcel')
        coordinator.parcelManager.deactivate();
    if (keep !== 'identify')
        coordinator.identifyManager?.deactivate();
    if (keep !== 'terrain')
        coordinator.terrainProfileManager?.deactivate();
}
