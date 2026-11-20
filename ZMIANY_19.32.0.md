# msportal 19.32.0: ceny transakcyjne i pozwolenia na budowę jako narzędzia na prawej belce

Zawiera też 19.31.1 (mocniejsza rzeźba w podkładzie Kartograficznym).

## Nowe narzędzie: Ceny transakcyjne (prawa belka, ikona metki „Ceny”)
- Transakcje z Rejestru Cen Nieruchomości GUGiK w **bieżącym widoku mapy**.
- **Opcje w oknie narzędzia:**
  - rodzaj: grunty, domy albo mieszkania;
  - okres: 1, 2, 3, 5 albo 10 lat;
  - „Odświeżaj po przesunięciu mapy” (wyłączone = przycisk „Pokaż dla bieżącego widoku”);
  - „Tylko transakcje w statystyce”.
- **Na mapie:**
  - punkty w 5 kolorach według ceny za m², z klasami liczonymi z transakcji w widoku;
  - szare punkty to transakcje poza statystyką (udziały, drogi, nierynkowe);
  - przy dużym zbliżeniu cena przy punkcie;
  - kliknięcie punktu pokazuje szczegóły w oknie narzędzia.
- **W oknie:** mediana i typowy przedział cen, legenda, ostatnie transakcje (kliknięcie przybliża mapę) i pobranie CSV.
- Działa dla widoku do 8 × 8 km (ok. 1:70 000 i bliżej). Przy większym obszarze narzędzie prosi o przybliżenie.

## Nowe narzędzie: Pozwolenia na budowę (prawa belka, ikona dźwigu „Budowy”)
- Wnioski o pozwolenie na budowę, decyzje i zgłoszenia budowlane z Rejestru Wniosków, Decyzji i Zgłoszeń GUNB,
  z ostatnich 3 lat, dla całej Polski.
- **Punkt analizy:** zaznaczona działka; bez działki albo po kliknięciu „Użyj środka mapy” — środek mapy.
- **Opcje:**
  - promień: 300 m, 500 m, 1 km albo 1,5 km;
  - okres: 1, 2 albo 3 lata;
  - wnioski i pozwolenia albo zgłoszenia;
  - 8 typów inwestycji: domy jednorodzinne, budynki wielorodzinne, usługi i handel, przemysł i magazyny, energia (PV, wiatr),
    drogi i sieci, rozbiórki, inne.
- **Na mapie:**
  - okrąg promienia;
  - punkty w kolorze typu, w środku działki inwestycji (biała obwódka — pozwolenie, ciemna — zgłoszenie).
- **W oknie:**
  - liczba inwestycji według typów;
  - lista najnowszych (kliknięcie przybliża mapę);
  - szczegóły: nazwa zamierzenia, kategoria obiektu, kubatura, inwestor (gdy jest w rejestrze), organ i numer, daty,
    stan zgłoszenia, działki;
  - pobranie CSV.
- **Położenie:** rejestr nie ma współrzędnych, więc położenie działek pobiera serwer z ULDK GUGiK i zapamiętuje
  (`cache/rwdz/geo.sqlite`). Pierwsze sprawdzenie nowej okolicy trwa ok. 10–20 s, a wyniki pojawiają się stopniowo.
  Kolejne zapytania w tej okolicy są natychmiastowe.
- **Typ inwestycji** jest orientacyjny: ustalany z kategorii obiektu i nazwy zamierzenia.

## Telefon
Oba narzędzia są w menu „Więcej”.

## Dane pozwoleń (osobna paczka `dane_rwdz_2026-10.zip`)
- Plik `data/rwdz/rwdz.sqlite` (ok. 210 MB) obejmuje 678 tys. inwestycji i 1,54 mln działek, od 01.11.2023 do danych GUNB z 21.10.2026.
- Bez tego pliku narzędzie pokazuje komunikat „Baza pozwoleń nie jest jeszcze wgrana”. Pozostałe funkcje działają normalnie.
- **Aktualizacja co miesiąc** (GUNB publikuje dane ok. 21. dnia):

  ```bash
  python3 tools/build_rwdz_store.py
  ```

  Skrypt pobiera pliki z dane.gov.pl i buduje nową bazę. Plik wgrywa się przez FTP w miejsce starego.
  Zapamiętane położenia działek zostają.
- Katalog `data/` jest zamknięty dla przeglądarek (`Require all denied`), więc bazy nie da się pobrać z zewnątrz.

## Serwer
- `api/rcn.php`: nowy tryb `bbox` (obszar widoku). Zapytanie z promieniem w Raporcie działa bez zmian.
- `api/permits.php` (nowy, niezależny od `_common.php`):
  - obręby z ULDK (`GetRegionByXY`) i położenie działek (`GetParcelById`);
  - 8 zapytań naraz, do 12 s na wywołanie;
  - wymaga PDO SQLite, które serwer ma.

## Wgranie
1. Wgraj `aktualizuj-19.32.php` i otwórz go w przeglądarce.
2. Wgraj i nadpisz:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`;
   - `assets/css/36-latwa-obsluga.css`;
   - `api/rcn.php`, `api/permits.php`;
   - katalog `app-19.32.0/`.
3. Rozpakuj `dane_rwdz_2026-10.zip` i wgraj `data/rwdz/rwdz.sqlite` (tryb binarny, ok. 210 MB).
4. Odśwież portal i otwórz na prawej belce „Ceny” i „Budowy”.
5. Otwórz `aktualizuj-19.32.php?sprzatanie=1`, potem `verify-deployment.php`.
6. `diagnostyka.html` → testy 19.32.0 na zielono.
