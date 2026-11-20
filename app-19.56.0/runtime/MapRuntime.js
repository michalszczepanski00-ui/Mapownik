import { installBackupReminder } from '../persistence/backupReminder.js';
import { downloadText } from '../core/files/index.js';
import { BasemapManager } from '../basemaps/index.js';
import { dataCatalog } from '../data/catalog/index.js';
import { SourceRegistry } from '../data/sources/index.js';
import { LayerManager } from '../layers/index.js';
import { OpenLayersMapController } from '../map/OpenLayersMapController.js';
import { ObjectManager } from '../objects/index.js';
import { EditingManager } from '../editing/index.js';
import { MeasurementManager } from '../measurement/index.js';
import { ParcelManager } from '../parcels/index.js';
import { IdentifyManager } from '../identify/index.js';
import { SearchManager } from '../search/index.js';
import { TerrainProfileManager } from '../terrain/index.js';
import { CommandBus, ObjectCommandService } from '../commands/index.js';
import { LocalProjectSession, ProjectTransferManager, localProjectRepository } from '../persistence/index.js';
import { ToolRegistry } from '../tools/index.js';
import { BUILTIN_FEATURES, FeatureRegistry, InteractionRegistry } from '../features/index.js';
import { CommandRegistry, KeyboardService } from '../keyboard/index.js';
import { SketchMetrics } from '../editing/SketchMetrics.js';
import { appDialogs, appToasts, FeatureSettings } from '../core/index.js';
import { t } from '../i18n/index.js';
import { ensureProjectProjectionRegistered } from '../projections/index.js';
import { ExportManager } from '../export/index.js';
import { AnalysisManager, AnalysisProviderRegistry, createAnalysisProvider } from '../analysis/index.js';
/**
 * Composition root for the GIS runtime.
 *
 * React owns one MapRuntime instance. Runtime managers own OpenLayers/persistence
 * lifecycle and can evolve without turning MapStage into a service locator.
 */
export class MapRuntime {
    constructor(catalog = dataCatalog, features = BUILTIN_FEATURES) {
        this.mounted = false;
        this.started = false;
        this.disposed = false;
        ensureProjectProjectionRegistered();
        this.controller = new OpenLayersMapController();
        // 18.0: bieżący pomiar szkicu — podpięty przed menedżerami, żeby
        // obserwował także interakcje dodawane w ich konstruktorach.
        this.sketchMetrics = new SketchMetrics();
        this.sketchMetrics.watch(this.controller);
        this.sourceRegistry = new SourceRegistry();
        this.layerManager = new LayerManager(catalog, this.sourceRegistry, this.controller);
        this.basemapManager = new BasemapManager(catalog, this.layerManager);
        this.objectManager = new ObjectManager(this.controller);
        this.commandBus = new CommandBus(100, 700);
        this.objectCommands = new ObjectCommandService(this.commandBus, this.objectManager);
        this.editingManager = new EditingManager(this.controller, this.objectManager, this.objectCommands);
        this.measurementManager = new MeasurementManager(this.controller, this.objectManager, this.objectCommands);
        // 18.1: pusty rejestr — źródła danych deklarują funkcje (slot analysisSources).
        this.analysisManager = new AnalysisManager(this.controller, this.objectManager, this.objectCommands, new AnalysisProviderRegistry());
        this.parcelManager = new ParcelManager(this.controller, this.layerManager, this.objectManager, this.objectCommands);
        // 18.0: tryby przejmujące kliknięcia deklarują funkcje (InteractionRegistry);
        // identyfikacja pyta rejestr, zamiast znać inne menedżery z nazwy.
        this.interactions = new InteractionRegistry();
        this.identifyManager = new IdentifyManager(this.controller, this.layerManager, { interactions: this.interactions });
        this.searchManager = new SearchManager(this.controller);
        this.terrainProfileManager = new TerrainProfileManager(this.controller, this.objectManager, this.objectCommands);
        this.toolRegistry = new ToolRegistry();
        this.commandRegistry = new CommandRegistry();
        this.projectSession = new LocalProjectSession({
            repository: localProjectRepository,
            controller: this.controller,
            layerManager: this.layerManager,
            basemapManager: this.basemapManager,
            objectManager: this.objectManager,
            commandBus: this.commandBus,
        });
        this.projectTransfers = new ProjectTransferManager({
            session: this.projectSession,
            objectManager: this.objectManager,
            objectCommands: this.objectCommands,
        });
        // 19.43.0 (audyt S5): przypomnienie o kopii pliku projektu i trwałe przechowywanie danych przeglądarki.
        this.disposeBackupReminder = installBackupReminder({
            objectManager: this.objectManager,
            toasts: appToasts,
            saveBackup: async () => {
                const result = await this.projectTransfers.exportProject();
                downloadText(result.text, result.filename, 'application/json;charset=utf-8');
            },
        });
        this.exportManager = new ExportManager({
            analysisManager: this.analysisManager,
            controller: this.controller,
            layerManager: this.layerManager,
            basemapManager: this.basemapManager,
            objectManager: this.objectManager,
        });
        // 18.0: wspólna mapa serwisów (rdzeń + funkcje). MapStage publikuje ją
        // w ServiceHub w całości — nowa funkcja nie dopisuje się do żadnej listy.
        this.services = {
            mapController: this.controller,
            basemaps: this.basemapManager,
            layers: this.layerManager,
            objects: this.objectManager,
            objectCommands: this.objectCommands,
            commands: this.commandBus,
            editing: this.editingManager,
            measurement: this.measurementManager,
            analysis: this.analysisManager,
            parcels: this.parcelManager,
            identify: this.identifyManager,
            search: this.searchManager,
            terrainProfile: this.terrainProfileManager,
            tools: this.toolRegistry,
            commandRegistry: this.commandRegistry,
            sketch: this.sketchMetrics,
            projectSession: this.projectSession,
            transfers: this.projectTransfers,
            rasterExport: this.exportManager,
        };
        const services = this.services;
        // Koordynator dla leniwie ładowanych modułów narzędzi (tools/builtins/*Tool.js).
        this.coordinator = {
            editingManager: this.editingManager,
            measurementManager: this.measurementManager,
            parcelManager: this.parcelManager,
            identifyManager: this.identifyManager,
            terrainProfileManager: this.terrainProfileManager,
            interactions: this.interactions,
            get bufferManager() { return services.buffer ?? null; },
        };
        this.features = new FeatureRegistry(features);
        services.features = this.features;
        // 18.1: ustawienia zadeklarowane przez funkcje (menu Ustawienia).
        this.settings = new FeatureSettings(features.flatMap((feature) => feature.settings ?? []));
        services.settings = this.settings;
        this.editingManager.shouldRepeat = () => this.settings.get('editing.repeat');
        this.editingManager.onDrawingCompleted = () => { void this.toolRegistry.activate('core.pan'); };
        this.measurementManager.onDrawingCompleted = () => { void this.toolRegistry.activate('core.pan'); };
        this.context = {
            get: (name) => services[name] ?? null,
            t,
            tools: this.toolRegistry,
            commandRegistry: this.commandRegistry,
            interactions: this.interactions,
            coordinator: this.coordinator,
            features: this.features,
            toasts: appToasts,
            dialogs: appDialogs,
            settings: this.settings,
        };
        this.features.install({
            services,
            toolRegistry: this.toolRegistry,
            commandRegistry: this.commandRegistry,
            interactions: this.interactions,
            context: this.context,
        });
        // 18.11.0: kod narzędzi wczytywany w tle po starcie — pierwsze użycie bez czekania.
        if (typeof window !== 'undefined') {
            const idle = window.requestIdleCallback ?? ((fn) => window.setTimeout(fn, 800));
            this.preloadHandle = idle(() => { if (!this.toolRegistry.disposed) this.toolRegistry.preloadAll(); });
        }
        // 18.1: źródła danych analiz z deklaracji funkcji.
        for (const source of this.features.list('analysisSources')) {
            this.analysisManager.registerSource(createAnalysisProvider(source, this.context), { screening: source.screening === true });
            // 19.23.0: źródło bez danych na serwerze znika z panelu zamiast zwracać błąd przy analizie.
            if (typeof source.available === 'function') {
                Promise.resolve().then(() => source.available()).then((ok) => {
                    if (ok === false && !this.disposed) this.analysisManager.unregisterSource(source.id);
                }).catch(() => {});
            }
        }
        // 18.2: operacje przestrzenne z deklaracji funkcji.
        for (const operation of this.features.list('analysisOperations')) this.analysisManager.registerOperation(operation);
        // Jeden nasłuch klawiatury dla skrótów narzędzi i poleceń (18.0).
        this.keyboard = new KeyboardService(this.commandRegistry, {
            // Okno dialogowe albo nakładka (paleta poleceń, skróty) przejmuje klawiaturę.
            isDialogOpen: () => Boolean(appDialogs.getSnapshot().request)
                || (typeof document !== 'undefined' && Boolean(document.querySelector('.ui-modal'))),
            getContext: () => this.context,
        });
    }
    /** Zgodność wstecz: bufor jest serwisem funkcji `buffer` (18.0). */
    get bufferManager() {
        return this.services?.buffer ?? null;
    }
    mount(target) {
        this.assertAlive();
        if (this.mounted)
            throw new Error('MapRuntime jest już zamontowany.');
        this.controller.mount(target);
        // Okno, a nie element mapy: skrót ma działać także zanim użytkownik
        // pierwszy raz kliknie w mapę. KeyboardService pilnuje pól tekstowych,
        // otwartych okien dialogowych i spacji na przyciskach (18.0).
        this.keyboard.bind(window);
        this.mounted = true;
    }
    async restoreAndStart() {
        this.assertAlive();
        if (!this.mounted)
            throw new Error('MapRuntime musi być zamontowany przed restoreAndStart().');
        if (this.started)
            return;
        const restored = await this.projectSession.restore();
        if (this.disposed)
            return;
        this.layerManager.initialize();
        // A failed restore must never be followed by autosave: otherwise an
        // empty runtime could overwrite a project that could not be read.
        if (restored)
            this.projectSession.startAutosave();
        this.started = true;
    }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        // Persistence flushes while runtime managers/controller are still available.
        await this.projectSession.dispose();
        this.disposeBackupReminder?.();
        this.keyboard.dispose();
        this.features.dispose();
        this.settings.dispose();
        this.exportManager.dispose();
        this.projectTransfers.dispose();
        this.toolRegistry.dispose();
        this.commandRegistry.dispose();
        this.terrainProfileManager.dispose();
        this.searchManager.dispose();
        this.identifyManager.dispose();
        this.parcelManager.dispose();
        this.analysisManager.dispose();
        this.measurementManager.dispose();
        this.editingManager.dispose();
        this.commandBus.dispose();
        this.objectManager.dispose();
        this.sketchMetrics.dispose();
        this.basemapManager.dispose();
        this.layerManager.dispose();
        this.controller.destroy();
        this.mounted = false;
    }
    assertAlive() {
        if (this.disposed)
            throw new Error('MapRuntime został już zamknięty.');
    }
}
