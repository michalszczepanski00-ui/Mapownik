# msportal 19.45.0 — porównanie działek, diagnostyka bez starych bibliotek

## Porównanie działek projektu
Nowy panel zestawia w jednej tabeli wszystkie działki dodane do projektu.

**Jak otworzyć:**
- panel **Obiekty** → przycisk **„Porównaj działki (N)”** (widoczny od dwóch działek);
- albo paleta poleceń (Ctrl+K) → „Porównaj działki projektu”.

**Kolumny:**

| Kolumna | Skąd |
|---|---|
| Powierzchnia | geometria działki z ewidencji |
| MPZP | nazwa planu z Rejestru Urbanistycznego, a gdy go tam nie ma — z mapy planów gminy |
| Przeznaczenie (MPZP) | symbol i opis terenu z mapy planów (np. „10C ZP(U) (zieleń urządzona)”) |
| Plan ogólny | strefy planu ogólnego z udziałem w powierzchni |
| Natura 2000, inne formy ochrony | GDOŚ, w trzech punktach działki |
| Powódź (ISOK) | scenariusze zagrożenia z map zagrożenia powodziowego |
| Klasy użytków (EGiB) | klasoużytki, jeśli powiat je udostępnia |
| Grunty — mediana RCN | mediana ceny za m² gruntu w promieniu 1 km z 5 lat |
| Różnica wysokości | najniższy i najwyższy punkt działki (NMT 1 m) |

**Działanie:**
- Dane pobierają się po dwie działki naraz, ok. 5–10 s na działkę.
- Pozostają w pamięci do zmiany działki albo przycisku **„Odśwież”**, więc ponowne otwarcie panelu nie pyta usług drugi raz.
- **Kliknięcie wiersza** pokazuje działkę na mapie.
- **„nie sprawdzono”** oznacza, że usługa nie odpowiedziała. To co innego niż „poza” albo „brak planu”.
- Komórki z ograniczeniem (Natura 2000, ochrona, powódź, grunty klas I–III) są wyróżnione.

**CSV:** plik z liczbami w osobnych kolumnach (cena, przedział, liczba transakcji, wysokości). Średnik jako separator i kodowanie UTF-8 — otwiera się w Excelu z polskimi znakami.

To wstępne porównanie danych publicznych. Nie zastępuje wypisu z planu ani sprawdzenia w urzędzie (informacja w stopce panelu).

## Diagnostyka bez kodu źródłowego i starych bibliotek na serwerze
- **Budowanie:** `diagnostyka.html` jest budowana przez Vite razem z portalem i testuje te same biblioteki (React, OpenLayers, zod…), z których korzystają użytkownicy.
- **Zakres testów:** 198 testów, wyniki jak w 19.44.0.
- **Z paczki serwerowej znikają:**
  - katalog `app-<wersja>/` (kod źródłowy, ok. 2,8 MB);
  - `vendor/static/`, `vendor/ol-esm-2/`, `vendor/opt/`, `vendor/geometry/` (ok. 6 MB starych kopii bibliotek);
  - `setup-vendors.php`, `api/vendor_status.php`, `api/_vendor_builder.php`;
  - arkusze `assets/css/` (poza `monitor.css`).
- **Teksty źródeł:** testy, które sprawdzają treść modułów, dostają ją z pliku dołączonego w budowaniu. Ten plik wczytuje tylko diagnostyka — portal ani tryb offline go nie pobierają.
- **`verify-deployment.php`:** nowe pole `leftover_files` — lista pozostałości po starszych wydaniach do usunięcia. Nie wpływa na `deployment_consistent`, bo serwer i tak zwraca dla nich 410/404.
- **Kontrola wdrożenia:** `check_deploy.mjs` ostrzega o pozostałościach, a workflow „Wdrożenie” usuwa je sam.

## Poprawka: „Czyj las” przy częściowej odpowiedzi BDL
Gdy Bank Danych o Lasach odpowiedział tylko na jedno z dwóch zapytań (lasy państwowe / pozostałe) i nie znalazł lasu, serwer zapisywał „brak lasu” w pamięci podręcznej na 7 dni. Teraz taki wynik nie jest zapamiętywany, a karta pokazuje „spróbuj ponownie”. Wykryte w diagnostyce 19.45.0.

## Testy
- **Vitest:** 65 testów (nowe: porównanie działek — analiza planu, mapa planów, punkty, klasy, ceny, wysokości, CSV).
- **Playwright:** 13 scenariuszy (nowe: porównanie działek z palety poleceń; diagnostyka bez dawnych bibliotek).
- **Diagnostyka na lokalnym Apache:** 198 testów, 186 OK. Pozostałe to usługi zewnętrzne niedostępne z tego środowiska (GDOŚ 403, MIDAS/PIG 502), brak bazy RWDZ i znany test „Faza 4” — tak samo jak w 19.44.0.
- **Kontrola wydania, TypeScript, kontrola wdrożenia:** bez błędów.

## Wgranie (FTP, pełna paczka)
1. **Kopie:** kopia projektu `.mapownik` i obecnych plików portalu.
2. **Wgranie:** cała zawartość `msportal-19.45.0-serwer.zip`, „nadpisz zawsze”; `index.html` i `.htaccess` na końcu.
3. **Usuń pozostałości** (lista w `README_WGRAJ_NA_SERWER.txt`, pkt 3):
   - wszystkie `app-*`;
   - `vendor/static/`, `vendor/ol-esm-2/`, `vendor/opt/`, `vendor/geometry/`;
   - `setup-vendors.php`;
   - `api/vendor_status.php`, `api/_vendor_builder.php`;
   - pliki `assets/css/*` poza `monitor.css`.

   **Nie usuwaj:** `data/`, `cache/`, `vendor/pdf/`.
4. **Kontrola:** `verify-deployment.php` → `"deployment_consistent": true`, `"leftover_files": []`; potem `node tools/check_deploy.mjs https://adres` albo `README_KONTROLA_WDROZENIA.md`.
