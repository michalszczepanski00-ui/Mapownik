import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';
import { bufferOperation, distanceOperation, previewOperation } from '../../analysis/operations/index.js';

/**
 * Analizy przestrzenne (18.1): panele i źródła danych w deklaracji.
 *
 * Nowe źródło do screeningu WMS dopisuje się tutaj jednym wpisem
 * `{ type: 'wms-probe', sourceKey, sampleStepMeters }` — klucz źródła musi
 * istnieć w katalogu serwera (api/identify.php). Źródło z pełnymi
 * geometriami z lokalnej bazy: `type: 'bdot-buildings'`. Nietypowe źródło
 * podaje własne `create(ctx)` zwracające dostawcę (load(), title, kind).
 * `screening: true` włącza źródło do zakładki „Screening działki”
 * (w kolejności deklaracji); pozostałe są tylko w „Analizie źródła”.
 */
const wms = (id, sourceKey, sampleStepMeters, key) => ({
    id, type: 'wms-probe', sourceKey, sampleStepMeters, screening: true,
    title: t(`analysis.source.${key}`), description: t(`analysis.source.${key}.description`),
});

// 19.23.0: źródła budynków BDOT10k pokazujemy tylko, gdy magazyn data/bdot_buildings jest wgrany.
// Jedno zapytanie o stan na sesję; błąd sieci nie ukrywa źródeł (analiza pokaże wtedy własny komunikat).
let bdotStoreCheck = null;
const bdotStoreAvailable = () => {
    bdotStoreCheck ??= fetch('./api/analysis_buildings.php?action=status', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => (payload?.ok ? payload.ready === true : true))
        .catch(() => true);
    return bdotStoreCheck;
};

export const analysisFeature = defineFeature({
    id: 'analysis',
    title: t('feature.analysis'),
    panels: [
        {
            // 19.53.0 (Etap 5): dok Analizy — lista narzędzi analiz; każde otwiera swój widok w tym samym doku
            // („← Analizy” wraca do listy). W kolumnie ikon zostają tylko Warstwy, Obiekty i Analizy.
            id: 'analyses',
            railLabel: 'Analizy',
            title: 'Analizy',
            subtitle: 'Otoczenie, ceny, budowy, analiza działki',
            icon: 'analysis',
            dock: 'right',
            order: 25,
            collapsible: true,
            floatGroup: 'right-overlay',
            defaultWidth: 320,
            minWidth: 280,
            maxWidth: 440,
            resizeDirection: -1,
            load: () => import('../../app/components/AnalysesPanel.js').then((module) => module.AnalysesPanel),
        },
        {
            id: 'analysis',
            railLabel: 'Analizy',
            title: t('panel.analysis.title'),
            subtitle: t('panel.analysis.subtitle'),
            icon: 'analysis',
            dock: 'right',
            order: 30,
            collapsible: true,
            // 19.53.0 (Etap 5): widok w doku Analizy (prawy dok), nie zakładka karty działki.
            railGroup: 'analyses',
            floatGroup: 'right-overlay',
            defaultWidth: 336,
            minWidth: 300,
            maxWidth: 460,
            resizeDirection: -1,
            load: () => import('../../app/components/AnalysisPanel.js').then((module) => module.AnalysisPanel),
        },
        {
            id: 'analysisResults',
            title: t('panel.analysisResults.title'),
            subtitle: t('panel.analysisResults.subtitle'),
            icon: 'table',
            dock: 'bottom',
            order: 60,
            // Moduł kontekstowy sterowany SYGNAŁEM: pokazuje się przy każdym
            // nowym wyniku i daje się zamknąć aż do następnego.
            rail: false,
            openOnSignal: { service: 'analysis', field: 'previewRevision' },
            collapsible: false,
            floatGroup: 'bottom-float',
            defaultWidth: 860,
            minWidth: 480,
            maxWidth: 1400,
            resizeDirection: -1,
            load: () => import('../../app/components/AnalysisResultsPanel.js').then((module) => module.AnalysisResultsPanel),
        },
    ],
    // 18.2: operacje przestrzenne panelu Analizy. Nowa operacja (np. część
    // wspólna z obiektem, liczenie w siatce) to nowy plik w analysis/operations/
    // i wpis tutaj — bez zmian w AnalysisManager i w panelu.
    analysisOperations: [previewOperation, bufferOperation, distanceOperation],
    analysisSources: [
        { id: 'bdot-single-family', type: 'bdot-buildings', category: 'single_family', available: bdotStoreAvailable, title: t('analysis.source.singleFamily'), description: t('analysis.source.singleFamily.description') },
        { id: 'bdot-residential', type: 'bdot-buildings', category: 'residential', screening: true, available: bdotStoreAvailable, title: t('analysis.source.residential'), description: t('analysis.source.residential.description') },
        wms('bdot-forests', 'bdot10k_forest', 220, 'forests'),
        wms('bdot-water', 'bdot10k_water', 180, 'water'),
        wms('gdos-natura2000', 'natura2000', 300, 'natura2000'),
        wms('gdos-protection', 'gdos_protection', 300, 'protection'),
        wms('flood-mzpmrp', 'flood_mzpmrp', 300, 'flood'),
        wms('nid-immovable', 'nid_immovable', 180, 'monuments'),
        wms('nid-archaeology', 'nid_archaeology', 180, 'archaeology'),
    ],
});
