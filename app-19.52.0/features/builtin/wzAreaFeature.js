import { defineFeature } from '../defineFeature.js';
import { WzAreaManager, WZ_MULTIPLIER, WZ_MIN_DISTANCE_M } from '../../buffer/WzAreaManager.js';

/**
 * 19.50.0 — obszar analizowany dla decyzji WZ (3 × front działki, min. 50 m). Logika w buffer/WzAreaManager.js.
 */
const wz = (ctx) => ctx.get('wzArea');
const fmt = (v) => Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 1 });

export const wzAreaFeature = defineFeature({
    id: 'wz-area',
    title: 'Obszar analizowany WZ',
    services: {
        wzArea: (ctx) => new WzAreaManager(ctx.get('mapController'), ctx.get('objects'), ctx.get('objectCommands')),
    },
    interaction: [{
        id: 'wzArea',
        service: 'wzArea',
        deactivate: (service) => service.deactivate(),
        isCapturing: (service) => Boolean(service.getSnapshot().active),
        isSketching: (service) => Boolean(service.getSnapshot().sourceId),
        abortSketch: (service) => { service.reset(); return true; },
    }],
    tools: [{
        id: 'core.wz.area',
        title: 'Obszar analizowany WZ',
        label: 'Obszar WZ',
        description: `Granica obszaru analizowanego do decyzji o warunkach zabudowy: ${WZ_MULTIPLIER} × szerokość frontu działki, nie mniej niż ${WZ_MIN_DISTANCE_M} m. To minimum z rozporządzenia — urząd może przyjąć większy obszar.`,
        icon: 'buffer',
        group: 'measurement',
        order: 335,
        shortcut: { code: 'KeyZ', label: 'Z' },
        service: 'wzArea',
        hint: (ctx) => {
            const s = wz(ctx).getSnapshot();
            if (s.error) return s.error;
            if (!s.sourceId) return 'Kliknij działkę w projekcie (dodasz ją w karcie działki: Do projektu).';
            if (!s.frontMeters) return 'Kliknij krawędź działki od strony drogi (front) albo wpisz jej szerokość.';
            if (s.busy) return 'Wyznaczam obszar…';
            return `Front ${fmt(s.frontMeters)} m → obszar ${fmt(s.distanceMeters)} m wokół działki.`;
        },
        isActive: (ctx) => Boolean(wz(ctx).getSnapshot().active),
        load: async (ctx) => ({
            activate() {
                ctx.interactions.suspendOthers('wzArea');
                wz(ctx).activate();
            },
        }),
        options: (ctx) => {
            const s = wz(ctx).getSnapshot();
            if (!s.sourceId) return [];
            return [
                { id: 'front', type: 'number', label: 'Front', unit: 'm', min: 1, max: 2000, step: 0.1, value: s.frontMeters ?? '', title: 'Szerokość frontu działki (od strony drogi, z której jest wjazd)', onChange: (value) => wz(ctx).setFront(value) },
                { id: 'distance', type: 'readout', label: 'Obszar', value: s.distanceMeters ? `${fmt(s.distanceMeters)} m` : '—', title: `${WZ_MULTIPLIER} × front, nie mniej niż ${WZ_MIN_DISTANCE_M} m` },
                { id: 'create', type: 'button', label: 'Utwórz obszar', disabled: !s.previewReady || s.busy, onClick: () => { if (wz(ctx).commit()) void ctx.tools.activate('core.pan'); } },
                { id: 'other', type: 'button', label: 'Inna działka', onClick: () => wz(ctx).reset() },
            ];
        },
    }],
});
