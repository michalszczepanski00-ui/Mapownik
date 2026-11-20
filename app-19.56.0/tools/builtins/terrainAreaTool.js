import { suspendOtherInteractionModes } from './interactionCoordinator.js';
export function createTerrainAreaTool(coordinator) {
    return {
        activate() {
            suspendOtherInteractionModes(coordinator, 'terrain');
            coordinator.terrainProfileManager.activateArea();
        },
    };
}
