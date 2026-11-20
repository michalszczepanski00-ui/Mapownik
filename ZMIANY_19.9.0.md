# 19.9.0 — układ v2: mapa pierwsza, dok narzędzi Sprawdź · Szkic · Pomiar

Wdrożenie projektu układu v2 (płótno „Mapownik — audyt i nowy układ”, tablice 3–7 i 12–13).
Etap 1 (układ pływający) i etap 2 (dok trzech narzędzi) w całości, z etapu 3 kompaktowa lista
warstw. Telefon: tylko „Mierz” → „Pomiar” z pełnym zestawem narzędzi. Bez zmian w API, katalogu
warstw, formacie projektu i skrótach klawiszowych.

## Układ na komputerze (`App.js`, `AppBar.js` → `MapTopBar`, `assets/css/34-v2.css`)

- Nie ma już pasków na całą szerokość: pasek aplikacji (54 px), pasek trybu (40 px) i stopka
  (28 px) zniknęły — mapa zajmuje całe okno, a elementy pływają nad nią 8 px od krawędzi.
- **Lewy górny róg**: znak msportal (otwiera paletę poleceń, Ctrl+K) i wyszukiwarka miejsca
  i działki 440 × 40 px — zawsze widoczna, także przy otwartym panelu i narzędziu (`/`).
- **Prawy górny róg**: przyciąganie, cofnij/ponów, Projekt, Eksport, Ustawienia. Motyw
  i „Tylko mapa” są w Ustawieniach (wcześniej były też osobnymi przyciskami).
- **Szyna paneli** (Warstwy, Obiekty, Działka, Raport, Zdjęcia, Analizy, Eksport) pływa pod
  prawym górnym rogiem; karta panelu stoi obok niej, pod górnym paskiem. Domyślna szerokość
  karty 300 px (było 330; zapamiętana szerokość użytkownika zostaje).
- **Pasek stanu** zwinięty do małej plakietki w prawym dolnym rogu: skala, stan podkładu/źródła
  (przycisk otwiera panel stanu źródeł jak dotąd), atrybucja, stan zapisu. Ukryte: układ, X/Y
  kursora, zoom, liczba warstw, środek widoku i tryb. Współrzędne punktu kopiuje menu
  kontekstowe mapy (prawy przycisk: WGS84 / EPSG:2180), a karta Działka je pokazuje.
- **Podkłady**: przełącznik domyślnie zwinięty do jednej miniatury w lewym dolnym rogu
  (rozwinięcie zapamiętuje przeglądarka). Przyciski powiększenia pod szyną paneli.
- Czcionka **Inter** w paczce (`assets/fonts/inter-*.woff2`, licencja OFL już była
  w `assets/fonts/Inter-LICENSE-OFL.txt`) — ten sam wygląd na Windows, macOS, Linuksie
  i Androidzie. Ciemny motyw bez zmian.

## Dok narzędzi (`ToolDock.js` zamiast `FloatingTools.js`, `toolGroups.js`)

- Na dole mapy, na środku wolnej części (przy otwartej karcie przesuwa się w lewo).
- **Dolny wiersz**: Sprawdź · Szkic · Pomiar i pasek kontekstu aktywnego narzędzia
  (instrukcja, parametry, odczyt szkicu, Zakończ/Anuluj, zaznaczony obiekt z miarami
  i „Działania i właściwości”) — to, co dotąd było w pasku trybu pod paskiem aplikacji.
- **Kliknięcie Szkic albo Pomiar rozwija nad nim wiersz ze wszystkimi narzędziami grupy**,
  bez rozwijanych list:
  - Szkic: Punkt P, Linia L, Poligon G, Prostokąt R, Okrąg O, Działka D │ Tekst T,
    Strzałka S, Etykieta E │ **Przejazd C** │ Edytuj V,
  - Pomiar: Odległość M, Powierzchnia A, Bufor B │ **Teren**: Profil terenu F, Wysokości W.
- Grupa pamięta ostatnio użyte narzędzie (pierwsze otwarcie: Poligon / Odległość).
  Ponowne kliknięcie aktywnej grupy albo Esc wraca do „Sprawdź”.
- W wąskim oknie z otwartą kartą (≤ 1500 px) przyciski chowają oznaczenia klawiszy
  (zostają w podpowiedzi), a gdy i tak brakuje miejsca — wiersz narzędzi zawija się.
- **„Przesuń” nie ma już przycisku**: przeciąganie zawsze przesuwa mapę, a stanem spoczynkowym
  jest „Sprawdź” (jak na telefonie od 18.14). Po zakończeniu rysowania, po Esc i po spacji
  dok wraca do „Sprawdź”. Kliknięcie narysowanego obiektu nadal go zaznacza.
- Usunięta opcja „Pełna paleta narzędzi” w Ustawieniach — dok zawsze pokazuje pełną grupę.

## Warstwy — kompaktowo (`LayersPanel.js`, `34-v2.css`)

- Ta sama lista, grupy i kolejność. Wiersze 28 px, nazwa w jednym wierszu (pełna w podpowiedzi).
- Uchwyt przeciągania, „informacja” i „więcej” pojawiają się po najechaniu na wiersz albo
  przy fokusie klawiatury (wcześniej zajmowały ~75 px w każdym wierszu i łamały nazwy).

## Telefon (`MobileShell.js`)

- „Mierz” → **„Pomiar”**: odległość, powierzchnia, bufor, profil terenu, wysokości obszaru
  (wcześniej tylko odległość i powierzchnia). Reszta powłoki mobilnej bez zmian.

## Testy

- `diagnostyka.html`: test grup narzędzi przepisany na dok (3 grupy, Przejazd w Szkicu, Teren
  w Pomiarze). Poprawione trzy testy, które od 19.8.6 sprawdzały stare ustawienia źródeł
  (MPZP jako kafle 512 px, POG bezpośrednio z przeglądarki) — teraz sprawdzają ustawienia
  z 19.8.6 (MPZP jako jeden obraz z zapasem, POG przez proxy z łączeniem źródeł).
- Lokalnie (PHP 8 + Chromium): diagnostyka bez błędów poza „15.3 Ortofotomapa WMS fallback”
  (HTTP 404 z usługi GUGiK w środowisku testowym — test sieciowy, niezależny od tej wersji);
  `tools/check_release.py` bez błędów; `verify-deployment.php` → spójne.
- Sprawdzone przejścia: start → Sprawdź; G → rysowanie poligonu → zakończenie → Sprawdź
  z zaznaczonym obiektem w doku; M → Esc → Sprawdź; C → Przejazd w Szkicu; ponowny klik grupy
  zwija dok; wyszukanie działki 221303_1.0021.60/18 i identyfikacja; ekrany 1440 × 900,
  1366 × 768, 1280 × 720, jasny i ciemny motyw, telefon 390 × 844.

## Nie w tej wersji (etapy 3–4 projektu)

- Filtr statusu w wierszu POG/MPZP (8 warstw planistycznych → 2 z filtrem), kropka „dane
  w widoku” i zakładka „W widoku” — wymagają zmiany katalogu warstw.
- Karta miejsca po lewej pod wyszukiwarką (połączenie Działka + Raport + Analizy) — wynik
  „Sprawdź” nadal otwiera kartę „Działka” w prawym panelu.
