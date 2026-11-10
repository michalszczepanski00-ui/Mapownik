import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Overlay from 'ol/Overlay.js';
import { fromLonLat } from 'ol/proj.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { toBaseLayerOptions } from './layerOptions.js';
import { t } from '../../../i18n/index.js';

const common = {
    image: new CircleStyle({ radius: 7, fill: new Fill({ color: 'rgba(41,108,111,0.74)' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }),
};
const biogasStyle = new Style(common);
const biomethaneStyle = new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: 'rgba(104,91,149,0.76)' }), stroke: new Stroke({ color: '#ffffff', width: 2 }) }) });

function detail(label, value) {
    if (value === null || value === undefined || value === '') return null;
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.append(strong, document.createTextNode(String(value)));
    return p;
}

function externalLink(label, value) {
    if (!value) return null;
    let url;
    try { url = new URL(value); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    return link;
}

function annualVolume(value) {
    return value == null ? null : `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value)} m³/rok`;
}

function popupFor(records, dataset) {
    const box = document.createElement('div');
    box.className = 'kowr-popup';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('sources.instalacjaZRejestruKowr'));
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'kowr-popup-close';
    close.setAttribute('aria-label', t('sources.zamknijInformacjeOInstalacji'));
    close.textContent = '×';
    const heading = document.createElement('strong');
    heading.className = 'kowr-popup-heading';
    heading.textContent = records.length === 1 ? records[0].company : t('sources.instalacjeKowr', { value: records.length });
    box.append(close, heading);
    records.forEach((record) => {
        const container = records.length > 1 ? document.createElement('details') : box;
        if (records.length > 1) {
            const summary = document.createElement('summary');
            summary.textContent = `${record.company} — ${record.address}`;
            container.append(summary);
        }
        [
            detail(t('sources.miejsceDzialalnosci'), record.address),
            detail(t('sources.mocElektryczna'), record.electric_mw != null ? `${record.electric_mw} MW` : null),
            detail(t('sources.mocBiometanu'), record.biomethane_mw != null ? `${record.biomethane_mw} MW` : null),
            detail(t('sources.wydajnoscBiogazu'), annualVolume(record.biogas_m3_year)),
            detail(t('sources.wydajnoscBiometanu'), annualVolume(record.biomethane_m3_year)),
            detail(t('sources.numerWpisu'), record.registration),
            detail(t('sources.rodzajDzialalnosci'), record.activity),
            detail(t('sources.metodaGeolokalizacji'), record.location_basis),
            detail(t('sources.uwagiDoWspolrzednych'), record.location_note),
        ].filter(Boolean).forEach((node) => container.append(node));
        const locationSource = externalLink(t('sources.zrodloWspolrzednych'), record.location_source);
        const osmLink = externalLink(t('sources.otworzPunktOsm'), record.osm_url);
        if (locationSource) container.append(locationSource);
        if (osmLink) container.append(osmLink);
        if (container !== box) box.append(container);
    });
    box.append(detail(t('sources.lokalizacja'), t('sources.orientacyjnaWymagaPotwierdzeniaPrzedAnal')));
    box.append(detail('Dane', t('sources.kowrStanInstalacjiWWykazie', { date: dataset.date, installations: dataset.installations, located: dataset.located })));
    const link = document.createElement('a');
    link.href = dataset.source;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t('sources.otworzRejestrKowr');
    box.append(link);
    return { box, close };
}

export async function createKowrPointsLayer(definition, signal) {
    const response = await fetch(definition.source.url, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error(t('sources.nieUdaloSieOdczytacDanych', { status: response.status }));
    const data = await response.json();
    if (!Array.isArray(data?.records) || data.records.length !== data.installations || !data.source || !data.date) {
        throw new Error(t('sources.niekompletnyWykazInstalacjiKowr'));
    }
    const features = data.records.flatMap((record) => {
        if (!Number.isFinite(record.lon) || !Number.isFinite(record.lat)) return [];
        const feature = new Feature(new Point(fromLonLat([record.lon, record.lat])));
        feature.set('kowr', record);
        feature.setId(`kowr:${record.id}`);
        return [feature];
    });
    const source = new VectorSource({ features, wrapX: false });
    const layer = new VectorLayer({
        ...toBaseLayerOptions(definition),
        source,
        style: (feature) => feature.get('kowr')?.biomethane_mw != null ? biomethaneStyle : biogasStyle,
    });
    let overlay = null;
    let unsubscribe = null;
    const hidePopup = () => { if (!layer.getVisible()) overlay?.setPosition(undefined); };
    layer.on('change:visible', hidePopup);
    return {
        layer,
        attach(host) {
            unsubscribe = host.onSingleClick((click) => {
                const features = host.getFeaturesAtPixel(click.pixel, { layer, hitTolerance: 5 });
                if (features.length === 0) {
                    overlay?.setPosition(undefined);
                    return;
                }
                if (overlay) host.map.removeOverlay(overlay);
                const { box, close } = popupFor(features.map((feature) => feature.get('kowr')), data);
                overlay = new Overlay({ element: box, positioning: 'bottom-center', offset: [0, -11], stopEvent: true, autoPan: { animation: { duration: 150 } } });
                host.map.addOverlay(overlay);
                overlay.setPosition(features[0].getGeometry().getCoordinates());
                close.onclick = () => overlay?.setPosition(undefined);
            });
        },
        dispose() {
            unsubscribe?.();
            layer.un('change:visible', hidePopup);
            if (overlay) {
                overlay.setMap(null);
                overlay = null;
            }
            source.clear(true);
        },
    };
}
