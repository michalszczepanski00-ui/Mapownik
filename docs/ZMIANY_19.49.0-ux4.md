# 19.49.0-ux4 — odświeżony wygląd i prostsza obsługa (bez zmian w kodzie aplikacji)

Numer wersji aplikacji pozostaje 19.49.0 (kod w `assets/build/` jest bez zmian). Dodatek to dwa pliki
i dwie linie w `index.html`; `sw.js` dostał nowy znacznik wydania, więc przeglądarki z trybem offline pobiorą stronę od nowa.

## Nowe pliki
- `assets/css/95-odswiezenie.css` — styl (poza warstwami kaskady, więc wygrywa bez `!important`).
- `assets/js/ux.js` — mały skrypt: domyślne szerokości paneli i przycisk „Eksport" w szynie paneli.

## Zmiany w istniejących plikach
- `index.html` — dwie linie: `<script src="./assets/js/ux.js?v=…">` po `boot.js` i `<link rel="stylesheet" href="./assets/css/95-odswiezenie.css?v=…">` przed manifestem.
- `sw.js` — nowy znacznik wydania, oba pliki w pamięci trybu offline i odświeżane w tle.

## Co się zmienia dla użytkownika
- Jeden kolor stanu aktywnego (ciemny), zieleń tylko jako sygnał; dwa promienie zaokrągleń; krawędź zamiast rozmytego cienia.
- Zakładki (Działka / Raport / Analizy, filtry warstw) z podkreśleniem, nie jak przyciski.
- Karta działki: bez nagłówka „Działka i narzędzia" (przyciski zwijania w wierszu zakładek), domyślnie 320 px,
  linie zamiast kart w kartach, akcje w siatce 2×2, identyfikator i liczby pismem tabelarycznym.
- Panele po prawej: domyślnie 300 px, bez ucinanych podtytułów, filtry warstw bez liczników „0".
- Eksport w szynie paneli (pod separatorem) zamiast osobnego przycisku w górnym pasku.
- Wskazówka narzędzia (Rysuj, Mierz) tuż nad dolnym paskiem narzędzi, a nie na górze ekranu.
- Telefon: te same krawędzie i promienie; usunięta powtórzona etykieta nad polem szukania.
- Motyw ciemny dostosowany do tych samych zasad.

Szerokości domyślne dotyczą tylko osób, które nie ustawiły własnych (zapis w przeglądarce); kto już zmieniał szerokość, nic nie zauważy.

## Wycofanie
Usuń z `index.html` obie dodane linie (albo wgraj oryginalny `index.html` z 19.49.0). Pliki można zostawić.

## Czego ta paczka nie zmienia (wymaga źródeł aplikacji)
Połączenie menu pomocy i ustawień, paleta poleceń w polu wyszukiwania, przycisk „Więcej" w karcie działki,
jedna lista źródeł zamiast dwóch, zmiana nazw „Raport"/„Otoczenie", komponenty zamiast list systemowych.
Szczegóły i uzasadnienia: `docs/AUDYT_UI_19.49.0.md` w repozytorium.

## Dodane w ux2
- Karta działki: źródła „w toku" nie zajmują po wierszu — jedna linia „Sprawdzam kolejne źródła…"; akcje „Do projektu, Bufor, Wysokości, 3D" pod przyciskiem „Więcej ▾".
- Stan zerowy karty: jedna wskazówka („Kliknij działkę na mapie lub wpisz adres") zamiast trzech wierszy.
- Telefon: w arkuszu Warstwy bez „Szybkich warstw" (są nad mapą).
- Logo w zieleni interfejsu (filtr CSS, plik logo bez zmian).

## Dodane w ux3
- **Zadania** — osobna pozycja na początku prawej belki: Plan zagospodarowania, Działki i grunty, Ryzyka (powódź i ochrona przyrody),
  Uzbrojenie terenu, Energetyka i OZE oraz skróty do paneli Ceny i Budowy. Zadanie jednym kliknięciem włącza (drugie kliknięcie wyłącza)
  właściwy zestaw warstw; stan i liczba włączonych warstw są pokazane w panelu.
- **Usunięte:** archiwalne warstwy MIDAS (3) oraz ukryta „Mapa wysokości NMT” — z `data/source-profiles.json`, `monitor/catalog.json`
  i `api/source_monitor.php`. W aplikacji grupa „Archiwum” i pozycja „Pokaż warstwy archiwalne” są ukryte.
- **Zostaje bez zmian:** GDOŚ, PIG-MIDAS (bieżące) i podkład OSM.

## Dodane w ux4
- **Teren i zasięg** — nowa pozycja prawej belki (nad „Eksport"): Profil wysokości, Wysokości obszaru, Model 3D terenu, Zasięg (bufor),
  każdy z jednozdaniowym opisem. Z grupy „Mierz" znikły te cztery narzędzia (zostają: odległość i powierzchnia).
- **Telefon:** „Zadania" w arkuszu Warstwy (pięć zestawów warstw), komunikat o wyniku na dole ekranu.

## Znane ograniczenia ux4
- Licznik w nagłówku Warstw nadal pokazuje „/55” (katalog warstw jest wbudowany w kod aplikacji; poprawi się po zmianie w źródłach).
- Diagnostyka (`diagnostyka.html`) może zgłosić błędy testów dla usuniętych źródeł — to oczekiwane.
