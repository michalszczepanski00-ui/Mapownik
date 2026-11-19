import { t } from '../../i18n/index.js';

/**
 * 18.2 — operacja „Wyświetl dane wektorowe”: tylko podgląd pobranych
 * geometrii. Zapis do projektu (MultiPolygon z podglądu) robi domyślny
 * zapis AnalysisManagera — operacja nie potrzebuje własnego save().
 */
export const previewOperation = Object.freeze({
    id: 'preview',
    order: 10,
    title: t('analysis.operation.preview'),
    description: t('analysis.operation.preview.description'),
    texts: Object.freeze({
        run: t('analysis.run.preview'),
        resultTitle: t('analysis.result.preview'),
        save: t('analysis.result.saveSet'),
    }),
    async run() {
        return {};
    },
});
