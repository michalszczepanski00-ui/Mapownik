import { registerLazyPanel } from './PanelRegistry.js';
import { FEATURE_PANELS } from '../../features/index.js';

/**
 * Rejestracja paneli z deklaracji funkcji (slot `panels`, 18.1).
 * Wywoływane raz, przy starcie aplikacji. Nowy panel nie wymaga zmian tutaj.
 */
let registered = false;

export function registerBuiltInPanels() {
    if (registered) return;
    registered = true;
    for (const panel of FEATURE_PANELS) registerLazyPanel(panel.id, panel.load);
}
