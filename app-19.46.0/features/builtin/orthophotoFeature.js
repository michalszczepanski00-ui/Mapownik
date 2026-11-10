import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';
export const orthophotoFeature = defineFeature({
    id: 'orthophoto', title: t('panel.orthophoto.title'),
    panels: [{
        id: 'orthophoto',
        railLabel: 'Zdjęcia',
        title: t('panel.orthophoto.title'),
        subtitle: t('ortho.subtitle'),
        icon: 'orthophoto', dock: 'right', order: 27,
        collapsible: true, floatGroup: 'right-overlay',
        defaultWidth: 380, minWidth: 300, maxWidth: 460, resizeDirection: -1,
        load: () => import('../../app/components/OrthophotoPanel.js').then((module) => module.OrthophotoPanel),
    }],
});
