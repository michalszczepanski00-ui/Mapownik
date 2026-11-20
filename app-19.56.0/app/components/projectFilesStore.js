/**
 * 19.53.0 (Etap 6) — prośba „pokaż sekcję plików GIS” w panelu Obiekty (menu Projekt i Udostępnij).
 * Sekcja (ProjectFiles) rozwija się i przewija do widoku przy każdej nowej prośbie.
 */
let revision = 0;
const listeners = new Set();
export const projectFilesRequest = {
    request() { revision += 1; listeners.forEach((listener) => listener()); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return revision; },
};
