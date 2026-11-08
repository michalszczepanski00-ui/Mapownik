# msportal 19.37.2 — fałszywe ostrzeżenia przy warstwach planowania

## Naprawione
- **Trójkąt ostrzeżenia (⚠) przy warstwach POG, MPZP i Strefy POG** w panelu Warstwy, choć warstwy działały. Trójkąt znaczy „nie udało się sprawdzić danych w widoku (źródło nie odpowiedziało)”, ale pojawiał się z trzech innych powodów:
  1. **Każdy widok bez planu dostawał trójkąt.** Portal czekał na nagłówek „kompletności”, którego serwer (`api/wms.php`) nigdy nie wysyła. Błąd był już w wersji 19.30.1. Teraz brak danych w próbce to pusta kropka („nie wykryto obiektów — nie potwierdza braku”), a trójkąt zostaje tylko dla prawdziwego braku odpowiedzi: obrazu zastępczego, nieaktualnej kopii albo łączenia źródeł, w którym część nie odpowiedziała.
  2. **Próbka miała zbyt drobną skalę.** Była obrazem 384 px całego widoku, czyli w skali kilka razy drobniejszej niż mapa. Strefy POG z GUGiK rysują się tylko do ok. 1:100 000, więc próbka była pusta, choć na mapie strefy były. Teraz próbka ma do 1024 px. Na produkcji przy widoku Starogardu: 384 px dawało 0 pikseli danych, 1024 px — 362 tys.
  3. **Przesunięcie mapy dawało trójkąt.** Gdy zapytanie z poprzedniego kadru jeszcze trwało, nowy kadr od razu dostawał „nie udało się sprawdzić”. Teraz pokazuje „sprawdzanie…” i czeka na wynik.
- **Pliki serwera** zostają bez zmian. Zmiana dotyczy tylko `app-19.37.2/` (`layerCoverage.js`, `coverageCache.js`).

## Wgranie (aktualizacja_19.37.2.zip)
1. Wgraj `aktualizuj-19.37.2.php` (każda wersja ma teraz własną nazwę skryptu) i **od razu** otwórz go w przeglądarce, **przed** wgraniem `index.html`. Inaczej portal przez chwilę nie wystartuje.
2. Wgraj `index.html`, `diagnostyka.html`, `VERSION.txt` i `app-19.37.2/`. Jeśli wcześniejsze wersje nie były wgrane, wgraj resztę paczki.
3. Ctrl+Shift+R.
4. Otwórz `aktualizuj-19.37.2.php?sprzatanie=1`, potem `verify-deployment.php`.
