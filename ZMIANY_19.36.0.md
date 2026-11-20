# msportal 19.36.0 — raport działki PDF z szablonami

Zawiera też 19.35.0 (eksport „jak na ekranie”, automatyczna aktualizacja pozwoleń), jeśli nie została wgrana.

## Raport działki PDF

### Gdzie
- Karta działki: przycisk **Raport PDF**. Na telefonie jest to piąta akcja w karcie.
- Panel **Eksport**: sekcja „Raport działki PDF”. Raport dotyczy działki z karty.

### Okno raportu
1. **Szablon.** Gotowe szablony to:
   - Karta działki;
   - Dla kupującego (domyślny);
   - Inwestycyjny;
   - Planistyczny;
   - Pełny.

   Zmiana zakresu przełącza szablon na „Własny”.
2. **Zakres.** 13 sekcji w grupach:
   - Działka: dane i „W skrócie”, mapa działki, mapa ewidencyjna;
   - Planowanie: plan ogólny, MPZP;
   - Otoczenie: ceny, budowy, odległości;
   - Teren i zagrożenia: wysokość i spadek, powódź;
   - Środowisko: ochrona przyrody, gleby;
   - Załączniki: źródła i zastrzeżenia.
3. **Ustawienia:**
   - promień (300 m, 500 m, 1 km);
   - okres (2, 3 lub 5 lat);
   - podkład mapy (Orto, Standard, Karto, Topo);
   - rodzaj cen (grunty, domy, mieszkania);
   - notatka „Dla kogo”.
4. **Nagłówek:** nazwa biura, kontakt i logo, zapamiętane w przeglądarce.
5. **Moje szablony:**
   - zapis bieżącego zakresu pod własną nazwą;
   - eksport do pliku JSON;
   - import z pliku;
   - usuwanie.
6. Z prawej strony okna: przybliżona liczba stron, spis treści i przyciski **Otwórz PDF** / **Pobierz PDF**. Tworzenie można przerwać.

### Zawartość PDF (A4)
- **Strona 1:**
  - nagłówek z logo i nazwą biura;
  - data, szablon i parametry;
  - duża mapa działki z podziałką i strzałką północy;
  - dane działki;
  - „W skrócie” z kolorowymi oznaczeniami.
- **Planowanie:**
  - mapa ewidencyjna (KIEG);
  - mapa stref planu ogólnego;
  - tabela stref: udział, wysokość, intensywność, zabudowa, PBC;
  - uchwała z linkiem;
  - MPZP.
- **Otoczenie:**
  - ceny: mediana, przedział, mapa transakcji w kolorach cen i tabela najbliższych transakcji;
  - budowy: mapa z kolorami typów, legenda i lista najważniejszych inwestycji;
  - odległości z BDOT10k, gdy jest baza.
- **Teren:**
  - wysokości i spadki z NMT 1 m (siatka do 196 punktów w działce);
  - udział klas spadku i ekspozycja.
- **Zagrożenia i środowisko:**
  - powódź ISOK (5 punktów działki);
  - Natura 2000 i inne formy ochrony (GDOŚ);
  - mapa glebowo-rolnicza i klasoużytki.
- **Źródła:** tabela źródeł z datą pobrania lub datą danych oraz zastrzeżenia.
- **Na każdej stronie:** nagłówek z identyfikatorem działki i stopka „Strona X z Y”.
- **Gdy źródło nie odpowie:** raport i tak powstaje, a w sekcji pojawia się opis brakujących danych.

### Technicznie
- **Biblioteka i czcionki:** jsPDF 4.2.1 (MIT) i czcionka Inter (OFL, polskie znaki) leżą w `vendor/pdf/`. Ładują się dopiero przy tworzeniu raportu.
- **Mapy:** powstają na osobnej, niewidocznej mapie, więc widok użytkownika się nie zmienia. Usługi WMS idą przez proxy portalu.
- **Pusty obraz KIEG:** gdy serwer powiatu dopiero się „rozgrzewa” i zwraca pusty obraz, jest pobierany ponownie (do 3 prób).
- **Serwer:** bez nowych plików PHP. Raport korzysta z istniejących usług `api/` (ULDK, analiza działki, RCN, RWDZ, identyfikacja, NMT).
- **Test lokalny:** pełny raport w 30–40 s, 6 stron, ok. 1,8 MB.

## Późniejsza zmiana i dostosowanie
- **Dla wszystkich użytkowników:** opcjonalny plik `konfiguracja/raport-pdf.json`. Opis jest w `konfiguracja/README.txt`, przykład w `raport-pdf.przyklad.json`.
  - nazwa biura, kontakt, logo, kolor, tytuł, stopka, zastrzeżenia;
  - zmiana nazw i opisów sekcji;
  - zmiana parametrów gotowych szablonów, ukrywanie ich (`"ukryty": true`) i dodawanie nowych;
  - domyślny szablon.

  Aktualizacje portalu nie nadpisują tego pliku. Błędny JSON nie psuje raportu: wtedy działają ustawienia domyślne.
- **Dla jednej osoby:** własne szablony i nagłówek zapisane w oknie. Eksport z okna ma ten sam format co plik serwera, więc szablon przygotowany w oknie można przenieść na serwer dla wszystkich.
- **W kodzie:** szablony domyślne i sekcje w `app-19.36.0/report/reportConfig.js`, zbieranie danych w `reportData.js`, układ stron w `reportPdf.js`, mapy w `reportMaps.js`.

## Wgranie (aktualizacja_19.36.0.zip)
1. Wgraj `aktualizuj-19.36.php` i od razu otwórz go w przeglądarce.
2. Wgraj pliki z paczki:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`, `assets/css/37-raport-pdf.css`;
   - katalog `vendor/pdf/` (razem z ukrytym `.htaccess`);
   - katalog `konfiguracja/` (tylko przykład i README);
   - katalog `app-19.36.0/`.

   Jeśli 19.35.0 nie było wgrane, wgraj też `api/permits.php` i `cron/`.
3. Ctrl+F5. Kliknij działkę i użyj **Raport PDF**.
4. Otwórz `aktualizuj-19.36.php?sprzatanie=1`, potem `verify-deployment.php` i sprawdź `"deployment_consistent": true`.
5. Opcjonalnie: skopiuj `konfiguracja/raport-pdf.przyklad.json` jako `raport-pdf.json` i wpisz dane biura.
