# msportal 19.51.0 — uproszczona karta działki (lewy panel)

Wdrożenie propozycji P1–P10 z `propozycje/PROPOZYCJA_LEWY_PANEL.md`. Porównanie przed i po: `propozycje/lewy-panel-przed-po.png`.

Wydanie zbudowane na 19.50.0 — zawiera też Etap 2 przebudowy UI (pasek kontekstowy) i warstwy z 19.50.0, które czekają na akceptację.

## Efekt (działka 221312_2.0405.27/1, 1440×900)

| | 19.50.0 | 19.51.0 |
|---|---|---|
| Wysokość karty | 1550 px treści — 2,3 ekranu przewijania | **ok. 560 px — bez przewijania**, także przy 1280×800 |
| Przyciski na wierzchu | 34 | 3 akcje + 3 ikony karty + strzałki wierszy |
| Słowa | 314 | ok. 80 |
| Te same dane w werdykcie i w 4 sekcjach | tak | nie — szczegóły rozwijają się w wierszu |
| Udział mapy | 75 / 78 / 83 % | bez zmian (szerokość karty 268 px) |

## Co się zmieniło

**Nagłówek (P1):**
- „Działka 27/1” i jedna linia: „21,85 ha · Janowo · gm. Starogard Gdański” (pełna powierzchnia z m² w dymku);
- ikony karty (zwiń, przypnij, zamknij) obok numeru, bez osobnego wiersza;
- obręb bez nazwy (np. „089”) ma dopisek „obręb”;
- tytuł „Działka i narzędzia” i zakładki zniknęły.

**Trzy przyciski (P2):**
- **Raport PDF** (jedyny wypełniony), **Do projektu**, **Analizy ▾**;
- menu Analizy: Otoczenie działki, Ceny transakcyjne, Budowy i pozwolenia, Analiza działki (serwer) │ Bufor, Obszar analizowany WZ, Wysokości i nachylenie, Profil terenu, Teren 3D;
- każda pozycja wywołuje tę samą funkcję co dotychczasowe przyciski i zakładki.

**Wynik w grupach (P3):**

| Grupa | Co pokazuje |
|---|---|
| Planowanie | MPZP i plan ogólny — zawsze |
| Ograniczenia | osobny wiersz (pomarańczowe „!”) tylko dla tego, co dotyczy działki: Natura 2000, forma ochrony, zabytek, powódź, las, wody podziemne (GZWP), hałas, złoże, obszar górniczy |
| | reszta w jednej linii „Brak: …” |
| | „nie sprawdzono” ma osobny wiersz z „Ponów sprawdzenie” |
| Grunt | klasa gruntu; zasób KOWR i pompa ciepła — gdy są w punkcie |
| Włączone warstwy | trafienia warstw, które włączył użytkownik |

**Pozostałe zmiany:**
- **Szczegóły w wierszu (P4):** strzałka › rozwija opis źródła (uchwała, strefa planu, kod i nazwa obszaru, poziom hałasu w dB, poziom ryzyka powodziowego) z przyciskiem „Pokaż na mapie”. Zastępuje cztery sekcje pod werdyktem.
- **Krótkie wartości (P5):** „obowiązuje”, „projekt · 107SO”, „Kampinoski PN”, „strefa ryzyka”, „GZWP 2151”, „60–64 dB”. Źródło zapasowe EEA jako znacznik `EEA`, wyjaśnienie w dymku i w rozwinięciu.
- **W okolicy (P6):** bez zmian w treści.
- **Stan źródeł (P7):** jedna linia „Źródła: 16/17 · 1 bez odpowiedzi · Ponów” zamiast ramki ostrzeżenia, ramki o punkcie wskazania i liczników sekcji.
- **„Szczegóły i źródła” (P8, zwinięte):**
  - identyfikator, powiat, województwo, powierzchnia, współrzędne — z kopiowaniem;
  - uwaga o punkcie wskazania;
  - pełna lista wszystkich źródeł ze stanem i „Ponów” (dawne sekcje — nic nie zniknęło).
- **Bez zakładek (P9):**
  - „Analiza działki (serwer)” (dawna zakładka Raport) i „Otoczenie działki” (dawna zakładka Analizy) otwiera menu Analizy, w tym samym miejscu karty, z przyciskiem **„← Działka 27/1”**;
  - ceny i budowy otwierają się w prawym doku, jak dotąd.
- **Ładowanie (P10):** szkielet wartości i linia „Sprawdzam: …” zamiast „…”. Szkielet bez animacji (specyfikacja: żadnych animacji dłuższych niż 150 ms).

## Odstępstwa od specyfikacji przebudowy (5.2)
1. **Linia „Brak: …”** zamiast osobnego wiersza z okiem dla każdej pozycji. Oko jest w rozwinięciu każdego wiersza, który ma warstwę.
2. **Szerokość karty 268 px** zamiast 300 px — ograniczenie 9 (nowe panele nie mogą zasłaniać mapy bardziej niż obecne).
3. **Analizy:**
   - widoki „Analiza działki (serwer)” i „Otoczenie” są na razie w lewej karcie z przyciskiem powrotu, a nie w doku Analizy po prawej — dok Analizy to Etap 5;
   - Ceny i Budowy dalej mają osobne ikony w prawej kolumnie.
4. **Telefon bez zmian:** karta na telefonie (`MobileParcelCard`) ma dotychczasowy układ.

## Poprawka z 19.50.0
Test diagnostyki „transport WMS” odrzucał trzy warstwy ekoportalu (składowiska, hałas), które celowo działają tylko przez serwer. Dopisane do listy dozwolonych — test przechodzi.

## Testy
| Test | Wynik |
|---|---|
| Vitest | 88/88 — nowe: krótkie wartości, skróty nazw, stan pozycji z kilku źródeł |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 — „Wysokości” wywoływane z menu Analizy |
| Diagnostyka (lokalny Apache) | 199 testów, 190 OK |
| Konsola przeglądarki | 0 błędów |
| Udział mapy | bez zmian |

- **Diagnostyka — nowy test:** 19.51.0 (karta działki).
- **Diagnostyka — co nie przechodzi:**
  - usługi zewnętrzne: Rejestr Urbanistyczny, część GDOŚ;
  - brak bazy RWDZ;
  - znany test „Faza 4”.

**Sprawdzone w przeglądarce:**
- działki: Starogard (27/1), Kampinos (5 ograniczeń), Gdańsk (zabytek, GZWP, pompa ciepła), Żuławy (strefa ryzyka);
- rozwinięcie MPZP i „Pokaż na mapie”;
- wszystkie pozycje menu Analizy;
- przejścia „← Działka”.

## Wgranie
Do **nowego** katalogu testowego, np. `/test26/`: cała zawartość `msportal-19.51.0-serwer.zip`, `index.html` i `.htaccess` na końcu. Zadania cron — `README_CRON_OVH.txt` (ścieżka z nowym katalogiem).

**Nie nadpisuj `/test22/` ani produkcji.**
