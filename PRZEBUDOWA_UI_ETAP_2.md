# Etap 2 — pasek kontekstowy (msportal 19.53.0)

Paczka: `dist/msportal-19.49.0-serwer.zip` → wgrać do **nowego** katalogu, np. `/test24/` (test23 z Etapem 1 zostaje do porównania). test22 i produkcja bez zmian.

Decyzje po Etapie 1: prawdziwa ortofotomapa zostaje w podkładach; ikony werdyktu bez zmian.

## Zmienione pliki
Wszystkie w `app-19.53.0/`, chyba że zaznaczono inaczej.

| Plik | Zmiana |
|---|---|
| `app/components/MapContextBar.js` (nowy) | pasek kontekstowy u góry mapy — rozbudowa dawnego banera podpowiedzi |
| `app/components/MapToolHint.js` (usunięty) | zastąpiony przez `MapContextBar` |
| `app/App.js` | montuje `MapContextBar` zamiast `MapToolHint` |
| `app/components/AppBar.js` | przyciąganie / cofnij / ponów usunięte z górnego paska (są w pasku kontekstowym) |
| `app/components/WorkspaceCard.js` | karta bez bloku opcji narzędzia; treść nie zależy od aktywnego narzędzia ani szkicu |
| `assets/css/38-ergonomia.css` | style paska kontekstowego; usunięta reguła dla starego banera |
| `assets/css/36-latwa-obsluga.css` | usunięte style starego banera |
| `diagnostyka.html` (poza `app-*`) | test układu sprawdza `MapContextBar` zamiast `MapToolHint` |
| `README_WGRAJ_NA_SERWER.txt` | paczka 19.49.0, katalog dla Etapu 2 |

## Zrealizowane pozycje

| Poz. | Stan | Co zrobiono |
|---|---|---|
| M1 | ✓ | „Po dodaniu” (Rysuj) i „Pomiar: Tymczasowy / Zapis w projekcie” (Mierz) są w pasku kontekstowym. Tam są też pozostałe opcje narzędzi: promień okręgu, odległość bufora z „Utwórz bufor / Anuluj podgląd”, parametry przejazdu, tryb strzałki i etykiety. Lewa karta nie ma już opcji narzędzi. |
| M2 (dokończenie) | ✓ | Przyciąganie, cofnij i ponów przeniesione z górnego paska do paska kontekstowego. Widoczne tylko przy aktywnym narzędziu Rysuj / Mierz albo w trakcie szkicu. Górny pasek: wyszukiwarka, Projekt + kropka, Eksport, pomoc, ustawienia. |
| Pasek kontekstowy (5.3) | ✓ | Opis poniżej tabeli. |

**Pasek kontekstowy — szczegóły:**
- **Układ w jednym wierszu:** [ikona] nazwa narzędzia · podpowiedź | opcje narzędzia (w szkicu też pole, obwód, długość i „Zakończ rysowanie”) | przyciąganie · ↶ · ↷ | Esc.
- **Wymiary i położenie:**
  - wysokość 40 px;
  - 12 px pod górnym paskiem;
  - wyśrodkowany nad widoczną częścią mapy, między lewą kartą a prawą kolumną. Przy otwartym doku przesuwa się w lewo.
- **Za mało miejsca:** najpierw skraca się podpowiedź. Pełny tekst ze skrótami klawiszy jest w dymku.
- **Esc:** przycisk uruchamia to samo polecenie co klawisz Escape — porzuca szkic albo wychodzi z narzędzia.
- **Zaznaczony obiekt projektu:** „Zaznaczony · nazwa · pole / obwód / długość”.
- **Kiedy znika:** w trybie Sprawdź bez zaznaczenia.

**Kryterium akceptacji:**

> „Włączenie dowolnego narzędzia Rysuj lub Mierz nie zmienia zawartości lewego panelu”

**Spełnione.** Sprawdziłem to automatycznie dla wszystkich 17 narzędzi (11 Rysuj, 6 Mierz) i dla trwającego szkicu poligonu, przy 1280, 1440 i 1920 px. Karta działki 221312_2.0405.27/1 ma tę samą treść przed włączeniem narzędzia i po nim.

**Kontrola paska we wszystkich 17 narzędziach przy 3 rozdzielczościach:**
- wysokość 40 px;
- nie zachodzi na górny pasek, lewą kartę ani prawą kolumnę;
- żadna strefa opcji nie jest ucięta.

**Lista kontrolna M1–M17:**

| Pozycje | Stan |
|---|---|
| M1, M2, M3, M16, M17 | ✓ |
| M4–M15 | n.d. w tym etapie (Etapy 3–6) |

## Odstępstwa
1. **Opcje zaznaczonego obiektu (styl, etykieta, Edytuj, Usuń) zostają w dolnym pasku stylu.** Według 5.3 powinny trafić do paska kontekstowego. Po Etapie 0 zdecydowałeś jednak: „nie przenoś w tym momencie” (pasek stylu, Legenda, dolne panele). Dlatego pasek kontekstowy pokazuje przy obiekcie tylko jego nazwę i wymiary (informacja, bez drugiego miejsca wywołania tych samych akcji). Patrz pytanie 1.
2. **Przycisk tekstowy „Cofnij punkt” w trakcie szkicu usunięty.** Ta sama funkcja jest pod ↶ w tym samym pasku (dymek „Cofnij punkt szkicu (Backspace)”). Przy 1280 px oba przyciski nie mieściły się w 40 px razem z „Zakończ rysowanie” i przyciąganiem. Zasada: jedna funkcja = jedno miejsce.
3. **Na wąskim ekranie (1280–1440) w trakcie szkicu podpowiedź skraca się do kilku słów**, np. „Dodaj…”. Pełny tekst jest w dymku. Nazwa narzędzia, opcje, wynik pomiaru i przyciski zawsze się mieszczą.

## Regresje
Nie stwierdzono.

| Test | Wynik |
|---|---|
| Vitest | 79/79 |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 (szczegóły niżej) |
| Diagnostyka | 198 testów, 187 OK |
| Kontrola wdrożenia | 20 kontroli, 0 błędów |
| Konsola przeglądarki | 0 błędów we wszystkich stanach zrzutów i w teście Etapu 2 |

- **Playwright:** test „Wysokości w karcie działki” raz nie przeszedł. Usługa ULDK (GUGiK) nie zwróciła wtedy działki („W tym punkcie nie odczytano działki ewidencyjnej”, 4 źródła bez odpowiedzi), więc karta nie miała przycisków działki. Ponowione uruchomienie: zaliczony.
- **Diagnostyka — 8 błędów, te same co w Etapie 1:**
  - usługi zewnętrzne GDOŚ / PIG (403 / 502 z tego środowiska);
  - brak bazy RWDZ;
  - znany test „Faza 4”.
- **Działanie bez zmian:** opcje narzędzi to te same pola z tymi samymi wywołaniami (`ctx.settings.set('editing.repeat')`, `measurement.setTemporary()` itd.). Zmieniło się tylko miejsce ich wyświetlania.

## Zrzuty
`dist/etap2-zrzuty.zip`:
- **Stany z sekcji 8:** 21 zrzutów `etap2-<szerokość>-<stan>.png` i `etap2-pomiar.json`.
  - Rozdzielczości: 1280×800, 1440×900, 1920×1080.
  - Stany: 1 start, 2 działka, 3 Rysuj → Poligon, 4 Mierz → Odległość, 5 Mierz → Bufor (tryb Teren powstanie w Etapie 3), 6 dok Warstwy, 7 dok Ceny.
- **Szkic poligonu w toku:** `etap2-<szerokość>-szkic.png` — pole, obwód, „Zakończ rysowanie”, przyciąganie, ↶ ↷, Esc.
- **Zaznaczony obiekt projektu:** `etap2-<szerokość>-obiekt-zaznaczony.png` — pasek kontekstowy u góry, pasek stylu u dołu bez zmian.

## Udział mapy
Szerokość mapy niezasłonięta przez lewy panel i prawy dok, względem szerokości okna:

| Stan | 1280×800 test22 → 19.49 | 1440×900 test22 → 19.49 | 1920×1080 test22 → 19.49 |
|---|---|---|---|
| start, działka, Rysuj, Mierz, Bufor | 75% → 75% | 78% → 78% | 83% → 83% |
| dok Warstwy, dok Ceny | 55% → 55% | 60% → 60% | 70% → 70% |

- **Dolne panele:** nie pojawiły się w żadnym stanie.
- **Wysokość paska kontekstowego:** 40 px, nad mapą, w miejscu dawnego banera podpowiedzi (który miał dwa wiersze: podpowiedź i skróty).

## Pytania
1. **Opcje zaznaczonego obiektu** (kolor, linia, grubość, krycie, Zaawansowane, nazwa, usuń). Przenieść je teraz z dolnego paska stylu do paska kontekstowego, jak w 5.3? Byłby to jeden pasek u góry zamiast dwóch, a u dołu zostałby tylko pasek trybów. Czy zostawić do późniejszego etapu (decyzja „nie przenoś w tym momencie”)?
2. **Kolejny katalog testowy.** Proponuję `/test24/` dla Etapu 2, żeby test23 (Etap 1) został do porównania. Czy wolisz nadpisywać test23 kolejnymi etapami?

Czekam na akceptację przed Etapem 3 (rejestr akcji, tryb Teren, M9–M11, grupy Rysuj).
