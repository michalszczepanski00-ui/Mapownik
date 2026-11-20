import { suspendOtherInteractionModes } from './interactionCoordinator.js';
/** Lazy-loaded behavior shared by the line/area measurement tools. */
export function createMeasurementModeTool(coordinator, mode) {
    return {
        activate() {
            suspendOtherInteractionModes(coordinator, 'measurement');
            coordinator.editingManager?.objectManager?.select?.(null); // 18.11.1: jak przy rysowaniu
            coordinator.measurementManager.activate(mode);
        },
    };
}
