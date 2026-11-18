# msportal 19.52.0 — usunięte: hałas i pompa ciepła

Na życzenie właściciela usunięte w całości informacje i warstwy dotyczące hałasu oraz pompy ciepła (geotermii płytkiej), dodane w 19.50.0.

Wydanie zbudowane na 19.51.0 — zawiera też zmiany z 19.49.0–19.51.0, które czekają na akceptację.

## Co zniknęło

**Panel Warstwy:**
- „Hałas — główne drogi, koleje, lotniska (LDWN, 2017)”;
- „Hałas — aglomeracje (LDWN, 2017)”;
- „Pompa ciepła — możliwość odwiertów (geotermia płytka)”.
- Grupa „Uciążliwości i hałas” nazywa się teraz **„Uciążliwości”**: fermy, odpady i ścieki, przemysł i wydobycie, składowiska.

**Karta działki:**
- wiersz „Hałas (2017)” w Ograniczeniach i pozycja „hałas” w linii „Brak: …”;
- wiersz „Pompa ciepła” w grupie Grunt;
- oba źródła na liście „Szczegóły i źródła” — karta odpytuje 15 źródeł zamiast 17.

**Serwer:**
- profile źródeł `noise_main`, `noise_agglomeration`, `geothermal_bhe` (`data/source-profiles.json`) — serwer pośredniczący odpowiada dla nich 404;
- źródło identyfikacji `noise_all` i jego opis dB (`api/identify.php`);
- polskie etykiety pól hałasu i geotermii (`api/_identify_parse.php`);
- punkt kontrolny hałasu w monitorze dostępności (`api/source_monitor.php`).

**Testy:** test jednostkowy poziomu hałasu i wpisy hałasu oraz geotermii w diagnostyce.

## Bez zmian
- **Zapisane ustawienia i projekty z włączoną warstwą hałasu lub geotermii:** aplikacja przy odtwarzaniu pomija nieznane warstwy i nie wywraca się.
- **Wszystkie pozostałe warstwy z 19.50.0:** zabytki, uciążliwości, składowiska, strefa ryzyka powodziowego, GZWP, KOWR, hipsometria i zapas EEA dla GDOŚ.

## Testy
| Test | Wynik |
|---|---|
| Vitest | 87/87 |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 |
| Diagnostyka (lokalny Apache) | 199 testów, **191 OK** |
| Konsola przeglądarki | 0 błędów |

- **Diagnostyka — co nie przechodzi:** Rejestr Urbanistyczny 502, brak bazy RWDZ, znany test „Faza 4”.
- **Sprawdzone w przeglądarce:**
  - panel Warstwy bez hałasu i pompy ciepła;
  - karta działki w Gdańsku bez obu pozycji (wcześniej: pompa ciepła „warunkowa”).

## Wgranie
Do **nowego** katalogu testowego, np. `/test27/`: cała zawartość `msportal-19.52.0-serwer.zip`, `index.html` i `.htaccess` na końcu.

**Nie nadpisuj `/test22/` ani produkcji.**
