import { createElement as h } from 'react';
import { Check, Undo2, X } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { formatArea, formatLength } from '../../core/units.js';
import { t } from '../../i18n/index.js';

const IDLE_SKETCH = Object.freeze({ active: false });

/**
 * 18.15.0 — pasek rysowania na telefonie (poligon, linia, analiza wysokości,
 * obszar bufora…). Na komputerze szkic kończy się Enterem albo podwójnym
 * kliknięciem, a cofa Backspace'em; na telefonie podwójne dotknięcie koliduje
 * z przybliżaniem, a klawiatury nie ma. Pasek u dołu daje te same polecenia
 * w zasięgu kciuka: Cofnij punkt · Zakończ · Anuluj, z bieżącym pomiarem.
 *
 * Działa dla każdego szkicu zgłoszonego w InteractionRegistry — bez wiedzy,
 * które narzędzie rysuje.
 */
export function MobileSketchBar() {
    const ctx = useService('featureContext');
    const sketch = useServiceSnapshot('sketch', IDLE_SKETCH);
    const owner = sketch.active ? ctx?.interactions?.activeSketch?.() : null;
    if (!sketch.active || !owner) return null;

    // OpenLayers trzyma w szkicu dodatkowy punkt „pod palcem” — po dotknięciu
    // jest równy ostatniemu, więc liczba wstawionych punktów to vertices − 1.
    const placed = sketch.type === 'point' ? 1 : Math.max(0, (sketch.vertices ?? 0) - 1);
    const minPoints = sketch.type === 'polygon' ? 3 : sketch.type === 'line' ? 2 : 1;
    const canFinish = Boolean(owner.finishSketch) && placed >= minPoints;
    const main = sketch.type === 'polygon' ? formatArea(sketch.areaM2 ?? 0)
        : sketch.type === 'line' ? formatLength(sketch.lengthM ?? 0) : null;
    const detail = [
        sketch.type === 'polygon' && sketch.perimeterM ? t('mobile.measure.perimeter', { value: formatLength(sketch.perimeterM) }) : null,
        t('mobile.measure.points', { count: placed }),
    ].filter(Boolean).join(' · ');

    return h('section', { className: 'm-measure-bar m-sketch-bar', role: 'region', 'aria-label': t('mobile.sketch.title') },
        h('div', { className: 'm-measure-head' },
            h('div', { className: 'm-measure-values', role: 'status', 'aria-live': 'polite' },
                h('span', null, t('mobile.sketch.title')),
                main ? h('strong', null, main) : null,
                h('small', null, placed < minPoints ? `${detail} · ${t('mobile.sketch.hint')}` : detail)),
            h('button', { type: 'button', className: 'm-icon-button', 'aria-label': t('context.cancel'), onClick: () => ctx.interactions.abortActiveSketch() }, h(X, { size: 20 }))),
        h('div', { className: 'm-sketch-actions' },
            h('button', { type: 'button', className: 'm-measure-secondary', onClick: () => ctx.interactions.undoLastPoint(), disabled: !owner.undoLastPoint || placed < 1 },
                h(Undo2, { size: 20 }), h('span', null, t('mobile.measure.undo'))),
            h('button', { type: 'button', className: 'm-measure-secondary is-done', onClick: () => ctx.interactions.finishActiveSketch(), disabled: !canFinish },
                h(Check, { size: 20 }), h('span', null, t('context.finish')))));
}
