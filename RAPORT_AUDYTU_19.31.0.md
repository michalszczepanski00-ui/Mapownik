# Mapownik (msportal): audyt, poprawki i testy, wersja 19.31.0

**Wersja wyjściowa:** 19.30.0 działająca na mapownik.swiadectwa.net/test22 oraz niewgrane 19.30.1.
**Data:** 31.10–01.11.2026.

## 1. Podsumowanie

**Gotowość produkcyjna: tak.**
- Nie zostały nierozwiązane błędy krytyczne.
- Wykryłem 5 błędów i naprawiłem wszystkie. Najpoważniejszy: sprawdzanie zagrożenia powodziowego nie działało w ogóle.
- Optymalizacje:
  - podkłady wektorowe blokują przeglądarkę przy przesuwaniu mapy 3–4 razy krócej;
  - ukryte podkłady zwalniają ok. 20 MB pamięci każdy;
  - niedziałające źródło danych nie jest już odpytywane przy każdym przesunięciu mapy.
- Układ, wygląd i sposób obsługi bez zmian. Bez nowych bibliotek.

Ponad 60 funkcji przeszedłem w prawdziwej przeglądarce (Chromium) na desktopie, tablecie i telefonie, ze sprawdzeniem
liczb, a nie tylko tego, czy funkcja się uruchamia:
- pola, długości i bufory porównane z geometrią;
- spadki z NMT przeliczone niezależnie;
- współrzędne po eksporcie i imporcie porównane z oryginałem.

Funkcje zależne od usług blokowanych z mojego środowiska (GDOŚ, PIG, baza BDOT) sprawdziłem na serwerze produkcyjnym,
wyłącznie odczytem.

## 2. Wykryte błędy i poprawki

| # | Waga | Błąd | Poprawka |
|---|---|---|---|
| B1 | **wysoka** | **Zagrożenie powodziowe** (Analizy → Otoczenie działki, Analiza źródła): zawsze błąd 502/504. Wody Polskie wycofały warstwę `NZ.HazardArea`, o którą pytał serwer. Każde sprawdzenie to do 25 zapytań po ~10 s. | Nowe warstwy ISOK: rzeczna, morska, budowle piętrzące. Odpowiedź tekstowa (kilka kB zamiast 5,9 MB geometrii). Wrocław-Kozanów: „w strefie”; Starogard: wynik w 2,5 s. |
| B2 | średnia | **Sonda „W widoku”** przy awarii źródła (teraz: Rejestr Urbanistyczny, 503) wysyłała zapytania przy każdym przesunięciu mapy: 20 zapytań na 10 przesunięć, każde trzyma proces PHP ~10 s. Działające warstwy czekały w kolejce. | Jedno zapytanie na warstwę naraz. Zmiana kadru nie przerywa zapytania. Po błędzie warstwa ma 2 minuty przerwy. Teraz: 1 zapytanie do niedziałającego źródła zamiast 10. |
| B3 | średnia (UX) | **Wysokości obszaru**: podpowiedź „Przeciągnij prostokąt”, a narzędzie działa przez dwa kliknięcia — przeciągnięcie przesuwało mapę. | Podpowiedź „Kliknij jeden narożnik, potem przeciwległy” (jak w narzędziu Prostokąt). |
| B4 | niska | **Opis narzędzia w karcie** (np. Edytuj kształt): trzecia linia nachodziła na zakładki Działka/Raport/Analizy. | Opis ma pełną wysokość (CSS). |
| B5 | niska | **Panel Obiekty**: podpowiedź pola filtru ucięta („Filtruj obie”). | „Filtruj…”; pełny opis zostaje dla czytników ekranu. |

## 3. Optymalizacje (pomiary przed/po w tej samej przeglądarce i na tej samej trasie)

| Obszar | Przed | Po |
|---|---|---|
| Przesuwanie i przybliżanie mapy na podkładzie Pastel: suma zadań blokujących > 50 ms | 7,3–9,4 s | 2,4 s |
| To samo: najdłuższe zacięcie | do 1,4 s | 0,47 s |
| Pamięć po powrocie z Pastel/Zmierzch | +20 MB na stałe | zwolniona po 60 s (32,6 → 14,2 MB) |
| Pamięć po powrocie z Kartograficznego | +23 MB na stałe | zwolniona po 60 s (34,5 → 14,7 MB) |
| Pamięć modelu wysokości (warstwice) | do ~31 MB | do ~12 MB, zwalniana z podkładem |
| Zapytania do niedziałającego źródła przy 10 przesunięciach mapy | 20 (po ~10 s na serwerze) | 1 |

Przyczyna spowolnienia podkładów wektorowych: w 19.30 wszystkie punkty usług i nazwy ulic pokazywały się od z14,5.
Teraz obowiązują progi stylu bazowego (główne od z15, pozostałe od z16–17). Numery adresowe i przeznaczenie terenu zostają.

Bez zmian, bo nie ma problemu:
- długa sesja (15 zmian podkładu, 5 cykli warstw, 15 obiektów, 20 identyfikacji): pamięć stabilizuje się, bez narastania
  liczby warstw, interakcji i słuchaczy zdarzeń;
- API na błędne dane (26 przypadków) odpowiada poprawnymi kodami 4xx, bez ostrzeżeń PHP; próba wyjścia poza katalog odrzucona;
- słuchacze zdarzeń okna, timery i adresy `blob:` są zwalniane.

## 4. Nierozwiązane problemy i ograniczenia (poza kodem portalu)

| Problem | Stan |
|---|---|
| **Rejestr Urbanistyczny** (MPZP/POG „w opracowaniu”, „w trakcie przyjmowania”) | Usługa nie działa: 503 i przekroczenia czasu także przy zapytaniu bezpośrednim. Portal oznacza warstwy ikoną ostrzeżenia, a po zmianie B2 nie obciąża już serwera. |
| GDOŚ, PIG/MIDAS, NMT cieniowanie, archiwalna ortofotomapa | Okresowo blokują albo nie odpowiadają (z mojego środowiska: 403 Incapsula, 502). Na serwerze produkcyjnym GDOŚ działał w czasie testów. |
| Wyszukiwanie adresu z numerem w części miast (np. „Marszałkowska 10, Warszawa” → tylko ulica) | Ograniczenie danych: OpenStreetMap/Nominatim zwraca tylko ulicę. W Starogardzie adres z numerem jest znajdowany. |
| Eksport PNG „bieżący widok” | Działa, ale domyślnie w 0,25 m/px: obraz ok. 3× większy niż ekran (16,6 MB, ~30 s). Grubość linii obiektów nie rośnie z rozdzielczością, więc kontury w eksporcie są cienkie. Zob. rekomendację R5. |
| Opis progu skali warstw (np. KIUT „Widoczna od ~1:2600” przy pasku skali 1:2500) | Kosmetyka: opis liczy skalę dla 52°N, a pasek skali dla bieżącej szerokości. Przycisk „Przybliż” działa poprawnie. |
| Pełna paczka: pliki PHP serwera | Odtworzone, bez możliwości pobrania z hostingu (jak w 19.29/19.30). Bezpieczna droga to paczka aktualizacji: wymienia tylko numery wersji i nakłada poprawkę B1 w miejscu. |

## 5. Wyniki testów

Legenda: **PASS**: działa, wynik sprawdzony; **BLOCKED**: nie dało się sprawdzić z mojego środowiska;
**NOT TESTED**: niesprawdzone w tej rundzie.

| Moduł | Co sprawdzone | Wynik | Status |
|---|---|---|---|
| Wyszukiwanie | miejscowość, ulica, adres z numerem, ID działki | Kórnik, Gusowskiego 20, ID ULDK → karta | PASS |
| Wyszukiwanie | numer działki w obrębach miejscowości | diagnostyka 19.26: 2 działki | PASS |
| Karta działki | ULDK, MPZP, POG, klasa gruntu | pow. 921 m² = geometria ULDK 921,2 m² | PASS |
| Karta działki | Natura 2000, inne formy ochrony (GDOŚ) | na serwerze: „poza”; lokalnie 403 | PASS (serwer) / BLOCKED (lokalnie) |
| Raport działki | ceny RCN, plan ogólny, strefy POG | 48 transakcji, mediana 156 zł/m²; strefy 819 + 102 = 921 m² (100%) | PASS (serwer) |
| Otoczenie działki | BDOT, GDOŚ, NID, powódź | BDOT 3787 obiektów; powódź po B1: poprawne odpowiedzi | PASS po naprawie (było FAIL) |
| Analiza źródła | pokaż obiekty BDOT w widoku | 8 budynków; pola w tabeli = geometria | PASS (serwer) |
| Analiza źródła | odległość i bufor wokół obiektów | silnik: diagnostyka PASS; przez interfejs niesprawdzone | NOT TESTED (UI) |
| Rysowanie | punkt, linia, poligon, prostokąt, okrąg, tekst, strzałka, etykieta, przejazd | linia 150 m; kwadrat 100 m → 10 007 m²; prostokąt 3 202 m²; okrąg r 25 m → 1 961 m²; przejazd 160 m | PASS |
| Edycja | zaznaczenie, przeciąganie wierzchołka, obrót o 15° | 10 007 → 15 011 m² (oczekiwane ≈ 15 000); obrót bez zmiany pola | PASS |
| Edycja | usuń, cofnij, ponów | spójna historia | PASS |
| Pomiary | długość, powierzchnia | 200 m / 2 502 m² (etykiety zgodne z geometrią) | PASS |
| Bufor | 50 m wokół kwadratu 100 m | 37 846 m² (oczekiwane ≈ 37 850) | PASS |
| Profil NMT | 300 m, 32 punkty | spadek maks. 50,56% = niezależne obliczenie 50,6% | PASS |
| Wysokości obszaru | prostokąt 121 × 121 m | deniwelacja 8,7 m, spadek 5,74% S | PASS po naprawie podpowiedzi (B3) |
| Wysokości obszaru | eksport PNG/PDF wyniku | — | NOT TESTED |
| Dodaj działkę (D), Sprawdź (I) | 2 działki z ULDK, karta po kliknięciu | identyfikatory zgodne | PASS |
| Warstwy | 11 typów (KIEG, EGiB, PRG, MPZP, POG, KIUT, BDOT, Natura, powódź, nachylenie, PSE) | renderują się; Natura lokalnie 403 | PASS / BLOCKED (Natura lokalnie) |
| Warstwy | wszystkie źródła WMS (diagnostyka, 58 źródeł) | lokalnie 6 zewnętrznych niedostępnych; na serwerze OK | PASS (serwer) |
| Podkłady | 7 podkładów, w tym Pastel/Zmierzch/Karto | „Podkład OK”, ponowne włączenie po zwolnieniu 2,6 s | PASS |
| Projekt | zapis .mapownik → otwarcie | 3 obiekty, te same geometrie | PASS |
| Projekt | GeoJSON eksport WGS84 i PUWG 1992 → import | współrzędne i pola identyczne; deklaracja `crs` dla 2180 | PASS |
| Projekt | link udostępniania → otwarcie | obiekty odtworzone | PASS |
| Eksport | PNG bieżącego widoku | 4292 × 2748 px, obiekty na mapie, układ PL-1992 (obrót 1,6° = zbieżność południków) | PASS (uwagi w p. 4) |
| Eksport | duży eksport kafelkowy ZIP | backend: diagnostyka PASS | NOT TESTED (UI) |
| Ortofotomapy | panel, rodzaje zdjęć | panel działa; przełączanie lat archiwum niesprawdzone | PASS / NOT TESTED (lata) |
| Menu kontekstowe, paleta poleceń, ustawienia, pomoc | 6 pozycji PPM, 39 poleceń z filtrem | działają | PASS |
| Telefon 390 × 844 i 360 × 640 | karta działki, pomiar celownikiem | 150 + 100 m → 250,2 m; brak przewijania poziomego | PASS |
| Tablet i laptop (768–1920 px) | nakładanie paneli, przewijanie | brak nakładania i przewijania poziomego | PASS |
| Stabilność | długa sesja, 26 błędnych zapytań API | brak narastania pamięci; poprawne 4xx | PASS |
| Diagnostyka wbudowana | 184 testy (w tym 2 nowe dla 19.31) | 175 PASS, 6 źródeł zewnętrznych blokowanych lokalnie, 3 znane ostrzeżenia | PASS / BLOCKED (6) |
| Wdrożenie | symulacja aktualizacji ze stanu serwera (19.30.0 + poprawka 1) | krok 1 (z poprawką identify.php), wgranie, portal, krok 2 → `deployment_consistent: true` | PASS |

## 6. Rekomendacje rozwojowe (do kolejnych wersji, niewdrożone)

Ułożone od największej wartości przy najmniejszym ryzyku.

| # | Rekomendacja | Wartość | Trudność | Ryzyko |
|---|---|---|---|---|
| R1 | **Wyszukiwanie po współrzędnych**: WGS84 („52.2297, 21.0122”), PUWG 1992 i wklejony link Google Maps. Dziś zapytanie ze współrzędnymi nic nie zwraca. | wysoka | niska | niskie |
| R2 | **Przesuwanie całego obiektu** (przeciąganie, strzałki z krokiem w metrach) i kopia z przesunięciem. Dziś edycja obejmuje tylko wierzchołki i obrót. | wysoka | niska | niskie |
| R3 | **Raport działki do PDF** na jednej stronie: mapa, MPZP/POG, ochrona, ceny RCN, profil/wysokości. Do wysłania klientowi lub urzędowi. | wysoka | średnia | niskie |
| R4 | **Analiza całej działki zamiast punktu**: udział stref POG, klas EGiB i form ochrony w powierzchni działki. Raport robi to już dla POG; rozszerzenie na pozostałe źródła z usług WFS. | wysoka | średnio-wysoka | średnie (zależne od usług) |
| R5 | **Eksport „jak na ekranie”** z podkładami wektorowymi. Grubość linii skalowana do rozdzielczości, domyślnie rozdzielczość ekranu ×2. | średnio-wysoka | średnia | niskie |
| R6 | **Lista i porównanie działek projektu**: tabela z powierzchnią, MPZP/POG, ochroną i cenami, eksport CSV. Do wyboru lokalizacji inwestycji. | średnio-wysoka | średnia | niskie |
| R7 | **Alarmy o awariach**: zewnętrzny monitor `health.php` (np. co 5 min z e-mailem), dzienny raport wyłączników awaryjnych i zbieranie błędów z przeglądarek. | średnia (operacyjnie wysoka) | niska | niskie |
| R8 | **Szybszy pierwszy start**: lista `modulepreload` albo jeden plik kodu przy wydaniu. Dziś ok. 250 modułów w ~21 falach: 12,6 s z mojego środowiska, ponowne wejście 1,2 s. | średnia | średnia | średnie (pamięć podręczna) |

Do rozważenia później: spadki i warstwice z NMT 1 m GUGiK zamiast modelu ~30 m; automatyczna kopia projektu do pliku
raz na sesję.
