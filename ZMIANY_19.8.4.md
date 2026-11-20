# 19.8.4 — plany ogólne i MPZP: działające źródła (zgłoszenie: Starogard Gdański)

## Problem

W „Informacji o działce” dla działki w Starogardzie Gdańskim (221303_1.0021.60/18) plan ogólny miał
status „nie sprawdzono” (źródła z błędem), a MPZP „brak” — mimo że oba plany obowiązują.

## Przyczyny (zweryfikowane 27.10.2026)

1. **Plany ogólne pobierane wyłącznie z Rejestru Urbanistycznego (RU)**, który: odpowiadał w 9–40 s
   (portal przerywa po ~7,5 s), na kafle mapy zwracał HTTP 503, a dla WMS 1.1.1 nie zwraca danych
   o obiektach (po 20 s odsyła obrazek). Dla tego punktu RU nie miał też planu Starogardu.
   Krajowa integracja planów ogólnych GUGiK (Geoportal) ma ten plan i odpowiada w < 1 s:
   „Plan ogólny miasta Starogard Gdański”, strefa 234SJ (wys. 10 m, intensywność 1,2, zabudowa 40 %, PBC 40 %).
2. **MPZP**: krajowa integracja MPZP dla Starogardu odpowiada na zapytanie o obiekty „brak wyniku dla
   wskazanego obszaru”, choć rysunek planu (z serwera gminy) pokazuje w tym miejscu teren 20 MN / 27 MN.
   Przekazywanie zapytań o obiekty do serwera tej gminy nie działa (w Krakowie działa).
3. **Ukryty błąd** `identify.php`: dla WMS 1.3.0 nie zamieniał kolejności osi EPSG:2180 — źródła 1.3.0
   (zabytki NID, zagrożenie powodziowe ISOK, a po zmianie także RU) pytały o zły punkt. Przykład:
   Zamek Królewski — wcześniej „brak”, teraz „Stare Miasto, rejestr zabytków 1965”.

## Zmiany

- Warstwy POG (uchwalone, strefy, projektowane): **źródło podstawowe — krajowa integracja GUGiK**
  (`PlanyOgolneGmin`, `ProjektowanePlanyOgolneGmin`), zapas — Rejestr Urbanistyczny (WMS 1.3.0).
  Dotyczy kafli mapy (`wms.php`, warianty), „Informacji o działce” (`identify.php`) i legendy.
  Strefy POG widoczne od zoomu ~12,4 (usługa GUGiK publikuje je do 1:100 000; RU tylko do 1:10 000).
- `identify.php`: poprawna kolejność osi dla WMS 1.3.0; dla MPZP — gdy integracja zwróci „brak wyniku”,
  sprawdzany jest rysunek planu w punkcie (kafel 16 × 16 px); jeśli plan jest narysowany:
  „MPZP obowiązuje” z informacją, że opis jest niedostępny z serwera gminy.
- Analiza działki 360°:
  - POG: RU (dokładne pola z geometrii), a gdy RU nie odpowiada lub nie ma stref — krajowa integracja GUGiK
    (udziały szacowane z 9 punktów, oznaczone „≈”), z linkiem do uchwały w dzienniku urzędowym;
  - MPZP: RU, a gdy brak — krajowa integracja MPZP (opis w punkcie lub sonda rysunku planu);
  - zapytania zapasowe wysyłane równolegle z pierwszą rundą RU — typowo 6–9 s (wcześniej do 20 s);
  - gdy żadne źródło nie potwierdzi planu, wynik oznaczony jako niepewny, nie „brak planu”.
- `diagnostyka.html`: strefy POG — oczekiwane źródło GUGiK i zoom 12–13; sonda ortofotomapy pomija
  piksele przezroczyste (TrueOrtho poza zasięgiem to „brak pokrycia”, nie „czarny obraz”).

## Weryfikacja

- Na żywych usługach: Starogard (POG z GUGiK, 234SJ), Spytkowice (POG z RU — 8SO 72,7 % + 47SJ 27,3 %),
  Kraków (MPZP z opisem z integracji), zabytki NID — Warszawa.
- Kafle POG przez `wms.php` z Geoportalu: 1,2–2,0 s (wcześniej przekroczenie czasu RU).
- Regresje: testy przeglądarkowe 4/4, porównanie z API Python 19.7.0 — 0 różnic, `check_release.py`.
- Nie dało się sprawdzić z tego środowiska sondy rysunku MPZP dla Starogardu (serwer gminy
  `vmpzp.igeomap.pl` odrzuca połączenia z chmury) — do potwierdzenia na hostingu po wgraniu.
