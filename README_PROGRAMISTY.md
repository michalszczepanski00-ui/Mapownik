# msportal — praca nad kodem (od 19.42.0)

## Układ repozytorium
| Ścieżka | Co to jest |
|---|---|
| `app-<wersja>/` | Kod aplikacji (React + OpenLayers, moduły ES, nowe moduły w TypeScript). Nazwa katalogu zmienia się z wersją (`tools/bump_version.py`). Od 19.45.0 tylko źródło dla Vite — na serwer nie trafia. |
| `index.html` | Wejście dla Vite (źródło). Zbudowany `index.html` powstaje w `build/www/`. |
| `assets/css/` | Style (warstwy kaskady, kolejność `<link>` w `index.html` ma znaczenie); Vite łączy je w jeden plik. Na serwer trafia tylko `monitor.css` (monitor źródeł). |
| `assets/js/boot.js` | Zwykły skrypt startowy: wersja wydania, komunikaty przy nieudanym starcie. |
| `api/`, `cron/`, `*.php` | Backend PHP (hosting OVH, PHP 8.1+). Bez budowania. |
| `vendor/` | `vendor/pdf/` — jsPDF i czcionki raportu, wczytywane w czasie działania (na serwerze). `vendor/geometry/` — JSTS, dołączany do paczki przez Vite (na serwer nie trafia). |
| `diagnostyka.html`, `diag/` | Diagnostyka — drugie wejście Vite (od 19.45.0). `diag/srodowisko.js` podaje testom treść źródeł (`diag/zrodla.js`, dołączane w budowaniu) i `window.ol` z pakietu npm. |
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
- Od 19.45.0 diagnostyka jest budowana przez Vite, więc przeniesienie modułu do `.ts` jej nie psuje. Wyjątek: testy diagnostyki,
  które czytają TREŚĆ pliku (`fetch('./app-…/plik.js')`) — dostają teksty tylko plików `.js` (`diag/zrodla.js`);
  taki test przepisz na Vitest.
- Przykład modułu w TS: `app-*/parcels/parcelComparison.ts` (+ `tests/unit/parcelComparison.test.ts`).

## Narzędzia dodane w 19.43.0
- `node tools/css_unused.mjs` — raport nieużywanych reguł CSS; `--apply` usuwa je (po zmianie porównaj wygląd).
- `php tools/client_errors_report.php 7` — błędy JavaScript zgłoszone przez przeglądarki w ostatnich 7 dniach.
- `tools/sw.template.js` — szablon service workera (tryb offline); `tools/build.mjs` wpisuje listę plików i wersję.
- `app-*/core/apiCache.js` — pamięć zapytań (TanStack Query). Nowe zapytania GET do API z odpowiedzią `{ok: true}`
  warto kierować przez `cachedJson(url, { signal, retry })`; nie dla odpowiedzi „w toku” (np. pozwolenia z `pending`).

## Narzędzia dodane w 19.44.0
- `node tools/check_deploy.mjs https://adres [--monitor] [--browser] [--json]` — kontrola wgranego portalu
  (wersja, nagłówki, blokady, usługi, offline). Uruchamiana też przez workflow „Wdrożenie”.
- `.github/workflows/monitor.yml` — kontrola dostępności co 15 min; sekret `MONITOR_URL`; e-mail z GitHuba przy awarii.
- `konfiguracja/polityka-prywatnosci.szkic.html` — szkic polityki; opublikowana wersja to `konfiguracja/polityka-prywatnosci.html`
  (link w pomocy pojawia się automatycznie). Przy zmianie przetwarzania danych (nowa usługa, nowe dane na serwerze) zaktualizuj szkic.

## Zmiany w 19.45.0
- `diagnostyka.html` jako drugie wejście Vite (`vite.config.js`). Importmapa i `vendor/static`, `vendor/ol-esm-2`, `vendor/opt`,
  `setup-vendors.php`, `api/vendor_status.php`, `api/_vendor_builder.php` usunięte z repozytorium.
- `tools/build.mjs` wyznacza pliki trybu offline z manifestu Vite (tylko wejście `index.html`), więc paczka diagnostyki
  (w tym ok. 2,3 MB tekstów źródeł) nie trafia do pamięci telefonu.
- `verify-deployment.php` → `leftover_files`: pozostałości po starszych wydaniach (workflow „Wdrożenie” usuwa je sam).
- Panel „Porównanie działek” (`parcelCompare`, dolny dok, bez pozycji w szynie): `app/components/ParcelComparisonPanel.js`,
  dane w `parcels/parcelComparison.ts`. Otwierany z panelu Obiekty (od 2 działek) i z palety poleceń.

## Zmiany w 19.46.0
- Diagnostyka budowana **osobno** (`vite build --mode diag` w `tools/build.mjs`, wynik w `assets/build/diag/`) — nie wpływa na podział paczki portalu.
- `npm run build` wypisuje pliki ładowane przy starcie; `STARTUP_LIST=1 npm run build` — pełna lista z rozmiarami.
- Nie importuj całych pakietów jako przestrzeni nazw: `import('lucide-react')`, `import { z } from 'zod'` dołączają wszystko
  (ikony: 630 KB, zod z lokalizacjami: 380 KB). Ikony imiennie, zod przez `import * as z from 'zod'`.
- Ceny RCN: wspólne parametry w `core/rcnDefaults.js` (500 m, 5 lat; mediana od 3 transakcji) — tak samo w `api/rcn.php`.
- Okno raportu PDF ładowane przy pierwszym otwarciu: stan w `app/components/reportDialogStore.js`.

## Zasady, których pilnują narzędzia
- `index.html` nie może mieć skryptów wbudowanych (CSP `script-src 'self'`) — sprawdza `tools/build.mjs`.
- Zod musi być w trybie `jitless` przed pierwszym schematem — `core/zodConfig.js` jest w tej samej paczce co zod (`vite.config.js`).
- Pliki w `vendor/` są „immutable” — zmiana treści pod tym samym adresem nie dotrze do przeglądarek (`tools/vendor-lock.json`).
- Strony bez budowania (`monitor-zrodel.html`) muszą wskazywać istniejące pliki paczki — sprawdza `tools/build.mjs`.
