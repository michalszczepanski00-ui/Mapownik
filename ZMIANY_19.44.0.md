# msportal 19.44.0 — kontrola wdrożenia, monitoring, poprawki interfejsu, szkic polityki prywatności

## Kontrola wdrożenia jednym poleceniem
`tools/check_deploy.mjs` sprawdza wgrany portal pod podanym adresem. Wykonuje tylko odczyty i jeden mały eksport PNG — niczego nie zmienia. Wymaga Node.js 22.

```
node tools/check_deploy.mjs https://adres-portalu/test22
```

Dodatkowe opcje:
- `--browser`: także start w przeglądarce i tryb offline (wymaga `npm install`);
- `--json`: wynik do zapisania;
- `--monitor`: krótka kontrola dostępności.

Co sprawdza:

| Grupa | Kontrole |
|---|---|
| Dostępność | strona i paczka aplikacji, `api/health.php`, ULDK, wyszukiwarka, kafel ewidencji |
| Wgranie | `verify-deployment.php`, rozszerzenia PHP, czy działa sprzątanie cache z crona (nowe pole `cache_maintenance_age_s` w `health.php`) |
| Bezpieczeństwo | nagłówki (CSP, HSTS na HTTPS…), 17 ścieżek, które muszą być zablokowane, brak listowania katalogów, pliki, które muszą być publiczne |
| Wydajność i offline | długie przechowywanie paczek, kompresja, `sw.js` i HTTPS |
| Usługi | Natura 2000 (GDOŚ), MPZP, ceny RCN, wysokości NMT, baza pozwoleń, eksport ortofotomapy (rozpoznaje biały obraz) |

Kod wyjścia 1 oznacza co najmniej jeden błąd. Ostrzeżenia dotyczą rzeczy zależnych od usług zewnętrznych albo konfiguracji.

Workflow „Wdrożenie” (`.github/workflows/deploy.yml`) uruchamia tę kontrolę po każdym wgraniu.

## Monitoring dostępności z powiadomieniem e-mail
- **Plik:** `.github/workflows/monitor.yml` uruchamia kontrolę dostępności co 15 minut.
- **Kiedy przychodzi powiadomienie:** gdy portal nie odpowiada dwa razy z rzędu (odstęp 2 min). GitHub wysyła wtedy e-mail o nieudanym przebiegu.
- **Konfiguracja:** po umieszczeniu repozytorium na GitHubie dodaj sekret `MONITOR_URL` (adres portalu). Bez niego monitoring jest nieaktywny.

## Poprawki interfejsu (uwagi z audytu 19.43.0)
- **„Wysokości”** w karcie działki i na liście obiektów od razu liczy analizę (wynik po ok. 4–5 s). Wcześniej trzeba było jeszcze kliknąć „Analizuj”.
- **Pasek stylu obiektu** (kolor, linia, grubość) nie pokazuje się, gdy aktywne jest narzędzie pomiaru, bufora albo terenu. Nie zasłania wtedy środka mapy i wraca po wyjściu z narzędzia.
- **Wyszukiwanie „miejscowość + numer działki”** (np. „Kórnik 1000”): wynik pierwszego etapu pokazuje się od razu (ok. 2,4 s zamiast 6–7 s). Przeszukanie wszystkich obrębów gminy tylko uzupełnia listę.

## Szkic polityki prywatności
- **Plik:** `konfiguracja/polityka-prywatnosci.szkic.html` opisuje, jakie dane portal faktycznie przetwarza:
  - pamięć przeglądarki;
  - dzienniki serwera;
  - skróty IP w limitach;
  - linki udostępniania;
  - zgłoszenia błędów;
  - połączenia z OpenStreetMap, OpenFreeMap, AWS i usługami publicznymi;
  - dane z rejestrów publicznych.
- **Do uzupełnienia:** pola wyróżnione na żółto (dane administratora, hosting, okresy przechowywania) oraz miejsca z uwagami dla prawnika.
- **Publikacja:** zapisz gotowy tekst jako `konfiguracja/polityka-prywatnosci.html`. W pomocy portalu („?”) pojawi się wtedy link „Polityka prywatności”, a aktualizacje tego pliku nie nadpiszą.
- **Dostęp:** szkic jest zablokowany przed odczytem z internetu.

## Testy
- **Playwright:** 11 scenariuszy, nowe: link do polityki, „Kórnik 1000”, „Wysokości” od razu.
- **Vitest:** 56 testów.
- **TypeScript:** bez błędów.
- **Kontrola wydania i kontrola wdrożenia:** przechodzą na lokalnym Apache.

## Wgranie (FTP, pełna paczka — jak 19.43.0)
1. **Kopie:** kopia projektu `.mapownik` i obecnych plików portalu.
2. **Wgranie:** wgraj całą zawartość `msportal-19.44.0-serwer.zip` z opcją „nadpisz zawsze”. `index.html` i `.htaccess` wgraj na końcu.
3. **Stary katalog:** usuń stary katalog `app-19.43.0/` (albo inny `app-*` niż `app-19.44.0/`). Nie usuwaj `data/`, `cache/` ani starszych plików w `assets/build/`.
4. **Kontrola:** `node tools/check_deploy.mjs https://adres-portalu` albo ręcznie według `README_KONTROLA_WDROZENIA.md`.
