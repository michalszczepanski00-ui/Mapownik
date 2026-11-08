import { createElement as h, useEffect, useLayoutEffect, useRef } from 'react';
import { useService } from '../services/AppServicesContext.js';
import { t } from '../../i18n/index.js';

/**
 * 18.0 — menu prawego przycisku na mapie. Pozycje pochodzą ze slotu
 * `contextMenu` funkcji (features/), więc nowa funkcja dopisuje pozycję
 * w swojej deklaracji, a nie w MapStage.
 */
export function MapContextMenu({ place, onClose }) {
    const ctx = useService('featureContext');
    const features = useService('features');
    const menuRef = useRef(null);
    const items = (features?.list('contextMenu') ?? []).filter((item) => {
        try { return item.when ? item.when(ctx, place) : true; }
        catch { return false; }
    });

    // Menu mieści się w oknie: po wyrenderowaniu mierzymy je i przesuwamy
    // w górę/w lewo (6 pozycji to ok. 200 px — przy dolnej krawędzi część
    // pozycji wypadała poza ekran).
    useLayoutEffect(() => {
        const menu = menuRef.current;
        if (!menu) return;
        const rect = menu.getBoundingClientRect();
        const margin = 8;
        if (rect.bottom > window.innerHeight - margin) menu.style.top = `${Math.max(margin, window.innerHeight - rect.height - margin)}px`;
        if (rect.right > window.innerWidth - margin) menu.style.left = `${Math.max(margin, window.innerWidth - rect.width - margin)}px`;
    }, [place.x, place.y]);

    useEffect(() => {
        const first = menuRef.current?.querySelector('button');
        first?.focus({ preventScroll: true });
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const buttons = [...(menuRef.current?.querySelectorAll('button') ?? [])];
            const index = buttons.indexOf(document.activeElement);
            const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
            buttons[next]?.focus();
            event.preventDefault();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [onClose]);

    if (!items.length) return null;
    return h('div', {
        ref: menuRef,
        className: 'map-context-menu',
        style: { left: `${place.x}px`, top: `${place.y}px` },
        role: 'menu',
        'aria-label': t('contextMenu.label'),
        onPointerDown: (event) => event.stopPropagation(),
    }, items.map((item) => h('button', {
        key: item.id,
        type: 'button',
        role: 'menuitem',
        onClick: () => {
            onClose();
            try {
                const result = item.run(ctx, place);
                if (result && typeof result.catch === 'function') result.catch((error) => console.error(`[menu ${item.id}]`, error));
            } catch (error) {
                console.error(`[menu ${item.id}]`, error);
            }
        },
    }, item.label)));
}
