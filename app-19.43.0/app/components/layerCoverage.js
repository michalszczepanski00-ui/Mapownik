import { useEffect, useRef, useState } from 'react';
import { useService } from '../services/AppServicesContext.js';
import { useAppSelector } from '../../store/index.js';
import { dataCatalog } from '../../data/catalog/index.js';
import { readCoverage, writeCoverage, coverageFromImage, COVERAGE_INVALIDATED } from '../../data/sources/coverageCache.js';

/**
 * 19.14.0 — „dane w widoku” dla warstw planistycznych (MPZP, POG).
 *
 * Usługi WMS nie mówią, czy w kadrze coś jest, więc po zatrzymaniu mapy
 * panel pobiera dla każdej warstwy JEDEN mały obraz całego widoku przez
 * własne proxy (`./api/wms.php?source=…` — ta sama droga i to samo łączenie
 * źródeł co mapa) i sprawdza, czy ma choć jeden nieprzezroczysty piksel.
 *
 * Koszty pod kontrolą: tylko przy otwartym panelu warstw, tylko warstwy
 * z `PROBE_GROUP` i tylko w ich zakresie skali, najwyżej dwa zapytania naraz,
 * obraz do 384 px, wynik zapamiętany dla kadru (zaokrąglony bbox).
 * Obraz jest mniejszy niż mapa, więc skala zapytania jest drobniejsza —
 * wynik to przybliżenie („dane w widoku”, nie dowód braku planu).
 */
export const PROBE_GROUP = 'Planowanie przestrzenne';
// 19.37.2: było 384 px. Próbka w skali kilka razy drobniejszej niż mapa wypadała poza zakres skali usługi
// (strefy POG z GUGiK rysują się do ok. 1:100 000) i była pusta, choć na mapie strefy były.
const MAX_SIDE = 1024;
// Rysunek MPZP z integracji (serwery gmin) zależy od skali — na pomniejszonym obrazie
// bywa pusty, choć na mapie plan jest. Bez kropki zamiast fałszywego „brak”;
// o obecności planu mówią warstwy obszarów MPZP z Rejestru Urbanistycznego.
const SKIP = new Set(['overlay.mpzp']);
const CONCURRENCY = 2;
const DEBOUNCE_MS = 900;
const TIMEOUT_MS = 15000;
/**
 * 19.31.0: źródło, które nie odpowiedziało (błąd, przekroczenie czasu, zastępczy kafel), odpoczywa 2 minuty.
 * Wcześniej każde przesunięcie mapy pytało je od nowa — niedziałający Rejestr Urbanistyczny zajmował oba
 * miejsca w kolejce (po ~10 s na zapytanie), pozostałe warstwy nie dostawały wyniku, a serwer trzymał
 * procesy PHP do limitu czasu usługi.
 */
const FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
const failedUntil = new Map();
const coolingDown = (layerId) => (failedUntil.get(layerId) ?? 0) > Date.now();
/** Warstwy, dla których zapytanie jeszcze trwa — nowy kadr nie wysyła drugiego. */
const inFlight = new Set();
// Cache lives in the bounded shared coverageCache module.
// Migawka LayerManagera nie niesie opisu źródła — adres proxy bierzemy z katalogu.
const SOURCES = new Map(dataCatalog.layers.map((definition) => [definition.id, definition.source]));

function probeUrl(source, bbox, width, height) {
    const url = new URL(source.url, window.location.href);
    url.searchParams.set('SERVICE', 'WMS');
    url.searchParams.set('REQUEST', 'GetMap');
    url.searchParams.set('VERSION', source.version || '1.1.1');
    url.searchParams.set('FORMAT', 'image/png');
    url.searchParams.set('TRANSPARENT', 'true');
    url.searchParams.set('STYLES', '');
    url.searchParams.set('LAYERS', source.layers || '');
    url.searchParams.set(source.version === '1.3.0' ? 'CRS' : 'SRS', 'EPSG:3857');
    url.searchParams.set('BBOX', bbox.map((value) => value.toFixed(1)).join(','));
    url.searchParams.set('WIDTH', String(width));
    url.searchParams.set('HEIGHT', String(height));
    url.searchParams.set('probe', '1');
    return url.toString();
}

async function hasPixels(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(bitmap.width, bitmap.height) : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return true;
        return false;
    } finally { bitmap.close?.(); }
}

async function probe(layer, bbox, width, height, signal) {
    const response = await fetch(probeUrl(SOURCES.get(layer.id), bbox, width, height), { signal, cache: 'default' });
    if (!response.ok || !/^image\//.test(response.headers.get('content-type') || '')) throw new Error(`HTTP ${response.status}`);
    // 19.18.0: kafel zastępczy serwera (źródło nie odpowiedziało, brak kopii) to 1 × 1 px —
    // nie jest dowodem danych ani ich braku.
    if (/FALLBACK/i.test(response.headers.get('x-msportal-cache') || '')) throw new Error('fallback');
    const found = await hasPixels(await response.blob());
    return coverageFromImage(found, response.headers);
}

/**
 * Zwraca obiekt { [layerId]: 'yes' | 'no' | 'loading' | 'unknown' } dla warstw
 * z grupy planistycznej. Warstwy poza zakresem skali nie mają wpisu.
 */
export function useLayerCoverage(layers, enabled) {
    const controller = useService('mapController');
    const center = useAppSelector((state) => state.mapView.center3857);
    const zoom = useAppSelector((state) => state.mapView.zoom);
    const [result, setResult] = useState({});
    const run = useRef(0);
    const [viewportRevision, setViewportRevision] = useState(0);
    useEffect(() => {
        const map = controller?.map;
        const update = () => setViewportRevision((value) => value + 1);
        map?.on('change:size', update);
        window.addEventListener(COVERAGE_INVALIDATED, update);
        return () => { map?.un('change:size', update); window.removeEventListener(COVERAGE_INVALIDATED, update); };
    }, [controller]);
    const candidates = enabled ? layers.filter((layer) => {
        const source = SOURCES.get(layer.id);
        return layer.group === PROBE_GROUP && !SKIP.has(layer.id) && source?.kind === 'wms' && String(source.url ?? '').includes('source=');
    }) : [];
    const key = candidates.map((layer) => layer.id).join(',');

    useEffect(() => {
        const map = controller?.map;
        if (!enabled || !map || !candidates.length) { setResult({}); return undefined; }
        const id = ++run.current;
        const abort = new AbortController();
        const timer = window.setTimeout(async () => {
            const size = map.getSize();
            if (!size?.[0] || !size?.[1]) return;
            const bbox = map.getView().calculateExtent(size);
            const ratio = Math.min(1, MAX_SIDE / Math.max(size[0], size[1]));
            const width = Math.max(32, Math.round(size[0] * ratio));
            const height = Math.max(32, Math.round(size[1] * ratio));
            const bboxKey = bbox.map((value) => Math.round(value / 50)).join(',') + `|${width}x${height}`;
            const inScale = candidates.filter((layer) => !(Number.isFinite(layer.minZoom) && zoom <= layer.minZoom) && !(Number.isFinite(layer.maxZoom) && zoom > layer.maxZoom));
            const next = {};
            const pending = [];
            for (const layer of inScale) {
                const cached = readCoverage(`${layer.id}|${bboxKey}`);
                if (cached) next[layer.id] = cached;
                // 19.37.2: trwające zapytanie z poprzedniego kadru to „sprawdzanie”, nie błąd źródła.
                else if (inFlight.has(layer.id)) { next[layer.id] = 'loading'; pending.push(layer); }
                else if (coolingDown(layer.id)) next[layer.id] = 'unknown';
                else { next[layer.id] = 'loading'; pending.push(layer); }
            }
            if (run.current !== id) return;
            setResult(next);
            const queue = [...pending];
            const worker = async () => {
                while (queue.length && !abort.signal.aborted) {
                    const layer = queue.shift();
                    // 19.37.2: poczekaj na zapytanie z poprzedniego kadru (bez drugiego zapytania naraz o tę samą warstwę).
                    while (inFlight.has(layer.id) && !abort.signal.aborted) await new Promise((resolve) => window.setTimeout(resolve, 250));
                    if (abort.signal.aborted) return;
                    if (coolingDown(layer.id)) { if (run.current === id) setResult((current) => ({ ...current, [layer.id]: 'unknown' })); continue; }
                    const cachedNow = readCoverage(`${layer.id}|${bboxKey}`);
                    if (cachedNow) { if (run.current === id) setResult((current) => ({ ...current, [layer.id]: cachedNow })); continue; }
                    // 19.31.0: zmiana kadru NIE przerywa trwającego zapytania — serwer i tak czeka na odpowiedź
                    // źródła, a nowe zapytanie o tę samą warstwę tylko by się dołożyło. Przerywa je limit czasu.
                    // Wynik zostaje zapamiętany dla kadru, o który pytaliśmy; błąd włącza przerwę dla warstwy.
                    const request = new AbortController();
                    const timeout = window.setTimeout(() => request.abort(), TIMEOUT_MS);
                    inFlight.add(layer.id);
                    let value = 'unknown';
                    try {
                        value = await probe(layer, bbox, width, height, request.signal);
                        failedUntil.delete(layer.id);
                        writeCoverage(`${layer.id}|${bboxKey}`, value);
                    } catch {
                        value = 'unknown';
                        failedUntil.set(layer.id, Date.now() + FAILURE_COOLDOWN_MS);
                    }
                    finally {
                        window.clearTimeout(timeout);
                        inFlight.delete(layer.id);
                    }
                    if (run.current !== id || abort.signal.aborted) return;
                    setResult((current) => ({ ...current, [layer.id]: value }));
                }
            };
            await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        }, DEBOUNCE_MS);
        return () => { ++run.current; window.clearTimeout(timer); abort.abort(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, controller, key, center?.[0], center?.[1], zoom, viewportRevision]);
    return result;
}
