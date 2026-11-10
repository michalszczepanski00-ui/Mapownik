import { markBackupSaved } from './backupReminder.js';
import { requestScope } from '../core/requestScope.js';
import { createGeoJsonFile, createmsportalProjectFile, parseGeoJsonFile, parsemsportalProjectFile, safeFileStem, serializeTransferFile, } from './projectTransfer.js';
import { t, tn } from '../i18n/index.js';
function dateStamp() {
    return new Date().toISOString().slice(0, 10);
}
export class ProjectTransferManager {
    constructor({ session, objectManager, objectCommands }) {
        this.listeners = new Set();
        this.disposed = false;
        let shares = [];
        try { const stored = JSON.parse(localStorage.getItem('mapownik.ownedShares') || '[]'); if (Array.isArray(stored)) shares = stored.filter((x) => /^[a-f0-9]{32}$/.test(x.id) && /^[a-f0-9]{64}$/.test(x.token)); } catch {}
        this.snapshot = { busy: false, operation: null, message: null, error: null, shares };
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            if (this.disposed)
                return () => undefined;
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.session = session;
        this.objectManager = objectManager;
        this.objectCommands = objectCommands;
    }
    async exportProject() {
        return this.run(t('persistence.eksportProjektu'), async () => {
            const loaded = await this.session.exportProjectData();
            const document = createmsportalProjectFile(loaded);
            markBackupSaved(); // 19.43.0: kopia pliku projektu — zeruje licznik przypomnienia
            return {
                text: serializeTransferFile(document),
                filename: `${safeFileStem(document.project.name)}-${dateStamp()}.mapownik`,
                count: document.objects.length,
            };
        }, (result) => t('persistence.zapisanoProjektObiektow', { objects: tn('common.objects', result.count) }));
    }
    /**
     * Zapisuje bieżący projekt na serwerze pod nowym, losowym identyfikatorem
     * i zwraca link do niego. To ZAWSZE nowy wpis — nigdy nie nadpisuje
     * poprzedniego udostępnienia, nawet gdy ten projekt był już raz
     * udostępniony. Dzięki temu nie ma czego nadpisać przez dwie osoby
     * naraz: każde kliknięcie „Udostępnij" to osobny, niezmienny zapis.
     */
    async shareProject() {
        return this.run(t('persistence.udostepnianieProjektu'), async () => {
            const loaded = await this.session.exportProjectData();
            const document = createmsportalProjectFile(loaded);
            const text = serializeTransferFile(document);
            const scope = requestScope(45000); this.request = scope;
            try {
            const response = await fetch('./api/shared_project.php', {
                signal: scope.signal,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: text,
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.id) {
                throw new Error(payload?.error || t('persistence.nieUdaloSieUtworzycLinku', { status: response.status }));
            }
            const url = new URL(window.location.href);
            url.search = '';
            url.hash = '';
            url.searchParams.set('p', payload.id);
            if (payload.ownerToken) this.saveShares([...this.snapshot.shares, { id: payload.id, token: payload.ownerToken, name: document.project.name, createdAt: new Date().toISOString() }]);
            return { url: url.toString(), count: document.objects.length };
            } finally { scope.dispose(); if (this.request === scope) this.request = null; }
        }, (result) => t('persistence.utworzonoLinkDoUdostepnieniaObiektow', { objects: tn('common.objects', result.count) }));
    }
    saveShares(shares) {
        this.update({ shares });
        try { localStorage.setItem('mapownik.ownedShares', JSON.stringify(shares)); } catch { this.update({ error: t('export.share.storageWarning') }); }
    }
    cancelRequest() { this.request?.controller.abort(new DOMException(t('request.cancelled'), 'AbortError')); }
    async revokeShare(id) {
        const share = this.snapshot.shares.find((item) => item.id === id);
        if (!share) throw new Error(t('export.share.noKey'));
        return this.run(t('export.share.revoke'), async () => {
            const scope = requestScope(30000); this.request = scope;
            try {
                const response = await fetch('./api/shared_project.php?action=revoke', { method: 'POST', signal: scope.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, token: share.token }) });
                const data = await response.json();
                if (!response.ok || !data.ok) throw new Error(data.error || t('export.share.revokeError'));
                this.saveShares(this.snapshot.shares.filter((item) => item.id !== id));
                return true;
            } finally { scope.dispose(); if (this.request === scope) this.request = null; }
        }, () => t('export.share.revoked'));
    }
    async importProject(text, beforeReplace) {
        return this.run(t('persistence.importProjektu'), async () => {
            // Validation happens before the current project is touched or backed up.
            const parsed = parsemsportalProjectFile(text);
            const current = await this.session.exportProjectData();
            const backup = createmsportalProjectFile(current);
            await (beforeReplace === null || beforeReplace === void 0 ? void 0 : beforeReplace({
                text: serializeTransferFile(backup),
                filename: `${safeFileStem(backup.project.name)}-${dateStamp()}-kopia-przed-importem.mapownik`,
            }));
            await this.session.replaceProjectData(parsed);
            return { count: parsed.objects.length, name: parsed.name };
        }, (result) => t('persistence.wczytanoObiektow', { name: result.name, objects: tn('common.objects', result.count) }));
    }
    async exportGeoJson(targetProjection) {
        return this.run(t('persistence.eksportGeojson'), async () => {
            const document = createGeoJsonFile(this.objectManager.exportObjects(), targetProjection);
            return {
                text: serializeTransferFile(document),
                filename: `mapownik-obiekty-${dateStamp()}-${targetProjection.replace(':', '')}.geojson`,
                count: document.features.length,
            };
        }, (result) => t('persistence.zapisanoGeojsonObiektow', { objects: tn('common.objects', result.count) }));
    }
    async importGeoJson(text, mode = 'merge') {
        return this.run(t('persistence.importGeojson'), async () => {
            const objects = parseGeoJsonFile(text);
            if (mode === 'replace') {
                await this.session.replaceObjects(objects);
            }
            else {
                const inputs = objects.map(({ order: _order, ...object }) => object);
                this.objectCommands.createMany(inputs, t('persistence.importujGeojson'));
            }
            return { count: objects.length, mode };
        }, (result) => t('persistence.imported', { action: result.mode === 'replace' ? t('persistence.replaced') : t('persistence.added'), objects: tn('common.objects', result.count) }));
    }
    clearMessage() {
        this.update({ message: null, error: null });
    }
    dispose() {
        this.cancelRequest();
        this.disposed = true;
        this.listeners.clear();
    }
    async run(operation, task, successMessage) {
        if (this.disposed)
            throw new Error('Obsługa plików projektu została zamknięta.'); // dev: błąd programisty, nie komunikat dla użytkownika
        if (this.snapshot.busy)
            throw new Error(t('persistence.poczekajNaZakonczenieBiezacejOperacji'));
        this.update({ busy: true, operation, message: null, error: null });
        try {
            const result = await task();
            this.update({ busy: false, operation: null, message: successMessage(result) });
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.update({ busy: false, operation: null, message: null, error: message });
            throw error;
        }
    }
    update(patch) {
        if (this.disposed)
            return;
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners)
            listener();
    }
}
