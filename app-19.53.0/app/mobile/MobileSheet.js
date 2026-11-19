import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../i18n/index.js';

/**
 * 18.14.0 — dolny arkusz w trzech wysokościach, jak karta miejsca w Mapach
 * Google: pasek (najważniejsza informacja), pół ekranu, pełny ekran.
 * Przeciąganie uchwytu albo nagłówka zmienia wysokość; puszczenie dociąga
 * do najbliższej wysokości. Przeciągnięcie poniżej paska zamyka arkusz.
 */
export const SNAPS = ['peek', 'half', 'full'];

function snapHeights(preferred, vh) {
    const peek = Math.min(preferred, Math.max(56, vh - 144));
    // 18.15.0: w poziomie (niski ekran) „pół” nie może być niższe niż pasek.
    const half = Math.max(peek + 40, Math.round(vh * 0.52));
    return { peek, half, full: Math.max(half + 40, vh - 64) };
}

export function MobileSheet({ snap, onSnap, onClose, peekHeight = 148, label, className = '', header, children }) {
    const [dragHeight, setDragHeight] = useState(null);
    const drag = useRef(null);
    const root = useRef(null);
    const [viewport, setViewport] = useState(() => window.innerHeight);
    const heights = snapHeights(peekHeight, viewport);
    const height = dragHeight ?? heights[snap] ?? heights.peek;

    useEffect(() => {
        const onResize = () => { setViewport(window.innerHeight); setDragHeight(null); };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // 18.14.3: wysokość arkusza trafia do zmiennej CSS powłoki — przycisk
    // „Moja lokalizacja” i komunikaty stoją nad arkuszem, a nie pod nim.
    const shellRef = useRef(null);
    useLayoutEffect(() => {
        shellRef.current = root.current?.closest?.('.m-shell') ?? shellRef.current;
        shellRef.current?.style.setProperty('--m-sheet-h', `${Math.round(height)}px`);
    }); // po każdym renderze: gdy jeden z dwóch arkuszy się zamknie, drugi od razu wpisuje swoją wysokość
    // Sprzątanie w fazie layout: biegnie przed wpisem wysokości przez arkusz, który zostaje.
    useLayoutEffect(() => () => shellRef.current?.style.removeProperty('--m-sheet-h'), []);

    const onPointerDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest?.('button, a, input, select, textarea')) return;
        drag.current = { y: event.clientY, start: height, moved: false };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
        if (!drag.current) return;
        const dy = drag.current.y - event.clientY;
        if (Math.abs(dy) > 4) drag.current.moved = true;
        if (drag.current.moved) setDragHeight(Math.max(56, Math.min(heights.full, drag.current.start + dy)));
    };
    const onPointerUp = (event) => {
        const state = drag.current;
        drag.current = null;
        if (!state) return;
        if (!state.moved) {
            // 18.14.3: gest przerwany przez przeglądarkę (pointercancel) to nie dotknięcie —
            // wcześniej arkusz sam zmieniał wysokość.
            if (event?.type === 'pointercancel') return;
            // Dotknięcie uchwytu: kolejna wysokość (pasek → pół → pełny → pasek).
            onSnap?.(SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]);
            return;
        }
        const final = dragHeight ?? state.start;
        setDragHeight(null);
        if (final < heights.peek * 0.6 && onClose) { onClose(); return; }
        const nearest = SNAPS.reduce((best, key) => (Math.abs(heights[key] - final) < Math.abs(heights[best] - final) ? key : best), 'peek');
        onSnap?.(nearest);
    };

    return h('section', {
        ref: root,
        className: `m-sheet m-sheet--${snap}${dragHeight != null ? ' is-dragging' : ''} ${className}`.trim(),
        style: { height: `${height}px` },
        role: 'dialog',
        'aria-modal': false,
        'aria-label': label,
    },
        h('div', {
            className: 'm-sheet-head',
            onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp,
        },
            h('button', {
                type: 'button',
                className: 'm-sheet-grip',
                'aria-label': snap === 'full' ? t('mobile.sheet.collapse') : t('mobile.sheet.expand'),
                onClick: () => onSnap?.(SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]),
            }),
            header),
        h('div', { className: 'm-sheet-body' }, children));
}
