const EMPTY_SERVICES = Object.freeze({});

/**
 * Rejestr serwisów runtime'u mapy (menedżery GIS, CommandBus, ToolRegistry).
 *
 * Przed Fazą 0 App.js trzymał każdy menedżer w osobnym useState i przekazywał
 * do MapStage trzynaście callbacków `onXManagerChange`, a stamtąd w dół jako
 * propsy. Każda nowa funkcja oznaczała zmianę w App.js, MapStage.js i w każdym
 * komponencie po drodze.
 *
 * Hub jest zwykłym źródłem dla useSyncExternalStore: MapRuntime publikuje tu
 * swoje menedżery jednym wywołaniem, a komponenty pobierają je po nazwie —
 * niezależnie od tego, jak głęboko są w drzewie.
 *
 * Kontrakt:
 *  - getSnapshot() zwraca zamrożony obiekt i TĘ SAMĄ referencję, dopóki nic się
 *    nie zmieniło (wymóg useSyncExternalStore — inaczej pętla renderów),
 *  - publish() scala i powiadamia raz, nawet dla wielu serwisów naraz,
 *  - błąd jednego subskrybenta nie może zablokować pozostałych.
 */
export class ServiceHub {
    constructor() {
        this.services = EMPTY_SERVICES;
        this.listeners = new Set();
        this.getSnapshot = () => this.services;
        this.subscribe = (listener) => {
            if (typeof listener !== 'function') throw new TypeError('ServiceHub.subscribe wymaga funkcji.');
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
    }

    /** Pojedynczy serwis albo null, gdy runtime jeszcze go nie opublikował. */
    get(name) {
        return this.services[name] ?? null;
    }

    /**
     * Scala mapę `{ nazwa: serwis }`. Wartość null/undefined wyrejestrowuje
     * serwis — tak sprząta MapStage przy odmontowaniu runtime'u.
     */
    publish(patch) {
        if (!patch || typeof patch !== 'object') return;
        let next = null;
        for (const [name, service] of Object.entries(patch)) {
            const value = service ?? null;
            const current = this.services[name] ?? null;
            if (current === value) continue;
            if (next === null) next = { ...this.services };
            if (value === null) delete next[name];
            else next[name] = value;
        }
        // Brak realnej zmiany -> brak nowej referencji -> brak renderu.
        if (next === null) return;
        this.services = Object.freeze(next);
        this.notify();
    }

    /** Wyrejestrowuje wszystkie serwisy (odmontowanie runtime'u mapy). */
    clear() {
        if (this.services === EMPTY_SERVICES) return;
        this.services = EMPTY_SERVICES;
        this.notify();
    }

    notify() {
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch (error) {
                console.error('msportal ServiceHub listener error', error);
            }
        }
    }
}
