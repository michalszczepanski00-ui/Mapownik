import { suspendOtherInteractionModes } from './interactionCoordinator.js';
export function createTerrainProfileTool(coordinator) {
    return {
        activate() {
            suspendOtherInteractionModes(coordinator, 'terrain');
            coordinator.terrainProfileManager.activate();
        },
    };
}
