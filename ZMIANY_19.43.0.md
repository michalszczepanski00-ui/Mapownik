# msportal 19.43.0 — poprawki z audytu funkcjonalnego, wyszukiwanie po współrzędnych, tryb offline

Opis audytu i wyniki testów: `RAPORT_AUDYTU_19.43.0.md`.

## Poprawione błędy

| # | Waga | Błąd | Poprawka |
|---|---|---|---|
| A1 | **krytyczna** | **Raport PDF stwierdzał „MPZP — FAKT” bez planu.** Gdy serwer gminy w krajowej integracji GUGiK odpowiadał błędem (`LayerNotDefined`), analiza brała treść błędu za opis planu. W PDF pojawiało się „Opis: msWMSLoadGetMapParams(): WMS server error…”. | Odpowiedzi-błędy serwerów gmin są odrzucane (`api/_vps_ru.php`). Bez potwierdzenia wynik jest „nieznany”, a nie „plan” ani „brak planu”. Test: `tools/test_audyt_19.43.0.php`. |
| A2 | średnia | **Jedna analiza naraz na cały serwer.** Drugi użytkownik generujący raport dostawał w PDF lukę „Część danych działki niedostępna: Trwa analiza. Ponów za chwilę.” | Dwie analizy naraz, serwer czeka do 6 s na wolne miejsce (`api/vps.php`). Raport ponawia zapytanie po krótkim „zajęte” (429) zamiast wpisywać błąd. |
| A3 | średnia | **Mylący komunikat MPZP w karcie działki.** Gdy gmina nie publikuje danych w integracji krajowej, karta pokazywała błąd usługi i proponowała „Ponów”, co nic nie zmieniało. | Osobny stan „brak w integracji” z podpowiedzią (rysunek planu albo BIP gminy). Taki wynik nie wlicza się do „źródła nie odpowiadają” i nie jest ponawiany. Najpierw sprawdzany jest jeszcze rysunek planu. |
| A4 | niska | **Instrukcja dla administratora w raporcie dla klienta:** „Wgraj przygotowany magazyn do data/bdot_buildings/”. | Klient widzi „Lokalna baza budynków BDOT10k nie jest dostępna na tym serwerze”. Instrukcja trafia do dziennika serwera. |
| A6 | niska | **Dostępność (WCAG 4.1.2):** pole wyszukiwania miało `aria-expanded` bez roli `combobox`, a kontener mapy etykietę bez roli. | `role="combobox"` z `aria-controls` dla listy wyników, `role="application"` dla mapy. Skaner axe-core: 0 naruszeń WCAG 2.1 AA. |

## Nowe funkcje

- **Wyszukiwanie po współrzędnych** (rekomendacja R1 z audytu 19.31.0). Wynik pojawia się na liście natychmiast, bez zapytań do sieci. Wybór przenosi mapę i otwiera kartę działki w tym miejscu. Rozpoznawane formaty:
  - WGS84 w dowolnej kolejności, z kropką albo przecinkiem: `52.2297, 21.0122`, `52,2297 21,0122`;
  - stopnie, minuty, sekundy: `52°13'47"N 21°00'44"E`;
  - link Google Maps;
  - PUWG 1992: obie konwencje kolejności osi, opisane na liście.
- **Tryb offline (PWA).** Bez internetu aplikacja się otwiera, a projekt można przeglądać, edytować i zapisać do pliku. Pojawia się komunikat o braku połączenia. Mapy i dane z usług wymagają sieci. Portal można zainstalować na telefonie jako aplikację (manifest i ikony).
  - Gdy jest sieć, nowa wersja zawsze ładuje się z serwera.
  - **Awaryjne wyłączenie:** skopiuj `assets/sw-wylacz.js` na serwer jako `sw.js` w katalogu portalu.
- **Pamięć zapytań do API** (TanStack Query, `@tanstack/query-core` 5.104.5, `core/apiCache.js`):
  - te same dane w ciągu 5 minut (ponowne kliknięcie działki, raport po karcie działki) nie są pobierane drugi raz;
  - równoczesne identyczne zapytania idą do serwera jako jedno;
  - przerwanie zapytania zwalnia połączenie;
  - błędy nie są zapamiętywane.
- **Zgłaszanie błędów z przeglądarek** (audyt S3). Błędy JavaScript trafiają do `api/client_errors.php`, z dobowymi plikami w `cache/client-errors/` przechowywanymi przez 30 dni.
  - Podsumowanie dla administratora: `php tools/client_errors_report.php 7`.
  - **Limity:** najwyżej 10 zgłoszeń na kartę, 30 na godzinę na adres, 5 MB na dobę.
  - **Bez danych osobowych:** bez adresu IP, parametrów adresu strony i treści projektu.
- **Ochrona projektu przed utratą** (audyt S5):
  - przy pierwszej zmianie portal prosi przeglądarkę o trwałe przechowywanie danych;
  - po 25 zmianach bez kopii pliku (nie częściej niż co 2 h) przypomina o zapisaniu `.mapownik` przyciskiem „Zapisz kopię”.

## Porządek w CSS
- Usunięto 109 nieużywanych reguł z 2427, w tym pozostałości dawnych układów: zakładki karty, gotowe zestawy warstw, panel menedżera danych VPS.
- **Wynik:** arkusz w paczce zmalał z 251 do 239 kB.
- **Wygląd bez zmian:** porównanie 18 zrzutów ekranu (komputer i telefon) piksel po pikselu, z odtworzonymi odpowiedziami API.
- **Narzędzie** `tools/css_unused.mjs` (raport albo `--apply`) chroni nazwy klas składane dynamicznie.

## Testy
- **Vitest:** 56 testów (nowe: współrzędne, pamięć zapytań, przypomnienie o kopii).
- **Playwright:** 8 scenariuszy (nowe: współrzędne, offline, zgłaszanie błędów).
- **PHP:** `test_audyt_19.43.0.php` (MPZP), uruchamiany przez `tools/check_release.py`.

## Wgranie (FTP, pełna paczka — jak 19.42.0)
1. **Kopie:** kopia projektu `.mapownik` i obecnych plików portalu.
2. **Wgranie:** wgraj całą zawartość `msportal-19.43.0-serwer.zip` z opcją „nadpisz zawsze”. `index.html` i `.htaccess` wgraj na końcu.
3. **Stary katalog:** usuń stary katalog `app-19.42.0/`. Nie usuwaj `data/`, `cache/` ani starszych plików w `assets/build/`.
4. **Kontrola:** `verify-deployment.php` → `"deployment_consistent": true`. Potem Ctrl+F5.
5. **Tryb offline działa tylko na HTTPS.** Jeśli portal działa pod `http://`, service worker nie zostanie zarejestrowany, a reszta działa normalnie.
