# msportal — audyt funkcjonalny (19.42.0 → 19.43.0)

**Data:** 09.11.2026.
**Środowisko:**
- Apache 2.4.58 z `.htaccess` portalu, PHP 8.3;
- Chromium (Playwright), komputer 1440×900 i telefon 390×844;
- prawdziwe usługi GUGiK (ULDK, KIEG, NMT, RCN, integracje planów), BDL, ISOK, Nominatim i OpenStreetMap;
- testowa baza pozwoleń RWDZ (3 wpisy);
- bez lokalnej bazy BDOT10k.

GDOŚ (403 Incapsula) i PIG/MIDAS (502) są z tego środowiska niedostępne, podobnie jak w poprzednich audytach.

**Metoda:**
- scenariusze wykonywane przez interfejs, tak jak robi to użytkownik;
- wyniki liczbowe porównane z niezależnym przeliczeniem;
- treść raportów PDF czytana z plików;
- regresja na 19.43.0 tymi samymi scenariuszami.

## 1. Podsumowanie

- **Znaleziono jeden błąd krytyczny (A1) — naprawiony.** Raport PDF mógł stwierdzić jako fakt, że działka jest objęta MPZP, a jako „opis planu” podawał komunikat błędu serwera gminy. Dotyczyło to gmin, których serwery w krajowej integracji odrzucają zapytanie o warstwy (np. Trąbki Wielkie).
- **Pozostałe znaleziska (A2–A4, A6) są naprawione.** Dwa podejrzenia z audytu okazały się błędami moich testów i są wycofane (A5, A7).
- **Wszystkie pozostałe funkcje działają poprawnie, a liczby się zgadzają.**

## 2. Wyniki scenariuszy

| Obszar | Co sprawdzone | Wynik |
|---|---|---|
| Wyszukiwarka | miejscowość, adres z numerem, identyfikator działki, brak wyników | działa. „Marszałkowska 10, Warszawa” → tylko ulica (ograniczenie danych OSM, znane) |
| Wyszukiwarka (19.43.0) | współrzędne WGS84, stopnie-minuty-sekundy, PUWG 1992, link Google Maps | działa, wybór otwiera kartę miejsca |
| Karta działki | ULDK, powierzchnia, klasa EGiB, BDL, ceny w okolicy, pozwolenia | działa. 3,5165 ha (35 165 m²), ceny: mediana 38 zł/m² z 2 transakcji |
| Karta działki — MPZP | gmina nie publikuje danych w integracji GUGiK | 19.42.0: „błąd, ponów”; **19.43.0: „brak w integracji” z podpowiedzią** |
| Rysowanie | poligon, linia, punkt, prostokąt, pomiar; cofnij i ponów | działa. Prostokąt 200×100 px = dokładnie ½ pola kwadratu 200×200 px; pomiar 225 m = geometria 225,0 m; cofnij/ponów 4→3→4 |
| Projekt | zapis `.mapownik`, link udostępniania (druga karta), eksport GeoJSON | działa. Odbiorca linku dostaje 1 obiekt; GeoJSON w EPSG:4326 ze współrzędnymi w Polsce |
| Eksport | PNG jak na ekranie | 2880×1888 px, 1,1 MB, w 1 s |
| Raport PDF | szablon „Karta działki” (3 str.) i „Pełny” (9 str.), generowane jednocześnie | **19.42.0:** MPZP „FAKT” z treścią błędu (A1), luka „Trwa analiza” w drugim raporcie (A2). **19.43.0:** MPZP „brak w rejestrze — DO WERYFIKACJI”, oba raporty kompletne (20 s i 60 s) |
| Teren | Teren 3D, analiza wysokości, profil | 3D otwiera się w 4 s, po zamknięciu nie zostaje płótno. Wysokości: 74,7–86,4 m, deniwelacja 11,7 m, spadek 4,93% (spójne z raportem i 3D). Profil: 608 m, 72,5–93,0 m, spadek śr. 3,37% = 20,5/608 |
| Panele | Zdjęcia lotnicze, Ceny transakcyjne, Budowy i pozwolenia, Warstwy, Obiekty | działają. Pozwolenia: 3 inwestycje, inwestor-osoba ukryty |
| Podkłady | 7 podkładów | wszystkie przełączają się. Usługa NMT GUGiK okresowo nie odpowiada — portal wraca wtedy do poprzedniego podkładu |
| Awaria API | wszystkie `api/*` zwracają 503 | komunikaty zamiast awarii, 0 błędów JS, aplikacja działa dalej |
| Telefon | karta działki 390×844 | działa, bez przewijania poziomego |
| Tryb offline (19.43.0) | brak sieci po pierwszym wejściu | aplikacja się otwiera, komunikat o braku połączenia znika po powrocie sieci |
| Dostępność | axe-core, WCAG 2.1 A/AA: start, karta działki, okno raportu | 19.42.0: 2 naruszenia (A6); **19.43.0: 0** |
| Długa sesja | 18 cykli: wyszukiwanie, panele, podkłady, rysowanie i usuwanie | brak wycieku: żywe elementy strony stałe (432), sterta 16,6–18,4 MB |
| Wbudowana diagnostyka | 198 testów | 19.43.0: 189 OK; 6 błędów to usługi zewnętrzne niedostępne z tego środowiska (GDOŚ, PIG/MIDAS) oraz jeden znany test układu. Brak nowych błędów względem 19.42.0 |
| Szybkość startu | 4G (150 ms, 1,6 Mb/s), pierwsze i powtórne wejście | 4,7 s / 0,4 s — bez zmian względem 19.42.0 (19.41.4: 12,2 s) |

## 3. Znaleziska

| # | Waga | Opis | Stan |
|---|---|---|---|
| A1 | **krytyczna** | Odpowiedź-błąd serwera gminy (`ServiceException LayerNotDefined`) była brana za opis planu: raport „MPZP — FAKT”, a w PDF tekst „msWMSLoadGetMapParams(): WMS server error…” jako opis. | naprawione (`api/_vps_ru.php`), test `tools/test_audyt_19.43.0.php` |
| A2 | średnia | Jedna analiza działki naraz na cały serwer: drugi raport dostawał „Część danych działki niedostępna: Trwa analiza”. | naprawione: 2 analizy naraz, serwer czeka do 6 s, raport ponawia po 429 |
| A3 | średnia | Karta działki: „nie udało się odczytać / Ponów” tam, gdzie gmina nie publikuje danych w integracji GUGiK. | naprawione: stan „brak w integracji”, bez ponawiania, najpierw sprawdzany rysunek planu |
| A4 | niska | Raport dla klienta zawierał instrukcję administratora („Wgraj przygotowany magazyn do data/bdot_buildings/”). | naprawione: instrukcja trafia do dziennika serwera |
| A5 | — | Podejrzenie: brak komunikatu „brak wyników” w wyszukiwarce. | wycofane: komunikat jest („Brak pasujących miejscowości.”), mój test szukał innych słów |
| A6 | niska | WCAG 4.1.2: `aria-expanded` bez roli `combobox` w polu wyszukiwania; etykieta bez roli na kontenerze mapy. | naprawione |
| A7 | — | Podejrzenie wycieku pamięci (rosnący licznik węzłów). | wycofane: żywe elementy stałe, licznik obejmował węzły czekające na odśmiecanie |

## 4. Uwagi bez zmian w kodzie (do decyzji albo poza portalem)

- **Rysowanie:** pasek stylu zaznaczonego obiektu („Działka 210/2 · Kolor · Linia…”) pojawia się na środku mapy i zasłania część rysunku. Do rozważenia przy przeglądzie układu.
- **Wysokości:** przycisk „Wysokości” w karcie działki dodaje działkę do projektu i otwiera panel, w którym trzeba jeszcze kliknąć „Analizuj”. Jeden krok więcej, niż sugeruje nazwa przycisku.
- **Wyszukiwarka:** zapytanie „Kórnik 1000” (numer działki bez wybranej miejscowości) daje „Brak pasujących miejscowości”, a numer działki wpisuje się po wybraniu miejscowości. Do rozważenia podpowiedź.
- **Eksport ortofotomapy przez serwer:** daje biały obraz w obu wersjach w tym środowisku. Do sprawdzenia na produkcji.
- **Usługi zewnętrzne** (GDOŚ, PIG/MIDAS, cieniowanie NMT) okresowo nie odpowiadają. Portal obsługuje to poprawnie, ale wyniki „nie sprawdzono” są wtedy częste.
