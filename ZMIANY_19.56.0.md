# msportal 19.56.0 — klasy gruntu i strefy w granicy działki, nazwa MSportal, etykiety, wyszukiwarka

## 1. Klasa gruntu: powierzchnie klas w granicy działki

**Wcześniej:**
- karta brała klasę z jednego punktu;
- gdy usługa nic nie podała, pisała „brak w usłudze”, choć na mapie były klasy.

**Teraz:** karta nakłada granicę działki na kontury klasyfikacyjne powiatu i liczy powierzchnię każdej klasy. Przykład dla działki 113/2 w Paprotni (gm. Zapolice):

| Klasa | Powierzchnia | Udział |
|---|---|---|
| Br-PsIV | 0,24 ha | 54% |
| Br-RV | 0,09 ha | 21% |
| Br-RIVb | 0,07 ha | 16% |
| RIVb | 0,04 ha | 9% |

- W wierszu karty: dwie największe klasy, np. „Br-PsIV 54%, Br-RV 21% …”.
- Pełna lista z hektarami po rozwinięciu wiersza.
- Użytki bez klasy (B, dr, W…) liczą się z warstwy użytków.

**Flaga „Klasy I–III — wymagana zgoda na wyłączenie”** pojawia się (jako ostrzeżenie), gdy w działce jest klasa I, II, IIIa, IIIb lub III gruntów rolnych (R, Ł, Ps). Dotyczy to także użytków zabudowanych, np. Br-RIIIa.

**Jak to działa:**
- **Brak wektorów:** żadna publiczna usługa nie podaje geometrii konturów, a zapytanie o punkt ma ukryte oznaczenia.
- **Własny styl:** usługa powiatu przyjmuje jednak własny styl (SLD). Nowy `api/parcel_shares.php` zamawia obraz zasięgu działki w kolorach według oznaczenia konturu.
- **Liczenie:** nakłada maskę granicy i liczy piksele (ok. 0,5 m na piksel, dłuższy bok 800 px).
- **Lista oznaczeń:** pochodzi z krajowej integracji. Nierozpoznane fragmenty dopasowuje słownik klas.
- **Pamięć podręczna:** wynik jest zapamiętywany na serwerze na 7 dni.
- **Dokładność:** powierzchnie są orientacyjne, rozstrzyga wypis z ewidencji.

**Ograniczenie — zależy od powiatu:**
- **Gdzie działa:** tylko tam, gdzie usługa powiatu przyjmuje własny styl, np. powiat zduńskowolski.
- **Gdzie nie:** **powiat starogardzki go ignoruje** i nie podaje oznaczeń konturów w żadnej formie (klasy są tylko napisami na obrazie mapy). Karta pisze tam „nie publikowana” i wyjaśnia dlaczego, zamiast „brak w usłudze”.
- **Pokrycie:** wspólne wejście GUGiK do usług powiatowych obejmuje ok. 1/4 powiatów (6 z 25 w próbce). Pozostałe portal znajduje w rejestrze usług powiatowych GUGiK.

**Poprawione w trakcie:** pierwsza wersja dawała w Janowie fałszywe „RII” i fałszywą flagę I–III. Usługa ignorowała styl, a jej zielone linie trafiały w kolory reguł. Teraz styl liczy się jako przyjęty tylko wtedy, gdy obraz jest wypełniony, a tolerancja koloru jest ostrzejsza.

## 2. Nazwa MSportal

**Zmienione:**
- przycisk palety („MSportal — polecenia (Ctrl+K)”);
- tytuł karty przeglądarki („MSportal — działki, plany i teren”);
- manifest aplikacji, ekran startowy i komunikaty błędów startu;
- teksty interfejsu („Obszar roboczy MSportalu”, „Projekt MSportalu”…);
- nagłówek raportu PDF i podpis eksportu mapy;
- tytuły warstw narzędzi (ceny, budowy, analiza działki), temat e-maila kontroli źródeł, szkic polityki prywatności.

**Bez zmian (zgodność):**
- rozszerzenie plików projektu `.mapownik` — stare projekty dalej się otwierają;
- klucze zapisu w przeglądarce (`mapownik:`);
- nazwy plików i nagłówki techniczne.

## 3. Plan ogólny: strefy, profile i data

Pod wierszem „Plan ogólny” karta pokazuje każdą strefę w granicy działki. Ta sama metoda pikselowa co dla klas, a usługa planów ogólnych zawsze przyjmuje styl.

Dla każdej strefy:
- oznaczenie, udział i powierzchnia (np. „102SJ · 89% · 0,39 ha”, „29SO · 11% · 0,05 ha”);
- nazwa strefy, np. „strefa wielofunkcyjna z zabudową mieszkaniową jednorodzinną”;
- **profil podstawowy i dodatkowy**, np. „tereny zabudowy mieszkaniowej jednorodzinnej, usług, komunikacji…”;
- data: „Obowiązuje od 28.11.2025”, a dla projektu „Projekt, wersja z …”.

Szczegóły:
- **Wiersz planu:** przy kilku strefach brzmi np. „uchwalony · 2 strefy”.
- **Skąd profile:** usługa planów uchwalonych ich nie podaje. Karta bierze je z usługi planów projektowanych, z tej samej strefy (to samo oznaczenie i ten sam plan). Gdy nie ma ich nigdzie: „Profil: usługa nie podaje — w uchwale planu”.
- **Data:** usługi podają datę wejścia w życie („obowiązuje od”), nie datę uchwały. Link do uchwały w dzienniku urzędowym jest w szczegółach planu.
- **Udziały:** do 1% dokładności. Fragmenty nierozpoznanych stref są dopytywane w ich pikselu.

## 4. Etykiety działek i klas gruntu

**Wspólny obraz:**
- Gdy włączone są „Działki ewidencyjne (KIEG)” i „Klasy gruntów”, mapa pobiera **jeden obraz** z serwera powiatu: działki, budynki, kontury, użytki i numery.
- Serwer rysuje wtedy wszystkie etykiety razem i **rozsuwa nachodzące napisy**: numery działek ustępują klasom.
- Osobny obraz klas jest w tym czasie wygaszony.
- Wcześniej były to dwa niezależne obrazy z różnych usług, więc numery i klasy nakładały się na siebie.

**Biała obwódka** pod rysunkiem obu warstw (numery, klasy, granice) — czytelne na zdjęciach i mapie.

**Próg skali:** numery działek pojawiają się od ok. 1:2500. W mniejszej skali działki rysują się bez numerów.

**Jedna etykieta na konturze — czego nie da się zrobić:** usługi publikują etykiety jako gotowy obraz. Przy gruntach rolnych powiat rysuje dwie linijki: użytek („R”) i kontur („RIVa”). Rozdzielić ich nie można bez danych wektorowych, których powiaty nie udostępniają.

**Serwer:** `api/wms.php` przyjmuje dla źródła `dzialki` trzy dodatkowe zestawy warstw z listy dozwolonych (`client_layers`).

## 5. Wyszukiwarka

- **Pole:** po wybraniu miejscowości pole rośnie, a chip pokazuje pełną nazwę („Starogard Gdański · gm. Starogard Gdański”).
- **Wyniki:** mieszczą się w dwóch liniach zamiast obcinać, a pełny tekst jest w podpowiedzi po najechaniu.
- **Województwo:** poprawione zdublowane „woj. województwo pomorskie” → „woj. pomorskie”.

## Testy

| Test | Wynik |
|---|---|
| Vitest | 98/98 (nowe: klasy I–III, profile, powierzchnie) |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 (test tytułu: „MSportal”) |
| Diagnostyka (lokalny Apache) | 199 testów, **191 OK** (jak w 19.55.0; nie przechodzą: GDOŚ 502 z tego środowiska, brak bazy RWDZ, znany test „Faza 4”) |
| Konsola przeglądarki | 0 błędów |

## Wgranie

Do **nowego** katalogu testowego, np. `/test31/`: cała zawartość `msportal-19.56.0-serwer.zip`, `index.html` i `.htaccess` na końcu.

- Nowy plik serwera: `api/parcel_shares.php` (wymaga rozszerzenia GD, jak eksport mapy).
- **Nie nadpisuj `/test22/` ani produkcji.**
