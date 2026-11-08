import { parseParcelWkt } from './wkt.js';
import { t } from '../i18n/index.js';
import { requestScope } from '../core/requestScope.js';
const INITIAL_SNAPSHOT = {
    active: false,
    busy: false,
    error: null,
    lastParcelLabel: null,
    lastCreatedId: null,
};
function safeParcelObjectId(parcelId) {
    if (!parcelId)
        return null;
    return `parcel:${String(parcelId).trim()}`;
}
function parcelLabel(parcel) {
    var _a, _b;
    const number = (_a = parcel.parcel) === null || _a === void 0 ? void 0 : _a.trim();
    const id = (_b = parcel.id) === null || _b === void 0 ? void 0 : _b.trim();
    if (number)
        return t('parcels.dzialka', { number });
    if (id)
        return t('parcels.dzialka2', { id });
    return t('parcels.dzialkaEwidencyjna');
}
/**
 * Click-to-import cadastral parcel tool backed by the official GUGiK ULDK service.
 * A clicked parcel becomes a normal persisted msportal object in EPSG:2180.
 */
export class ParcelManager {
    constructor(host, layerManager, objectManager, objectCommands) {
        this.listeners = new Set();
        this.unsubscribeClick = null;
        this.requestController = null;
        this.requestToken = 0;
        this.snapshot = INITIAL_SNAPSHOT;
        this.disposed = false;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.assertAlive();
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.host = host;
        this.layerManager = layerManager;
        this.objectManager = objectManager;
        this.objectCommands = objectCommands;
    }
    activate() {
        this.assertAlive();
        if (!this.unsubscribeClick) {
            this.unsubscribeClick = this.host.onSingleClick((snapshot) => this.handleClick(snapshot));
        }
        try {
            this.layerManager.setVisibility('overlay.dzialki', true);
        }
        catch {
            // Import from ULDK stays usable even if the visual WMS overlay is unavailable.
        }
        this.updateSnapshot({ active: true, error: null });
    }
    deactivate() {
        var _a;
        this.assertAlive();
        if (this.unsubscribeClick) {
            this.unsubscribeClick();
            this.unsubscribeClick = null;
        }
        (_a = this.requestController) === null || _a === void 0 ? void 0 : _a.abort();
        this.requestController = null;
        this.requestToken += 1;
        this.updateSnapshot({ active: false, busy: false, error: null });
    }
    dispose() {
        if (this.disposed)
            return;
        this.deactivate();
        this.disposed = true;
        this.listeners.clear();
    }
    async handleClick(snapshot) {
        var _a, _b;
        if (!this.snapshot.active || this.disposed)
            return;
        const [x, y] = snapshot.coordinate2180;
        if (!Number.isFinite(x) || !Number.isFinite(y))
            return;
        (_a = this.requestController) === null || _a === void 0 ? void 0 : _a.abort();
        const scope = requestScope(35000);
        const controller = scope.controller;
        const token = this.requestToken + 1;
        this.requestToken = token;
        this.requestController = controller;
        this.updateSnapshot({ busy: true, error: null });
        try {
            const url = new URL('./api/uldk.php', window.location.href);
            url.searchParams.set('x', x.toFixed(3));
            url.searchParams.set('y', y.toFixed(3));
            const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            let payload;
            try {
                payload = await response.json();
            }
            catch {
                throw new Error(t('parcels.serwerZwrocilNieprawidlowaOdpowiedzUldk'));
            }
            if (!response.ok || !(payload === null || payload === void 0 ? void 0 : payload.ok) || !((_b = payload.parcel) === null || _b === void 0 ? void 0 : _b.wkt)) {
                throw new Error((payload === null || payload === void 0 ? void 0 : payload.error) || t('parcels.nieZnalezionoDzialkiDlaWskazanego'));
            }
            if (this.disposed || controller.signal.aborted || token !== this.requestToken)
                return;
            const parcel = payload.parcel;
            const label = parcelLabel(parcel);
            const stableId = safeParcelObjectId(parcel.id);
            if (stableId) {
                try {
                    this.objectManager.getObject(stableId);
                    this.objectManager.select(stableId);
                    this.objectManager.focus(stableId);
                    this.updateSnapshot({ busy: false, error: null, lastParcelLabel: label, lastCreatedId: stableId });
                    return;
                }
                catch {
                    // Parcel is not in the project yet.
                }
            }
            const geometry = parseParcelWkt(parcel.wkt);
            const createdId = this.objectCommands.create({
                ...(stableId ? { id: stableId } : {}),
                name: label,
                geometry,
                origin: 'parcel',
                visible: true,
                style: {
                    strokeColor: '#15803d',
                    strokeWidth: 2,
                    fillColor: '#22c55e',
                    fillOpacity: 0.12,
                },
            });
            this.objectManager.select(createdId);
            this.updateSnapshot({ busy: false, error: null, lastParcelLabel: label, lastCreatedId: createdId });
        }
        catch (error) {
            if ((controller.signal.aborted && controller.signal.reason?.name !== 'TimeoutError') || this.disposed || token !== this.requestToken)
                return;
            this.updateSnapshot({
                busy: false,
                error: error instanceof Error ? error.message : t('parcels.nieUdaloSiePobracGranicy'),
            });
        }
        finally {
            scope.dispose();
            if (this.requestController === controller)
                this.requestController = null;
        }
    }
    /**
     * 18.12.3: dodaje działkę z ULDK (np. z „Informacji o działce”) do projektu
     * i zaznacza ją — z niej startuje screening. Zwraca id obiektu.
     */
    addParcel(parcel) {
        this.assertAlive();
        if (!parcel?.wkt) throw new Error(t('parcels.nieZnalezionoDzialkiDlaWskazanego'));
        const stableId = safeParcelObjectId(parcel.id);
        if (stableId) {
            try { this.objectManager.getObject(stableId); this.objectManager.select(stableId); return stableId; }
            catch { /* jeszcze nie ma w projekcie */ }
        }
        const createdId = this.objectCommands.create({
            ...(stableId ? { id: stableId } : {}),
            name: parcelLabel(parcel),
            geometry: parseParcelWkt(parcel.wkt),
            origin: 'parcel',
            visible: true,
            style: { strokeColor: '#15803d', strokeWidth: 2, fillColor: '#22c55e', fillOpacity: 0.12 },
        });
        this.objectManager.select(createdId);
        return createdId;
    }
    updateSnapshot(patch) {
        if (this.disposed)
            return;
        const next = { ...this.snapshot, ...patch };
        const changed = Object.keys(patch).some((key) => this.snapshot[key] !== next[key]);
        if (!changed)
            return;
        this.snapshot = next;
        for (const listener of this.listeners)
            listener();
    }
    assertAlive() {
        if (this.disposed)
            throw new Error('ParcelManager has already been disposed.');
    }
}
