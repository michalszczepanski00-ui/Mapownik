import { t } from '../i18n/index.js';

const EMPTY_SNAPSHOT = {
    items: [],
    loadingCount: 0,
    errorCount: 0,
};
/**
 * Runtime registry for user-facing tools.
 *
 * Invariants:
 * - manifests are lightweight and available synchronously for UI rendering,
 * - executable code is lazy-loaded on first activation,
 * - a failed tool is isolated and does not destabilize the map runtime,
 * - ToolRegistry owns the lifecycle of loaded tool modules; keyboard shortcuts
 *   are commands in keyboard/CommandRegistry (18.0),
 * - React consumes only immutable snapshots and never imports GIS managers.
 */
export class ToolRegistry {
    constructor() {
        this.entries = new Map();
        this.listeners = new Set();
        this.disposers = new Set();
        this.snapshot = EMPTY_SNAPSHOT;
        this.activationRequests = new Map();
        this.disposed = false;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.assertAlive();
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        /** Recompute lightweight active/enabled state without loading tool code. */
        this.refresh = () => {
            if (this.disposed)
                return;
            const items = [...this.entries.values()]
                .map((entry) => {
                const { manifest, isActive, isEnabled } = entry.registration;
                return {
                    ...manifest,
                    active: safeProbe(isActive, false),
                    enabled: safeProbe(isEnabled, true),
                    loaded: Boolean(entry.module),
                    loading: Boolean(entry.loadingPromise),
                    error: entry.error,
                };
            })
                .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pl'));
            this.snapshot = {
                items,
                loadingCount: items.filter((item) => item.loading).length,
                errorCount: items.filter((item) => item.error).length,
            };
            for (const listener of this.listeners)
                listener();
        };
    }
    register(registration) {
        var _a, _b, _c;
        this.assertAlive();
        const { id } = registration.manifest;
        if (!id.trim())
            throw new Error('Tool manifest must have a non-empty id.'); // dev: błąd programisty, nie komunikat dla użytkownika
        if (this.entries.has(id))
            throw new Error(`Tool "${id}" is already registered.`); // dev: błąd programisty, nie komunikat dla użytkownika
        const duplicateShortcut = registration.manifest.shortcut
            ? [...this.entries.values()].find((entry) => { var _a, _b; return (((_a = entry.registration.manifest.shortcut) === null || _a === void 0 ? void 0 : _a.code) === ((_b = registration.manifest.shortcut) === null || _b === void 0 ? void 0 : _b.code)); })
            : null;
        if (duplicateShortcut) {
            throw new Error(`Tool shortcut ${(_b = (_a = registration.manifest.shortcut) === null || _a === void 0 ? void 0 : _a.label) !== null && _b !== void 0 ? _b : (_c = registration.manifest.shortcut) === null || _c === void 0 ? void 0 : _c.code} `
                + `is already used by "${duplicateShortcut.registration.manifest.id}".`);
        }
        this.entries.set(id, {
            registration,
            module: null,
            loadingPromise: null,
            error: null,
        });
        this.refresh();
        return () => this.unregister(id);
    }
    unregister(id) {
        var _a, _b;
        this.assertAlive();
        const entry = this.entries.get(id);
        if (!entry)
            return;
        (_b = (_a = entry.module) === null || _a === void 0 ? void 0 : _a.dispose) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.entries.delete(id);
        this.refresh();
    }
    /** Add lifecycle cleanup for state sources observed by tool registrations. */
    addDisposer(disposer) {
        this.assertAlive();
        this.disposers.add(disposer);
        return () => this.disposers.delete(disposer);
    }
    async activate(id) {
        var _a, _b;
        this.assertAlive();
        const entry = this.entries.get(id);
        if (!entry)
            throw new Error(`Unknown tool: ${id}`);
        if (!safeProbe(entry.registration.isEnabled, true))
            return false;
        const scope = (_a = entry.registration.manifest.activationScope) !== null && _a !== void 0 ? _a : id;
        const request = ((_b = this.activationRequests.get(scope)) !== null && _b !== void 0 ? _b : 0) + 1;
        this.activationRequests.set(scope, request);
        try {
            entry.error = null;
            const module = await this.loadModule(entry);
            // Last user intent wins if two lazy tools are requested before either finishes loading.
            if (this.disposed || this.entries.get(id) !== entry || request !== this.activationRequests.get(scope))
                return false;
            module.activate();
            entry.error = null;
            this.refresh();
            return true;
        }
        catch (error) {
            entry.error = error instanceof Error ? error.message : t('tools.nieUdaloSieUruchomicNarzedzia');
            this.refresh();
            return false;
        }
    }
    /**
     * 18.11.0: wczytuje w tle kod wszystkich narzędzi (bez aktywacji). Bez tego
     * pierwsze użycie narzędzia czekało ~0,4 s na import modułu, a kliknięcia
     * w mapę w tym czasie trafiały do zwykłej nawigacji i przepadały.
     * Błędy są ciche — zwykła aktywacja spróbuje ponownie i pokaże błąd.
     */
    async preloadAll() {
        for (const entry of [...this.entries.values()]) {
            if (this.disposed) return;
            if (entry.module || entry.loadingPromise) continue;
            try { await this.loadModule(entry); }
            catch { /* aktywacja zgłosi błąd */ }
        }
    }
    dispose() {
        var _a, _b;
        if (this.disposed)
            return;
        this.disposed = true;
        this.activationRequests.clear();
        for (const disposer of this.disposers)
            disposer();
        this.disposers.clear();
        for (const entry of this.entries.values())
            (_b = (_a = entry.module) === null || _a === void 0 ? void 0 : _a.dispose) === null || _b === void 0 ? void 0 : _b.call(_a);
        this.entries.clear();
        this.listeners.clear();
        this.snapshot = EMPTY_SNAPSHOT;
    }
    async loadModule(entry) {
        var _a;
        if (entry.module)
            return entry.module;
        if (entry.loadingPromise)
            return entry.loadingPromise;
        entry.loadingPromise = entry.registration.load();
        this.refresh();
        try {
            const module = await entry.loadingPromise;
            if (!module || typeof module.activate !== 'function') {
                throw new Error(t('tools.zaladowanyModulNarzedziaNieImplementuje'));
            }
            const id = entry.registration.manifest.id;
            if (this.disposed || this.entries.get(id) !== entry) {
                (_a = module.dispose) === null || _a === void 0 ? void 0 : _a.call(module);
                return module;
            }
            entry.module = module;
            return module;
        }
        finally {
            entry.loadingPromise = null;
            this.refresh();
        }
    }
    assertAlive() {
        if (this.disposed)
            throw new Error('ToolRegistry has already been disposed.');
    }
}
function safeProbe(probe, fallback) {
    if (!probe)
        return fallback;
    try {
        return probe();
    }
    catch {
        return fallback;
    }
}
