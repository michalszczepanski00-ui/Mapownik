# msportal 19.2.0 — analiza RCN i otoczenia BDOT10k na VPS

Podstawa: msportal 19.1.0. Wszystkie dotychczasowe moduły mapowe, eksporty i automatyczna synchronizacja zostają zachowane.

## Nowy panel RCN

- Filtry: rodzaj nieruchomości (grunty, budynki, lokale, inne, nieokreślone), powierzchnia min./maks., lata transakcji i zasięg od środka mapy.
- Wyniki wektorowe na mapie, CSV, mediana i średnia zł/m², kwartyle 25/75 oraz trend mediany według roku.
- Maks. 200 geometrii w odpowiedzi mapowej; do 10 000 dopasowanych transakcji w statystyce. Przekroczenie limitu jest widocznie oznaczone jako analiza niepełna.
- Rodzaj nieruchomości identyfikowany **tylko**, gdy zaimportowany zestaw zawiera pole z odpowiednią klasyfikacją. Nieznane typy pozostają oznaczone jako „nierozpoznane”; nie należy ich pomijać przy analizach całości rynku.
- Wskaźnik zł/m² to cena podzielona przez powierzchnię wskazaną w mapowaniu importera. Nie rozpoznaje transakcji pakietowych, praw własności ani metod wyceny. **To nie operat szacunkowy.**

## Nowy panel BDOT10k

- Obiekty OT_BUBD_A (budynki) i OT_SKDR_L (drogi) analizowane w promieniu 0,5–3 km od środka mapy.
- Liczby obiektów i odległości do najbliższego budynku oraz najbliższej drogi. Odległość jest rzeczywistą odległością do geometrii przetransformowanej do EPSG:2180, nie do centroidu ani pikseli WMS.
- Zwracanych jest maks. 30 najbliższych obiektów; analiza odległości przetwarza maks. 2 500 kandydatów. Zbyt duża liczba kandydatów generuje ostrzeżenie.
- Dostępność klas BDOT pokazywana oddzielnie. Brak danych w bazie **nie oznacza**, że w analizowanym obszarze nie ma budynków ani dróg.
- BDOT10k **nie** zawiera wiarygodnej kompletnej informacji o przebiegu sieci GESUT: to analiza infrastruktury drogowej i zabudowy, nie dostępności gazu, prądu lub uzbrojenia.

## Serwer i synchronizator

- Migracja bazy SQLite 19.1 -> 19.2 bez kasowania danych (nowe atrybuty: `asset_type`, `bdot_class`, `building_use`).
- Rozszerzony importer: identyfikacja klasy BDOT, klasyfikacja typu RCN, funkcja budynku; zachowane indeksy RTree.
- Źródła manifestu: nowe opcjonalne pola `bdot_class`, `building_use_field`; aktualny schemat `sources.json` pozostaje `schema=1`.
- Sync wykryje zmianę wersji indeksu i przy następnym uruchomieniu ponownie zaimportuje źródła oznaczone jako aktywne. Uwaga: może to wymagać pobrania dużych plików; skontroluj limity i wolne miejsce.
- Usunięto błąd: limit `max_rows` jest sprawdzany po filtracji bbox i nie może zostać omyłkowo pominięty przez obsługę wyjątków. Import ponad limit pozostawia poprzednią bazę.
- Zachowane zabezpieczenia synchronizatora (HTTPS allowlist, blokada równoległości, limity transferu, wolne miejsce, transakcyjność).

## Granice zakresu

- Dotychczasowy moduł *Analiza* (własne PHP / screening) nie jest automatycznie przełączony na indeks VPS. Nowe możliwości są dostępne w osobnym panelu **RCN i BDOT10k**.
- Brak automatycznego mapowania wszystkich możliwych schematów powiatowych RCN; pierwsza konfiguracja pola `class_field`, `price_field` i `area_field` wymaga obejrzenia prawdziwego pliku.
- Brak rzeczywistych plików danych. Zawartość źródeł na OVH nie została w tym środowisku zweryfikowana; wszystkie szablonowe źródła startują wyłączone.
- Nie wykonywano wdrożenia na rzeczywistym serwerze OVH.

## Testy

```bash
cd vps
PYTHONPATH=. python -m unittest discover -s tests -v
```

15 testów na sztucznych danych: RCN, BDOT10k, pomiar odległości, filtrowanie, migracja SQLite, limit rekordów, synchronizacja i rollback.
