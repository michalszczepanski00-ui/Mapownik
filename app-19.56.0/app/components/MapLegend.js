import { createElement as h, useEffect, useState } from 'react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';

/**
 * 19.33.0 — wspólna legenda: jedno miejsce na legendy wszystkiego, co jest na mapie.
 *  - warstwy WMS z legendą (MPZP, POG, uzbrojenie…) — obraz GetLegendGraphic przez ./api/wms_legend.php;
 *  - nachylenie terenu — klasy spadków;
 *  - narzędzia (Ceny, Budowy) — ich warstwa publikuje `mapownikLegend` ({ title, items: [{ color, label }] }).
 * Przycisk widać tylko wtedy, gdy jest co pokazać.
 */
const NO_LAYERS = Object.freeze({ layers: [] });
// Te same klasy co SLOPE_CLASSES w data/sources/adapters/demAdapter.js (kopia — bez ładowania modułu modelu wysokości).
const SLOPE_LEGEND = [['rgba(214,233,190,.8)', '2–5%'], ['rgba(168,214,140,.85)', '5–10%'], ['rgba(236,228,120,.9)', '10–15%'], ['rgba(245,178,84,.9)', '15–25%'], ['rgba(228,104,70,.9)', '25–40%'], ['rgba(176,44,72,.9)', 'powyżej 40%']];

function toolLegends(map) {
    if (!map) return [];
    return map.getAllLayers().filter((layer) => layer.getVisible() && layer.get('mapownikLegend')?.items?.length).map((layer) => layer.get('mapownikLegend'));
}

export function MapLegend() {
    const controller = useService('mapController');
    const snapshot = useServiceSnapshot('layers', NO_LAYERS);
    const [open, setOpen] = useState(false);
    const [revision, setRevision] = useState(0);
    const map = controller?.map;
    useEffect(() => {
        if (!map) return undefined;
        const bump = () => setRevision((v) => v + 1);
        const collection = map.getLayers();
        collection.on('add', bump); collection.on('remove', bump);
        // Klasy cen zmieniają się z widokiem — przy otwartej legendzie odświeżamy ją co 1,5 s.
        const timer = open ? window.setInterval(bump, 1500) : null;
        return () => { collection.un('add', bump); collection.un('remove', bump); if (timer) window.clearInterval(timer); };
    }, [map, open]);
    void revision;
    const wms = (snapshot.layers ?? []).filter((item) => item.visible && item.legendUrl);
    const slope = (snapshot.layers ?? []).some((item) => item.visible && item.id === 'overlay.terrain.slope');
    const tools = toolLegends(map);
    const count = wms.length + (slope ? 1 : 0) + tools.length;
    useEffect(() => { if (!count) setOpen(false); }, [count]);
    if (!count) return null;
    return h('div', { className: `map-legend${open ? ' is-open' : ''}` },
        open && h('section', { className: 'map-legend-card', 'aria-label': 'Legenda mapy' },
            h('div', { className: 'map-legend-head' }, h('strong', null, 'Legenda'), h('button', { type: 'button', className: 'map-legend-close', 'aria-label': 'Zamknij legendę', onClick: () => setOpen(false) }, '×')),
            tools.map((legend) => h('div', { key: legend.title, className: 'map-legend-group' }, h('span', { className: 'map-legend-title' }, legend.title),
                legend.items.map((item) => h('span', { key: item.label, className: 'map-legend-item' }, h('i', { style: { background: item.color, borderColor: item.border ?? 'rgba(0,0,0,.35)' } }), item.label)))),
            slope && h('div', { className: 'map-legend-group' }, h('span', { className: 'map-legend-title' }, 'Nachylenie terenu'),
                SLOPE_LEGEND.map(([color, label]) => h('span', { key: label, className: 'map-legend-item' }, h('i', { style: { background: color } }), label))),
            wms.map((item) => h('div', { key: item.id, className: 'map-legend-group' }, h('span', { className: 'map-legend-title' }, item.title),
                h('img', { src: item.legendUrl, alt: `Legenda: ${item.title}`, loading: 'lazy', onError: (event) => { event.currentTarget.replaceWith(Object.assign(document.createElement('small'), { textContent: 'Usługa nie udostępnia legendy.' })); } })))),
        h('button', { type: 'button', className: 'map-legend-toggle', 'aria-expanded': open, onClick: () => setOpen((v) => !v), title: 'Legenda warstw i narzędzi na mapie' }, `Legenda (${count})`));
}
