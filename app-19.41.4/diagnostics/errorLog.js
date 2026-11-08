/**
 * msportal 17.6.4 — global crash capture with a small persisted ring buffer.
 *
 * Before this, an uncaught exception or a rejected promise outside React's
 * render path (a manager's async method, a DOM event handler, a timer
 * callback, a worker message handler) left no trace anywhere once the tab
 * was closed or reloaded — only console output, which a remote user never
 * shares. This module keeps the last MAX_ENTRIES crash-like events in
 * localStorage (falling back to an in-memory buffer if storage is
 * unavailable — private browsing, blocked site data, quota exceeded) so
 * diagnostyka.html can show them after the fact, and so a support
 * conversation has something concrete to look at instead of "it just
 * stopped working".
 */
const STORAGE_KEY = 'mapownik.diagnostics.errorLog.v1';
const MAX_ENTRIES = 40;
const MAX_FIELD_LENGTH = 4000;

let memoryFallback = null; // used only when localStorage itself is unusable
let installed = false;

function truncate(value) {
    if (typeof value !== 'string')
        return value;
    return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…` : value;
}

function loadEntries() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return memoryFallback ?? [];
    }
}

function saveEntries(entries) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        memoryFallback = null;
    }
    catch {
        memoryFallback = entries;
    }
}

function describeError(value) {
    if (value instanceof Error)
        return { message: value.message, stack: value.stack ?? '' };
    if (value && typeof value === 'object') {
        try {
            return { message: JSON.stringify(value), stack: '' };
        }
        catch {
            return { message: String(value), stack: '' };
        }
    }
    return { message: String(value), stack: '' };
}

/**
 * Appends one entry to the ring buffer. Exported directly (not only via the
 * window-level listeners below) so other call sites — the React error
 * boundary, a manager that already has its own try/catch and just wants the
 * failure on record — can log a crash they already handled themselves.
 */
export function recordError(entry) {
    var _a, _b, _c;
    const record = {
        timestamp: new Date().toISOString(),
        type: entry.type,
        message: truncate((_a = entry.message) !== null && _a !== void 0 ? _a : ''),
        stack: truncate((_b = entry.stack) !== null && _b !== void 0 ? _b : ''),
        source: truncate((_c = entry.source) !== null && _c !== void 0 ? _c : ''),
        url: truncate(String(window.location ? window.location.href : '')),
        appVersion: window.__MAPOWNIK_DEPLOY_VERSION__ ?? null,
    };
    const entries = loadEntries();
    entries.push(record);
    while (entries.length > MAX_ENTRIES)
        entries.shift();
    saveEntries(entries);
    return record;
}

export function getErrorLog() {
    return loadEntries();
}

export function clearErrorLog() {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    }
    catch { /* nothing durable to clear */ }
    memoryFallback = [];
}

/**
 * Registers window-level 'error' and 'unhandledrejection' listeners. Safe to
 * call more than once — only the first call installs anything. Should run
 * as early as possible in the app's lifetime (main.js, before rendering) so
 * it covers the whole session rather than just errors after some later
 * point.
 */
export function installGlobalErrorHandlers() {
    if (installed)
        return;
    installed = true;
    window.addEventListener('error', (event) => {
        // Resource-load failures (a missing image, an aborted script fetch)
        // also dispatch a plain 'error' event on window with no message and
        // no .error — not useful here and would just add noise to the log.
        if (!event.message && !event.error)
            return;
        const { message, stack } = event.error ? describeError(event.error) : { message: event.message, stack: '' };
        recordError({
            type: 'error',
            message,
            stack,
            source: `${event.filename ?? ''}:${event.lineno ?? 0}:${event.colno ?? 0}`,
        });
    });
    window.addEventListener('unhandledrejection', (event) => {
        const { message, stack } = describeError(event.reason);
        recordError({ type: 'unhandledrejection', message, stack, source: '' });
    });
}
