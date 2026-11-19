import { t } from '../../i18n/index.js';
const EMPTY = Object.freeze({ request: null });

let nextId = 0;

/**
 * Kolejka okien dialogowych aplikacji.
 *
 * Zastępuje `window.confirm` i `window.prompt`. Powody są trzy, wszystkie
 * praktyczne, a nie estetyczne:
 *  - natywne okienko BLOKUJE wątek: rysowanie tekstu przerywało się modalem
 *    systemowym w środku obsługi `drawend`, więc mapa zamierała do czasu
 *    odpowiedzi,
 *  - natywne okienko nie da się wystylizować ani przetestować (Playwright musi
 *    je przechwytywać osobnym handlerem `page.on('dialog')`),
 *  - w niektórych przeglądarkach użytkownik może je trwale wyciszyć
 *    („nie pokazuj więcej okien z tej strony"), co po cichu wyłączało
 *    potwierdzenie usunięcia.
 *
 * Menedżer jest świadomie wolny od Reacta: to zwykłe źródło dla
 * `useSyncExternalStore` (getSnapshot/subscribe), więc runtime mapy może go
 * używać bez zależności od warstwy widoku.
 *
 * Kontrakt:
 *  - `getSnapshot()` zwraca zamrożony obiekt i TĘ SAMĄ referencję, dopóki nic
 *    się nie zmieniło,
 *  - żądania są kolejkowane FIFO: drugie wywołanie nie gubi pierwszego,
 *  - każde `ask()` kończy się dokładnie jednym rozstrzygnięciem — również gdy
 *    menedżer zostanie zamknięty w trakcie (obietnica nie wisi wtedy w
 *    nieskończoność).
 */
export class DialogManager {
    constructor() {
        this.queue = [];
        this.listeners = new Set();
        this.snapshot = EMPTY;
        this.disposed = false;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            if (typeof listener !== 'function') throw new TypeError('DialogManager.subscribe wymaga funkcji.');
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
    }

    /**
     * Potwierdzenie tak/nie. Rozstrzyga się na `true` tylko przy świadomym
     * potwierdzeniu — zamknięcie klawiszem Escape czy kliknięcie w tło daje
     * `false`, tak samo jak natywne `confirm()`.
     */
    confirm(options = {}) {
        return this.ask({
            kind: 'confirm',
            title: options.title ?? t('core.potwierdz'),
            message: options.message ?? '',
            hint: options.hint ?? '',
            confirmLabel: options.confirmLabel ?? t('core.potwierdz'),
            cancelLabel: options.cancelLabel ?? t('core.anuluj'),
            tone: options.tone === 'danger' ? 'danger' : 'default',
        }, false);
    }

    /**
     * Pobranie krótkiego tekstu. Rozstrzyga się na `null` przy anulowaniu —
     * wywołujący sam decyduje, czy podstawić wartość domyślną.
     */
    prompt(options = {}) {
        return this.ask({
            kind: 'prompt',
            title: options.title ?? t('core.wpiszWartosc'),
            message: options.message ?? '',
            hint: options.hint ?? '',
            label: options.label ?? t('core.wartosc'),
            defaultValue: options.defaultValue ?? '',
            placeholder: options.placeholder ?? '',
            maxLength: Number.isFinite(options.maxLength) ? options.maxLength : 200,
            confirmLabel: options.confirmLabel ?? t('core.zapisz'),
            cancelLabel: options.cancelLabel ?? t('core.anuluj'),
            tone: 'default',
        }, null);
    }

    ask(request, cancelledValue) {
        if (this.disposed) return Promise.resolve(cancelledValue);
        return new Promise((resolve) => {
            nextId += 1;
            this.queue.push({
                request: Object.freeze({ ...request, id: `dialog-${nextId}` }),
                resolve,
                cancelledValue,
            });
            if (this.queue.length === 1) this.publishHead();
        });
    }

    /** Rozstrzyga aktywne okno i od razu pokazuje kolejne z kolejki. */
    settle(value) {
        const entry = this.queue.shift();
        if (!entry) return;
        this.publishHead();
        entry.resolve(value);
    }

    /** Anulowanie: Escape, kliknięcie w tło, przycisk „Anuluj". */
    cancel() {
        const entry = this.queue[0];
        if (!entry) return;
        this.settle(entry.cancelledValue);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        const pending = this.queue.splice(0);
        this.queue = [];
        this.snapshot = EMPTY;
        this.notify();
        this.listeners.clear();
        // Obietnice rozstrzygane po wyczyszczeniu stanu: wywołujący nigdy nie
        // zostaje z `await`, który się nie kończy.
        for (const entry of pending) entry.resolve(entry.cancelledValue);
    }

    publishHead() {
        const head = this.queue[0]?.request ?? null;
        if (this.snapshot.request === head) return;
        this.snapshot = head === null ? EMPTY : Object.freeze({ request: head });
        this.notify();
    }

    notify() {
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch (error) {
                console.error('msportal DialogManager listener error', error);
            }
        }
    }
}

/**
 * Jedna instancja na aplikację — tak samo jak `localProjectRepository`.
 * Dzięki temu menedżery runtime'u (EditingManager) i powłoka React sięgają do
 * tej samej kolejki bez przekazywania jej przez pół drzewa komponentów, a
 * przemontowanie runtime'u mapy nie gubi otwartego okna.
 */
export const appDialogs = new DialogManager();
