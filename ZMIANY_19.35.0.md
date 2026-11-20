# msportal 19.35.0 — eksport „jak na ekranie” i automatyczna aktualizacja pozwoleń

Zawiera też 19.34.0, 19.33.0 i 19.32.1, jeśli nie zostały dokończone (krok 2 sprzątania).

## Eksport „jak na ekranie”
- **Gdzie:** panel Eksport (prawa belka; na telefonie „Więcej” → Eksport), nowa pierwsza sekcja „Obraz jak na ekranie”.
- **Co daje:** PNG z dokładnie tym, co widać na mapie:
  - podkłady Pastel, Zmierzch i Karto z rzeźbą;
  - nachylenie;
  - wyniki narzędzi (ceny, budowy, pomiary, szkice).
- **Jakość:** standardowa ×1, wysoka ×2 (domyślna), bardzo wysoka ×3. Linie i napisy zachowują proporcje z ekranu.
- **Pasek pod mapą** (można wyłączyć): podziałka, przybliżona skala, data i lista widocznych warstw.
- **Warstwy GUGiK (np. działki KIEG):** w czasie eksportu są pobierane przez proxy portalu. Dzięki temu przeglądarka pozwala zapisać obraz. Po eksporcie mapa wraca do stanu sprzed eksportu.
- **Typowy czas:** 1–5 s.
- **Dotychczasowy eksport z serwera** (PL-1992, duże formaty, A4/A3) zostaje bez zmian, pod nazwą „Obraz z serwera”.

## Automatyczna aktualizacja bazy pozwoleń na budowę
- **Nowy skrypt:** `cron/rwdz_update.php`, uruchamiany przez Zaplanowane zadania OVH (codziennie).
  - Działa tylko z crona; z przeglądarki `cron/` zwraca 403 (`cron/.htaccess`).
- **Każde uruchomienie:**
  - Sprawdza w dane.gov.pl (zbiór 3467) datę danych GUNB.
  - Gdy dane nie są nowsze, kończy się po ok. 1 s.
- **Gdy są nowe dane:**
  - Pobiera 16 plików wojewódzkich i plik zgłoszeń, po jednym naraz.
  - Buduje nową bazę obok starej (`data/rwdz/rwdz.sqlite.building`).
  - Podmienia ją jednym ruchem. Portal cały czas korzysta ze starej bazy.
- **Limit czasu:** 20 min na jedno uruchomienie. Niedokończoną budowę dokańcza następne uruchomienie.
  - Lokalny test: pełna budowa w 3,2 min, pamięć 20 MB.
  - Wynik zgodny z budową w Pythonie: 677 388 inwestycji, identyczny podział na typy.
- **Zabezpieczenia:**
  - Blokada przed równoległym uruchomieniem.
  - Bazy z podejrzanie małą liczbą wpisów (< 1000) nie podmienia.
  - Brak jednego pliku u źródła nie zatrzymuje budowy, tylko trafia do `missing`.
- **Stan aktualizacji:**
  - `api/permits.php?status=1`: data danych, liczba wpisów, ostatnie uruchomienie;
  - test 19.35.0 w `diagnostyka.html`;
  - dziennik `cache/rwdz/update.log`.
- **Zapamiętane położenia działek** (`cache/rwdz/geo.sqlite`) zostają, więc wyszukiwanie budów nie zwalnia po aktualizacji.
- **Narzędzie w Pythonie** (`tools/build_rwdz_store.py`) zostaje jako zapasowe, do ręcznej budowy.

### Ustawienie w OVH (jednorazowo)
1. Panel OVH → Web Cloud → Hosting → zakładka **Zaplanowane zadania – Cron** → **Dodaj zaplanowane zadanie**.
2. Polecenie: ścieżka skryptu od katalogu głównego hostingu, np. `www/test22/cron/rwdz_update.php`.
   Dokładna ścieżka zależy od katalogu, w którym leży portal.
3. Język: PHP 8.x (ta sama wersja co strona). Logi e-mailem: opcjonalnie, „tylko przy błędzie”.
4. Częstotliwość: codziennie, np. o 3:00. Zadanie zostaw włączone.
5. Po pierwszym uruchomieniu w `diagnostyka.html` test „automatyczna aktualizacja bazy pozwoleń” pokaże `cron: aktualne`.

**Miejsce na dysku:** na czas budowy potrzeba ok. 500 MB wolnego miejsca: nowa baza 220 MB obok starej plus pobierany plik.

## Wgranie (aktualizacja_19.35.0.zip)
1. Wgraj `aktualizuj-19.35.php` i od razu otwórz go w przeglądarce.
2. Wgraj pliki z paczki:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`, `api/permits.php`;
   - katalog `cron/` (razem z ukrytym `.htaccess`);
   - katalog `app-19.35.0/`.
3. Odśwież portal (Ctrl+F5) i sprawdź eksport.
4. Otwórz `aktualizuj-19.35.php?sprzatanie=1`, potem `verify-deployment.php` i sprawdź `"deployment_consistent": true`.
   - Krok 2 usunie też pozostałe na serwerze katalogi `app-19.32.0`, `app-19.32.1` i `app-19.34.0`.
5. Ustaw zadanie Cron w OVH (powyżej).
