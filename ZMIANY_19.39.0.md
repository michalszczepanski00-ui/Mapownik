# msportal 19.39.0 — ergonomia bez zmiany układu

Układ portalu, nawigacja, działanie narzędzi, mapa, API i dane są bez zmian. Zmiany są punktowe:
- 4 komponenty: `IdentifyPanel`, `ExportPanel`, `VpsDataPanel`, `TerrainProfilePanel`;
- jeden nowy arkusz stylów: `assets/css/38-ergonomia.css`.

## Usprawnienia

| Priorytet | Obszar | Było | Jest |
|---|---|---|---|
| P1 | Karta działki | Nagłówek „Działka” i tabela 5 wierszy, w tym powtórzony numer. Karta miała 604 px, więc „W okolicy” było poniżej ekranu 1366×768. | Zwięzły nagłówek: numer i obręb, gmina i powierzchnia, identyfikator z kopiowaniem. „W okolicy” mieści się na ekranie. Powiat, województwo i współrzędne są nadal w zwiniętej sekcji. |
| P1 | Działania dla działki | Ukryte w rozwijanym menu „Działania”. Raport PDF miał osobny wiersz. | Na wierzchu: **Otoczenie** i **Raport PDF**, pod nimi małe przyciski **Do projektu**, **Bufor**, **Wysokości**. |
| P1 | Analizy | Podczas sprawdzania przycisk postępu i „Zatrzymaj” łamały się w pół słowa. Nazwy źródeł w wynikach były ucięte. | Postęp na całą szerokość, „Zatrzymaj” pod nim. Nazwy źródeł są w całości, a wartość przechodzi do nowej linii, gdy brakuje miejsca. |
| P1 | Eksport | Zaawansowany eksport z serwera był zawsze rozwinięty, a panel na 1366×768 wymagał przewijania. | Sekcja „Obraz z serwera — PL-1992, duże formaty” jest zwinięta. Pamięta stan w trakcie sesji i sama się rozwija, gdy trwa eksport. Codzienny „PNG jak na ekranie” jest na górze. |
| P2 | Zakładka Raport | Nie prowadziła do raportu PDF. | Przycisk „Raport PDF działki … (do wydruku)”. |
| P2 | Rysuj / Mierz | Podpowiedź następnego kroku była dwa razy: przy mapie i w karcie. | Podpowiedź jest raz, przy mapie. Pełny opis zostaje pod ikoną ⓘ. |
| P2 | Profil terenu | Etykiety wysokości rozciągnięte przez skalowanie wykresu. Około 90 px pustego marginesu. | Ostre etykiety wysokości i oś odległości. Wykres na całą szerokość. Punkt i wartość pod kursorem. Na ekranach do 860 px wysokości niższy wykres. |
| P2 | Telefon | Szczegóły powtarzały numer, gminę i powierzchnię z nagłówka arkusza. | W szczegółach jest tylko identyfikator z kopiowaniem. |

**Serwer:** skrypt `aktualizuj-19.39.0.php` sprawdza, czy katalog `api/` jest kompletny (pole `katalog_api`). Paczka aktualizacji zawiera cały katalog `api/`.

## Kontrola
- **Scenariusze w przeglądarce** na 1366×768, 1920×1080 i 1280×720. Wszystkie 14 przechodzą na każdym rozmiarze, bez błędów w konsoli:
  - wyszukanie działki po ID;
  - karta działki;
  - włączenie warstwy;
  - rysowanie;
  - pomiar;
  - analizy;
  - profil NMT;
  - eksport PNG i z serwera;
  - powrót do karty po narzędziach;
  - okno raportu PDF.
- **Telefon (390×844):** arkusz działki bez powtórzeń.
- **Diagnostyka:** 187 testów przechodzi, w tym nowy test 19.39.0. Nie przechodzi 5, wszystkie przez zewnętrzne serwery niedostępne ze środowiska testowego (GDOŚ 403, PGI 502, archiwum ortofotomapy).

## Wgranie (aktualizacja_19.39.0.zip)
1. Wgraj `aktualizuj-19.39.0.php` i od razu go otwórz. Sprawdź pole `katalog_api`.
2. Wgraj resztę paczki:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`;
   - `assets/css/38-ergonomia.css`;
   - `app-19.39.0/`;
   - `api/` (cały katalog, z ukrytym `api/certs/.htaccess`).
3. Odśwież stronę: Ctrl+Shift+R.
4. Otwórz `aktualizuj-19.39.0.php?sprzatanie=1`.
