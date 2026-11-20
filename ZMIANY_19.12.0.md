# 19.12.0 — karta miejsca: werdykt ze znaczkami, „Pokaż na mapie”, Raport zna działkę

Zawiera też wszystko z 19.11.0 (jedna karta Działka · Raport · Analizy, dolna belka bez
długiej instrukcji, scalona poprawka identify.php) — na serwerze działała jeszcze 19.10.0.

## Karta Działka

- **Werdykt jako lista** (MPZP, plan ogólny, Natura 2000, inne formy ochrony, klasa gruntu):
  jeden wiersz na pytanie ze znaczkiem stanu jak w projekcie —
  ● z ptaszkiem: jest / obowiązuje, ○ z kreską: brak / poza,
  ▲ bursztynowy: ograniczenie albo „nie sprawdzono” (usługa nie odpowiedziała), ◌: sprawdzanie.
  Znaczki są w kolorze tekstu, więc działają w jasnym i ciemnym motywie.
- **„Pokaż na mapie”** przy znalezionym MPZP (włącza rysunek planu) i planie ogólnym (obszary
  i strefy POG). Gdy warstwy już są włączone, przycisk zmienia się w „na mapie”.
  To samo działa w karcie działki na telefonie.

## Zakładka Raport

- Identyfikator działki wpisuje się sam z ostatniego wyniku „Sprawdź”, więc „Analizuj działkę
  360°” działa od razu. Identyfikator wpisany ręcznie nie jest nadpisywany.

## .htaccess — pamięć podręczna tylko dla poprawnych odpowiedzi

- 28.10.2026 hosting raz oddał arkusz CSS z typem `text/plain`; z nagłówkiem `immutable`
  przeglądarka trzymałaby taką zepsutą odpowiedź przez rok. Teraz stałe przechowywanie
  dostają tylko pliki z typem CSS/JavaScript (warunek `expr=`, Apache 2.4.10+); inne
  odpowiedzi dostają `no-cache` i przy następnym wejściu są pobierane ponownie.
  Na starszym Apache (lub bez mod_version) zostaje dawna reguła.
- Sprawdzone na Apache 2.4.58 z tym samym `.htaccess`: CSS z `?v=` i kod w `app-19.12.0/` —
  `immutable`; CSS z typem `text/plain` — `no-cache`; stare katalogi `app-*` — 410.

## Testy

- `check_release.py` bez błędów, wersja spójna, `test_identify_parse.php` 25/25.
- Przejście: działka 60/18 → werdykt (MPZP obowiązuje, plan ogólny uchwalony), „Pokaż na mapie”
  włącza rysunek MPZP, zakładka Raport ma wpisany identyfikator 221303_1.0021.60/18.
- Diagnostyka lokalnie: tylko test sieciowy MPZP (502 bramki środowiska testowego).
