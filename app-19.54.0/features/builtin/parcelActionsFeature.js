import { transform } from 'ol/proj.js';
import { defineFeature } from '../defineFeature.js';
import { reportDialog } from '../../app/components/reportDialogStore.js';
import { runTerrainFor } from '../../terrain/runTerrainFor.js';

/**
 * 19.53.0 (Etap 3) — akcje karty działki i doku Analizy w rejestrze akcji (actions/registry.js).
 *
 * Działka to ta z karty (snapshot serwisu identify). Każda akcja wywołuje to samo co dotąd
 * przyciski karty (19.51.0) i lista doku Analizy (Etap 5) — zmieniło się tylko to, że
 * deklaracja jest w jednym miejscu, a karta, dok i paleta poleceń czytają ją z rejestru.
 */

const identify = (ctx) => ctx.get('identify')?.getSnapshot?.() ?? null;
/** Działka z granicą (bez niej akcje działki nie mają sensu). */
export function cardParcel(ctx) {
    const snapshot = identify(ctx);
    return snapshot?.open && !snapshot.zoneOnly && snapshot.parcel?.wkt ? snapshot.parcel : null;
}
const hasParcel = (ctx) => Boolean(cardParcel(ctx));
const openPanel = (ctx, id) => ctx.panels?.open?.(id);

/** Dodaje działkę z karty do projektu; zwraca id obiektu albo null (błąd → powiadomienie). */
function addToProject(ctx) {
    const parcel = cardParcel(ctx);
    if (!parcel) return null;
    try { return ctx.get('parcels')?.addParcel(parcel) ?? null; } catch (error) {
        ctx.toasts?.show({ tone: 'danger', message: error instanceof Error ? error.message : String(error) });
        return null;
    }
}

/** Otoczenie działki: działka do projektu, panel analizy i screening (jak dotąd w karcie). */
function runScreening(ctx) {
    const analysis = ctx.get('analysis');
    if (cardParcel(ctx)) addToProject(ctx);
    analysis?.setPanelMode?.('screening');
    openPanel(ctx, 'analysis');
    if (cardParcel(ctx)) window.setTimeout(() => void analysis?.runParcelScreening(), 0);
}

/** Ceny: kadr 1 km wokół działki (jak dotąd), potem widok Ceny. */
function runPrices(ctx) {
    const center = identify(ctx)?.parcelCenterLonLat;
    const controller = ctx.get('mapController');
    if (controller && cardParcel(ctx) && Array.isArray(center)) {
        const [cx, cy] = transform(center, 'EPSG:4326', 'EPSG:3857');
        const r = 500 / Math.cos(center[1] * Math.PI / 180);
        controller.fitExtent([cx - r, cy - r, cx + r, cy + r], { maxZoom: 18, duration: 250, padding: [24, 24, 24, 24] });
    }
    openPanel(ctx, 'marketPrices');
}

const PARCEL = 'Działka: ';
const parcelAction = (action) => ({ when: hasParcel, paletteTitle: `${PARCEL}${action.label}`, ...action });

export const parcelActionsFeature = defineFeature({
    id: 'parcel-actions',
    title: 'Akcje karty działki i doku Analizy',
    actions: [
        // --- Karta działki: przyciski (P2)
        parcelAction({ id: 'parcel.report', zone: 'inspector.primary', order: 10, label: 'Raport PDF', hint: 'Raport działki PDF — szablony i zakres do wyboru',
            run: (ctx) => reportDialog.open(cardParcel(ctx)) }),
        parcelAction({ id: 'parcel.save', zone: 'inspector.secondary', order: 20, label: 'Do projektu', hint: 'Dodaj granicę działki do projektu (panel Obiekty)',
            run: (ctx) => { if (addToProject(ctx)) openPanel(ctx, 'objects'); } }),
        // --- Karta działki: menu Analizy ▾ — najpierw widoki doku Analizy, potem narzędzia trybu Teren
        parcelAction({ id: 'parcel.screening', zone: 'inspector.analyses', order: 30, label: 'Otoczenie działki', hint: 'screening', run: runScreening }),
        parcelAction({ id: 'parcel.prices', zone: 'inspector.analyses', order: 31, label: 'Ceny transakcyjne', run: runPrices }),
        parcelAction({ id: 'parcel.permits', zone: 'inspector.analyses', order: 32, label: 'Budowy i pozwolenia', run: (ctx) => openPanel(ctx, 'buildingPermits') }),
        parcelAction({ id: 'parcel.server', zone: 'inspector.analyses', order: 33, label: 'Analiza działki (serwer)', run: (ctx) => openPanel(ctx, 'vpsData') }),
        parcelAction({ id: 'parcel.buffer', zone: 'inspector.analyses', order: 40, separatorBefore: true, label: 'Bufor', hint: 'B',
            run: async (ctx) => { if (!addToProject(ctx)) return; ctx.get('identify')?.close(); await ctx.tools.activate('core.buffer'); } }),
        parcelAction({ id: 'parcel.wz', zone: 'inspector.analyses', order: 41, label: 'Obszar analizowany WZ', hint: 'Z',
            run: async (ctx) => {
                const id = addToProject(ctx); if (!id) return;
                try { ctx.get('objects')?.select(id); } catch { /* zaznaczenie pomocnicze */ }
                ctx.get('identify')?.close(); await ctx.tools.activate('core.wz.area');
            } }),
        parcelAction({ id: 'parcel.terrain', zone: 'inspector.analyses', order: 42, label: 'Wysokości i nachylenie',
            run: async (ctx) => {
                const id = addToProject(ctx); if (!id) return;
                ctx.get('identify')?.close(); await ctx.tools.activate('core.terrain.area'); await runTerrainFor(ctx.get('terrainProfile'), id);
            } }),
        parcelAction({ id: 'parcel.profile', zone: 'inspector.analyses', order: 43, label: 'Profil terenu', run: (ctx) => ctx.tools.activate('core.terrain.profile') }),
        parcelAction({ id: 'parcel.model3d', zone: 'inspector.analyses', order: 44, label: 'Teren 3D',
            run: (ctx) => import('../../terrain3d/terrain3dTool.js').then((m) => m.openParcel3D(cardParcel(ctx))) }),

        // --- Dok Analizy (Etap 5): lista narzędzi analiz
        { id: 'analyses.screening', zone: 'dock:analyses', order: 50, icon: 'screening', label: 'Otoczenie działki', paletteTitle: 'Analizy: Otoczenie działki',
            description: 'Ochrona przyrody, plany, ograniczenia wokół działki (usługi WMS).',
            run: (ctx) => { ctx.get('analysis')?.setPanelMode?.('screening'); openPanel(ctx, 'analysis'); } },
        { id: 'analyses.prices', zone: 'dock:analyses', order: 51, icon: 'market-prices', label: 'Ceny transakcyjne', paletteTitle: 'Analizy: Ceny transakcyjne',
            description: 'Wokół działki albo w widoku mapy (Rejestr Cen Nieruchomości).', run: (ctx) => openPanel(ctx, 'marketPrices') },
        { id: 'analyses.permits', zone: 'dock:analyses', order: 52, icon: 'building-permits', label: 'Budowy i pozwolenia', paletteTitle: 'Analizy: Budowy i pozwolenia',
            description: 'Wnioski, decyzje i zgłoszenia budowlane w okolicy (GUNB).', run: (ctx) => openPanel(ctx, 'buildingPermits') },
        { id: 'analyses.server', zone: 'dock:analyses', order: 53, icon: 'parcel-report', label: 'Analiza działki (serwer)', paletteTitle: 'Analizy: Analiza działki (serwer)',
            description: 'Granice, plan i odległości do budynków i dróg (BDOT10k).', run: (ctx) => openPanel(ctx, 'vpsData') },
        { id: 'analyses.source', zone: 'dock:analyses', order: 54, icon: 'analysis', label: 'Analiza źródła', paletteTitle: 'Analizy: Analiza źródła',
            description: 'Wybrana warstwa w obszarze lub wokół obiektu.',
            run: (ctx) => { ctx.get('analysis')?.setPanelMode?.('manual'); openPanel(ctx, 'analysis'); } },
    ],
});
