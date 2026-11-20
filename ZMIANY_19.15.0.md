# 19.15.0 — poprawki stylu doku i zwarty obiekt w panelu Obiekty

## Sprawdzenie wdrożenia 19.14.0 (29.10.2026)

- `verify-deployment.php`: spójne, wersja 19.14.0, na serwerze tylko `app-19.14.0`.
- 4 pełne wczytania portalu: wszystkie arkusze CSS, skrypty i czcionki z poprawnym typem
  i bez błędów — problem z 28.10 (CSS jako text/plain) się nie powtórzył.
- „Nieostylowane” miejsca to były błędy reguł 19.9–19.14, nie wczytywania — poprawione niżej.

## Dolny dok — źle wyglądające elementy

- Zaznaczony obiekt w doku: cała strefa była pisana krojem o stałej szerokości, a przycisk
  „Działania i właściwości” był jasny i ucięty (selektor `[class*="measure"]` łapał klasę
  `has-measures`). Teraz: etykiety zwykłym krojem, wartości cyframi o stałej szerokości,
  przycisk w stylu doku.
- „Cofnij punkt”, „Zakończ rysowanie”, „Anuluj” w trakcie szkicu: były jasnymi przyciskami
  z innego zestawu (reguły celowały w klasy `.button`, a aplikacja używa `.ui-button`).
  Teraz ciemne, jak reszta doku; nieaktywny „Zakończ” wyraźnie przygaszony.

## Panel Obiekty — zaznaczony obiekt bez dużego pola

- Zamiast nagłówka, sześciu przycisków w dwóch rzędach i pola nazwy (~210 px) jest jeden
  zwarty wiersz (~96 px z linią „Nazwa, parametry i wygląd”): nazwa i miary po lewej,
  rozwijane **„Działania”** po prawej (Bufor, Analizuj otoczenie, Wysokości, Odległości /
  Profil wysokości, Duplikuj, Edytuj kształt, Zakończ edycję).
- Pole „Nazwa obiektu” jest w zwiniętej sekcji „Nazwa, parametry i wygląd”.
- To samo na telefonie (panel Obiekty z Projektu).

## Testy

- Lokalnie: działka 60/18 → „+ Do projektu” → panel Obiekty z jednym wierszem i menu
  Działania (6 pozycji); szkic poligonu — przyciski w doku; profil terenu — dok i dolny panel.
- `check_release.py` bez błędów, wersja spójna; diagnostyka lokalnie tylko z testami
  sieciowymi środowiska testowego.
