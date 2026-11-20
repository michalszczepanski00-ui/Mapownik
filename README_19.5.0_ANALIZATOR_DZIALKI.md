# msportal 19.18.0 — Analizator działki 360° (etap integracyjny)

## Funkcje uruchamiane po instalacji

- Panel **RCN i BDOT10k → Analizator działki 360°**: wyszukanie działki po identyfikatorze EGiB albo środku mapy.
- Geometria pobierana na żądanie z oficjalnej usługi GUGiK ULDK (EPSG:2180), przeliczana do EPSG:4326 na mapę. Powierzchnia obliczana metrycznie z geometrii (nie zastępuje powierzchni ewidencyjnej).
- Granice działki jako osobna warstwa OpenLayers na mapie, z przybliżeniem widoku.
- Próba identyfikacji gminy i powiatu przez oficjalne OGC API Features PRG. Wynik tylko po stwierdzeniu rzeczywistego pokrycia punktu geometrią.
- BDOT10k: odległości do budynków `OT_BUBD_A` i dróg `OT_SKDR_L` mierzone **od geometrii działki**, nie od punktu; dostępne po wcześniejszym imporcie tych klas.
- RCN: statystyki cen gruntów w **otoczeniu działki** na podstawie bazy lokalnej; nie są to ceny samej działki ani operat.
- MPZP, POG, klasy gleb, obszary chronione, uzbrojenie: dokładne przecięcia, powierzchnie i udziały procentowe tylko dla **zaimportowanych danych wektorowych**. Atrybuty w raportach zachowują oryginalne nazwy ze źródła.
- Każdy brak danych oznaczony jako „niedostępne” — nigdy jako „brak zagrożeń”.

## Dodawanie danych planistycznych i innych warstw

Moduł **nie pobiera automatycznie planów MPZP/POG z WMS**. WMS to obraz i nie dostarcza geometrii wystarczającej do obliczania przecięć. Dane należy pozyskać jako plik wektorowy z urzędu lub Rejestru Urbanistycznego (GML, GeoPackage, GeoJSON) i zweryfikować obowiązywanie aktu. Import wykonuje administrator (lokalnie, narzędziem importu), a nie publiczny formularz.

Wersja na hosting (19.8.0): import wykonuje się **na komputerze administratora** narzędziem
`narzedzia_importu` (Windows: `05_IMPORTUJ_WARSTWE_DZIALEK.cmd`), a gotową bazę wgrywa przez FTP.
Odpowiednik z wiersza poleceń (w katalogu `narzedzia_importu`):

```
.venv\Scripts\python -m msportal.parcel_layers import --category mpzp --source gmina_2204 --file C:\dane\plan.geojson
.venv\Scripts\python -m msportal.hosting przygotuj
```

Plik `do_wgrania\msportal.sqlite3` wgraj do `data/msportal/` na serwerze. Import warstwy nie modyfikuje starej wersji źródła do chwili zatwierdzenia pełnej transakcji SQLite. Dodatkowe kategorie `pog`, `soil`, `protected`, `utilities` można importować analogicznie; sprawdzenie listy: `python -m msportal.parcel_layers list` lub `python -m msportal.hosting status`.

Uwaga: trzeba zweryfikować semantykę danych (status projektu/aktu obowiązującego, typ infrastruktury, symbole planu, daty) przed podjęciem decyzji biznesowej. Niekontrolowane sumowanie obszarów różnych stref może przekroczyć 100% przy nakładających się geometriach.

### Potwierdzone źródła zewnętrzne

- ULDK — https://uldk.gugik.gov.pl/opis.html
- PRG OGC API Features — https://ogcapi.geoportal.gov.pl/res/ims/maps/PRG/apiFeatures
- Rejestr Urbanistyczny — https://rejestr-urbanistyczny.gov.pl/published
- EGiB zbiorczy WFS — https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza

## Uwagi wydajnościowe i bezpieczeństwo

- Limit jednej intensywnej analizy działki naraz (pozostałe zwracają HTTP 429).
- Limit geometrii odpowiedzi ULDK i PRG oraz maks. 1200 kandydatów w jednej kategorii. Przekroczenie limitu oznaczane jako niepełny wynik.
- Import plików Fiona jest strumieniowy, do 120 tys. obiektów na źródło oraz maks. 1 GiB danych wejściowych; sprawdź limit dysku hostingu przed wgraniem bazy.
- Odpowiedzi API nie zawierają tokenów ani ścieżek serwerowych.
- Zewnętrzne żądania tylko do **stałych oficjalnych domen**, brak URL podawanego przez użytkownika.
- Zaimportowane dane wektorowe należy wersjonować i aktualizować zgodnie z datą publikacji źródła.

## Ograniczenia tego etapu

Nie jest to jeszcze gotowa, ogólnopolska, automatyczna analiza prawna działki. Bez przygotowanych danych wektorowych MPZP/POG/GESUT/NMT odpowiednie sekcje raportu są nieaktywne. Nie ma tu jeszcze automatycznego poboru danych wektorowych Rejestru Urbanistycznego ani pełnego generowania PDF z wnioskami prawnymi. PRG i ULDK wymagają dostępności zewnętrznych usług (cURL na hostingu) oraz testu na docelowym serwerze.

## Instalacja

Wersja 19.8.0 działa na zwykłym hostingu (Apache + PHP 8.1+), bez VPS. Instrukcja: `INSTRUKCJA_HOSTING.md` w paczce wydania oraz `README_WGRAJ_NA_SERWER.txt`. Prywatna baza SQLite trafia do `data/msportal/` (katalog zablokowany dla przeglądarek). Nie umieszczaj danych źródłowych w innych publicznych katalogach WWW.
