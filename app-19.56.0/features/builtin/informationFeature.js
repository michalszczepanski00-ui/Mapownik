import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';

/**
 * Informacja o działce (identyfikacja) i pobieranie granicy działki z ULDK.
 * Menedżery: IdentifyManager i ParcelManager (rdzeń runtime).
 */

const identify = (ctx) => ctx.get('identify');
const parcels = (ctx) => ctx.get('parcels');

export const informationFeature = defineFeature({
    id: 'information',
    title: t('feature.information'),
    panels: [{
        id: 'identify',
        railLabel: 'Działka',
        title: t('panel.identify.title'),
        subtitle: t('panel.identify.subtitle'),
        icon: 'identify',
        dock: 'right',
        order: 25,
        // Wynik identyfikacji w doku (moduł kontekstowy): pojawia się, gdy
        // IdentifyManager ma wynik (flaga `open`); każdy nowy punkt kliknięcia
        // pokazuje zakładkę ponownie.
        controlledBy: 'identify',
        returnToPrevious: true,
        reopenOn: 'coordinate2180',
        collapsible: false,
        // 19.10.0: na komputerze karta miejsca — stałe okno po lewej, pod wyszukiwarką
        // (App.js: usePlaceCards), więc warstwy po prawej zostają otwarte obok wyniku.
        // 19.11.0: wspólna karta z zakładkami Działka · Raport · Analizy.
        placeCard: true,
        placeCardLabel: 'Działka',
        floatGroup: 'place-card',
        defaultWidth: 340,
        minWidth: 300,
        maxWidth: 460,
        resizeDirection: -1,
        load: () => import('../../app/components/IdentifyPanel.js').then((module) => module.IdentifyDockPanel),
    }],
    interaction: [
        {
            id: 'identify',
            service: 'identify',
            deactivate: (service) => service.deactivate(),
            isCapturing: (service) => Boolean(service.getSnapshot().active),
        },
        {
            id: 'parcel',
            service: 'parcels',
            deactivate: (service) => service.deactivate(),
            isCapturing: (service) => Boolean(service.getSnapshot().active),
        },
    ],
    tools: [
        {
            id: 'core.identify',
            title: t('tool.identify.title'),
            label: t('tool.identify.short'),
            description: t('tool.identify.description'),
            icon: 'identify',
            group: 'information',
            order: 110,
            shortcut: { code: 'KeyI', label: 'I' },
            service: 'identify',
            hint: (ctx) => {
                const state = identify(ctx).getSnapshot();
                if (state.busy) return t('tool.busy');
                return t('tool.identify.hint');
            },
            isActive: (ctx) => Boolean(identify(ctx).getSnapshot().active),
            load: async (ctx) => {
                const { createIdentifyTool } = await import('../../tools/builtins/identifyTool.js');
                return createIdentifyTool(ctx.coordinator);
            },
        },
        {
            id: 'core.parcel.pick',
            title: t('tool.parcel.title'),
            label: t('tool.parcel.short'),
            description: t('tool.parcel.description'),
            icon: 'parcel',
            group: 'information',
            order: 120,
            shortcut: { code: 'KeyD', label: 'D' },
            service: 'parcels',
            hint: (ctx) => {
                const state = parcels(ctx).getSnapshot();
                if (state.error) return state.error;
                return state.busy ? t('tool.busy') : t('tool.parcel.hint');
            },
            isActive: (ctx) => Boolean(parcels(ctx).getSnapshot().active),
            load: async (ctx) => {
                const { createParcelTool } = await import('../../tools/builtins/parcelTool.js');
                return createParcelTool(ctx.coordinator);
            },
        },
    ],
    statusItems: [{
        id: 'parcel.status',
        order: 60,
        service: 'parcels',
        select: (state) => (state.active ? {
            icon: state.busy ? 'busy' : 'parcel',
            text: state.lastParcelLabel ?? t('tool.parcel.title'),
            title: state.error ?? t('tool.parcel.hint'),
            tone: state.error ? 'danger' : 'accent',
        } : null),
    }],
    contextMenu: [{
        id: 'identify.here',
        order: 10,
        label: t('contextMenu.identifyHere'),
        run: async (ctx, place) => {
            await ctx.tools.activate('core.identify');
            await identify(ctx).handleClick(place);
        },
        when: (ctx, place) => Boolean(place?.coordinate2180 && place?.pixel),
    }],
});
