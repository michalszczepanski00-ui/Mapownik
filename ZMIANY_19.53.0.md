# msportal 19.53.0 — przebudowa UI: Etapy 3, 5, 6 i 7

Wdrożone proponowane kroki po 19.52.0 (kolejność: Etap 5 → Etap 3 → Etap 6 → karta na telefonie → Etap 7).
Wydanie zawiera też zmiany 19.49.0–19.52.0, które czekają na akceptację.

Logika obliczeń, źródła danych i usługi WMS/WFS działają tak jak dotąd. Zmienia się miejsce przycisków i paneli, nie to, co robią.

## Etap 5 — dok Analizy

**Prawa kolumna:** trzy ikony — Warstwy, Obiekty, Analizy. Ceny, Budowy i Analiza działki nie mają już osobnych ikon.

**Dok Analizy:** lista pięciu narzędzi.
- Otoczenie działki
- Ceny transakcyjne
- Budowy i pozwolenia
- Analiza działki (serwer)
- Analiza źródła

Jak działa:
- Narzędzie otwiera swój widok w tym samym doku.
- Przycisk „‹ Analizy” w nagłówku wraca do listy.
- Ikona Analizy pozostaje podświetlona przy każdym widoku.
- Kontekstem jest działka z karty.

**Ceny:** jeden widok z przełącznikiem „Wokół działki | W widoku mapy”. Domyślnie „Wokół działki”, wybór jest zapamiętywany.
- Wcześniej ceny wokół działki były w zakładce Raport, a ceny w widoku — pod osobną ikoną.
- W widoku „Analiza działki (serwer)” nie ma już cen — są tylko w widoku Ceny.

**Panel analizy:** bez zakładek. Tryb (Otoczenie albo Analiza źródła) wybiera się w doku.

**Warstwy:**
- filtry: Włączone · W widoku · Wszystkie;
- ulubione jako przypięta sekcja na górze;
- grupy domyślnie zwinięte; grupa z włączoną warstwą jest zawsze rozwinięta.

**Ekrany węższe niż 1440 px:** przy otwartym doku karta działki zwija się sama. Po zamknięciu doku wraca.

## Etap 3 — tryb Teren, grupy Rysuj, rejestr akcji

**Cztery tryby:** Sprawdź · Rysuj · Mierz · Teren.

| Tryb | Narzędzia |
|---|---|
| Mierz | Odległość, Powierzchnia |
| Teren | Bufor, Obszar WZ \| Profil, Wysokości, Teren 3D |
| Rysuj | kształty (Punkt, Linia, Poligon, Prostokąt, Okrąg) \| opisy (Tekst, Strzałka, Etykieta) \| Działka, Przejazd \| Edytuj |

- Skróty klawiszowe bez zmian.
- Na telefonie narzędzia terenu są nadal w arkuszu Mierz — dolna nawigacja bez zmian.

**Same ikony:** pasek narzędzi i prawa kolumna nie mają podpisów. Nazwa i skrót są w dymku i dla czytnika ekranu. Licznik warstw i obiektów zostaje.

**Rejestr akcji** (`app-19.53.0/actions/registry.js`) — rozszerzenie istniejącego rejestru funkcji (slot `actions` w `defineFeature`).

Strefy:
- `topbar.project`, `topbar.share`;
- `contextbar`;
- `inspector.primary` (najwyżej 1), `inspector.secondary` (najwyżej 1), `inspector.analyses`;
- `mode:<tryb>`, `dock:<panel>`.

Walidacja przy starcie:
- unikalne id;
- jedna strefa na akcję;
- limity stref;
- etykieta, `run` i kolejność.

Każda akcja trafia też do palety poleceń (Ctrl+K), np. „Działka: Bufor”, „Analizy: Ceny transakcyjne”. Akcje działki są w palecie tylko przy otwartej karcie działki.

Z rejestru korzystają:
- przyciski karty działki (Raport PDF, Do projektu);
- menu „Analizy ▾”;
- lista doku Analizy;
- menu Projekt i Udostępnij.

Deklaracje są w dwóch plikach: `features/builtin/parcelActionsFeature.js` i `features/builtin/projectActionsFeature.js`.

## Etap 6 — górny pasek

**Układ:** znak (paleta poleceń) · wyszukiwarka · Projekt ▾ z kropką zapisu · **Udostępnij ▾** · pomoc · ustawienia.

**Udostępnij ▾** — jedyny wypełniony przycisk paska:
- link do projektu;
- eksport mapy PNG / PDF;
- pliki GIS.

Zielony przycisk „Eksport” usunięty — eksport mapy jest w menu Udostępnij.

**Projekt ▾:**
- Otwórz projekt…
- Zapisz plik projektu
- Importuj pliki GIS…

Bez pozycji „Nowy”.

„Pliki GIS” otwiera panel Obiekty z rozwiniętą sekcją „Import i eksport plików GIS”.

## Karta działki na telefonie

- Te same grupy wyników co na komputerze: Planowanie · Ograniczenia · Grunt, „W okolicy”, „Szczegóły i źródła” i jedna linia stanu źródeł.
- Wiersze rozwijają się w miejscu, z przyciskiem „Pokaż na mapie”.
- W pasku arkusza widać Planowanie.
- Przyciski arkusza bez zmian: Do projektu, Analizuj, Bufor, Nawiguj, Udostępnij, Raport PDF.
- Zniknął stary pasek werdyktu i sekcje.

## Etap 7 — sprzątanie

**Usunięty martwy kod:**
- dawny pasek `AppBar` (nieużywany od 19.9.0);
- stary widok karty w `IdentifyPanel`: pasek werdyktu, sekcje i pasek akcji.

**Ortofotomapa archiwalna** — pozostałości po module zdjęć archiwalnych, usuniętym w 19.48.0:
- `api/orthophoto.php` i `api/_orthophoto.php`;
- źródło `orthophoto_archive` (serwer, eksport, monitor źródeł);
- zapytania o daty archiwum w aplikacji;
- 32 nieużywane teksty interfejsu.

`verify-deployment.php` zgłasza oba pliki PHP jako pozostałości, jeśli zostały na serwerze.

**Style:** 183 selektory klas, których nie ma już w kodzie (werdykt, sekcje parcelplus, stare akcje karty, podpisy pod ikonami, zakładki karty, panel zdjęć). Paczka aplikacji: 3,37 MB → 3,34 MB.

## Testy

| Test | Wynik |
|---|---|
| Vitest | 93/93 (nowy test rejestru akcji: 6 przypadków) |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 |
| Diagnostyka (lokalny Apache) | 199 testów, **191 OK** (jak w 19.52.0) |
| Kontrola wdrożenia | 20 kontroli, 0 błędów, 3 ostrzeżenia (jak wcześniej) |
| Konsola przeglądarki | 0 błędów (zrzuty 3 rozdzielczości, testy etapów, telefon) |

**Udział mapy** (szerokość niezasłonięta przez lewy panel i prawy dok):

| Stan | 1280×800 | 1440×900 | 1920×1080 |
|---|---|---|---|
| start, działka, Rysuj, Mierz, Teren → Bufor | 75% | 78% | 83% |
| dok Warstwy, dok Analizy → Ceny | 76% (było 55%: karta zwija się sama) | 60% | 70% |

Dolne panele nie pojawiły się w żadnym stanie.

- **Diagnostyka — co nie przechodzi:** GDOŚ 502 z tego środowiska (2 testy), brak bazy RWDZ (2 testy), znany test „Faza 4”.
- **Kontrola wdrożenia — ostrzeżenia:** GDOŚ, baza RWDZ, eksport ortofotomapy (biały obraz z tego środowiska).
- **Zmienione testy** (z powodu zamierzonych zmian):
  - e2e „Esc zamyka panel Eksport” otwiera eksport przez Udostępnij ▾;
  - diagnostyka sprawdza 4 tryby, dok Analizy, rejestr akcji, kartę w grupach i brak źródła archiwalnego.
- **Zrzuty:** `dist/etap-1953-zrzuty.zip` — 21 stanów w 3 rozdzielczościach, dok Ceny, tryb Teren, menu Projekt i Udostępnij, karta na telefonie (pasek, pół ekranu, rozwinięty wiersz).

## Wgranie

Do **nowego** katalogu testowego, np. `/test28/`: cała zawartość `msportal-19.53.0-serwer.zip`, `index.html` i `.htaccess` na końcu.

**Nie nadpisuj `/test22/` ani produkcji.**
