Mapownik 19.43.0 — konfiguracja raportu działki PDF

Plik konfiguracja/raport-pdf.json (opcjonalny) zmienia raport dla wszystkich użytkowników portalu.
Bez niego działają ustawienia domyślne. Aktualizacje portalu nie nadpisują raport-pdf.json ani logo.

1. Skopiuj raport-pdf.przyklad.json jako raport-pdf.json i zostaw tylko to, co chcesz zmienić.
2. Klucze:
   tytul, kolor (#rrggbb), stopka, zastrzezenia — teksty i kolor raportu;
   naglowek: nazwa, kontakt, logo (ścieżka do obrazu PNG/JPG na serwerze, np. ./konfiguracja/logo.png);
   domyslnySzablon — id szablonu zaznaczonego przy pierwszym otwarciu okna;
   sekcje — zmiana nazwy i opisu sekcji w oknie (id: dzialka, mapa, ewidencja, pog, mpzp, ceny, budowy,
            odleglosci, teren, powodz, przyroda, gleby, zrodla);
   szablony — lista szablonów:
     • istniejące id (karta, kupujacy, inwestor, planistyczny, pelny) — zmienia tylko podane pola,
       "ukryty": true usuwa szablon z okna;
     • nowe id — nowy szablon: nazwa, opis, sekcje, promien (300/500/1000), lata (2/3/5),
       podklad (orto/standard/karto/topo), rodzajCen (grunty/domy/mieszkania).
3. Szablony zapisane przez użytkownika w oknie („Moje szablony” → „Eksportuj”) mają ten sam format —
   listę „szablony” z wyeksportowanego pliku można wkleić tutaj.
4. Po zmianie odśwież portal (Ctrl+F5). Błąd w pliku JSON nie psuje raportu — wtedy działają ustawienia domyślne
   (sprawdź plik np. na jsonlint.com).

19.40.0 — REGUŁY WNIOSKÓW (karta decyzyjna raportu)
- "reguly" → "progi": zmienia progi zasad praktycznych, np. "zabudowaMieszkaniowaM": 500 (odległość budynku
  mieszkalnego, poniżej której biometanownia/przemysł dostaje ryzyko konfliktu), "spadekProcent", "spadekUdzial",
  "spadekPvProcent", "naturaBliskoM", "lasBliskoM", "minBokProstokataM" (osobno dla biometan / przemysl / pv).
- "reguly" → "wylaczone": lista identyfikatorów reguł do pominięcia, np. "ksztalt.prostokat", "teren.spadki",
  "otoczenie.mieszkalne". Pełna lista w app-<wersja>/report/reportRules.js.
- Szablony mają nowe pola: "typInwestycji" (ogolny | biometan | pv | przemysl) i "buforUzbrojenia" (60 | 150 | 300 | 500).
Wersja reguł (np. „reguły 1.0”) jest drukowana w stopce raportu.
