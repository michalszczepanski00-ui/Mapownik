/**
 * 19.43.0 (audyt S5) — ochrona projektu przed utratą.
 *
 * Projekt żyje w IndexedDB tej przeglądarki: wyczyszczenie danych witryny, tryb prywatny albo inny komputer
 * oznacza utratę pracy, jeśli użytkownik nigdy nie zapisał pliku .mapownik. Dlatego:
 *  1. przy pierwszej zmianie projektu prosimy przeglądarkę o trwałe przechowywanie danych
 *     (navigator.storage.persist — Chrome/Edge decydują same, Firefox może zapytać użytkownika);
 *  2. po 25 zmianach od ostatniej kopii pliku (i nie częściej niż co 2 godziny) pokazujemy przypomnienie
 *     z przyciskiem „Zapisz kopię”. Zapis pliku z menu Projekt zeruje licznik.
 */
const KEY = 'msportal.backupReminder.v1';
export const BACKUP_REMINDER_CHANGES = 25;
const REMIND_EVERY_MS = 2 * 3600 * 1000;

function read() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { changes: Number(v.changes) || 0, lastBackupAt: v.lastBackupAt ?? null, lastRemindAt: Number(v.lastRemindAt) || 0 }; }
    catch { return { changes: 0, lastBackupAt: null, lastRemindAt: 0 }; }
}
function write(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* tryb prywatny */ } }

/** Wywoływane po zapisaniu pliku projektu (.mapownik). */
export function markBackupSaved() {
    write({ ...read(), changes: 0, lastBackupAt: new Date().toISOString() });
}

let persistRequested = false;
function requestPersistentStorage() {
    if (persistRequested) return;
    persistRequested = true;
    try {
        const storage = navigator.storage;
        if (!storage?.persisted || !storage?.persist) return;
        void storage.persisted().then((already) => (already ? true : storage.persist())).catch(() => {});
    } catch { /* starsza przeglądarka */ }
}

/**
 * @param {{ objectManager: { subscribeMutations: Function }, toasts: { show: Function }, saveBackup: () => Promise<void>, now?: () => number }} options
 * @returns {() => void} odpięcie
 */
export function installBackupReminder({ objectManager, toasts, saveBackup, now = () => Date.now() }) {
    return objectManager.subscribeMutations(() => {
        requestPersistentStorage();
        const state = read();
        state.changes += 1;
        const due = state.changes >= BACKUP_REMINDER_CHANGES && now() - state.lastRemindAt >= REMIND_EVERY_MS;
        if (due) {
            state.lastRemindAt = now();
            toasts.show({
                tone: 'info',
                timeoutMs: 20000,
                message: state.lastBackupAt
                    ? `Od ostatniej kopii projektu (${state.lastBackupAt.slice(0, 10)}) jest ${state.changes} zmian. Projekt jest zapisany tylko w tej przeglądarce — zapisz kopię do pliku.`
                    : 'Projekt jest zapisany tylko w tej przeglądarce. Zapisz kopię do pliku .mapownik, żeby nie stracić pracy po wyczyszczeniu danych przeglądarki.',
                action: { label: 'Zapisz kopię', run: () => { void saveBackup(); } },
            });
        }
        write(state);
    });
}
