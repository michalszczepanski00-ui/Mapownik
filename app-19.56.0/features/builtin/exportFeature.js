import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';
import { appDialogs, downloadText, readTextFile } from '../../core/index.js';

/**
 * Eksport i import (18.1): panel oraz formaty plików w deklaracji.
 *
 * Panel Eksport rysuje sekcję „Obraz mapy” (eksport rastra z serwera) i pod
 * nią po jednej sekcji na każdy wpis slotu `exportFormats` — także z innych
 * funkcji. Nowy format (np. KML, DXF) to nowy wpis z opcjami i akcjami;
 * panel go nie zna z nazwy.
 */
const transfers = (ctx) => {
    const manager = ctx.get('transfers');
    if (!manager) throw new Error(t('export.unavailable'));
    return manager;
};
const JSON_TYPE = 'application/json;charset=utf-8';

export const exportFeature = defineFeature({
    id: 'export',
    title: t('feature.export'),
    panels: [{
        id: 'export',
        railLabel: 'Eksport',
        title: t('panel.export.title'),
        subtitle: t('panel.export.subtitle'),
        icon: 'export',
        dock: 'right',
        order: 40,
        collapsible: false,
        floatGroup: 'right-overlay',
        defaultWidth: 340,
        minWidth: 300,
        maxWidth: 460,
        resizeDirection: -1,
        load: () => import('../../app/components/ExportPanel.js').then((module) => module.ExportPanel),
    }],
    exportFormats: [
        {
            id: 'project',
            order: 20,
            icon: 'file',
            title: t('export.project.title'),
            subtitle: t('export.project.subtitle'),
            actions: [
                {
                    id: 'save', label: t('export.project.save'), icon: 'download', variant: 'secondary',
                    run: async (ctx) => {
                        const result = await transfers(ctx).exportProject();
                        downloadText(result.text, result.filename, JSON_TYPE);
                    },
                },
                {
                    id: 'open', label: t('export.project.open'), icon: 'upload', kind: 'file', accept: '.mapownik,application/json',
                    run: async (ctx, values, file) => {
                        const text = await readTextFile(file);
                        const accepted = await appDialogs.confirm({
                            title: t('export.project.confirmTitle'),
                            message: t('export.project.confirmMessage', { name: file?.name ?? 'projekt' }),
                            hint: t('export.project.confirmHint'),
                            confirmLabel: t('export.project.confirmLabel'),
                            tone: 'danger',
                        });
                        if (!accepted) return;
                        await transfers(ctx).importProject(text, (backup) => downloadText(backup.text, backup.filename, JSON_TYPE));
                    },
                },
                {
                    // Link jest zawsze NOWYM zapisem — nigdy nie nadpisuje wcześniejszego
                    // udostępnienia tego samego projektu.
                    id: 'share', label: t('export.project.share'), icon: 'link',
                    run: async (ctx) => {
                        const result = await transfers(ctx).shareProject();
                        await appDialogs.prompt({
                            title: t('export.share.title'),
                            message: t('export.share.message'),
                            label: t('export.share.label'),
                            defaultValue: result.url,
                            maxLength: 400,
                            confirmLabel: t('export.share.done'),
                        });
                    },
                },
            ],
        },
        {
            id: 'geojson',
            order: 30,
            icon: 'file',
            title: t('export.geojson.title'),
            subtitle: t('export.geojson.subtitle'),
            options: [
                {
                    id: 'projection', type: 'select', label: t('export.geojson.projection'), default: 'EPSG:4326',
                    options: [
                        { value: 'EPSG:4326', label: 'WGS84 / EPSG:4326' },
                        { value: 'EPSG:2180', label: 'PUWG 1992 / EPSG:2180' },
                    ],
                },
                {
                    id: 'importMode', type: 'select', label: t('export.geojson.importMode'), default: 'merge',
                    options: [
                        { value: 'merge', label: t('export.geojson.merge') },
                        { value: 'replace', label: t('export.geojson.replace') },
                    ],
                },
            ],
            actions: [
                {
                    id: 'export', label: t('export.geojson.export'), icon: 'download', options: ['projection'],
                    run: async (ctx, values) => {
                        const result = await transfers(ctx).exportGeoJson(values.projection);
                        downloadText(result.text, result.filename, 'application/geo+json;charset=utf-8');
                    },
                },
                {
                    id: 'import', label: t('export.geojson.import'), icon: 'upload', kind: 'file', options: ['importMode'], accept: '.geojson,.json,application/geo+json,application/json',
                    run: async (ctx, values, file) => {
                        const text = await readTextFile(file);
                        if (values.importMode === 'replace') {
                            // Potwierdzenie zostaje przy imporcie „zastąp” (audyt 18.0).
                            const accepted = await appDialogs.confirm({
                                title: t('export.geojson.confirmTitle'),
                                message: t('export.geojson.confirmMessage'),
                                hint: t('export.geojson.confirmHint'),
                                confirmLabel: t('export.geojson.confirmLabel'),
                                tone: 'danger',
                            });
                            if (!accepted) return;
                        }
                        await transfers(ctx).importGeoJson(text, values.importMode);
                    },
                },
            ],
        },
    ],
});
