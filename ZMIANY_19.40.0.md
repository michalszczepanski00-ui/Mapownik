# msportal 19.40.0 — raport PDF dla inwestycji OZE i przemysłowych

Wdrożone rekomendacje 1–6 z audytu raportu PDF. Rekomendacje 7–8 (linie SN/WN z OSM, moce przyłączeniowe operatorów) wymagają najpierw pilotażu danych i nie są w tej wersji.

## Co nowego

### 1. Karta decyzyjna na stronie 1
- **Tabela parametrów terenu**, przy każdym parametrze rodzaj informacji: FAKT, OBLICZENIE albo DO WERYFIKACJI. Parametry:
  - powierzchnia i wymiary;
  - plan ogólny, MPZP, obszar uzupełnienia zabudowy;
  - teren;
  - ograniczenia środowiskowe (udział powierzchni), powódź;
  - gleby;
  - zabudowa mieszkaniowa;
  - sieć elektroenergetyczna i gazowa.
- **„Ograniczenia i ryzyka”** w trzech grupach: może wykluczyć lokalizację, wymaga procedury lub uzgodnienia, informacyjne.
- **„Do weryfikacji”** z linkami do źródeł: GDOŚ, ISOK, NID, MIDAS, PSG, KOWR.
- **Zdanie końcowe:** „Wstępna analiza danych publicznych — nie potwierdza możliwości realizacji inwestycji”.
- **Awaria usługi** jest teraz „do weryfikacji”, a nie „UWAGA”.

### 2. Ograniczenia na całej powierzchni zamiast w 1–5 punktach
- **Udział powierzchni** z analizy obrazu usług:
  - powódź (ISOK) z rozpoznaniem obszaru szczególnego zagrożenia (scenariusze 10% / 1%);
  - Natura 2000 i formy ochrony (GDOŚ);
  - lasy i wody (BDOT10k);
  - złoża i obszary górnicze (MIDAS).
- **Odległości** do tych obiektów poza terenem.
- **Gleby:** siatka do 17 punktów. Kompleksy przydatności z mapy glebowo-rolniczej, a klasy z ewidencji tam, gdzie powiat je udostępnia.
- **Zabytki:** rejestr NID w punktach siatki.
- **Obszar uzupełnienia zabudowy:** z planu ogólnego (symbol OUZ).

### 3. Zabudowa mieszkaniowa w pasmach 100 / 300 / 500 / 1000 m
- **Dane:** najbliższy budynek mieszkalny, liczba budynków i mapa z budynkami w kolorach pasm.
- **Źródło:** lokalny magazyn BDOT10k (`data/bdot_buildings/`, ten sam co w Analizach). Gdy magazynu nie ma albo obszar jest poza jego zasięgiem, raport pisze „niesprawdzona” (do weryfikacji), a nie „0 budynków”.
- **Ta sama sekcja zawiera też:**
  - biogazownie rolnicze z rejestru KOWR w 10 / 20 km (lokalizacje orientacyjne);
  - inwestycje energetyczne i przemysłowe z RWDZ w 1,5 km.

### 4. Wymiary i kształt
- **Wymiary:** prostokąt opisany, najmniejsza szerokość, wydłużenie, zwartość.
- **Największy prostokąt w terenie** — pokazany na mapie działki żółtą linią przerywaną.

### 5. Typ inwestycji, reguły i moduł
- **Typ inwestycji w oknie raportu:**
  - ogólny;
  - biometanownia / biogazownia;
  - fotowoltaika / magazyn energii;
  - przemysł / logistyka / odpady.
- **Reguły:** jawne, w wersji 1.0 (`report/reportRules.js`). Progi i wyłączenia ustawia się w `konfiguracja/raport-pdf.json` → `"reguly"` (opis w `konfiguracja/README.txt`).
- **Strona modułu:** parametry ważne dla danego typu i lista „Sprawdź u źródła”.
- **Nowy szablon „OZE i przemysł”:** bez cen i budów domów, uzbrojenie w 300 m.
- **Nowe ustawienie:** promień uzbrojenia 60 / 150 / 300 / 500 m.

### 6. Teren inwestycji z kilku działek
- **Dodawanie działek:** w oknie raportu, po identyfikatorze, do 10 działek.
- **Ocena całości:** powierzchnia, kształt, ograniczenia, otoczenie, strefy planu ogólnego (sumowane w m²).

### Prezentacja
- **Puste wyniki** (ceny, budowy, las) zebrane w jednym wierszu „Sprawdzono bez wyników”.
- **Mapa tematyczna środowiska** w skali terenu: Natura 2000, formy ochrony, powódź, lasy, wody.
- **Tabela źródeł:** osobno „Pobrano” i „Aktualność zbioru” (np. data map ISOK, rejestru KOWR, bazy RWDZ). W stopce wersja reguł.

## Serwer
- **`api/_wms_sources.php`:** dwa nowe źródła obrazu dla raportu: `flood_isok` (ISOK) i `bdot10k_forest` (lasy BDOT10k). Bez nowych plików PHP.

## Kontrola
- **Raporty w przeglądarce, bez błędów w konsoli:**
  - Witankowo: teren z 2 działek (41,6 ha), biometan — 9 stron, 63 s;
  - Witankowo: 1 działka, PV — 9 stron, 71 s;
  - Starogard: 1 działka, przemysł — 10 stron, 72 s;
  - Starogard: szablon „Dla kupującego” — 8 stron, 42 s.
- **Strona 1** mieści kartę decyzyjną w raporcie Starogardu. Przy wielu sprawach do weryfikacji karta przechodzi na stronę 2.
- **Diagnostyka:** 189 testów przechodzi, w tym nowy test 19.40.0. Nie przechodzi 5, wszystkie przez zewnętrzne serwery niedostępne z testowego środowiska (GDOŚ 403, PIG-PIB i KOWR 502).
- **Scenariusze interfejsu** na 1366×768: 14 z 14 przechodzi.
- **Ograniczenie testu:** zabudowę mieszkaniową sprawdzono na kilku syntetycznych budynkach testowych. Prawdziwy magazyn BDOT10k nie był dostępny.

## Wgranie (aktualizacja_19.40.0.zip)
1. Wgraj `aktualizuj-19.40.0.php` i od razu go otwórz. Sprawdź `katalog_api`.
2. Wgraj resztę paczki:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`;
   - `assets/css/37-raport-pdf.css`;
   - `app-19.40.0/`;
   - cały katalog `api/`;
   - `konfiguracja/` (README i przykład).
3. Odśwież stronę: Ctrl+Shift+R.
4. Otwórz `aktualizuj-19.40.0.php?sprzatanie=1`.
5. Zabudowa mieszkaniowa w raporcie: magazyn BDOT10k w `data/bdot_buildings/` dla obszarów, w których pracujesz.
