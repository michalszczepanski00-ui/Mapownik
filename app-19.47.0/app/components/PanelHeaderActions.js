import { createElement as h } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Ellipsis, Minus, PictureInPicture2, Pin, X } from 'lucide-react';
import { IconButton } from './IconButton.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PANEL_DEFS } from '../../store/index.js';
import { t } from '../../i18n/index.js';

/**
 * Akcje w nagłówku panelu, wspólne dla wszystkich modułów.
 *
 * Zestaw zależy od tego, gdzie panel mieszka:
 *  - w doku: „odepnij" (zamienia go w okno) i „zwiń" (chowa panel do szyny),
 *  - jako okno: „zadokuj", „minimalizuj" (jeśli manifest na to pozwala)
 *    i „zamknij".
 *
 * Wcześniej każdy panel miał te przyciski wpisane u siebie, z własnym
 * kompletem etykiet — stąd rozjazd, w którym Eksport jako jedyny nie dawał się
 * zminimalizować.
 */
/**
 * `onClose` przejmuje zamykanie tam, gdzie o widoczności modułu decyduje serwis
 * (moduły kontekstowe): samo zamknięcie w store zostałoby natychmiast cofnięte
 * przez mostek, który odtwarza stan z serwisu.
 */
export function PanelHeaderActions({ id, onClose }) {
    const { docked, close, collapse, undock, dock } = usePanel(id);
    const title = PANEL_DEFS[id].title;
    const handleClose = onClose ?? close;
    // 18.15.0: powłoka mobilna nie ma okien pływających — „odepnij” chowało panel bez śladu.
    const mobile = useIsMobile();

    if (docked) {
        return h('div', { className: 'panel-actions' },
            !mobile && h(DropdownMenu.Root, null,
                h(DropdownMenu.Trigger, { asChild: true }, h('button', { type: 'button', className: 'icon-button', 'aria-label': `Opcje panelu: ${title}` }, h(Ellipsis, { size: 17 }))),
                h(DropdownMenu.Portal, null, h(DropdownMenu.Content, { className: 'dropdown-content', align: 'end', sideOffset: 5 },
                    h(DropdownMenu.Item, { className: 'dropdown-item', onSelect: undock }, 'Otwórz w osobnym oknie')))),
            h(IconButton, {
                label: t('panel.action.collapse', { title }),
                tooltipSide: 'bottom',
                onClick: handleClose,
            }, h(X, { size: 17 })));
    }

    return h('div', { className: 'panel-actions' },
        // 19.10.0: karta miejsca ma stałe miejsce po lewej — bez „zadokuj” i „minimalizuj”.
        !PANEL_DEFS[id].placeCard && h(IconButton, {
            label: t('panel.action.dock', { title }),
            tooltipSide: 'bottom',
            onClick: dock,
        }, h(Pin, { size: 15 })),
        PANEL_DEFS[id].collapsible && !PANEL_DEFS[id].placeCard
            ? h(IconButton, {
                label: t('panel.action.minimize', { title }),
                tooltipSide: 'bottom',
                onClick: collapse,
            }, h(Minus, { size: 15 }))
            : null,
        h(IconButton, {
            label: t('panel.action.close', { title }),
            tooltipSide: 'bottom',
            onClick: handleClose,
        }, h(X, { size: 17 })));
}
