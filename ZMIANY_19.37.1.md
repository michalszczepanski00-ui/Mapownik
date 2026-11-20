# msportal 19.37.1 — raport PDF: mapy zawsze widoczne, nowy wygląd

## Naprawione
- **Puste (białe) mapy w raporcie PDF.**
  - **Przyczyna:** mapy do raportu rysuje przeglądarka w tle, a przycisk „Otwórz PDF” od razu otwierał nową kartę. Karta portalu przechodziła wtedy w tło, przeglądarka wstrzymywała w niej rysowanie i po 40 s do PDF trafiały puste płótna. To samo działo się przy przełączeniu karty w trakcie tworzenia raportu.
  - **Rysowanie w tle:** mapy rysują się teraz także w karcie w tle. Raport sam wywołuje rysowanie (`renderSync`), aż wczytają się wszystkie kafle.
  - **Przyciski:** raport powstaje w oknie, a po utworzeniu pojawiają się przyciski **Otwórz** i **Pobierz**.
- **Ortofotomapa w raporcie** pochodzi teraz z kafli WMTS GUGiK, które działają w każdej skali. Usługa WMS wysokiej rozdzielczości zwracała dla części kraju białe obrazy (np. Witankowo, gm. Wałcz).
- **Eksport PNG „jak na ekranie” z podkładem Ortofotomapa** był blokowany przez przeglądarkę („brak zgody serwera źródła”). Kafle ortofotomapy są teraz pobierane z CORS (GUGiK na to pozwala), więc eksport działa.
- **Konsola przeglądarki:** zniknęły z niej błędy `getRenderSource` po utworzeniu raportu.

## Nowy wygląd raportu
- **Nagłówek:**
  - barwny pas z numerem działki, obrębem, gminą, powiatem i województwem;
  - logo biura w białym polu, jeśli jest ustawione;
  - pod pasem szablon i parametry.
- **Kafle:** powierzchnia, gmina, obręb, identyfikator. Wartość dopasowuje rozmiar czcionki, więc długi identyfikator się nie ucina.
- **Mapy:** mapa działki z numerem obok mapy położenia (ok. 2,5 km wokół, działka zaznaczona pierścieniem). Mapy mają zaokrąglone ramki, podziałkę i strzałkę północy.
- **„W skrócie”:** karty ze statusem OK / INFO / UWAGA / BRAK, w dwóch kolumnach.
- **Sekcje:**
  - nagłówek ze znacznikiem w kolorze akcentu i podpisem źródła z prawej;
  - tabele w pasy, z nagłówkiem w kolorze akcentu;
  - wysokość i spadek terenu jako kafle i kolorowy pasek klas spadku.
- **Brak danych:** zamiast pustych kafli z „—” krótki komunikat, np. „Brak transakcji w promieniu 500 m w ostatnich 5 latach”. Sekcja „Odległości” znika, gdy na serwerze nie ma bazy BDOT10k.
- **Ostatnia strona:** źródła i zastrzeżenia trzymają się razem, więc nie ma już strony z samymi zastrzeżeniami.
- **Duże działki:** mniejszy margines wokół działki na mapie działki i mapie ewidencyjnej.

## Wgranie (aktualizacja_19.37.1.zip)
1. Wgraj `aktualizuj-19.37.php` (nowy) i otwórz go w przeglądarce.
2. Wgraj pozostałe pliki z paczki: `index.html`, `diagnostyka.html`, `VERSION.txt`, `assets/css/37-raport-pdf.css` i `app-19.37.1/`.

   Jeśli nie było jeszcze 19.37.0 albo wcześniejszych, wgraj też resztę paczki: `api/forest.php`, `assets/legend/`, `vendor/pdf/`, `konfiguracja/`, `api/permits.php`, `cron/`.
3. Ctrl+F5, kliknij działkę → **Raport PDF** → **Utwórz raport PDF** → **Otwórz** albo **Pobierz**.
4. Otwórz `aktualizuj-19.37.php?sprzatanie=1`, potem `verify-deployment.php`.
