/**
 * 19.43.0 — wyszukiwanie po współrzędnych (audyt 19.31.0, rekomendacja R1 / F1).
 *
 * Rozpoznaje wpis w polu wyszukiwania i zwraca listę miejsc do wyboru (bez zapytań do sieci):
 *  - WGS84 w stopniach dziesiętnych: „52.2297, 21.0122”, „52,2297 21,0122”, „21.0122 52.2297” (kolejność
 *    rozpoznawana po zakresie Polski), z literami N/E albo bez;
 *  - stopnie, minuty, sekundy: „52°13'47"N 21°00'44"E”, „52 13 47 N, 21 0 44 E”;
 *  - link Google Maps (…/@52.2297,21.0122,15z, ?q=52.2297,21.0122, !3d52.2297!4d21.0122);
 *  - PUWG 1992 (EPSG:2180) w metrach: „486518.56 637371.20” — obie konwencje kolejności osi
 *    (geodezyjna X = północ, Y = wschód oraz GIS x = wschód, y = północ), jeśli obie wypadają w Polsce.
 */
import { transform } from 'ol/proj.js';
import { ensureProjectProjectionRegistered } from '../projections/index.js';

// Zasięg Polski z niewielkim zapasem (stopnie).
const PL = { minLon: 13.9, maxLon: 24.3, minLat: 48.9, maxLat: 55.0 };
const inPoland = (lon, lat) => lon >= PL.minLon && lon <= PL.maxLon && lat >= PL.minLat && lat <= PL.maxLat;
const fmt = (value, digits) => value.toFixed(digits).replace('.', ',');

function wgsItem(lat, lon, source) {
    return {
        _kind: 'coordinate', id: `coord:${lat.toFixed(6)},${lon.toFixed(6)}`, lon, lat,
        label: `${fmt(lat, 5)}° N, ${fmt(lon, 5)}° E`,
        meta: `${source} · sprawdź działkę w tym miejscu`,
    };
}

function puwgItem(easting, northing, convention) {
    ensureProjectProjectionRegistered();
    const [lon, lat] = transform([easting, northing], 'EPSG:2180', 'EPSG:4326');
    if (!inPoland(lon, lat)) return null;
    return {
        _kind: 'coordinate', id: `coord2180:${easting.toFixed(2)},${northing.toFixed(2)}`, lon, lat,
        label: `PUWG 1992: X ${fmt(northing, 2)} m, Y ${fmt(easting, 2)} m`,
        meta: `${convention} · ${fmt(lat, 5)}° N, ${fmt(lon, 5)}° E`,
    };
}

/** Para liczb w kolejności wpisania, z kropką albo przecinkiem dziesiętnym. */
function numberPair(text) {
    const dot = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
    if (dot) return [Number(dot[1]), Number(dot[2])];
    const comma = /^\s*(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)\s*$/.exec(text);
    if (comma) return [Number(comma[1].replace(',', '.')), Number(comma[2].replace(',', '.'))];
    return null;
}

/** Stopnie-minuty-sekundy z literą półkuli (N/S/E/W) albo bez. */
function dmsPair(text) {
    const part = String.raw`(\d{1,3})\s*[°º\s]\s*(\d{1,2})\s*['′\s]\s*(\d{1,2}(?:[.,]\d+)?)?\s*(?:["″]|'')?\s*([NSEW])?`;
    const m = new RegExp(String.raw`^\s*([NSEW])?\s*${part}\s*[,;]?\s*([NSEW])?\s*${part}\s*$`, 'i').exec(text);
    if (!m) return null;
    const value = (d, mi, s) => Number(d) + Number(mi) / 60 + Number(String(s ?? 0).replace(',', '.')) / 3600;
    const a = { v: value(m[2], m[3], m[4]), h: (m[1] || m[5] || '').toUpperCase() };
    const b = { v: value(m[7], m[8], m[9]), h: (m[6] || m[10] || '').toUpperCase() };
    if (a.h === 'E' || a.h === 'W' || b.h === 'N' || b.h === 'S') return { lat: b.v * (b.h === 'S' ? -1 : 1), lon: a.v * (a.h === 'W' ? -1 : 1) };
    return { lat: a.v * (a.h === 'S' ? -1 : 1), lon: b.v * (b.h === 'W' ? -1 : 1) };
}

function googleMapsLink(text) {
    if (!/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) return null;
    const place = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(text); // dokładny punkt wskazanego miejsca
    const query = /[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i.exec(text);
    const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(text);
    const m = place || query || at;
    return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
}

/** Lista miejsc dla wpisu albo [] (wpis nie jest współrzędnymi w Polsce). */
export function parseCoordinateQuery(input) {
    const text = String(input ?? '').trim();
    if (text.length < 5 || text.length > 2000) return [];

    const link = googleMapsLink(text);
    if (link) return inPoland(link.lon, link.lat) ? [wgsItem(link.lat, link.lon, 'Link Google Maps')] : [];

    // Litery półkuli przy liczbach dziesiętnych („N52.2297 E21.0122”, „52.2297N, 21.0122E”).
    const stripped = text.replace(/(^|[\s,;])[NE]\s*(?=-?\d)|(?<=\d)\s*[NE](?=$|[\s,;])/gi, '$1');
    const pair = numberPair(stripped);
    if (pair) {
        const [a, b] = pair;
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
            if (inPoland(b, a)) return [wgsItem(a, b, 'WGS84')];
            if (inPoland(a, b)) return [wgsItem(b, a, 'WGS84 (długość, szerokość)')];
            return [];
        }
        if (a > 100000 && b > 100000) {
            // Geodezyjnie X = północ (pierwsza liczba); w programach GIS zwykle x = wschód.
            const items = [];
            for (const item of [puwgItem(b, a, 'X = północ, Y = wschód'), puwgItem(a, b, 'x = wschód, y = północ')]) {
                if (item && !items.some((other) => other.id === item.id)) items.push(item);
            }
            return items;
        }
        return [];
    }
    const dms = dmsPair(text);
    if (dms && inPoland(dms.lon, dms.lat)) return [wgsItem(dms.lat, dms.lon, 'WGS84 (stopnie, minuty, sekundy)')];
    return [];
}
