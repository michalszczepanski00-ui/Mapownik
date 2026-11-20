# msportal 19.8.0 — wersja na hosting współdzielony (bez VPS)

## Zmiany

- **Nowe API PHP `api/vps.php`** zastępuje usługę Python/FastAPI (`vps/msportal/app.py`). Te same trasy (`health`, `ready`, `bdot/classes`, `bdot/search`, `bdot/nearby`, `rcn/search`, `rcn/stats`, `site/screening`, `sources/status`, `quality`, `parcel/layers`, `parcel/analyze`), parametry, walidacja, limity i format odpowiedzi. Adres: `api/vps.php?route=…`; stare adresy `/vps/api/*` przekierowuje `.htaccess`.
- **`api/_vps_geo.php`** — geometria w czystym PHP zamiast shapely/pyproj: odwzorowanie EPSG:4326 ↔ EPSG:2180 (szereg Krügera 6. rzędu), odległości, przecięcia, dokładne pole części wspólnej wieloboków (twierdzenie Greena, obsługa otworów, wieloczęściowych i wspólnych krawędzi), punkt reprezentatywny, parser WKT.
- **`api/_vps_store.php`** — odczyt SQLite przez PDO tylko do odczytu; R*Tree albo tabele zastępcze `item_bbox` / `parcel_layer_bbox`, gdy SQLite hostingu nie ma modułu rtree.
- Limity kosztownych analiz (10/min/IP, jedna naraz) przez blokady plików w `cache/vps/` — działa przy wielu procesach PHP.
- Panel „Działka, ceny i otoczenie”: zapytania do `api/vps.php`, teksty „serwer” zamiast „VPS”, usunięty odnośnik do `/admin/`, czytelny komunikat o braku bazy / rozszerzenia `pdo_sqlite`.
- `data/msportal/` — miejsce na bazę z własnym `.htaccess` blokującym dostęp WWW.
- `verify-deployment.php` i `api/health.php` raportują `pdo_sqlite`, R*Tree, cURL i obecność bazy.
- Usunięto z katalogu WWW: `vps/` (backend Python, systemd, nginx, panel admin, kopie rclone), instrukcje instalacji VPS.
- Nowe narzędzie lokalne `narzedzia_importu/` (poza katalogiem WWW): dotychczasowe importery RCN/BDOT/warstw działek + polecenie `hosting przygotuj | status | usun | usun-warstwe`, skrypty `.cmd` dla Windows.

## Wyłączone względem 19.7.0

- Menedżer danych i panel `/admin/` (trasy `manager/*` → HTTP 501 z instrukcją), automatyczna synchronizacja źródeł (systemd), kopie offsite rclone. Zastępuje je lokalny import i wgranie pliku bazy przez FTP.

## Weryfikacja

- Porównanie z oryginalnym API Python 19.7.0 na tej samej bazie: 23 przypadki, identyczne wyniki (także bez R*Tree).
- Geometria vs shapely/pyproj: 200 punktów odwzorowania, 300 pól przecięcia, 300 odległości — zgodne.
- `tools/check_release.py`, `tools/bump_version.py --check`, `verify-deployment.php` — bez błędów.
- Testy przeglądarkowe `tests/ui_hosting.cjs` na serwerze PHP z bazą testową — 4/4.

## Poprawka po teście produkcyjnym (27.10.2026) — tylko `api/vps.php`

- Analiza działki: gmina, powiat, województwo i obręb pobierane z **ULDK (EGiB)** w tym samym zapytaniu co geometria (~1 s). Wcześniej z PRG OGC API, które odpowiada w ~11 s i przekraczało limit 5 s → „Dane niepotwierdzone”. Nazwa jednostki z PRG jest w polu `nazwaJednostki` (wcześniej nieobsługiwane).
- PRG pozostaje zapasem (gdy ULDK nie poda nazw): oba zapytania równolegle, limit 15 s.
