MAPOWNIK — ZADANIA CRON NA HOSTINGU OVH (poprawiona konfiguracja, 16.11.2026)

DLACZEGO WCZEŚNIEJ BYŁ BŁĄD
- Cron OVH może uruchamiać PHP jako CGI, a nie CLI. Oba skrypty sprawdzały tryb CLI:
  - cron/rwdz_update.php kończył się od razu komunikatem „Tylko z crona (CLI).” (status 403);
  - tools/maintain_cache.php po cichu nic nie robił.
  Poprawione: skrypt działa, gdy nie jest wywołany zapytaniem z przeglądarki. Zapytania z przeglądarki
  dalej dostają 403.
- Bez argumentów (OVH ich nie przekazuje) rwdz_update.php mógł się wywrócić na getopt(). Poprawione.
- W README było „php tools/maintain_cache.php”. W panelu OVH podaje się samą ścieżkę do pliku,
  bez „php” na początku.

KROK 1 — wgraj poprawione pliki (do katalogu portalu, np. test25/; nadpisz):
  api/_common.php
  cron/rwdz_update.php
  tools/maintain_cache.php
(Są w paczce msportal-19.50.0-cron-poprawka.zip i w pełnej paczce msportal-19.50.0-serwer.zip.)

KROK 2 — ustal ścieżkę katalogu portalu
  Panel OVH → Web Cloud → Hosting → (Twój hosting) → zakładka „Multisite”
  → wiersz domeny mapownik.swiadectwa.net → kolumna „Katalog główny”.
  - Jeśli jest tam „www”, portal testowy to:  www/test25
  - Jeśli jest inny katalog (np. „mapownik”), portal testowy to:  mapownik/test25
  Ścieżkę wpisujesz od katalogu głównego FTP, BEZ ukośnika na początku.

KROK 3 — dodaj zadania
  Panel OVH → Web Cloud → Hosting → (Twój hosting) → zakładka „Zaplanowane zadania - Cron”
  → „Dodaj zaplanowane zadanie”.

  Zadanie A — sprzątanie pamięci podręcznej kafli (zawsze):
    Polecenie do wykonania:  www/test25/tools/maintain_cache.php
    Język:                   PHP 8.1 lub nowszy — najlepiej ta sama wersja co strona (np. PHP 8.3)
    Aktywacja:               włączone
    Częstotliwość (tryb prosty): codziennie, godzina 4
    Raport na e-mail:        „w przypadku błędu” (opcjonalnie)
    Opis:                    Mapownik test25 — sprzątanie cache

  Zadanie B — aktualizacja bazy pozwoleń na budowę
  (tylko jeśli wgrałeś data/rwdz/rwdz.sqlite):
    Polecenie do wykonania:  www/test25/cron/rwdz_update.php
    Język:                   jak wyżej
    Aktywacja:               włączone
    Częstotliwość:           codziennie, godzina 3
    Opis:                    Mapownik test25 — pozwolenia RWDZ

  Uwagi:
  - Nie dopisuj „php” ani argumentów (np. --budget). OVH ich nie przekazuje — skrypt ma
    ustawienia domyślne (limit 20 min na uruchomienie, niedokończona budowa wznawia się następnego dnia).
  - Każdy katalog portalu (test25, produkcja) ma własną parę zadań z własną ścieżką.
  - Zadania dla starych katalogów testowych (np. www/test22/...) usuń albo popraw ścieżkę.
    Zadanie wskazujące nieistniejący plik też kończy się błędem.

KROK 4 — sprawdź (następnego dnia albo po ręcznym uruchomieniu w panelu)
  - ADRES/api/health.php → „cache_maintenance_age_s” jest liczbą (nie null), mniejszą niż 172800.
  - Baza pozwoleń: diagnostyka.html (test 19.35.0) albo ADRES/api/permits.php?status=1;
    dziennik: cache/rwdz/update.log.
  - Dzienniki crona OVH: Hosting → „Statystyki i logi” → logi (cron) albo e-mail z raportem.
    Poprawne wyjście sprzątania wygląda tak:
      [2026-11-17 04:00:02] Sprzątanie cache: zakończone w 0.3 s.
    Poprawne wyjście pozwoleń (bez nowych danych) kończy się w kilka sekund wpisem
    w cache/rwdz/update.log.

JEŚLI BŁĄD SIĘ POWTÓRZY
Skopiuj treść błędu z raportu crona (e-mail albo log) — zwykle jedna–dwie linie, np.
„Could not open input file” (zła ścieżka), „Tylko z crona” (stary plik nie został podmieniony),
„dane.gov.pl: HTTP …” (chwilowy brak połączenia z dane.gov.pl).
