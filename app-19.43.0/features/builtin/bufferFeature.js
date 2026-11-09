import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';
import { BufferManager } from '../../buffer/index.js';

/**
 * Bufor wokół obiektu — PIERWSZA funkcja w całości w kontrakcie (18.0).
 *
 * Cała funkcja jest w tym pliku i w buffer/BufferManager.js. Wcześniej bufor
 * był wpięty ręcznie w 15 plików: rejestrację narzędzia, MapRuntime (6 miejsc),
 * koordynator interakcji, IdentifyManager, MapStage (7 miejsc, w tym pasek
 * stanu), AppServicesContext, pasek właściwości i CSS. Teraz deklaruje:
 *  - serwis `buffer` (tworzony przy starcie mapy),
 *  - tryb interakcji (żeby inne narzędzia go wyłączały, a identyfikacja
 *    ignorowała kliknięcia w czasie buforowania),
 *  - narzędzie z instrukcją i polem odległości w pasku kontekstu,
 *  - pozycję paska stanu.
 */

const buffer = (ctx) => ctx.get('buffer');

export const bufferFeature = defineFeature({
    id: 'buffer',
    title: t('feature.buffer'),
    services: {
        buffer: (ctx) => new BufferManager(ctx.get('mapController'), ctx.get('objects'), ctx.get('objectCommands')),
    },
    interaction: [{
        id: 'buffer',
        service: 'buffer',
        deactivate: (service) => service.deactivate(),
        isCapturing: (service) => Boolean(service.getSnapshot().active),
        isSketching: (service) => Boolean(service.getSnapshot().sourceId),
        abortSketch: (service) => { service.cancelPreview(); return true; },
    }],
    tools: [{
        id: 'core.buffer',
        title: t('tool.buffer.title'),
        label: t('tool.buffer.short'),
        description: t('tool.buffer.description'),
        icon: 'buffer',
        group: 'measurement',
        order: 330,
        shortcut: { code: 'KeyB', label: 'B' },
        service: 'buffer',
        hint: (ctx) => {
            const state = buffer(ctx).getSnapshot();
            if (state.error) return state.error;
            return state.busy ? 'Przygotowuję podgląd…' : state.previewReady ? `Podgląd: ${state.sourceName}. Zatwierdź, aby dodać bufor.` : t('tool.buffer.hint');
        },
        isActive: (ctx) => Boolean(buffer(ctx).getSnapshot().active),
        load: async (ctx) => ({
            activate() {
                ctx.interactions.suspendOthers('buffer');
                buffer(ctx).activate();
            },
        }),
        options: (ctx) => {
            const state = buffer(ctx).getSnapshot();
            return [{
                id: 'distance', type: 'number', label: t('context.distance'), unit: 'm',
                min: 0.5, max: 20000, step: 1, value: state.distanceMeters,
                title: state.error ?? t('tool.buffer.hint'),
                onChange: (value) => buffer(ctx).setDistance(value),
            },
            { id: 'create', type: 'button', label: 'Utwórz bufor', disabled: !state.previewReady || state.busy, onClick: () => { if (buffer(ctx).commit()) void ctx.tools.activate('core.pan'); } },
            { id: 'cancel', type: 'button', label: 'Anuluj podgląd', onClick: () => { buffer(ctx).cancelPreview(); void ctx.tools.activate('core.pan'); } }];
        },
    }],
    statusItems: [{
        id: 'buffer.distance',
        order: 50,
        service: 'buffer',
        select: (state) => (state.active ? {
            icon: state.busy ? 'busy' : 'buffer',
            text: t('status.bufferDistance', { distance: state.distanceMeters.toLocaleString('pl-PL') }),
            title: state.error ?? t('tool.buffer.hint'),
            tone: state.error ? 'danger' : 'accent',
        } : null),
    }],
});
