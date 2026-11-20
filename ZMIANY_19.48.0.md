# msportal 19.48.0 — przebudowa UI, Etap 1: szybkie poprawki bez zmiany układu

Pełny raport etapu (pliki, M-lista, udział mapy, zrzuty, pytania): `PRZEBUDOWA_UI_ETAP_1.md`.

## Zmiany widoczne
- **Pasek górny w Sprawdź i Mierz** nie pokazuje przyciągania, cofnij i ponów. Są w Rysuj i podczas szkicu.
- **„Zapis lokalny”** zastąpiony kropką stanu przy „Projekt”: zapisano / zapisywanie / brak zmian / błąd. Opis w dymku.
- **Stopka:** stan podkładu tylko przy problemie („Podkład OK” usunięte). Skala i atrybucja bez zmian.
- **Warstwy:** grupa „Archiwum” ukryta. Włącza ją menu ⋯ panelu → „Pokaż warstwy archiwalne”.
- **Werdykt w karcie działki:**
  - ikony stanów: tak / nie / nie sprawdzono;
  - oko „Pokaż na mapie” w każdym wierszu, w stałej kolumnie.
- **Panele ładowane przy pierwszym użyciu** pokazują szkielet zamiast pustego obszaru. Kolejne otwarcia bez mignięcia.
- **Gęstość tylko zwarta.** Ustawienie „Gęstość” usunięte.
- **Moduł zdjęć archiwalnych usunięty:** ikona Zdjęcia, panel i podkład „Ortofotomapa archiwalna”.
  - „Prawdziwa ortofotomapa” jest w przełączniku podkładów.
  - Przy małej skali czeka na przybliżenie (lupa z podpowiedzią).

## Bez zmian
- Logika obliczeń, źródła danych, adresy usług WMS/WFS, droga zapytań.
- Pliki serwera modułu archiwalnego (`api/orthophoto.php`) zostają do sprzątania w Etapie 7.

## Testy
| Test | Wynik |
|---|---|
| Vitest | 79/79 |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 |
| Diagnostyka | 198, 186 OK — pozostałe to usługi zewnętrzne, RWDZ, „Faza 4”, jak w 19.47.0 |
| Kontrola wdrożenia | 0 błędów |
| Konsola przeglądarki | 0 błędów |

## Wgranie
Do **nowego** katalogu testowego (np. `/test23/`): cała zawartość `msportal-19.48.0-serwer.zip`, `index.html` i `.htaccess` na końcu. Potem `verify-deployment.php`.

**Nie nadpisuj `/test22/` ani produkcji.**
