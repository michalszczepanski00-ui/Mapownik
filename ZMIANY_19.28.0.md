# msportal 19.28.0 — layout: poprawki i łatwiejsza obsługa (audyt layoutu 19.27)

Szerokości okien bez zmian: karta 260 px, panele 250 px, pasek 44 px. Miejsce na podpisy i większe
napisy pochodzi z usunięcia powtórzeń i krótszych instrukcji.

## Naprawione błędy
- **Wyszukiwarka**:
  - po wybraniu adresu lista wyników nie otwiera się ponownie i nie zasłania karty;
  - Enter naciśnięty, zanim przyjdą wyniki, wybiera pierwszy wynik;
  - Esc zamyka listę (wcześniej czyścił pole i otwierał pustą listę).
- **Treść mieści się w oknach**:
  - Eksport mapy i zakładka Analizy nie wystają już poza okno;
  - filtry Warstw nie nachodzą na siebie (licznik pod nazwą).
- **Karta Działka**:
  - dane w wierszach „etykieta … wartość”, bez ucinania;
  - werdykt (MPZP, plan ogólny, Natura 2000…) w jednym wierszu, a „Pokaż na mapie” jako ikona oka.
- **Raport**: identyfikator i powierzchnia bez łamania w złych miejscach; powierzchnia w m² i ha w jednym wierszu.
- **Miniatura NMT** w przełączniku podkładów się wczytuje.
- **Ekran startowy**: „Wczytywanie mapy…” zamiast pustej białej strony.
- **Klawiatura**: pierwszy Tab → „Przejdź do wyszukiwarki”.
- **Kontrast** uwagi pod wynikami karty.
- **Spójne nazwy**:
  - Rysuj / Mierz także na telefonie;
  - „Zdjęcia lotnicze”;
  - karta „Działka i narzędzia”;
  - poprawny opis pustej listy obiektów.

## Łatwiejsza obsługa
- **Każda funkcja w jednym miejscu**:
  - pasek po prawej ma tylko Warstwy, Obiekty i Zdjęcia;
  - Działka, Raport i Analizy są zakładkami karty;
  - Eksport jest u góry;
  - usunięto „Zdjęcia ▾” z podkładów.
- **Górny pasek**: przyciąganie, cofnij i ponów pojawiają się dopiero przy rysowaniu albo gdy w projekcie są obiekty.
- **Rysuj i Mierz**: podpisy pod ikonami (Punkt, Linia, Poligon… Odległość, Powierzchnia, Profil…).
- **Karta na starcie**: jeden krótki „jak zacząć” (wpisz adres / kliknij mapę / Warstwy) zamiast dwóch powtórzonych instrukcji.
- **Raport**:
  - przycisk „Utwórz raport działki”;
  - po wyniku formularz zwija się do „Działka … · 500 m · Zmień”;
  - bez komunikatu o stanie serwera, gdy wszystko działa.
- **Analizy**: działka z karty jest od razu celem („Sprawdź otoczenie działki 60/19”), bez osobnego „Użyj działki”.
- **Prostsze nazwy**:
  - „Sprawdź otoczenie” zamiast „screening”;
  - „Przyciąganie” zamiast „Snap”;
  - „Widoczne: 2 z 2” zamiast „2/2 wid.”.
- **Obiekty**: lista zaczyna się od filtra; import i eksport plików GIS jest pod listą.
- **„?” w górnym pasku**: „Jak zacząć” w 5 krokach; przy pierwszym wejściu otwiera się samo, raz.

## Czytelność i ekrany
- **Czcionki**: treść karty 13 px, opisy 12 px; filtry, podpisy i miniatury 10,5–11 px.
- **Przełącznik podkładów**: nazwa pod miniaturą, większa strzałka.
- **Panel Warstw**: przy pierwszym wejściu na ekranie węższym niż 1400 px jest zamknięty (więcej mapy).
- **Tablet w pionie (< 900 px)**: wynik w karcie chowa panel po prawej.
- **Telefon**:
  - w arkuszu Warstwy widać od razu 4 podkłady;
  - w arkuszu Projekt są wprost przyciski Zapisz, Otwórz i Udostępnij;
  - w „Więcej” nie ma już zdublowanych narzędzi.

## Wgranie (paczka zawiera tylko pliki przeglądarki)
1. Wgraj `aktualizuj-19.28.php` i otwórz `https://…/test22/aktualizuj-19.28.php`.
   Skrypt dopisze `app-19.28.0` w .htaccess (obok obecnej wersji, portal działa dalej) i zmieni
   numery wersji w api/*.php i monitor-zrodel.html. Reszta tych plików zostaje bez zmian.
2. Wgraj pozostałe pliki z paczki, nadpisując:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`;
   - `assets/css/36-latwa-obsluga.css`;
   - katalog `app-19.28.0/`.
3. Sprawdź portal (Ctrl+F5).
4. Otwórz `aktualizuj-19.28.php?sprzatanie=1`. Skrypt usunie stare katalogi app-*, starą regułę z
   .htaccess i siebie.
5. `verify-deployment.php` → `"deployment_consistent": true`.
