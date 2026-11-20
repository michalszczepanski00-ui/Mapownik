import { defineFeature } from '../defineFeature.js';
import { projectFilesRequest } from '../../app/components/projectFilesStore.js';

/**
 * 19.53.0 (Etap 6) — akcje górnego paska: menu Projekt ▾ (strefa topbar.project)
 * i Udostępnij ▾ (strefa topbar.share). Wywołują te same akcje formatu „Plik projektu”
 * co dotąd (features/builtin/exportFeature.js) oraz te same panele (Eksport, Obiekty → pliki GIS).
 */

/** Akcja formatu pliku projektu (save / open / share) — jedna implementacja dla menu, panelu i palety. */
function projectFormatAction(ctx, id) {
    const action = ctx.features?.list('exportFormats').find((format) => format.id === 'project')?.actions.find((item) => item.id === id);
    if (!action) throw new Error('Pliki projektu są niedostępne.');
    return action;
}

/** Okno wyboru pliku (wywoływane zaraz po kliknięciu w menu — w czasie aktywacji przez użytkownika). */
function pickFile(accept) {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = accept; input.hidden = true;
        input.addEventListener('change', () => { resolve(input.files?.[0] ?? null); input.remove(); }, { once: true });
        input.addEventListener('cancel', () => { resolve(null); input.remove(); }, { once: true });
        document.body.append(input);
        input.click();
    });
}

const showGisFiles = (ctx) => {
    ctx.panels?.open?.('objects');
    window.setTimeout(() => projectFilesRequest.request(), 0);
};

export const projectActionsFeature = defineFeature({
    id: 'project-actions',
    title: 'Menu Projekt i Udostępnij',
    actions: [
        { id: 'project.open', zone: 'topbar.project', order: 10, label: 'Otwórz projekt…', paletteTitle: 'Projekt: Otwórz plik projektu…',
            run: async (ctx) => {
                const action = projectFormatAction(ctx, 'open');
                const file = await pickFile(action.accept ?? '.mapownik,application/json');
                if (file) await action.run(ctx, {}, file);
            } },
        { id: 'project.save', zone: 'topbar.project', order: 20, label: 'Zapisz plik projektu', paletteTitle: 'Projekt: Zapisz plik projektu',
            run: (ctx) => projectFormatAction(ctx, 'save').run(ctx, {}) },
        { id: 'project.gis', zone: 'topbar.project', order: 30, separatorBefore: true, label: 'Importuj pliki GIS…', paletteTitle: 'Projekt: Importuj pliki GIS…',
            hint: 'GeoJSON i inne formaty — panel Obiekty', run: showGisFiles },
        { id: 'share.link', zone: 'topbar.share', order: 10, label: 'Link do projektu…', paletteTitle: 'Udostępnij: link do projektu…',
            hint: 'Kopia tylko do odczytu pod adresem', run: (ctx) => projectFormatAction(ctx, 'share').run(ctx, {}) },
        { id: 'share.map', zone: 'topbar.share', order: 20, label: 'Eksport mapy (PNG / PDF)…', paletteTitle: 'Udostępnij: eksport mapy PNG / PDF…',
            run: (ctx) => ctx.panels?.open?.('export') },
        { id: 'share.gis', zone: 'topbar.share', order: 30, label: 'Pliki GIS…', paletteTitle: 'Udostępnij: pliki GIS (eksport)…',
            hint: 'GeoJSON i inne formaty — panel Obiekty', run: showGisFiles },
    ],
});
