/*
 * msportal — AWARYJNE WYŁĄCZENIE trybu offline. Skopiuj ten plik na serwer jako sw.js (w katalogu portalu).
 * Przy następnym wejściu przeglądarki usuną zapamiętane pliki i wyrejestrują service workera,
 * a otwarte karty przeładują się z serwera.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('msportal-')) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
