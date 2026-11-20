# Mapownik 18.18.4 — poprawki z audytu layoutu i obsługi narzędzi

16.10.2026

Wdrożenie pozycji 1–6, 9, 10 i 14 z raportu „Mapownik 18.18.3 — audyt layoutu i obsługi narzędzi”. Pozycje wymagające decyzji (7, 8, 13) i dwie większe (11, 15) nie były ruszane — patrz „Czego nie zmieniono”.

## Błąd: pusty ekran w „Samej mapie” i przy zaznaczaniu kadru eksportu

**Przyczyna:** reguła `.app-shell:not(.is-mobile) { grid-template-rows: auto minmax(0,1fr) }` w `31-ux.css` nie leży w warstwie CSS, więc wygrywała z regułami obu trybów (`30-shell.css`, `21-legacy-shell.css`), które chowają pasek aplikacji i zostawiają jeden wiersz siatki. Mapa trafiała do pierwszego wiersza o wysokości 0 px, a przycisk „Przywróć interfejs” leżał 16 px nad ekranem. Błąd był już w 18.18.0.

**Zmiana:** wiersze siatki ustawiane są tylko poza trybami `is-map-only` i `is-export-selection`.

**Sprawdzone** (Chromium): 1280×720, 1920×1080 i 1440×900 w motywie ciemnym; wejście przyciskiem, wyjście przyciskiem „Przywróć interfejs” i klawiszem Esc, kadr eksportu i wyjście z niego. Mapa wypełnia cały ekran (720, 1080 i 900 px wysokości zamiast 0).

## Skala mapy

- Podziałka liniowa w lewym dolnym rogu mapy (okrągłe długości 1 / 2 / 2,5 / 5 × 10ⁿ, do 56 px szerokości).
- „Skala ~1:x” w pasku stanu obok „Zoom”.
- Liczone dla szerokości geograficznej środka mapy, a nie stałych 52°N, więc zgadza się także w Bieszczadach i na Pomorzu. Panel warstw nadal podaje „od ~1:…” dla 52°N.
- Własny komponent (`MapScaleBar.js`), bo paczka `vendor/ol-esm` nie zawiera modułu `ScaleLine`, a jego dodanie wymagałoby ponownego budowania vendor na serwerze.
- Sprawdzone narzędziem pomiaru: odcinek „2 km” (49 px) odpowiada pomiarowi 2,01 km.
- Podziałka jest ukryta na telefonie, w trybie wyboru kadru eksportu i przy wydruku.

## Pole, obwód i długość po zakończeniu rysowania

- Zaznaczony poligon pokazuje w pasku kontekstu „Powierzchnia” i „Obwód”, linia — „Długość”. To samo jest pod nazwą obiektu w panelu Obiekty.
- Dotyczy obiektów rysowanych (Punkt/Linia/Poligon), prostokątów, okręgów i wyników analiz (np. bufora). Pomiary mają wartość w nazwie, więc bez zmian.
- Wartości liczone w EPSG:2180 tą samą funkcją co odczyt w trakcie szkicu (`geometry/planarMeasures.js`); poligony z otworami: pole pomniejszone o otwory, obwód obejmuje wszystkie pierścienie.
- Snapshot obiektów liczy miary tylko dla zaznaczonego obiektu.

## Eksport: bez blokady na starcie

Gdy widoczny podkład nie jest renderowany w eksporcie (np. „Mapa standardowa”), panel domyślnie wybiera Topografię. Wcześniej pokazywał „wymaga wyboru”, puste pole i wyłączony przycisk. Zamiennik można zmienić na „bez podkładu”, a komunikat jednym zdaniem wyjaśnia, skąd zamiana. Przyciski nadal są wyłączone, gdy obszar jest za duży — z podanym powodem.

## Informacja o działce

- Gdy w punkcie nie odczytano działki, siatka ośmiu pól „—” znika (ok. 160 px); zostaje punkt i krótkie wyjaśnienie.
- Współrzędne punktu także w EPSG:2180 (`X …, Y …`, ten sam zapis co „Kopiuj współrzędne”), z przyciskiem kopiowania.
- Poprawna odmiana: „+ 1 źródło”, „+ 3 źródła”, „+ 5 źródeł bez wyniku” oraz „w jedynym sprawdzonym źródle” (`tn()` zamiast stałego tekstu).

## Telefon

- Karta „Wskazane miejsce” w stanie podglądu ma 192 px zamiast 156, więc rząd MPZP / Plan ogólny / Natura 2000 jest widoczny w całości (wcześniej 20 z 48 px). Prawa krawędź rzędu jest wyblakła jako wskazówka przewijania.
- Po rozwinięciu karty wyniki układają się w dwie kolumny, a „w obszarze: …” zajmuje całą szerokość (wcześniej ucięte przy krawędzi na 360 i 390 px).
- Dolna nawigacja jest nad arkuszami (Warstwy, Narzędzia, Więcej, Projekt, Uzbrojenie): z arkusza można przejść do Sprawdź / Mierz / Projekt bez zamykania. Treść arkusza przewija się nad paskiem.
- Zamknięcie arkusza „Uzbrojenie terenu” używa ikony X 44 px, jak pozostałe arkusze.
- Sprawdzone: 390×844, 360×640 i poziomo 844×390.

## Słownictwo i rozmiar napisów

- Jedno słownictwo: **Punkt, Linia, Poligon** — paleta („Dodaj punkt”, „Rysuj linię”, „Rysuj poligon”), panel Obiekty, stan pusty i nazwy nowych obiektów. Dawne „Dodaj znacznik” i „Rysuj obszar” zniknęły.
- `--fs-xs` z 11 px na 12 px oraz 13 literałów `font-size: 11px` w `30-shell.css` i `31-ux.css`. Na ekranie startowym 1440×900 najmniejszy napis ma teraz 12 px (wcześniej 53 z 103 napisów miało 11 px). Etykiety palety mają `padding-inline: 2px`, żeby „Sprawdź” i „Przejazd” mieściły się w przycisku.

## Czego nie zmieniono

- **Poz. 7 (pomiary domyślnie tymczasowe), 8 (liczba wejść do zdjęć i eksportu), 13 (panel Warstw na małych ekranach):** wymagają Twojej decyzji.
- **Poz. 11 (kolejność Tab) i 15 (podpisy w szynie paneli, historia wyszukiwań):** większe zmiany, osobne wydanie.
- **Poz. 12 (legenda):** po sprawdzeniu legenda otwiera się samoczynnie tylko pod warstwą „Strefy POG”, i to celowo (strefy bez legendy są nieczytelne, `ALWAYS_LEGEND`). Ustalenie w raporcie było zbyt szerokie, więc zachowanie zostało.

## Testy

- `php tools/test_identify_parse.php`: 18/18.
- `tools/bump_version.py --check` i `verify-deployment.php`: spójne (18.18.4).
- Diagnostyka w przeglądarce: jedyne błędy to usługi zewnętrzne niedostępne z środowiska testowego (HTTP 403/502), tak jak w 18.18.3.
- Przeklikane w Chromium: tryby pełnoekranowe, rysowanie poligonu i linii, eksport, informacja o działce z działką i bez, telefon.
- Nie sprawdzano: Windows, Firefox i Safari, prawdziwych odpowiedzi usług zewnętrznych, wygenerowanego pliku eksportu.

## Wdrożenie

Wgraj `app-18.18.4/`, `assets/`, `api/`, `monitor/`, `.htaccess`, `index.html`, `diagnostyka.html` i pliki z katalogu głównego; usuń `app-18.18.3/` i starsze. Nowych plików w `vendor/` nie ma. Po wgraniu: `verify-deployment.php` (`deployment_consistent=true`), potem `diagnostyka.html`. Przeglądarka pobierze nowe pliki sama, bo zmienia się nazwa katalogu `app-*`.
