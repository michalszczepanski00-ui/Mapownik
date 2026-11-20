# msportal 19.47.0 — warstwy (KIEG, plany), mniej zapytań, poprawki funkcji i dołu ekranu

## Warstwy

### 1. Działki KIEG — przyczyna i poprawka
- **Przyczyna:** integracja GUGiK nie obsługuje już układu EPSG:3857, w którym portal pytał o obraz. Odpowiadała błędem usługi (`Projection library error … init=epsg:3857`) zamiast obrazu. Przeglądarka blokowała tę odpowiedź (ORB), a serwer pośredniczący dostawał ten sam błąd. Dlatego wychodziło zapytanie, ale obraz nie powstawał, a po ok. 30 s warstwa dostawała status „niedostępna”.
- **Teraz:**
  - KIEG pyta w EPSG:2180 (WMS 1.1.1), jak Geoportal. Integracja przekierowuje wtedy do serwera powiatu (np. `walecki.webewid.pl`), a obraz do widoku mapy obraca przeglądarka.
  - Serwery powiatów zrywają połączenia z hostingu („Connection reset by peer”, errno 104) — to samo widać na serwerze testowym. Dlatego pierwsza próba idzie z przeglądarki, a serwer pośredniczący jest zapasem.
  - KIEG nie pobiera już legendy (same linie i numery). Pobieranie przez serwer kończyło się 502 i zostawiało puste pole pod suwakiem krycia.
- **Rysowanie nie zależy od legendy ani od sprawdzania usługi.** Legenda pobiera się tylko do panelu legendy i szczegółów warstwy.

### 2. Rysunek MPZP i warstwy jednoobrazowe nie odświeżały się przy przybliżaniu
- **Przyczyna:** OpenLayers zamawia nowy obraz na początku przybliżenia, a zdarzenie `movestart` przychodzi chwilę później. Loader uznawał wtedy swoje zapytanie za przestarzałe i przerywał je przed wysłaniem. Obraz zostawał na zawsze w stanie „ładuje”, a mapa pokazywała powiększony, rozmyty stary obraz.
- **Teraz:** jeden obraz na widok nie jest przerywany przy zmianie widoku. Po przybliżeniu nowy obraz przychodzi zwykle w ciągu kilku sekund (sprawdzone w przeglądarce).
- **Układ rysunku MPZP bez zmian (EPSG:3857):** w EPSG:2180 część gmin (Warszawa, Lublin, Białystok, Łódź) odrzuca zapytania.

### 3. Napisy ucięte na krawędziach kafli, symbol strefy powtarzany jak siatka
Wszystkie warstwy planistyczne (MPZP z Rejestru, POG uchwalone, projektowane, w opracowaniu, strefy) pobierają **jeden obraz na widok** zamiast kafli 512 px. Daje to:
- napisy uchwał w całości;
- symbol strefy (SO, SU…) raz na obszar;
- jedno zapytanie na warstwę zamiast kilkunastu kafli.

Pozostałe nakładki kaflowe mają margines kafla 64 px (`gutter`), więc ich napisy nie są ucinane.

### 4. Łaty jaśniejszych i ciemniejszych kwadratów
Nakładki nie mają już płynnego przejścia kafli (`transition: 0`). Krycie ustawia warstwa, nie kafel, więc stare i nowe półprzezroczyste kafle nie nakładają się przy przybliżaniu.

### 5. Strefy POG nie są rysowane podwójnie
| Warstwa | Zawartość |
|---|---|
| POG — w trakcie przyjmowania | akt i obszary (OZS, OUZ, dostępność infrastruktury), bez stref |
| Strefy POG — projektowane (nowa) | strefy projektów, z własnym kryciem i stałą legendą, jak strefy wiążące |

Identyfikacja w karcie działki dalej sprawdza akt i strefy projektu jednym zapytaniem.

### 6. Mniej zapytań do serwerów rządowych
- **Warstwy planistyczne:** jeden obraz na widok (pkt 3).
- **Sonda licznika „W widoku”:**
  - sprawdza środek kadru w skali mapy, do 512 px (¼ pikseli wcześniejszej próbki 1024×703);
  - działa po zatrzymaniu mapy, z pamięcią wyników;
  - dla włączonych warstw nie wysyła osobnej próbki — wynik bierze z obrazu, który mapa już pobrała.
- **Licznik „W widoku”:** w trakcie sprawdzania pokazuje „…” zamiast 0.
- **Ograniczenie:** łączenie trzech warstw MPZP z Rejestru w jedno zapytanie nie jest zrobione — każda warstwa ma osobny przełącznik i krycie. Po zmianie na jeden obraz na widok to i tak 1 zapytanie na włączoną warstwę.

### 7. Jedna zasada drogi zapytań
- **Wszystkie nakładki z profili źródeł:** najpierw serwer pośredniczący (z pamięcią podręczną), przeglądarka tylko awaryjnie. Po dwóch kolejnych błędach serwera warstwa przez 10 min pyta najpierw bezpośrednio.
- **Wyjątek — KIEG:** najpierw przeglądarka, bo serwery powiatów zrywają połączenia z hostingu (pkt 1).

### 8. Czytelność przy wielu warstwach planistycznych
- **Krycie efektywne** (suwak użytkownika się nie zmienia):
  - na ortofotomapie i NMT wypełnienia planistyczne ×0,6, np. 58% → 35%;
  - MPZP przy włączonych strefach POG ×0,5.
- **Tryb „tylko obrysy” dla MPZP nie jest możliwy:** usługi WMS MPZP nie udostępniają stylu bez wypełnień.
- **Przy 8–9 włączonych warstwach kolory nadal się sumują**, bo każda warstwa jest osobnym obrazem.

## Serwer
- **Ponowienia po zerwanym połączeniu:**
  - zapytania do usług rządowych (`official_gis_remote_get`) dostają trzecią próbę tylko po zerwanym połączeniu (errno 104, `SSL_ERROR_SYSCALL`, „reset by peer”);
  - ponowienia idą przez IPv4.
- **Rejestr cen (`rcn.php`):**
  - do 3 prób, każda nowym połączeniem, HTTP/1.1 i IPv4;
  - zwykły komunikat zamiast tekstu OpenSSL (szczegół w polu `detail` i w dzienniku serwera).

## Funkcje
- **Błąd React #300** przy przejściu Sprawdź → Mierz (panel identyfikacji się wywracał):
  - **przyczyna:** hook dodany w 19.46.0 stał za warunkowym `return` — to był mój błąd;
  - **teraz:** wybrana działka zostaje przy zmianie narzędzia; karta, obrys i Raport PDF są dostępne w Mierz i po powrocie do Sprawdź. Wynik czyści zamknięcie karty.
- **Ceny transakcyjne:**
  - automatyczne ponowienie (do 2 razy) w karcie, w zakładce Raport i w narzędziu Ceny; zwykły komunikat zamiast tekstu technicznego;
  - na liście „Ostatnie transakcje” zł/m² tylko dla transakcji w statystyce. Pozostałe (udział w gruncie pod budynkiem, pas gruntu z budynkiem, nietypowe) mają cenę łączną z dopiskiem „łącznie” i powód;
  - transakcje kilku działek mają opis „transakcja wielodziałkowa: N działek”. Mediana bez zmian — liczona od łącznej powierzchni.
- **Budowy:** licznik sekund przy wyszukiwaniu, limit 30 s na zapytanie z komunikatem i przyciskiem „Ponów”.
- **Pomiary:** domyślnie tymczasowe — nie trafiają do panelu Obiekty. Zapis przyciskiem „Dodaj do projektu” albo przełącznikiem „Pomiar”.
- **„Image load error” w dzienniku błędów:** dopisane źródło (np. `źródło: overlay.dzialki, przekroczono czas`), a w konsoli ostrzeżenie z nazwą warstwy (najwyżej raz na minutę na źródło).

## Układ ekranu
- **Podkłady jak w Google Maps:**
  - jedna miniatura; po najechaniu (albo fokusie, stuknięciu) rozwija się w jednym rzędzie nad mapą i zwija po wyborze lub odjechaniu;
  - nic nie przesuwa: pasek narzędzi, skala i lewy panel zostają na miejscu;
  - strzałka rozwijania tylko na ekranach dotykowych.
- **Lewy panel karty działki** kończy się wyraźnie nad miniaturą podkładu (ok. 60 px odstępu przy 900 px wysokości ekranu).

## Testy
- **Vitest:** 79 testów (nowe: krycie efektywne, ponawianie zapytań, status źródła).
- **Playwright:** 15 scenariuszy (test podkładów dostosowany do rozwijania po najechaniu).
- **Diagnostyka na lokalnym Apache:** 198 testów, 187 OK. Pozostałe to usługi zewnętrzne niedostępne z tego środowiska (GDOŚ 403, PIG 502), brak bazy RWDZ i znany test „Faza 4”. Cztery testy zaktualizowane do zamierzonych zmian: KIEG w EPSG:2180, jeden obraz na widok, nowa warstwa stref, mniejsza sonda.
- **Kontrola wydania, TypeScript, kontrola wdrożenia:** bez błędów.
- **Nie dało się sprawdzić tutaj:** rysowania KIEG z serwera powiatu, bo serwer `webewid.pl` zrywa połączenia z tego środowiska, tak jak z hostingu. Sprawdź po wgraniu: Warstwy → Działki ewidencyjne (KIEG) przy 1:1 800.

## Wgranie
Jak 19.46.0: cała zawartość `msportal-19.47.0-serwer.zip` („nadpisz zawsze”), `index.html` i `.htaccess` na końcu. Potem `verify-deployment.php` → `"leftover_files": []`.
