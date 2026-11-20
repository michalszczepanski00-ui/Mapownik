# msportal 19.3.1 — poprawki po audycie 19.3.0

Wydanie naprawcze. Bez nowych funkcji i bez zmian w formacie projektów i bazy danych.

## Wdrożenie i wersje
- **.htaccess** wpuszczał tylko katalog `app-18.18.4/`. Na Apache (hosting OVH) każdy plik `app-19.3.0/` dostawał 410, czyli biały ekran. Teraz reguła wskazuje bieżący katalog.
- Ujednolicone numery wersji w `health.php`, `index.html`, diagnostyce, monitorze źródeł, eksporcie PNG/ZIP, plikach `.mapownik` i raportach błędów. Wcześniej występowały jednocześnie 19.0.0, 19.2.0 i 19.3.0. Test diagnostyki „spójność wdrożenia” przechodzi. Plik projektu bierze wersję z `index.html`.
- `tools/bump_version.py`:
  - podmienia każdą regułę `app-X.Y.Z` w `.htaccess`, a nie tylko regułę poprzedniej wersji;
  - obejmuje `msportal.conf.example`, `*.sh` i `*.service`;
  - obejmuje identyfikatory `MSPortal/X.Y.Z`.
- `verify-deployment.php` rozpoznaje tytuł diagnostyki niezależnie od wielkości liter.

## Interfejs
- **Panel Obiekty**: po zaznaczeniu obiektu treść miała 356 px w panelu 329 px. Ucinało to przycisk zamknięcia, listę typów i pola inspektora. Wszystkie panele doku mają teraz jedną kolumnę o szerokości panelu.
- **Panel RCN i BDOT10k**:
  - arkusz CSS stylizował klasę `vps-field`, a komponent używał `vps-input`. Pola i listy wyboru są teraz zwarte, w stylu portalu;
  - kolory pochodziły z nieistniejących zmiennych. W ciemnym motywie kafelek był biały z białym tekstem. Teraz panel korzysta z tokenów motywu.
- **Sprawdź (Informacja o działce)**: gdy usługa nie odpowie, podsumowanie MPZP, planu ogólnego i ochrony pokazuje „nie sprawdzono” (kolor ostrzeżenia) z podpowiedzią. Wcześniej był napis „brak danych”, łatwy do pomylenia z „brak”.
- **Eksport CSV z RCN/BDOT**: liczby bez cudzysłowów i z przecinkiem dziesiętnym. Excel w polskiej lokalizacji liczy je jako liczby, a nie tekst lub daty.
- **Menedżer danych**:
  - domyślne Pomorskie jest tylko propozycją: pierwszy przycisk „Ustaw jako obszar planu” je zastępuje;
  - nie da się dodać województwa razem z jego powiatem;
  - każda zmiana ustawień unieważnia podgląd planu, więc nie można zapisać innego planu, niż sprawdzono;
  - komunikat „Wczytano zapisane ustawienia” jest zielony;
  - kontrola HTTPS korzysta z `isSecureContext`;
  - panel ma przycisk „Sprawdź ponownie”, gdy VPS chwilowo nie odpowie.

## Backend VPS
- **Duplikaty**: ten sam obiekt z kilku źródeł, np. województwa i powiatu albo starego źródła i źródła Menedżera, był liczony wielokrotnie. Dotyczyło to liczby budynków w promieniu (test: 88 zamiast 44), list wyników i statystyk cen RCN. Zapytania grupują teraz identyczne rekordy.
- **Usunięte źródła**:
  - pełna synchronizacja (`source_sync sync`) usuwa z bazy dane źródeł, które zniknęły z `sources.json`;
  - kasowane są tylko źródła zarządzane przez Menedżer lub wcześniej synchronizowane;
  - ręczne importy z CLI (`--source-id`) zostają;
  - wyłączenie tego mechanizmu: `--keep-removed`.
- **Plan**:
  - odrzuca nakładające się obszary (województwo i jego powiat);
  - ostrzega, gdy ręczne źródło tej samej klasy obejmuje ten sam teren;
  - informuje, ile usuniętych źródeł zostanie skasowanych;
  - plan z samym RCN po wczytaniu wraca z właściwym obszarem.
- **Analiza otoczenia BDOT**: przy limicie 2500 obiektów kandydaci są wybierani od najbliższych, a nie według numeru rekordu. „Najbliższy budynek/droga” nie może już zostać pominięty.
- **Zdalny odczyt GeoParquet (HTTP Range)**:
  - zakres EPSG:4326 jest przeliczany do układu pliku (BDOT10k: EPSG:2180). Przycinanie row groups według statystyk `covering.bbox` działa także dla plików w PL-1992. W 19.3.0 działało tylko dla plików w EPSG:4326, czyli praktycznie nigdy;
  - filtrowanie geometrii jest wektorowe (shapely 2), zamiast przeliczania każdego obiektu w pętli Pythona;
  - obsługa `crs` w formacie PROJJSON i domyślnego OGC:CRS84. `crs=null` daje czytelny błąd zamiast cichego założenia EPSG:4326;
  - serwer bez `Content-Length` daje jasny komunikat, zamiast próby odczytu strumieniowego;
  - test lokalnego serwera z Range: przy obszarze Gdańska z 4 row groups pominięto 3 i odczytano 31% pliku.
- Nowe testy w `vps/tests/test_release_1931.py`: duplikaty, kolejność kandydatów, sprzątanie źródeł, walidacja planu, odczyt GeoParquet w EPSG:2180 z przycinaniem, CRS84, limit rekordów. Razem 32 testy.

## Instalator, Nginx, zależności
- `install_vps.sh`:
  - **restartuje** `msportal-api` (wcześniej działająca usługa zostawała na starym kodzie);
  - usuwa z `/var/www/msportal` katalogi poprzednich wersji `app-*`;
  - kopiuje fragment `/etc/nginx/snippets/msportal-security-headers.conf`;
  - na końcu pokazuje wynik `nginx -t`.
- `vps/nginx/msportal.conf.example`:
  - bloki z własnym `add_header` (`index.html`, JS/CSS) gubiły nagłówki bezpieczeństwa (nosniff, X-Frame-Options, Referrer-Policy). Teraz dołączają je przez `include`;
  - dostępne są `setup-vendors.php` (tylko brakujące biblioteki, bez wymuszonego odświeżania) i `verify-deployment.php`;
  - jeden nagłówek `Cache-Control` dla plików statycznych;
  - konfiguracja sprawdzona `nginx -t` i curl.
- `vps/constraints.txt`: przetestowane wersje pakietów. Instalator używa ich, a gdy nie ma pakietu dla danego Pythona, wraca do zakresów z `requirements.txt`.
- `vps/requirements-test.txt` (`httpx2`) jest potrzebny do uruchomienia testów.
- `numpy` jest jawnie w `requirements.txt`.

## Bez zmian w tym wydaniu (do decyzji)
- Profil terenu i tabela wyników analiz nadal otwierają się w panelu u dołu ekranu.
- Paleta (niebieska zamiast „Las”) i podpisy pod ikonami narzędzi.
- Opcje zaznaczonego obiektu są zarówno w górnym pasku, jak i w panelu Obiekty.
- Odczyt GeoParquet nadal czyta krajowy plik osobno dla każdego obszaru i klasy.
- Nie sprawdzono pobierania z rzeczywistych serwerów GUGiK. Środowisko testowe nie miało dostępu do internetu.
