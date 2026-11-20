import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';

/** Profil terenu i analiza wysokości NMT (TerrainProfileManager, rdzeń runtime). */

const terrain = (ctx) => ctx.get('terrainProfile');

export const terrainFeature = defineFeature({
    id: 'terrain',
    title: t('feature.terrain'),
    panels: [{
        id: 'terrainProfile',
        title: t('panel.terrainProfile.title'),
        subtitle: t('panel.terrainProfile.subtitle'),
        icon: 'terrain',
        dock: 'bottom',
        order: 50,
        // Moduł kontekstowy: widoczność zależy od serwisu (controlledBy), nie od użytkownika.
        rail: false,
        controlledBy: 'terrainProfile',
        collapsible: false,
        floatGroup: 'bottom-float',
        defaultWidth: 720,
        minWidth: 420,
        maxWidth: 1200,
        resizeDirection: -1,
        load: () => import('../../app/components/TerrainProfilePanel.js').then((module) => module.TerrainProfilePanel),
    }],
    interaction: [{
        id: 'terrain',
        service: 'terrainProfile',
        deactivate: (service) => service.deactivate(),
        isCapturing: (service) => Boolean(service.getSnapshot().active),
        isSketching: (service) => Boolean(service.getSnapshot().drawing),
        abortSketch: (service) => service.abortSketch(),
        finishSketch: (service) => service.finishSketch(),
        undoLastPoint: (service) => service.undoLastPoint(),
    }],
    tools: [
        {
            id: 'core.terrain.profile',
            title: t('tool.terrainProfile.title'),
            label: t('tool.terrainProfile.short'),
            description: t('tool.terrainProfile.description'),
            icon: 'terrain-profile',
            group: 'terrain',
            order: 410,
            shortcut: { code: 'KeyF', label: 'F' },
            service: 'terrainProfile',
            hint: (ctx) => (terrain(ctx).getSnapshot().drawing ? t('tool.sketching.hint') : t('tool.terrainProfile.hint')),
            isActive: (ctx) => {
                const state = terrain(ctx).getSnapshot();
                return state.active && state.mode === 'line';
            },
            load: async (ctx) => {
                const { createTerrainProfileTool } = await import('../../tools/builtins/terrainProfileTool.js');
                return createTerrainProfileTool(ctx.coordinator);
            },
        },
        {
            id: 'core.terrain.area',
            title: t('tool.terrainArea.title'),
            label: t('tool.terrainArea.short'),
            description: t('tool.terrainArea.description'),
            icon: 'terrain-area',
            group: 'terrain',
            order: 420,
            shortcut: { code: 'KeyW', label: 'W' },
            service: 'terrainProfile',
            hint: () => t('tool.terrainArea.hint'),
            isActive: (ctx) => {
                const state = terrain(ctx).getSnapshot();
                return state.active && state.mode === 'area';
            },
            load: async (ctx) => {
                const { createTerrainAreaTool } = await import('../../tools/builtins/terrainAreaTool.js');
                return createTerrainAreaTool(ctx.coordinator);
            },
        },
        {
            // 19.41.0: model terenu 3D (Three.js ładowany dopiero przy otwarciu okna).
            id: 'core.terrain.3d',
            title: 'Teren 3D',
            label: 'Teren 3D',
            description: 'Trójwymiarowy model terenu działki albo wieloboku z otoczeniem (NMT GUGiK).',
            icon: 'terrain-area',
            group: 'terrain',
            order: 430,
            shortcut: { code: 'KeyU', label: 'U' },
            service: 'identify',
            hint: () => 'Kliknij działkę na mapie albo zaznacz wielobok — otworzy się widok Teren 3D.',
            isActive: () => false,
            load: async (ctx) => {
                const { createTerrain3DTool } = await import('../../terrain3d/terrain3dTool.js');
                return createTerrain3DTool(ctx);
            },
        },
    ],
});
