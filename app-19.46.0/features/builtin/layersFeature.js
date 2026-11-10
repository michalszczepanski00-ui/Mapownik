import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';

/** Panel Warstwy (18.1: manifest panelu w deklaracji funkcji zamiast w store). */
export const layersFeature = defineFeature({
    id: 'layers',
    title: t('feature.layers'),
    panels: [{
        id: 'layers',
        railLabel: 'Warstwy',
        title: t('panel.layers.title'),
        subtitle: t('panel.layers.subtitle'),
        icon: 'layers',
        dock: 'right',
        order: 10,
        collapsible: true,
        floatGroup: 'left-float',
        defaultWidth: 292,
        minWidth: 240,
        maxWidth: 420,
        resizeDirection: 1,
        load: () => import('../../app/components/LayersPanel.js').then((module) => module.LayersPanel),
    }],
});
