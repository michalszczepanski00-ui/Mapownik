import { t } from '../i18n/index.js';
import { ActionRegistry } from '../actions/registry.js';

/**
 * 18.0 — rejestr funkcji: instaluje deklaracje z defineFeature w runtime mapy
 * i udostępnia sloty powłoce.
 *
 * Instalacja (MapRuntime.constructor):
 *   serwisy funkcji -> runtime.services (publikowane w ServiceHub bez listy w MapStage),
 *   tryby interakcji -> InteractionRegistry,
 *   narzędzia -> ToolRegistry (+ skrót jako polecenie w CommandRegistry),
 *   polecenia -> CommandRegistry.
 * Sloty tylko do odczytu (statusItems, contextMenu, objectFields, opcje
 * i instrukcje narzędzi) czytają komponenty powłoki przez list()/getTool().
 */
export class FeatureRegistry {
    constructor(features = []) {
        this.features = [];
        this.toolDefs = new Map();
        this.slots = { statusItems: [], contextMenu: [], objectFields: [], exportFormats: [], analysisSources: [], analysisOperations: [], settings: [], actions: [] };
        this.actions = new ActionRegistry([]);
        this.disposers = [];
        this.createdServices = [];
        this.installed = false;
        for (const feature of features) this.add(feature);
    }

    add(feature) {
        if (this.installed) throw new Error('Funkcje dodaje się przed instalacją runtime.');
        if (this.features.some((item) => item.id === feature.id)) throw new Error(`Funkcja ${feature.id} jest już dodana.`);
        this.features.push(feature);
    }

    /**
     * @param {object} host
     * @param {Record<string, object>} host.services     wspólna mapa serwisów (rdzeń + funkcje)
     * @param {import('../tools/ToolRegistry.js').ToolRegistry} host.toolRegistry
     * @param {import('../keyboard/CommandRegistry.js').CommandRegistry} host.commandRegistry
     * @param {import('./InteractionRegistry.js').InteractionRegistry} host.interactions
     * @param {object} host.context  ctx przekazywany do funkcji z deklaracji
     */
    install(host) {
        if (this.installed) throw new Error('FeatureRegistry jest już zainstalowany.');
        this.installed = true;
        const { services, toolRegistry, commandRegistry, interactions, context } = host;

        // 1. Serwisy — w kolejności funkcji, żeby późniejsze mogły korzystać z wcześniejszych.
        for (const feature of this.features) {
            for (const [name, factory] of Object.entries(feature.services ?? {})) {
                if (services[name]) throw new Error(`Serwis ${name} (funkcja ${feature.id}) już istnieje.`);
                services[name] = factory(context);
                this.createdServices.push(services[name]);
            }
        }

        for (const feature of this.features) {
            // 2. Tryby interakcji
            for (const owner of feature.interaction ?? []) {
                const service = services[owner.service];
                if (!service) throw new Error(`Tryb ${owner.id}: brak serwisu ${owner.service}.`);
                this.disposers.push(interactions.register({ ...owner, service }));
            }
            // 3. Narzędzia
            for (const tool of feature.tools ?? []) {
                if (this.toolDefs.has(tool.id)) throw new Error(`Narzędzie ${tool.id} jest już zadeklarowane.`);
                const def = Object.freeze({ ...tool, feature: feature.id });
                this.toolDefs.set(tool.id, def);
                const manifest = {
                    id: tool.id,
                    title: tool.title,
                    // 18.0: krótka nazwa do palety z podpisami (domyślnie pełna).
                    label: tool.label ?? tool.title,
                    description: tool.description ?? '',
                    icon: tool.icon,
                    placement: tool.placement ?? 'floating',
                    group: tool.group,
                    order: tool.order,
                    activationScope: tool.activationScope ?? 'map-mode',
                    shortcut: tool.shortcut ?? null,
                };
                this.disposers.push(toolRegistry.register({
                    manifest,
                    isActive: () => tool.isActive(context),
                    isEnabled: () => (tool.isEnabled ? tool.isEnabled(context) : true),
                    load: () => tool.load(context),
                }));
                if (tool.shortcut) {
                    this.disposers.push(commandRegistry.register({
                        id: `tool.${tool.id}`,
                        title: t('command.activateTool', { title: tool.title }),
                        group: t('command.group.tools'),
                        shortcut: tool.shortcut,
                        order: 100 + tool.order,
                        keywords: [tool.description ?? ''],
                        source: feature.id,
                        run: () => toolRegistry.activate(tool.id),
                        when: () => (tool.isEnabled ? tool.isEnabled(context) : true),
                    }));
                }
                const service = tool.service ? services[tool.service] : null;
                if (tool.service && !service) throw new Error(`Narzędzie ${tool.id}: brak serwisu ${tool.service}.`);
                if (service?.subscribe) toolRegistry.addDisposer(service.subscribe(toolRegistry.refresh));
            }
            // 4. Polecenia
            for (const command of feature.commands ?? []) {
                this.disposers.push(commandRegistry.register({
                    ...command,
                    source: feature.id,
                    run: (runContext) => command.run(runContext ?? context),
                    when: command.when ? (runContext) => command.when(runContext ?? context) : undefined,
                }));
            }
            // 5. Sloty do odczytu
            for (const slot of Object.keys(this.slots)) {
                for (const item of feature[slot] ?? []) this.slots[slot].push(Object.freeze({ ...item, feature: feature.id }));
            }
        }
        for (const slot of Object.keys(this.slots))
            this.slots[slot].sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000));
        // 6. 19.53.0: rejestr akcji ze strefami (limity sprawdzane tutaj) + te same akcje w palecie poleceń.
        this.actions = new ActionRegistry(this.slots.actions);
        for (const command of this.actions.paletteCommands(context, t('command.group.actions')))
            this.disposers.push(commandRegistry.register(command));
        toolRegistry.refresh();
    }

    getTool(id) {
        return this.toolDefs.get(id) ?? null;
    }

    listTools() {
        return [...this.toolDefs.values()].sort((a, b) => a.order - b.order);
    }

    /** Wkład funkcji do slotu tylko do odczytu, posortowany po `order`. */
    list(slot) {
        if (!this.slots[slot]) throw new Error(`Nieznany slot: ${slot}`);
        return this.slots[slot];
    }

    /** Opis zainstalowanych funkcji (diagnostyka, ekran „O programie”). */
    describe() {
        return this.features.map((feature) => ({
            id: feature.id,
            title: feature.title ?? feature.id,
            services: Object.keys(feature.services ?? {}),
            tools: (feature.tools ?? []).map((tool) => tool.id),
            commands: (feature.commands ?? []).map((command) => command.id),
            statusItems: (feature.statusItems ?? []).length,
            contextMenu: (feature.contextMenu ?? []).length,
            objectFields: (feature.objectFields ?? []).length,
            panels: (feature.panels ?? []).map((panel) => panel.id),
            exportFormats: (feature.exportFormats ?? []).map((format) => format.id),
            analysisSources: (feature.analysisSources ?? []).length,
            analysisOperations: (feature.analysisOperations ?? []).map((operation) => operation.id),
            settings: (feature.settings ?? []).map((setting) => setting.id),
            actions: (feature.actions ?? []).map((action) => action.id),
        }));
    }

    dispose() {
        for (const dispose of this.disposers.splice(0).reverse()) {
            try { dispose(); } catch { /* rejestry mogły zostać już zamknięte */ }
        }
        for (const service of this.createdServices.splice(0).reverse()) {
            try { service?.dispose?.(); } catch (error) { console.error('[funkcja] dispose serwisu', error); }
        }
        this.toolDefs.clear();
        for (const slot of Object.keys(this.slots)) this.slots[slot] = [];
    }
}
