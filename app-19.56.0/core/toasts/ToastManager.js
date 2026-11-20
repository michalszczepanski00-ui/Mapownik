const EMPTY = Object.freeze({ items: [] });
let nextId = 0;

/**
 * 18.0 — krótkie powiadomienia z akcją (np. „Usunięto „Poligon 1” · Cofnij”).
 *
 * Zastępują potwierdzenia przy operacjach, które da się cofnąć: dla
 * profesjonalisty okno „Czy na pewno?” przy każdym usunięciu jest kosztem,
 * a nie zabezpieczeniem, skoro działa Ctrl+Z. Potwierdzenie zostaje tam,
 * gdzie cofnięcie nie wystarcza (usuwanie wielu obiektów, import „zastąp”).
 *
 * Wolny od Reacta, jak appDialogs: getSnapshot/subscribe dla useSyncExternalStore.
 */
export class ToastManager {
    constructor({ maxItems = 3 } = {}) {
        this.items = [];
        this.maxItems = maxItems;
        this.timers = new Map();
        this.listeners = new Set();
        this.snapshot = EMPTY;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
    }

    /**
     * @param {object} toast
     * @param {string} toast.message
     * @param {'info'|'success'|'warning'|'danger'} [toast.tone]
     * @param {{ label: string, run: () => void }} [toast.action]
     * @param {number} [toast.timeoutMs]  0 = do zamknięcia ręcznie
     * @param {() => void} [toast.onDismiss] wywoływane przy każdym zniknięciu powiadomienia
     */
    show({ message, tone = 'info', action = null, timeoutMs = 6000, onDismiss = null }) {
        const id = `toast-${++nextId}`;
        const all = [...this.items, Object.freeze({ id, message: String(message), tone, action, onDismiss })];
        const evicted = all.slice(0, Math.max(0, all.length - this.maxItems));
        this.items = all.slice(-this.maxItems);
        for (const item of evicted) this.finish(item);
        if (timeoutMs > 0 && typeof setTimeout === 'function') this.timers.set(id, setTimeout(() => this.dismiss(id), timeoutMs));
        this.emit();
        return id;
    }

    /** Sprząta po powiadomieniu, które zniknęło (zamknięte, wygasłe, wypchnięte). */
    finish(item) {
        const timer = this.timers.get(item.id);
        if (timer) clearTimeout(timer);
        this.timers.delete(item.id);
        try { item.onDismiss?.(); } catch (error) { console.error('[powiadomienie] onDismiss', error); }
    }

    runAction(id) {
        const toast = this.items.find((item) => item.id === id);
        this.dismiss(id);
        toast?.action?.run?.();
    }

    dismiss(id) {
        const item = this.items.find((entry) => entry.id === id);
        if (!item) return;
        this.items = this.items.filter((entry) => entry.id !== id);
        this.finish(item);
        this.emit();
    }

    emit() {
        this.snapshot = Object.freeze({ items: this.items });
        for (const listener of this.listeners) listener();
    }
}

export const appToasts = new ToastManager();
