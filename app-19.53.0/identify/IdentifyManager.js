import { cachedJson, ApiError } from '../core/apiCache.js';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { parseParcelWkt } from '../parcels/wkt.js';
import { geometryArea, parcelCentroid } from '../parcels/parcelGeometrySummary.js';
import { t } from '../i18n/index.js';

const PARCEL_PLUS_TARGETS = [
    { id: 'parcelplus.mpzp', title: 'MPZP', sourceKey: 'mpzp', section: 'planning' },
    { id: 'parcelplus.pog-adopted', title: t('identify.planOgolnyUchwalony'), sourceKey: 'pog_adopted', section: 'planning' },
    { id: 'parcelplus.pog-draft', title: t('identify.planOgolnyProjektowany'), sourceKey: 'pog_draft', section: 'planning' },
    { id: 'parcelplus.pog-zones', title: t('identify.strefaPlanistyczna'), sourceKey: 'pog_zones', section: 'planning' },
    { id: 'parcelplus.natura2000', title: t('identify.natura2000'), sourceKey: 'natura2000', section: 'environment' },
    { id: 'parcelplus.gdos', title: t('identify.pozostaleFormyOchrony'), sourceKey: 'gdos_protection', section: 'environment' },
    // 19.37.0: „Czyj las” — Bank Danych o Lasach (api/forest.php).
    { id: 'parcelplus.forest', title: 'Las — własność (BDL)', sourceKey: 'bdl_forest', url: './api/forest.php', section: 'environment' },
    { id: 'parcelplus.classes', title: t('identify.klasyGruntowEgib'), sourceKey: 'egib_classes', section: 'grunts' },
    // 19.50.0: odpowiedzi na częste pytania o działkę — zabytek, powódź (obszar zagrożenia i strefa ryzyka),
    // wody podziemne i zasób KOWR (usługa rysuje dane — wcześniejsza diagnoza „pusta” była błędna).
    // 19.52.0: hałas i pompa ciepła (geotermia płytka) usunięte na życzenie właściciela.
    { id: 'parcelplus.monument', title: 'Zabytek — rejestr (NID)', sourceKey: 'nid_immovable', section: 'environment' },
    { id: 'parcelplus.flood', title: 'Powódź — obszar zagrożenia', sourceKey: 'flood_mzpmrp', section: 'environment' },
    { id: 'parcelplus.flood-risk', title: 'Powódź — strefa ryzyka', sourceKey: 'flood_risk', section: 'environment' },
    { id: 'parcelplus.gzwp', title: 'Główny Zbiornik Wód Podziemnych', sourceKey: 'gzwp', section: 'environment' },
    { id: 'parcelplus.kowr', title: 'Zasób KOWR', sourceKey: 'kowr', section: 'geology' },
    { id: 'parcelplus.deposit', title: t('identify.zlozeKopalin'), sourceKey: 'pgi_deposits', section: 'geology' },
    { id: 'parcelplus.mining', title: t('identify.obszarGorniczy'), sourceKey: 'pgi_miningareas', section: 'geology' },
];

const INITIAL_SNAPSHOT = {
    active: false,
    open: false,
    pinned: false,
    busy: false,
    parcelBusy: false,
    completed: 0,
    total: 0,
    error: null,
    coordinate2180: null,
    coordinateLonLat: null,
    parcel: null,
    parcelAreaSqm: null,
    parcelCenterLonLat: null,
    zoneOnly: false,
    parcelError: null,
    layers: [],
};
const IDENTIFY_REQUEST_TIMEOUT_MS = 30000;

// 18.12.0: najwyżej 4 zapytania naraz. Przeglądarka i tak wysyła ~6 na serwer,
// a licznik 30 s startował już w kolejce — źródła z końca kolejki dostawały
// fałszywe „przekroczono czas”. Teraz licznik rusza dopiero po wejściu do slotu.
const IDENTIFY_CONCURRENCY = 4;
let identifyActive = 0;
const identifyWaiting = [];
function runQueued(signal, task) {
    return new Promise((resolve, reject) => {
        const start = () => {
            identifyActive += 1;
            Promise.resolve().then(task).then(resolve, reject).finally(() => {
                identifyActive -= 1;
                const next = identifyWaiting.shift();
                if (next) next();
            });
        };
        if (signal?.aborted) { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); return; }
        if (identifyActive < IDENTIFY_CONCURRENCY) { start(); return; }
        const entry = () => { signal?.removeEventListener('abort', onAbort); if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); const n = identifyWaiting.shift(); if (n) n(); } else start(); };
        const onAbort = () => {
            const index = identifyWaiting.indexOf(entry);
            if (index >= 0) identifyWaiting.splice(index, 1);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        identifyWaiting.push(entry);
    });
}
function requestError(payload, fallback) {
    const error = new Error(payload?.error || fallback);
    error.code = payload?.code ?? 'error';
    error.retryable = payload?.retryable !== false;
    return error;
}

async function withRequestTimeout(parentSignal, task) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromParent = () => controller.abort(parentSignal.reason);
    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener('abort', abortFromParent, { once: true });
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, IDENTIFY_REQUEST_TIMEOUT_MS);
    try {
        return await task(controller.signal);
    } catch (error) {
        if (timedOut) {
            const timeoutError = new Error(t('identify.timeout'));
            timeoutError.name = 'TimeoutError';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        parentSignal.removeEventListener('abort', abortFromParent);
    }
}
function shouldIgnoreClick(managers) {
    // 18.0: tryby deklarują się w manifestach funkcji (InteractionRegistry).
    // Kliknięcie jest ignorowane, gdy KTÓRYKOLWIEK inny tryb przejmuje teraz
    // mapę — rysowanie, edycja, pomiar, bufor, pobieranie działki, profil.
    // Tryb edycji zgłasza się jako przejmujący, gdy nie jest w spoczynkowym
    // 'pan' (patrz editingFeature). Identify samo ustawia 'pan' przy aktywacji.
    if (managers?.interactions) return managers.interactions.isAnyCapturing('identify');
    const editing = managers.editingManager.getSnapshot();
    const measurement = managers.measurementManager.getSnapshot();
    const buffer = managers.bufferManager.getSnapshot();
    const parcel = managers.parcelManager.getSnapshot();
    if (measurement.mode || buffer.active || parcel.active) return true;
    if (editing.suspended || editing.drawing || editing.modifying) return true;
    return editing.mode !== 'pan';
}
async function readJson(response, fallbackMessage) {
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(fallbackMessage); }
    return payload;
}
function withSections(targets, section) {
    return targets.map((target) => ({ ...target, section: target.section || section }));
}

export class IdentifyManager {
    constructor(host, layerManager, managers) {
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
        this.managers = managers;
        this.markerSource = new VectorSource();
        this.markerLayer = new VectorLayer({
            source: this.markerSource,
            zIndex: 10050,
            // 19.46.0: wybrana działka wyraźniej — biała obwódka pod niebieską linią 3 px (widoczna na ortofotomapie
            // i na jasnym podkładzie) oraz wypełnienie 16%. Wcześniej linia 2 px z wypełnieniem 8% ginęła na mapie.
            style: [
                new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 6 }) }),
                new Style({
                    image: new CircleStyle({
                        radius: 6,
                        fill: new Fill({ color: 'rgba(37,99,235,0.20)' }),
                        stroke: new Stroke({ color: '#2563eb', width: 2 }),
                    }),
                    fill: new Fill({ color: 'rgba(37,99,235,0.16)' }),
                    stroke: new Stroke({ color: '#1d4ed8', width: 3 }),
                }),
            ],
            properties: { catalogId: 'runtime.identify-marker' },
        });
        this.host.addLayer(this.markerLayer);
        this.unsubscribeClick = this.host.onSingleClick((click) => this.handleClick(click));
    }
    activate() {
        this.assertAlive();
        if (!this.snapshot.active) this.updateSnapshot({ active: true, error: null });
    }
    deactivate() {
        this.assertAlive();
        // 19.47.0: przy wybranej działce zmiana narzędzia (np. Sprawdź → Mierz) nie kasuje wyniku — karta,
        // obrys i Raport PDF zostają, narzędzie tylko przestaje reagować na kliknięcia mapy. Wynik czyści
        // zamknięcie karty (close) albo kolejne sprawdzenie.
        if (this.snapshot.parcel) {
            if (this.snapshot.active) this.updateSnapshot({ active: false });
            return;
        }
        this.requestController?.abort();
        this.requestController = null;
        this.requestToken += 1;
        this.markerSource.clear(true);
        this.updateSnapshot({ ...INITIAL_SNAPSHOT, active: false });
    }
    close() {
        this.assertAlive();
        const active = this.snapshot.active;
        this.requestController?.abort();
        this.requestController = null;
        this.requestToken += 1;
        this.markerSource.clear(true);
        this.updateSnapshot({ ...INITIAL_SNAPSHOT, active });
    }
    /** 18.14.1: pomija kliknięcia mapy przez `ms` milisekund (np. po przytrzymaniu palca). */
    suppressClicks(ms = 700) { this.suppressClicksUntil = Date.now() + ms; }
    /** 18.14.1: wstrzymuje / wznawia reagowanie na kliknięcia (pomiar z celownikiem). */
    holdClicks(value) { this.clicksHeld = Boolean(value); }
    togglePinned() {
        this.assertAlive();
        this.updateSnapshot({ pinned: !this.snapshot.pinned });
    }
    async handleClick(click) {
        if (this.disposed || this.snapshot.pinned || shouldIgnoreClick(this.managers)) return;
        // 18.14.1: telefon — po przytrzymaniu palca i w trakcie pomiaru z celownikiem kliknięcie nie otwiera działki.
        if (this.clicksHeld || Date.now() < (this.suppressClicksUntil ?? 0)) return;
        if (this.host.getFeaturesAtPixel(click.pixel).some((feature) => feature.get('kowr'))) return;
        const [x, y] = click.coordinate2180;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (!this.snapshot.active) {
            const zonesVisible = this.layerManager.getSnapshot().layers.some((layer) => layer.id === 'overlay.pog.zones' && layer.visible && (this.host.getViewSnapshot().zoom >= layer.minZoom));
            if (zonesVisible) void this.handleZoneClick(click);
            return;
        }
        await this.runAt(click);
    }
    /**
     * 19.8.5: karta działki dla wskazanego punktu bez klikania w mapę — np. po wyborze
     * działki w wyszukiwarce (audyt UX B10). Jawne polecenie użytkownika, więc działa
     * także wtedy, gdy narzędzie „Sprawdź miejsce” jest wyłączone albo wynik był przypięty.
     */
    async identifyAt(click) {
        if (this.disposed) return;
        const [x, y] = click?.coordinate2180 ?? [];
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (this.snapshot.pinned) this.updateSnapshot({ pinned: false });
        await this.runAt(click);
    }
    async runAt(click) {
        const [x, y] = click.coordinate2180;
        this.requestController?.abort();
        const controller = new AbortController();
        const token = this.requestToken + 1;
        this.requestToken = token;
        this.requestController = controller;
        this.markerSource.clear(true);
        this.markerSource.addFeature(new Feature(new Point(click.coordinate3857)));

        const coreKeys = new Set(PARCEL_PLUS_TARGETS.map((target) => target.sourceKey));
        const activeTargets = withSections(this.layerManager.getIdentifyTargets(), 'active')
            .filter((target) => !coreKeys.has(target.sourceKey))
            .map((target) => ({ ...target, section: target.sourceKey.startsWith('kiut_') ? 'utilities' : 'active' }));
        const targets = [...PARCEL_PLUS_TARGETS, ...activeTargets];
        this.lastTargets = targets; // 18.12.1: do „Ponów”

        this.updateSnapshot({
            open: true,
            busy: true,
            parcelBusy: true,
            completed: 0,
            total: targets.length + 1,
            error: null,
            coordinate2180: [...click.coordinate2180],
            coordinateLonLat: [...click.coordinateLonLat],
            parcel: null,
            parcelAreaSqm: null,
            parcelCenterLonLat: null,
            zoneOnly: false,
            parcelError: null,
            layers: targets.map((target) => ({ id: target.id, title: target.title, sourceKey: target.sourceKey, section: target.section, status: 'loading', text: null, error: null })),
        });

        let remaining = targets.length + 1;
        const isCurrentRequest = () => !this.disposed && !controller.signal.aborted && token === this.requestToken;
        const finishOne = () => {
            if (!isCurrentRequest()) return;
            remaining -= 1;
            const complete = remaining === 0;
            const coreLayers = this.snapshot.layers.filter((item) => item.section !== 'active' && item.section !== 'utilities');
            const allCoreErrors = coreLayers.length > 0 && coreLayers.every((item) => item.status === 'error');
            this.updateSnapshot({
                busy: !complete,
                completed: targets.length + 1 - remaining,
                error: complete && this.snapshot.parcelError && allCoreErrors ? t('identify.nieUdaloSiePobracDanych') : null,
            });
        };
        const parcelTask = this.fetchParcel(x, y, controller.signal)
            .then((parcel) => {
                if (!isCurrentRequest()) return;
                this.applyParcel(parcel);
            })
            .catch((error) => {
                if (!isCurrentRequest() || error?.name === 'AbortError') return;
                this.updateSnapshot({ parcel: null, parcelAreaSqm: null, parcelCenterLonLat: null, parcelError: error instanceof Error ? error.message : String(error), parcelBusy: false });
            })
            .finally(finishOne);
        const layerTasks = targets.map((target) => this.fetchLayer(target, x, y, controller.signal)
            .then((result) => {
                if (isCurrentRequest()) this.updateLayerResult(result);
            })
            .catch((error) => {
                if (!isCurrentRequest() || error?.name === 'AbortError') return;
                this.updateLayerResult({
                    id: target.id,
                    title: target.title,
                    sourceKey: target.sourceKey,
                    section: target.section,
                    status: 'error',
                    text: null,
                    error: error instanceof Error ? error.message : String(error),
                    code: error?.name === 'TimeoutError' ? 'timeout' : (error?.code ?? 'error'),
                });
            })
            .finally(finishOne));
        await Promise.all([parcelTask, ...layerTasks]);
        if (this.requestController === controller) this.requestController = null;
    }
    /** Ustawia działkę z ULDK: powierzchnia, środek, obrys na mapie. */
    applyParcel(parcel) {
        let parcelAreaSqm = null;
        let parcelCenterLonLat = null;
        if (parcel?.wkt) {
            try {
                const geometry = parseParcelWkt(parcel.wkt);
                parcelAreaSqm = geometryArea(geometry);
                const olGeometry = geometry.type === 'Polygon'
                    ? new Polygon(geometry.coordinates)
                    : new MultiPolygon(geometry.coordinates);
                const center = parcelCentroid(geometry);
                if (center) parcelCenterLonLat = new Point(center).transform('EPSG:2180', 'EPSG:4326').getCoordinates();
                olGeometry.transform('EPSG:2180', 'EPSG:3857');
                const feature = new Feature(olGeometry);
                feature.set('kind', 'identified-parcel');
                this.markerSource.addFeature(feature);
            } catch {
                parcelAreaSqm = null;
            }
        }
        this.updateSnapshot({ parcel, parcelAreaSqm, parcelCenterLonLat, parcelError: null, parcelBusy: false });
    }
    /**
     * 18.12.1: ponawia źródła z błędem (wszystkie albo wskazane) dla bieżącego
     * punktu — bez ponownego odpytywania źródeł, które już odpowiedziały.
     */
    async retryFailed(ids = null) {
        if (this.disposed || !Array.isArray(this.snapshot.coordinate2180)) return;
        const [x, y] = this.snapshot.coordinate2180;
        const token = this.requestToken;
        const controller = this.requestController && !this.requestController.signal.aborted ? this.requestController : new AbortController();
        this.requestController = controller;
        const wanted = ids ? new Set(ids) : null;
        // 19.43.0: bez źródeł, których gmina nie publikuje (code not_published) — ponowienie nic nie zmieni.
        const failed = (this.snapshot.layers ?? []).filter((layer) => layer.status === 'error' && layer.code !== 'not_published' && (!wanted || wanted.has(layer.id)));
        const targets = failed.map((layer) => (this.lastTargets ?? []).find((target) => target.id === layer.id)).filter(Boolean);
        const retryParcel = !wanted && Boolean(this.snapshot.parcelError);
        if (!targets.length && !retryParcel) return;
        const ids_ = new Set(targets.map((target) => target.id));
        this.updateSnapshot({
            busy: true, error: null,
            ...(retryParcel ? { parcelBusy: true, parcelError: null } : {}),
            layers: this.snapshot.layers.map((layer) => ids_.has(layer.id) ? { ...layer, status: 'loading', error: null, code: null } : layer),
        });
        const current = () => !this.disposed && token === this.requestToken && !controller.signal.aborted;
        const tasks = targets.map((target) => this.fetchLayer(target, x, y, controller.signal)
            .then((result) => { if (current()) this.updateLayerResult(result); })
            .catch((error) => {
                if (!current() || error?.name === 'AbortError') return;
                this.updateLayerResult({ id: target.id, title: target.title, sourceKey: target.sourceKey, section: target.section, status: 'error', text: null, error: error instanceof Error ? error.message : String(error), code: error?.name === 'TimeoutError' ? 'timeout' : (error?.code ?? 'error') });
            }));
        if (retryParcel) {
            tasks.push(this.fetchParcel(x, y, controller.signal)
                .then((parcel) => { if (current()) this.applyParcel(parcel); })
                .catch((error) => { if (current() && error?.name !== 'AbortError') this.updateSnapshot({ parcelError: error instanceof Error ? error.message : String(error), parcelBusy: false }); }));
        }
        await Promise.all(tasks);
        if (current()) this.updateSnapshot({ busy: false });
    }
    async handleZoneClick(click) {
        this.requestController?.abort();
        const controller = new AbortController();
        const token = ++this.requestToken;
        this.requestController = controller;
        const target = PARCEL_PLUS_TARGETS.find((item) => item.sourceKey === 'pog_zones');
        try {
            const result = await this.fetchLayer(target, ...click.coordinate2180, controller.signal);
            if (controller.signal.aborted || this.disposed || token !== this.requestToken || result.status !== 'ready'
                || !this.layerManager.getSnapshot().layers.some((layer) => layer.id === 'overlay.pog.zones' && layer.visible)) return;
            this.markerSource.clear(true);
            this.markerSource.addFeature(new Feature(new Point(click.coordinate3857)));
            this.updateSnapshot({ ...INITIAL_SNAPSHOT, active: false, open: true, zoneOnly: true, coordinate2180: [...click.coordinate2180], coordinateLonLat: [...click.coordinateLonLat], layers: [result] });
        } catch { /* Kliknięcie poza zasięgiem usługi nie zasłania mapy komunikatem. */ }
        finally { if (this.requestController === controller) this.requestController = null; }
    }
    async fetchParcel(x, y, signal) {
        const url = new URL('./api/uldk.php', window.location.href);
        url.searchParams.set('x', x.toFixed(3));
        url.searchParams.set('y', y.toFixed(3));
        return runQueued(signal, () => withRequestTimeout(signal, async (requestSignal) => {
            const response = await fetch(url, { signal: requestSignal, cache: 'no-store' });
            const payload = await readJson(response, t('identify.nieprawidlowaOdpowiedzUldk'));
            if (response.status === 404) return null;
            if (!response.ok || !payload?.ok) throw requestError(payload, t('identify.bladUldk'));
            return payload.parcel ?? null;
        }));
    }
    async fetchLayer(target, x, y, signal) {
        const url = new URL(target.url ?? './api/identify.php', window.location.href);
        if (!target.url) url.searchParams.set('source', target.sourceKey);
        url.searchParams.set('x', x.toFixed(3));
        url.searchParams.set('y', y.toFixed(3));
        return runQueued(signal, () => withRequestTimeout(signal, async (requestSignal) => {
            // 19.43.0: przez pamięć zapytań (core/apiCache.js) — ta sama działka/punkt w ciągu 5 minut
            // (ponowne kliknięcie, raport PDF) nie odpytuje ponownie ~20 usług.
            let payload;
            try { payload = await cachedJson(url.toString(), { signal: requestSignal }); }
            catch (error) {
                if (error?.name === 'AbortError' || requestSignal.aborted) throw error;
                if (error instanceof ApiError && error.payload) throw requestError(error.payload, t('identify.nieUdaloSieOdczytacWarstwy', { title: target.title }));
                if (error instanceof ApiError) throw new Error(t('identify.nieprawidlowaOdpowiedzWarstwy', { title: target.title }));
                throw error;
            }
            return {
                id: target.id,
                title: target.title,
                sourceKey: target.sourceKey,
                section: target.section,
                status: payload.found ? 'ready' : 'empty',
                text: payload.found ? payload.text : null,
                // 18.18.3: liczba obiektów i podstawa wyniku ('structured' = policzone
                // w JSON/GML/XML, 'text' = rozpoznane z opisu HTML/tekst).
                count: Number.isFinite(payload.count) ? payload.count : null,
                basis: payload.basis ?? null,
                // 19.50.0: wynik z zapasowego źródła (EEA zamiast GDOŚ) — z opisem i informacją o niepełnym zakresie.
                fallback: payload.fallback ?? null,
                fallbackNote: payload.fallbackNote ?? null,
                partial: Boolean(payload.partial),
                error: null,
            };
        }));
    }
    updateLayerResult(result) {
        const current = this.snapshot.layers ?? [];
        if (!current.some((layer) => layer.id === result.id)) return;
        this.updateSnapshot({ layers: current.map((layer) => layer.id === result.id ? result : layer) });
    }
    dispose() {
        if (this.disposed) return;
        this.requestController?.abort();
        this.requestController = null;
        this.unsubscribeClick?.();
        this.unsubscribeClick = null;
        this.markerSource.clear(true);
        this.host.removeLayer(this.markerLayer);
        this.markerLayer.dispose?.();
        this.disposed = true;
        this.listeners.clear();
    }
    updateSnapshot(patch) {
        if (this.disposed) return;
        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners) listener();
    }
    assertAlive() {
        if (this.disposed) throw new Error('IdentifyManager has already been disposed.');
    }
}
