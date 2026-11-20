# msportal 19.3.0 — Menedżer danych i odczyt fragmentów GeoParquet

## Nowe
- Sekcja **Menedżer danych** w panelu RCN i BDOT10k: wybór do 8 województw / powiatów (po imporcie PRG) i do 6 klas BDOT10k, lista wybranych obszarów.
- Serwerowy plan importu ze stanem przestrzeni dyskowej, limitem pliku i rezerwą bezpieczeństwa; rozmiar faktycznie pobieranych danych jest oznaczony jako nieznany do czasu analizy źródła.
- Bezpieczny zapis konfiguracji sources.json z poziomu interfejsu po podaniu tokenu administratora. Możliwość ponownego wczytania zapisanej konfiguracji. Token nie jest przechowywany w przeglądarce (po ponownym otwarciu panelu trzeba go wpisać).
- Zdalny **odczyt częściowy GeoParquet** z obsługą HTTP Range 206, filtrowaniem bbox, opcjonalnym pomijaniem row groups ze statystykami bbox, zapisem małego lokalnego GeoParquet i dopiero potem importem do SQLite.
- Odrzucanie źródeł bez HTTP Range, brak zgodności schematu GeoParquet, przekroczenia maksymalnych odczytów, rekordów i przestrzeni dyskowej; nieudany import nie usuwa poprzedniej bazy.
- Obsługa opcjonalnego katalogu powiatów zaimportowanego z GeoJSON PRG EPSG:4326 i kodów TERYT.
- Nadal automatyczne sprawdzanie zmian ETag/Last-Modified i systemd timer. Stare adresy plików źródłowych i ręcznie zdefiniowane źródła pozostają zachowane.

## Ograniczenia
- Bez dostępnej geograficznej indeksacji row groups lub przy braku uporządkowania przestrzennego Parquet odczyt częściowy może wymagać przeczytania znacznej części pliku; obowiązuje limit, a operacja może nie dojść do końca na 4 GB RAM.
- Odczyt częściowy możliwy tylko dla GeoParquet udostępnianego z domen zatwierdzonych przez GUGiK, z geometrią WKB, jeśli serwer obsługuje Range. Pełne pobrania GeoPackage RCN pozostają możliwe do limitu 2 GiB.
- Domyślnie nie ma skonfigurowanego kompletnego URL i mapowania pól RCN; trzeba je podać zgodnie z rzeczywistym formatem pliku urzędowego.
- Powiaty: wgrywa się publiczny GeoJSON PRG przed pierwszym wyborem powiatu. Bbox nie jest dokładną geometrią granicy administracyjnej.
- W wersji 19.3 pojedynczy adres RCN może być przypisany tylko do jednego obszaru w jednym planie; BDOT10k obsługuje wiele obszarów.
- Nie testowano pełnego pobierania z GUGiK ani działania na rzeczywistym OVH; testy automatyczne są lokalne.
