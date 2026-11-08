import { appToasts } from '../core/index.js';
import { t } from '../i18n/index.js';

/**
 * Keeps basemap selection separate from ordinary overlay layers.
 *
 * Switching is deliberately two-phase: the current basemap remains visible
 * while the requested basemap loads. It is hidden only after the replacement
 * reaches `ready`, avoiding a blank map during slow upstream responses.
 */
export class BasemapManager {
    constructor(catalog, layerManager) {
        var _a, _b, _c, _d;
        this.titles = new Map();
        this.listeners = new Set();
        this.pendingId = null;
        this.disposed = false;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            if (this.disposed)
                return () => undefined;
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.layerManager = layerManager;
        this.archiveMonth = '2025-11';
        this.photoOpacity = 1;
        const basemaps = catalog.layers.filter((layer) => layer.role === 'basemap');
        this.basemapIds = basemaps.map((layer) => layer.id);
        basemaps.forEach((layer) => this.titles.set(layer.id, layer.title));
        const initiallyVisible = basemaps.filter((layer) => layer.visible);
        this.activeId = (_d = (_b = (_a = initiallyVisible[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : (_c = basemaps[0]) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null;
        // Normalize malformed catalogs with multiple initially visible basemaps.
        for (const item of initiallyVisible.slice(1)) {
            this.layerManager.setVisibility(item.id, false);
        }
        if (this.activeId && initiallyVisible.length === 0) {
            this.layerManager.setVisibility(this.activeId, true);
        }
        this.snapshot = this.buildSnapshot(this.layerManager.getSnapshot());
        this.unsubscribeLayerManager = this.layerManager.subscribe(() => this.onLayerSnapshot());
    }
    setActive(id) {
        if (this.disposed || !this.basemapIds.includes(id))
            return;
        if (id === this.activeId && !this.pendingId)
            return;
        this.pendingId = id;
        this.layerManager.setVisibility(id, true);
        // 18.18.0: podkład, który wcześniej zgłosił błąd, ładuje się od nowa —
        // inaczej ponowny wybór (albo „Spróbuj ponownie”) czekał w nieskończoność.
        const previous = this.layerManager.getSnapshot().layers.find((layer) => layer.id === id);
        if (previous?.status === 'error' || this.lastFailure?.id === id) {
            try { this.layerManager.retry(id); } catch { /* warstwa niedostępna — zgłosi błąd sama */ }
        }
        this.refresh();
    }
    getPreferences() { return { archiveMonth: this.archiveMonth, photoOpacity: this.photoOpacity }; }
    applyPreferences(value = {}) {
        if (typeof value.archiveMonth === 'string' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value.archiveMonth)) {
            this.archiveMonth = value.archiveMonth;
            if (this.basemapIds.includes('basemap.orthophoto.archive')) this.layerManager.setWmsTime('basemap.orthophoto.archive', `${value.archiveMonth}-01`);
        }
        if (Number.isFinite(value.photoOpacity)) {
            this.photoOpacity = Math.max(0.1, Math.min(1, value.photoOpacity));
            for (const id of this.basemapIds.filter((id) => id.startsWith('basemap.orthophoto'))) this.layerManager.setOpacity(id, this.photoOpacity);
        }
        this.refresh();
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.unsubscribeLayerManager();
        this.listeners.clear();
    }
    onLayerSnapshot() {
        if (this.disposed)
            return;
        const layerSnapshot = this.layerManager.getSnapshot();
        if (this.pendingId) {
            const pending = layerSnapshot.layers.find((layer) => layer.id === this.pendingId);
            if ((pending === null || pending === void 0 ? void 0 : pending.status) === 'ready') {
                const nextId = this.pendingId;
                this.pendingId = null;
                this.activeId = nextId;
                for (const id of this.basemapIds) {
                    if (id !== nextId)
                        this.layerManager.setVisibility(id, false);
                }
            }
            else if ((pending === null || pending === void 0 ? void 0 : pending.status) === 'error') {
                // Keep the previous basemap on screen if the replacement failed.
                const failedId = this.pendingId;
                this.pendingId = null;
                this.layerManager.setVisibility(failedId, false);
                this.notifyFailure(failedId, pending === null || pending === void 0 ? void 0 : pending.error);
            }
        }
        // 17.8.11: powiadamiaj tylko o zmianach dotyczących podkładów. LayerManager
        // zgłasza też każdą zmianę nakładek, a każda nowa migawka przerysowywała
        // pasek górny z menu podkładów.
        const next = this.buildSnapshot(this.layerManager.getSnapshot());
        if (sameBasemapSnapshot(this.snapshot, next))
            return;
        this.snapshot = next;
        this.emit();
    }
    /**
     * 18.18.0 — nieudane przełączenie podkładu nie jest już ciche: komunikat mówi,
     * który podkład nie odpowiada i przy którym msportal został, z akcją
     * „Spróbuj ponownie”. Wcześniej kliknięcie po prostu nic nie robiło.
     */
    notifyFailure(failedId, error) {
        const failed = this.titles.get(failedId) ?? failedId;
        const current = this.titles.get(this.activeId) ?? '';
        this.lastFailure = { id: failedId, at: Date.now() };
        try {
            appToasts.show({
                tone: 'warning',
                message: current ? t('basemap.failed', { failed, current }) : t('basemap.failedNoCurrent', { failed }),
                timeoutMs: 9000,
                action: { label: t('basemap.retry'), run: () => this.setActive(failedId) },
            });
        } catch { /* komunikat nie może zablokować przełączania */ }
        this.refresh();
    }
    refresh() {
        this.snapshot = this.buildSnapshot(this.layerManager.getSnapshot());
        this.emit();
    }
    buildSnapshot(layerSnapshot) {
        return {
            activeId: this.activeId,
            pendingId: this.pendingId,
            lastFailure: this.lastFailure ?? null,
            archiveMonth: this.archiveMonth,
            photoOpacity: this.photoOpacity,
            items: this.basemapIds.map((id) => {
                var _a, _b, _c;
                const layer = layerSnapshot.layers.find((candidate) => candidate.id === id);
                return {
                    id,
                    title: (_a = this.titles.get(id)) !== null && _a !== void 0 ? _a : id,
                    status: (_b = layer === null || layer === void 0 ? void 0 : layer.status) !== null && _b !== void 0 ? _b : 'idle',
                    error: (_c = layer === null || layer === void 0 ? void 0 : layer.error) !== null && _c !== void 0 ? _c : null,
                    loadMs: layer?.loadMs ?? null,
                    sourceKind: layer?.sourceKind ?? null,
                    sourceTelemetry: layer?.sourceTelemetry ?? null,
                    awaitingZoom: layer?.awaitingZoom ?? false,
                };
            }),
        };
    }
    emit() {
        for (const listener of this.listeners)
            listener();
    }
}

function sameBasemapSnapshot(a, b) {
    if (!a || !b || a.activeId !== b.activeId || a.pendingId !== b.pendingId || a.lastFailure?.at !== b.lastFailure?.at || a.archiveMonth !== b.archiveMonth || a.photoOpacity !== b.photoOpacity || a.items.length !== b.items.length)
        return false;
    return a.items.every((item, index) => {
        const other = b.items[index];
        return item.id === other.id
            && item.status === other.status
            && item.error === other.error
            && item.loadMs === other.loadMs
            && item.sourceKind === other.sourceKind
            && item.awaitingZoom === other.awaitingZoom
            && item.sourceTelemetry === other.sourceTelemetry;
    });
}
