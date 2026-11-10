/**
 * 18.0 — lista funkcji msportalu.
 *
 * TO JEST JEDYNY WSPÓLNY PLIK ZMIENIANY PRZY DODAWANIU FUNKCJI:
 * nowa funkcja = nowy plik w features/builtin/ (defineFeature) + jedna linia
 * poniżej. Kolejność ma znaczenie tylko dla serwisów (późniejsza funkcja może
 * korzystać z serwisów wcześniejszej) i dla domyślnej kolejności w slotach.
 */
import { coreFeature } from './builtin/coreFeature.js';
import { objectStyleFeature } from './builtin/objectStyleFeature.js';
import { editingFeature } from './builtin/editingFeature.js';
import { measurementFeature } from './builtin/measurementFeature.js';
import { bufferFeature } from './builtin/bufferFeature.js';
import { informationFeature } from './builtin/informationFeature.js';
import { terrainFeature } from './builtin/terrainFeature.js';
import { layersFeature } from './builtin/layersFeature.js';
import { marketFeature } from './builtin/marketFeature.js';
import { objectsFeature } from './builtin/objectsFeature.js';
import { analysisFeature } from './builtin/analysisFeature.js';
import { vpsFeature } from './builtin/vpsFeature.js';
import { exportFeature } from './builtin/exportFeature.js';
import { collectPanels } from './defineFeature.js';

export const BUILTIN_FEATURES = Object.freeze([
    coreFeature,
    objectStyleFeature,
    editingFeature,
    measurementFeature,
    bufferFeature,
    informationFeature,
    terrainFeature,
    layersFeature,
    marketFeature,
    objectsFeature,
    analysisFeature,
    vpsFeature,
    exportFeature,
]);

/** 18.1: manifesty paneli (stan doku w store i rejestr komponentów paneli). */
export const FEATURE_PANELS = Object.freeze(collectPanels(BUILTIN_FEATURES));

export { defineFeature, FEATURE_SLOTS, collectPanels } from './defineFeature.js';
export { FeatureRegistry } from './FeatureRegistry.js';
export { InteractionRegistry } from './InteractionRegistry.js';
