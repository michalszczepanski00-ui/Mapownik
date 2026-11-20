# Mapownik 18.18.1 — poprawki layoutu

16.10.2026

Wersja poprawkowa po audycie układu 18.18.0. Bez zmian w danych, warstwach i API.

## Usterki

- Prawy panel nie zachodzi już na pasek stanu (wcześniej o 18 px); odstęp 8 px przy 1024–1920 px szerokości. Górny margines panelu jak w palecie narzędzi, prawe rogi proste przy szynie ikon.
- Miniatury podkładów: odpowiedź 1×1 px z proxy jest traktowana jak błąd i pokazuje się podkład zastępczy zamiast czarnego kafla.
- Zakładki dolnego panelu nie ucinają etykiet („Działki i obszary").
- Stylowanie linków w menu i panelach (Monitor źródeł), elementów `<summary>` oraz notatki w Eksporcie.
- Przycisk „informacje" w wierszu warstwy ma 28 px jak sąsiednie; przyciski „Włącz (n)" mają równą szerokość.
- Pasek stanu zaczyna się 12 px od krawędzi (był odstęp 62 px po dawnej palecie).
- Okno „Stan źródeł" zamyka się klawiszem Esc i kliknięciem poza oknem; przycisk w pasku stanu nadal je przełącza.
- Przyciski wejścia do panelu zdjęć: „Zdjęcia ▾" przy miniaturach (kafelek 66×46 px z przerywaną ramką) i „Zdjęcia i podkład ▾" w Warstwach.

## Spójność i ergonomia

- Lżejsza ramka przycisków tekstowych, jeden promień kontrolek (6 px), minimum 11 px, menu bez wersalików.
- Nagłówki (min. 44 px) i stopki (min. 30 px) paneli w prawym doku.
- Długie nazwy warstw w dwóch liniach zamiast wielokropka.
- Zestawy warstw w jednym rzędzie.
- Przełącznik podkładów i kontrolki widoku w jednej linii nad paskiem stanu; odstęp 88 px z 18.4 bez zmian.

## Wdrożenie

Katalog aplikacji nazywa się teraz `app-18.18.1/` (pliki z katalogu `app-*` są buforowane na stałe, więc zmiana w JS wymaga nowej nazwy). Wgraj `app-18.18.1/`, `assets/`, `api/`, `monitor/`, `.htaccess`, `index.html` oraz pliki w katalogu głównym; usuń `app-18.18.0/`. Poprawki CSS są w `assets/css/31-ux.css` (ostatni blok).
