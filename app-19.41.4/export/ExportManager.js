import { requestScope } from '../core/requestScope.js';
import { appDialogs } from '../core/index.js';
import { transform } from 'ol/proj.js';
import { ensureProjectProjectionRegistered } from '../projections/index.js';
import { extendCoordinates } from '../geometry/coordinateExtent.js';
import { dataCatalog } from '../data/catalog/index.js';
import { deriveRoadGeometries } from '../road/index.js';
import { t } from '../i18n/index.js';

const EMPTY_CAPS = { ok: false, gd: false, zip: false, safe_single_pixels: 12000000, max_batch_tile_pixels: 8000000, batch_tile_px: 2048, max_client_archive_bytes: 268435456, max_dimension: 30000, batch: false, georef: true, project_layout: false };
const BASEMAP_SOURCE = {
    'basemap.topography': 'topography',
    'basemap.orthophoto': 'orthophoto',
    'basemap.orthophoto.archive': 'orthophoto_archive',
    'basemap.orthophoto.true': 'orthophoto_true',
    'basemap.nmt.shaded': 'nmt_shaded',
};
const NICE_RESOLUTIONS = [0.02, 0.05, 0.1, 0.15, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20];
// 18.11.1: podkład bez renderowania po stronie serwera (np. OSM) zastępujemy w eksporcie mapą topograficzną.
const EXPORT_FALLBACK_BASEMAP = 'topography';
function sourceKey(definition) {
    const raw = definition?.source?.url ?? definition?.source?.fallbackWmsUrl ?? '';
    const match = /[?&]source=([^&]+)/.exec(raw);
    return match ? decodeURIComponent(match[1]) : null;
}
export function extentOfObjects(objects) {
    const extent = [Infinity, Infinity, -Infinity, -Infinity];
    for (const object of objects) if (object.visible !== false) extendCoordinates(extent, object.geometry?.coordinates);
    if (!extent.every(Number.isFinite)) return null;
    const [minX, minY, maxX, maxY] = extent;
    const pad = Math.max(15, Math.max(maxX - minX, maxY - minY) * 0.06);
    return [minX - pad, minY - pad, maxX + pad, maxY + pad];
}
function expandRoadObjects(objects) {
    const result = [];
    for (const object of objects) {
        if (object.visible === false) continue;
        if (object.kind !== 'road') { result.push(object); continue; }
        try {
            const props = object.properties ?? {};
            const derived = deriveRoadGeometries(object.geometry, props.roadWidthMeters, props.curveRadiusMeters);
            result.push({ ...object, name: t('export.powierzchniaDrogi', { name: object.name }), geometry: derived.roadSurface, style: { ...object.style, fillColor: '#94a3b8', fillOpacity: 0.22, strokeColor: '#475569', strokeWidth: 2 } });
            result.push({ ...object, id: `${object.id}-swept`, name: t('export.sweptPath', { name: object.name }), geometry: derived.sweptPath, style: { ...object.style, fillColor: '#f59e0b', fillOpacity: 0.18, strokeColor: '#d97706', strokeWidth: 2 } });
            if (derived.wheelPath) result.push({ ...object, id: `${object.id}-wheels`, name: t('export.wheelPath', { name: object.name }), geometry: derived.wheelPath, style: { ...object.style, fillColor: '#b45309', fillOpacity: 0, strokeColor: '#b45309', strokeWidth: 1 } });
            result.push({ ...object, id: `${object.id}-axis`, name: t('export.os', { name: object.name }), geometry: derived.roundedAxis, style: { ...object.style, fillOpacity: 0, strokeColor: '#334155', strokeWidth: 2 } });
        } catch {
            result.push(object);
        }
    }
    return result;
}
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function filenameFromResponse(response, fallback) {
    const header = response.headers.get('content-disposition') ?? '';
    const match = /filename="?([^";]+)"?/i.exec(header); return match?.[1] ?? fallback;
}

async function responseBlobWithProgress(response, onProgress, memoryEfficientThreshold = 64 * 1024 * 1024) {
    const total = Number(response.headers.get('content-length')) || 0;
    // For large archives prefer the browser's native Body->Blob path. Building
    // an array of Uint8Array chunks and then another Blob can briefly duplicate
    // hundreds of MB in JS heap, especially on mobile devices.
    if (!total || total >= memoryEfficientThreshold || !response.body || !response.body.getReader) {
        onProgress?.(null, 0, total);
        const blob = await response.blob();
        onProgress?.(100, blob.size, total || blob.size);
        return blob;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onProgress?.(total ? Math.min(100, Math.round(received / total * 100)) : null, received, total);
    }
    return new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
}
function decodeWorldFile(response) {
    const encoded = response.headers.get('x-mapownik-world-file');
    if (!encoded) return null;
    try { return atob(encoded); } catch { return null; }
}
export class ExportManager {
    constructor({ controller, layerManager, basemapManager, objectManager, analysisManager = null }) {
        this.analysisManager = analysisManager; this.controller = controller; this.layerManager = layerManager; this.basemapManager = basemapManager; this.objectManager = objectManager;
        this.listeners = new Set(); this.disposed = false; this.cancelSelection = null; this.lastIncompleteOptions = null;
        this.snapshot = { busy: false, selecting: false, operation: null, progress: null, message: null, error: null, incomplete: null, capabilities: EMPTY_CAPS, selectedExtent: null };
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => { if (this.disposed) return () => undefined; this.listeners.add(listener); return () => this.listeners.delete(listener); };
        // 17.8.11: możliwości serwera pobierane dopiero przy otwarciu panelu
        // Eksport (ensureCapabilities), a nie przy każdym starcie aplikacji.
        this.capabilitiesRequested = false;
    }
    ensureCapabilities() {
        if (this.capabilitiesRequested || this.disposed) return;
        this.capabilitiesRequested = true;
        void this.refreshCapabilities();
    }
    async refreshCapabilities() {
        this.capabilitiesRequested = true;
        try { const r = await fetch('./api/export.php?action=capabilities', { cache: 'no-store' }); const c = await r.json(); if (!r.ok || !c.ok) throw new Error(c.error ?? t('export.brakMozliwosciEksportu')); this.update({ capabilities: c, error: null }); }
        catch (error) { this.update({ capabilities: EMPTY_CAPS, error: error instanceof Error ? error.message : String(error) }); }
    }
    selectArea() {
        this.cancelSelection?.();
        this.update({ selecting: true, message: t('export.zaznaczProstokatNaMapieEsc'), error: null });
        let selected = false;
        this.cancelSelection = this.controller.selectBoxExtent((extent) => {
            selected = true;
            this.update({ selectedExtent: extent, message: t('export.zapisanoProstokatEksportu') });
        }, () => {
            this.cancelSelection = null;
            this.update({ selecting: false, message: selected ? t('export.zapisanoProstokatEksportu') : t('export.anulowanoWyborObszaruEksportu') });
        });
    }
    clearSelectedArea() { this.cancelSelection?.(); this.cancelSelection = null; this.update({ selecting: false, selectedExtent: null, message: null }); }
    resolveExtent(areaMode) {
        if (areaMode === 'selection') { if (!this.snapshot.selectedExtent) throw new Error(t('export.najpierwZaznaczProstokatEksportuNa')); return [...this.snapshot.selectedExtent]; }
        if (areaMode === 'objects') { const extent = extentOfObjects(this.objectManager.exportObjects()); if (!extent) throw new Error(t('export.projektNieZawieraWidocznychObiektow')); return extent; }
        return this.controller.getViewportExtent2180();
    }
    /**
     * 19.18.0: rozdzielczość ekranu (m/px w EPSG:2180) zaokrąglona w dół do „okrągłej”
     * wartości — szybki eksport bieżącego widoku nie może mieć mniej pikseli niż mapa
     * na ekranie (przy 1:150 i stałych 0,25 m/px plik miał 255 × 160 px).
     */
    screenResolution() {
        try {
            const bbox = this.controller.getViewportExtent2180();
            const size = this.controller.map?.getSize?.();
            if (!bbox || !size?.[0]) return null;
            const meters = (bbox[2] - bbox[0]) / size[0];
            if (!Number.isFinite(meters) || meters <= 0) return null;
            return [...NICE_RESOLUTIONS].reverse().find((value) => value <= meters + 1e-9) ?? NICE_RESOLUTIONS[0];
        } catch { return null; }
    }
    /**
     * 18.11.1: najdrobniejsza „okrągła” rozdzielczość (m/px), przy której obraz
     * mieści się w limicie jednego pliku. Nie schodzi poniżej wartości z opcji.
     * Zwraca null, gdy obszar jest zbyt duży nawet przy 20 m/px.
     */
    fitResolution(options = {}) {
        const bbox = this.resolveExtent(options.areaMode ?? 'current');
        const caps = this.snapshot.capabilities ?? EMPTY_CAPS;
        const maxPixels = Math.max(1, (Number(caps.safe_single_pixels) || 12000000) * 0.98);
        const maxDimension = Number(caps.max_dimension) || 30000;
        const w = Math.max(1, bbox[2] - bbox[0]); const hgt = Math.max(1, bbox[3] - bbox[1]);
        const wanted = Math.max(0.02, Number(options.resolution) || 0.25);
        const needed = Math.max(wanted, Math.sqrt((w * hgt) / maxPixels), w / maxDimension, hgt / maxDimension);
        return NICE_RESOLUTIONS.find((value) => value >= needed - 1e-9) ?? null;
    }
    buildPlan(options) {
        const bbox = this.resolveExtent(options.areaMode ?? 'current');
        const resolution = Math.max(0.02, Math.min(20, Number(options.resolution) || 0.25));
        const width = Math.max(128, Math.ceil((bbox[2] - bbox[0]) / resolution));
        const height = Math.max(128, Math.ceil((bbox[3] - bbox[1]) / resolution));
        const pixels = width * height; const caps = this.snapshot.capabilities ?? EMPTY_CAPS;
        const estimatedBytes = Math.round(pixels * ((options.format ?? 'png') === 'jpeg' ? 0.45 : 1.7));
        const maxDimension = caps.max_dimension ?? 30000;
        const batchTilePx = Math.max(512, Number(caps.batch_tile_px) || 2048);
        const batchTiles = Math.ceil(width / batchTilePx) * Math.ceil(height / batchTilePx);
        const maxClientArchiveBytes = Math.max(64 * 1024 * 1024, Number(caps.max_client_archive_bytes) || 268435456);
        const batchSafe = Boolean(caps.batch)
            && width <= maxDimension && height <= maxDimension && batchTiles <= 64
            && estimatedBytes <= maxClientArchiveBytes;
        return { bbox, resolution, width, height, pixels, megapixels: pixels / 1e6, estimatedBytes, singleSafe: pixels <= (caps.safe_single_pixels ?? 0) && width <= maxDimension && height <= maxDimension, batchAvailable: Boolean(caps.batch), batchTilePx, batchTiles, maxClientArchiveBytes, batchSafe };
    }
    visibleExportLayers(options = {}) {
        const snapshot = this.layerManager.getSnapshot(); const definitions = new Map(dataCatalog.layers.map((d) => [d.id, d]));
        const overlays = []; const legend = []; const omitted = []; const vectors = [];
        for (const layer of snapshot.layers) {
            if (!layer.visible || layer.role === 'basemap') continue;
            const definition = definitions.get(layer.id); const key = sourceKey(definition);
            if (key) { overlays.push(key); legend.push(layer.title); }
            else if (definition?.source?.kind === 'kowr-points') { vectors.push(definition); legend.push(layer.title); }
            else omitted.push(layer.title);
        }
        const baseSnapshot = this.basemapManager.getSnapshot(); const activeId = baseSnapshot.activeId; let basemap = BASEMAP_SOURCE[activeId] ?? null;
        const activeTitle = baseSnapshot.items.find((x) => x.id === activeId)?.title ?? null;
        let basemapSubstitute = null;
        if (!basemap && activeId) {
            basemapSubstitute = { from: activeTitle || activeId, to: baseSnapshot.items.find((x) => x.id === 'basemap.topography')?.title ?? 'Topo' };
            basemap = EXPORT_FALLBACK_BASEMAP;
        }
        if (options.basemapChoice === 'none') { basemap = null; basemapSubstitute = null; }
        const basemapOptions = this.basemapManager.getPreferences?.() ?? { archiveMonth: '2025-11', photoOpacity: 1 };
        if (basemapSubstitute && options.basemapChoice === 'topography') legend.unshift(basemapSubstitute.to);
        else if (activeTitle && basemap) legend.unshift(activeId === 'basemap.orthophoto.archive' ? `${activeTitle} · ${basemapOptions.archiveMonth}` : activeTitle);
        return { basemap, basemapOptions, overlays, legend, activeId, activeTitle, omitted, vectors, basemapSubstitute };
    }
    exportWarnings(options = {}) {
        const layers = this.visibleExportLayers(options);
        const messages = [];
        if (options.includeOverlays !== false && layers.omitted.length) messages.push(t('export.omittedLayers', { names: layers.omitted.join(', ') }));
        const analysis = this.analysisManager?.getSnapshot();
        if ((analysis?.previewVisible && analysis.previewCount) || (analysis?.resultVisible && analysis.resultCount)) messages.push(t('export.analysisPreviewNotice'));
        return messages;
    }
    /** 18.11.1: informacje bez potwierdzania (np. zastąpiony podkład). */
    exportNotices() {
        const sub = this.visibleExportLayers().basemapSubstitute;
        return sub ? [t('export.substitutedBasemap', { name: sub.from, to: sub.to })] : [];
    }
    async exportVectorObjects(layers, bbox, signal) {
        if (!layers.vectors.length) return [];
        ensureProjectProjectionRegistered();
        const objects = [];
        for (const definition of layers.vectors) {
            const response = await fetch(definition.source.url, { signal, cache: 'no-cache' });
            if (!response.ok) throw new Error(t('export.vectorError', { name: definition.title }));
            const data = await response.json();
            if (!Array.isArray(data.records) || data.records.length !== data.installations) throw new Error(t('export.vectorError', { name: definition.title }));
            for (const record of data.records) {
                if (!Number.isFinite(record.lon) || !Number.isFinite(record.lat)) continue;
                const coordinates = transform([record.lon, record.lat], 'EPSG:4326', 'EPSG:2180');
                if (coordinates[0] < bbox[0] || coordinates[0] > bbox[2] || coordinates[1] < bbox[1] || coordinates[1] > bbox[3]) continue;
                const color = record.biomethane_mw != null ? '#685b95' : '#296c6f';
                objects.push({ id: `kowr:${record.id}`, name: record.company, visible: true, kind: 'geometry', geometry: { type: 'Point', coordinates }, style: { strokeColor: '#ffffff', strokeWidth: 2, fillColor: color, fillOpacity: 0.8, pointRadius: 7 } });
            }
        }
        return objects;
    }
    async previewRaster(options) {
        const plan = this.buildPlan(options);
        const resolution = Math.max(plan.resolution, (plan.bbox[2] - plan.bbox[0]) / 640, (plan.bbox[3] - plan.bbox[1]) / 480);
        return this.exportRaster({ ...options, resolution, mode: 'single', format: 'png', georef: false, sourceResolution: options.resolution, preview: true });
    }
    cancelExport() { this.request?.controller.abort(new DOMException(t('request.cancelled'), 'AbortError')); }
    async exportRaster(options) {
        if (this.snapshot.busy) throw new Error(t('request.busy'));
        const warnings = this.exportWarnings(options);
        if (warnings.length && !await appDialogs.confirm({ title: t('export.omissionsTitle'), message: warnings.join('\n'), confirmLabel: t('export.omissionsAccept') })) return null;
        if (this.snapshot.busy) throw new Error(t('export.eksportJestJuzWToku'));
        const active = this.visibleExportLayers(options);
        if (active.basemapSubstitute && options.basemapChoice !== 'topography') throw new Error('Wybierz podkład eksportu: topografia lub bez podkładu.');
        const plan = this.buildPlan(options); const mode = options.mode === 'batch' ? 'batch' : 'single';
        if (mode === 'single' && !plan.singleSafe) throw new Error(t('export.tenObrazPrzekraczaBezpiecznyLimit'));
        if (mode === 'batch' && !plan.batchAvailable) throw new Error(t('export.hostingNieUdostepniaZiparchivePakiet'));
        if (mode === 'batch' && !plan.batchSafe) throw new Error(t('export.eksportJestZbytDuzyDla', { batchTilePx: plan.batchTilePx, value: Math.round(plan.maxClientArchiveBytes / 1048576) }));
        const layers = this.visibleExportLayers(options);
        if (layers.basemap === 'orthophoto' && Number(options.sourceResolution ?? options.resolution) <= 0.25) layers.basemap = 'orthophoto_high';
        const osmWithoutBasemap = !layers.basemap && layers.activeId === 'basemap.osm';
        const objects = options.includeObjects === false ? [] : expandRoadObjects(this.objectManager.exportObjects());
        const payload = { mode, bbox: plan.bbox, width: plan.width, height: plan.height, format: options.format === 'jpeg' ? 'jpeg' : 'png', quality: Number(options.quality) || 90, basemap: layers.basemap, overlays: options.includeOverlays === false ? [] : layers.overlays, objects, layout: options.layout === 'project' ? 'project' : 'plain', title: options.title ?? t('export.raster.defaultTitle'), legend: layers.legend, georef: Boolean(options.georef), allow_gaps: Boolean(options.allowGaps) };
        this.update({ busy: true, operation: mode === 'batch' ? t('export.generowaniePakietuKafli') : t('export.generowanieObrazu'), progress: { phase: 'render', percent: null, received: 0, total: 0 }, incomplete: null, error: null, message: null });
        const scope = requestScope(300000); this.request = scope;
        try {
            const vectorObjects = options.includeOverlays === false ? [] : await this.exportVectorObjects(layers, plan.bbox, scope.signal);
            payload.objects = [...vectorObjects, ...objects];
            if (payload.objects.length > 5000) throw new Error(t('export.objectLimit'));
            const response = await fetch('./api/export.php', { method: 'POST', signal: scope.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                let body = null; let message = t('export.eksportHttp', { status: response.status });
                try { body = await response.json(); message = body.error ?? message; } catch {}
                if (response.status === 409 && body?.code === 'EXPORT_INCOMPLETE') {
                    this.lastIncompleteOptions = { ...options, allowGaps: false };
                    this.update({ busy: false, operation: null, progress: null, incomplete: body, error: null, message: null });
                    return { ...plan, incomplete: true, report: body };
                }
                throw new Error(message);
            }
            this.update({ operation: t('export.progress.downloadAny'), progress: { phase: 'download', percent: 0, received: 0, total: Number(response.headers.get('content-length')) || 0 } });
            const blob = await responseBlobWithProgress(
                response,
                (percent, received, total) => this.update({ progress: { phase: 'download', percent, received, total } }),
                mode === 'batch' ? 48 * 1024 * 1024 : 96 * 1024 * 1024,
            ); const fallback = mode === 'batch' ? 'mapownik-export-kafle.zip' : `mapownik-export.${payload.format === 'jpeg' ? 'jpg' : 'png'}`;
            scope.signal.throwIfAborted();
            if (options.preview) {
                if (this.snapshot.previewUrl) URL.revokeObjectURL(this.snapshot.previewUrl);
                this.update({ previewUrl: URL.createObjectURL(blob), busy: false, operation: null, progress: null, incomplete: null, message: 'Podgląd gotowy. To pomniejszenie obrazu; rozdzielczość pobieranego pliku jest osobnym parametrem.', error: null });
                return plan;
            }
            const filename = filenameFromResponse(response, fallback); downloadBlob(blob, filename);
            const world = mode === 'single' && payload.georef && payload.layout === 'plain' ? decodeWorldFile(response) : null;
            if (world) { const ext = payload.format === 'jpeg' ? 'jgw' : 'pgw'; downloadBlob(new Blob([world], { type: 'text/plain;charset=utf-8' }), filename.replace(/\.[^.]+$/, `.${ext}`)); }
            const doneMessage = mode === 'batch' ? t('export.pobranoPakietKafliZipZ') : t('export.pobranoObrazPx', { width: plan.width, height: plan.height, gaps: options.allowGaps ? t('export.gapsAccepted') : '' });
            this.lastIncompleteOptions = null;
            this.update({ busy: false, operation: null, progress: { phase: 'done', percent: 100, received: blob.size, total: blob.size }, incomplete: null, message: doneMessage + (osmWithoutBasemap ? t('export.aktywnyOsmNieJestRenderowany') : ''), error: null });
            return plan;
        } catch (error) { const message = error instanceof Error ? error.message : String(error); this.update({ busy: false, operation: null, progress: null, error: message }); throw error; }
        finally { scope.dispose(); if (this.request === scope) this.request = null; }
    }
    async retryIncomplete() {
        if (!this.lastIncompleteOptions) return null;
        const options = { ...this.lastIncompleteOptions, allowGaps: false };
        this.update({ incomplete: null, error: null, message: t('export.ponawianieBrakujacychFragmentow') });
        return this.exportRaster(options);
    }
    async exportIncompleteAnyway() {
        if (!this.lastIncompleteOptions) return null;
        const options = { ...this.lastIncompleteOptions, allowGaps: true };
        this.update({ incomplete: null, error: null, message: t('export.eksportMimoBrakowBrakujaceFragmenty') });
        return this.exportRaster(options);
    }
    cancelIncomplete() { this.lastIncompleteOptions = null; this.update({ incomplete: null, message: t('export.anulowanoNiekompletnyEksport'), error: null }); }
    clearMessage() { this.update({ message: null, error: null }); }
    dispose() { if (this.snapshot.previewUrl) URL.revokeObjectURL(this.snapshot.previewUrl); this.cancelExport(); this.cancelSelection?.(); this.cancelSelection = null; this.disposed = true; this.listeners.clear(); }
    update(patch) { if (this.disposed) return; this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
}
