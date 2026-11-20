# 19.14.0 — „dane w widoku” dla warstw MPZP i POG

Ostatni element panelu warstw z projektu v2. Zawiera też 19.11–19.13 (na serwerze działała
jeszcze 19.10.0). Bez zmian w API, katalogu warstw i formacie projektu.

## Co widać

- Przy warstwach planistycznych (obszary MPZP, obszary i strefy POG) kropka:
  ● są dane w obecnym widoku mapy, ○ brak, ◌ sprawdzanie, kropkowana bursztynowa —
  nie udało się sprawdzić. Bez kropki: warstwa poza zakresem skali.
- Wiersze „MPZP — obszary planów” i „POG — obszary planów ogólnych” mają kropkę zbiorczą;
  przełączniki statusów z danymi w widoku mają kropkę, bez danych są przygaszone.
- Nowa zakładka **„W widoku”** w panelu Warstwy: warstwy planistyczne z danymi w kadrze.
- Rysunek MPZP z integracji (serwery gmin) nie ma kropki — jego wygląd zależy od skali
  i na pomniejszonym obrazie dawał fałszywe „brak”. O obecności planu mówią obszary MPZP.

## Jak to działa i ile kosztuje (`app/components/layerCoverage.js`)

- Po zatrzymaniu mapy (0,9 s) panel pobiera dla każdej warstwy jeden obraz całego widoku,
  najwyżej 384 px, przez własne proxy `api/wms.php` — tą samą drogą i z tym samym łączeniem
  źródeł co mapa — i sprawdza, czy ma choć jeden nieprzezroczysty piksel.
- Tylko przy otwartym panelu Warstw, tylko w zakresie skali warstwy, najwyżej 2 zapytania
  naraz, wynik zapamiętany dla kadru. Zwykle 7 małych zapytań na zmianę widoku, gdy panel
  jest otwarty; obrazy trafiają do pamięci podręcznej serwera jak kafle mapy.
- Obraz jest mniejszy niż mapa, więc to przybliżenie: „○ brak” nie dowodzi braku planu
  (pusta odpowiedź z pamięci awaryjnej serwera daje „nie udało się sprawdzić”).

## Testy

- Starogard Gdański, okolice działki 60/18, skala ok. 1:20 000: dane w widoku dla obszarów
  MPZP, stref POG i obszarów POG; zakładka „W widoku” — 5 warstw; przełączniki statusów POG
  z kropkami. Lokalnie część zapytań do Rejestru Urbanistycznego kończyła się 502 (bramka
  środowiska testowego) — te warstwy dostały „nie udało się sprawdzić”, zgodnie z założeniem.
- `diagnostyka.html`: nowy test „19.14.0 — dane w widoku” (warstwy przez proxy, limity sondy).
  `check_release.py` bez błędów, wersja spójna.
