# Kontrola wdrożenia msportal (lista do odhaczenia)

Najszybciej: `node tools/check_deploy.mjs https://ADRES-PORTALU --browser` wykonuje punkty 1–4 automatycznie.
Bez Node.js — ręcznie w przeglądarce. Zamień `ADRES` na adres portalu, np. `https://mapownik.swiadectwa.net/test22`.

## 1. Wgranie
- [ ] `ADRES/` otwiera mapę (nie błąd 500).
  **Przy błędzie 500:** w `.htaccess` usuń linię `Options -Indexes`.
- [ ] `ADRES/verify-deployment.php` pokazuje:
  - `"deployment_consistent": true`;
  - `"bundle_missing": []`.
- [ ] `ADRES/api/health.php` pokazuje:
  - wersję `…-server` zgodną z `VERSION.txt`;
  - `true` dla `curl`, `gd`, `zip`, `pdo_sqlite`, `cache_writable` i `ca_bundle`.
- [ ] W tym samym `ADRES/api/health.php`: `cache_maintenance_age_s` jest liczbą mniejszą niż 172800 (2 doby).
  - **Jeśli jest `null`:** ustaw w panelu OVH (Hosting → Zaplanowane zadania) codzienne `php tools/maintain_cache.php`.

## 2. Bezpieczeństwo — te adresy muszą zwracać 403 albo 404
- [ ] `ADRES/README_WGRAJ_NA_SERWER.txt`
- [ ] `ADRES/api/_common.php`
- [ ] `ADRES/data/rwdz/rwdz.sqlite`
- [ ] `ADRES/setup-vendors.php`
- [ ] `ADRES/app-19.44.0/main.js` (410 — dawny katalog aplikacji)
- [ ] `ADRES/konfiguracja/polityka-prywatnosci.szkic.html`
- [ ] `ADRES/assets/` (nie może pokazać listy plików)

## 3. Funkcje (z siecią)
- [ ] **Wyszukiwanie:** wpisz identyfikator działki `220408_2.0006.210/2` → otwiera się karta działki.
- [ ] **Natura 2000 w karcie:**
  - wynik albo „poza”;
  - „nie sprawdzono” na każdej działce oznacza, że serwer nie łączy się z GDOŚ.
- [ ] **Raport PDF** („Raport PDF” → „Utwórz raport PDF”):
  - plik się pobiera;
  - sekcja MPZP nie zawiera tekstu „msWMS” ani „WMS server error”.
- [ ] **Eksport ortofotomapy:**
  - Eksport → podkład „Ortofotomapa” → plik PNG pokazuje zdjęcie, nie białe tło;
  - zdjęcie ładuje się też w panelu „Zdjęcia”.
- [ ] **Wysokości** w karcie działki: wynik (deniwelacja, spadek) bez dodatkowego klikania.
- [ ] **Działki KIEG** (19.47.0): Warstwy → „Działki ewidencyjne (KIEG)” przy skali ok. 1:1 800 — granice i numery działek w ciągu kilku sekund.
- [ ] **Plany przy przybliżaniu:** włącz strefy POG, przybliż mapę — po chwili obraz jest ostry (nie powiększony stary).
- [ ] **Porównanie działek:** dodaj dwie działki do projektu (karta działki → „Do projektu”) → panel Obiekty → „Porównaj działki (2)”:
  - tabela wypełnia się w ok. 10–20 s;
  - przycisk „CSV” pobiera plik, który otwiera się w Excelu z polskimi znakami.
- [ ] **Diagnostyka:** `ADRES/diagnostyka.html` — testy ruszają; „Biblioteki w paczce aplikacji” i „brak dawnych bibliotek” na zielono.

## 4. Tryb offline (tylko HTTPS)
- [ ] W telefonie otwórz portal, poczekaj na mapę.
- [ ] Włącz tryb samolotowy i odśwież stronę.
  **Oczekiwane:** portal się otwiera z komunikatem „Brak połączenia z internetem…”.
- [ ] Wyłącz tryb samolotowy — komunikat znika.
- [ ] **Awaryjne wyłączenie trybu offline:** skopiuj `assets/sw-wylacz.js` jako `sw.js` w katalogu portalu.

## 5. Po odbiorze
- [ ] `ADRES/verify-deployment.php` → `"leftover_files": []`. Jeśli lista nie jest pusta — usuń wymienione katalogi i pliki
  (od 19.45.0: wszystkie `app-*`, dawne `vendor/…`, `setup-vendors.php`; szczegóły w `README_WGRAJ_NA_SERWER.txt`).
- [ ] To samo wdrożenie na produkcję.
- [ ] **Monitoring:** w repozytorium GitHub ustaw sekret `MONITOR_URL` — patrz `.github/workflows/monitor.yml`.
