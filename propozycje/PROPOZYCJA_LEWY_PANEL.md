# Propozycja: uproszczenie lewego panelu (karta działki)

**Stan bazowy:** 19.50.0. Pomiar 18.11.2026 na lokalnym serwerze: działka 221312_2.0405.27/1, ekran 1440×900.

**Pliki obok:**
- `lewy-panel-porownanie.png` — dzisiejsza karta obok makiety;
- `lewy-panel-makieta.html` — makieta do otwarcia w przeglądarce.

## 1. Co dziś pokazuje karta

| Miara | Wartość |
|---|---|
| Treść karty | **1550 px**, widać 684 px — **2,3 ekranu** przewijania |
| Wszystkie sekcje rozwinięte | 2408 px (3,5 ekranu) |
| Przyciski w karcie | **34** |
| Wiersze tekstu / słowa | 70 / 314 |
| Wyniki działki widoczne bez przewijania | werdykt i przyciski; szczegóły (planowanie, ograniczenia) dopiero po przewinięciu |

Przyciski (34):

| Grupa | Liczba |
|---|---|
| Nagłówek | 3 |
| Zakładki | 3 |
| Kopiowanie identyfikatora i współrzędnych | 4 |
| Oko „Pokaż na mapie” | 8 |
| Akcje | 6 |
| W okolicy | 2 |
| „Ponów” | 4 |
| „+ N źródeł bez wyniku (pokaż)” | 4 |

## 2. Co utrudnia czytanie

1. **Te same dane dwa razy.**
   - Werdykt (8 wierszy) streszcza te same źródła, które niżej powtarzają cztery sekcje (Planowanie przestrzenne, Grunty, Ograniczenia, Pozostałe dane).
   - Przykład: MPZP — w werdykcie „obowiązuje”, w sekcji „znaleziono” z tym samym opisem.
2. **Dużo „niczego”.**
   - Przy tej działce 6 z 8 wierszy werdyktu mówi to samo: nic tu nie ma.
   - Sekcje pokazują „0/10”, „Brak wyniku w jednym sprawdzonym źródle”, „+ 7 źródeł bez wyniku (pokaż)”.
3. **Szum techniczny w treści.**
   - Liczniki „2/4”, „0/10 · 3 błędy”.
   - Ramka „3 źródła nie odpowiadają…” i ramka „Wyniki dotyczą punktu wskazania…”.
   - Nota o klasach EGiB.
   - To pięć bloków informacji o działaniu usług, a nie o działce.
4. **Wartości zawijają się w dwie linie:** „poza · dane EEA”, „brak w rejestrze”, „brak lasu w BDL”.
5. **Za dużo równorzędnych przycisków.**
   - Sześć akcji w dwóch rzędach, w tym dwa wyróżnione: „Otoczenie” wypełniony, „Raport PDF” obrysowany.
   - Do tego 8 oczu.
6. **Nazwy się dublują.**
   - Zakładka „Raport” (formularz raportu i ceny transakcyjne) a przycisk „Raport PDF”.
   - Zakładka „Analizy” (otoczenie) a przycisk „Otoczenie” — ta sama funkcja w dwóch miejscach.
7. **Nagłówek zajmuje 4 wiersze.**
   - „Działka i narzędzia”, zakładki, nazwa działki.
   - Powierzchnia podana dwa razy (ha i m²), zawinięta.
   - Identyfikator w osobnym wierszu.

## 3. Propozycja

Makieta: `lewy-panel-porownanie.png`, kolumny A–C. Ta sama szerokość (268 px), paleta Las, gęstość zwarta. Żadna funkcja nie znika — zmienia się miejsce i sposób wywołania.

| # | Zmiana | Zamiast |
|---|---|---|
| P1 | **Nagłówek w 3 liniach, przyklejony u góry:** „Działka 27/1” · „21,85 ha · Janowo · gm. Starogard Gdański” · przyciski. Ikony: zwiń, ⋯ (przypnij, kopiuj identyfikator, kopiuj współrzędne), zamknij. | tytuł „Działka i narzędzia”, zakładki, powierzchnia w ha i m², osobny wiersz identyfikatora |
| P2 | **Trzy przyciski akcji:** **Raport PDF** (jedyny wypełniony) · Do projektu · **Analizy ▾**. Menu Analizy: Otoczenie, Ceny transakcyjne, Budowy i pozwolenia, Analiza działki (serwer) │ Bufor, Obszar analizowany WZ, Wysokości i nachylenie, Profil terenu, Teren 3D. Każda pozycja wywołuje tę samą funkcję co dziś. | 6 przycisków w 2 rzędach, dwa wyróżnione |
| P3 | **Wynik w dwóch grupach.** *Planowanie* — MPZP i plan ogólny zawsze. *Ograniczenia* — osobne wiersze tylko dla tego, co **dotyczy** działki (pomarańczowy „!”). Reszta w jednej linii: „Brak: Natura 2000, inne formy ochrony, zabytek, powódź, las”. „Nie sprawdzono” (?) — osobny wiersz z „Ponów”. | 8 wierszy werdyktu, w tym 6 × „brak” |
| P4 | **Szczegóły rozwijane w wierszu** (›): uchwała, strefa i parametry planu, nazwa i kod obszaru Natura, poziom hałasu w dB, poziom ryzyka powodziowego. W rozwinięciu „Pokaż na mapie”. | 4 sekcje szczegółów pod werdyktem (zastępuje M15) |
| P5 | **Krótkie wartości bez zawijania**, najwyżej 2–3 słowa: „obowiązuje”, „projekt · 107SO”, „w rejestrze”, „obszar zagrożenia”, „55–59 dB”. Źródło zapasowe EEA jako mały znacznik `EEA` z opisem w dymku. | „poza · dane EEA”, „brak lasu w BDL” w dwóch liniach |
| P6 | **W okolicy** bez zmian w treści (Rynek, Budowy). Kliknięcie otwiera dok Analizy z właściwym widokiem. | — |
| P7 | **Jedna linia stanu źródeł** na dole: „15 z 18 źródeł · 3 bez odpowiedzi · Ponów”. | ramka ostrzeżenia, ramka „punkt wskazania”, liczniki „0/10 · 3 błędy”, 4 przyciski „Ponów”, 4 × „+ N źródeł bez wyniku” |
| P8 | **„Szczegóły i źródła” (zwinięte):** powiat, województwo, współrzędne i identyfikator z kopiowaniem, nota o punkcie wskazania (mały tekst), pełna lista 18 źródeł ze stanem. | ta sama treść rozrzucona po karcie |
| P9 | **Bez zakładek Działka / Raport / Analizy.** Formularz raportu → Analizy → „Analiza działki (serwer)”. Ceny → Analizy → Ceny („Wokół działki / W widoku mapy”). Otoczenie → Analizy → Otoczenie. Wszystko to decyzje już podjęte po Etapie 0. | zakładka „Raport” z cenami w środku, zakładka „Analizy” obok przycisku „Otoczenie” |
| P10 | **Ładowanie:** szkielet wierszy zamiast „…”. Wiersze nie przeskakują, gdy przychodzą kolejne źródła. | wartości „…” i przesuwanie się treści |

### Efekt (makieta)

| | Dziś | Propozycja |
|---|---|---|
| Wysokość treści (działka 27/1) | 1550 px | **ok. 440 px** — mieści się bez przewijania przy 1280×800 |
| Z rozwiniętym wierszem i menu Analizy | — | ok. 530 px |
| Przyciski widoczne od razu | 34 | **8** (3 akcje, 3 ikony nagłówka, „Ponów”, „Szczegóły”) + strzałki wierszy |
| Słowa | 314 | ok. 70 |
| Powtórzone informacje | werdykt + 4 sekcje | brak |
| Udział mapy | 75 / 78 / 83 % | bez zmian (ta sama szerokość) |

Kolumna C makiety pokazuje działkę z ograniczeniami (dane przykładowe, ilustracja): trzy wiersze „!” na górze grupy, reszta w linii „Brak: …”.

## 4. Związek z planem przebudowy

To w większości **Etap 4 („Inspektor bez zakładek”: M5, M8, M13, M15)** i część **Etapu 5** (zakładka Raport → widok w Analizach). Ponad specyfikację (5.2) proponuję:
- **P3 — linia „Brak: …”:** specyfikacja zakłada osobny wiersz z okiem dla każdej pozycji werdyktu. Grupowanie skraca kartę najbardziej, ale jest odstępstwem.
- **P7 — jedna linia stanu źródeł** zamiast dwóch ramek i liczników.
- **P1 — powierzchnia tylko w ha** (m² w dymku), identyfikator w „Szczegółach”.

Specyfikacja mówi o szerokości 300 px. Proponuję zostać przy 268 px, bo ograniczenie 9 mówi: „nowe panele nie mogą zasłaniać mapy bardziej niż obecne”. Przy krótkich wartościach (P5) 268 px wystarcza.

## 5. Decyzje do podjęcia

1. **„Brak: …” w jednej linii (P3)** — zgoda na odstępstwo od 5.2 pkt 2 (oko przy każdym wierszu)? Oko zostaje w rozwinięciu wiersza i przy pozycjach, które dotyczą działki.
2. **Szerokość karty:** 268 px (mapa bez zmian) czy 300 px ze specyfikacji?
3. **Pozycje zawsze widoczne jako osobny wiersz:** proponuję MPZP i plan ogólny. Czy dodać np. Natura 2000 i powódź, nawet gdy „brak”?
4. **Kolejność wdrożenia.** Usunięcie zakładek (P9) wymaga nowego miejsca na formularz raportu i ceny (dok Analizy z Etapu 5). Do wyboru:
   - **a)** Etap 4 bez P9, zakładki zostają do Etapu 5;
   - **b)** Etapy 4 i 5 razem — specyfikacja wymaga na to Twojej zgody.
5. **Najpierw akceptacja Etapu 2** (pasek kontekstowy) i wydania 19.50.0 — Etap 4 zbuduję na nich.
