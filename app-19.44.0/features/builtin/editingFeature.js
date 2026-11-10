import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';

/**
 * Rysowanie i edycja obiektów projektu: przesuwanie, edycja geometrii,
 * punkt, linia, poligon, prostokąt, okrąg, droga, strzałka, tekst, etykieta.
 * Narzędzia działają przez EditingManager (rdzeń runtime).
 */

const editing = (ctx) => ctx.get('editing');
const snapshot = (ctx) => editing(ctx).getSnapshot();

function sketchHint(mode) {
    if (mode === 'draw-rectangle') return t('tool.sketching.rectangle');
    if (mode === 'draw-callout') return t('tool.sketching.callout');
    return t('tool.sketching.hint');
}

/** Wspólna definicja narzędzia trybu edycji. */
function modeTool({ id, mode, key, icon, group, order, shortcut, options }) {
    return {
        id,
        title: t(`tool.${key}.title`),
        label: t(`tool.${key}.short`),
        description: t(`tool.${key}.description`),
        icon,
        group,
        order,
        shortcut,
        service: 'editing',
        hint: (ctx) => {
            const state = snapshot(ctx);
            if (state.error) return state.error;
            if (state.drawing) return sketchHint(mode);
            return t(`tool.${key}.hint`);
        },
        isActive: (ctx) => {
            const state = snapshot(ctx);
            if (state.suspended || state.mode !== mode) return false;
            // 18.10.2: „Informacja o działce” przestawia edycję na przesuwanie, ale to ona
            // przejmuje kliknięcia — podświetlone ma być jedno narzędzie, nie dwa.
            return !(mode === 'pan' && ctx.get('identify')?.getSnapshot?.().active);
        },
        load: async (ctx) => {
            const { createEditingModeTool } = await import('../../tools/builtins/editingModeTool.js');
            return createEditingModeTool(ctx.coordinator, mode);
        },
        options: (ctx) => [
            ...(options?.(ctx) ?? []),
            ...(mode.startsWith('draw-') ? [{ id: 'repeat', type: 'select', label: 'Po dodaniu', value: ctx.settings.get('editing.repeat') ? 'repeat' : 'once', options: [{ value: 'once', label: 'Zakończ' }, { value: 'repeat', label: 'Dodawaj kolejne' }], onChange: (value) => ctx.settings.set('editing.repeat', value === 'repeat') }] : []),
            ...(mode === 'draw-arrow' ? [{ id: 'arrowMode', type: 'select', label: 'Strzałka', value: snapshot(ctx).arrowPolyline ? 'polyline' : 'simple', options: [{ value: 'simple', label: 'Dwa punkty' }, { value: 'polyline', label: 'Łamana' }], onChange: (value) => editing(ctx).setArrowPolyline(value === 'polyline') }] : []),
            ...(mode === 'draw-callout' ? [{ id: 'link', type: 'select', label: 'Powiązanie', value: snapshot(ctx).linkCallout ? 'linked' : 'free', options: [{ value: 'free', label: 'Niezależna' }, { value: 'linked', label: 'Powiąż z obiektem' }], onChange: (value) => editing(ctx).updateSnapshot({ linkCallout: value === 'linked' }) }] : []),
        ],
    };
}

export const editingFeature = defineFeature({
    id: 'editing',
    title: t('feature.editing'),
    interaction: [{
        id: 'editing',
        service: 'editing',
        deactivate: (service) => service.suspend(),
        isCapturing: (service) => {
            const state = service.getSnapshot();
            return state.suspended || state.drawing || state.modifying || state.mode !== 'pan';
        },
        isSketching: (service) => Boolean(service.getSnapshot().drawing),
        abortSketch: (service) => service.abortSketch(),
        finishSketch: (service) => service.finishSketch(),
        undoLastPoint: (service) => service.undoLastPoint(),
    }],
    settings: [{ id: 'editing.repeat', label: 'Dodawaj kolejne obiekty', description: 'Po zapisaniu pozostaw aktywne narzędzie rysowania.', type: 'toggle', default: false, order: 20 }],
    tools: [
        modeTool({ id: 'core.pan', mode: 'pan', key: 'pan', icon: 'pan', group: 'navigation', order: 10, shortcut: { code: 'Space', label: t('key.space') } }),
        modeTool({ id: 'core.select', mode: 'select', key: 'select', icon: 'select', group: 'drawing', order: 200, shortcut: { code: 'KeyV', label: 'V' } }),
        modeTool({ id: 'core.draw.point', mode: 'draw-point', key: 'point', icon: 'point', group: 'drawing', order: 210, shortcut: { code: 'KeyP', label: 'P' } }),
        modeTool({ id: 'core.draw.line', mode: 'draw-line', key: 'line', icon: 'line', group: 'drawing', order: 220, shortcut: { code: 'KeyL', label: 'L' } }),
        modeTool({ id: 'core.draw.polygon', mode: 'draw-polygon', key: 'polygon', icon: 'polygon', group: 'drawing', order: 230, shortcut: { code: 'KeyG', label: 'G' } }),
        modeTool({ id: 'core.draw.rectangle', mode: 'draw-rectangle', key: 'rectangle', icon: 'rectangle', group: 'drawing', order: 240, shortcut: { code: 'KeyR', label: 'R' } }),
        modeTool({
            id: 'core.draw.circle', mode: 'draw-circle', key: 'circle', icon: 'circle', group: 'drawing', order: 250, shortcut: { code: 'KeyO', label: 'O' },
            options: (ctx) => {
                const state = snapshot(ctx);
                return [{
                    id: 'radius', type: 'number', label: t('context.radius'), unit: 'm',
                    min: 0.5, max: 50000, step: 0.5, value: state.circleRadiusMeters,
                    title: state.error ?? t('context.radius'),
                    onChange: (value) => editing(ctx).setCircleRadius(value),
                }];
            },
        }),
        modeTool({
            id: 'core.draw.road', mode: 'draw-road', key: 'road', icon: 'road', group: 'routes', order: 510, shortcut: { code: 'KeyC', label: 'C' },
            options: (ctx) => {
                const state = snapshot(ctx);
                return [
                    { id: 'roadWidth', type: 'number', label: t('context.roadWidth'), unit: 'm', min: 3, max: 20, step: 0.5, value: state.roadWidthMeters, onChange: (value) => editing(ctx).setRoadWidth(value) },
                    { id: 'roadRadius', type: 'number', label: t('context.roadRadius'), unit: 'm', min: 3, max: 100, step: 1, value: state.roadCurveRadiusMeters, onChange: (value) => editing(ctx).setRoadCurveRadius(value) },
                    { id: 'vehicle', type: 'badge', label: 'Zestaw 16,5 m · limit 2000 m', title: 'Symulacja orientacyjna toru przedniej osi, bez oceny kolizji.' },
                ];
            },
        }),
        modeTool({ id: 'core.draw.arrow', mode: 'draw-arrow', key: 'arrow', icon: 'arrow', group: 'annotations', order: 610, shortcut: { code: 'KeyS', label: 'S' } }),
        modeTool({ id: 'core.draw.text', mode: 'draw-text', key: 'text', icon: 'text', group: 'annotations', order: 620, shortcut: { code: 'KeyT', label: 'T' } }),
        modeTool({ id: 'core.draw.callout', mode: 'draw-callout', key: 'callout', icon: 'callout', group: 'annotations', order: 630, shortcut: { code: 'KeyE', label: 'E' } }),
    ],
});
