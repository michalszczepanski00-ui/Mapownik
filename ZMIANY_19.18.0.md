# msportal 19.18.0 — naprawy z audytu 19.17 i wycofanie studium

## Usunięte
- **Studium uwarunkowań i kierunków zagospodarowania przestrzennego gminy** — usunięte całkowicie:
  warstwa w katalogu, sekcja w karcie Działka (Planowanie przestrzenne ma teraz 3 pozycje: MPZP, POG,
  strefy POG), źródło w proxy (`_wms_sources.php`), identyfikacja (`identify.php`), monitor źródeł,
  diagnostyka. Zapisane projekty z włączonym studium otwierają się bez błędu (pozycja jest pomijana).

## Naprawione (audyt A1–A9)
- **A1 Ortofotomapa przy zbliżeniu na działkę** — GUGiK wycofał EPSG:3857 z WMTS wysokiej
  rozdzielczości i usługę WMS StandardResolution. Od zoomu 20 i jako zapas portal pobiera kafle
  z `ORTO/WMS/HighResolution` (EPSG:3857, przez proxy z cache); do zoomu 19 — WMTS standardowy.
  Monitor i diagnostyka sprawdzają nowe adresy.
- **A3 Mapa wysokości (hipsometria)** — JPEG z kryciem 60% zamiast pustego przezroczystego PNG.
- **A4 Zasięg mapy glebowej** — warstwa ma zakres skal (do zoomu 13) i opis ograniczenia w panelu.
- **A5 Eksport PNG „bieżący widok”** — domyślna rozdzielczość nie gorsza niż na ekranie
  (np. 2545 × 1598 px zamiast 255 × 160 px przy dużym zbliżeniu).
- **A6 Wysokości obszaru** — gdy w projekcie nie ma działek/obszarów, narzędzie od razu włącza
  rysowanie prostokąta na mapie.
- **A7 Wyszukiwanie** — adresy (GUGiK UUG, zapas: OpenStreetMap — dla ulicy bez numeru wynik
  przybliżony) w formach „Miasto, Ulica 5” i „Ulica 5 Miasto”; „obręb + numer działki”
  (np. „Bnin 100”). Wybór adresu przybliża i otwiera kartę działki.
- **A8 Monitor źródeł** — poprawny kontrakt `health.php`.
- **A9 Dane w widoku** — zastępczy kafel serwera (`FALLBACK`) liczony jako „nie sprawdzono”.

## Bez zmian w tej wersji (plan 19.19–19.20)
- B1 BDOT10k wolny z hostingu, B2 KIUT w miastach z własnym serwerem (Warszawa, Kraków),
  B3 ortofotomapa archiwalna (usługa GUGiK nie odpowiada), B4 wolne cieniowanie NMT.
- Dane: C1 baza RCN, C2 lokalna baza BDOT10k, C4 odświeżenie rejestru KOWR.

## Po wgraniu
Usuń katalogi `app-19.14.0`, `app-19.15.0`, `app-19.17.0` — wtedy `verify-deployment.php`
pokaże `deployment_consistent: true`.
