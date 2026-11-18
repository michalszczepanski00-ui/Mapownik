// msportal 19.51.0 — środowisko diagnostyki budowanej przez Vite (drugie wejście obok index.html).
//
// 1. diagFetch: zapytania o pliki źródłowe (app-<wersja>/…, assets/css/…) obsługuje z tekstów dołączonych
//    w budowaniu (diag/zrodla.js); wszystko inne idzie do serwera bez zmian. Diagnostyka zastępuje nim
//    globalne fetch (const fetch = diagFetch), więc dawne testy działają bez przepisywania.
// 2. ensureOlGlobal: część testów sprawdza klasy przez window.ol (dawniej vendor/static/openlayers.js).
//    Teraz to te same klasy z pakietu npm „ol”, z których korzysta aplikacja.
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import ImageWMS from 'ol/source/ImageWMS.js';
import TileWMS from 'ol/source/TileWMS.js';
import VectorSource from 'ol/source/Vector.js';

const ZRODLO = /^(app-\d+\.\d+\.\d+\/.+|assets\/css\/[^/]+\.css)$/;
let zrodla = null;

function sciezkaWzgledna(input) {
  const url = new URL(typeof input === 'string' ? input : input?.url ?? String(input), location.href);
  const baza = new URL('.', location.href);
  if (url.origin !== baza.origin || !url.pathname.startsWith(baza.pathname)) return null;
  return decodeURIComponent(url.pathname.slice(baza.pathname.length));
}

export async function diagFetch(input, init) {
  const sciezka = sciezkaWzgledna(input);
  if (sciezka && ZRODLO.test(sciezka)) {
    zrodla ??= (await import('./zrodla.js')).ZRODLA;
    const tresc = zrodla.get(sciezka);
    const typ = sciezka.endsWith('.css') ? 'text/css' : 'text/javascript';
    if (tresc == null) return new Response('Brak pliku w źródłach wydania: ' + sciezka, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (String(init?.method || '').toUpperCase() === 'HEAD') return new Response(null, { status: 200, headers: { 'content-type': typ } });
    return new Response(tresc, { status: 200, headers: { 'content-type': typ + '; charset=utf-8', 'x-diag-source': 'build' } });
  }
  return globalThis.fetch(input, init);
}

/** Lista ścieżek dołączonych źródeł (do testów, które przeglądają cały katalog aplikacji). */
export async function listaZrodel() {
  zrodla ??= (await import('./zrodla.js')).ZRODLA;
  return [...zrodla.keys()];
}

export function ensureOlGlobal() {
  if (window.ol?.Map) return;
  window.ol = {
    Map: OlMap,
    View,
    layer: { Image: ImageLayer, Tile: TileLayer, Vector: VectorLayer },
    source: { ImageWMS, TileWMS, Vector: VectorSource },
  };
}
