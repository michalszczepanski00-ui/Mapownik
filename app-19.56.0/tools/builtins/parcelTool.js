import { suspendOtherInteractionModes } from './interactionCoordinator.js';
export function createParcelTool(coordinator) {
    return {
        activate() {
            suspendOtherInteractionModes(coordinator, 'parcel');
            coordinator.parcelManager.activate();
        },
    };
}
