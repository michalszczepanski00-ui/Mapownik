/*
 * msportal 19.46.0 — skrypt startowy (zwykły skrypt, nie moduł; ładowany przed aplikacją).
 *
 * Od 19.42.0 kod aplikacji jest budowany narzędziem Vite do kilku plików w assets/build/ o nazwach
 * z sumą treści. Ten plik zastępuje dawny skrypt wbudowany w index.html (CSP: bez skryptów inline):
 *  - ustawia numer wydania (window.__MAPOWNIK_DEPLOY_VERSION__, używa go zapis projektu i diagnostyka),
 *  - obsługuje link „Przejdź do wyszukiwarki”,
 *  - gdy aplikacja nie wystartuje (brak pliku po niepełnym wgraniu, błąd kodu), pokazuje komunikat
 *    z tym, co zrobić, zamiast pustego ekranu „Wczytywanie mapy…”.
 */
(function () {
  'use strict';
  var VERSION = '19.46.0';
  window.__MAPOWNIK_DEPLOY_VERSION__ = VERSION;
  window.__MAPOWNIK_BOOTED__ = false;
  var shown = false;

  function showError(title, detail, action) {
    if (shown) return;
    var root = document.getElementById('root');
    if (!root) return;
    shown = true;
    var box = document.createElement('div');
    box.style.cssText = 'font-family:Segoe UI,Arial,sans-serif;max-width:820px;margin:48px auto;padding:24px;border:1px solid #f3b4b4;border-radius:12px;background:#fff;color:#18202c';
    var heading = document.createElement('h2'); heading.style.marginTop = '0'; heading.textContent = title; box.appendChild(heading);
    var pre = document.createElement('pre'); pre.style.cssText = 'white-space:pre-wrap;background:#f7f7f8;padding:12px;border-radius:8px'; pre.textContent = detail; box.appendChild(pre);
    var links = [['./verify-deployment.php', 'Sprawdź wdrożenie (verify-deployment.php)'], ['./diagnostyka.html', 'Otwórz diagnostykę']];
    if (action) links.unshift(action);
    for (var i = 0; i < links.length; i++) {
      var p = document.createElement('p'); var a = document.createElement('a');
      a.href = links[i][0]; a.textContent = links[i][1]; p.appendChild(a); box.appendChild(p);
    }
    var v = document.createElement('p'); v.style.cssText = 'color:#667085;font-size:13px'; v.textContent = 'Wersja: ' + VERSION; box.appendChild(v);
    root.replaceChildren(box);
  }

  // Plik aplikacji albo arkusz stylów się nie wczytał (zdarzenie „error” elementu nie dociera do window.onerror,
  // stąd nasłuch w fazie przechwytywania).
  window.addEventListener('error', function (event) {
    var el = event.target;
    if (!el || el === window || window.__MAPOWNIK_BOOTED__) return; // po starcie błędy obsługuje aplikacja
    var tag = (el.tagName || '').toUpperCase();
    if ((tag === 'SCRIPT' && el.type === 'module') || (tag === 'LINK' && /stylesheet|modulepreload/.test(el.rel || ''))) {
      var url = el.src || el.href || '';
      showError('Niepełna aktualizacja na serwerze',
        'Nie udało się wczytać pliku aplikacji:\n' + url +
        '\n\nWgraj ponownie z paczki ' + VERSION + ' (opcja „nadpisz zawsze”) plik index.html oraz cały katalog assets/build/, ' +
        'a potem odśwież stronę (Ctrl+F5). Plików z poprzednich wersji w assets/build/ nie trzeba usuwać.');
    }
  }, true);

  // Błąd kodu przed pierwszym renderem.
  function early(reason) {
    if (window.__MAPOWNIK_BOOTED__) return;
    setTimeout(function () { if (!window.__MAPOWNIK_BOOTED__) showError('Mapownik nie wystartował', String(reason)); }, 50);
  }
  window.addEventListener('error', function (event) { if (event.target === window || !event.target || !event.target.tagName) early(event.message || event.error); });
  window.addEventListener('unhandledrejection', function (event) { early(event.reason && event.reason.stack || event.reason); });

  // Nic się nie dzieje (np. zablokowany skrypt): komunikat po 45 s zamiast wiecznego „Wczytywanie mapy…”.
  setTimeout(function () {
    if (!window.__MAPOWNIK_BOOTED__) showError('Mapownik nie wystartował', 'Aplikacja nie uruchomiła się w ciągu 45 sekund. Sprawdź połączenie i odśwież stronę (Ctrl+F5).');
  }, 45000);

  // 19.43.0: tryb offline — service worker (sw.js, generowany przy budowaniu) zapamiętuje aplikację.
  // Tylko na HTTPS albo localhost (wymóg przeglądarek); ?sw=0 w adresie pomija rejestrację (diagnoza).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) && !/[?&]sw=0\b/.test(location.search)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (error) { console.warn('msportal: tryb offline niedostępny', error); });
    });
  }

  // Informacja o braku połączenia (projekt nadal zapisuje się w przeglądarce).
  function offlineBanner() {
    var id = 'msportal-offline';
    var existing = document.getElementById(id);
    if (navigator.onLine) { if (existing) existing.remove(); return; }
    if (existing || !document.body) return;
    var el = document.createElement('div');
    el.id = id; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:9999;max-width:min(560px,92vw);padding:8px 14px;border-radius:10px;background:#3b2f0b;color:#fff8e1;font:13px/1.35 Inter,Segoe UI,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)';
    el.textContent = 'Brak połączenia z internetem — mapy i dane z usług są niedostępne. Projekt nadal zapisuje się w tej przeglądarce.';
    document.body.appendChild(el);
  }
  window.addEventListener('online', offlineBanner);
  window.addEventListener('offline', offlineBanner);

  document.addEventListener('DOMContentLoaded', function () {
    offlineBanner();
    var link = document.querySelector('.skip-link');
    if (link) link.addEventListener('click', function (event) {
      var input = document.getElementById('map-search-input');
      if (input) { event.preventDefault(); input.focus(); }
    });
  });
})();
