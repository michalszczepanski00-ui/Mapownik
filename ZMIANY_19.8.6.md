# 19.8.6 — stabilniejsze źródła planów: POG z dwóch źródeł, MPZP bez błędów identyfikacji

Podstawa: porównanie z minigeoportal.pl (github.com/envirosolutionspl/minigeoportal) i pomiary
na żywych usługach w 17 miejscowościach (28.10.2026). Z minigeoportalu przejęte jest tylko to,
co w pomiarach działało lepiej. Mapa zostaje w EPSG:3857 (w tym układzie GUGiK sam składa
rysunek MPZP, bez przekierowań do serwerów gmin), a warstwa MPZP `granice` zostaje.

## Plany ogólne (POG) — scalanie GUGiK i Rejestru Urbanistycznego

- **Problem**: żadne źródło nie ma wszystkich gmin. Strefy POG Starogardu Gdańskiego są tylko
  w krajowej integracji GUGiK; Szczecina, Białegostoku i Olsztyna — tylko w Rejestrze
  Urbanistycznym (w 40 próbkach z tych miast: GUGiK 16 z danymi, RU 40). Obie usługi
  odpowiadają wtedy HTTP 200 z pustym obrazem, więc wariant zapasowy nigdy się nie włączał,
  a zmiana kolejności źródeł (19.8.3 → 19.8.5) tylko przenosiła lukę z miasta na miasto.
- **`wms.php`, tryb `"merge": "fill"`** (profile `pog_adopted` i `pog_zones`): serwer pobiera
  obraz z GUGiK i z RU, a przezroczyste piksele pierwszego uzupełnia drugim (`wms_merge_fill`
  w `_common.php`, ok. 40 ms na kafel 512 px). Warstwy idą przez proxy (`transport: proxy`).
  - RU dostaje krótszy limit (5 s, `merge_secondary_timeout`), żeby wolny Rejestr (w dniu
    testów bywało 503 po 10 s) nie opóźniał kafli, które GUGiK już narysował.
  - Strefy RU są pomijane poniżej skali 1:10 000 (`max_scale` w wariancie) — tam i tak są puste.
  - Gdy jedno źródło nie odpowiada: wcześniejszy pełny obraz kafla (STALE), a gdy go nie ma —
    obraz z jednego źródła ważny tylko 15 minut (nagłówek `X-MSPortal-WMS-Merge: 1/2 …`).
- **`identify.php`**: w trybie merge pusty wynik jednego źródła nie kończy sprawdzania, dopóki
  nie odpowie drugie (wcześniej „brak planu” z GUGiK przesądzał o Szczecinie). Kolejność
  źródeł jest stała (bez zapamiętanego „zwycięzcy”).
- **`export.php`**: eksport PNG/PDF scala POG tak samo; niepełny fragment nie trafia do pamięci.
- Projekty POG („w trakcie przyjmowania”) bez zmian: tam GUGiK ma dane, a RU nie dodaje nic.

## Identyfikacja MPZP

- **Warszawa — błąd 502**: część gmin odpowiada formatem Oracle MapViewer
  (`<GetFeatureInfo_Result><ROWSET><ROW>`), którego parser nie znał przy żadnym INFO_FORMAT.
  Teraz: „Przeznaczenie: droga zbiorcza / Symbol przeznaczenia: 1.KDZ”. Puste ROWSET nie
  rozstrzygają o braku planu (kaskada GUGiK zwraca je także przy przekroczeniu czasu u gminy)
  — sprawdzany jest wtedy rysunek planu.
- **Sonda rysunku planu**: najpierw EPSG:3857 (GUGiK składa obraz sam), potem jak dotąd 2180
  (przekierowanie do serwera gminy, zawodne m.in. dla Warszawy, Lublina, Białegostoku, Łodzi).
- **Obraz zamiast informacji**: RU odsyła PNG na `INFO_FORMAT=application/vnd.ogc.gml`;
  parser brał bajty PNG za pustą odpowiedź tekstową i kończył sprawdzanie źródła. Teraz to
  nieobsługiwany format — próbowany jest następny.
- Opis z Rejestru Urbanistycznego bez pola „Identyfikator” i pustych wartości „-”.

## Odporność proxy (wszystkie źródła)

- Bezpiecznik (`circuit`) liczony per źródło **i host** — w `wms.php`, `identify.php`
  i `export.php`. Wcześniej awaria RU blokowała też zapasowy GUGiK tego samego źródła.
- Po przekroczeniu czasu albo zerwanym połączeniu pomijane są tylko warianty z tego samego
  hosta; wariant z innego hosta jest jeszcze próbowany (np. projekty POG: GUGiK → RU).

## Mapa (przejęte z minigeoportal.pl)

- **MPZP jednym obrazem** zamiast kafli 512 (`tiled: false`, `ratio: 1.25`): ekran
  1920 × 1080 to 1 zapytanie (~6 s) zamiast 12–15 (10–13 s i ok. 10× więcej pracy kaskady
  GUGiK). `ratio` dodane do schematu źródła WMS (`layerDefinition.js`) i do `wmsAdapter.js`
  (domyślnie jak dotąd 1).
- **Kolejność rysowania**: plany ogólne pod działkami — studium (30) → MPZP (40) →
  POG 44–47 → działki KIEG (50). Wcześniej POG (100–103) przykrywał działki.

## Kontrola źródeł

- `tools/check_sources.php` (CLI, do crona): każde źródło osobno w punktach, gdzie dane na pewno
  były, a z `--portal=` także scalone kafle wdrożonego `wms.php`. Pusty obraz w takim miejscu
  = błąd (zwykły test HTTP tego nie wykrywa). `--mail=` wysyła listę problemów, `--json=` raport.
  W dniu testów wykrył chwilową awarię RU (HTTP 503 po 10 s).

## Weryfikacja

- `tools/test_identify_parse.php` — 25/25 (nowe: Oracle MapViewer pusty i z obiektem,
  PNG zamiast informacji, odpowiedź RU bez identyfikatora).
- `tools/test_wms_merge.php` — 6/6 (nowy: scalanie, obraz z paletą, nieczytelny lub inny rozmiar).
- `tools/check_release.py` — 0 błędów; `tools/bump_version.py --check` — spójna.
- Lokalnie (PHP 8.3, serwer wbudowany), identyfikacja przed → po:
  - strefa POG: Szczecin, Białystok, Olsztyn „brak” → znaleziona (798SW, 371SU, 2SO);
    Starogard 234SJ i Poznań 931SW bez zmian;
  - plan ogólny: Szczecin, Białystok, Olsztyn „brak” → znaleziony;
  - MPZP: Warszawa błąd 502 → „droga zbiorcza, 1.KDZ”; Starogard „brak” → „obowiązuje”
    (sonda 3857; na hostingu działała już sonda 2180). Białystok i Lublin bez zmian (błąd
    po stronie serwerów gmin w obu układach).
- Kafle `wms.php?source=pog_zones` przy zoomie 17: Starogard, Szczecin, Białystok, Poznań —
  wszystkie narysowane, `merge 2/2`; przy zoomie 13 RU pomijany (`1/1`, 0,7–1,9 s).
- Chromium, cała aplikacja: Szczecin — strefy POG widoczne (wcześniej puste); Starogard bez
  zmian; MPZP jednym obrazem 1730 px (widok × 1,25).

## Znane ograniczenia

- Gdy RU odpowiada wolno, kafel POG bez pamięci podręcznej trwa do ~13 s (GUGiK + 5 s RU);
  po 10 błędach RU bezpiecznik otwiera się na 60 s i kafle idą z samego GUGiK (lub STALE).
- KIEG (`dzialki`) w części powiatów odrzuca EPSG:3857 („Projection library error”) — bez zmian,
  było tak w 19.8.5.
- Proxy przyjmuje obrazy do 4096 px; MPZP z `ratio: 1.25` przekroczy to dopiero na ekranach
  szerszych niż ~3270 px CSS (wtedy działa już tylko bezpośrednie połączenie z GUGiK).
