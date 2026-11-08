const STORAGE_KEY = 'mapownik:feature-settings-v1';

// Przy zablokowanych danych witryny samo odczytanie window.localStorage rzuca
// SecurityError — ustawienia działają wtedy tylko do końca sesji.
function defaultStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function readStored(storage) {
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * 18.1 — ustawienia zadeklarowane przez funkcje (slot `settings`).
 *
 * Funkcja czyta wartość przez ctx.settings.get(id); menu Ustawienia rysuje
 * pozycje z deklaracji i zmienia je przez set(). Wartości są zapamiętywane
 * w przeglądarce (to preferencje użytkownika, nie dane projektu). Niezależne
 * od Reacta i od stanu powłoki — deklaracje funkcji nie importują store.
 */
export class FeatureSettings {
    constructor(definitions = [], { storage } = {}) {
        this.storage = storage === undefined ? defaultStorage() : storage;
        this.definitions = new Map();
        for (const definition of definitions) {
            if (this.definitions.has(definition.id)) throw new Error(`Ustawienie ${definition.id} jest zadeklarowane dwa razy.`); // dev: błąd programisty, nie komunikat dla użytkownika
            this.definitions.set(definition.id, definition);
        }
        const stored = readStored(this.storage);
        this.values = {};
        for (const [id, definition] of this.definitions) {
            let migratedRepeat = false;
            try { migratedRepeat = id === 'editing.repeat' && this.storage?.getItem('mapownik:ui-prefs-v1') != null; } catch {}
            this.values[id] = typeof stored[id] === 'boolean' ? stored[id] : migratedRepeat ? true : definition.default;
        }
        if (this.definitions.has('editing.repeat') && typeof stored['editing.repeat'] !== 'boolean') {
            try { this.storage?.setItem(STORAGE_KEY, JSON.stringify({ ...stored, ...this.values })); } catch {}
        }
        this.listeners = new Set();
        this.snapshot = Object.freeze({ values: Object.freeze({ ...this.values }) });
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
    }

    list() {
        return [...this.definitions.values()].sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000));
    }

    get(id) {
        if (!this.definitions.has(id)) throw new Error(`Nieznane ustawienie: ${id}`);
        return this.values[id];
    }

    set(id, value) {
        if (!this.definitions.has(id)) throw new Error(`Nieznane ustawienie: ${id}`);
        const next = Boolean(value);
        if (this.values[id] === next) return;
        this.values = { ...this.values, [id]: next };
        try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values)); } catch { /* tryb prywatny */ }
        this.snapshot = Object.freeze({ values: Object.freeze({ ...this.values }) });
        for (const listener of this.listeners) listener();
    }

    /** Przywraca wartości domyślne (np. „Przywróć ustawienia”). */
    reset() {
        for (const [id, definition] of this.definitions) this.set(id, definition.default);
    }

    dispose() {
        this.listeners.clear();
    }
}

export const FEATURE_SETTINGS_STORAGE_KEY = STORAGE_KEY;
