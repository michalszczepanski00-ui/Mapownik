# Mapownik 18.18.3 — wiarygodne „jest / nie ma" w oknie informacji, diagnostyka, podbijanie wersji

16.10.2026

## Okno informacji o obiekcie: Natura 2000 i inne warstwy

**Błąd:** okno pokazywało „TAK" i „Natura 2000: w obszarze" także tam, gdzie obszaru nie było. Przyczyna była w `api/identify.php`: obiekt uznawano za znaleziony, jeśli w odpowiedzi HTML po usunięciu znaczników został jakikolwiek tekst. GeoServer GDOŚ dla pustego punktu zwraca stronę z tytułem „Geoserver GetFeatureInfo output" i ten tytuł dawał fałszywe „Tak". Ten sam mechanizm dotyczył form ochrony przyrody i innych usług GeoServer/ArcGIS/MapServer.

**Zmiana:**
- O obecności obiektu decyduje liczba obiektów w odpowiedzi strukturalnej: JSON, GML (GeoServer, MapServer) albo XML (ArcGIS). Pusta odpowiedź strukturalna to rozstrzygające „brak".
- HTML i tekst są tylko rezerwą dla usług bez formatu strukturalnego, z ostrzejszymi regułami: nagłówek i tytuł strony nie są treścią; tabela bez wierszy danych, sam nagłówek warstwy MapServera albo kolekcji ArcGIS to „brak".
- Zapamiętywany jest działający format odpowiedzi każdej usługi, żeby kolejne zapytania nie próbowały formatów nieobsługiwanych.
- Odpowiedź API ma `count` (liczba obiektów) i `basis` (`structured` albo `text`).
- Opis obiektu z JSON/GML/XML to czytelne pary „pole: wartość" bez geometrii i pól technicznych.
- Podsumowanie pokazuje, w którym obszarze jest punkt: „Natura 2000 — w obszarze: PLH220033 Dolna Wisła" (pełna szerokość, bez ucinania).
- Status źródła w listach to „znaleziono" zamiast „TAK".
- Testy parsera: `php tools/test_identify_parse.php` (18 przypadków: GeoServer, MapServer, ArcGIS, wyjątki usług).

## Diagnostyka bez fałszywych błędów

W 18.18.0–18.18.2 diagnostyka miała 9 błędów niezwiązanych z siecią. Każdy był nieaktualnym testem po zmianach w kodzie; żadna funkcja nie zniknęła:

| Test | Przyczyna | Zmiana testu |
| --- | --- | --- |
| Klasyfikacja budynków BDOT | test czytał `tools/build_bdot_store.py`, którego nie ma w paczce serwerowej | znane ograniczenie (ostrzeżenie) |
| Profil ciężarówki | od 18.13.0 profil to `EU_SEMITRAILER_16_5` (model kinematyczny) | sprawdza nowy profil i zapis `typical-eu-semitrailer` |
| Klasy EGiB | grupa „Działki i grunty" od 18.18.0 | nowa nazwa grupy |
| Transport WMS | klasy EGiB celowo przez proxy (dwa warianty usługi); zestaw KIUT tylko EPSG:2180; strefy POG z Rejestru Urbanistycznego; nazwy KIUT z 18.18.0 | wyjątki i oczekiwania zgodne z katalogiem |
| Cache kafli | warstwy tematyczne celowo 128 kafli (17.8.11) | oczekiwane 512/128 |
| Status źródła | teksty po polsku („zapamiętane obrazy") | nowy tekst |
| Eksport — world file | etykieta „Plik georeferencji (world file)" | wielkość liter |
| Ikony narzędzi | Punkt ma ikonę `pin-plus` | dopuszczona |
| Audyt źródeł | 20 źródeł z 18.18.0 nie miało żadnej próby | nowy test „pozostałe źródła z katalogu" sprawdza każde źródło bez osobnego testu |

Dodatkowo diagnostyka CSS czyta teraz także `31-ux.css` (wcześniej pomijała ten plik).

Wynik po zmianach w środowisku testowym: jedyne błędy to usługi zewnętrzne niedostępne z tego środowiska (HTTP 403/502). Na serwerze z dostępem do usług diagnostyka powinna być zielona poza chwilowymi awariami źródeł.

## Podbijanie wersji

`tools/bump_version.py` (odwołuje się do niego `.htaccess`, ale wcześniej go nie było):

- `python3 tools/bump_version.py 18.18.4` zmienia nazwę `app-*`, odwołania `?v=`, wersje w API, monitorze, diagnostyce i `.htaccess`, `VERSION.txt` i nagłówki README; nie rusza komentarzy historycznych, `ZMIANY_*.md`, `audyt/`, `vendor/`.
- `--dry-run` pokazuje zmiany bez zapisu, `--check` sprawdza spójność (te same warunki co `verify-deployment.php` oraz brak pozostałości poprzedniej wersji); kod wyjścia 1 przy problemie.
- Ta wersja została podbita tym skryptem.

`.htaccess` blokuje dostęp do `tools/` przez WWW.

## Wdrożenie

Wgraj `app-18.18.3/`, `api/` (nowy `_identify_parse.php`), `assets/`, `monitor/`, `.htaccess`, `index.html`, `diagnostyka.html` i pliki z katalogu głównego; usuń `app-18.18.2/` i starsze. Po wgraniu: `verify-deployment.php`, potem `diagnostyka.html`. Plik `cache/identify-winner/` można usunąć, żeby usługi od razu przeszły na formaty strukturalne (i tak nastąpi to przy pierwszym zapytaniu).
