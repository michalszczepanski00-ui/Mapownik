# 19.11.0 — jedna karta miejsca z zakładkami, dolna belka bez instrukcji

Bez zmian w katalogu warstw, formacie projektu i skrótach.

## Dolna belka (dok narzędzi)

- Usunięta długa instrukcja narzędzia (np. „Kliknij miejsce na mapie, aby sprawdzić…”),
  która zajmowała ok. 3/4 belki. Zostają: nazwa narzędzia, przycisk „i” (opis i instrukcja
  w podpowiedzi), parametry, odczyt szkicu, Zakończ/Anuluj i zaznaczony obiekt.

## Karta miejsca: Działka · Raport · Analizy

- Wynik „Sprawdź” (Działka), „Działka, ceny i otoczenie” (Raport, analiza 360°) i „Analizy”
  (screening otoczenia) to teraz **jedna karta po lewej pod wyszukiwarką z trzema
  zakładkami**. Przełączanie zakładek nie zamyka warstw po prawej.
- Przyciski Działka / Raport / Analizy w szynie paneli otwierają tę samą kartę na właściwej
  zakładce; „Screening tej działki” z karty Działka przechodzi na zakładkę Analizy.
- Karta ma stałe miejsce i szerokość 360 px (bez przeciągania, zmiany rozmiaru, „zadokuj”
  i „minimalizuj”). Telefon bez zmian.
- Technicznie: panele z flagą `placeCard` (identify, vpsData, analysis) są na komputerze
  oknami jednej wykluczającej grupy `place-card`; zakładki rysuje `PlaceCardTabs` (App.js).

## API — scalenie poprawki z sesji „Portal na serwer bez VPS”

- `api/identify.php`: pusty wynik źródła zapasowego nie jest zapamiętywany jako „zwycięzca”
  (tylko pusty wynik źródła podstawowego). Pozostała część tej poprawki (podpis url+warstwy,
  ważność 24 h, wersja; opisy POG bez identyfikatorów; GeoMedia/QR) była już w 19.8.6–19.10.0.
  `tools/test_identify_parse.php`: 25/25.

## Testy

- Lokalnie: `check_release.py` bez błędów, wersja spójna; przejścia: wynik działki 60/18 →
  karta z zakładką Działka, przełączenie na Raport i Analizy przy otwartych Warstwach,
  powrót na Działkę, G (szkic) zamyka kartę. Diagnostyka: tylko testy sieciowe środowiska
  testowego (MPZP 502 z bramki) — na serwerze przechodziły.
