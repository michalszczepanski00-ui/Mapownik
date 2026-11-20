# 19.17.0 — paleta „Leśna zieleń na jasnej belce”

Wybrany wariant z płótna (tablice 14–15). Zmieniają się wyłącznie kolory — układ,
działanie, API i format projektu bez zmian.

## Co się zmienia

- **Dok narzędzi, zakładki karty miejsca i znak msportal** są jasne (białe z delikatną
  ramką #DFE4DC) zamiast grafitowych. Tekst w doku ciemnozielony (#16261E).
- **Aktywne narzędzie, aktywna grupa i aktywna zakładka**: biały tekst na leśnej zieleni
  (#2F6B45).
- **Akcent** (przyciski główne, Eksport, filtry, „Pokaż na mapie”, zaznaczenia w Warstwach)
  — leśna zieleń #2F6B45 zamiast niebieskiego; tło akcentu #E6F0E9.
- **Ostrzeżenia** (▲, „nie sprawdzono”) — #A1460C, wyraźnie inne od zieleni.
- **Ciemny motyw**: ciemnozielona belka (#142019), jasna zieleń (#86C79D) jako akcent
  i aktywne elementy.
- **Telefon**: ten sam akcent (dolny pasek, przyciski); reszta telefonu bez zmian.
- Kontrast (WCAG AA ≥ 4,5:1): akcent na bieli 6,3:1, biały na akcencie 6,3:1, tekst
  drugorzędny 6,7:1, tekst doku 15:1.

## Technicznie

- Wszystkie kolory doku są teraz zmiennymi (`--v2-dock-*`, `--v2-ink*`) w jednym bloku
  `assets/css/34-v2.css` — kolejną paletę zmienia się tylko tam (wcześniej biel i grafit
  były wpisane w kilkunastu regułach).
- Bez zmian: kolory na mapie (obrys działki, pomiar, warstwy) — to kolory danych, nie
  interfejsu.

## Testy

- Jasny i ciemny motyw 1440 × 900: karta Działka z zakładkami, Warstwy, dok Pomiar
  z aktywnym narzędziem, Obiekty. `check_release.py` bez błędów, wersja spójna;
  diagnostyka lokalnie — tylko testy sieciowe.
