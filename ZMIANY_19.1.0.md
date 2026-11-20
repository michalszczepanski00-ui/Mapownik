# msportal 19.1.0 — automatyczna synchronizacja BDOT10k i RCN

## Zmiany

1. Dodano `vps/msportal/source_sync.py` — pobieranie plików ze skonfigurowanych URL HTTPS, kontrole ETag/Last-Modified, SHA-256, limity rozmiaru i przestrzeni oraz import do istniejącej bazy SQLite RTree.
2. Dodano `vps/config/sources.example.json` — manifest źródeł (początkowo **wszystkie wyłączone**). Domyślnie przygotowano definicje dwóch klas BDOT10k oraz miejsce na link do pliku RCN. Adresy klas BDOT to adresy zgodne ze schematem katalogu GUGiK; przed aktywowaniem należy sprawdzić ich dostępność i wielkość.
3. Dodano `vps/systemd/msportal-sync.timer` i `.service` — automatyczna kontrola codziennie ok. 03:15 czasu polskiego, z losowym opóźnieniem do 30 minut. Jedno zadanie naraz, przy ograniczeniach RAM i CPU.
4. Ograniczenie importu do bbox EPSG:4326 (`--bbox`) — nie trzeba zapisywać całej Polski na dysku 40 GB.
5. Automatyczny import **nie zastępuje udanej poprzedniej wersji**, gdy pobranie lub przetwarzanie kończy się błędem. Odrzucony jest import, który zwróci 0 obiektów.
6. Prywatny, rotowany log synchronizacji i atomowy plik stanu. Przerwane pobrania są usuwane, a pliki źródłowe nie są pozostawiane na małym VPS po zakończeniu importu.
7. Endpoint wyłącznie do odczytu `/vps/api/sources/status`, bez ujawniania adresów pobrań ani ścieżek. Brak publicznego endpointu wymuszającego aktualizację.
8. W prawym panelu **RCN i BDOT10k** pojawił się status aktualizacji, błędów oraz data ostatniego importu.
9. Katalog aplikacji `app-19.1.0`, nowy numer wersji i odświeżone identyfikatory cache dla frontendu.
10. Dodano testy jednostkowe synchronizatora bez wykonywania połączeń z rzeczywistym Geoportalem.

## Celowo niezaimplementowane

- Automatyczne odkrywanie trwałych linków do plików RCN w Geoportalu (nie jest udokumentowany jeden stały publiczny adres dla każdego powiatu); konieczne pierwsze wskazanie źródła i jawne zmapowanie pól `price_field`/`area_field`.
- Import ZIP/GML oraz automatyczna konwersja dowolnych dokumentów GML RCN. Importer obsługuje GeoParquet, GeoPackage, GeoJSON i GeoJSONL.
- Migracja dotychczasowego silnika screeningu budynków do nowej bazy SQLite.
- Pełne dane ogólnopolskie na dysku 40 GB.
- Wdrożenie produkcyjne na rzeczywistym serwerze OVH. Konfiguracja wymaga domeny, TLS i danych dostępowych, których nie podawano.

## Testy

Testy offline: `cd vps && PYTHONPATH=. python -m unittest discover -s tests -v`.
