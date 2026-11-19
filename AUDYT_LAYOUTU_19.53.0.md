# Audyt layoutu — msportal 19.53.0

Audyt samego układu i warstwy wizualnej, bez zmian w kodzie. Rama: zasady projektowe (skill *frontend-design*) i reguły przebudowy:
- mapa ma pierwszeństwo;
- bez dolnych paneli;
- tylko gęstość zwarta;
- paleta „Las” bez nowych akcentów;
- desktop 1280–1920 przed telefonem.

**Materiał:**
- zrzuty 1280×800, 1440×900, 1920×1080 i telefonu;
- motyw ciemny;
- pomiary z przeglądarki (położenie i wymiary elementów, czcionki, promienie, cienie, fokus);
- przegląd 21 plików CSS.

Oznaczone zrzuty i surowe pomiary są w `audyt/layout-19.53.0/`.

## Wniosek w trzech zdaniach

Szkielet jest dobry:
- mapa zajmuje 75–83% szerokości;
- nie ma dolnych paneli;
- jest jeden wypełniony przycisk i jeden akcent;
- zewnętrzny margines 8 px jest stały.

Słabością jest wykończenie: interfejs to 10 jednakowych „wysp” z tym samym cieniem i promieniem, zbudowanych z 19 rozmiarów czcionki, 22 promieni i 29 cieni. Kolumny 250–260 px obcinają właśnie te informacje, po które użytkownik przychodzi (symbol strefy planu, gmina, tytuły widoków).

Większość poprawek to porządek w tokenach i trzech komponentach, bez zmiany układu.

## Co działa (zostawić)

| | |
|---|---|
| Mapa | 75 / 78 / 83% szerokości bez doku; z dokiem 76 / 60 / 70% (przy 1280 karta zwija się sama) |
| Hierarchia akcji | jeden wypełniony przycisk w pasku (Udostępnij), jeden w karcie (Raport PDF) |
| Krawędzie | stały margines 8 px od krawędzi okna po obu stronach |
| Karta działki | grupy Planowanie · Ograniczenia · Grunt, negatywne wyniki zebrane w jedną linię „Brak: …” |
| Stopka | skala, atrybucja i stan źródła w jednej linii, ostrzeżenie tylko przy problemie |

## Ustalenia

Priorytet:
- **P1** — widoczny błąd albo utrata informacji;
- **P2** — niespójność, którą widać;
- **P3** — dług, który rodzi kolejne niespójności.

### Siatka i położenie

**L1 · Górny pasek ma trzy wysokości i trzy linie dolne — P2**
- Pomiar:

  | Element | Wysokość | Dolna krawędź |
  |---|---|---|
  | Znak, wyszukiwarka | 40 px | 48 px |
  | Projekt, Udostępnij | 36 px | 44 px |
  | Ustawienia | 32 px (góra na 10 px) | 42 px |

  - Pomoc nie ma tła ani cienia, choć jej sąsiedzi to białe „pigułki”.
- Na zrzucie wygląda to jak cztery różne rodzaje przycisków w jednym rzędzie.
- **Poprawka:** jedna wysokość 36 px dla wszystkich kontrolek paska, wspólna górna krawędź 8 px; pomoc i ustawienia w tej samej formie.

**L2 · Lewa strona nie ma wspólnej kolumny — P2**
- Wyszukiwarka: x 54, szerokość 440 px. Karta działki: x 8, szerokość 260 px.
- Karta zaczyna się na y 56, a prawa kolumna i dok na y 52.
- Dwie krawędzie, które powinny tworzyć jedną kolumnę, rozjeżdżają się o 46 px w poziomie i 4 px w pionie.
- **Poprawka:** karta i wyszukiwarka na wspólnej lewej krawędzi (znak w kolumnie nad kartą albo wyszukiwarka od x 8); jedna górna linia drugiego rzędu (52 px) dla karty, doku i kolumny ikon.

**L3 · Dok ma 250 px, choć panele deklarują 320–340 px — P1**
- `store/panelsSlice.js`: `right.defaultSize: 250` dla wszystkich widoków doku. `defaultWidth` z deklaracji panelu działa tylko w oknie odpiętym.
- Skutek przy 1280 i 1440:
  - obcięte „Ceny tra…”, „Rejestr Ce…”, „Pobierz C…”;
  - osierocone „m” w liście transakcji;
  - opisy w doku Analizy w 4 wierszach.
- **Poprawka:** szerokość doku z deklaracji panelu (Analizy, Ceny 300 px; Warstwy 280 px). Zabiera to mapie 30–50 px przy otwartym doku — decyzja 1 niżej.

**L4 · Karta ma 260 px na każdym ekranie — P1**
- Przy 1920 px wolnej mapy jest 1650 px, a karta i tak obcina:
  - „uchwalony · 107SO” — symbol strefy jest sednem odpowiedzi;
  - „gm. Starogard Gd…”.
- **Poprawka bez zabierania mapy:** wiersz wyniku przechodzi na dwie linie, gdy wartość nie mieści się (etykieta nad wartością). Nagłówek dostaje dwie linie zamiast jednej z kropkami: powierzchnia osobno, położenie osobno.

**L5 · Pasek trybów przeskakuje przy otwarciu doku — P2**
- Środek paska przy 1440: 826 px bez doku, 700 px z dokiem. Każde otwarcie Warstw przesuwa go o 126 px.
- Dok nigdy nie zasłania środka okna (przy 1280 dok zaczyna się na 968 px, pasek kończy na 803 px).
- **Poprawka:** pasek wyśrodkowany względem okna, nie widocznej mapy.

**L6 · Zwinięta karta to sam szewron — P2**
- Przy 1280 z otwartym dokiem zostaje przycisk 44×40 px z „›”, bez nazwy.
- **Poprawka:** przycisk z treścią „Działka 27/1 ›” (ta sama wysokość 36 px).

### Komponenty

**K1 · Trzy różne przełączniki segmentowe — P1 (Warstwy), P2 (reszta)**
- W jednym produkcie, a w doku Ceny nawet na jednym ekranie:
  - „Wokół działki | W widoku mapy” — ramka i pełne wypełnienie;
  - „Grunty | Domy | Mieszkania” — szare tło i pigułka;
  - filtry Warstw — trzecia forma.
- **Filtry Warstw są popsute:**
  - licznik wypada pod etykietą, wysokość 39 px;
  - „Wszystkie” ma licznik w ramce;
  - „W widoku” pokazuje „…” w trakcie sond;
  - etykiety nie są wyrównane do jednej linii bazowej.
- **Poprawka:** jeden komponent: 30 px, licznik w tej samej linii („Wszystkie 62”), aktywna pozycja w kolorze Polany z tekstem Las.

**K2 · Karty w kartach — P2**
- „W okolicy” to ramka w karcie działki.
- Pozycje doku Analizy to karty w panelu.
- Ceny mają trzy poziomy: panel → ramka → zielone pole. Ramka nie niesie tu informacji, tylko odbiera 20–24 px szerokości w kolumnie, która i tak jest za wąska (L3, L4).
- **Poprawka:** sekcje rozdziela linia i nagłówek grupy, jak Planowanie / Ograniczenia w karcie. Tło Polany zostaje tylko dla wyniku (mediana ceny).

**K3 · Trzy różne rzeczy mają tę samą ikonę — P1**
- Lupa nad mapą oznacza jednocześnie:
  - dok Analizy w prawej kolumnie;
  - „Otoczenie działki”;
  - „Analiza źródła”.
- Od 19.53.0 kolumna nie ma podpisów, więc ikona jest jedyną wskazówką.
- **Poprawka:** Analizy — ikona wykresu albo kompasu (narzędzia); Otoczenie — okrąg wokół punktu (strefa); Analiza źródła — warstwy z lupą.

**K4 · Dok Analizy dwa razy mówi to samo — P2**
- Podtytuł „Działka 27/1 z karty” i zaraz pod nim „Kontekst: Działka 27/1 (karta działki).”
- **Poprawka:** zostaje podtytuł. Wiersz kontekstu pokazuje się tylko bez działki, z podpowiedzią co zrobić.

### Kolor i typografia

**T1 · Paleta „Las” jest wdrożona do połowy — P2**
- Las nadpisuje tylko akcent i pasek narzędzi (`34-v2.css`). Tekst i linie biorą tokeny bazowe z niebieskawą szarością.
- Na jednym ekranie stoją dwie temperatury szarości:

  | Rola | Tokeny bazowe (niebieskawe) | Pasek narzędzi (zielonkawe) |
  |---|---|---|
  | Tekst | `#141b26` | `#16261e` |
  | Tekst pomocniczy | `#556274` | `#5f6b62` |
  | Linie | `#d5dae2` | `#dfe4dc` |

- Bazowy `--accent` to wciąż niebieski `#1d4ed8`. Każdy element, który nie jest pod `.app-shell.is-v2`, wraca do niebieskiego.
- W CSS jest 122 różnych kolorów zapisanych wprost.
- **Poprawka:** tokeny Lasu jako bazowe (sekcja „Kierunek”), stare usunięte.

**T2 · Niebieskie zaznaczenie działki nie ma nazwy — P3**
- `#1d4ed8` / `#2563eb` jest wpisane na sztywno w 5 plikach (karta, Budowy, celownik, geolokalizacja).
- To jedyny kolor spoza Lasu i ma sens: na zielono-beżowej mapie niebieski obrys jest najlepiej widoczny.
- **Poprawka:** jeden token „zaznaczenie na mapie”, używany tylko w stylach mapy, nigdy w panelach.

**T3 · 19 rozmiarów czcionki i 5 grubości — P2**
- Rozmiary od 9 do 30 px. W samej karcie stoją obok siebie 12, 12,5 i 13 px — różnica, której oko nie czyta jako hierarchii, tylko jako nierówność.
- Grubości: 400, 500, 600, 650, 700.
- **Poprawka:** skala czterech stopni i dwie grubości (sekcja „Kierunek”).

**T4 · Dług stylów — P3**
- 21 plików CSS, 6419 linii, 83 × `!important`, 22 promienie, 29 cieni.
- Warstwy nakładają się w kolejności legacy → v2 → workspace-1c → łatwa obsługa → ergonomia. Każda poprawka dopisuje kolejne nadpisanie.
- To przyczyna L1 i K1, a nie osobny problem.
- **Poprawka:** jeden plik tokenów i style komponentów bez nadpisań — porządkowanie po kolei, plik po pliku.

**T5 · Dziesięć jednakowych wysp — P2**
- Znak, wyszukiwarka, Projekt, Udostępnij, ustawienia, karta, kolumna ikon, pasek trybów, podkład i zoom mają ten sam cień `0 4px 12px` i promień 10 px.
- Przycisk ustawień ma tę samą wagę wizualną co karta działki. To wzorzec „zestaw kart SaaS”: jednakowe zaokrąglone pudełka z miękkim cieniem, bez hierarchii.
- **Poprawka:**
  - cień tylko dla powierzchni z treścią (karta, dok, pasek trybów);
  - małe kontrolki na mapie (zoom, skala, podkład) — linia 1 px w kolorze Szronu zamiast cienia;
  - trzy promienie (6 / 10 / pełne zaokrąglenie), dwa cienie.

### Dostępność

**A1 · Fokus na podkładach jest niewidoczny — P1**
- `outline: none` na przycisku podkładu i 5 opcjach. Pozostałe kontrolki mają czytelny pierścień 2 px w kolorze akcentu.

**A2 · Kolejność Tab nie odpowiada układowi — P2**
- Z wyszukiwarki fokus idzie do Projekt → Udostępnij → pomoc → ustawienia → tryby → podkłady.
- Karta działki i prawa kolumna nie pojawiły się w pierwszych 14 krokach, choć wzrokowo są zaraz pod paskiem.
- **Poprawka:** kolejność w drzewie strony jak na ekranie: pasek, karta, mapa, kolumna i dok, tryby, podkłady.

**A3 · Ikony bez podpisów**
- Etykiety dla czytnika ekranu są i dymki działają.
- Ryzyko jest wizualne, nie techniczne — patrz K3.

## Kierunek wizualny (propozycja)

Zgodnie z zasadą „odwaga w jednym miejscu”: wszystko wokół mapy ma być ciche i zdyscyplinowane, a jeden element — charakterystyczny dla świata działek.

### Tokeny koloru (6 + 1)

Wszystkie z obecnej palety, bez nowych akcentów:

| Nazwa | Hex | Rola |
|---|---|---|
| Las | `#2f6b45` | akcent, jedyny wypełniony przycisk, aktywny tryb |
| Bór | `#16261e` | tekst |
| Mech | `#5f6b62` | tekst pomocniczy, ikony nieaktywne |
| Szron | `#dfe4dc` | linie, ramki kontrolek na mapie |
| Polana | `#e6f0e9` | tło wyniku, aktywna pozycja przełącznika |
| Rdza | `#a1460c` | ostrzeżenie (ograniczenie działki, mało danych) |
| Zaznaczenie | `#1d4ed8` | **tylko na mapie**: obrys wybranej działki i celownik |

### Typografia

- **Krój — propozycja:** Fira Sans z odmianą Fira Sans Condensed zamiast Inter.
  - Inter to dziś domyślny krój większości aplikacji.
  - Fira powstała do czytania na małych ekranach, ma pełne polskie znaki i licencję OFL.
  - Kluczowe: odmiana wąska rozwiązuje L3 i L4 tam, gdzie poszerzanie kolumn zabrałoby mapę.
- **Podział ról:**
  - Fira Sans — tytuły i przyciski;
  - Fira Sans Condensed — wiersze wartości w karcie i doku;
  - cyfry tabelaryczne (`font-variant-numeric: tabular-nums`) w powierzchniach, cenach i licznikach.
- **Koszt:** 4 pliki woff2 (ok. 100 KB, ładowane jak dziś Inter) i ponowny pomiar zrzutów.
- **Skala:**

  | Stopień | Użycie |
  |---|---|
  | 11 px | znaczniki EEA, liczniki |
  | 12,5 px | wiersze |
  | 14 px | nagłówki grup, przyciski |
  | 18 px | numer działki |

- **Grubości:** 400 i 600; 700 tylko dla numeru działki.

### Układ: dwie krawędzie zamiast dziesięciu wysp

Teraz:

```
[▣][ wyszukiwarka ........ ]                [Projekt ●][Udostępnij][?][⚙]
[ karta 260 ]                                         [ dok 250 ][kol.]
[          ]                                          [         ][    ]
                     MAPA
[podkład]            [Sprawdź Rysuj Mierz Teren]           [zoom]
```

Propozycja:

```
┌ lewa krawędź (x 8) ─────┐                         ┌ prawa krawędź (do x −8) ┐
[▣ wyszukiwarka ........]                            [Projekt ●][Udostępnij ▾][?][⚙]  ← wszystkie 36 px
[ karta (Condensed)     ]  ← y 52                    [ dok 280–300  ][kolumna]       ← y 52
[                       ]                            [               ][       ]
                     MAPA (bez zmian)
[podkład]─linia       [Sprawdź Rysuj Mierz Teren] ← środek okna     linia─[zoom]
```

- Wszystko wyrównane do lewej w obrębie kolumny.
- Jedna górna linia drugiego rzędu (52 px) dla karty, doku i kolumny ikon.
- Pasek trybów nie zależy od doku (L5).

### Jeden wyrazisty element: numer działki jak na mapie ewidencyjnej

Na mapie ewidencyjnej numer działki z kreską zapisuje się ułamkiem: 27 nad kreską, 1 pod nią.

W nagłówku karty numer w tej formie:
- 18 px, grubość 700, cyfry tabelaryczne;
- obok dwie linie: powierzchnia w hektarach i „Janowo, gm. Starogard Gdański” bez skracania.

To jedyne miejsce, gdzie interfejs mówi językiem geodezji. Wszystko inne jest ciche. Działki bez kreski (np. „125”) zostają zapisane zwyczajnie.

### Przegląd kierunku względem domyślnych rozwiązań

Co zmieniłem po pierwszym szkicu:
1. **Pierwszy odruch:** białe karty z miękkim cieniem na mapie, każda kontrolka osobno — czyli dokładnie obecny stan (T5) i domyślny „zestaw kart SaaS”.
   - **Zmiana:** dwie krawędzie z cieniem tylko dla powierzchni z treścią, małe kontrolki z linią.
2. **Nagłówek z kropkami** („21,85 ha · Janowo · gm. …”) to szablonowy ciąg metadanych, a tu dodatkowo gubi treść przez skracanie.
   - **Zmiana:** dwie linie i numer jako ułamek.
3. **Pozostaje świadomie:**
   - niebieski obrys działki — kolor funkcjonalny na mapie, nie dekoracja;
   - kropki „·” w liście „Brak: …” — tam rozdzielają pozycje i niczego nie obcinają.

## Plan wdrożenia

Każda paczka trafia do nowego katalogu testowego.

| Krok | Zakres | Ustalenia | Wpływ na mapę |
|---|---|---|---|
| 1 | Poprawki bez ryzyka | K1 filtry Warstw, A1 fokus podkładów, K3 ikony, K4 powtórzenie, L6 nazwa zwiniętej karty, L5 pasek trybów, L1 wysokości paska | bez zmian |
| 2 | Tokeny | T1 paleta Las jako bazowa, T2 token zaznaczenia, T3 skala czcionek, T5 promienie i cienie | bez zmian |
| 3 | Kolumny | L2 wspólna lewa krawędź i linia 52 px, L4 wiersze dwuliniowe, K2 bez kart w kartach, A2 kolejność Tab | bez zmian |
| 4 | Do decyzji | L3 szerokość doku 280–300 px, krój Fira, numer jako ułamek | dok: −30 do −50 px przy otwartym doku |
| 5 | Porządek CSS | T4: tokeny w jednym pliku, usunięcie nadpisań warstwa po warstwie | bez zmian |

## Decyzje dla Ciebie

1. **Szerokość doku (L3).**
   - Poszerzenie do 280–300 px usuwa obcięte tytuły, ale przy otwartym doku zmniejsza udział mapy: przy 1440 z 60% do ok. 57%, przy 1920 z 70% do ok. 68%.
   - Alternatywa: zostaje 250 px, a obcięcia rozwiązuje wąska odmiana kroju (decyzja 2).
2. **Krój pisma.** Fira Sans + Condensed zamiast Inter — tak, czy zostajemy przy Inter i tylko porządkujemy skalę?
3. **Numer działki jako ułamek** w nagłówku karty — tak, czy zwykły zapis „Działka 27/1”?
