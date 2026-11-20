# msportal 19.34.0 — ostatnie działki i „W okolicy” na telefonie

Zawiera też 19.33.0 (intuicyjny układ) i 19.32.1 (Karto nie zasłania warstw), które nie są jeszcze wgrane.

- **Ostatnio sprawdzane działki.**
  - Kliknięcie w puste pole wyszukiwarki pokazuje do 6 ostatnio sprawdzanych działek: numer, gmina, obręb, identyfikator.
  - Wybór otwiera kartę działki (granica pobierana z ULDK na nowo).
  - Lista jest zapamiętana w tej przeglądarce; przycisk „Wyczyść” ją usuwa.
  - Działa na komputerze i na telefonie.
- **„W okolicy (500 m)” na telefonie.** Na telefonie ta sekcja jest od razu pod statusami w karcie działki
  (mediana cen gruntów, przycisk „Budowy i pozwolenia”).
- **Ceny z „W okolicy” zgodne z kartą.** Narzędzie Ceny liczy transakcje w widoku mapy, więc otwarte z „W okolicy”
  najpierw ustawia widok na ok. 500 m wokół działki. Wcześniej przy dużym zbliżeniu pokazywało 1–2 transakcje.

## Wgranie (aktualizacja_19.34.0.zip)
1. Wgraj `aktualizuj-19.34.php` i **od razu** otwórz go w przeglądarce.
2. Wgraj `index.html`, `diagnostyka.html`, `VERSION.txt`, `assets/css/36-latwa-obsluga.css` i katalog `app-19.34.0/`.
   Nie usuwaj ręcznie starych katalogów `app-*`.
3. Odśwież portal i sprawdź.
4. Otwórz `aktualizuj-19.34.php?sprzatanie=1`, potem `verify-deployment.php` → `"deployment_consistent": true`.
   Krok 2 usunie też katalogi `app-19.32.0` i `app-19.32.1`, które są teraz na serwerze.
