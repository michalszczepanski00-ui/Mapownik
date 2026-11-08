# msportal 19.29.0 — ceny transakcyjne z Rejestru Cen Nieruchomości (RCN)

Zawiera też wszystkie zmiany z 19.28.0 (layout, wyszukiwarka, łatwiejsza obsługa — `ZMIANY_19.28.0.md`).

## Nowe: „Ceny transakcyjne w okolicy” (zakładka Raport)
- **Źródło**: bezpłatna usługa WFS GUGiK `mapy.geoportal.gov.pl/wss/service/rcn` (od nowelizacji 2025) — bez
  wgrywania własnej bazy (dawny moduł RCN z bazą SQLite usunięto w 19.23).
- **Wokół czego**:
  - działka z raportu;
  - albo działka z karty (bez tworzenia raportu);
  - albo, gdy działka nie jest wybrana, środek mapy przy zbliżeniu (np. na telefonie).
- **Rodzaj**: Grunty (niezabudowane) · Domy · Mieszkania. **Okres**: 2 / 3 / 5 / 10 lat. **Promień**: 300 m – 1,5 km.
  Wybór zapamiętuje przeglądarka.
- **Wynik**:
  - mediana zł/m² i typowy przedział (50% transakcji);
  - mediana ceny i powierzchni;
  - liczba transakcji i okres.
  Dla domów główną wartością jest cena całej nieruchomości.
- **Lista ostatnich transakcji**: data, zł/m², cena, powierzchnia, liczba pokoi, rynek pierwotny / wtórny,
  odległość. Kliknięcie przybliża mapę do transakcji.
- **Punkty na mapie** w odcieniach wg ceny (tańsze / typowe / droższe), z etykietą zł/m² przy zbliżeniu.
- **Pobierz CSV** — pełna lista do Excela (separator „;”, polskie znaki).

## Rzetelność statystyki
Rejestr zawiera wiele zapisów, które zaburzałyby medianę. Pomijamy je w statystyce (zostają na liście, wyszarzone,
z powodem):
- **sprzedaż udziałów** (np. 1/105 drogi wewnętrznej przy zakupie domu w osiedlu);
- **grunty pod drogami** i **paski gruntu** poniżej 150 m²;
- **transakcje nierynkowe** (bezprzetargowe, z bonifikatą) i **bez ceny**;
- **ceny nietypowe** spoza rozsądnego zakresu;
- **pakiety** kilku lokali sprzedanych jedną ceną.

Poprawki danych źródłowych:
- powiaty podają powierzchnię działek w m² albo w ha — przeliczamy automatycznie;
- gdy rejestr podaje cenę nieruchomości, ma ona pierwszeństwo przed ceną całej transakcji.

## Technicznie
- **Nowy plik `api/rcn.php`**:
  - filtruje po stronie GUGiK (obszar, rodzaj nieruchomości, data aktu) i grupuje rekordy w transakcje;
  - wynik trzyma w `cache/rcn/` przez 3 dni;
  - gdy rejestr nie odpowiada, pokazuje ostatni zapisany wynik.
  Nie zależy od innych plików `api/`.
- Czas odpowiedzi: 0,7–3,6 s przy pierwszym zapytaniu, natychmiast z cache.
- Diagnostyka: nowy test „19.29.0 — ceny transakcyjne RCN”.

Sprawdzone ceny (promień 1 km, 5 lat, mediany):

| Miejsce | Grunty | Mieszkania | Domy |
|---|---|---|---|
| Starogard Gd. | 155 zł/m² | 6 504 zł/m² | 500 tys. zł |
| Kórnik | 239 zł/m² | 6 103 zł/m² | — |
| Centrum Warszawy | — | 22 235 zł/m² | — |

## Wgranie
1. Wgraj `aktualizuj-19.29.php` i otwórz `https://…/test22/aktualizuj-19.29.php`.
   Skrypt dopisze nową wersję obok obecnej i zmieni numery wersji w plikach serwera.
2. Wgraj pozostałe pliki z paczki, nadpisując:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`;
   - `assets/css/36-latwa-obsluga.css`;
   - katalog `app-19.29.0/`;
   - nowy plik `api/rcn.php`.
3. Sprawdź portal (Ctrl+F5): działka → zakładka Raport → „Ceny transakcyjne w okolicy”.
4. Otwórz `aktualizuj-19.29.php?sprzatanie=1`. Skrypt usunie stare katalogi app-* i skrypty aktualizacji.
5. `verify-deployment.php` → `"deployment_consistent": true`. W diagnostyce test 19.29.0 na zielono.
