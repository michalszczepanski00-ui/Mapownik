# msportal 19.37.0 — „Czyj las” (Bank Danych o Lasach)

Zawiera też 19.36.0 (raport działki PDF) i 19.35.0, jeśli nie zostały wgrane.

## Co nowego
- **Warstwa „Lasy — własność (BDL)”** w grupie Środowisko:
  - lasy Skarbu Państwa w zarządzie Lasów Państwowych na zielono;
  - lasy poza LP (prywatne, gminne, inne) na pomarańczowo;
  - widoczna od skali ok. 1:50 000;
  - ma własną legendę we wspólnej legendzie mapy i w panelu Warstwy.
- **Karta działki:**
  - nowy wiersz **Las** w podsumowaniu: „Lasy Państwowe”, „prywatny, poza LP”, „gminny, poza LP” albo „brak lasu w BDL”;
  - w sekcji Środowisko szczegóły: własność, RDLP, nadleśnictwo, leśnictwo, typ siedliskowy, gatunek panujący i wiek, funkcja lasu, kategoria ochronności, powierzchnia wydzielenia, adres leśny, rok danych;
  - na telefonie to samo (podsumowanie i szczegóły karty).
- **Raport PDF** — nowa sekcja **Las — własność**:
  - włączona w szablonach Dla kupującego, Planistyczny i Pełny;
  - sprawdza środek i 4 skrajne punkty działki, bo działka bywa częściowo leśna;
  - opisuje własność, nadleśnictwo i leśnictwo, drzewostan, funkcję;
  - dodaje wpis do „W skrócie” i do tabeli źródeł.

## Technicznie
- **Nowy plik `api/forest.php`** (niezależny od pozostałych plików api/):
  - `?x=&y=` (EPSG:2180) — informacja w punkcie z warstw BDL: „Wydzielenia PGL LP”, „Wydzielenia poza PGL LP” (pole kategorii własności) i „Leśnictwa”; trzy zapytania naraz, pamięć 7 dni;
  - `?wms=1&…` — mapa PNG ze stylem SLD (zielony / pomarańczowy), pamięć 30 dni w `cache/forest/`. Ta sama domena, więc mapa wchodzi do eksportu PNG i PDF.
- **Katalog warstw:** warstwa może mieć własną legendę (`legendUrl`) i własny adres informacji (`identifyUrl`).
- **Diagnostyka:** test „19.37.0 — Czyj las”, sprawdzający las państwowy (Nadl. Chojnów), las prywatny (okolice Siedlec) i mapę PNG.

## Ograniczenia
- **Rozróżnienie kategorii na mapie:** Lasy Państwowe odróżnia od pozostałych. Dokładną kategorię spoza LP (prywatne, gminne…) podaje kliknięcie, bo usługa BDL nie obsługuje filtrów stylu.
- **Lasy bez planu urządzenia lasu:** BDL nie obejmuje lasów bez planu urządzenia lasu (np. małych lasów prywatnych) ani parków narodowych. „Brak lasu w BDL” nie znaczy, że lasu nie ma — rozstrzyga ewidencja gruntów (użytek Ls).

## Wgranie (aktualizacja_19.37.0.zip)
1. Wgraj `aktualizuj-19.37.php` i otwórz go w przeglądarce.
2. Wgraj resztę paczki:
   - `api/forest.php`;
   - `assets/legend/`;
   - `index.html`, `diagnostyka.html`, `VERSION.txt`;
   - `app-19.37.0/`;
   - pliki 19.36 i 19.35 (`vendor/pdf/`, `konfiguracja/`, `assets/css/37-raport-pdf.css`, `api/permits.php`, `cron/`), jeśli nie były wgrane.
3. Ctrl+F5. W panelu Warstwy włącz „Lasy — własność (BDL)” i kliknij las.
4. Otwórz `aktualizuj-19.37.php?sprzatanie=1`, potem `verify-deployment.php`.
