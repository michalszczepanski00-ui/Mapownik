# msportal 19.54.0 — zmiany po audycie layoutu

Wdrożone rekomendacje z `AUDYT_LAYOUTU_19.53.0.md` (kroki 1–5 planu). Logika, źródła danych i usługi bez zmian — zmienia się wygląd i układ.

Trzy decyzje z audytu rozstrzygnąłem według rekomendacji. Każdą da się cofnąć osobno:

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| 1. Szerokość doku | **zostaje 250 px** | Po zmianie kroju i przycisku powrotu tytuły widoków się mieszczą. Mapa nie traci ani piksela. |
| 2. Krój pisma | **Fira Sans + Fira Sans Condensed** zamiast Inter | Odmiana wąska usunęła obcięcia w karcie i doku. |
| 3. Numer działki | **ułamkiem**, jak na mapie ewidencyjnej | „27” nad kreską, „1” pod nią. |

## Krok 1 — poprawki bez ryzyka

**K1 · Jeden przełącznik segmentowy.**
- Dotyczy filtrów Warstw, „Wokół działki | W widoku mapy” i „Grunty | Domy | Mieszkania”.
- Wspólne cechy:
  - wysokość 30 px;
  - licznik w tej samej linii („Wszystkie 62”);
  - aktywna pozycja z tłem Polany i tekstem Las.
- Usunięte stare reguły filtrów z trzech plików CSS, w tym 6 × `!important`.

**K3 · Ikony.** Dok Analizy i „Otoczenie działki” mają własne kształty. Wcześniej trzy różne rzeczy miały tę samą lupę.

**K4 · Dok Analizy.** Wiersz „Kontekst: Działka …” zniknął, bo powtarzał podtytuł. Bez działki jest podpowiedź, co zrobić.

**L1 · Górny pasek.** Znak, wyszukiwarka, Projekt, Udostępnij, pomoc i ustawienia — wszystkie 36 px.

**L5 · Pasek trybów.** Wyśrodkowany względem okna. Nie przeskakuje już przy otwarciu doku (wcześniej przesuwał się o 126 px).

**L6 · Zwinięta karta.** Pokazuje „Działka 27/1 ›” zamiast samego szewronu.

**Korekta audytu:**
- **A1 (fokus na podkładach) było błędne.** Pierścień fokusu jest na miniaturze podkładu (zielona obwódka), a pomiar w audycie sprawdzał tylko `outline` przycisku. Nic do poprawy.
- **L1 — częściowo.** Przycisk pomocy ma tło, a pomiar trafił w jego opakowanie. Różne wysokości (40 / 36 / 32 px) były prawdziwe i są poprawione.

## Krok 2 — tokeny

**T1 · Paleta „Las” jako bazowa w motywie jasnym**, także dla okien i menu poza powłoką:

| Nazwa | Kolor | Rola |
|---|---|---|
| Las | `#2f6b45` | akcent |
| Bór | `#16261e` | tekst |
| Mech | `#5f6b62` | tekst pomocniczy |
| Szron | `#dfe4dc` | linie |
| Polana | `#e6f0e9` | tło wyniku |
| Rdza | `#a1460c` | ostrzeżenie |

Koniec niebieskawych szarości obok zielonkawych. Motyw ciemny bez zmian.

**T2 · Kolor zaznaczenia na mapie** (`#1d4ed8`) w jednym module, `app-19.54.0/map/selectionColors.js`. Wcześniej był wpisany na sztywno w 6 plikach. Używany tylko na mapie: obrys działki, celownik, wybrana budowa i transakcja, wynik wyszukiwania.

**T3 · Skala tekstu.**
- Rozmiary: 11 / 12,5 / 14 / 18 px. W CSS było 19 wartości.
- Grubości: 400 i 600, a 700 tylko dla numeru działki.
- Zmierzone na ekranie z kartą działki: dokładnie te 4 rozmiary.

**T5 · Promienie i cienie.**
- Promienie: 6 px (kontrolki), 10 px (powierzchnie), pełne (pigułki).
- Wyjątki zostają:
  - arkusze telefonu (16–34 px);
  - kreski 2–3 px.
- Dwa cienie: powierzchnia z treścią i menu rozwijane.
- Zoom, skala i podkład mają cienką linię zamiast cienia.

## Kroki 3 i 4 — kolumny, typografia, karta działki

**Krój Fira Sans.**
- Fira Sans dla tekstu i tytułów, Fira Sans Condensed dla wierszy wartości w karcie, doku, warstwach i cenach.
- Cyfry tabelaryczne w powierzchniach, cenach i licznikach.
- Licencja OFL: `assets/fonts/Fira-LICENSE-OFL.txt`.
- Inter usunięty z paczki aplikacji. Raport PDF ma własne czcionki — bez zmian.

**Nagłówek karty.**
- Numer działki ułamkiem.
- Obok w dwóch liniach: powierzchnia (14 px, cyfry tabelaryczne) i „Janowo, gm. Starogard Gdański” — bez kropek i bez skracania.
- Działki bez kreski (np. „125”) i wskazany punkt mają zwykły tytuł.
- Czytnik ekranu dalej czyta „Działka 27/1”.

**L4 · Wiersze wyniku.**
- Długa wartość zawija się zamiast obcinać, np. „uchwalony · 107SO” jest teraz w całości.
- W karcie nic już nie jest obcinane przy 1280, 1440 i 1920 px. Skracane zostają tylko nazwy źródeł w zwiniętej sekcji „Szczegóły i źródła”.

**K2 · Bez kart w kartach.** „W okolicy” w karcie, lista doku Analizy i Ceny mają linie i nagłówki zamiast ramek.

**L2 · Wspólna linia.** Karta, dok i kolumna ikon zaczynają się na tej samej wysokości (52 px).

**L3 · Dok zostaje 250 px.**
- Przycisk powrotu do listy Analiz to sama strzałka z podpowiedzią „Wróć do listy: Analizy” (ikona Analizy w kolumnie jest podświetlona).
- „Ceny transakcyjne” i „Pobierz CSV” mieszczą się w całości.

**A2 · Kolejność Tab jak na ekranie:** górny pasek → karta działki → tryby → podkłady → prawa kolumna → mapa.

## Krok 5 — porządek CSS

- Nowy arkusz `assets/css/40-system-las.css`, wczytywany jako ostatni. Zawiera tokeny i jedną wersję wspólnych komponentów. Kolejne poprawki wyglądu trafiają tam, a nie jako nadpisania w plikach 21–38.
- Usunięte zdublowane reguły przełączników i ramek z `30-shell`, `34-v2`, `36-latwa-obsluga` i `38-ergonomia`.
- **Bez zmian, świadomie: 77 × `!important`** (było 83).
  - Większość przebija geometrię okien, którą JS wpisuje w atrybut `style` (`usePanel`).
  - Reszta to reguły `[hidden]`.
  - Ich usunięcie wymaga zmiany w kodzie paneli, nie w CSS — do osobnego wydania.

## Wpływ na mapę i rozmiar

| Stan | 1280×800 | 1440×900 | 1920×1080 |
|---|---|---|---|
| start, działka, Rysuj, Mierz, Teren → Bufor | 75% | 78% | 83% |
| dok Warstwy, dok Analizy → Ceny | 76% | 60% | 70% |

- Tak samo jak w 19.53.0. Dolne panele nie pojawiły się w żadnym stanie.
- **Paczka aplikacji: 3,34 → 3,49 MB**, bo pliki Fira (10 plików, 384 KB) są większe niż Inter (8 plików, 224 KB).
- Przeglądarka pobiera tylko odmiany i zakresy znaków, które są na ekranie.

## Testy

| Test | Wynik |
|---|---|
| Vitest | 93/93 |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 |
| Diagnostyka (lokalny Apache) | 199 testów, **191 OK** (jak w 19.53.0) |
| Konsola przeglądarki | 0 błędów (21 stanów w 3 rozdzielczościach, telefon) |

- **Diagnostyka:** test listy ikon dostosowany do dwóch nowych ikon (K3). Nie przechodzi to samo co wcześniej: GDOŚ 502 z tego środowiska (2 testy), brak bazy RWDZ (2 testy), znany test „Faza 4”.
- **Zrzuty:** `dist/zrzuty-19.54.0.zip`.

## Wgranie

Do **nowego** katalogu testowego, np. `/test29/`: cała zawartość `msportal-19.54.0-serwer.zip`, `index.html` i `.htaccess` na końcu.

**Nie nadpisuj `/test22/` ani produkcji.**

Przy wgrywaniu do istniejącego katalogu `assets/fonts/inter-*.woff2` mogą zostać — nie przeszkadzają.
