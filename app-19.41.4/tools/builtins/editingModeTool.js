import { suspendOtherInteractionModes } from './interactionCoordinator.js';
/** Lazy-loaded behavior shared by the four conservative editing tools. */
export function createEditingModeTool(coordinator, mode) {
    return {
        activate() {
            suspendOtherInteractionModes(coordinator, 'editing');
            // 18.11.1: rysowanie nowego obiektu zaczyna się bez zaznaczenia — wcześniej
            // pasek pokazywał styl poprzedniego obiektu i łatwo było zmienić jego
            // kolor w przekonaniu, że ustawia się styl nowego.
            if (mode.startsWith('draw-')) coordinator.editingManager.objectManager?.select?.(null);
            coordinator.editingManager.setMode(mode);
        },
    };
}
