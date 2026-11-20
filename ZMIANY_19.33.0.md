# msportal 19.33.0 — intuicyjny układ

Zawiera też 19.32.1 (Karto nie zasłania warstw).

1. **Spokojny start.** Po otwarciu portalu widać tylko mapę, wyszukiwarkę i kartę działki.
   - „Jak zacząć” nie otwiera się samo — jest pod przyciskiem „?”.
   - Panel Warstw jest zamknięty i otwiera go ikona „Warstwy”. Układ zapisany w poprzedniej sesji wraca jak dotąd.
2. **Kliknięcie robi jedną rzecz.** Kliknięcie w punkt narzędzia (Ceny, Budowy) wybiera tylko ten punkt i nie
   uruchamia sprawdzania działki pod spodem. Okrąg promienia Budowy przepuszcza kliknięcia.
3. **Podpowiedź przy mapie.** Gdy działa narzędzie (pomiar, rysowanie, bufor, profil, wysokości…), u góry mapy
   pojawia się pasek z nazwą narzędzia, instrukcją i klawiszami (Enter / Backspace / Esc). Widać go także przy zwiniętej karcie.
4. **„W okolicy (500 m)” w karcie działki.**
   - Mediana cen gruntów z 3 lat i liczba transakcji; kliknięcie otwiera narzędzie Ceny.
   - Przycisk „Budowy i pozwolenia” otwiera to narzędzie dla tej działki.
   - Lokalizacja budów nie rusza przy każdym kliknięciu działki — dopiero po otwarciu narzędzia.
5. **Nagłówki paneli w jednej linii.** Podtytuł jest skracany, pełny tekst pojawia się w dymku.
   Prawa strona pokazuje jeden panel albo dwa w podziale — jak dotąd.
6. **Wspólna legenda.** Przycisk „Legenda (n)” przy dolnej krawędzi mapy, na prawo od karty. W jednym miejscu są
   legendy warstw WMS (MPZP, POG, uzbrojenie…), nachylenia terenu i narzędzi Ceny i Budowy.
   Przycisk pojawia się tylko wtedy, gdy jest co pokazać.
7. **Kadr działki z sąsiedztwem.** Po wyszukaniu działka zajmuje ok. 1/3 widoku, najbliżej ok. 1:900.
   Widać sąsiednie działki i ulicę. Wcześniej mała działka wypełniała cały ekran (1:620).
8. **Spójne nazwy.**
   - „Sprawdź działkę” (narzędzie i menu pod prawym przyciskiem).
   - „Budowy i pozwolenia” (belka, tytuł okna, menu na telefonie).
   - Długie nazwy na liście Budowy są skracane do 2 linii; pełna nazwa jest w dymku i w szczegółach.

Diagnostyka: nowy test „19.33.0 — intuicyjny układ”.

## Wgranie (aktualizacja_19.33.0.zip)
1. Wgraj `aktualizuj-19.33.php` i **od razu** otwórz go w przeglądarce (krok 1).
2. Wgraj `index.html`, `diagnostyka.html`, `VERSION.txt`, `assets/css/36-latwa-obsluga.css` i katalog `app-19.33.0/`.
   Nie usuwaj ręcznie starego katalogu `app-*`.
3. Odśwież portal i sprawdź.
4. Otwórz `aktualizuj-19.33.php?sprzatanie=1` (krok 2), potem `verify-deployment.php`.
