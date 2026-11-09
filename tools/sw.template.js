/*
 * msportal — service worker (tryb offline). PLIK GENEROWANY przez tools/build.mjs z tools/sw.template.js.
 *
 * Co działa bez internetu: aplikacja się otwiera, projekt (IndexedDB) można przeglądać, rysować i zapisywać
 * do pliku. Czego nie ma bez internetu: podkładów i warstw map, karty działki, raportów — to dane z usług.
 *
 * Zasady:
 *  - strona (index.html) — najpierw sieć (max 4 s), bez sieci zapamiętana kopia: po wdrożeniu nowej wersji
 *    użytkownik z siecią zawsze dostaje nową stronę;
 *  - assets/build/* — z pamięci (nazwy plików zawierają sumę treści, więc się nie zmieniają); wszystkie
 *    pliki paczki są zapamiętywane przy instalacji;
 *  - api/, kafle map (inne domeny), diagnostyka, app-*, vendor/ — zawsze z sieci, bez zapamiętywania.
 * Awaryjne wyłączenie: zastąp na serwerze sw.js plikiem assets/sw-wylacz.js (instrukcja w ZMIANY_19.43.0.md).
 */
const VERSION = '__VERSION__';
const CACHE = `msportal-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('msportal-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const scopeUrl = new URL(self.registration.scope);
const inScope = (url) => url.origin === scopeUrl.origin && url.pathname.startsWith(scopeUrl.pathname);
const rel = (url) => url.pathname.slice(scopeUrl.pathname.length);

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (response.ok && response.type === 'basic') await cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const update = fetch(request).then((response) => { if (response.ok) void cache.put(request, response.clone()); return response; }).catch(() => hit);
  return hit || update;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!inScope(url)) return; // kafle i usługi zewnętrzne — bez udziału service workera
  const path = rel(url);
  if (request.mode === 'navigate') {
    // Tylko strona aplikacji; diagnostyka, monitor i pliki PHP idą prosto do serwera.
    if (path === '' || path === 'index.html') event.respondWith(networkFirstPage(request));
    return;
  }
  if (path.startsWith('assets/build/')) { event.respondWith(cacheFirst(request)); return; }
  if (path === 'assets/js/boot.js' || path === 'manifest.webmanifest' || path.startsWith('assets/icons/')) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
