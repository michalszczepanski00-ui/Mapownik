import { store } from '../store/store.js';
import { setTheme } from '../store/uiSlice.js';
import { hydratePanels, DEFAULT_LAYERS_PANEL_WIDTH } from '../store/panelsSlice.js';
import { fromLegacyPanelPrefs, toLegacyPanelPrefs } from '../store/panelsPersistence.js';
import { LOCAL_PROJECT_ID, PROJECT_SCHEMA_VERSION, } from './projectTypes.js';
import { t } from '../i18n/index.js';
const OBJECT_SAVE_DELAY = 250;
const STATE_SAVE_DELAY = 400;
const RETRY_DELAYS = [600, 2000, 6000, 15000];
// 17.6.4: store.subscribe() below fires synchronously on every single Redux
// dispatch — up to ~60×/sec while the user drags a panel edge or pans the
// map, since each of those already dispatches roughly once per animation
// frame. Each firing previously ran scheduleStateSaveIfChanged() in full
// (captureState() + JSON.stringify fingerprinting) even though the actual
// save stays debounced by STATE_SAVE_DELAY regardless — pure repeated CPU
// work during exactly the interactions that most need to stay smooth. This
// throttle caps how often that check itself runs, with a trailing call
// guaranteed so the final state after a burst is never missed.
const STORE_CHANGE_THROTTLE_MS = 200;
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Coordinates persistence without making runtime GIS managers depend on
 * IndexedDB implementation details. Pending buffers describe the latest
 * desired state and are cleared only after a successful commit.
 *
 * 17.6.4: two tabs open on the same project used to both run this class
 * independently against the same shared IndexedDB database, each on its own
 * autosave timers — whichever tab's debounce fired last would silently
 * clobber the other tab's more recent writes, with neither tab ever told
 * anything was wrong. A Web Locks API lock (one per projectId) now makes
 * exactly one tab the writer at a time; every other tab keeps loading and
 * showing the project normally but buffers its changes instead of writing
 * them, and `readOnly` in the snapshot drives a banner so the person knows
 * why (MapStage.js). Since 19.19.0 there is deliberately no automatic handover:
 * the waiting tab must reload the latest project before acquiring write access.
 */
export class LocalProjectSession {
    constructor(options) {
        var _a;
        this.listeners = new Set();
        this.unsubscribers = [];
        this.pendingObjectChanges = new Map();
        this.pendingClearRevision = null;
        this.pendingState = null;
        this.nextMutationRevision = 0;
        this.objectSaveTimer = null;
        this.stateSaveTimer = null;
        this.retryTimer = null;
        this.retryAttempt = 0;
        this.objectFlushQueued = false;
        this.stateFlushQueued = false;
        this.queuedWriteCount = 0;
        this.writeQueue = Promise.resolve();
        this.started = false;
        this.suspended = false;
        this.disposing = false;
        this.disposed = false;
        this.lastSavedStateFingerprint = '';
        this.lastWriteError = null;
        // Cross-tab write lock state (see class docblock).
        this.hasLock = false;
        this.lockRequested = false;
        this.releaseLock = null;
        // store.subscribe() throttle state (see STORE_CHANGE_THROTTLE_MS above).
        this.storeChangeThrottleTimer = null;
        this.storeChangeLastRun = 0;
        this.snapshot = {
            status: 'idle',
            error: null,
            lastSavedAt: null,
            restoredObjectCount: 0,
            issues: [],
            pendingChanges: 0,
            retryInMs: null,
            readOnly: false,
        };
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            if (this.disposed)
                return () => undefined;
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.options = options;
        if (!options.repository)
            throw new Error('LocalProjectSession wymaga jawnie przekazanego repozytorium.');
        this.repository = options.repository;
        this.projectId = (_a = options.projectId) !== null && _a !== void 0 ? _a : LOCAL_PROJECT_ID;
    }
    async restore() {
        this.assertAlive();
        this.updateSnapshot({ status: 'loading', error: null });
        try {
            // Run the project read and the initial (non-blocking) lock check
            // concurrently — reading the project should never wait on the
            // lock, but by the time restore() resolves, hasLock/readOnly
            // must already be settled one way or the other, not still
            // "pending", so callers (and startAutosave()'s very first
            // mutation) see consistent state immediately rather than a
            // window where a write silently gets buffered for no visible
            // reason.
            const [loaded] = await Promise.all([
                this.repository.loadProject(this.projectId),
                this.requestProjectLock(),
            ]);
            if (this.disposed)
                return false;
            this.options.objectManager.replaceAll(loaded.objects);
            if (loaded.state)
                this.applyState(loaded.state);
            this.lastSavedStateFingerprint = this.createStateFingerprint();
            this.updateSnapshot({
                status: 'ready',
                restoredObjectCount: loaded.objects.length,
                issues: loaded.issues,
                pendingChanges: 0,
                retryInMs: null,
            });
            return true;
        }
        catch (error) {
            this.lastWriteError = errorMessage(error);
            this.updateSnapshot({ status: 'error', error: this.lastWriteError });
            return false;
        }
    }
    startAutosave() {
        this.assertAlive();
        if (this.started || this.disposing)
            return;
        this.started = true;
        this.unsubscribers.push(this.options.objectManager.subscribeMutations((mutation) => this.handleObjectMutation(mutation)), this.options.layerManager.subscribe(() => this.notifyStoreChanged()), this.options.basemapManager.subscribe(() => this.notifyStoreChanged()), store.subscribe(() => this.notifyStoreChanged()));
        const onPageHide = () => this.flushBestEffort();
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden')
                this.flushBestEffort();
        };
        window.addEventListener('pagehide', onPageHide);
        document.addEventListener('visibilitychange', onVisibilityChange);
        this.unsubscribers.push(() => window.removeEventListener('pagehide', onPageHide), () => document.removeEventListener('visibilitychange', onVisibilityChange));
    }
    async exportProjectData() {
        var _a;
        this.assertAlive();
        await this.flushPendingChanges();
        const loaded = await this.repository.loadProject(this.projectId);
        return {
            ...loaded,
            objects: this.options.objectManager.exportObjects(),
            state: (_a = loaded.state) !== null && _a !== void 0 ? _a : this.captureState(),
        };
    }
    async replaceProjectData(payload) {
        var _a;
        this.assertAlive();
        if (!this.hasLock) {
            // A full project replace (e.g. importing a .mapownik file) must
            // never fire from a read-only tab — flushPendingChanges() below
            // would otherwise silently no-op the buffered changes and this
            // would still overwrite whatever the actual writing tab has.
            throw new Error(t('persistence.projektJestEdytowanyWInnej'));
        }
        await this.flushPendingChanges();
        this.suspended = true;
        this.clearSaveTimers();
        this.clearRetryTimer();
        try {
            const loaded = await this.repository.replaceProject(this.projectId, payload);
            this.pendingObjectChanges.clear();
            this.pendingClearRevision = null;
            this.pendingState = null;
            this.options.objectManager.replaceAll(loaded.objects);
            if (loaded.state)
                this.applyState(loaded.state);
            (_a = this.options.commandBus) === null || _a === void 0 ? void 0 : _a.clear();
            this.lastWriteError = null;
            this.retryAttempt = 0;
            this.lastSavedStateFingerprint = this.createStateFingerprint();
            this.updateSnapshot({
                status: 'ready',
                error: null,
                lastSavedAt: new Date().toISOString(),
                restoredObjectCount: loaded.objects.length,
                issues: loaded.issues,
                pendingChanges: 0,
                retryInMs: null,
            });
            return loaded;
        }
        finally {
            this.suspended = false;
        }
    }
    async replaceObjects(objects) {
        const current = await this.exportProjectData();
        const state = this.captureState();
        return this.replaceProjectData({
            name: current.meta.name,
            objects,
            state,
        });
    }
    async flushPendingChanges() {
        this.assertAlive();
        this.clearSaveTimers();
        this.prepareStateForSave();
        if (!this.hasLock && this.hasPendingChanges()) {
            // flushObjectChanges()/flushState() intentionally no-op without
            // the write lock (see there), so the retry loop below would
            // just spin four times and fail with a generic message. Fail
            // fast with the real reason instead.
            throw new Error(t('persistence.projektJestEdytowanyWInnej2'));
        }
        for (let pass = 0; pass < 4; pass += 1) {
            this.flushObjectChanges();
            this.flushState();
            await this.writeQueue;
            if (!this.hasPendingChanges())
                return;
            if (this.lastWriteError)
                throw new Error(t('persistence.nieMoznaPrzygotowacAktualnegoProjektu', { lastWriteError: this.lastWriteError }));
        }
        throw new Error(t('persistence.nieUdaloSieOproznicKolejki'));
    }
    async dispose() {
        if (this.disposed || this.disposing)
            return;
        this.disposing = true;
        this.clearSaveTimers();
        this.clearRetryTimer();
        if (this.storeChangeThrottleTimer !== null) {
            window.clearTimeout(this.storeChangeThrottleTimer);
            this.storeChangeThrottleTimer = null;
        }
        this.prepareStateForSave();
        this.started = false;
        this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
        // A second immediate attempt protects against a short-lived IndexedDB
        // failure during component teardown.
        for (let attempt = 0; attempt < 2 && this.hasPendingChanges() && this.hasLock; attempt += 1) {
            this.flushObjectChanges();
            this.flushState();
            await this.writeQueue;
        }
        // Give up the write lock last, after the final flush attempts above,
        // so a tab waiting on it only takes over once this tab is truly done
        // writing.
        this.releaseLock?.();
        this.disposed = true;
        this.disposing = false;
        this.listeners.clear();
    }
    handleObjectMutation(mutation) {
        if (this.suspended)
            return;
        const revision = this.nextRevision();
        if (mutation.type === 'upsert') {
            this.pendingObjectChanges.set(mutation.object.id, {
                revision,
                type: 'upsert',
                object: mutation.object,
            });
        }
        else if (mutation.type === 'remove') {
            this.pendingObjectChanges.set(mutation.id, {
                revision,
                type: 'remove',
                id: mutation.id,
            });
        }
        else {
            this.pendingClearRevision = revision;
            this.pendingObjectChanges.clear();
        }
        this.scheduleObjectFlush();
        this.updatePersistenceStatus();
    }
    scheduleObjectFlush(delay = OBJECT_SAVE_DELAY) {
        if (this.disposed || this.disposing)
            return;
        if (this.objectSaveTimer !== null)
            window.clearTimeout(this.objectSaveTimer);
        this.objectSaveTimer = window.setTimeout(() => {
            this.objectSaveTimer = null;
            this.flushObjectChanges();
        }, delay);
    }
    flushObjectChanges() {
        if (this.disposed || this.objectFlushQueued || !this.hasPendingObjectChanges())
            return;
        if (!this.hasLock) {
            // Another tab holds the write lock for this project. Keep the
            // change buffered rather than writing over data that tab may be
            // actively saving — holdLock() flushes it automatically once we
            // acquire the lock ourselves.
            this.updatePersistenceStatus();
            return;
        }
        const clearRevision = this.pendingClearRevision;
        const entries = [...this.pendingObjectChanges.entries()];
        const upserts = entries.filter(([, change]) => change.type === 'upsert').map(([, change]) => change.object);
        const removals = entries.filter(([, change]) => change.type === 'remove').map(([id]) => id);
        this.objectFlushQueued = true;
        this.enqueueWrite(() => this.repository.applyObjectChanges(this.projectId, {
            clear: clearRevision !== null,
            upserts,
            removals,
        }), () => {
            var _a;
            if (this.pendingClearRevision === clearRevision)
                this.pendingClearRevision = null;
            for (const [id, change] of entries) {
                if (((_a = this.pendingObjectChanges.get(id)) === null || _a === void 0 ? void 0 : _a.revision) === change.revision)
                    this.pendingObjectChanges.delete(id);
            }
            this.objectFlushQueued = false;
            if (this.hasPendingObjectChanges() && !this.disposing)
                this.scheduleObjectFlush(0);
        }, () => {
            this.objectFlushQueued = false;
            this.scheduleRetry();
        });
    }
    /**
     * store.subscribe() callback — throttled trailing-edge wrapper around
     * scheduleStateSaveIfChanged() (see STORE_CHANGE_THROTTLE_MS above). At
     * most one check runs per throttle window; a change that arrives inside
     * the window is guaranteed a follow-up check once the window elapses, so
     * the final state after a burst of dispatches is never skipped.
     */
    notifyStoreChanged() {
        // 17.8.11: ten sam dławik obsługuje też zmiany warstw i podkładów.
        // LayerManager powiadamia o każdej partii kafli; wcześniej każde takie
        // powiadomienie budowało od razu cały stan projektu i jego odcisk JSON.
        if (this.disposed || this.disposing)
            return;
        const elapsed = Date.now() - this.storeChangeLastRun;
        if (elapsed >= STORE_CHANGE_THROTTLE_MS) {
            this.storeChangeLastRun = Date.now();
            this.scheduleStateSaveIfChanged();
            return;
        }
        if (this.storeChangeThrottleTimer === null) {
            this.storeChangeThrottleTimer = window.setTimeout(() => {
                this.storeChangeThrottleTimer = null;
                this.storeChangeLastRun = Date.now();
                this.scheduleStateSaveIfChanged();
            }, STORE_CHANGE_THROTTLE_MS - elapsed);
        }
    }
    scheduleStateSaveIfChanged() {
        if (!this.started || this.disposed || this.disposing || this.suspended)
            return;
        const fingerprint = this.createStateFingerprint();
        if (fingerprint === this.lastSavedStateFingerprint && !this.pendingState && !this.stateFlushQueued)
            return;
        if (this.stateSaveTimer !== null)
            window.clearTimeout(this.stateSaveTimer);
        this.stateSaveTimer = window.setTimeout(() => {
            this.stateSaveTimer = null;
            this.prepareStateForSave();
            this.flushState();
        }, STATE_SAVE_DELAY);
    }
    prepareStateForSave() {
        var _a;
        if (this.disposed)
            return;
        const state = this.captureState();
        const fingerprint = this.stateFingerprint(state);
        if (fingerprint === this.lastSavedStateFingerprint && !this.stateFlushQueued) {
            this.pendingState = null;
            if (!this.hasPendingObjectChanges()) {
                this.lastWriteError = null;
                this.retryAttempt = 0;
                this.clearRetryTimer();
                this.updatePersistenceStatus();
            }
            return;
        }
        if (((_a = this.pendingState) === null || _a === void 0 ? void 0 : _a.fingerprint) === fingerprint)
            return;
        this.pendingState = {
            revision: this.nextRevision(),
            state,
            fingerprint,
        };
    }
    flushState() {
        if (this.disposed || this.stateFlushQueued || !this.pendingState)
            return;
        if (!this.hasLock) {
            this.updatePersistenceStatus();
            return;
        }
        const pending = this.pendingState;
        this.stateFlushQueued = true;
        this.enqueueWrite(() => this.repository.saveState(pending.state), () => {
            var _a;
            this.lastSavedStateFingerprint = pending.fingerprint;
            if (((_a = this.pendingState) === null || _a === void 0 ? void 0 : _a.revision) === pending.revision)
                this.pendingState = null;
            this.stateFlushQueued = false;
            if (this.pendingState && !this.disposing)
                this.scheduleStateFlush(0);
        }, () => {
            this.stateFlushQueued = false;
            this.scheduleRetry();
        });
    }
    scheduleStateFlush(delay) {
        if (this.disposed || this.disposing)
            return;
        if (this.stateSaveTimer !== null)
            window.clearTimeout(this.stateSaveTimer);
        this.stateSaveTimer = window.setTimeout(() => {
            this.stateSaveTimer = null;
            this.flushState();
        }, delay);
    }
    captureState() {
        const appState = store.getState();
        const view = this.options.controller.getViewSnapshot();
        return {
            projectId: this.projectId,
            schemaVersion: PROJECT_SCHEMA_VERSION,
            updatedAt: new Date().toISOString(),
            ui: {
                theme: appState.ui.theme,
                // Historyczny, płaski kształt preferencji paneli — format pliku
                // .mapownik pozostaje niezmieniony mimo przebudowy stanu UI.
                panels: toLegacyPanelPrefs(appState.panels),
            },
            mapView: {
                zoom: view.zoom,
                center3857: [view.center3857[0], view.center3857[1]],
            },
            basemapId: this.options.basemapManager.getSnapshot().activeId,
            basemapOptions: this.options.basemapManager.getPreferences?.() ?? { archiveMonth: '2025-11', photoOpacity: 1 },
            layers: this.options.layerManager.getOverlayPreferences(),
        };
    }
    stateFingerprint(state) {
        return JSON.stringify({
            ui: state.ui,
            mapView: state.mapView,
            basemapId: state.basemapId,
            basemapOptions: state.basemapOptions,
            layers: state.layers,
        });
    }
    createStateFingerprint() {
        return this.stateFingerprint(this.captureState());
    }
    flushBestEffort() {
        if (this.disposed || !this.started || this.suspended)
            return;
        this.clearSaveTimers();
        this.prepareStateForSave();
        this.flushObjectChanges();
        this.flushState();
    }
    clearSaveTimers() {
        if (this.objectSaveTimer !== null) {
            window.clearTimeout(this.objectSaveTimer);
            this.objectSaveTimer = null;
        }
        if (this.stateSaveTimer !== null) {
            window.clearTimeout(this.stateSaveTimer);
            this.stateSaveTimer = null;
        }
    }
    applyState(state) {
        store.dispatch(setTheme(state.ui.theme));
        // Pola opcjonalne w schemacie dopełniamy tymi samymi wartościami
        // domyślnymi co przed refaktorem, żeby otwarcie starszego projektu dało
        // identyczny układ paneli.
        const panels = state.ui.panels;
        const prefs = {
            objectsOpen: panels.objectsOpen,
            layersOpen: panels.layersOpen,
            objectsCollapsed: panels.objectsCollapsed ?? false,
            layersCollapsed: panels.layersCollapsed ?? false,
            objectsWidth: panels.objectsWidth,
            layersWidth: panels.layersWidth ?? DEFAULT_LAYERS_PANEL_WIDTH,
            objectsHeight: panels.objectsHeight ?? null,
            layersHeight: panels.layersHeight ?? null,
            objectsPosition: panels.objectsPosition ?? null,
            layersPosition: panels.layersPosition ?? null,
        };
        // Pola doku przekazujemy tylko wtedy, gdy plik je zawiera — ich brak
        // jest sygnałem, że projekt zapisano przed Fazą 1, i uruchamia
        // wyprowadzenie aktywnej zakładki ze starych flag widoczności.
        if ('dockRightActiveId' in panels) prefs.dockRightActiveId = panels.dockRightActiveId;
        if (panels.dockRightWidth !== undefined) prefs.dockRightWidth = panels.dockRightWidth;
        if (panels.floatingPanels !== undefined) prefs.floatingPanels = panels.floatingPanels;
        // 17.8.12: podział doku — tylko gdy plik go zawiera (starsze projekty
        // zachowują bieżący podział z pamięci przeglądarki).
        if ('dockRightSplitId' in panels) prefs.dockRightSplitId = panels.dockRightSplitId;
        if (panels.dockRightSplitRatio !== undefined) prefs.dockRightSplitRatio = panels.dockRightSplitRatio;
        store.dispatch(hydratePanels(fromLegacyPanelPrefs(prefs)));
        this.options.controller.setViewState(state.mapView);
        this.options.layerManager.applyOverlayPreferences(state.layers);
        this.options.basemapManager.applyPreferences?.(state.basemapOptions ?? { archiveMonth: '2025-11', photoOpacity: 1 });
        if (state.basemapId)
            this.options.basemapManager.setActive(state.basemapId);
    }
    /** Acquire once during restore. A denied session stays local until reload. */
    async requestProjectLock() {
        if (this.lockRequested)
            return;
        this.lockRequested = true;
        if (typeof navigator === 'undefined' || !navigator.locks || typeof navigator.locks.request !== 'function') {
            // No Web Locks API available (very old browser, or a context
            // where it's been disabled). Fail open rather than permanently
            // read-only: a single tab is by far the common case, and losing
            // cross-tab protection is safer than losing the ability to save
            // at all.
            this.hasLock = true;
            return;
        }
        const lockName = `mapownik-project-write:${this.projectId}`;
        let outcome;
        try {
            outcome = await new Promise((resolveOutcome) => {
                navigator.locks.request(lockName, { ifAvailable: true }, (lock) => {
                    if (!lock) {
                        resolveOutcome('unavailable');
                        return undefined;
                    }
                    resolveOutcome('acquired');
                    // Keep the lock held until dispose() releases it — see
                    // beginHold().
                    return this.beginHold();
                }).catch(() => resolveOutcome('failed'));
            });
        }
        catch {
            outcome = 'failed';
        }
        if (outcome === 'unavailable') {
            this.setReadOnly(true);
            // 19.19.0: no queued handover. A waiting tab has an older base snapshot.
            // Keep its edits in memory for emergency GeoJSON export; reload after
            // closing the writer to read the latest project and acquire a fresh lock.
        }
        else if (outcome === 'failed') {
            // Locks present but the request itself failed (e.g. a
            // permissions policy). Fail open, same reasoning as the
            // feature-detection branch above.
            this.hasLock = true;
            this.setReadOnly(false);
        }
    }
    /** Called once this session is granted the lock (immediately or after waiting). */
    beginHold() {
        if (this.disposed || this.disposing || this.snapshot.readOnly)
            return undefined;
        this.hasLock = true;
        this.setReadOnly(false);
        // Only a fresh initial session can get this far (never a stale waiting tab).
        this.flushObjectChanges();
        this.flushState();
        return new Promise((resolve) => {
            this.releaseLock = () => {
                this.hasLock = false;
                this.releaseLock = null;
                resolve();
            };
        });
    }
    setReadOnly(readOnly) {
        if (this.snapshot.readOnly === readOnly)
            return;
        this.updateSnapshot({ readOnly });
    }
    scheduleRetry() {
        if (this.disposed || this.disposing || this.retryTimer !== null || !this.hasPendingChanges())
            return;
        const delay = RETRY_DELAYS[Math.min(this.retryAttempt, RETRY_DELAYS.length - 1)];
        this.retryAttempt += 1;
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.prepareStateForSave();
            this.flushObjectChanges();
            this.flushState();
        }, delay);
        this.updatePersistenceStatus(delay);
    }
    clearRetryTimer() {
        if (this.retryTimer !== null) {
            window.clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }
    enqueueWrite(task, onSuccess, onFailure) {
        if (this.disposed)
            return;
        this.queuedWriteCount += 1;
        this.updatePersistenceStatus();
        this.writeQueue = this.writeQueue.then(async () => {
            let succeeded = false;
            try {
                await task();
                onSuccess === null || onSuccess === void 0 ? void 0 : onSuccess();
                succeeded = true;
            }
            catch (error) {
                this.lastWriteError = errorMessage(error);
                onFailure === null || onFailure === void 0 ? void 0 : onFailure(error);
            }
            finally {
                this.queuedWriteCount = Math.max(0, this.queuedWriteCount - 1);
                if (succeeded && !this.hasPendingChanges()) {
                    this.lastWriteError = null;
                    this.retryAttempt = 0;
                    this.clearRetryTimer();
                }
                this.updatePersistenceStatus(undefined, succeeded);
            }
        });
    }
    updatePersistenceStatus(retryInMs = this.retryTimer !== null ? RETRY_DELAYS[Math.max(0, Math.min(this.retryAttempt - 1, RETRY_DELAYS.length - 1))] : null, saved = false) {
        const pendingChanges = this.pendingObjectChanges.size + (this.pendingClearRevision !== null ? 1 : 0) + (this.pendingState ? 1 : 0);
        let status = 'ready';
        if (this.queuedWriteCount > 0)
            status = 'saving';
        else if (this.lastWriteError && pendingChanges > 0)
            status = 'error';
        this.updateSnapshot({
            status,
            error: status === 'error' ? this.lastWriteError : null,
            pendingChanges,
            retryInMs: status === 'error' ? retryInMs : null,
            ...(saved && status === 'ready' && !this.lastWriteError ? { lastSavedAt: new Date().toISOString() } : {}),
        });
    }
    hasPendingObjectChanges() {
        return this.pendingClearRevision !== null || this.pendingObjectChanges.size > 0;
    }
    hasPendingChanges() {
        return this.hasPendingObjectChanges() || this.pendingState !== null;
    }
    nextRevision() {
        this.nextMutationRevision += 1;
        return this.nextMutationRevision;
    }
    updateSnapshot(patch) {
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners)
            listener();
    }
    assertAlive() {
        if (this.disposed || this.disposing)
            throw new Error('LocalProjectSession has already been disposed.');
    }
}
