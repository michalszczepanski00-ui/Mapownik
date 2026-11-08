# msportal 19.41.4 — audyt funkcjonalności, bezpieczeństwa i stabilności

**Zakres:** pełna paczka `msportal-19.41.4-pelna.zip` (517 plików): backend PHP (`api/`, `cron/`, skrypty w katalogu głównym), frontend (`app-19.41.4/`, 230 modułów ESM), biblioteki (`vendor/`), konfiguracja Apache (`.htaccess`).
**Data:** 08.11.2026
**Metoda:**
- przegląd kodu wszystkich endpointów PHP i miejsc w JS, gdzie dane z zewnątrz trafiają do interfejsu;
- uruchomienie testów dołączonych do paczki;
- test dymny: portal na lokalnym serwerze PHP 8.3 w Chromium (desktop 1440×900 i telefon 390×844).

Działania usług zewnętrznych (GUGiK, GDOŚ, RCN, BDL itd.) na produkcji nie sprawdzałem. Ścieżki plików w raporcie są względne do katalogu paczki.


> **Status po poprawkach 19.41.4-b (08.11.2026)** — szczegóły i instrukcja wgrania: `ZMIANY_19.41.4-b.md`.
>
> | Punkt | Status |
> |---|---|
> | B1 eksport | **naprawione:** limit pod blokadą, limit prób, 2 eksporty naraz, limity geometrii |
> | B2 cache | **naprawione** dla „Czyj las”, RCN, Nominatim i plików limitów; `api/wms.php`: limit 3 GiB nadal egzekwowany raz na dobę |
> | B3 udostępnianie | **naprawione:** walidacja struktury, zapis znormalizowany, limit /64 i dobowy |
> | B4 biblioteki | **naprawione:** przypięte SHA-256, `setup-vendors.php` tylko CLI |
> | B5 nagłówki | **naprawione:** CSP z sumami, Permissions-Policy, HSTS, `Options -Indexes`, `data/.htaccess` |
> | B6 ujawnianie informacji | **naprawione** dla dokumentacji, raportów, `api/_*.php`, wersji PHP i komunikatów błędów; `diagnostyka.html` i `verify-deployment.php` celowo zostają publiczne |
> | B7 cURL | **naprawione** |
> | B8 tryb administratora | bez zmian (to nie luka) |
> | Z1 inwestorzy RWDZ | **naprawione:** osoby fizyczne ukryte; przełącznik `PERMITS_SHOW_PERSON_NAMES` |
> | Z2 polityka prywatności | **otwarte:** wymaga tekstu prawnego |
> | Z3 Nominatim | serwer **naprawiony**; autouzupełnianie w przeglądarce **otwarte** (nowa wersja aplikacji) |
> | Z4 podkład OSM | **otwarte:** decyzja produktowa |
> | S1–S6, F1–F7 | **otwarte:** lokalne repozytorium git z historią zmian już istnieje, CI i reszta to osobne prace |

---

## 1. Podsumowanie

**Nie znalazłem podatności krytycznych:** brak SQL injection, otwartego proxy, XSS, path traversal, XXE i wykonania kodu.
- Backend konsekwentnie stosuje allowlisty źródeł, zapytania parametryzowane (PDO), walidację współrzędnych i rozmiarów, `atomic_write` i blokady plików.
- Frontend renderuje wszystko przez React, bez `innerHTML`. Jedyny wyjątek to `diagnostyka.html`, gdzie dane przechodzą przez `escapeHtml`.

**Główne ryzyka to dostępność, zgodność i proces wytwarzania, a nie włamanie:**

1. **Przeciążenie hostingu przez anonimowe żądania.** Eksport rastrowy, proxy „Czyj las” i udostępnianie projektów pozwalają jednej osobie zająć procesy PHP, dysk albo limit udostępnień.
2. **Rosnący bez końca cache** w części katalogów (`cache/forest`, `cache/rcn`, pliki limitów per IP). Na hostingu współdzielonym OVH to realna droga do wyczerpania dysku albo i-węzłów.
3. **Łańcuch dostaw bibliotek.** Publiczny `setup-vendors.php` po wykryciu brakującego pliku pobiera JS z esm.sh/jsDelivr. Wtedy sam tworzy manifest sum kontrolnych z tego, co pobrał (zaufanie przy pierwszym użyciu).
4. **RODO i regulaminy usług:**
   - imiona i nazwiska inwestorów z RWDZ w panelu i eksporcie CSV;
   - brak polityki prywatności;
   - autouzupełnianie przez Nominatim, którego regulamin zabrania;
   - domyślny podkład z `tile.openstreetmap.org`.
5. **Proces.** Paczka nie zawiera źródeł (TypeScript), części narzędzi i testów, do których odwołuje się dokumentacja. Pliki PHP serwera bywały „odtwarzane” (raport 19.31.0, p. 4). Wdrożenie odbywa się ręcznie przez FTP, a skrypt przepisuje numery wersji wyrażeniami regularnymi. To największe źródło ryzyka regresji.

**Stabilność kodu jest dobra.** Są bezpieczniki (circuit breaker) per źródło i host, budżety czasu, serwowanie ostatniego dobrego kafla, kontrola kompletności eksportu (409) i ograniczenia pamięci.

**Testy dołączone do paczki przechodzą wszystkie:**

| Test | Wynik |
|---|---|
| `php -l` na 39 plikach PHP | 0 błędów |
| `node --check` na 230 modułach aplikacji | 0 błędów |
| `tools/test_identify_parse.php` | 25/25 |
| `tools/test_wms_merge.php` | OK |
| `tools/check_release.py` | 0 błędów |
| Start w Chromium (desktop i telefon) | uruchamia się, 0 błędów konsoli, 0 odpowiedzi 4xx/5xx |

---

## 2. Bezpieczeństwo — ustalenia

Waga: **W** wysoka · **Ś** średnia · **N** niska. W tym portalu „wysoka” oznacza realną możliwość wyłączenia usługi albo problem prawny, a nie przejęcie serwera.

### B1 (W) Eksport rastrowy: limit częstotliwości można obejść, a jedno żądanie jest bardzo kosztowne
**Gdzie:**
- `api/export.php:70-86`: `enforce_export_rate_limit` tylko sprawdza;
- `api/export.php:89-101`: `record_export_success` zapisuje dopiero po udanym eksporcie;
- `:162`: wywołanie sprawdzenia;
- `:315-326`: pętla po pikselach dla otworów w poligonach;
- `:382`: pakiet do 64 kafli.

**Scenariusz:**
- N równoległych żądań z jednego IP przechodzi sprawdzenie, zanim którekolwiek zostanie zapisane.
- Eksporty zakończone 409 (niekompletne) w ogóle się nie liczą.
- Jedno żądanie pakietu (`mode=batch`) trzyma proces PHP do 300 s i wysyła setki do tysięcy zapytań GetMap: kafle × fragmenty 1536 px × do 21 źródeł.
- Obiekty z otworami pokrywającymi cały obraz uruchamiają pętlę `imagecolorat`/`imagesetpixel` po milionach pikseli na każdy otwór.
- Kilka takich żądań wyczerpuje pulę procesów PHP hostingu i portal przestaje odpowiadać wszystkim. Dodatkowo hosting obciąża usługi GUGiK, co grozi blokadą IP.

**Naprawa:**
- Zapis znacznika w tej samej blokadzie co sprawdzenie (rezerwacja). Zwolnienie rezerwacji przy 409 zamiast „liczenia tylko sukcesów”.
- Globalny semafor: maks. 1–2 eksporty naraz na cały serwer, jak `vps_guard_expensive` i `dem_acquire_slot`.
- Limit liczby otworów i wierzchołków na eksport.
- Rozważyć wyłączenie `batch` dla anonimowych użytkowników.

### B2 (W) Niekontrolowany wzrost cache na dysku
**Gdzie:**
- `api/forest.php:71-102`: proxy WMS „Czyj las” bez limitu częstotliwości. Dowolny BBOX i obraz do 2048×2048 dają nowy plik PNG na każdy unikalny BBOX. Pliki nie są nigdy usuwane: TTL jest sprawdzany tylko przy odczycie.
- `api/forest.php:110-111`: cache informacji z kluczem co 0,1 m.
- `api/rcn.php:61-67`: cache JSON co 25 m, też nigdy nieusuwany.
- `api/_common.php:682`: sprzątanie `maintain_map_cache()` obejmuje tylko `ortho`, `topography`, `wms`, `orthophoto` i `terrain-v2`.
- Pliki limitów per IP (`cache/shared-rate`, `cache/source-monitor/rate-*`, `cache/vps/rate-*`, `cache/dem/rate`) przybywają z każdym nowym adresem, a IPv6 daje ich nieograniczoną liczbę.
- `api/wms.php:44, 118`: kafle do 4096×4096 na dowolny BBOX. Limit 3 GiB jest egzekwowany tylko przy sprzątaniu raz na dobę (cron) albo raz na tydzień (zapas przez HTTP). Między przebiegami cache może przekroczyć limit konta.

**Scenariusz:** skrypt odpytuje `forest.php?wms=1` z losowymi BBOX-ami. Po wyczerpaniu miejsca albo i-węzłów przestają działać zapisy w całym portalu: cache kafli, udostępnione projekty, SQLite RWDZ i logi.

**Naprawa:**
- Dopisać `forest`, `rcn` i katalogi `rate*` do `maintain_map_cache()`.
- Wyrównać BBOX do siatki kafli (jak WMTS), żeby liczba możliwych kluczy była skończona.
- Dodać limit częstotliwości do `forest.php`.
- Sprawdzać wielkość cache także przy zapisie, np. licznik w pliku, a nie tylko w cronie.

### B3 (Ś) Udostępnianie projektu jako anonimowy magazyn plików
**Gdzie:** `api/shared_project.php:161-163` sprawdza tylko pola `format` i `objects`. Limity: 8 MB, 60 zapisów/h/IP, globalnie 5000 plików albo 512 MB. Odczyt `:142` odświeża datę wygaśnięcia.
**Potwierdzone lokalnie:** zapis `{"format":"mapownik-project","objects":[],"cokolwiek":"…"}` przechodzi i jest serwowany bez zmian.
**Scenariusz:**
- Kilka adresów IP zapełnia globalny limit.
- Od tego momentu „Udostępnij” zwraca 507 wszystkim użytkownikom do czasu ręcznego sprzątania. Atakujący może utrzymywać pliki przy życiu zwykłym GET.
- Domena firmy służy do przechowywania cudzych treści.

**Naprawa:**
- Walidacja schematu po stronie serwera: lista dozwolonych kluczy, typy geometrii, limit obiektów i długości tekstów.
- Limit na podsieć /64 dla IPv6.
- Limit całkowitego rozmiaru na IP i dobę.
- Docelowo udostępnianie tylko dla zalogowanych (patrz F2).

### B4 (Ś) Łańcuch dostaw: `setup-vendors.php` ufa temu, co pobierze
**Gdzie:**
- `.htaccess` jawnie dopuszcza `setup-vendors.php` przez WWW;
- `api/_vendor_builder.php:202-224` buduje manifest SHA-256 z pobranych właśnie plików;
- `index.html:167` przy błędzie startu i brakujących bibliotekach przekierowuje przeglądarkę na `setup-vendors.php?auto=1`.

**Scenariusz:**
- Wystarczy, że jeden plik w `vendor/static` nie przejdzie kontroli, np. przez niepełne wgranie FTP.
- Wtedy pierwsza osoba, która otworzy portal, uruchamia pobranie JS z esm.sh i jsDelivr.
- Treść nie jest porównywana ze stałą sumą, a odpowiedzi esm.sh (`?standalone&target=es2022`) nie są niezmienne.
- Przejęty CDN albo zmieniony build esm.sh w tym momencie oznacza wstrzyknięcie skryptu wszystkim użytkownikom.

**Naprawa:**
- Sumy SHA-256 wpisane na stałe w kodzie. Istnieje już `tools/vendor-lock.json`, tylko nie jest używany w czasie działania.
- `setup-vendors.php` tylko z CLI albo usunięty z produkcji, bo biblioteki i tak są w paczce.
- Usunąć przekierowanie `?auto=1` z `index.html`.

### B5 (Ś) Brak nagłówków ochronnych i katalogów zabezpieczonych „w głąb”
**Gdzie:** `.htaccess:23-27`.
**Braki:**
- `Content-Security-Policy`;
- `Strict-Transport-Security`;
- `Permissions-Policy`;
- `Options -Indexes`;
- usunięcie `X-Powered-By` (wersja PHP w każdej odpowiedzi API).

**Ochrona `data/`:**
- `data/` chroni tylko reguła mod_rewrite (`.htaccess:96`).
- `data/msportal/` ma własny `.htaccess`, ale `data/shared/` i `data/rwdz/` nie mają.
- Przy błędzie w regułach albo zmianie kolejności reguł plik `data/rwdz/rwdz.sqlite` (ok. 210 MB, z danymi inwestorów) leży pod przewidywalnym adresem.

**Naprawa:**
- `data/.htaccess` z `Require all denied` (z wyjątkiem `data/kowr/installations.*`).
- `Options -Indexes`.
- CSP z hashami dwóch skryptów inline w `index.html` i przeniesieniem `onclick` z linku „Przejdź do wyszukiwarki” do kodu.
- HSTS po potwierdzeniu, że cała domena działa po HTTPS.
- Blokada `^api/_` (pliki bibliotek PHP nie powinny być wywoływane bezpośrednio).

### B6 (N) Ujawnianie informacji
**Publicznie dostępne:**
- `README_WGRAJ_NA_SERWER.txt`: hosting OVH, ścieżka `www/test22`, cron;
- `RAPORT_AUDYTU_19.31.0.md` i 50 plików `ZMIANY_*.md`;
- `audyt/*.json` (wersja PHP, wyniki z serwera);
- `verify-deployment.php`;
- `api/health.php` (wersja PHP, rozmiar bazy, stan rozszerzeń);
- `diagnostyka.html`, `monitor-zrodel.html`.

**Komunikaty błędów zdradzające ścieżki serwera:**
- `api/permits.php:127`: `$e->getMessage()` z PDO;
- `api/terrain.php:86`;
- `api/uldk.php:43`: błąd cURL.

**Naprawa:**
- Nie wgrywać na serwer dokumentacji ani katalogu `audyt/`, albo zablokować je w `.htaccess`.
- Diagnostyka i `verify-deployment.php` za hasłem HTTP (Basic Auth z `.htpasswd`).
- Ogólne komunikaty błędów dla użytkownika, szczegóły do `error_log`.

### B7 (N) Utwardzenie cURL
**Gdzie:** `api/_common.php:36, 94, 224`, `api/forest.php:40`, `api/rcn.php:89`.
**Problem:** `CURLOPT_FOLLOWLOCATION => true` bez `CURLOPT_PROTOCOLS`/`CURLOPT_REDIR_PROTOCOLS` = HTTPS i (w `_common.php`) bez `CURLOPT_MAXREDIRS`. Przekierowanie po stronie usługi zewnętrznej mogłoby skierować serwer pod adres wewnętrzny (SSRF przez przekierowanie). Ryzyko jest niskie, bo adresy są z allowlisty.
**Naprawa:** `api/source_monitor.php:28` robi to już poprawnie. Przenieść te same opcje do wspólnej funkcji.

### B8 (N) Tryb administratora to tylko widok
`?admin=1` / `localStorage msportal.admin` (`app/components/VpsDataPanel.js:31`) pokazuje dane, które i tak zwracają publiczne endpointy. Nie jest to luka, ale nie należy na nim budować niczego, co wymaga uprawnień.

---

## 3. Zgodność prawna i regulaminy usług

| # | Waga | Ustalenie | Kierunek |
|---|---|---|---|
| Z1 | **W** | **Dane osobowe inwestorów z RWDZ (GUNB).** `api/permits.php:226` zwraca pole `investor`, panel je pokazuje (`BuildingPermitsPanel.js:223`) i eksportuje do CSV (`:47`). Dla osób fizycznych to dane osobowe, a wyszukiwanie po promieniu wokół punktu ułatwia profilowanie. | Opinia prawna. Najbezpieczniej ukrywać inwestora, gdy nie jest osobą prawną (heurystyka: brak „sp.”, „S.A.”, „gmina” itd.), albo nie pokazywać go wcale. |
| Z2 | Ś | **Brak polityki prywatności.** Przeglądarka użytkownika łączy się bezpośrednio z OSM (kafle), Nominatim, OpenFreeMap, AWS (model terenu) i Google (nawigacja). Serwer przechowuje udostępnione projekty przez 90 dni i adresy IP (jako skróty) w plikach limitów. | Krótka polityka prywatności i informacja w oknie „Udostępnij”. |
| Z3 | Ś | **Nominatim:** regulamin OSMF zabrania autouzupełniania. `search/nominatimClient.js` pyta przy pisaniu (opóźnienie 450 ms). Zapasowe proxy `api/search.php` nie ma cache ani ograniczenia tempa i przedstawia się jako przeglądarka (`Mozilla/5.0 MSPortalVendor`, `_common.php:97`). | Miejscowości i ulice z GUGiK (PRNG/UUG, które portal już używa dla adresów) albo własny geokoder (Photon/Nominatim) czy płatny dostawca. Własny User-Agent z kontaktem. |
| Z4 | Ś | **Podkład `tile.openstreetmap.org`** jako domyślny (`data/catalog/dataCatalog.js:53`). Regulamin OSMF nie pozwala na intensywne użycie, a serwis komercyjny powinien korzystać z dostawcy kafli. | Domyślnie podkład GUGiK albo OpenFreeMap (już używany), OSM jako opcja. |

---

## 4. Stabilność i utrzymanie

### S1 Brak repozytorium i odtwarzalnej budowy (najważniejsze)
- **Brak źródeł w paczce:** nie ma TypeScript, `package.json` ani bundlera. 19 modułów ma ślady kompilacji TS (`x === null || x === void 0 ? void 0 : …`), 52 są pisane ręcznie (`h(...)`). Kod wynikowy jest więc edytowany bezpośrednio.
- **Brak narzędzi, do których odsyła dokumentacja:** `tools/build_lucide_subset.mjs`, `tests/package-check.py`, `narzedzia_importu/`.
- **Pliki PHP odtwarzane:** raport 19.31.0 (p. 4) przyznaje, że pliki PHP serwera w pełnej paczce „odtworzono” bez możliwości pobrania z hostingu. Źródłem prawdy jest więc serwer produkcyjny.
- **Kierunek:** repozytorium git (prywatne GitHub/GitLab) jako jedyne źródło prawdy, CI uruchamiające istniejące `check_release.py` i testy PHP przy każdej zmianie, paczka budowana automatycznie z tagu.

### S2 Ręczne, wieloetapowe wdrożenie
- **Ręczne kroki:** wgrywanie przez FTP, skrypt `aktualizuj-*.php` przepisujący numery wersji regexem w ~40 plikach, ręczne sprzątanie starych katalogów `app-*`.
- **Produkcja pod `/test22/`.**
- **Niespójna dokumentacja:** `ZMIANY_19.41.0.md` każe otworzyć aktualizator w przeglądarce, a `.htaccess` i sam skrypt pozwalają tylko na CLI.
- **Kierunek:**
  - wersja w jednym miejscu (np. `VERSION.txt` czytany przez PHP zamiast stałych w każdym pliku);
  - wdrożenie z CI przez SFTP (`lftp mirror`) do nowego katalogu i przełączenie jednym plikiem;
  - osobne środowisko testowe i produkcyjne pod docelowym adresem.

### S3 Brak obserwowalności
- **Błędy tylko w przeglądarce:** błędy z przeglądarek trafiają wyłącznie do `localStorage` danego użytkownika (`diagnostics/errorLog.js`).
- **Brak monitoringu i alertów:** nie ma zewnętrznego monitoringu ani powiadomień. Rekomendacja R7 z audytu 19.31.0 nadal jest otwarta.
- **Kierunek:**
  - zewnętrzny monitor `api/health.php` i 2–3 kluczowych ścieżek (ULDK, identyfikacja, kafel WMS) co 5 min z e-mailem (UptimeRobot / Better Stack);
  - endpoint zbierający błędy JS (z limitem) albo Sentry;
  - dzienny raport otwartych bezpieczników z `cache/health/`.

### S4 Wydajność pierwszego uruchomienia
**Pomiar lokalny (bez sieci, więc czas nie jest miarodajny):** 341 żądań, w tym 310 plików JS, 4,6 MB JS bez kompresji i 21 plików CSS (336 kB).

**Największe pliki:**

| Plik | Rozmiar |
|---|---|
| `openlayers.js` (pełny build UMD i warstwa nakładek ESM) | 1 MB |
| `_react-bundle.js` | 570 kB |
| `zod.min.js` | 479 kB |
| Radix (dropdown + tooltip) | 307 kB |
| `ol-mapbox-style` | 143 kB |
| `proj4` | 133 kB |
| `i18n/pl.js` | 99 kB |

Audyt 19.31.0 zmierzył 12,6 s pierwszego startu. Znacznik `MODULEPRELOAD` w `index.html` jest pusty (R8 otwarte).

**Kierunek:**
- bundler (esbuild/Vite) z podziałem na kilka paczek;
- OpenLayers jako ESM z tree-shakingiem zamiast pełnego `ol.js`;
- zod tylko przy wczytaniu projektu (lazy import) albo `zod/mini`;
- realnie ok. 1–1,3 MB i 10–20 żądań.

**Martwe pliki:** `vendor/static/lucide-react.js` (1,3 MB), `zod.js` (758 kB) i `proj4.js` (239 kB) nie są używane przez importmapę. Trzyma je tylko kontrola `setup-vendors`.

### S5 Jeden projekt na przeglądarkę
- Projekt żyje w IndexedDB. Wyczyszczenie danych witryny albo inna przeglądarka oznacza utratę pracy.
- Kopia powstaje tylko przy imporcie.
- **Kierunek krótkoterminowy:** przypomnienie o zapisie pliku `.mapownik` po N zmianach; File System Access API do automatycznego zapisu w Chrome/Edge.
- **Kierunek docelowy:** F2.

### S6 Co działa dobrze (zostawić)
- Bezpieczniki per źródło i host z próbą „half-open” (`_common.php:142-289`).
- Serwowanie ostatniego dobrego kafla (stale-if-error).
- Budżety czasu na żądanie.
- Eksport z bramką kompletności (409 z listą braków i „Ponów” tylko brakujących fragmentów).
- Sprzątanie cache z ograniczoną pamięcią (`MSPortalOldestFilesHeap`).
- Semafory dla NMT (`dem_acquire_slot`) i analiz (`vps_guard_expensive`).
- Walidacja XML z `LIBXML_NONET` i tylko do odczytu SQLite z `PRAGMA query_only`.
- Wbudowana diagnostyka (189 testów).

---

## 5. Funkcjonalność — kierunki rozwoju

Rozwój funkcji jest szybki: raport PDF, Teren 3D, RCN, pozwolenia, profil terenu. Rekomendacje R3 (raport PDF) i R5 (eksport jak na ekranie) z audytu 19.31.0 zostały zrealizowane, R2 (przesuwanie obiektów) jest w `commands/ObjectCommands.js`.

| # | Propozycja | Wartość | Uwagi |
|---|---|---|---|
| F1 | **Wyszukiwanie po współrzędnych** (WGS84, PUWG 1992, wklejony link Google Maps). R1 z audytu 19.31.0. Nie znalazłem tego w `SearchToolbar.js` ani `search/`. | wysoka, mały koszt | czysto po stronie klienta |
| F2 | **Konta i projekty w chmurze:** wiele projektów, historia wersji, dostęp z telefonu i komputera, udostępnianie z uprawnieniami i datą wygaśnięcia. Rozwiązuje S5, B3 i część Z2. | wysoka | wymaga logowania (np. e-mail z linkiem) i bazy |
| F3 | **Porównanie działek projektu** (R6): tabela powierzchni, MPZP/POG, ochrony i cen, eksport CSV/PDF. | średnio-wysoka | dane już są w raporcie |
| F4 | **Własny geokoder i kafle** (Z3, Z4): PRNG/UUG GUGiK dla miejscowości i ulic, podkład GUGiK albo OpenFreeMap domyślnie. | średnia | usuwa zależność od regulaminów OSMF |
| F5 | **Strona stanu źródeł dla użytkownika** („GDOŚ chwilowo nie odpowiada”) z danych bezpieczników. | średnia | dane już są w `cache/health/` |
| F6 | **Tryb terenowy (PWA):** zapamiętany kod aplikacji i ostatnich kafli na telefonie. | średnia | ostrożnie z obecnym „immutable” |
| F7 | **Kafle NMT 1 m w tle (cron)** dla obszarów z projektów. WCS GUGiK odpowiada 70–150 s, więc pobieranie na żądanie jest dziś praktycznie nieużywalne. | średnia | `api/dem.php` już ma cache i limity |

---

## 6. Plan działań

**Etap 1 — od razu, kilka godzin pracy, bez zmian funkcji**
1. `.htaccess`:
   - `Options -Indexes`;
   - `Header unset X-Powered-By`;
   - blokada `^api/_`, `\.md$`, `README`, `audyt/`;
   - `data/.htaccess` z `Require all denied` (wyjątek `kowr/installations.*`).
2. `setup-vendors.php` tylko z CLI. Usunąć przekierowanie `?auto=1` z `index.html` (B4).
3. Eksport: rezerwacja limitu w blokadzie, globalny semafor 1–2 eksportów, limit otworów i wierzchołków (B1).
4. `forest.php`: limit częstotliwości, BBOX wyrównany do siatki. `forest` i `rcn` w `maintain_map_cache()` (B2).
5. Decyzja w sprawie pola „Inwestor” (Z1).

**Etap 2 — 1–2 tygodnie**
6. Repozytorium git, CI z istniejącymi testami, wersja w jednym miejscu, automatyczna paczka (S1, S2).
7. Monitoring dostępności z alertem e-mail i zbieranie błędów JS (S3).
8. CSP i HSTS (B5). Walidacja schematu projektu w `shared_project.php` (B3).
9. Polityka prywatności (Z2). Geokoder miejscowości i ulic z GUGiK (Z3).

**Etap 3 — kolejne wydania**
10. Bundler i odchudzenie startu (S4).
11. Wyszukiwanie po współrzędnych (F1), porównanie działek (F3).
12. Konta i projekty w chmurze (F2), które zastępują anonimowe udostępnianie.

---

## Załącznik: co i jak sprawdzono

| Test | Wynik |
|---|---|
| `php -l` na wszystkich plikach `.php` (PHP 8.3.6) | 0 błędów |
| `node --check` na wszystkich modułach `app-19.41.4/` | 0 błędów |
| `php tools/test_identify_parse.php` | 25/25 przypadków |
| `php tools/test_wms_merge.php` | wszystkie poprawne (scalanie 1024² w 113 ms) |
| `python3 tools/check_release.py` | `failures: []` (249 JS, 39 PHP, 7 HTML, 4 PY) |
| Start w Chromium (php -S, 1440×900 i 390×844) | mapa się wyświetla, 0 błędów konsoli, 0 odpowiedzi 4xx/5xx |
| `POST api/shared_project.php` z dowolnymi polami | przyjęte i zwrócone bez zmian (B3) |
| Przegląd: wszystkie wywołania SQL | tylko zapytania parametryzowane; nazwy tabel stałe w kodzie |
| Przegląd: `innerHTML`/`dangerouslySetInnerHTML`/`eval` w aplikacji | brak (React); `diagnostyka.html` używa `escapeHtml` |
| Przegląd: parsery XML | `LIBXML_NONET`, bez `LIBXML_NOENT` (brak XXE) |

Nie sprawdzano: działania usług zewnętrznych na produkcji, konfiguracji samego hostingu OVH (wersja Apache, moduły, limity procesów), testów obciążeniowych na produkcji.
