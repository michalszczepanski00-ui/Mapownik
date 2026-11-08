import { invalidateLayerCoverage } from '../data/sources/coverageCache.js';
import { niceScaleDenominator } from '../projections/index.js';
import { resetSourceCircuit } from '../data/sources/resilience/resilientLoaders.js';
function isAbortError(error) {
    return ((error instanceof DOMException && error.name === 'AbortError')
        || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'));
}
function runtimeNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
const HIDDEN_LAYER_TTL_MS = 3 * 60 * 1000;
const HIDDEN_LAYER_KEEP_RECENT = 6;
const HIDDEN_LAYER_RECHECK_MS = 2 * 60 * 1000;
/**
 * 19.31.0: warstwy „ciężkie” — podkłady wektorowe (Pastel, Zmierzch, Karto) i warstwy liczone z modelu wysokości.
 * Każda trzyma w pamięci ok. 20 MB (kafle wektorowe, styl, model wysokości), a raster tylko ok. 1,5 MB.
 * Ukryte zwalniamy po minucie i nie chronią ich „ostatnio używane” — szybkie porównanie podkładów dalej działa
 * bez ponownego wczytywania, a pamięć wraca po zmianie podkładu na stałe.
 */
const HEAVY_SOURCE_KINDS = new Set(['vector-style', 'dem']);
const HEAVY_HIDDEN_LAYER_TTL_MS = 60 * 1000;
function isHeavyEntry(entry) {
    return HEAVY_SOURCE_KINDS.has(entry?.definition?.source?.kind);
}

/**
 * Klucz źródła WMS po stronie serwera. Definicje katalogu wskazują na proxy
 * (`./api/wms.php?source=mpzp`, względny — portal może działać w podkatalogu), a ten sam klucz obsługuje eksport, identyfikację
 * i legendę — dlatego wyciągany jest z adresu, a nie dublowany w katalogu.
 */
function wmsSourceKey(definition) {
    const raw = definition?.source?.url ?? definition?.source?.fallbackWmsUrl ?? '';
    const match = /[?&]source=([^&]+)/.exec(String(raw));
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Adres legendy warstwy albo null, gdy legendy nie ma z czego wziąć.
 *
 * Legendę da się złożyć wyłącznie dla źródeł WMS: OSM i WMTS nie mają
 * GetLegendGraphic, a dla podkładów rastrowych legenda nie znaczyłaby nic.
 */
function legendUrlFor(definition) {
    if (definition?.source?.kind !== 'wms')
        return null;
    if (definition.source.legendUrl)
        return definition.source.legendUrl;
    const key = wmsSourceKey(definition);
    if (!key)
        return null;
    return `./api/wms_legend.php?source=${encodeURIComponent(key)}`;
}

function clampOpacity(value) {
    if (!Number.isFinite(value))
        return 1;
    return Math.min(1, Math.max(0, value));
}
/**
 * Single runtime owner of catalog layers.
 *
 * `ready` means the layer is not only constructed but has actually produced a
 * renderable tile (for tile-backed adapters). This makes basemap switching
 * resistant to blank/black transitions.
 */
export class LayerManager {
    constructor(catalog, registry, host) {
        this.entries = new Map();
        this.listeners = new Set();
        this.disposed = false;
        // 17.8.11: migawka budowana leniwie, a powiadomienia łączone.
        // Wcześniej KAŻDA zmiana (także licznik kafli w telemetrii źródła —
        // początek i koniec każdej partii kafli każdej warstwy) od razu
        // przebudowywała całą listę i synchronicznie przerysowywała panel
        // Warstw, pasek stanu, menu podkładów i zapis projektu.
        this.dirty = false;
        this.notifyQueued = false;
        this.notifyFrame = null;
        this.itemCache = new Map();
        this.staticItems = new Map();
        this.unsubscribeView = null;
        this.getSnapshot = () => {
            if (this.dirty) {
                this.snapshot = this.buildSnapshot();
                this.dirty = false;
            }
            return this.snapshot;
        };
        this.subscribe = (listener) => {
            this.assertAlive();
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.catalog = catalog;
        this.registry = registry;
        this.host = host;
        const ordered = [...catalog.layers]
            .map((definition, originalIndex) => ({ definition, originalIndex }))
            .sort((a, b) => (a.definition.zIndex - b.definition.zIndex
            || a.originalIndex - b.originalIndex));
        ordered.forEach(({ definition }, order) => {
            this.entries.set(definition.id, {
                definition,
                visible: definition.visible,
                opacity: definition.opacity,
                order,
                status: 'idle',
                error: null,
                layer: null,
                waitUntilRenderable: null,
                rendered: false,
                telemetry: null,
                unsubscribeTelemetry: null,
                loadStartedAt: null,
                loadMs: null,
                disposeLayer: null,
                cancelPending: null,
                abortController: null,
                loadToken: 0,
                watchdogTrips: 0,
                lastUsedAt: definition.visible ? Date.now() : 0,
                lastHiddenAt: null,
                evictionTimer: null,
                awaitingZoom: false,
                waitingRender: false,
            });
        });
        this.issueStrings = catalog.issues.map((issue) => (issue.id ? `${issue.id}: ${issue.message}` : issue.message));
        this.snapshot = this.buildSnapshot();
    }
    initialize() {
        this.assertAlive();
        if (!this.unsubscribeView && typeof this.host.onMoveEnd === 'function') {
            this.unsubscribeView = this.host.onMoveEnd(() => this.handleViewChange());
        }
        for (const entry of this.entries.values()) {
            if (entry.visible)
                void this.ensureLoaded(entry);
        }
    }
    /**
     * 17.8.11: czy bieżące przybliżenie mieści się w zakresie warstwy.
     *
     * Semantyka jak w OpenLayers: minZoom jest wyłączny (warstwa rysuje się
     * POWYŻEJ progu), maxZoom włączny. Poza zakresem OpenLayers nie pobiera
     * żadnego kafla, więc czekanie na „pierwszy render" musiało skończyć się
     * po 15 s fałszywym błędem „offline" — np. po włączeniu warstw
     * planistycznych na widoku całej Polski.
     */
    isWithinZoomRange(entry) {
        const zoom = this.host.getViewSnapshot?.()?.zoom;
        if (!Number.isFinite(zoom))
            return true;
        const { minZoom, maxZoom } = entry.definition;
        if (Number.isFinite(minZoom) && zoom <= minZoom)
            return false;
        if (Number.isFinite(maxZoom) && zoom > maxZoom)
            return false;
        return true;
    }
    /** Po każdej zmianie widoku: wznawia albo wstrzymuje oczekiwanie na render. */
    handleViewChange() {
        if (this.disposed)
            return;
        for (const entry of this.entries.values()) {
            if (!entry.visible || entry.rendered)
                continue;
            const inRange = this.isWithinZoomRange(entry);
            if (inRange && entry.awaitingZoom && entry.status !== 'loading') {
                void this.ensureLoaded(entry);
            }
            else if (!inRange && entry.status === 'loading' && entry.waitingRender) {
                // Widok wyszedł poza zakres w trakcie ładowania — kafli już nie
                // będzie, więc watchdog nie może liczyć tego czasu jako awarii.
                entry.awaitingZoom = true;
                entry.abortController?.abort();
            }
        }
    }
    setVisibility(id, visible) {
        var _a, _b, _c;
        this.assertAlive();
        const entry = this.requireEntry(id);
        if (visible && id === 'overlay.utilities.all') {
            for (const other of this.entries.keys()) if (other.startsWith('overlay.kiut.')) this.setVisibility(other,false);
        } else if (visible && id.startsWith('overlay.kiut.') && this.entries.has('overlay.utilities.all')) this.setVisibility('overlay.utilities.all',false);
        if (entry.visible === visible && (visible ? entry.status !== 'error' : true))
            return;
        entry.visible = visible;
        entry.error = null;
        if (!visible) {
            (_a = entry.abortController) === null || _a === void 0 ? void 0 : _a.abort();
            entry.abortController = null;
            entry.awaitingZoom = false;
            if (entry.layer && !entry.rendered) {
                // 17.8.11: warstwa ukryta, zanim cokolwiek pokazała, jest
                // zwalniana w całości. Wcześniej zostawała w mapie z przerwanymi
                // kaflami w stanie LOADING: po ponownym włączeniu OpenLayers ich
                // nie ponawiał, oczekiwanie na render widziało „0/0 kafli"
                // i po 15 s warstwa dostawała fałszywy status „offline".
                entry.loadToken += 1;
                entry.cancelPending?.('hidden');
                this.releaseLayer(entry);
                entry.status = 'idle';
                entry.loadStartedAt = null;
                entry.loadMs = null;
            }
            else {
                // 17.8.11: kafle już pobierane dla wyświetlonej warstwy NIE są
                // przerywane. Przerwany kafel zostawał w pamięci OpenLayers na
                // stałe jako „ładowany" — nie wracał po ponownym włączeniu
                // (dziura w mapie) i trwale zajmował jedno z 16 miejsc kolejki
                // pobierania. Dokończenie kilku zapytań kosztuje mniej.
                (_b = entry.layer) === null || _b === void 0 ? void 0 : _b.setVisible(false);
                entry.status = entry.rendered ? 'ready' : 'idle';
            }
            entry.lastHiddenAt = Date.now();
            this.scheduleHiddenEviction(entry);
            this.emit();
            return;
        }
        this.cancelHiddenEviction(entry);
        entry.lastHiddenAt = null;
        entry.lastUsedAt = Date.now();
        (_c = entry.layer) === null || _c === void 0 ? void 0 : _c.setVisible(true);
        if (entry.rendered) {
            entry.status = 'ready';
            this.emit();
            return;
        }
        this.emit();
        void this.ensureLoaded(entry);
    }
    setWmsTime(id, time) {
        this.assertAlive();
        const entry = this.requireEntry(id);
        if (entry.definition.source.kind !== 'wms' || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(time)) return;
        if (entry.definition.source.time === time) return;
        entry.definition = { ...entry.definition, source: { ...entry.definition.source, time } };
        entry.loadToken++;
        entry.abortController?.abort(); entry.cancelPending?.('time-change'); entry.abortController = null;
        this.releaseLayer(entry);
        entry.status = 'idle'; entry.error = null; entry.rendered = false; entry.awaitingZoom = false;
        entry.loadStartedAt = null; entry.loadMs = null;
        this.emit();
        if (entry.visible) void this.ensureLoaded(entry);
    }
    setOpacity(id, opacity) {
        var _a;
        this.assertAlive();
        const entry = this.requireEntry(id);
        const next = clampOpacity(opacity);
        if (entry.opacity === next)
            return;
        entry.opacity = next;
        (_a = entry.layer) === null || _a === void 0 ? void 0 : _a.setOpacity(next);
        this.emit();
    }
    moveLayer(id, direction) {
        this.assertAlive();
        const ordered = [...this.entries.values()].sort((a, b) => a.order - b.order);
        const index = ordered.findIndex((entry) => entry.definition.id === id);
        if (index < 0)
            return;
        const targetIndex = direction === 'up' ? index + 1 : index - 1;
        if (targetIndex < 0 || targetIndex >= ordered.length)
            return;
        const current = ordered[index];
        const target = ordered[targetIndex];
        const currentOrder = current.order;
        current.order = target.order;
        target.order = currentOrder;
        this.applyRuntimeOrder(current);
        this.applyRuntimeOrder(target);
        this.emit();
    }
    reorderOverlay(id, targetId) {
        this.assertAlive();
        if (id === targetId) return;
        const dragged = this.requireEntry(id);
        const target = this.requireEntry(targetId);
        if (dragged.definition.role !== 'overlay' || target.definition.role !== 'overlay') return;
        const displayed = [...this.entries.values()]
            .filter((entry) => entry.definition.role === 'overlay')
            .sort((a, b) => b.order - a.order);
        const from = displayed.findIndex((entry) => entry === dragged);
        const to = displayed.findIndex((entry) => entry === target);
        if (from < 0 || to < 0) return;
        displayed.splice(from, 1);
        const targetAfterRemoval = displayed.findIndex((entry) => entry === target);
        displayed.splice(Math.max(0, targetAfterRemoval), 0, dragged);
        const currentOrders = displayed.map((entry) => entry.order);
        const base = Math.min(...currentOrders);
        [...displayed].reverse().forEach((entry, index) => {
            entry.order = base + index;
            this.applyRuntimeOrder(entry);
        });
        this.emit();
    }
    setAllOverlaysVisibility(visible) {
        this.assertAlive();
        const overlays = [...this.entries.values()].filter((entry) => entry.definition.role === 'overlay');
        for (const entry of overlays) this.setVisibility(entry.definition.id, Boolean(visible));
    }
    showOnlyOverlay(id) {
        this.assertAlive();
        const selected = this.requireEntry(id);
        if (selected.definition.role !== 'overlay') return;
        const overlays = [...this.entries.values()].filter((entry) => entry.definition.role === 'overlay');
        for (const entry of overlays) this.setVisibility(entry.definition.id, entry.definition.id === id);
    }
    retryAllVisibleFailures() {
        this.assertAlive();
        invalidateLayerCoverage();
        for (const entry of this.entries.values()) {
            if (!entry.visible) continue;
            const telemetry = entry.telemetry?.getSnapshot?.() ?? null;
            const unhealthy = entry.status === 'error'
                || ['degraded', 'down', 'circuit-open'].includes(telemetry?.health)
                || telemetry?.circuitState === 'open';
            if (unhealthy) this.retry(entry.definition.id);
        }
    }
    getOverlayPreferences() {
        this.assertAlive();
        return [...this.entries.values()]
            .filter((entry) => entry.definition.role === 'overlay')
            .map((entry) => ({
            id: entry.definition.id,
            visible: entry.visible,
            opacity: entry.opacity,
            order: entry.order,
        }));
    }
    applyOverlayPreferences(preferences) {
        var _a;
        this.assertAlive();
        const byId = new Map(preferences.map((preference) => [preference.id, preference]));
        const overlays = [...this.entries.values()].filter((entry) => entry.definition.role === 'overlay');
        for (const entry of overlays) {
            const preference = byId.get(entry.definition.id);
            if (!preference)
                continue;
            entry.opacity = clampOpacity(preference.opacity);
            entry.order = Number.isFinite(preference.order) ? Math.trunc(preference.order) : entry.order;
            (_a = entry.layer) === null || _a === void 0 ? void 0 : _a.setOpacity(entry.opacity);
            this.applyRuntimeOrder(entry);
            this.setVisibility(entry.definition.id, preference.visible);
        }
        this.emit();
    }
    retry(id) {
        invalidateLayerCoverage(id);
        var _a;
        this.assertAlive();
        const entry = this.requireEntry(id);
        if (!entry.visible)
            return;
        this.cancelHiddenEviction(entry);
        entry.lastUsedAt = Date.now();
        resetSourceCircuit(id); // 18.18.0: ręczna próba omija blokadę po serii błędów
        (_a = entry.abortController) === null || _a === void 0 ? void 0 : _a.abort();
        entry.cancelPending?.('manual-retry');
        entry.abortController = null;
        this.releaseLayer(entry);
        entry.status = 'idle';
        entry.error = null;
        entry.rendered = false;
        entry.loadStartedAt = null;
        entry.loadMs = null;
        this.emit();
        void this.ensureLoaded(entry);
    }
    getIdentifyTargets() {
        this.assertAlive();
        return [...this.entries.values()]
            .filter((entry) => entry.visible
            && entry.status !== 'error'
            && entry.definition.role === 'overlay'
            && entry.definition.capabilities.identify
            && entry.definition.source.kind === 'wms')
            .map((entry) => {
            const match = /(?:\?|&)source=([^&]+)/.exec(entry.definition.source.url);
            return {
                id: entry.definition.id,
                title: entry.definition.title,
                sourceKey: match ? decodeURIComponent(match[1]) : entry.definition.id.replace(/^overlay\./, ''),
                ...(entry.definition.source.identifyUrl ? { url: entry.definition.source.identifyUrl } : {}),
            };
        });
    }
    dispose() {
        var _a;
        if (this.disposed)
            return;
        this.disposed = true;
        try { this.unsubscribeView?.(); } catch { /* kontroler mógł zostać już zamknięty */ }
        this.unsubscribeView = null;
        if (this.notifyFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.notifyFrame);
        this.notifyFrame = null;
        for (const entry of this.entries.values()) {
            this.cancelHiddenEviction(entry);
            entry.loadToken += 1;
            (_a = entry.abortController) === null || _a === void 0 ? void 0 : _a.abort();
            entry.cancelPending?.('manager-dispose');
            entry.abortController = null;
            this.releaseLayer(entry);
        }
        this.listeners.clear();
    }
    async ensureLoaded(entry) {
        var _a, _b, _c;
        if (this.disposed || !entry.visible || entry.status === 'loading' || entry.rendered)
            return;
        const abortController = new AbortController();
        const token = entry.loadToken + 1;
        entry.loadToken = token;
        entry.abortController = abortController;
        entry.status = 'loading';
        entry.error = null;
        entry.loadStartedAt = runtimeNow();
        entry.loadMs = null;
        entry.lastUsedAt = Date.now();
        this.emit();
        try {
            if (!entry.layer) {
                const handle = await this.registry.createLayer(entry.definition, abortController.signal);
                if (this.disposed || abortController.signal.aborted || entry.loadToken !== token) {
                    (_a = handle.dispose) === null || _a === void 0 ? void 0 : _a.call(handle);
                    return;
                }
                entry.layer = handle.layer;
                entry.waitUntilRenderable = (_b = handle.waitUntilRenderable) !== null && _b !== void 0 ? _b : null;
                entry.disposeLayer = (_c = handle.dispose) !== null && _c !== void 0 ? _c : null;
                entry.cancelPending = handle.cancelPending ?? null;
                entry.telemetry = handle.telemetry ?? null;
                entry.unsubscribeTelemetry = entry.telemetry?.subscribe?.(() => this.emit(false)) ?? null;
                entry.layer.setOpacity(entry.opacity);
                entry.layer.setVisible(entry.visible);
                this.applyRuntimeOrder(entry);
                this.host.addLayer(entry.layer);
                handle.attach?.(this.host);
            }
            else {
                entry.layer.setVisible(true);
            }
            if (!entry.waitUntilRenderable) {
                entry.rendered = true;
            }
            else {
                if (!this.isWithinZoomRange(entry)) {
                    // Poza zakresem przybliżenia: warstwa jest gotowa w mapie,
                    // a na render poczeka handleViewChange().
                    entry.abortController = null;
                    entry.awaitingZoom = true;
                    entry.status = 'idle';
                    entry.loadStartedAt = null;
                    this.emit();
                    return;
                }
                entry.awaitingZoom = false;
                entry.waitingRender = true;
                try {
                    await entry.waitUntilRenderable(abortController.signal);
                }
                finally {
                    entry.waitingRender = false;
                }
                if (this.disposed || abortController.signal.aborted || entry.loadToken !== token)
                    return;
                entry.rendered = true;
            }
            entry.abortController = null;
            entry.status = 'ready';
            if (entry.loadStartedAt !== null) entry.loadMs = Math.max(0, Math.round(runtimeNow() - entry.loadStartedAt));
            this.emit();
        }
        catch (error) {
            if (this.disposed || entry.loadToken !== token)
                return;
            entry.abortController = null;
            if (isAbortError(error) || abortController.signal.aborted) {
                entry.status = entry.rendered ? 'ready' : 'idle';
                this.emit();
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            const watchdog = /Brak poprawnie wyrenderowanego/i.test(message);
            if (watchdog) {
                entry.watchdogTrips += 1;
                entry.cancelPending?.('watchdog');
                entry.telemetry?.recordTerminalError?.('Watchdog: ' + message);
            }
            entry.status = 'error';
            entry.error = message;
            if (entry.loadStartedAt !== null) entry.loadMs = Math.max(0, Math.round(runtimeNow() - entry.loadStartedAt));
            this.emit();
        }
    }
    cancelHiddenEviction(entry) {
        if (entry.evictionTimer !== null) clearTimeout(entry.evictionTimer);
        entry.evictionTimer = null;
    }
    scheduleHiddenEviction(entry, delay = isHeavyEntry(entry) ? HEAVY_HIDDEN_LAYER_TTL_MS : HIDDEN_LAYER_TTL_MS) {
        this.cancelHiddenEviction(entry);
        if (this.disposed || entry.visible || !entry.layer) return;
        entry.evictionTimer = setTimeout(() => {
            entry.evictionTimer = null;
            this.evictHiddenEntry(entry);
        }, delay);
    }
    evictHiddenEntry(entry) {
        if (this.disposed || entry.visible || !entry.layer) return;
        const hiddenLoaded = [...this.entries.values()]
            .filter((candidate) => !candidate.visible && candidate.layer)
            .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
        const keep = new Set(hiddenLoaded.filter((candidate) => !isHeavyEntry(candidate)).slice(0, HIDDEN_LAYER_KEEP_RECENT));
        if (keep.has(entry)) {
            this.scheduleHiddenEviction(entry, HIDDEN_LAYER_RECHECK_MS);
            return;
        }
        entry.loadToken += 1;
        entry.cancelPending?.('hidden-evict');
        this.releaseLayer(entry);
        entry.rendered = false;
        entry.status = 'idle';
        entry.error = null;
        entry.loadStartedAt = null;
        entry.loadMs = null;
        this.emit();
    }
    releaseLayer(entry) {
        var _a;
        this.cancelHiddenEviction(entry);
        entry.unsubscribeTelemetry?.();
        entry.unsubscribeTelemetry = null;
        entry.telemetry = null;
        if (entry.layer) {
            this.host.removeLayer(entry.layer);
            entry.layer = null;
        }
        (_a = entry.disposeLayer) === null || _a === void 0 ? void 0 : _a.call(entry);
        entry.disposeLayer = null;
        entry.cancelPending = null;
        entry.waitUntilRenderable = null;
    }
    applyRuntimeOrder(entry) {
        var _a;
        (_a = entry.layer) === null || _a === void 0 ? void 0 : _a.setZIndex(entry.order);
    }
    requireEntry(id) {
        const entry = this.entries.get(id);
        if (!entry)
            throw new Error(`Nieznana warstwa: ${id}`);
        return entry;
    }
    /**
     * Oznacza migawkę jako nieaktualną i planuje powiadomienie słuchaczy.
     *
     * `urgent` (domyślnie) — akcja użytkownika: powiadomienie w mikrozadaniu,
     * czyli wciąż przed najbliższym renderem, ale jedno dla całej serii zmian
     * (np. przełącznik grupy włączający pięć warstw).
     * `urgent = false` — telemetria kafli: najwyżej jedno powiadomienie na klatkę.
     */
    emit(urgent = true) {
        if (this.disposed)
            return;
        this.dirty = true;
        if (urgent) {
            if (this.notifyQueued)
                return;
            this.notifyQueued = true;
            queueMicrotask(() => this.flushNotify());
            return;
        }
        if (this.notifyQueued || this.notifyFrame !== null)
            return;
        const schedule = typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && document.visibilityState !== 'hidden'
            ? requestAnimationFrame
            : (callback) => setTimeout(callback, 100);
        this.notifyFrame = schedule(() => {
            this.notifyFrame = null;
            this.flushNotify();
        });
    }
    flushNotify() {
        this.notifyQueued = false;
        if (this.disposed)
            return;
        if (this.notifyFrame !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.notifyFrame);
            this.notifyFrame = null;
        }
        this.getSnapshot();
        for (const listener of [...this.listeners]) {
            try {
                listener();
            }
            catch (error) {
                console.error('msportal LayerManager listener error', error);
            }
        }
    }
    staticItemFor(entry) {
        let item = this.staticItems.get(entry.definition.id);
        if (item)
            return item;
        const definition = entry.definition;
        item = {
            id: definition.id,
            title: definition.title,
            group: definition.group,
            role: definition.role,
            sourceKind: definition.source.kind,
            serviceName: definition.source.kind === 'wms' ? definition.source.layers : null,
            listUrl: definition.source.listUrl ?? null,
            capabilities: definition.capabilities,
            attribution: definition.attribution,
            // Zakres widoczności trafiał dotąd tylko do OpenLayers, więc
            // warstwa poza skalą znikała bez słowa wyjaśnienia. Panel
            // porównuje te wartości z bieżącym przybliżeniem mapy.
            minZoom: definition.minZoom ?? null,
            maxZoom: definition.maxZoom ?? null,
            minScale: Number.isFinite(definition.minZoom)
                ? niceScaleDenominator(definition.minZoom)
                : null,
            legendUrl: legendUrlFor(definition),
            description: definition.description ?? null,
        };
        this.staticItems.set(definition.id, item);
        return item;
    }
    /**
     * 17.8.11: wiersz warstwy, która się nie zmieniła, zachowuje TEN SAM obiekt
     * między migawkami. Dzięki temu panel Warstw przerysowuje tylko wiersze
     * warstw, które faktycznie coś zmieniły (React.memo w LayersPanel).
     */
    itemFor(entry) {
        const telemetry = entry.telemetry?.getSnapshot?.() ?? null;
        const previous = this.itemCache.get(entry.definition.id);
        if (previous
            && previous.visible === entry.visible
            && previous.opacity === entry.opacity
            && previous.order === entry.order
            && previous.status === entry.status
            && previous.error === entry.error
            && previous.loadMs === entry.loadMs
            && previous.watchdogTrips === entry.watchdogTrips
            && previous.awaitingZoom === entry.awaitingZoom
            && previous.sourceTelemetry === telemetry) {
            return previous;
        }
        const item = {
            ...this.staticItemFor(entry),
            visible: entry.visible,
            opacity: entry.opacity,
            order: entry.order,
            status: entry.status,
            error: entry.error,
            loadMs: entry.loadMs,
            watchdogTrips: entry.watchdogTrips,
            awaitingZoom: entry.awaitingZoom,
            sourceTelemetry: telemetry,
        };
        this.itemCache.set(entry.definition.id, item);
        return item;
    }
    buildSnapshot() {
        return {
            catalogVersion: this.catalog.catalogVersion,
            issues: this.issueStrings ?? this.catalog.issues.map((issue) => (issue.id ? `${issue.id}: ${issue.message}` : issue.message)),
            layers: [...this.entries.values()]
                .sort((a, b) => b.order - a.order)
                .map((entry) => this.itemFor(entry)),
        };
    }
    /**
     * Przybliża mapę dokładnie do progu, od którego warstwa zaczyna być
     * rysowana. Menedżer zna i definicję, i widok, więc panel nie musi znać
     * ani jednego, ani drugiego — mówi tylko „pokaż mi tę warstwę".
     */
    zoomToLayerMinimum(id) {
        this.assertAlive();
        const entry = this.entries.get(id);
        const minZoom = entry?.definition?.minZoom;
        if (!Number.isFinite(minZoom))
            return false;
        const current = this.host.getViewSnapshot?.().zoom;
        if (Number.isFinite(current) && current > minZoom)
            return false;
        // Pół poziomu zapasu: dokładnie na progu warstwa bywa jeszcze
        // przycinana przez zaokrąglenia rozdzielczości.
        this.host.setViewState?.({
            ...this.host.getViewSnapshot(),
            zoom: minZoom + 0.5,
        });
        return true;
    }
    assertAlive() {
        if (this.disposed)
            throw new Error('LayerManager has already been disposed.');
    }
}
