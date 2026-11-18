import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';

/** Pomiary odległości i powierzchni (MeasurementManager, rdzeń runtime). */

const measurement = (ctx) => ctx.get('measurement');

function measureTool({ id, mode, key, icon, order, shortcut }) {
    return {
        id,
        title: t(`tool.${key}.title`),
        label: t(`tool.${key}.short`),
        description: t(`tool.${key}.description`),
        icon,
        group: 'measurement',
        order,
        shortcut,
        service: 'measurement',
        hint: (ctx) => {
            const state = measurement(ctx).getSnapshot();
            if (state.error) return state.error;
            return state.drawing ? t('tool.sketching.hint') : t(`tool.${key}.hint`);
        },
        isActive: (ctx) => measurement(ctx).getSnapshot().mode === mode,
        options: (ctx) => { const state = measurement(ctx).getSnapshot(); return [
            { id: 'save-mode', type: 'select', label: 'Pomiar', value: state.temporary ? 'temporary' : 'project', options: [{ value: 'temporary', label: 'Tymczasowy' }, { value: 'project', label: 'Zapis w projekcie' }], onChange: (value) => measurement(ctx).setTemporary(value === 'temporary') },
            ...(state.temporaryResult ? [
                { id: 'result', type: 'readout', label: 'Wynik', value: state.temporaryResult },
                { id: 'save', type: 'button', label: 'Dodaj do projektu', onClick: () => measurement(ctx).saveTemporary() },
                { id: 'copy', type: 'button', label: 'Kopiuj wynik', onClick: () => { void globalThis.navigator?.clipboard?.writeText(state.temporaryResult).catch(() => {}); } },
                { id: 'clear', type: 'button', label: 'Wyczyść pomiar', onClick: () => measurement(ctx).clearTemporary() },
            ] : []),
        ]; },
        load: async (ctx) => {
            const { createMeasurementModeTool } = await import('../../tools/builtins/measurementModeTool.js');
            return createMeasurementModeTool(ctx.coordinator, mode);
        },
    };
}

export const measurementFeature = defineFeature({
    id: 'measurement',
    title: t('feature.measurement'),
    interaction: [{
        id: 'measurement',
        service: 'measurement',
        deactivate: (service) => service.deactivate(),
        isCapturing: (service) => Boolean(service.getSnapshot().mode),
        isSketching: (service) => Boolean(service.getSnapshot().drawing),
        abortSketch: (service) => service.abortSketch(),
        finishSketch: (service) => service.finishSketch(),
        undoLastPoint: (service) => service.undoLastPoint(),
    }],
    tools: [
        measureTool({ id: 'core.measure.line', mode: 'line', key: 'measureLine', icon: 'measure-line', order: 310, shortcut: { code: 'KeyM', label: 'M' } }),
        measureTool({ id: 'core.measure.area', mode: 'area', key: 'measureArea', icon: 'measure-area', order: 320, shortcut: { code: 'KeyA', label: 'A' } }),
    ],
    commands: [{
        id: 'measurement.clear',
        title: t('command.clearMeasurements'),
        group: t('command.group.edit'),
        order: 320,
        keywords: t('command.clearMeasurements.keywords').split(', '),
        when: (ctx) => measurement(ctx).getSnapshot().count > 0,
        run: (ctx) => measurement(ctx).clear(),
    }],
});
