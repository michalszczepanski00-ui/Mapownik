# 19.10.0 — karta miejsca po lewej, statusy MPZP/POG jako filtr

Kolejne elementy układu v2 (płótno, tablice 4 i 5; etapy 3–4 analizy). Bez zmian w API,
katalogu warstw (te same identyfikatory i źródła), formacie projektu i skrótach.

## Sprawdzenie wdrożenia 19.9.0 (mapownik.swiadectwa.net/test22, 28.10.2026)

- `verify-deployment.php`: spójne, wersja 19.9.0; nowe pliki (34-v2.css, czcionki Inter,
  ToolDock.js) serwowane z poprawnym typem MIME.
- Wyszukanie działki 221303_1.0021.60/18, identyfikacja (MPZP „obowiązuje”, POG „uchwalony”),
  dok narzędzi — działają. `diagnostyka.html` na serwerze: bez błędów.
- Raz (na 4 wczytania) przeglądarka dostała `23-legacy-catalog.css` jako `text/plain`
  i odrzuciła arkusz (lista warstw bez stylów). Kolejne wczytania i bezpośrednie zapytania —
  `text/css`. Wygląda na chwilowy błąd hostingu; jeśli ktoś zobaczy nieostylowaną listę
  warstw, wystarczy odświeżyć z pominięciem pamięci (Ctrl+F5).

## Karta miejsca (`informationFeature.js`, `App.js`, `IdentifyPanel.js`, `34-v2.css`)

- Wynik „Sprawdź” (Informacja o działce) na komputerze otwiera się **po lewej, pod
  wyszukiwarką** (340 px), a nie jako zakładka prawego panelu. **Warstwy po prawej zostają
  otwarte** — wynik i lista warstw są widoczne jednocześnie.
- Karta ma stałe miejsce: bez przeciągania, zmiany rozmiaru i „zadokuj”. Zostają: przypnij
  wynik, minimalizuj, zamknij. Przycisk „Działka” w szynie nadal ją otwiera i zamyka.
- Technicznie: panel z flagą `placeCard` jest na komputerze oknem pływającym (`usePlaceCards`),
  a 34-v2.css ustawia jego położenie. Telefon bez zmian (własna karta działki).

## Warstwy — statusy procedury jako filtr (`LayersPanel.js`, `34-v2.css`)

- Trzy warstwy obszarów MPZP (obowiązujące, w trakcie przyjmowania, w opracowaniu) i trzy
  warstwy obszarów POG (uchwalone, w trakcie przyjmowania, w opracowaniu) są w zakładce
  „Wszystkie” **dwoma wierszami**: „MPZP — obszary planów” i „POG — obszary planów ogólnych”.
- Włączenie wiersza pokazuje status domyślny (obowiązujące / uchwalone) i przełączniki
  statusów — można włączyć kilka naraz. Licznik `2/3` mówi, ile statusów jest widocznych.
- Strzałka w wierszu rozwija pełne wiersze warstw (krycie, legenda, menu, przeciąganie).
- Wyszukiwarka warstw i zakładki „Aktywne”/„Ulubione” pokazują pojedyncze warstwy jak dotąd.
- Strefy POG i rysunek MPZP (integracja) zostają osobnymi wierszami.

## Testy

- `diagnostyka.html`: nowy test „19.10.0 — karta miejsca i rodziny statusów” (flaga karty,
  6 identyfikatorów rodzin istnieje w katalogu).
- Lokalnie: `check_release.py` bez błędów, wersja spójna. Diagnostyka lokalnie zgłasza tylko
  testy sieciowe (ortofotomapa 404, MIDAS 502, GDOŚ/Natura 403 z blokady Incapsula dla
  środowiska testowego) — na serwerze produkcyjnym te same testy przechodzą.
- Sprawdzone: wynik po lewej z otwartymi warstwami; zamknięcie karty; „Działka” w szynie;
  włączenie POG, dodanie statusu, rozwinięcie MPZP; telefon 390 × 844 — karta działki bez zmian.

## Nadal poza zakresem

- Zakładka „W widoku” i kropka „dane w widoku”: usługi WMS nie mówią, czy w kadrze są dane,
  bez osobnego zapytania o każdą warstwę — wymaga sondy po stronie serwera.
- Połączenie karty Działka z Raportem i Analizami w jedną kartę z zakładkami.
