# msportal 19.41.4-b — poprawki bezpieczeństwa i stabilności z audytu 08.11.2026

Wersja aplikacji bez zmian (19.41.4). Kod przeglądarki (`app-19.41.4/`) i biblioteki (`vendor/`) są nietknięte, więc nie trzeba podbijać wersji ani przechodzić procedury `aktualizuj-*.php`.

Zmieniają się:
- pliki serwera w `api/`;
- `.htaccess`, nowy plik `data/.htaccess`;
- `index.html`, `setup-vendors.php`;
- narzędzia w `tools/`.

## Co poprawiono

| Audyt | Problem | Poprawka |
|---|---|---|
| B1 | Eksport: równoległe żądania omijały limit, nieudane eksporty się nie liczyły, jeden eksport zajmował proces PHP na minuty | Limit liczony pod blokadą z zapisem. Osobny limit prób: 40 / 10 min, pakiety 12 / h; limit udanych bez zmian. Najwyżej 2 eksporty naraz na serwerze, kolejny dostaje 429 „spróbuj za pół minuty”. Limit 100 000 wierzchołków i 200 otworów. Budżet odtwarzania otworów w poligonach. |
| B2 | Rosnący bez końca cache | „Czyj las”: do cache trafiają tylko kafle siatki mapy (dowolny BBOX jest obsłużony, ale nie zapisany); limit pobrań z BDL na IP. Sprzątanie (`tools/maintain_cache.php`) obejmuje teraz `cache/forest`, `cache/rcn`, `cache/nominatim` i pliki limitów per IP. |
| B3 | Udostępnianie przyjmowało dowolny JSON | Serwer sprawdza strukturę projektu (typy geometrii, liczby, limity obiektów, wierzchołków i tekstów) i zapisuje tylko znane pola. Limit na sieć IPv6 /64 i 64 MB na dobę na adres. |
| B4 | `setup-vendors.php` pobierał JS z CDN i ufał temu, co pobrał | Sumy SHA-256 bibliotek wpisane na stałe (`api/_vendor_builder.php`). `setup-vendors.php` tylko z wiersza poleceń. `index.html` nie przekierowuje już na niego, tylko pokazuje, co wgrać ponownie. |
| B5 | Brak nagłówków ochronnych, `data/` chronione tylko przez mod_rewrite | **CSP** w `index.html`: skrypty tylko z serwera i trzy wbudowane po sumie SHA-256. **Nagłówki:** `object-src`/`base-uri`/`frame-ancestors`, `Permissions-Policy`, HSTS (tylko HTTPS), bez `X-Powered-By`. **Katalogi:** `Options -Indexes`, nowy `data/.htaccess` (blokada także bez mod_rewrite). |
| B6 | Publiczna dokumentacja, raporty, biblioteki PHP, wersja PHP | 403/404 dla `ZMIANY*`, `RAPORT_AUDYTU*`, `README*`, `audyt/`, `api/_*.php`, `*.py`, `*.sqlite`, `.htaccess.bak*`. `api/health.php` podaje tylko gałąź PHP (np. 8.3). |
| B7 | cURL bez limitu przekierowań | Przekierowania tylko HTTP/HTTPS, najwyżej 5. Odpowiedź po przekierowaniu na adres wewnętrzny jest odrzucana; gdy hosting wychodzi przez proxy, ta kontrola jest pomijana. |
| B6 | Komunikaty błędów ze szczegółami serwera | `permits.php`, `terrain.php`, `uldk.php`, `search.php` zwracają ogólne komunikaty, a szczegóły trafiają do `error_log`. |
| Z1 | Imiona i nazwiska inwestorów (RWDZ) w panelu i CSV | Inwestor widoczny, gdy jest podmiotem (spółka, gmina, spółdzielnia, urząd…); osoba fizyczna → „osoba fizyczna (dane ukryte)”. Przełącznik: `PERMITS_SHOW_PERSON_NAMES` w `api/_permits_privacy.php`. |
| Z3 | Zapasowe zapytania do Nominatim bez pamięci i z udawanym User-Agentem przeglądarki | Własny User-Agent z adresem serwisu, pamięć wyników 24 h, najwyżej 1 zapytanie na sekundę z całego serwera. |
| — | `permits.php?status=1` przy uszkodzonej bazie zwracał błąd 500 (test diagnostyki 19.35.0) | Odpowiedź 503 z opisem, co wgrać ponownie. |

## Nowe narzędzia
- `tools/csp_hashes.py` przelicza sumy CSP skryptów wbudowanych w `index.html`.
  - Uruchamia go `tools/bump_version.py`, a `tools/check_release.py` sprawdza zgodność.
  - **Po ręcznej zmianie skryptu w `index.html` uruchom `python3 tools/csp_hashes.py`**, inaczej przeglądarka zablokuje start aplikacji.
- `tools/test_audyt_19.41.4-b.php` to 38 testów poprawek (bez sieci). `tools/check_release.py` uruchamia go razem z testami parsera i scalania WMS.

## Sprawdzone
- **Apache 2.4.58 + PHP 8.3** z tym `.htaccess`:
  - reguły dostępu na 40 adresach;
  - `data/` zablokowane także po wyłączeniu mod_rewrite;
  - nagłówki obecne, `X-Powered-By` usunięty.
- **Chromium:**
  - start bez błędów konsoli;
  - wszystkie 7 podkładów przełączają się jak w 19.41.4;
  - link „Przejdź do wyszukiwarki” działa.
  - Jedyny wpis CSP to próba `eval` w bibliotece zod przy starcie: zod sam przechodzi wtedy na tryb bez kompilacji, działanie bez zmian.
- **Diagnostyka (`diagnostyka.html`):** 186 testów OK po poprawkach wobec 185 przed. Wszystkie pozostałe błędy występują w obu wersjach (usługi GDOŚ, PIG, NMT niedostępne ze środowiska testowego, brak bazy RWDZ).
- **Na żywo przez API:**
  - eksport (PNG identyczny jak w 19.41.4, otwory poprawne, trzeci równoległy eksport dostaje 429);
  - udostępnianie (projekt z aplikacji wraca identyczny, śmieci odrzucone);
  - „Czyj las” (kafel siatki z cache w 3 ms, informacja o lesie poprawna);
  - wyszukiwarka (drugie zapytanie z pamięci);
  - pozwolenia (maskowanie osób fizycznych na małej bazie testowej);
  - sprzątanie cache.

## Wgranie na serwer (FTP, „nadpisz zawsze”)
1. **Kopia:** zachowaj kopię obecnych plików `.htaccess`, `index.html`, `setup-vendors.php` i katalogu `api/` poza katalogiem WWW.
2. **Wgranie:** paczka `msportal-19.41.4-b-poprawka.zip` zawiera tylko zmienione pliki. Wgraj najpierw **cały katalog `api/`**: nowe pliki `_permits_privacy.php` i `_shared_project_schema.php` muszą być na serwerze razem z `permits.php` i `shared_project.php`. Potem `data/.htaccess`, `index.html`, `setup-vendors.php`, a na końcu `.htaccess` (plik ukryty — klient FTP musi go wysłać).
3. **Kontrola wgrania:**
   - Ctrl+F5 w portalu;
   - `api/health.php` → `"patch": "19.41.4-b"`;
   - `verify-deployment.php` → `"deployment_consistent": true`.
4. **Jeśli portal zwraca błąd 500** po wgraniu `.htaccess`, hosting nie pozwala na `Options` w `.htaccess`. Usuń linię `Options -Indexes` (jest opisana w pliku).
5. **Sprzątanie cache:** upewnij się, że cron uruchamia raz dziennie `php tools/maintain_cache.php` (z katalogu portalu). Stare kafle „Czyj las” z dowolnych obszarów usunie on po 90 dniach. Żeby od razu odzyskać miejsce, możesz usunąć przez FTP katalog `cache/forest/`; odtworzy się sam.
6. **Biblioteki:** jeśli kiedyś zobaczysz komunikat „Brakuje bibliotek na serwerze”, wgraj ponownie katalog `vendor/` z paczki. `setup-vendors.php` nie działa już przez przeglądarkę.

**Wycofanie:** przywróć pliki z kroku 1. Baza, projekty udostępnione i cache nie są zmieniane.

## Czego ta poprawka nie obejmuje (wymaga decyzji albo nowej wersji aplikacji)
- **Polityka prywatności (Z2):** tekst prawny z danymi administratora.
- **Autouzupełnianie przez Nominatim w przeglądarce (Z3)** i **domyślny podkład OpenStreetMap (Z4):** zmiana kodu aplikacji (nowa wersja 19.41.5) i wybór dostawcy, np. PRNG/UUG GUGiK albo podkład GUGiK/OpenFreeMap.
- **Cache kafli `api/wms.php` (B2, częściowo):** limit 3 GiB nadal jest egzekwowany raz na dobę przez crona.
- **Repozytorium, CI, monitoring, szybszy start, konta (S1–S5, F1–F7):** osobne prace.
- **Biały obraz ortofotomapy przy eksporcie przez serwer:** zachowanie występuje także w 19.41.4 w środowisku testowym; warto sprawdzić na produkcji.
