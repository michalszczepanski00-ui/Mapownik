import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Undo2, X } from 'lucide-react';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPoint from 'ol/geom/MultiPoint.js';
import Style from 'ol/style/Style.js';
import Stroke from 'ol/style/Stroke.js';
import Fill from 'ol/style/Fill.js';
import CircleStyle from 'ol/style/Circle.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { fromViewGeometry } from '../../objects/index.js';
import { formatArea, formatLength } from '../../core/units.js';
import { MAP_STYLE_TOKENS } from '../../core/index.js';
import { t } from '../../i18n/index.js';

/**
 * 18.14.1 — pomiar z celownikiem (wzór: „Zmierz odległość” w Mapach Google).
 *
 * Celownik stoi na środku ekranu, użytkownik przesuwa mapę pod nim i dodaje
 * punkty dużym przyciskiem — palec nie zasłania mierzonego miejsca, a obsługa
 * jest możliwa jedną ręką. Na żywo: długość / powierzchnia i ostatni odcinek.
 * Wynik zapisuje się jak zwykły pomiar (albo profil terenu) w projekcie.
 *
 * Tryby: 'line' (odległość), 'area' (powierzchnia), 'profile' (profil terenu).
 */
const EMPTY_MEASUREMENT = Object.freeze({ temporary: false });
const MEASURE_COLOR = MAP_STYLE_TOKENS.measurement;
const PREVIEW = [
    new Style({ stroke: new Stroke({ color: '#ffffff', width: 5 }) }),
    new Style({ stroke: new Stroke({ color: '#2563eb', width: 2.5, lineDash: [8, 6] }), fill: new Fill({ color: 'rgba(37, 99, 235, 0.14)' }) }),
];
const VERTICES = new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#2563eb' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }) });

function projected(points) {
    // Długości i powierzchnie w układzie projektu (EPSG:2180, metry), jak w zapisanym pomiarze.
    if (points.length < 2) return points.length ? [fromViewGeometry(new LineString([points[0], points[0]])).coordinates[0]] : [];
    return fromViewGeometry(new LineString(points)).coordinates;
}
function lengthOf(coords) {
    let total = 0;
    for (let i = 1; i < coords.length; i += 1) total += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    return total;
}
function areaOf(coords) {
    if (coords.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < coords.length; i += 1) {
        const [x1, y1] = coords[i];
        const [x2, y2] = coords[(i + 1) % coords.length];
        sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
}

export function MobileCrosshair({ mode, start = null, onClose }) {
    const controller = useService('mapController');
    const objectCommands = useService('objectCommands');
    const measurement = useService('measurement');
    const measurementState = useServiceSnapshot('measurement', EMPTY_MEASUREMENT);
    const objects = useService('objects');
    const terrain = useService('terrainProfile');
    const identify = useService('identify');
    const toasts = useService('featureContext')?.toasts;
    const [points, setPoints] = useState(() => (start ? [start] : []));
    const [center, setCenter] = useState(() => controller?.map?.getView().getCenter() ?? [0, 0]);
    const layerRef = useRef(null);
    const source = useMemo(() => new VectorSource(), []);

    // Mapa nie otwiera działki, dopóki trwa pomiar.
    useEffect(() => {
        identify?.holdClicks(true);
        return () => identify?.holdClicks(false);
    }, [identify]);

    useEffect(() => {
        const map = controller?.map;
        if (!map) return undefined;
        const layer = new VectorLayer({ source, zIndex: 9100, properties: { mapownikInternal: true } });
        layerRef.current = layer;
        controller.addLayer(layer);
        const view = map.getView();
        if (start) view.animate({ center: start, duration: 250 });
        let frame = 0;
        const onChange = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => { frame = 0; setCenter(view.getCenter()); });
        };
        view.on('change:center', onChange);
        return () => {
            view.un('change:center', onChange);
            if (frame) cancelAnimationFrame(frame);
            controller.removeLayer(layer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [controller]);

    const live = useMemo(() => [...points, center], [points, center]);
    useEffect(() => {
        source.clear(true);
        if (live.length >= 2) {
            const geometry = mode === 'area' && live.length >= 3 ? new Polygon([[...live, live[0]]]) : new LineString(live);
            const shape = new Feature(geometry);
            shape.setStyle(PREVIEW);
            source.addFeature(shape);
        }
        if (points.length) {
            const vertices = new Feature(new MultiPoint(points));
            vertices.setStyle(VERTICES);
            source.addFeature(vertices);
        }
    }, [live, points, mode, source]);

    const coords = projected(live);
    const total = mode === 'area' ? areaOf(coords) : lengthOf(coords);
    const segment = coords.length >= 2 ? Math.hypot(coords.at(-1)[0] - coords.at(-2)[0], coords.at(-1)[1] - coords.at(-2)[1]) : 0;
    const perimeter = mode === 'area' && coords.length >= 3 ? lengthOf([...coords, coords[0]]) : null;

    const add = () => {
        const c = controller?.map?.getView().getCenter();
        if (!c) return;
        setPoints((list) => [...list, c]);
        navigator.vibrate?.(12);
    };
    const undo = () => setPoints((list) => list.slice(0, -1));

    // Do wyniku wchodzi też aktualne położenie celownika, jeśli jest dalej niż 0,5 m od ostatniego punktu.
    const finalPoints = () => {
        const list = [...points];
        if (!list.length || segment > 0.5) list.push(center);
        return list;
    };
    const minPoints = mode === 'area' ? 3 : 2;
    // Pomiar o zerowej długości / powierzchni nie jest zapisywany.
    const canFinish = finalPoints().length >= minPoints && total > 0.5;

    const finish = () => {
        const list = finalPoints();
        if (list.length < minPoints || !objectCommands) return;
        try {
            if (mode === 'profile') {
                const geometry = fromViewGeometry(new LineString(list));
                const id = objectCommands.create({
                    name: t('terrain.profilTerenuM', { value: Math.round(lengthOf(geometry.coordinates)).toLocaleString('pl-PL') }),
                    geometry, visible: true, origin: 'analysis', kind: 'terrain-profile',
                    properties: { terrainProfileModel: 'NMT', terrainVerticalDatum: 'PL-KRON86-NH' },
                    style: { strokeColor: '#059669', strokeWidth: 3, strokeOpacity: 1, strokePattern: 'solid', fillColor: '#10b981', fillOpacity: 0.10, pointRadius: 5 },
                });
                void terrain?.loadObjectProfile(id, true);
                objects?.select(id);
            } else {
                const area = mode === 'area';
                const geometry = fromViewGeometry(area ? new Polygon([[...list, list[0]]]) : new LineString(list));
                const value = area ? areaOf(geometry.coordinates[0].slice(0, -1)) : lengthOf(geometry.coordinates);
                const label = area ? formatArea(value) : formatLength(value);
                const id = measurement.recordMeasurement({
                    name: area ? t('measurement.powierzchnia', { label }) : t('measurement.wymiar', { label }),
                    geometry, kind: 'measurement', properties: { measurementType: area ? 'area' : 'length' }, origin: 'user', visible: true,
                    style: { strokeColor: MEASURE_COLOR, strokeWidth: 2, strokeOpacity: 1, strokePattern: 'dash-medium', fillColor: MEASURE_COLOR, fillOpacity: area ? 0.10 : 0, pointRadius: 4 },
                });
                if (id) objects?.select(id);
                toasts?.show?.({ tone: 'success', message: measurementState.temporary ? `Pomiar tymczasowy: ${label}. Możesz dodać go do projektu.` : t('mobile.measure.saved', { label }), timeoutMs: 3500 });
            }
            onClose();
        } catch (error) {
            toasts?.show?.({ tone: 'danger', message: error instanceof Error ? error.message : String(error) });
        }
    };

    const title = mode === 'area' ? t('mobile.measure.area') : mode === 'profile' ? t('mobile.measure.profile') : t('mobile.measure.line');
    const main = mode === 'area' ? formatArea(total) : formatLength(total);
    return h('div', { className: 'm-crosshair-layer', 'data-center': center.map((v) => Math.round(v)).join(',') },
        h('div', { className: 'm-crosshair', 'aria-hidden': true }),
        h('section', { className: 'm-measure-bar', role: 'region', 'aria-label': title },
            mode !== 'profile' && h('label', { className: 'm-temporary-toggle' }, h('input', { type: 'checkbox', checked: measurementState.temporary, onChange: (event) => measurement?.setTemporary(event.target.checked) }), 'Pomiar tymczasowy — bez zapisu w projekcie'),
        h('div', { className: 'm-measure-head' },
                h('div', { className: 'm-measure-values', role: 'status', 'aria-live': 'polite' },
                    h('span', null, title),
                    h('strong', null, points.length ? main : t('mobile.measure.start')),
                    points.length ? h('small', null, [
                        mode !== 'area' && points.length ? t('mobile.measure.segment', { value: formatLength(segment) }) : null,
                        perimeter != null ? t('mobile.measure.perimeter', { value: formatLength(perimeter) }) : null,
                        t('mobile.measure.points', { count: points.length }),
                    ].filter(Boolean).join(' · ')) : h('small', null, t('mobile.measure.hint'))),
                h('button', { type: 'button', className: 'm-icon-button', 'aria-label': t('mobile.measure.cancel'), onClick: onClose }, h(X, { size: 20 }))),
            h('div', { className: 'm-measure-actions' },
                h('button', { type: 'button', className: 'm-measure-secondary', onClick: undo, disabled: !points.length }, h(Undo2, { size: 20 }), h('span', null, t('mobile.measure.undo'))),
                h('button', { type: 'button', className: 'm-measure-add', onClick: add, 'aria-label': t('mobile.measure.add') }, h(Plus, { size: 30 })),
                h('button', { type: 'button', className: 'm-measure-secondary is-done', onClick: finish, disabled: !canFinish }, h(Check, { size: 20 }), h('span', null, t('mobile.measure.done'))))));
}
