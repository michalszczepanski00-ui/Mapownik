import { defineFeature } from '../defineFeature.js';
/** msportal: panel analizy działki (ULDK/PRG/RU) i opcjonalnie BDOT10k; 19.23.0 bez RCN. */
export const vpsFeature = defineFeature({
    id: 'vps',
    title: 'Analizy lokalne',
    panels: [{
        id: 'vpsData', title: 'Analiza działki (serwer)', subtitle: 'Plan, granice i otoczenie działki',
        icon: 'parcel-report', railLabel: 'Raport', dock: 'right', order: 26, collapsible: true,
        // 19.53.0 (Etap 5): widok w doku Analizy (dawniej zakładka „Raport” karty działki).
        railGroup: 'analyses', floatGroup: 'right-overlay', defaultWidth: 380, minWidth: 310, maxWidth: 530,
        resizeDirection: -1,
        load: () => import('../../app/components/VpsDataPanel.js').then(m => m.VpsDataPanel),
    }],
});
