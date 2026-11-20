# msportal 19.30.0 — nowe widoki mapy

Zawiera też zmiany z 19.28.0 (layout) i 19.29.0 (ceny transakcyjne RCN).

## Nowe podkłady (przełącznik podkładów w rogu mapy, na telefonie: Warstwy → Typ mapy)
- **Pastel szczegółowy** („Pastel”) — mapa OpenStreetMap w stonowanych barwach. Pokazuje:
  - budynki z wyraźnym obrysem i numery adresowe przy dużym zbliżeniu;
  - wszystkie sklepy, lokale i przystanki;
  - przeznaczenie terenu (usługi, handel, przemysł).
  Spokojne tło pod MPZP, POG i uzbrojenie.
- **Zmierzch grafitowy szczegółowy** („Zmierzch”) — ta sama szczegółowość na ciemnym, grafitowo-niebieskim tle,
  do pracy wieczorem i przy ciemnym motywie.
- **Kartograficzny** („Karto”) — styl mapy topograficznej:
  - warstwice z opisem wysokości (gęstsze przy zbliżeniu: co 50 / 20 / 10 / 5 m);
  - cieniowanie rzeźby;
  - siatka współrzędnych z opisami;
  - ciemne budynki, drogi z obwiednią, cieki niebieską linią.

Nazwy miejscowości są po polsku (np. „Królewiec”, „Wałbrzych”), a napisy w czcionce portalu.

## Nowa nakładka: Nachylenie terenu (spadki %)
- **Gdzie:** panel Warstw → grupa „Rzeźba i wysokości”. Działa na każdym podkładzie, także na Kartograficznym.
- **Kolory** (w opisie warstwy pod „i”):

  | Spadek | Kolor |
  |---|---|
  | 2–5% | jasnozielony |
  | 5–10% | zielony |
  | 10–15% | żółty |
  | 15–25% | pomarańczowy |
  | 25–40% | czerwony |
  | powyżej 40% | purpurowy |

- **Zakres:** widoczna od skali ok. 1:670 000 (zoom 9).

## Dane i ograniczenia
- **Mapa:** OpenStreetMap z bezpłatnej usługi OpenFreeMap (bez klucza i limitu wyświetleń; atrybucja
  OpenStreetMap / OpenMapTiles / OpenFreeMap na mapie).
- **Warstwice, cieniowanie i nachylenie:** liczone w przeglądarce z otwartego modelu wysokości AWS Terrain Tiles
  (ok. 30 m). Pokazują stoki i skarpy, nie drobne nasypy. Dokładny spadek działki da profil terenu
  (NMT GUGiK 1 m), który portal już ma.
- **Eksport PNG** jest składany na serwerze z usług WMS:
  - przy nowych podkładach, jak przy obecnej mapie OSM, eksport proponuje Topografię albo eksport bez podkładu;
  - nakładka „Nachylenie terenu” jest w eksporcie pomijana (portal o tym uprzedza).
  Eksport „tak jak na ekranie” — możliwy w następnej wersji.

## Technicznie
- Nowe biblioteki w `vendor/opt/`, ładowane dopiero po wybraniu podkładu lub warstwy (opis w `vendor/opt/README.txt`):
  - `ol-mapbox-style.js` (13.5.1, BSD-2);
  - `maplibre-contour.js` (0.1.0, BSD-3).
- Nowe nakładki modułów OpenLayers w `vendor/ol-esm/` (z pełnej biblioteki OpenLayers 10.10, bez zmiany wersji).
- Nowe rodzaje źródeł w katalogu:
  - `vector-style` (podkład wektorowy z paletą);
  - `dem` (warstwa z modelu wysokości).
- Miniatury podkładów: `assets/basemaps/`.
- Rozwinięty przełącznik podkładów układa się w dwóch rzędach; pasek narzędzi, skala i karta odsuwają się,
  więc nic się nie nakłada.
- Diagnostyka: nowy test „19.30.0 — podkłady wektorowe OSM i nachylenie terenu”.

## Wgranie
1. Wgraj `aktualizuj-19.30.php` i otwórz go w przeglądarce. Skrypt dopisze nową wersję obok obecnej
   i zmieni numery wersji w plikach serwera.
2. Wgraj pozostałe pliki z paczki, nadpisując:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`;
   - `assets/css/36-latwa-obsluga.css`;
   - nowy katalog `assets/basemaps/`;
   - katalog `app-19.30.0/`;
   - `api/rcn.php`;
   - nowe pliki w `vendor/opt/` i `vendor/ol-esm/` (w tym `vendor/ol-esm/proj.js`).

   Alternatywa: pełna paczka.
3. Ctrl+F5. Sprawdź:
   - przełącznik podkładów → Pastel, Zmierzch, Karto;
   - Warstwy → „Nachylenie terenu”.
4. Otwórz `aktualizuj-19.30.php?sprzatanie=1`.
5. `verify-deployment.php` → `"deployment_consistent": true`.

## Poprawka 1 (31.10.2026) — mapa nie startowała u osób, które wcześniej otwierały portal
- **Objaw:** „SyntaxError: The requested module 'ol/proj.js' does not provide an export named 'equivalent'”.
  Mapa i część diagnostyki nie startowały.
- **Przyczyna:** 19.30.0 zmieniło plik `vendor/ol-esm/proj.js` bez zmiany jego adresu. Pliki w `vendor/`
  przeglądarka trzyma przez rok bez pytania serwera, więc u każdego, kto otwierał portal przed
  aktualizacją, został stary plik.
- **Naprawa:**
  - nakładki modułów OpenLayers są teraz w nowym katalogu `vendor/ol-esm-2/` (nowy adres, więc
    przeglądarki pobiorą je od nowa);
  - `index.html` i `diagnostyka.html` wskazują nowy katalog.
- **Zabezpieczenie na przyszłość:** `tools/check_release.py` porównuje pliki `vendor/` z `tools/vendor-lock.json`
  i nie przepuści wydania, w którym plik biblioteki zmienił treść pod tym samym adresem.
- Kod aplikacji (`app-19.30.0/`) i pliki serwera bez zmian; numer wersji bez zmian.

### Wgranie poprawki
1. Wgraj katalog `vendor/ol-esm-2/` (w całości).
2. Wgraj i nadpisz `index.html`, `diagnostyka.html`, `vendor/.htaccess`.
3. Otwórz portal zwykłym odświeżeniem, bez Ctrl+F5, tak jak zrobi to inny użytkownik, i sprawdź,
   czy mapa startuje. Potem uruchom `diagnostyka.html`.
4. Po kilku dniach możesz usunąć stary katalog `vendor/ol-esm/`. Do tego czasu nie przeszkadza: przyda się
   komuś, kto ma jeszcze otwartą starą kartę.
