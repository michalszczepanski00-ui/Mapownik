# msportal 19.42.0 — szybszy start: aplikacja budowana Vite, biblioteki z npm, testy automatyczne

Funkcje, wygląd i obsługa portalu są bez zmian. Zmienia się sposób przygotowania kodu dla przeglądarki i proces wydawania. Zawiera też wszystkie poprawki bezpieczeństwa 19.41.4-b (`ZMIANY_19.41.4-b.md`).

## Dla użytkowników: szybszy pierwszy start

Pomiar na tym samym serwerze Apache, Chromium. Łącze „4G” to 150 ms opóźnienia i 1,6 Mb/s.

| | 19.41.4-b | 19.42.0 |
|---|---|---|
| Pierwsze wejście, 4G: aplikacja gotowa | 12,2 s | **4,7 s** |
| Pierwsze wejście, 4G: żądania do serwera | 316 | **28** |
| Pierwsze wejście, 4G: przesłane dane | 1,5 MB | **0,75 MB** |
| Powtórne wejście, 4G | 0,5 s | 0,4 s |
| Pierwsze wejście, szybkie łącze | 0,8 s | 0,5 s |

- Kod aplikacji jest łączony w kilka plików `assets/build/*.js|css`. Nazwy plików zawierają sumę treści, więc przeglądarki trzymają je w pamięci na stałe, a nowe wydanie ma nowe nazwy.
- Ciężkie moduły pobierają się dopiero przy otwarciu:
  - Teren 3D (Three.js);
  - raport PDF;
  - bufor JSTS;
  - profil terenu.
- Biblioteki pochodzą z npm, w tych samych wersjach co dotąd (`package.json`):
  - React 19.2.8;
  - OpenLayers 10.10.0, teraz moduły ES zamiast pełnego `ol.js` i warstwy nakładek;
  - zod 4.6.5, proj4 2.22.0, lucide-react 1.47.0, Radix;
  - ol-mapbox-style 13.5.1, maplibre-contour 0.1.0, Three.js 0.170.0.
- **CSP bez wyjątków:** `index.html` nie ma już żadnego skryptu wbudowanego (`script-src 'self'`). Zod działa w trybie bez kompilacji (`core/zodConfig.js`), więc przeglądarka nie zgłasza już naruszeń polityki.
- **Komunikaty zamiast pustego ekranu:** `assets/js/boot.js` pokazuje, co wgrać ponownie, gdy brakuje pliku paczki. Po wdrożeniu nowej wersji otwarta wcześniej karta sama się przeładuje, jeśli poprosi o plik, którego już nie ma.

## Dla programisty
Szczegóły są w `README_PROGRAMISTY.md`.
- **Polecenia:**
  - `npm install`, potem `npm run dev` (podgląd na żywo, API z lokalnego PHP);
  - `npm run build` buduje gotową paczkę w `build/www/`.
- **Testy:**
  - `npm test`: Vitest, 33 testy jednostkowe (geometria, formatowanie, identyfikatory działek, WKT, plik projektu);
  - `npm run test:e2e`: Playwright, 5 scenariuszy na zbudowanej paczce;
  - `npm run typecheck`: TypeScript;
  - `python3 tools/check_release.py`: dotychczasowa kontrola wydania i testy PHP.
- **TypeScript:** konfiguracja `tsconfig.json`. Kod aplikacji to na razie JavaScript; nowe moduły i testy można pisać w `.ts`, a istniejące przenosić stopniowo. Testy jednostkowe są już w TypeScript.
- **GitHub Actions:**
  - `.github/workflows/ci.yml` przy każdej zmianie uruchamia TypeScript, testy, budowanie, kontrolę wydania i testy E2E; paczka trafia do artefaktu;
  - `.github/workflows/deploy.yml` wgrywa paczkę na serwer przez FTP/SFTP (uruchamiane ręcznie, sekrety opisane w pliku) i sprawdza `verify-deployment.php`.
- **Narzędzia:**
  - `tools/bump_version.py` nie zamienia już końców linii CRLF na LF i nie zmienia raportów ani starych aktualizatorów;
  - `verify-deployment.php` sprawdza paczki z `assets/build/`.

## Diagnostyka
`diagnostyka.html` działa jak dotąd na plikach źródłowych `app-19.42.0/` i bibliotekach z `vendor/`. Sprawdza treść modułów i importuje je bez budowania, dlatego te katalogi nadal są w paczce serwera. Korzysta z nich tylko diagnostyka; użytkownicy portalu dostają paczki z `assets/build/`.

Cztery testy diagnostyki sprawdzały stary układ `index.html` i zostały dostosowane:
- wersja w `boot.js`;
- paczka `main-*.js`;
- ikony z npm;
- reguły `38-ergonomia.css` w połączonym arkuszu.

**Wynik:** 186–187 z 198 testów OK, tak samo jak 19.41.4-b na tym samym serwerze. Pozostałe błędy dotyczą usług zewnętrznych niedostępnych ze środowiska testowego i braku bazy RWDZ w kopii testowej.

Docelowo testy diagnostyki warto przenosić do Vitest/Playwright. Wtedy źródeł i `vendor/` nie trzeba będzie wgrywać na serwer.

## Wgranie (FTP, pełna paczka)
1. **Kopie:**
   - kopia projektu `.mapownik` (Projekt → Zapisz plik projektu);
   - kopia obecnych plików portalu poza katalogiem WWW.
2. **Wgranie:** wgraj **całą zawartość** `msportal-19.42.0-serwer.zip` do katalogu portalu z opcją „nadpisz zawsze”. Klient FTP musi wysłać `.htaccess`. Najlepiej wgrać najpierw wszystko poza `index.html` i `.htaccess`, a te dwa pliki na końcu.
3. **Stary katalog:** usuń na serwerze stary katalog `app-19.41.4/`, bo `verify-deployment.php` wymaga jednego katalogu `app-*`.
   - **Nie usuwaj** `data/` ani `cache/`.
   - Starych plików w `assets/build/` też nie usuwaj — przydają się kartom otwartym przed wdrożeniem. Można je sprzątnąć po kilku dniach.
4. **Kontrola:**
   - `verify-deployment.php` → `"deployment_consistent": true`, `"bundle_missing": []`;
   - Ctrl+F5 w portalu;
   - `api/health.php` → wersja `19.42.0-server`.
5. **Błąd 500:** jeśli po wgraniu `.htaccess` pojawi się błąd 500, usuń linię `Options -Indexes` (opis w `ZMIANY_19.41.4-b.md`).

**Wycofanie:** wgraj z powrotem paczkę 19.41.4-b i usuń katalog `app-19.42.0/`.
