// 18.0: narzędzia deklarują funkcje (features/builtin/*); tutaj zostaje
// rejestr i leniwie ładowane moduły zachowań (builtins/*Tool.js).
export * from './ToolRegistry.js';
export { suspendOtherInteractionModes } from './builtins/interactionCoordinator.js';
