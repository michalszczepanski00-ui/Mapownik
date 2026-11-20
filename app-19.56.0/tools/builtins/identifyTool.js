import { suspendOtherInteractionModes } from './interactionCoordinator.js';
export function createIdentifyTool(coordinator) {
    return {
        activate() {
            suspendOtherInteractionModes(coordinator, 'identify');
            coordinator.editingManager.setMode('pan');
            coordinator.identifyManager.activate();
        },
    };
}
