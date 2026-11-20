# Mapownik 18.18.2 — czcionka Inter, porządek w CSS, widok mobilny

16.10.2026

Wersja po audycie układu. Bez zmian w danych, warstwach i API.

## Czcionka

Inter (SIL OFL) jest dołączony do paczki w `assets/fonts/` (zmienna, 100–900; łacińska i łacińska rozszerzona, w tym polskie znaki; razem ok. 130 KB). Wcześniej interfejs używał Inter tylko tam, gdzie był zainstalowany; w Windows wyświetlał się Segoe UI o innych szerokościach, więc układ różnił się od testowanego. Pliki są wczytywane z `@font-face` w `10-tokens.css` i wstępnie ładowane w `index.html`; `.htaccess` ma typ `font/woff2` i stałe buforowanie.

## Porządek w CSS

- Wspólne wartości (`--radius-control`, `--control-border-soft`, `--dock-top`) są w `10-tokens.css`.
- Poprawki, które dotyczyły reguł z `31-ux.css`, są wpisane w te reguły (przyciski grup, zestawy warstw, kafelek „Zdjęcia", pola tekstu na mapie, przyciski Projekt i Eksport).
- Pozostałe poprawki (prawy dok, pasek stanu, dolna krawędź mapy, zakładki, linki i `<summary>`) są w bloku na końcu `31-ux.css`. Reguły, które nadpisują pliki warstwy `legacy`, celowo nie zostały wpisane do tych plików: kolejność i specyficzność w nich jest zależna od zapytań medialnych i widoku mobilnego.
- Porównanie zrzutów przed i po: bez różnic (jasny i ciemny motyw, 1280–1440 px, 390 i 768 px).

## Widok mobilny

- Etykieta wyszukiwarki ma 11 px (było 10 px), a placeholder kończy się wielokropkiem zamiast urwania w pół słowa.
- Menu „Więcej": „Monitor źródeł danych" jako wiersz z ikoną (był podkreślonym linkiem bez ikony), „Motyw systemowy" z ikoną ✓ w stałym slocie (tekst wyrównany z pozostałymi wierszami).
- Arkusz Projekt: tytuł po lewej i przycisk zamknięcia po prawej, jak w innych arkuszach; wiersz „Obiekty projektu" z ikoną.
- Arkusz Warstwy: odstęp między miniaturami podkładów a nagłówkiem „Szybkie warstwy".
- Uchwyt arkusza ma cel dotyku 44 px (rysunek uchwytu bez zmian).
- Rząd zestawów warstw w prawym panelu nie jest już przycinany od dołu o 5 px (dotyczy 18.18.1; poprawione tutaj).

## Wdrożenie

Wgraj `app-18.18.2/`, `assets/` (z nowym katalogiem `fonts/`), `api/`, `monitor/`, `.htaccess`, `index.html` oraz pliki w katalogu głównym; usuń `app-18.18.1/` i `app-18.18.0/`.
