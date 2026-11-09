/**
 * 18.0 — rejestr trybów, które przejmują kliknięcia w mapę.
 *
 * Zastępuje trzy listy wpisane na sztywno, które każda nowa funkcja musiała
 * uzupełniać ręcznie:
 *  - interactionCoordinator.suspendOtherInteractionModes (kogo wyłączyć),
 *  - IdentifyManager.shouldIgnoreClick (kto teraz przejmuje kliknięcia),
 *  - App.js SKETCHING_SERVICES (kto może mieć rozpoczęty szkic dla Escape).
 * Funkcja deklaruje swój tryb raz, w manifeście (`interaction`).
 */
export class InteractionRegistry {
    constructor() {
        this.owners = new Map();
    }

    /**
     * @param {object} owner
     * @param {string} owner.id
     * @param {object} owner.service                  menedżer trybu
     * @param {(s) => void} owner.deactivate            wyłącz tryb
     * @param {(s) => boolean} [owner.isCapturing]      czy tryb przejmuje teraz kliknięcia
     * @param {(s) => boolean} [owner.isSketching]      czy jest rozpoczęty szkic
     * @param {(s) => boolean} [owner.abortSketch]      porzuć szkic (Escape)
     * @param {(s) => void} [owner.finishSketch]        zakończ szkic (przycisk Zakończ)
     * @param {(s) => boolean} [owner.undoLastPoint]    cofnij ostatni punkt (Backspace)
     */
    register(owner) {
        if (!owner?.id) throw new Error('Tryb interakcji wymaga identyfikatora.');
        if (this.owners.has(owner.id)) throw new Error(`Tryb interakcji ${owner.id} jest już zarejestrowany.`);
        if (!owner.service) throw new Error(`Tryb interakcji ${owner.id} wymaga serwisu.`);
        if (typeof owner.deactivate !== 'function') throw new Error(`Tryb interakcji ${owner.id} wymaga deactivate().`);
        this.owners.set(owner.id, Object.freeze({ ...owner }));
        return () => this.owners.delete(owner.id);
    }

    list() {
        return [...this.owners.values()];
    }

    get(id) {
        return this.owners.get(id) ?? null;
    }

    /** Wyłącza wszystkie tryby poza wskazanym (wywołuje to każde narzędzie przy aktywacji). */
    suspendOthers(keep) {
        for (const owner of this.owners.values()) {
            if (owner.id === keep) continue;
            try { owner.deactivate(owner.service); }
            catch (error) { console.error(`[tryb ${owner.id}] deactivate`, error); }
        }
    }

    /** Czy któryś tryb (poza wskazanym) przejmuje teraz kliknięcia w mapę. */
    isAnyCapturing(except = null) {
        return this.list().some((owner) => owner.id !== except && safe(() => owner.isCapturing?.(owner.service), false));
    }

    /** Tryb z rozpoczętym szkicem albo null. */
    activeSketch() {
        return this.list().find((owner) => safe(() => owner.isSketching?.(owner.service), false)) ?? null;
    }

    abortActiveSketch() {
        const owner = this.activeSketch();
        if (!owner || typeof owner.abortSketch !== 'function') return false;
        return Boolean(owner.abortSketch(owner.service));
    }

    finishActiveSketch() {
        const owner = this.activeSketch();
        if (!owner || typeof owner.finishSketch !== 'function') return false;
        owner.finishSketch(owner.service);
        return true;
    }

    undoLastPoint() {
        const owner = this.activeSketch();
        if (!owner || typeof owner.undoLastPoint !== 'function') return false;
        return Boolean(owner.undoLastPoint(owner.service));
    }
}

function safe(fn, fallback) {
    try { return fn(); }
    catch { return fallback; }
}
