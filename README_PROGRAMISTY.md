# msportal — praca nad kodem (od 19.42.0)

## Układ repozytorium
| Ścieżka | Co to jest |
|---|---|
| `app-<wersja>/` | Kod aplikacji (React + OpenLayers, moduły ES). Nazwa katalogu zmienia się z wersją (`tools/bump_version.py`). |
| `index.html` | Wejście dla Vite (źródło). Zbudowany `index.html` powstaje w `build/www/`. |
| `assets/css/` | Style (warstwy kaskady, kolejność `<link>` w `index.html` ma znaczenie); Vite łączy je w jeden plik. |
| `assets/js/boot.js` | Zwykły skrypt startowy: wersja wydania, komunikaty przy nieudanym starcie. |
| `api/`, `cron/`, `*.php` | Backend PHP (hosting OVH, PHP 8.1+). Bez budowania. |
| `vendor/` | Biblioteki w dawnej postaci — używa ich już tylko `diagnostyka.html` (oraz `vendor/pdf/` i `vendor/geometry/`, wczytywane przez aplikację w czasie działania). |
| `tests/unit/` | Testy jednostkowe Vitest (TypeScript). Moduły aplikacji importuje się przez alias `@app/…`. |
| `tests/e2e/` | Testy Playwright na zbudowanej paczce. |
| `tools/` | Budowanie (`build.mjs`), wersja (`bump_version.py`), CSP (`csp_hashes.py`), kontrola wydania (`check_release.py`), testy PHP. |
| `.github/workflows/` | CI (testy, budowanie) i wdrożenie przez FTP/SFTP. |

## Pierwsze uruchomienie
Wymagane: Node.js 22, PHP 8.1+ (z curl, gd, zip, pdo_sqlite, mbstring), Python 3.
```
npm install
```

## Podgląd na żywo
Dwa terminale w katalogu repozytorium:
```
php -S 127.0.0.1:8000
```
```
npm run dev
```
Vite (adres w terminalu) serwuje aplikację z odświeżaniem po każdej zmianie, a `/api/…` przekazuje do PHP.

## Budowanie paczki dla serwera
```
npm run build
```
Wynik w `build/www/` = dokładnie to, co wgrywa się do katalogu portalu (FTP, „nadpisz zawsze”).
Skrypt sprawdza na końcu CSP, istnienie plików z `index.html` i `verify-deployment.php`.

## Testy
```
npm run typecheck
```
```
npm test
```
```
npm run build && npm run test:e2e
```
```
python3 tools/check_release.py
```
Wszystkie uruchamia też GitHub Actions przy każdej zmianie.

## Nowe wydanie
1. `python3 tools/bump_version.py X.Y.Z` (zmienia katalog `app-…`, odwołania, `tsconfig.json`, CSP).
2. Opis zmian w `ZMIANY_X.Y.Z.md`.
3. Testy jak wyżej, `npm run build`.
4. Wdrożenie: GitHub → Actions → „Wdrożenie” → najpierw środowisko `test`, potem `produkcja`
   (albo ręcznie: zawartość `build/www/` przez FTP, potem usunięcie starego katalogu `app-*`).

## TypeScript — stopniowe przejście
- Nowe moduły pisz w `.ts` (Vite obsługuje je bez dodatkowej konfiguracji).
- Istniejący plik przenosisz zmianą rozszerzenia `.js` → `.ts` i poprawą błędów z `npm run typecheck`.
  Importy w innych plikach mogą zostać z `.js` albo zmienić się na `.ts`.
- Plik JS można sprawdzać bez zmiany rozszerzenia: komentarz `// @ts-check` w pierwszej linii.
- Uwaga: `diagnostyka.html` importuje pliki źródłowe bez budowania, więc moduł przeniesiony do `.ts`
  trzeba w diagnostyce zastąpić testem Vitest/Playwright (albo zostawić w JS do czasu przeniesienia diagnostyki).

## Narzędzia dodane w 19.43.0
- `node tools/css_unused.mjs` — raport nieużywanych reguł CSS; `--apply` usuwa je (po zmianie porównaj wygląd).
- `php tools/client_errors_report.php 7` — błędy JavaScript zgłoszone przez przeglądarki w ostatnich 7 dniach.
- `tools/sw.template.js` — szablon service workera (tryb offline); `tools/build.mjs` wpisuje listę plików i wersję.
- `app-*/core/apiCache.js` — pamięć zapytań (TanStack Query). Nowe zapytania GET do API z odpowiedzią `{ok: true}`
  warto kierować przez `cachedJson(url, { signal, retry })`; nie dla odpowiedzi „w toku” (np. pozwolenia z `pending`).

## Zasady, których pilnują narzędzia
- `index.html` nie może mieć skryptów wbudowanych (CSP `script-src 'self'`) — sprawdza `tools/build.mjs`.
- Zod musi być w trybie `jitless` przed pierwszym schematem — `core/zodConfig.js` jest w tej samej paczce co zod (`vite.config.js`).
- Pliki w `vendor/` są „immutable” — zmiana treści pod tym samym adresem nie dotrze do przeglądarek (`tools/vendor-lock.json`).
