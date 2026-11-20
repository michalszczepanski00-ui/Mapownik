import { t } from '../i18n/index.js';
const DEFAULT_HISTORY_LIMIT = 100;
const DEFAULT_MERGE_WINDOW_MS = 700;
/**
 * Synchronous domain command history.
 *
 * It intentionally stores commands/deltas rather than whole-project snapshots.
 * Runtime objects stay outside the UI store and persistence observes the resulting
 * ObjectManager mutations exactly as for normal edits.
 */
export class CommandBus {
    constructor(historyLimit = DEFAULT_HISTORY_LIMIT, mergeWindowMs = DEFAULT_MERGE_WINDOW_MS) {
        this.undoStack = [];
        this.redoStack = [];
        this.listeners = new Set();
        this.snapshot = {
            canUndo: false,
            canRedo: false,
            undoLabel: null,
            redoLabel: null,
            undoDepth: 0,
            redoDepth: 0,
            error: null,
        };
        this.disposed = false;
        this.lastExecuteAt = 0;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.assertAlive();
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.historyLimit = historyLimit;
        this.mergeWindowMs = mergeWindowMs;
        if (!Number.isInteger(historyLimit) || historyLimit < 1) {
            throw new Error('Limit historii poleceń musi być dodatnią liczbą całkowitą.'); // dev: błąd programisty, nie komunikat dla użytkownika
        }
    }
    execute(command) {
        this.assertAlive();
        try {
            command.execute();
            const now = Date.now();
            const previous = this.undoStack.at(-1);
            const canMerge = Boolean((previous === null || previous === void 0 ? void 0 : previous.mergeWith)
                && now - this.lastExecuteAt <= this.mergeWindowMs
                && previous.mergeWith(command));
            if (!canMerge) {
                this.undoStack.push(command);
                if (this.undoStack.length > this.historyLimit)
                    this.undoStack.shift();
            }
            this.redoStack.length = 0;
            this.lastExecuteAt = now;
            this.emit(null);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : t('commands.nieUdaloSieWykonacPolecenia');
            this.emit(message);
            throw error;
        }
    }
    /**
     * 18.0: identyfikator wpisu na szczycie historii. „Cofnij” w powiadomieniu
     * zapamiętuje go w chwili operacji i cofa TYLKO ten wpis — nie to, co
     * akurat jest najnowsze (np. po Ctrl+Z albo kolejnej edycji).
     */
    topUndoToken() {
        return this.undoStack.at(-1) ?? null;
    }
    undoIf(token) {
        if (!token || this.undoStack.at(-1) !== token) return false;
        this.undo();
        return true;
    }
    undo() {
        this.assertAlive();
        const command = this.undoStack.at(-1);
        if (!command)
            return;
        try {
            command.undo();
            this.undoStack.pop();
            this.redoStack.push(command);
            this.lastExecuteAt = 0;
            this.emit(null);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : t('commands.nieUdaloSieCofnacPolecenia');
            this.emit(message);
            throw error;
        }
    }
    redo() {
        this.assertAlive();
        const command = this.redoStack.at(-1);
        if (!command)
            return;
        try {
            command.execute();
            this.redoStack.pop();
            this.undoStack.push(command);
            if (this.undoStack.length > this.historyLimit)
                this.undoStack.shift();
            this.lastExecuteAt = 0;
            this.emit(null);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : t('commands.nieUdaloSiePonowicPolecenia');
            this.emit(message);
            throw error;
        }
    }
    clear() {
        this.assertAlive();
        if (!this.undoStack.length && !this.redoStack.length && !this.snapshot.error)
            return;
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.lastExecuteAt = 0;
        this.emit(null);
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.listeners.clear();
    }
    emit(error) {
        var _a, _b, _c, _d;
        if (this.disposed)
            return;
        const undo = (_a = this.undoStack.at(-1)) !== null && _a !== void 0 ? _a : null;
        const redo = (_b = this.redoStack.at(-1)) !== null && _b !== void 0 ? _b : null;
        this.snapshot = {
            canUndo: Boolean(undo),
            canRedo: Boolean(redo),
            undoLabel: (_c = undo === null || undo === void 0 ? void 0 : undo.label) !== null && _c !== void 0 ? _c : null,
            redoLabel: (_d = redo === null || redo === void 0 ? void 0 : redo.label) !== null && _d !== void 0 ? _d : null,
            undoDepth: this.undoStack.length,
            redoDepth: this.redoStack.length,
            error,
        };
        for (const listener of this.listeners)
            listener();
    }
    assertAlive() {
        if (this.disposed)
            throw new Error('CommandBus został już zamknięty.'); // dev: błąd programisty, nie komunikat dla użytkownika
    }
}
