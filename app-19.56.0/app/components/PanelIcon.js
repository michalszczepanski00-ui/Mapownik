import { createElement as h } from 'react';
import { ToolIcon } from '../icons/tablerIcons.js';

/**
 * Ikona modułu powłoki — szyna ikon i nagłówki paneli.
 *
 * Nazwa ikony zostaje w manifeście panelu (dana), a tłumaczenie nazwy na
 * kształt jest w jednym miejscu: `app/icons/tablerIcons.js`. Dzięki temu
 * podmiana ikony nie dotyka ani manifestu, ani żadnego komponentu.
 */
export function PanelIcon({ name, size = 18 }) {
    return h(ToolIcon, { name, size });
}
