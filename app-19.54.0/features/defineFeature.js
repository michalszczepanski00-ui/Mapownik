import { isActionZone } from '../actions/registry.js';

/**
 * 18.0 — KONTRAKT FUNKCJI.
 *
 * Funkcja msportalu (bufor, pomiary, identyfikacja…) to jeden moduł, który
 * DEKLARUJE, co wnosi do interfejsu. Wspólne miejsca (paleta narzędzi, pasek
 * kontekstu, pasek stanu, menu mapy, paleta poleceń, skróty) zbierają te
 * deklaracje same — nikt nie edytuje App.js, MapStage.js ani paska
 * właściwości przy dodawaniu funkcji.
 *
 * Nowa funkcja = nowy plik w features/builtin/ i jedna linia w features/index.js.
 * Przewodnik z przykładem: JAK_DODAC_FUNKCJE.md w katalogu głównym paczki.
 * Jeśli do dodania funkcji trzeba zmienić plik powłoki, brakuje slotu —
 * najpierw dodaje się slot tutaj i w FeatureRegistry.
 *
 * Sloty (wszystkie opcjonalne):
 *   services      { nazwa: (ctx) => instancja }   serwisy tworzone przy starcie mapy
 *   interaction   [{ id, service, deactivate, isCapturing, isSketching, abortSketch, finishSketch, undoLastPoint }]
 *   tools         [{ id, title, label, description, hint, icon, group, order, shortcut, service, isActive, isEnabled, load, options }]
 *                 label — krótka nazwa do palety z podpisami (≤ 16 znaków),
 *                 order — pasmo setek na grupę: navigation 0xx, information 1xx,
 *                 drawing 2xx, measurement 3xx, terrain 4xx, routes 5xx, annotations 6xx
 *   commands      [{ id, title, group, shortcut, run, when, hidden, keywords }]
 *   statusItems   [{ id, order, service, select(snapshot, ctx) => { text, title, icon, tone } | null }]
 *   contextMenu   [{ id, order, label, run(ctx, place), when(ctx, place) }]
 *   objectFields  [{ id, order, appliesTo(object), fields(object, ctx) => FieldDescriptor[] }]
 *
 * 18.1 — sloty paneli, eksportu, analiz i ustawień:
 *   panels          [{ id, title, subtitle, icon, dock: 'right'|'bottom', order, load: () => import(…),
 *                      collapsible?, floatGroup?, defaultWidth?, minWidth?, maxWidth?, resizeDirection?,
 *                      rail?: false, controlledBy?, reopenOn?, openOnSignal? }]
 *                   moduł doku; komponent ładowany leniwie (load zwraca komponent albo moduł
 *                   z eksportem `default`/nazwanym), więc deklaracja nie zależy od Reacta.
 *   exportFormats   [{ id, title, subtitle?, icon?, order, options?: [{ id, type: 'select'|'text'|'checkbox',
 *                      label, default, options? }], actions: [{ id, label, icon?, variant?, kind?: 'run'|'file',
 *                      accept?, options?: [id opcji], run(ctx, values, file?) }] }]
 *                   sekcja panelu Eksport (format pliku, import/eksport, udostępnianie);
 *                   opcje wskazane w action.options stoją tuż nad przyciskiem akcji.
 *   analysisSources [{ id, title, description?, type?: 'bdot-buildings'|'wms-probe', create?(ctx),
 *                      screening?: boolean, available?(): Promise<boolean>, … }]
 *                   źródło danych panelu Analizy (dokładne albo screening WMS);
 *                   screening: true — także w zakładce „Screening działki”;
 *                   available() → false usuwa źródło z panelu (np. brak danych na serwerze).
 *   analysisOperations [{ id, title, description?, order, run(input) → { resultFeatures?, details?, selectFeatureId? },
 *                      params?: [{ id, type: 'number'|'select', label, default, min?, max?, step?, unit?, options?,
 *                        normalize?(v), precision?, positive?, invalid? }], requiresFullGeometry?, producesResultLayer?,
 *                      requestMargin?(params), texts?: { run, resultTitle, save, showLayer, hideLayer, focus, truncated },
 *                      progress?(percent), hint?, summary?(result) → [[etykieta, wartość]], warnings?(result) → [tekst],
 *                      saveProperties?(result), saveData?(result), save?(api) }]
 *                   operacja przestrzenna panelu Analizy (18.2). input: { features, extent, targetGeometry(),
 *                   params, signal, onProgress, metadata }. saveProperties — pola znane schematowi zapisu
 *                   (persistence/projectSchemas.js); saveData i każde inne pole trafiają do
 *                   properties.features['<id funkcji>'][<id operacji>], więc nie giną przy zapisie projektu.
 *   settings        [{ id, label, type: 'toggle', default, order?, description? }]
 *                   pozycja menu Ustawienia; wartość czyta się przez ctx.settings.get(id).
 *
 * 19.53.0 — slot akcji interfejsu ze strefami (actions/registry.js):
 *   actions         [{ id, zone, label, order, run(ctx), when?(ctx), hint?, description?, icon?,
 *                      separatorBefore?, palette?: boolean, paletteTitle?, keywords? }]
 *                   przycisk albo pozycja menu w strefie (karta działki, menu Projekt, dok…);
 *                   ta sama akcja trafia do palety poleceń. Limity stref sprawdza ActionRegistry.
 *
 * Funkcje w deklaracjach dostają `ctx` z metodą get(nazwaSerwisu) — w runtime
 * mapy i w komponentach React ten sam kształt. Deklaracje nie zawierają JSX:
 * pola paska kontekstu i pozycje paska stanu są DANYMI, które rysuje powłoka.
 * Dzięki temu wygląd wszystkich funkcji jest jednolity (tokeny, rozmiary),
 * a funkcja nie musi znać komponentów.
 *
 * FieldDescriptor (pasek kontekstu):
 *   { id, type: 'number'|'select'|'color'|'text'|'rotate'|'badge'|'button'|'readout',
 *     label, title?, value, onChange?(value), unit?, min?, max?, step?, options?,
 *     disabled?, tone?: 'warning'|'danger'|'accent', width? }
 */

const SLOTS = ['services', 'interaction', 'tools', 'commands', 'statusItems', 'contextMenu', 'objectFields', 'panels', 'exportFormats', 'analysisSources', 'analysisOperations', 'settings', 'actions'];
const PANEL_DOCKS = new Set(['right', 'bottom']);
const KNOWN_KEYS = new Set(['id', 'title', 'description', ...SLOTS]);

function fail(featureId, message) {
    throw new Error(`Funkcja ${featureId || '(bez id)'}: ${message}`);
}

function requireArray(feature, slot) {
    const value = feature[slot];
    if (value === undefined) return [];
    if (!Array.isArray(value)) fail(feature.id, `slot ${slot} musi być tablicą.`);
    return value;
}

function checkTool(feature, tool) {
    if (!tool?.id) fail(feature.id, 'narzędzie bez id.');
    for (const key of ['title', 'icon', 'group'])
        if (!tool[key]) fail(feature.id, `narzędzie ${tool.id} nie ma pola ${key}.`);
    if (!tool.hint) fail(feature.id, `narzędzie ${tool.id} nie ma instrukcji (hint) dla paska kontekstu.`);
    if (!Number.isFinite(tool.order)) fail(feature.id, `narzędzie ${tool.id} nie ma kolejności (order).`);
    if (typeof tool.isActive !== 'function') fail(feature.id, `narzędzie ${tool.id} wymaga isActive(ctx).`);
    if (typeof tool.load !== 'function') fail(feature.id, `narzędzie ${tool.id} wymaga load(ctx).`);
    if (tool.options !== undefined && typeof tool.options !== 'function') fail(feature.id, `options narzędzia ${tool.id} musi być funkcją (ctx) => pola.`);
}

/** Sprawdza i zamraża deklarację funkcji. Błędy wychodzą przy starcie, nie w trakcie pracy. */
export function defineFeature(feature) {
    if (!feature || typeof feature !== 'object') throw new Error('defineFeature wymaga obiektu.');
    if (!feature.id || !/^[a-z][a-z0-9-]*$/.test(feature.id)) fail(feature.id, 'id musi być krótkim identyfikatorem (a-z, 0-9, -).');
    for (const key of Object.keys(feature))
        if (!KNOWN_KEYS.has(key)) fail(feature.id, `nieznany slot „${key}”. Dostępne: ${SLOTS.join(', ')}.`);
    if (feature.services !== undefined) {
        if (typeof feature.services !== 'object' || Array.isArray(feature.services)) fail(feature.id, 'services musi być obiektem { nazwa: fabryka }.');
        for (const [name, factory] of Object.entries(feature.services))
            if (typeof factory !== 'function') fail(feature.id, `serwis ${name} wymaga funkcji tworzącej.`);
    }
    for (const owner of requireArray(feature, 'interaction')) {
        if (!owner?.id || !owner.service) fail(feature.id, 'tryb interakcji wymaga id i nazwy serwisu.');
        if (typeof owner.deactivate !== 'function') fail(feature.id, `tryb ${owner.id} wymaga deactivate(serwis).`);
    }
    for (const tool of requireArray(feature, 'tools')) checkTool(feature, tool);
    for (const command of requireArray(feature, 'commands')) {
        if (!command?.id || typeof command.run !== 'function') fail(feature.id, 'polecenie wymaga id i run(ctx).');
        if (!command.title && !command.hidden) fail(feature.id, `polecenie ${command.id} wymaga nazwy (title).`);
    }
    for (const item of requireArray(feature, 'statusItems'))
        if (!item?.id || typeof item.select !== 'function') fail(feature.id, 'pozycja paska stanu wymaga id i select(snapshot, ctx).');
    for (const item of requireArray(feature, 'contextMenu'))
        if (!item?.id || !item.label || typeof item.run !== 'function') fail(feature.id, 'pozycja menu mapy wymaga id, label i run(ctx, miejsce).');
    for (const item of requireArray(feature, 'objectFields'))
        if (!item?.id || typeof item.appliesTo !== 'function' || typeof item.fields !== 'function') fail(feature.id, 'pola obiektu wymagają id, appliesTo(obiekt) i fields(obiekt, ctx).');
    for (const panel of requireArray(feature, 'panels')) {
        if (!panel?.id || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(panel.id)) fail(feature.id, 'panel wymaga id (litery i cyfry, bez spacji).');
        for (const key of ['title', 'icon']) if (!panel[key]) fail(feature.id, `panel ${panel.id} nie ma pola ${key}.`);
        if (!PANEL_DOCKS.has(panel.dock)) fail(feature.id, `panel ${panel.id}: dock musi być 'right' albo 'bottom'.`);
        if (!Number.isFinite(panel.order)) fail(feature.id, `panel ${panel.id} nie ma kolejności (order).`);
        if (typeof panel.load !== 'function') fail(feature.id, `panel ${panel.id} wymaga load() zwracającego komponent.`);
    }
    for (const format of requireArray(feature, 'exportFormats')) {
        if (!format?.id || !format.title) fail(feature.id, 'format eksportu wymaga id i title.');
        if (!Array.isArray(format.actions) || !format.actions.length) fail(feature.id, `format ${format.id} wymaga co najmniej jednej akcji.`);
        for (const action of format.actions)
            if (!action?.id || !action.label || typeof action.run !== 'function') fail(feature.id, `akcja formatu ${format.id} wymaga id, label i run(ctx, wartości, plik).`);
        for (const option of format.options ?? [])
            if (!option?.id || !option.label || !['select', 'text', 'checkbox'].includes(option.type)) fail(feature.id, `opcja formatu ${format.id} wymaga id, label i type select|text|checkbox.`);
        const optionIds = new Set((format.options ?? []).map((option) => option.id));
        for (const action of format.actions)
            for (const id of action.options ?? [])
                if (!optionIds.has(id)) fail(feature.id, `akcja ${format.id}.${action.id} wskazuje nieznaną opcję ${id}.`);
    }
    for (const action of requireArray(feature, 'actions')) {
        if (!action?.id || !action.label || typeof action.run !== 'function') fail(feature.id, 'akcja wymaga id, label i run(ctx).');
        if (!isActionZone(action.zone)) fail(feature.id, `akcja ${action.id}: nieznana strefa „${action.zone}”.`);
        if (!Number.isFinite(action.order)) fail(feature.id, `akcja ${action.id} nie ma kolejności (order).`);
    }
    for (const source of requireArray(feature, 'analysisSources')) {
        if (!source?.id || !source.title) fail(feature.id, 'źródło analizy wymaga id i title.');
        if (typeof source.create !== 'function' && !source.type) fail(feature.id, `źródło ${source.id} wymaga type albo create(ctx).`);
        if (source.screening !== undefined && typeof source.screening !== 'boolean') fail(feature.id, `źródło ${source.id}: screening musi być true/false.`);
        if (source.available !== undefined && typeof source.available !== 'function') fail(feature.id, `źródło ${source.id}: available musi być funkcją.`);
    }
    for (const operation of requireArray(feature, 'analysisOperations')) {
        if (!operation?.id || !operation.title) fail(feature.id, 'operacja analizy wymaga id i title.');
        if (!Number.isFinite(operation.order)) fail(feature.id, `operacja ${operation.id} nie ma kolejności (order).`);
        if (typeof operation.run !== 'function') fail(feature.id, `operacja ${operation.id} wymaga run(input).`);
        for (const key of ['summary', 'warnings', 'save', 'saveProperties', 'saveData', 'requestMargin', 'progress'])
            if (operation[key] !== undefined && typeof operation[key] !== 'function') fail(feature.id, `operacja ${operation.id}: ${key} musi być funkcją.`);
        for (const param of operation.params ?? []) {
            if (!param?.id || !param.label || !['number', 'select'].includes(param.type)) fail(feature.id, `parametr operacji ${operation.id} wymaga id, label i type number|select.`);
            if (param.default === undefined) fail(feature.id, `parametr ${operation.id}.${param.id} wymaga wartości domyślnej.`);
            if (param.type === 'select' && !(param.options ?? []).some((option) => option.value === param.default)) fail(feature.id, `parametr ${operation.id}.${param.id}: domyślna wartość spoza listy.`);
        }
    }
    for (const setting of requireArray(feature, 'settings')) {
        if (!setting?.id || !setting.label) fail(feature.id, 'ustawienie wymaga id i label.');
        if (setting.type !== 'toggle') fail(feature.id, `ustawienie ${setting.id}: obsługiwany typ to 'toggle'.`);
        if (typeof setting.default !== 'boolean') fail(feature.id, `ustawienie ${setting.id} wymaga wartości domyślnej true/false.`);
    }
    return Object.freeze({ ...feature });
}

/** Manifesty paneli wszystkich funkcji (dane dla stanu doku i rejestru paneli). */
export function collectPanels(features) {
    const panels = [];
    const seen = new Set();
    for (const feature of features) {
        for (const panel of feature.panels ?? []) {
            if (seen.has(panel.id)) throw new Error(`Panel ${panel.id} jest zadeklarowany dwa razy.`);
            seen.add(panel.id);
            panels.push(Object.freeze({ ...panel, feature: feature.id }));
        }
    }
    return panels.sort((a, b) => a.order - b.order);
}

export const FEATURE_SLOTS = Object.freeze([...SLOTS]);
