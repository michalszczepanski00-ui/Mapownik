# msportal 19.38.0 — raport PDF: uzbrojenie, czytelny plan ogólny, ochrona przyrody, profile terenu

## Nowe w raporcie działki PDF

### Uzbrojenie terenu (nowa sekcja)
- **Mapa:** sieci z Krajowej Integracji Uzbrojenia Terenu (GUGiK, bazy GESUT powiatów) nałożone na mapę, z granicą działki i legendą kolorów.
- **Tabela dla 6 sieci** (elektroenergetyczna, gazowa, wodociągowa, kanalizacyjna, telekomunikacyjna, ciepłownicza):
  - czy sieć **przebiega przez działkę**;
  - jak daleko od granicy jest najbliższy przewód (w promieniu 60 m).
- **Jak liczone:** każdą sieć portal pobiera osobnym obrazem przez własne proxy, a przeglądarka mierzy odległość od granicy działki. Dokładność to ok. 0,2 m na piksel.
- **W skrócie:** wpis „Do 30 m od działki: …”.
- **Szablony:** sekcja jest w szablonach Dla kupującego, Inwestycyjny i Pełny.

### Plan ogólny — czytelny opis
- **Mapa:** mapa stref z **legendą GUGiK obok**.
- **Opis strefy:** pełna nazwa i opis prostym językiem, co strefa dopuszcza. Słownik obejmuje wszystkie 13 typów stref: SW, SJ, SZ, SU, SH, SP, SR, SI, SN, SC, SG, SO, SK.
- **„Ile można zbudować”** dla części działki w strefie:
  - maksymalna wysokość i przybliżona liczba kondygnacji;
  - maksymalna powierzchnia zabudowy w m²;
  - maksymalna powierzchnia kondygnacji nadziemnych (z intensywności);
  - minimalna powierzchnia biologicznie czynna w m².
- **Wyjaśnienie:** plan ogólny sam nie daje prawa do zabudowy; warunki zabudowy od 2026 r. wydaje się tylko w obszarze uzupełnienia zabudowy.

### Ochrona przyrody — mapa i odległości
- **Mapa** 6 × 6 km wokół działki na tle obszarów **Natura 2000** (ptasie i siedliskowe) oraz **parków, rezerwatów, OChK i użytków ekologicznych** (GDOŚ), z legendą.
- **Odległość** od działki do najbliższego obszaru Natura 2000 i do najbliższej innej formy ochrony, w promieniu 3 km.

### Wysokość terenu — profile w 3 osiach
- **Trzy profile** przez środek działki:
  - północ – południe;
  - zachód – wschód;
  - najdłuższa oś działki (z azymutem).
- **Wykresy:** wysokości z NMT 1 m, część w granicach działki zaznaczona tłem, różnica wysokości i spadek wzdłuż osi.

## Technicznie
- **Bez zmian na serwerze.** Raport korzysta z istniejących źródeł proxy (`kiut_*`, `natura2000`, `gdos_protection`, `wms_legend.php`) i `terrain.php`. Profile są w tym samym zapytaniu co siatka wysokości (do 800 punktów).
- **Diagnostyka:** nowy test „19.38.0 — raport PDF: uzbrojenie…”.

## Wgranie (aktualizacja_19.38.0.zip)
1. Wgraj `aktualizuj-19.38.0.php` i od razu go otwórz.
2. Wgraj resztę paczki: `index.html`, `diagnostyka.html`, `VERSION.txt`, `app-19.38.0/` oraz pozostałe pliki, jeśli wcześniejsze wersje nie były wgrane.
3. Odśwież stronę: Ctrl+Shift+R.
4. Otwórz `aktualizuj-19.38.0.php?sprzatanie=1`.
