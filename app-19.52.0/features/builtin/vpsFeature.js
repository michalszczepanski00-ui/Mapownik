import { defineFeature } from '../defineFeature.js';
/** msportal: panel analizy działki (ULDK/PRG/RU) i opcjonalnie BDOT10k; 19.23.0 bez RCN. */
export const vpsFeature = defineFeature({
    id: 'vps',
    title: 'Analizy lokalne',
    panels: [{
        id: 'vpsData', title: 'Działka i otoczenie', subtitle: 'Plan, granice i otoczenie działki',
        icon: 'parcel-report', railLabel: 'Raport', dock: 'right', order: 26, collapsible: true,
        // 19.11.0: zakładka „Raport” karty miejsca (App.js: PlaceCardTabs).
        placeCard: true, placeCardLabel: 'Analiza działki (serwer)', floatGroup: 'place-card', defaultWidth: 380, minWidth: 310, maxWidth: 530,
        resizeDirection: -1,
        load: () => import('../../app/components/VpsDataPanel.js').then(m => m.VpsDataPanel),
    }],
});
