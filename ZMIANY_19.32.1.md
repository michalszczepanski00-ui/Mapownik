# msportal 19.32.1 — podkład Kartograficzny nie zasłania warstw

Od skali pracy z działkami (ok. 1:10 000 i bliżej) Karto ustępuje warstwom portalu (granice działek, MPZP, POG,
uzbrojenie). W małych skalach rzeźba jest tak samo wyraźna jak w 19.31.1.

## Zmiany (tylko podkład „Karto”)
- **Siatka współrzędnych** tylko do ok. 1:20 000. Bliżej jej niebieskie linie myliły się z granicami działek.
- **Rzeźba (barwy i cieniowanie)** od ok. 1:10 000 przygaszona do 40%. W małych skalach bez zmian.
- **Warstwice** od ok. 1:8 000 półprzezroczyste i cieńsze.
- **Budynki** jaśniejsze i coraz bardziej przejrzyste przy zbliżeniu.
- **Ścieżki** jaśniejsze.
- **Bez ikon i nazw punktów usług** (sklepy, lokale) i strzałek jednokierunkowych. Napisy podkładu rysują się nad
  warstwami portalu, a na mapie kartograficznej nie są potrzebne. Nazwy ulic, miejscowości i wód zostają.

Wydajność i pamięć bez zmian. Obie warstwy rzeźby korzystają z jednego źródła, więc obraz jest liczony raz.

## Wgranie (aktualizacja_19.32.1.zip)
1. Wgraj `aktualizuj-19.32.1.php` i otwórz go w przeglądarce.
2. Wgraj `index.html`, `diagnostyka.html`, `VERSION.txt` i katalog `app-19.32.1/`.
3. Odśwież portal. Sprawdź podkład Karto z włączonymi działkami ewidencyjnymi.
4. Otwórz `aktualizuj-19.32.1.php?sprzatanie=1`, potem `verify-deployment.php`.
