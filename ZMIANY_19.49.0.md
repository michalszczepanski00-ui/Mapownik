# msportal 19.49.0 — przebudowa UI, Etap 2: pasek kontekstowy

Pełny raport etapu: `PRZEBUDOWA_UI_ETAP_2.md`.

## Zmiany widoczne
- **Pasek kontekstowy u góry mapy** zastępuje baner podpowiedzi.
  - **Układ:** jeden wiersz, 40 px: narzędzie i podpowiedź | opcje narzędzia | przyciąganie, cofnij, ponów | Esc.
  - **Przy zaznaczonym obiekcie:** nazwa i wymiary.
  - **Kiedy znika:** w trybie Sprawdź bez zaznaczenia.
- **Opcje narzędzi (M1)** są w pasku kontekstowym, a nie w lewej karcie:
  - „Po dodaniu”;
  - „Pomiar”;
  - promień okręgu;
  - odległość bufora;
  - parametry przejazdu;
  - tryb strzałki i etykiety.
- **Lewa karta** nie zmienia się przy włączaniu narzędzi Rysuj / Mierz ani w trakcie szkicu.
- **Górny pasek:** bez przyciągania, cofnij i ponów (są w pasku kontekstowym).
- **„Cofnij punkt” w szkicu:** przycisk ↶ w pasku kontekstowym (jak dotąd także Backspace).

## Bez zmian
- **Funkcje opcji narzędzi:** te same wywołania i ustawienia.
- **Dolny pasek stylu obiektu:** zostaje do decyzji właściciela.
- **Obliczenia, źródła danych, usługi WMS/WFS:** bez zmian.

## Testy
| Test | Wynik |
|---|---|
| Vitest | 79/79 |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 |
| Diagnostyka | 198, 187 OK — pozostałe to usługi zewnętrzne, RWDZ, „Faza 4” |
| Kontrola wdrożenia | 0 błędów |
| Konsola przeglądarki | 0 błędów |

## Wgranie
Do **nowego** katalogu testowego (np. `/test24/`): cała zawartość `msportal-19.49.0-serwer.zip`, `index.html` i `.htaccess` na końcu.

**Nie nadpisuj `/test22/` ani produkcji.**
