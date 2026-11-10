/**
 * 19.44.0 (audyt 19.43.0): „Wysokości” z karty działki albo z listy obiektów od razu liczy analizę dla tej
 * działki. Wcześniej otwierał się tylko panel i trzeba było jeszcze kliknąć „Analizuj”.
 */
export async function runTerrainFor(terrain, objectId) {
    if (!terrain || !objectId) return;
    await new Promise((resolve) => window.setTimeout(resolve, 0)); // lista działek narzędzia odświeża się po dodaniu obiektu
    terrain.clearAreaSelection?.();
    terrain.setAreaParcelSelected?.(objectId, true);
    if (terrain.snapshot?.selectedParcelIds?.includes(objectId)) await terrain.analyzeArea?.();
}
