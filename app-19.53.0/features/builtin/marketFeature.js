import { defineFeature } from '../defineFeature.js';
/**
 * 19.32.0 — rynek i inwestycje: dwa narzędzia na prawej belce.
 *  - „Ceny transakcyjne”: transakcje z Rejestru Cen Nieruchomości (GUGiK) w widoku mapy;
 *  - „Pozwolenia na budowę”: wnioski, decyzje i zgłoszenia budowlane (GUNB, RWDZ) wokół działki albo środka mapy.
 */
export const marketFeature = defineFeature({
    id: 'market', title: 'Rynek i inwestycje',
    panels: [
        {
            id: 'marketPrices', railLabel: 'Ceny', title: 'Ceny transakcyjne', subtitle: 'Rejestr Cen Nieruchomości · widok mapy',
            icon: 'market-prices', dock: 'right', order: 28, collapsible: true, floatGroup: 'right-overlay', railGroup: 'analyses',
            defaultWidth: 380, minWidth: 300, maxWidth: 480, resizeDirection: -1,
            load: () => import('../../app/components/MarketPricesPanel.js').then((module) => module.MarketPricesPanel),
        },
        {
            id: 'buildingPermits', railLabel: 'Budowy', title: 'Budowy i pozwolenia', subtitle: 'Wnioski, decyzje i zgłoszenia (GUNB)',
            icon: 'building-permits', dock: 'right', order: 29, collapsible: true, floatGroup: 'right-overlay', railGroup: 'analyses',
            defaultWidth: 400, minWidth: 300, maxWidth: 520, resizeDirection: -1,
            load: () => import('../../app/components/BuildingPermitsPanel.js').then((module) => module.BuildingPermitsPanel),
        },
    ],
});
