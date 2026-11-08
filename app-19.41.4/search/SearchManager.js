import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import { fromLonLat } from 'ol/proj.js';
import { parseParcelWkt } from '../parcels/wkt.js';
import { toViewGeometry } from '../objects/geometryConversion.js';
const CLEAR_DELAY_MS = 12000;
/** Punkt na pewno wewnątrz działki (środek ciężkości działki wklęsłej bywa poza nią), EPSG:3857. */
function interiorPoint(geometry) {
    try {
        const polygon = geometry.getType() === 'MultiPolygon'
            ? geometry.getPolygons().sort((a, b) => b.getArea() - a.getArea())[0]
            : geometry;
        const coordinate = polygon?.getInteriorPoint?.().getCoordinates();
        return Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]) ? [coordinate[0], coordinate[1]] : null;
    } catch {
        return null;
    }
}
function normalizeBbox(boundingBox, maxSpanDeg = 3) {
    if (!Array.isArray(boundingBox) || boundingBox.length !== 4)
        return null;
    const values = boundingBox.map((value) => Number(value));
    if (!values.every((value) => Number.isFinite(value)))
        return null;
    // api/search.php already normalizes Nominatim to canonical
    // [west, south, east, north] in EPSG:4326. Do not normalize twice.
    const [west, south, east, north] = values;
    const validPolandBounds = west >= 13 && east <= 25.5 && south >= 48.5 && north <= 55.5;
    const validOrder = west <= east && south <= north;
    const plausibleSpan = (east - west) <= maxSpanDeg && (north - south) <= maxSpanDeg;
    return validPolandBounds && validOrder && plausibleSpan ? [west, south, east, north] : null;
}
function focusPoint(host, source, item, maxZoom, duration, scheduleClear) {
    if (!Number.isFinite(Number(item?.lon)) || !Number.isFinite(Number(item?.lat)))
        return false;
    const coordinate = fromLonLat([Number(item.lon), Number(item.lat)]);
    const feature = new Feature({ geometry: new Point(coordinate), kind: 'point' });
    source.addFeature(feature);
    host.fitExtent(feature.getGeometry().getExtent(), { maxZoom, duration, padding: [72, 72, 72, 72] });
    scheduleClear();
    return true;
}
function searchFeatureStyle(feature) {
    const kind = feature.get('kind') || 'point';
    if (kind === 'parcel') {
        return new Style({
            stroke: new Stroke({ color: '#d97706', width: 3 }),
            fill: new Fill({ color: 'rgba(245,158,11,0.18)' }),
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: '#f59e0b' }),
                stroke: new Stroke({ color: '#ffffff', width: 1.5 }),
            }),
        });
    }
    return new Style({
        image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: 'rgba(37,99,235,0.22)' }),
            stroke: new Stroke({ color: '#2563eb', width: 2 }),
        }),
    });
}
export class SearchManager {
    constructor(host) {
        this.clearTimer = null;
        this.disposed = false;
        this.host = host;
        this.source = new VectorSource({ wrapX: false });
        this.layer = new VectorLayer({
            source: this.source,
            zIndex: 10040,
            style: searchFeatureStyle,
            properties: { catalogId: 'runtime.search-highlight' },
        });
        this.host.addLayer(this.layer);
    }
    clearHighlight() {
        if (this.disposed)
            return;
        if (this.clearTimer) {
            window.clearTimeout(this.clearTimer);
            this.clearTimer = null;
        }
        this.source.clear(true);
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.clearHighlight();
        this.host.removeLayer(this.layer);
    }
    scheduleClear() {
        if (this.clearTimer)
            window.clearTimeout(this.clearTimer);
        this.clearTimer = window.setTimeout(() => {
            this.clearTimer = null;
            this.source.clear(true);
        }, CLEAR_DELAY_MS);
    }
    focusLocality(item) {
        if (this.disposed || !item)
            return;
        this.clearHighlight();
        const bbox = normalizeBbox(item.boundingBox, 3);
        if (bbox) {
            const lowerLeft = fromLonLat([bbox[0], bbox[1]]);
            const upperRight = fromLonLat([bbox[2], bbox[3]]);
            this.host.fitExtent([lowerLeft[0], lowerLeft[1], upperRight[0], upperRight[1]], {
                maxZoom: 15,
                duration: 320,
                padding: [72, 72, 72, 72],
            });
        }
        else {
            focusPoint(this.host, this.source, item, 13, 260, () => this.scheduleClear());
        }
    }
    focusStreet(item) {
        if (this.disposed || !item)
            return;
        this.clearHighlight();
        const bbox = normalizeBbox(item.boundingBox, 1);
        if (bbox) {
            const lowerLeft = fromLonLat([bbox[0], bbox[1]]);
            const upperRight = fromLonLat([bbox[2], bbox[3]]);
            this.host.fitExtent([lowerLeft[0], lowerLeft[1], upperRight[0], upperRight[1]], {
                maxZoom: 18,
                duration: 300,
                padding: [76, 76, 76, 76],
            });
        }
        else {
            focusPoint(this.host, this.source, item, 18, 260, () => this.scheduleClear());
        }
    }
    /** 19.18.0: adres (punkt adresowy) — przybliżenie na punkt; zwraca współrzędne EPSG:3857. */
    focusAddress(item) {
        if (this.disposed || !item)
            return null;
        this.clearHighlight();
        if (!Number.isFinite(Number(item.lon)) || !Number.isFinite(Number(item.lat)))
            return null;
        focusPoint(this.host, this.source, item, item.approximate ? 17 : 19, 300, () => this.scheduleClear());
        return fromLonLat([Number(item.lon), Number(item.lat)]);
    }
    focusParcel(item) {
        if (this.disposed || !(item === null || item === void 0 ? void 0 : item.wkt))
            return;
        this.clearHighlight();
        const geometry = toViewGeometry(parseParcelWkt(item.wkt));
        const feature = new Feature({ geometry, kind: 'parcel' });
        this.source.addFeature(feature);
        // 19.33.0: kadr z sąsiedztwem — działka zajmuje ok. 1/3 widoku (zapas 40% jej rozmiaru z każdej strony),
        // najbliżej z18,5 (ok. 1:1 000). Wcześniej mała działka wypełniała cały ekran i nie było widać ulicy ani sąsiadów.
        const [minX, minY, maxX, maxY] = geometry.getExtent();
        const margin = Math.max(maxX - minX, maxY - minY) * 0.4;
        this.host.fitExtent([minX - margin, minY - margin, maxX + margin, maxY + margin], {
            maxZoom: 18.5,
            duration: 340,
            padding: [90, 90, 90, 90],
        });
        // 19.8.5: obrys wybranej działki zostaje na mapie (do następnego wyszukiwania albo
        // wyczyszczenia pola) — wcześniej znikał po 12 s (audyt UX B10).
        return interiorPoint(geometry);
    }
}
