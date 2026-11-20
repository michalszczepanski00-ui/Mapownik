import Feature from 'ol/Feature.js';
import VectorSource from 'ol/source/Vector.js';
import VectorLayer from 'ol/layer/Vector.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import { toViewGeometry } from '../objects/geometryConversion.js';
import Collection from 'ol/Collection.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Select from 'ol/interaction/Select.js';
import Snap from 'ol/interaction/Snap.js';
import Polygon from 'ol/geom/Polygon.js';
import { unByKey } from 'ol/Observable.js';
import { fromViewGeometry } from '../objects/index.js';
import { appDialogs, appToasts } from '../core/index.js';
import { DEFAULT_ROAD_WIDTH_M, DEFAULT_ROAD_RADIUS_M, normalizeRoadWidth, normalizeRoadRadius } from '../road/index.js';
import { t } from '../i18n/index.js';
import { geometryCenter } from '../objects/linkedCallouts.js';
import { assertRoadBudget } from '../road/roadLimits.js';

const MODE_LABELS = {
    'draw-point': t('editing.punkt'),
    'draw-line': t('editing.linia'),
    'draw-polygon': t('editing.poligon'),
    'draw-rectangle': t('editing.prostokat'),
    'draw-circle': t('editing.okrag'),
    'draw-text': t('editing.tekst'),
    'draw-callout': t('editing.etykieta'),
    'draw-arrow': t('editing.strzalka'),
    'draw-road': t('editing.droga'),
};

const DRAW_MODES = [
    'draw-point', 'draw-line', 'draw-polygon', 'draw-rectangle',
    'draw-circle', 'draw-text', 'draw-callout', 'draw-arrow', 'draw-road',
];

function deleteVertexCondition(event) {
    const original = event?.originalEvent;
    return event?.type === 'singleclick' && Boolean(original?.altKey) && !Boolean(original?.ctrlKey || original?.metaKey);
}

function circlePolygon(center, radiusMeters, segments = 72) {
    const ring = [];
    for (let index = 0; index <= segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        ring.push([
            center[0] + Math.cos(angle) * radiusMeters,
            center[1] + Math.sin(angle) * radiusMeters,
        ]);
    }
    return { type: 'Polygon', coordinates: [ring] };
}

function rectangleGeometryFunction(coordinates, geometry) {
    const start = coordinates[0];
    const end = coordinates[1];
    const minX = Math.min(start[0], end[0]);
    const minY = Math.min(start[1], end[1]);
    const maxX = Math.max(start[0], end[0]);
    const maxY = Math.max(start[1], end[1]);
    const polygonCoordinates = [[
        [minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY],
    ]];
    if (!geometry)
        return new Polygon(polygonCoordinates);
    geometry.setCoordinates(polygonCoordinates);
    return geometry;
}

export class EditingManager {
    constructor(host, objectManager, objectCommands) {
        this.listeners = new Set();
        this.eventKeys = [];
        this.selectFeatures = new Collection();
        this.snapFeatures = new Collection();
        this.disposed = false;
        this.syncingSelection = false;
        this.counters = { point: 0, line: 0, polygon: 0, rectangle: 0, circle: 0, text: 0, callout: 0, arrow: 0, road: 0 };
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.assertAlive();
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
        this.host = host;
        this.objectManager = objectManager;
        this.objectCommands = objectCommands;
        this.selectInteraction = new Select({
            features: this.selectFeatures,
            layers: [this.objectManager.getInteractionLayer()],
            hitTolerance: 6,
            style: null,
            filter: (feature) => this.objectManager.isInteractionFeatureVisible(feature),
        });
        this.modifyInteraction = new Modify({
            features: this.selectFeatures,
            pixelTolerance: 12,
            hitDetection: this.objectManager.getInteractionLayer(),
            deleteCondition: deleteVertexCondition,
        });

        this.drawPointInteraction = this.createDrawInteraction('Point', 'draw-point');
        this.drawLineInteraction = this.createDrawInteraction('LineString', 'draw-line');
        this.drawPolygonInteraction = this.createDrawInteraction('Polygon', 'draw-polygon');
        this.drawRectangleInteraction = this.createDrawInteraction('Circle', 'draw-rectangle', { geometryFunction: rectangleGeometryFunction });
        this.drawCircleInteraction = this.createDrawInteraction('Point', 'draw-circle');
        this.drawTextInteraction = this.createDrawInteraction('Point', 'draw-text');
        this.drawCalloutInteraction = this.createDrawInteraction('LineString', 'draw-callout', { maxPoints: 2 });
        this.drawArrowInteraction = this.createDrawInteraction('LineString', 'draw-arrow', { maxPoints: 2 });
        this.drawRoadInteraction = this.createDrawInteraction('LineString', 'draw-road');

        this.snapInteraction = new Snap({
            features: this.snapFeatures,
            edge: true,
            vertex: true,
            intersection: true,
            pixelTolerance: 12,
        });
        this.drawInteractions = {
            'draw-point': this.drawPointInteraction,
            'draw-line': this.drawLineInteraction,
            'draw-polygon': this.drawPolygonInteraction,
            'draw-rectangle': this.drawRectangleInteraction,
            'draw-circle': this.drawCircleInteraction,
            'draw-text': this.drawTextInteraction,
            'draw-callout': this.drawCalloutInteraction,
            'draw-arrow': this.drawArrowInteraction,
            'draw-road': this.drawRoadInteraction,
        };
        this.interactions = [
            this.selectInteraction,
            this.modifyInteraction,
            ...DRAW_MODES.map((mode) => this.drawInteractions[mode]),
            this.snapInteraction,
        ];
        for (const interaction of this.interactions)
            this.host.addInteraction(interaction);
        for (const interaction of Object.values(this.drawInteractions))
            interaction.setActive(false);
        this.selectInteraction.setActive(true);
        this.modifyInteraction.setActive(false);
        this.snapInteraction.setActive(true);
        this.snapshot = {
            arrowPolyline: false,
            linkCallout: false,
            mode: 'pan',
            drawing: false,
            modifying: false,
            suspended: false,
            selectedId: this.objectManager.getSnapshot().selectedId,
            snapTargetCount: 0,
            snapEnabled: true,
            snapIntersection: true,
            circleRadiusMeters: 25,
            roadWidthMeters: DEFAULT_ROAD_WIDTH_M,
            roadCurveRadiusMeters: DEFAULT_ROAD_RADIUS_M,
            error: null,
        };
        this.bindEvents();
        this.syncFromObjects();
        this.unsubscribeObjects = this.objectManager.subscribe(() => this.syncFromObjects());
    }

    startCirclePreview() {
        if (!this.host.onPointerMove) return;
        if (!this.circlePreviewSource) {
            this.circlePreviewSource = new VectorSource({ wrapX: false });
            this.circlePreviewLayer = new VectorLayer({ source: this.circlePreviewSource, zIndex: 10015, properties: { mapownikRole: 'circle-preview' }, style: [new Style({ stroke: new Stroke({ color: '#fff', width: 5 }) }), new Style({ stroke: new Stroke({ color: '#db2777', width: 2, lineDash: [6,4] }), fill: new Fill({ color: 'rgba(219,39,119,0.08)' }) })] });
        }
        this.host.addLayer(this.circlePreviewLayer);
        this.circlePreviewUnsubscribe = this.host.onPointerMove((point) => {
            this.circlePreviewCenter = point?.coordinate2180 ?? null;
            if (this.circlePreviewFrame != null) return;
            this.circlePreviewFrame = requestAnimationFrame(() => { this.circlePreviewFrame = null; this.refreshCirclePreview(); });
        });
    }
    refreshCirclePreview() {
        if (!this.circlePreviewSource) return;
        this.circlePreviewSource.clear();
        if (this.circlePreviewCenter && this.snapshot.mode === 'draw-circle' && !this.snapshot.suspended) this.circlePreviewSource.addFeature(new Feature({ geometry: toViewGeometry(circlePolygon(this.circlePreviewCenter, this.snapshot.circleRadiusMeters)) }));
    }
    stopCirclePreview() {
        this.circlePreviewUnsubscribe?.(); this.circlePreviewUnsubscribe = null;
        if (this.circlePreviewFrame != null) cancelAnimationFrame(this.circlePreviewFrame);
        this.circlePreviewFrame = null; this.circlePreviewCenter = null;
        this.circlePreviewSource?.clear();
        if (this.circlePreviewLayer) this.host.removeLayer(this.circlePreviewLayer);
    }
    setArrowPolyline(value) {
        this.abortActiveSketch();
        const previous = this.drawArrowInteraction; this.host.removeInteraction(previous);
        this.eventKeys = this.eventKeys.filter((key) => { if (key.target === previous) { unByKey(key); return false; } return true; });
        previous.dispose();
        const interaction = this.createDrawInteraction('LineString', 'draw-arrow', value ? {} : { maxPoints: 2 });
        this.drawArrowInteraction = interaction; this.drawInteractions['draw-arrow'] = interaction;
        this.interactions = this.interactions.map((entry) => entry === previous ? interaction : entry);
        this.host.addInteraction(interaction); interaction.setActive(this.snapshot.mode === 'draw-arrow' && !this.snapshot.suspended);
        this.updateSnapshot({ arrowPolyline: Boolean(value), drawing: false });
    }
    setCircleRadius(value) {
        const radius = Number(value);
        if (!Number.isFinite(radius) || radius < 0.5 || radius > 50000) {
            this.updateSnapshot({ error: t('editing.promienOkreguMusiMiescicSie') });
            return false;
        }
        this.updateSnapshot({ circleRadiusMeters: radius, error: null });
        this.refreshCirclePreview();
        return true;
    }

    setRoadWidth(value) {
        const width = normalizeRoadWidth(value);
        if (width === null) {
            this.updateSnapshot({ error: t('editing.szerokoscDrogiMusiBycLiczba') });
            return false;
        }
        this.updateSnapshot({ roadWidthMeters: width, error: null });
        return true;
    }

    setRoadCurveRadius(value) {
        const radius = normalizeRoadRadius(value);
        if (radius === null) {
            this.updateSnapshot({ error: t('editing.promienLukuDrogiMusiByc') });
            return false;
        }
        this.updateSnapshot({ roadCurveRadiusMeters: radius, error: null });
        return true;
    }

    setSnapEnabled(value) {
        this.assertAlive();
        const enabled = Boolean(value);
        this.snapInteraction.setActive(enabled && !this.snapshot.suspended && this.snapshot.mode !== 'pan');
        this.updateSnapshot({ snapEnabled: enabled, error: null });
    }

    toggleSnap() {
        this.setSnapEnabled(!this.snapshot.snapEnabled);
    }

    rotateSelected(angleDeg) {
        this.assertAlive();
        const id = this.objectManager.getSnapshot().selectedId;
        if (!id) {
            this.updateSnapshot({ error: t('editing.najpierwZaznaczObiektDoObrotu') });
            return false;
        }
        const object = this.objectManager.getObject(id);
        if (object.geometry.type === 'Point' || object.kind === 'circle') {
            this.updateSnapshot({ error: object.kind === 'circle' ? t('editing.obrotOkreguNieZmieniaJego') : t('editing.punktNieMaGeometriiDo') });
            return false;
        }
        const angle = Number(angleDeg);
        if (!Number.isFinite(angle) || Math.abs(angle) < 0.001 || Math.abs(angle) > 3600) {
            this.updateSnapshot({ error: t('editing.podajKatObrotuOd0') });
            return false;
        }
        const rotated = this.objectCommands.rotate(id, angle);
        this.updateSnapshot({ error: rotated ? null : t('editing.nieUdaloSieObrocicObiektu') });
        return rotated;
    }

    setMode(mode) {
        this.assertAlive();
        if (this.snapshot.mode === mode && !this.snapshot.suspended)
            return;
        this.abortActiveSketch();
        this.stopCirclePreview();
        this.selectInteraction.setActive(mode === 'select' || mode === 'pan');
        const selected = this.objectManager.getSnapshot().items.find((item) => item.selected);
        this.modifyInteraction.setActive(mode === 'select' && selected?.kind !== 'circle');
        this.objectManager.setGeometryEditing(mode === 'select');
        for (const [drawMode, interaction] of Object.entries(this.drawInteractions))
            interaction.setActive(mode === drawMode);
        this.snapInteraction.setActive(this.snapshot.snapEnabled && mode !== 'pan');
        this.updateSnapshot({ mode, drawing: false, modifying: false, suspended: false, error: null });
        if (mode === 'draw-circle') this.startCirclePreview();
    }

    cancelDrawing() {
        this.assertAlive();
        this.abortActiveSketch();
        this.setMode('pan');
    }

    suspend() {
        this.assertAlive();
        if (this.snapshot.suspended)
            return;
        this.abortActiveSketch();
        this.stopCirclePreview();
        this.selectInteraction.setActive(false);
        this.modifyInteraction.setActive(false);
        this.objectManager.setGeometryEditing(false);
        for (const interaction of Object.values(this.drawInteractions))
            interaction.setActive(false);
        this.snapInteraction.setActive(false);
        this.updateSnapshot({ drawing: false, modifying: false, suspended: true, error: null });
    }

    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.unsubscribeObjects();
        this.stopCirclePreview();
        if (this.eventKeys.length)
            unByKey(this.eventKeys.splice(0));
        this.abortActiveSketch();
        for (const interaction of [...this.interactions].reverse())
            this.host.removeInteraction(interaction);
        this.selectFeatures.clear();
        this.snapFeatures.clear();
        this.listeners.clear();
    }

    /**
     * Pyta o treść napisu albo etykiety.
     *
     * Zwraca `null`, gdy użytkownik anuluje — i to jest zmiana wobec
     * `window.prompt`, które po anulowaniu i tak tworzyło obiekt z napisem
     * „Tekst". Przy przycisku podpisanym „Anuluj" tamto zachowanie byłoby
     * po prostu błędem. Zatwierdzenie pustego pola nadal daje wartość
     * domyślną — pusty napis na mapie jest niewidoczny i nie do kliknięcia.
     */
    async askForText(mode, viewGeometry = null) {
        const callout = mode === 'draw-callout';
        const fallback = callout ? t('editing.etykieta') : t('editing.tekst');
        // 18.11.2: pole tekstowe przy wskazanym miejscu zamiast okna na środku
        // ekranu, które rozmywało mapę i zasłaniało, gdzie napis trafi.
        const inline = this.askForTextInline(viewGeometry, fallback, callout);
        if (inline) return inline;
        const answer = await appDialogs.prompt({
            title: callout ? t('editing.etykietaZOdnosnikiem') : t('editing.tekstNaMapie'),
            label: t('editing.tresc'),
            defaultValue: fallback,
            placeholder: fallback,
            maxLength: 120,
            confirmLabel: t('editing.dodaj'),
            hint: t('editing.trescIWygladMoznaPozniej'),
        });
        if (answer === null)
            return null;
        return answer.trim() || fallback;
    }

    /**
     * Pole tekstowe nad mapą w miejscu napisu. Enter albo „✓” dodaje,
     * Esc anuluje, kliknięcie poza polem dodaje wpisaną treść.
     * Zwraca Promise albo null, gdy mapa nie jest dostępna (wtedy okno).
     */
    askForTextInline(viewGeometry, fallback, callout) {
        const map = this.host?.map;
        const target = map?.getTargetElement?.();
        if (!map || !target || typeof document === 'undefined' || !viewGeometry) return null;
        const coords = viewGeometry.getType?.() === 'Point' ? viewGeometry.getCoordinates() : viewGeometry.getLastCoordinate?.();
        const pixel = coords ? map.getPixelFromCoordinate(coords) : null;
        if (!pixel || !pixel.every(Number.isFinite)) return null;
        return new Promise((resolve) => {
            this.inlineTextCancel?.();
            const box = document.createElement('form');
            box.className = 'map-inline-text';
            box.style.left = `${Math.round(pixel[0])}px`;
            box.style.top = `${Math.round(pixel[1])}px`;
            box.setAttribute('aria-label', callout ? t('editing.etykietaZOdnosnikiem') : t('editing.tekstNaMapie'));
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 120;
            input.value = fallback;
            input.placeholder = fallback;
            input.className = 'map-inline-text-input';
            input.setAttribute('aria-label', t('editing.tresc'));
            const ok = document.createElement('button');
            ok.type = 'submit';
            ok.className = 'map-inline-text-ok';
            ok.textContent = '✓ Zapisz';
            const cancel = document.createElement('button');
            cancel.type = 'button'; cancel.textContent = 'Anuluj'; cancel.className = 'map-inline-text-cancel';
            ok.title = `${t('editing.dodaj')} (Enter)`;
            ok.setAttribute('aria-label', t('editing.dodaj'));
            const hint = document.createElement('small');
            hint.className = 'map-inline-text-hint';
            hint.textContent = t('editing.inlineTextHint');
            box.append(input, ok, cancel, hint);
            let done = false;
            const finish = (value) => {
                if (done) return;
                done = true;
                box.remove();
                this.inlineTextCancel = null;
                resolve(value === null ? null : (value.trim() || fallback));
            };
            this.inlineTextCancel = () => finish(null);
            cancel.addEventListener('click', () => finish(null));
            box.addEventListener('submit', (event) => { event.preventDefault(); finish(input.value); });
            input.addEventListener('keydown', (event) => {
                event.stopPropagation();
                if (event.key === 'Escape') { event.preventDefault(); finish(null); }
            });
            box.addEventListener('pointerdown', (event) => event.stopPropagation());
            box.addEventListener('dblclick', (event) => event.stopPropagation());
            target.append(box);
            input.focus();
            input.select();
        });
    }

    createDrawInteraction(type, mode, extraOptions = {}) {
        const interaction = new Draw({
            type,
            stopClick: true,
            clickTolerance: 6,
            snapTolerance: 12,
            ...extraOptions,
        });
        this.eventKeys.push(interaction.on('drawstart', (event) => {
            this.currentSketchFeature = event.feature;
            if (mode === 'draw-callout') {
                this.calloutTargetId = null;
                if (this.snapshot.linkCallout) {
                    const coordinate = event.feature.getGeometry()?.getFirstCoordinate?.();
                    const pixel = coordinate && this.host.map?.getPixelFromCoordinate(coordinate);
                    if (pixel) this.calloutTargetId = this.host.map.forEachFeatureAtPixel(pixel, (feature) => {
                        const id = this.objectManager.getInteractionObjectId(feature);
                        if (!id) return undefined;
                        const candidate = this.objectManager.getObject(id);
                        return ['callout', 'text'].includes(candidate.kind) ? undefined : id;
                    }, { hitTolerance: 12, layerFilter: (layer) => layer === this.objectManager.getInteractionLayer() }) ?? null;
                }
            }
            this.updateSnapshot({ drawing: true, error: null });
        }));
        this.eventKeys.push(interaction.on('drawabort', () => {
            this.updateSnapshot({ drawing: false });
        }));
        // Handler jest asynchroniczny wyłącznie dla trybów pytających o treść
        // (tekst, etykieta). Geometria jest odczytywana z feature'a SYNCHRONICZNIE,
        // zanim cokolwiek zostanie oczekane — po zakończeniu rysowania
        // OpenLayers może ten obiekt zmodyfikować.
        this.eventKeys.push(interaction.on('drawend', async (event) => {
            try {
                const geometry = event.feature.getGeometry();
                if (!geometry)
                    throw new Error(t('editing.brakGeometriiSzkicu'));
                let projectGeometry = fromViewGeometry(geometry);
                let kind = 'geometry';
                let properties = undefined;
                let name = this.nextObjectName(mode);

                if (mode === 'draw-circle') {
                    const center = projectGeometry.coordinates;
                    const radius = this.snapshot.circleRadiusMeters;
                    projectGeometry = circlePolygon(center, radius);
                    kind = 'circle';
                    properties = { radiusMeters: radius, center2180: [...center] };
                }
                else if (mode === 'draw-rectangle') {
                    kind = 'rectangle';
                }
                else if (mode === 'draw-text') {
                    kind = 'text';
                    // Szkic jest skończony, więc pasek narzędzi ma to pokazać
                    // JUŻ TERAZ — inaczej przy otwartym oknie aplikacja
                    // wyglądałaby, jakby wciąż czekała na kolejne kliknięcie.
                    this.updateSnapshot({ drawing: false });
                    const text = await this.askForText('draw-text', geometry);
                    if (this.disposed || text === null)
                        return;
                    name = text.slice(0, 60);
                    properties = { text, fontSize: 14, fontWeight: '600', rotationDeg: 0, backgroundOpacity: 0 };
                }
                else if (mode === 'draw-callout') {
                    kind = 'callout';
                    const target = this.snapshot.linkCallout && this.calloutTargetId ? this.objectManager.getObject(this.calloutTargetId) : null;
                    if (this.snapshot.linkCallout && !target) throw new Error('Nie wskazano obiektu do powiązania. Wskaż kotwicę na obiekcie projektu albo wybierz etykietę niezależną.');
                    this.updateSnapshot({ drawing: false });
                    const text = await this.askForText('draw-callout', geometry);
                    if (this.disposed || text === null)
                        return;
                    name = text.slice(0, 60);
                    properties = { text, fontSize: 13, fontWeight: '600', rotationDeg: 0, backgroundOpacity: 0.82, ...(target ? { targetObjectId: target.id, targetCenter2180: geometryCenter(target.geometry) } : {}) };
                }
                else if (mode === 'draw-arrow') {
                    kind = 'arrow';
                    properties = { arrowEnd: true };
                }
                else if (mode === 'draw-road') {
                    assertRoadBudget(projectGeometry.coordinates);
                    kind = 'road';
                    properties = {
                        roadWidthMeters: this.snapshot.roadWidthMeters,
                        curveRadiusMeters: this.snapshot.roadCurveRadiusMeters,
                        vehicleProfile: 'typical-eu-semitrailer',
                        sweptPathApproximate: true,
                    };
                }

                const input = {
                    name,
                    geometry: projectGeometry,
                    kind,
                    properties,
                    origin: 'user',
                    visible: true,
                };
                const id = this.objectCommands.create(input);
                this.objectManager.select(id);
                this.updateSnapshot({ drawing: false, error: null, selectedId: id });
                if (!this.shouldRepeat?.()) queueMicrotask(() => { if (!this.disposed && this.snapshot.mode === mode && !this.snapshot.suspended) this.onDrawingCompleted?.(); });
            }
            catch (error) {
                appToasts.show({ message: error instanceof Error ? error.message : t('editing.nieUdaloSieZapisacRysowanej'), tone: 'danger', timeoutMs: 8000 });
                this.updateSnapshot({
                    drawing: false,
                    error: error instanceof Error ? error.message : t('editing.nieUdaloSieZapisacRysowanej'),
                });
            }
        }));
        return interaction;
    }

    bindEvents() {
        this.eventKeys.push(this.selectInteraction.on('select', (event) => {
            if (this.syncingSelection)
                return;
            const feature = event.selected[0];
            const id = feature ? this.objectManager.getInteractionObjectId(feature) : null;
            this.objectManager.select(id);
        }));
        this.eventKeys.push(this.modifyInteraction.on('modifystart', () => {
            this.updateSnapshot({ modifying: true, error: null });
        }));
        this.eventKeys.push(this.modifyInteraction.on('modifyend', (event) => {
            let errorMessage = null;
            for (const feature of event.features.getArray()) {
                try {
                    const id = this.objectManager.getInteractionObjectId(feature);
                    if (!id)
                        throw new Error('Edytowany obiekt nie należy do ObjectManagera.'); // dev: błąd programisty, nie komunikat dla użytkownika
                    const geometry = feature.getGeometry();
                    if (!geometry)
                        throw new Error(t('editing.edytowanyObiektNieMaGeometrii'));
                    this.objectCommands.setGeometry(id, fromViewGeometry(geometry));
                }
                catch (error) {
                    const id = this.objectManager.getInteractionObjectId(feature);
                    if (id)
                        this.objectManager.restoreInteractionFeatureGeometry(id);
                    errorMessage = error instanceof Error ? error.message : t('editing.nieUdaloSieZapisacZmienionej');
                }
            }
            this.updateSnapshot({ modifying: false, error: errorMessage });
        }));
    }

    syncFromObjects() {
        if (this.disposed)
            return;
        const objectSnapshot = this.objectManager.getSnapshot();
        const visibleFeatures = this.objectManager.getVisibleInteractionFeatures();
        const visibleSet = new Set(visibleFeatures);
        for (const feature of [...this.snapFeatures.getArray()]) {
            if (!visibleSet.has(feature))
                this.snapFeatures.remove(feature);
        }
        const currentSnapSet = new Set(this.snapFeatures.getArray());
        for (const feature of visibleFeatures) {
            if (!currentSnapSet.has(feature))
                this.snapFeatures.push(feature);
        }
        const selectedId = objectSnapshot.selectedId;
        const selectedFeature = selectedId ? this.objectManager.getInteractionFeature(selectedId) : null;
        const selectedVisible = selectedFeature ? this.objectManager.isInteractionFeatureVisible(selectedFeature) : false;
        this.syncingSelection = true;
        try {
            const current = this.selectFeatures.item(0) ?? null;
            if (!selectedVisible) {
                if (this.selectFeatures.getLength())
                    this.selectFeatures.clear();
            }
            else if (current !== selectedFeature || this.selectFeatures.getLength() !== 1) {
                this.selectFeatures.clear();
                this.selectFeatures.push(selectedFeature);
            }
        }
        finally {
            this.syncingSelection = false;
        }
        if (this.snapshot.mode === 'select' && !this.snapshot.suspended) {
            const selectedItem = objectSnapshot.items.find((item) => item.id === selectedId);
            this.modifyInteraction.setActive(selectedItem?.kind !== 'circle');
        }
        this.updateSnapshot({ selectedId, snapTargetCount: visibleFeatures.length });
    }

    abortActiveSketch() {
        this.inlineTextCancel?.(); // 18.11.2: zmiana narzędzia zamyka pole tekstu
        for (const interaction of Object.values(this.drawInteractions))
            interaction.abortDrawing();
    }

    /**
     * Porzuca rozpoczęty szkic, ZOSTAJĄC w bieżącym narzędziu.
     *
     * Wspólna nazwa dla wszystkich menedżerów, które coś rysują — powłoka
     * obsługuje Escape, nie znając ich z nazwy (app/App.js).
     */
    abortSketch() {
        if (!this.snapshot.drawing)
            return false;
        this.abortActiveSketch();
        this.updateSnapshot({ drawing: false });
        return true;
    }

    /** 18.0: kończy rozpoczęty szkic (przycisk „Zakończ” w pasku kontekstu, Enter). */
    finishSketch() {
        const interaction = this.drawInteractions[this.snapshot.mode];
        if (!this.snapshot.drawing || !interaction?.getActive?.())
            return false;
        const geometry = this.currentSketchFeature?.getGeometry();
        if (geometry?.getType() === 'LineString' && geometry.getCoordinates().length < 3) return false;
        if (geometry?.getType() === 'Polygon' && this.snapshot.mode === 'draw-polygon' && geometry.getCoordinates()[0].length < 5) return false;
        interaction.finishDrawing();
        return true;
    }

    /** 18.0: cofa ostatni wierzchołek szkicu (Backspace). */
    undoLastPoint() {
        const interaction = this.drawInteractions[this.snapshot.mode];
        if (!this.snapshot.drawing || !interaction?.getActive?.())
            return false;
        interaction.removeLastPoint();
        return true;
    }

    nextObjectName(mode) {
        const key = mode.replace('draw-', '');
        this.counters[key] = (this.counters[key] ?? 0) + 1;
        return `${MODE_LABELS[mode] ?? t('editing.obiekt')} ${this.counters[key]}`;
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
            throw new Error('EditingManager has already been disposed.');
    }
}
