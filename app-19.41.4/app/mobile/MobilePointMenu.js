import { createElement as h, useEffect, useMemo, useState } from 'react';
import { Copy, Info, Navigation, Pentagon, Ruler, StickyNote, X } from 'lucide-react';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Style from 'ol/style/Style.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import CircleStyle from 'ol/style/Circle.js';
import { toLonLat } from 'ol/proj.js';
import { useService } from '../services/AppServicesContext.js';
import { ToolIcon } from '../icons/tablerIcons.js';
import { fromViewGeometry } from '../../objects/index.js';
import { MobileSheet } from './MobileSheet.js';
import { t } from '../../i18n/index.js';

/**
 * 18.14.1 — menu po przytrzymaniu palca na mapie (wzór: „upuszczona pinezka”
 * w Mapach Google). Pinezka w miejscu przytrzymania i karta z akcjami:
 * zmierz stąd (odległość / powierzchnię), profil terenu stąd, notatka,
 * działka w tym miejscu, nawiguj, kopiuj współrzędne.
 */
const PIN = [
    new Style({ image: new CircleStyle({ radius: 14, fill: new Fill({ color: 'rgba(220, 38, 38, 0.22)' }) }) }),
    new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#dc2626' }), stroke: new Stroke({ color: '#ffffff', width: 2.5 }) }) }),
];

export function MobilePointMenu({ coordinate, onMeasure, onParcel, onClose }) {
    const controller = useService('mapController');
    const objectCommands = useService('objectCommands');
    const objects = useService('objects');
    const ctx = useService('featureContext');
    const [snap, setSnap] = useState('half');
    const source = useMemo(() => new VectorSource(), []);

    useEffect(() => {
        if (!controller) return undefined;
        const layer = new VectorLayer({ source, zIndex: 9050, properties: { mapownikInternal: true } });
        controller.addLayer(layer);
        return () => controller.removeLayer(layer);
    }, [controller, source]);
    // Pinezka nad kartą: mapa przesuwa się tak, by punkt był w górnej części ekranu.
    useEffect(() => {
        const view = controller?.map?.getView();
        const size = controller?.map?.getSize();
        if (!view || !size) return;
        const resolution = view.getResolution() ?? 1;
        view.animate({ center: [coordinate[0], coordinate[1] - size[1] * 0.2 * resolution], duration: 250 });
    }, [controller, coordinate]);
    useEffect(() => {
        source.clear(true);
        const pin = new Feature(new Point(coordinate));
        pin.setStyle(PIN);
        source.addFeature(pin);
    }, [coordinate, source]);

    const [lon, lat] = toLonLat(coordinate);
    const projected = fromViewGeometry(new Point(coordinate)).coordinates;
    const wgs = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    const puwg = `X ${projected[0].toFixed(2)}, Y ${projected[1].toFixed(2)}`;

    const copy = async (text) => {
        try { await navigator.clipboard.writeText(text); ctx?.toasts?.show({ tone: 'success', message: t('contextMenu.copied', { value: text }), timeoutMs: 3000 }); }
        catch { ctx?.toasts?.show({ tone: 'info', message: text, timeoutMs: 8000 }); }
        onClose();
    };
    const note = async () => {
        const text = await ctx?.dialogs?.prompt({ title: t('mobile.point.noteTitle'), label: t('editing.tresc'), placeholder: t('mobile.point.notePlaceholder'), maxLength: 120, confirmLabel: t('editing.dodaj') });
        if (text == null || !text.trim()) return;
        const id = objectCommands?.create({
            name: text.trim().slice(0, 60),
            geometry: { type: 'Point', coordinates: projected },
            kind: 'text', origin: 'user', visible: true,
            properties: { text: text.trim(), fontSize: 14, fontWeight: '600', rotationDeg: 0, backgroundOpacity: 0.82 },
        });
        if (id) objects?.select(id);
        onClose();
    };
    const item = (icon, label, onClick, hint = null) => h('button', { type: 'button', className: 'm-list-button', onClick },
        h('span', { className: 'm-list-icon', 'aria-hidden': true }, icon),
        h('span', { className: 'm-list-copy' }, h('span', null, label), hint ? h('small', null, hint) : null));

    return h(MobileSheet, {
        snap, onSnap: setSnap, onClose, label: t('mobile.point.title'), className: 'm-point-menu', peekHeight: 120,
        header: h('div', { className: 'm-card-head' },
            h('div', { className: 'm-card-title' }, h('strong', null, t('mobile.point.title')), h('span', null, wgs)),
            h('button', { type: 'button', className: 'm-icon-button', 'aria-label': t('mobile.close'), onClick: onClose }, h(X, { size: 20 }))),
    },
        item(h(Ruler, { size: 20 }), t('mobile.point.measureLine'), () => onMeasure('line')),
        item(h(Pentagon, { size: 20 }), t('mobile.point.measureArea'), () => onMeasure('area')),
        item(h(ToolIcon, { name: 'terrain-profile', size: 20, strokeWidth: 1.9 }), t('mobile.point.profile'), () => onMeasure('profile')),
        item(h(StickyNote, { size: 20 }), t('mobile.point.note'), () => void note()),
        item(h(Info, { size: 20 }), t('mobile.point.parcel'), onParcel),
        item(h(Navigation, { size: 20 }), t('mobile.point.navigate'), () => { window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}`, '_blank', 'noopener'); onClose(); }),
        item(h(Copy, { size: 20 }), t('mobile.point.copyWgs'), () => void copy(wgs), wgs),
        item(h(Copy, { size: 20 }), t('mobile.point.copyPuwg'), () => void copy(puwg), puwg));
}
