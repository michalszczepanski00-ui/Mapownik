msportal 19.51.0 — PEŁNA PACZKA (18.11.2026)
Paczka: msportal-19.51.0-serwer.zip (zawartość katalogu portalu). Opis zmian: ZMIANY_19.51.0.md (uproszczona karta działki), ZMIANY_19.50.0.md (luki z audytu warstw: GDOŚ/EEA, nowe warstwy, Obszar WZ), ZMIANY_19.49.0.md (przebudowa UI — Etap 2), ZMIANY_19.48.0.md (Etap 1), ZMIANY_19.47.0.md, ZMIANY_19.46.0.md, kontrola po wgraniu: README_KONTROLA_WDROZENIA.md.
0. PRZEBUDOWA UI (od 19.48.0): każdy etap wgrywaj do NOWEGO katalogu testowego (Etap 1 → np. /test23/).
   Etap 2 → np. /test24/, 19.50.0 (warstwy) → np. /test25/, 19.51.0 (karta działki) → np. /test26/ (poprzednie katalogi zostają do porównania). NIGDY nie nadpisuj /test22/ ani wersji produkcyjnej. Nowy katalog = pusty katalog + cała paczka
   (+ data/rwdz/rwdz.sqlite, jeśli chcesz testować Budowy).
1. Kopia projektu .mapownik i kopia obecnych plików portalu poza katalogiem WWW.
2. Wgraj CAŁĄ zawartość ZIP („nadpisz zawsze”, z .htaccess); index.html i .htaccess najlepiej na końcu.
3. Od 19.45.0 na serwerze NIE MA już kodu źródłowego ani dawnych bibliotek. Usuń przez FTP (jeśli są):
     app-19.44.0/ (i każdy inny katalog app-*),
     vendor/static/, vendor/ol-esm-2/, vendor/opt/, vendor/geometry/ (zostaje vendor/pdf/),
     setup-vendors.php, api/vendor_status.php, api/_vendor_builder.php,
     assets/css/ — wszystkie pliki OPRÓCZ monitor.css.
   NIE usuwaj data/, cache/, vendor/pdf/ ani starszych plików w assets/build/.
   Pozostawione pliki nie psują działania (serwer zwraca dla nich 410/404); listę pokazuje
   verify-deployment.php w polu "leftover_files".
4. verify-deployment.php → "deployment_consistent": true i "leftover_files": []; Ctrl+F5; api/health.php → 19.51.0-server.
Programista: README_PROGRAMISTY.md (npm run build tworzy tę paczkę; wdrożenie także przez GitHub Actions — usuwa pozostałości samo).

msportal 19.41.4-b — POPRAWKI BEZPIECZEŃSTWA (08.11.2026)
Wersja aplikacji bez zmian. Wgranie i kontrola: ZMIANY_19.41.4-b.md (sekcja „Wgranie na serwer”).
W skrócie: wgraj cały api/, potem data/.htaccess, index.html, setup-vendors.php, na końcu .htaccess;
sprawdź api/health.php → "patch": "19.41.4-b". Błąd 500 po .htaccess → usuń linię „Options -Indexes”.
setup-vendors.php działa już tylko z wiersza poleceń; brakujące biblioteki wgrywa się z paczki (vendor/). Od 19.45.0 plik usunięty — biblioteki są w paczce aplikacji.

msportal 19.51.0 — HOSTING WSPÓŁDZIELONY (bez VPS)

PEŁNA PACZKA 19.41.4 — AKTUALIZACJA DZIAŁAJĄCEGO PORTALU (np. /test22/ z 19.27.0)
1. Pobierz kopię projektu .mapownik (Projekt → Zapisz plik projektu).
2. Wgraj CAŁĄ zawartość ZIP do katalogu portalu, nadpisując pliki
   („nadpisz zawsze”, NIE „tylko nowsze”). Klient FTP musi wysłać .htaccess.
   NIE usuwaj na serwerze katalogów data/ i cache/ (projekty udostępnione,
   cache kafli, ewentualne bazy). Paczka ich nie nadpisuje poza plikami
   data/source-profiles.json i data/kowr/.
3. Sprawdź verify-deployment.php oraz działanie portalu. Zachowaj kopię poprzedniego wydania poza katalogiem WWW. Opcjonalne sprzątanie po odbiorze: php aktualizuj-19.41.4.php --sprzatanie (wyłącznie CLI). Bez CLI usuń stare aktualizatory przez FTP.
   Konserwacja cache: zadanie cron w panelu OVH — instrukcja krok po kroku: README_CRON_OVH.txt
   (polecenie to sama ścieżka, np. www/test25/tools/maintain_cache.php, bez „php”).
3a. Dane pozwoleń na budowę: rozpakuj dane_rwdz_2026-10.zip i wgraj data/rwdz/rwdz.sqlite
    (osobna paczka, ok. 210 MB). Od 19.35.0 bazę odświeża sam serwer — patrz 3b.
3b. Automatyczna aktualizacja pozwoleń (19.35.0): panel OVH → Hosting → Zaplanowane zadania (Cron)
    → Dodaj zaplanowane zadanie: polecenie  www/test25/cron/rwdz_update.php  (ścieżka do katalogu
    portalu od katalogu głównego FTP — patrz README_CRON_OVH.txt), język PHP 8.1+, codziennie (np. 3:00), włączony. Skrypt w sekundę sprawdza
    dane.gov.pl; gdy GUNB opublikuje nowe dane (zwykle raz w miesiącu), buduje nową bazę w tle
    (kilka–kilkanaście minut, wznawia się przy kolejnym uruchomieniu) i podmienia plik.
    Wymaga ok. 500 MB wolnego miejsca na czas budowy. Stan: diagnostyka.html (test 19.35.0)
    albo api/permits.php?status=1; dziennik: cache/rwdz/update.log.
3c. Raport działki PDF (19.36.0): katalog vendor/pdf/ musi być na serwerze. Ustawienia dla wszystkich
    (nazwa biura, logo, szablony): konfiguracja/raport-pdf.json — opis w konfiguracja/README.txt.
4. verify-deployment.php → "deployment_consistent": true,
   "app_directories_present": [] (od 19.45.0 bez katalogów app-*).
5. Ctrl+F5 w portalu. Sprawdź: podkłady Pastel, Zmierzch, Karto; Warstwy → Nachylenie terenu; działka → Raport → „Ceny transakcyjne
   w okolicy”; diagnostyka.html → testy 19.29.0, 19.30.0 i 19.31.0 na zielono.
Zakres zmian: ZMIANY_19.41.0.md (Teren 3D — model terenu w Three.js), ZMIANY_19.40.0.md (raport PDF dla inwestycji OZE i przemysłowych), ZMIANY_19.39.0.md (ergonomia: karta działki, Analizy, Eksport, profil terenu), ZMIANY_19.38.0.md (raport: uzbrojenie, opis POG, ochrona przyrody, profile terenu), ZMIANY_19.37.2.md (ostrzeżenia przy warstwach planowania), ZMIANY_19.37.1.md (raport PDF: mapy i nowy wygląd), ZMIANY_19.37.0.md (czyj las — BDL), ZMIANY_19.36.0.md (raport działki PDF z szablonami), ZMIANY_19.35.0.md (eksport jak na ekranie, automatyczna aktualizacja pozwoleń), ZMIANY_19.34.0.md (ostatnie działki, W okolicy na telefonie), ZMIANY_19.33.0.md (intuicyjny układ), ZMIANY_19.32.1.md (Karto nie zasłania warstw), ZMIANY_19.32.0.md (ceny transakcyjne i pozwolenia na budowę), ZMIANY_19.31.1.md (rzeźba w Karto), RAPORT_AUDYTU_19.31.0.md i ZMIANY_19.31.0.md (audyt, poprawki, wydajność), ZMIANY_19.30.1.md (czytelność podkładów), ZMIANY_19.30.0.md (nowe podkłady, nachylenie), ZMIANY_19.29.0.md (ceny RCN), ZMIANY_19.28.0.md (layout).

Pliki serwera (api/, monitor/, data/source-profiles.json) w tej paczce
odtworzono i sprawdzono względem działającej wersji 19.27.0: wyszukiwanie
działki po numerze w obrębach miejscowości (19.26), punkty wzorcowe monitora
(19.23), wycofany moduł RCN z bazy (19.23), ustawienia warstw (19.19–19.27).
Tryb administratora panelu „Działka, ceny i otoczenie”: dopisz ?admin=1 do adresu.

Wymagania serwera: Apache z mod_rewrite (typowy hosting), PHP 8.1 lub nowsze
z rozszerzeniami curl, pdo_sqlite, gd, zip, mbstring. Nie jest potrzebny SSH,
Python, Node, systemd ani nginx.

Pierwsza instalacja:
1. Przez FTP/menedżer plików wgraj CAŁĄ zawartość tego katalogu (public_html)
   do katalogu domeny (np. public_html/ albo public_html/msportal/).
   Pliki .htaccess są ukryte — upewnij się, że klient FTP je wysyła.
2. Nadaj prawa zapisu (755 lub 775) katalogom: cache/ oraz data/
   (projekty udostępnione i pamięć podręczna kafli).
3. Otwórz:  https://TWOJA-DOMENA/verify-deployment.php
   Oczekiwane: "deployment_consistent": true oraz w sekcji "hosting":
   "php_api_present": true, "pdo_sqlite": true, "curl": true.
4. Otwórz portal. Panel „Działka, ceny i otoczenie” → analiza działki 360°
   działa od razu (ULDK, PRG). RCN, BDOT10k i warstwy MPZP/POG wymagają bazy.

Dane RCN / BDOT10k / MPZP (opcjonalnie):
5. Na swoim komputerze użyj katalogu narzedzia_importu (Windows: pliki .cmd
   w kolejności 01…06). Wynik: narzedzia_importu\do_wgrania\msportal.sqlite3
6. Wgraj ten plik przez FTP (tryb BINARNY) do  data/msportal/  pod nazwą
   msportal.sqlite3 (najlepiej najpierw jako msportal.sqlite3.nowy, potem
   zmień nazwę — portal nie zobaczy wtedy pliku w połowie wgrywania).
7. Sprawdź:  https://TWOJA-DOMENA/api/vps.php?route=health
   → "databasePresent": true i liczby rekordów w "datasets".

Aktualizacja z 19.7.0 (VPS) na hosting:
- Bazę z VPS (/opt/msportal/private/data/msportal.sqlite3) możesz przenieść:
  skopiuj ją do narzedzia_importu\baza\msportal.sqlite3 i uruchom krok 06.
- Katalogi vps/, admin/, usługi systemd, nginx i Cockpit nie są już używane.
- Projekty udostępnione z VPS: skopiuj /var/www/msportal/data/shared/
  do data/shared/ na hostingu.

Bezpieczeństwo: katalog data/msportal/ ma własny .htaccess (Require all denied).
Nie zmieniaj jego nazwy i nie wgrywaj bazy do innego katalogu.
Dawne adresy /vps/api/* są automatycznie kierowane do api/vps.php.

Aktualizacja 19.8.0 → 19.8.1:
1. Wgraj całą zawartość public_html na serwer, nadpisując pliki (baza w
   data/msportal/msportal.sqlite3 i projekty w data/shared/ nie są w paczce,
   więc zostaną nietknięte).
2. USUŃ na serwerze stary katalog app-19.8.0/ (verify-deployment.php wymaga
   jednego katalogu app-*; stary i tak zwraca HTTP 410).
3. Sprawdź verify-deployment.php → "deployment_consistent": true, wersja 19.8.1.
Portal może działać w podkatalogu (np. /test22/) — od 19.8.1 nie odwołuje się
już do adresów w katalogu głównym domeny.
