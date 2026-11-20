# Etap 0 — Rozpoznanie (bez zmian w kodzie)

**Wersja bazowa:** test22 = 19.47.0 (`api/health.php` → `19.56.0-server`), w repozytorium commit `813b2a1`, katalog kodu `app-19.56.0/`.
**Zmienione pliki:** brak (sam raport). Paczki nie budowałem.

Ścieżki poniżej są względne do `app-19.56.0/`; numery linii według commita `813b2a1`.

## 1. Główne komponenty układu

| Strefa | Komponent | Plik:linia | Uwagi |
|---|---|---|---|
| Górny pasek (desktop) | `MapTopBar` | `app/components/AppBar.js:89` | przyciąganie, cofnij, ponów (`:110`), menu Projekt (`:118`), Eksport (`:119`), pomoc, ustawienia |
| Stary pasek na całą szerokość | `AppBar` | `app/components/AppBar.js:34` | **martwy kod** — `App.js` importuje tylko `MapTopBar` (`app/App.js:7`, `:252`) |
| Menu Projekt + status zapisu | `ProjectMenu` | `app/components/ProjectMenu.js:6` | status „✓ Zapis lokalny” `:31`; pozycje `:24–29` |
| Ustawienia | `SettingsMenu` | `app/components/SettingsMenu.js` | motyw, gęstość (`:60`), tylko mapa, paleta, skróty, „Przywróć układ” |
| Lewy panel | `WorkspaceCard` | `app/components/WorkspaceCard.js:18` | szerokość i uchwyt `:32–70`, zakładki `:78`, opcje narzędzia (`ContextBar` w karcie) `:99` |
| Zakładka Działka | `IdentifyPanel` | `app/components/IdentifyPanel.js:289` | definicja panelu: `features/builtin/informationFeature.js:33` |
| Zakładka Raport | `VpsDataPanel` („Działka i otoczenie”) | `app/components/VpsDataPanel.js:40` | definicja: `features/builtin/vpsFeature.js:7–10` |
| Zakładka Analizy | `AnalysisPanel` | `app/components/AnalysisPanel.js:289` | zakładki „Screening działki” / „Analiza źródła” `:316–318`; definicja `features/builtin/analysisFeature.js:37–47` |
| Pasek kontekstu (opcje narzędzia, obiektu) | `ContextBar` | `app/components/ContextBar.js:99` | na desktopie tylko w lewej karcie (`WorkspaceCard.js:99`), na telefonie w nagłówku (`App.js:245`) |
| Baner podpowiedzi narzędzia | `MapToolHint` | `app/components/MapToolHint.js:15` | montowany w `App.js:254` |
| Pasek trybów i narzędzi | `ToolDock` + `toolGroups` | `app/components/ToolDock.js:23`, `app/components/toolGroups.js:15–41` | podpisy pod ikonami `ToolDock.js:78` |
| Pasek stylu obiektu | `ObjectStyleBar` | `app/components/ObjectStyleBar.js:120` | **u dołu**, nad paskiem trybów (`ToolDock.js:74`) |
| Prawa kolumna ikon | `ActivityBar` | `app/components/ActivityBar.js:21` | lista ikon z `store/panelsSlice.js:568` |
| Prawy dok | `RightPanelDock` | `app/components/RightPanelDock.js` | jeden panel naraz, Esc |
| Dolny dok | `Dock id:'bottom'` | `app/App.js:260` | **sprzeczne z ograniczeniem 1.1** — patrz pkt 4 |
| Podkład | `BasemapSwitcher` | `app/components/BasemapSwitcher.js` | 19.47.0: jedna miniatura, rozwija się po najechaniu |
| Legenda | `MapLegend` | `app/components/MapLegend.js:20` | przycisk „Legenda (n)” **u dołu** |
| Stopka / status źródeł | `MapStage` | `app/components/MapStage.js:376` | „Podkład OK” (`i18n/pl.js:197`) |
| Paleta poleceń (Ctrl+K) | `CommandPalette` + `CommandRegistry` | `app/components/CommandPalette.js`, `keyboard/CommandRegistry.js` | buduje listę z poleceń funkcji i powłoki (`app/hooks/useShellCommands.js`) |
| Rejestr funkcji | `defineFeature` / `FeatureRegistry` | `features/defineFeature.js`, `features/FeatureRegistry.js` | narzędzia, polecenia, panele, pola kontekstu — **istniejący rejestr**, patrz pyt. 9 |

## 2. Mapa migracji M1–M17: element → plik:linia → funkcja

| # | Element | Obecnie: plik:linia | Funkcja wykonująca akcję |
|---|---|---|---|
| M1 | Opcje Rysuj / Mierz („Po dodaniu”, „Pomiar”) | `features/builtin/editingFeature.js:50`, `features/builtin/measurementFeature.js:26`; render `ContextBar.js:159` w karcie `WorkspaceCard.js:99` | `ctx.settings.set('editing.repeat…')`, `measurement.setTemporary()` (`measurement/MeasurementManager.js:59`) |
| M2 | Przyciąganie, cofnij, ponów | `AppBar.js:110–117` (warunek `showEditing` `:102`: także gdy w projekcie są jakiekolwiek obiekty, więc widoczne w trybie Sprawdź) | `editingManager.toggleSnap()`, `commands.undo()/redo()` |
| M3 | „Zapis lokalny” | `ProjectMenu.js:31` | stan z `projectSession.getSnapshot()` |
| M4 | Eksport (zielony) | `AppBar.js:119` | `openPanel('export')` → `ExportPanel` (`features/builtin/exportFeature.js:21–29`, dok prawy) |
| M5 | Zakładki Działka / Raport / Analizy | `WorkspaceCard.js:11` (`placeCard`), `:78` | `openPanel(id)` dla `identify`, `vpsData`, `analysis` |
| M6 | Ceny transakcyjne | ① karta „W okolicy” `IdentifyPanel.js:183–219` (`Nearby`); ② zakładka Raport `VpsDataPanel.js:285` → `RcnPrices` (`RcnPrices.js:59`); ③ ikona Ceny → `MarketPricesPanel` (`MarketPricesPanel.js:58`, `features/builtin/marketFeature.js:11`) | ① `cachedJson(api/rcn.php?x,y,r)`, kliknięcie → `openPanel('marketPrices')`; ② `fetchJsonWithRetry(api/rcn.php?x,y,r)` wokół działki; ③ `fetchJsonWithRetry(api/rcn.php?bbox)` w widoku mapy |
| M7 | Budowy i pozwolenia | karta `IdentifyPanel.js:220` → `openPanel('buildingPermits')`; ikona Budowy `marketFeature.js:17` | `BuildingPermitsPanel` (`BuildingPermitsPanel.js:51`) → `api/permits.php` |
| M8 | Otoczenie działki | przycisk `IdentifyPanel.js:394` (`onScreening` `:434`) | `parcels.addParcel()` + `openPanel('analysis')` + `analysis.runParcelScreening()` (`analysis/AnalysisManager.js:508`) |
| M9 | Bufor | karta `IdentifyPanel.js:398`; Mierz → Bufor `toolGroups.js:28` | to samo narzędzie `core.buffer` (`features/builtin/bufferFeature.js:36`); karta najpierw dodaje działkę do projektu (`actOnParcel`, `IdentifyPanel.js:304`) |
| M10 | Wysokości, Profil, Teren 3D | karta `IdentifyPanel.js:399–400`; Mierz → Teren `toolGroups.js:29` | Wysokości: `core.terrain.area` (`terrainFeature.js:61`) + `runTerrainFor()`; Profil: `core.terrain.profile` (`terrainFeature.js:41`); 3D: karta → `openParcel3D(parcel)` (`terrain3d/terrain3dTool.js:12`), Mierz → narzędzie `core.terrain.3d` (`terrainFeature.js:82`) |
| M11 | Mierz: 6 narzędzi | `toolGroups.js:26–29` | sekcje „Pomiar” (Odległość, Powierzchnia, Bufor) i „Teren” (Profil, Wysokości, Teren 3D) |
| M12 | Zdjęcia lotnicze | ikona prawa `features/builtin/orthophotoFeature.js:4–10` | `OrthophotoPanel` (`OrthophotoPanel.js:10`); podkłady zdjęć `orthophoto/orthophotoApi.js:4` (`PHOTO_IDS`: orto, archiwalna, prawdziwa) |
| M13 | Raport PDF | karta `IdentifyPanel.js:395` (i `:403` bez narzędzi); zakładka Raport `VpsDataPanel.js:270`; Eksport (`ExportPanel.js:28`); telefon `app/mobile/MobileParcelCard.js:136` | wszędzie `reportDialog.open(parcel)` (`reportDialogStore.js`) — **jedna funkcja** ✓ |
| M14 | Import/eksport GIS | menu Projekt `ProjectMenu.js:29` („Obiekty i pliki GIS…” = `openPanel('objects')`); sekcja w Obiektach `ObjectsPanel.js:212` → `ProjectFiles.js:13`; panel Eksport `exportFeature.js:88–118` | ta sama lista formatów `features.list('exportFormats')` renderowana przez `FormatSection` (`ExportPanel.js`) w obu miejscach ✓ |
| M15 | „Planowanie przestrzenne n/n” | `IdentifyPanel.js:410` (`Section`, `defaultOpen: true`) | szczegóły warstw `pog_*`, `mpzp` z `identify` |
| M16 | „Podkład OK” | `MapStage.js:376`, tekst `i18n/pl.js:197` | stan warstwy podkładu |
| M17 | Grupa „Archiwum” | grupa z profili `data/catalog/sourceProfiles.js` (`midas_archive_*`), kolejność `data/catalog/dataCatalog.js:894`; render grup w `LayersPanel.js` | — |

## 3. Duplikaty logiki

| Funkcja | Wejścia | Wynik |
|---|---|---|
| Bufor | karta, Mierz → Bufor | ✓ ta sama funkcja (`core.buffer`); karta dodatkowo dodaje działkę do projektu jako cel |
| Wysokości | karta, Mierz → Wysokości | ✓ ten sam `core.terrain.area` + `runTerrainFor` |
| Teren 3D | karta, Mierz → Teren 3D | ⚠ ten sam moduł, dwie funkcje wejścia: karta `openParcel3D(działka)` (od razu model działki), Mierz `core.terrain.3d` (wskazanie obszaru) |
| Raport PDF | karta, Raport, Eksport, telefon | ✓ jedna funkcja `reportDialog.open` |
| Ceny transakcyjne | karta, Raport, ikona Ceny | ⚠ **trzy komponenty**: podsumowanie (`Nearby`), `RcnPrices` (wokół działki: promień, lata, lista, punkty, CSV), `MarketPricesPanel` (w widoku mapy: klasy cen, lista, CSV). Serwer ten sam (`api/rcn.php`); dwa pełne narzędzia z osobną listą i CSV |
| Budowy | karta, ikona Budowy | ✓ jeden panel; karta tylko go otwiera |
| „Otoczenie” | przycisk w karcie, zakładka Raport | ⚠ **dwie różne funkcje pod podobną nazwą**: przycisk „Otoczenie” = screening działki z usług WMS (`AnalysisManager.runParcelScreening`); zakładka „Raport” („Działka i otoczenie”) = analiza działki z serwera (`api/vps.php parcel/analyze`: plan, granice, odległości BDOT) oraz budynki i drogi BDOT |
| Pliki GIS | menu Projekt, Obiekty, Eksport | ✓ ten sam rejestr `exportFormats`; menu Projekt tylko otwiera Obiekty |
| Udostępnij przez link | menu Projekt, Eksport | ✓ `transfers.shareProject()` |
| Przyciąganie / cofnij | `AppBar` (martwy), `MapTopBar` | martwy kod do usunięcia w Etapie 7 |

## 4. Konflikty z ograniczeniami nienaruszalnymi (stan obecny)

| Element | Ograniczenie | Gdzie | Uwagi |
|---|---|---|---|
| Dolny dok: **Profil terenu**, **Wyniki analizy** (tabela), **Porównanie działek** | 1.1 — żadnych paneli u dołu | `terrainFeature.js:16`, `analysisFeature.js:60`, `objectsFeature.js:59`, `App.js:260` | patrz pytanie 1 |
| **Pasek stylu obiektu** (kolor, linia, grubość, krycie) | 1.1 i 1.6 (opcje obiektu u góry) | `ToolDock.js:74` | według 3.1 trafi do paska kontekstowego — w planie Etapu 2 |
| Przycisk **„Legenda”** | 1.1 | `MapLegend.js:20`, lewy dół obok miniatury podkładu | patrz pytanie 1 |
| Podpisy pod ikonami w pasku trybów i w prawej kolumnie | 5.4, 5.5 („ikony bez podpisów”) | `ToolDock.js:78`, `ActivityBar.js` | do zmiany w Etapach 3 i 5 |

## 5. Pomiar bazowy test22 — udział mapy w szerokości ekranu

Pomiar: szerokość mapy niezasłonięta przez lewy panel i prawy dok (z kolumną ikon), względem szerokości okna. Zrzuty: `ui/test22-<szerokość>-<stan>.png` (21 plików).

| Stan | 1280×800 | 1440×900 | 1920×1080 |
|---|---|---|---|
| start bez zaznaczenia | 75% | 78% | 83% |
| zaznaczona działka 221312_2.0405.27/1 | 75% | 78% | 83% |
| Rysuj → Poligon | 75% | 78% | 83% |
| Mierz → Odległość | 75% | 78% | 83% |
| „Teren → Bufor” (dziś Mierz → Bufor) | 75% | 78% | 83% |
| dok Warstwy | 55% | 60% | 70% |
| dok Analizy → Ceny (dziś ikona Ceny) | 55% | 60% | 70% |

- **Lewa karta** zajmuje 268 px zawsze, także na starcie bez zaznaczenia.
- **Dolne panele:** nie pojawiły się w żadnym z tych stanów.
- **Konsola:** bez błędów.

## 6. Pytania do właściciela

1. **Panele i przyciski u dołu dziś** (ograniczenie 1.1). Proponowane miejsca:

   | Element | Propozycja |
   |---|---|
   | Profil terenu (wykres) | Dok → Analizy → widok „Profil” (wykres w panelu prawym, mapa bez zmian) |
   | Wyniki analizy (tabela) | Dok → Analizy, pod wynikiem analizy źródła |
   | Porównanie działek | Dok → Obiekty → „Porównaj działki” (widok w tym samym panelu) |
   | Przycisk Legenda | ikona w prawej kolumnie pod Analizami albo pozycja w menu ⋯ panelu Warstwy — która opcja? |
   | Pasek stylu obiektu | pasek kontekstowy u góry (zgodnie z 3.1; Etap 2) |

   Czy akceptujesz?
2. **„Otoczenie” to dwie różne funkcje.** Moja propozycja:
   - „Otoczenie” = screening działki (dzisiejszy przycisk);
   - dzisiejsza zakładka „Raport” (analiza działki z serwera: plan, granice, odległości BDOT, budynki i drogi BDOT) — jako czwarty widok w Dok → Analizy, np. „Analiza działki (serwer)”, obok „Analizy źródła”.

   Jaką nazwę wolisz?
3. **Ceny transakcyjne mają dwa pełne narzędzia:** wokół działki (promień) i w widoku mapy. Propozycja: jeden widok Dok → Analizy → Ceny z przełącznikiem „Wokół działki | W widoku mapy”. Logika zapytań bez zmian, łączę tylko interfejs. Zgoda?
4. **Menu Projekt → „Nowy”:** taka funkcja dziś nie istnieje (jest tylko automatyczny zapis jednego projektu w przeglądarce). Pominąć (bez nowych funkcji), czy dodać?
5. **Podkład (5.6):** specyfikacja wymienia Orto, Mapa i Zdjęcia archiwalne, a dziś jest 7 podkładów oraz prawdziwa ortofotomapa. Proponuję zostawić wszystkie w tym samym wyborze, a zdjęcia archiwalne z wyborem roku dodać jako pozycję wyboru. Zgoda?
6. **„Udostępnij (link, PDF, pliki GIS)”:**
   - Czy „PDF” to eksport mapy do PDF/PNG (dzisiejszy panel Eksport)? Raport PDF działki zostaje w karcie (M13).
   - Proponuję menu Udostępnij: Link do projektu · Eksport mapy (PNG/PDF) · Pliki GIS.
7. **Gęstość „Zwarta / Wygodna”** w Ustawieniach (`SettingsMenu.js:60`) przeczy zasadzie 1.7 („wyłącznie zwarta”). Usunąć przełącznik (to usunięcie opcji), czy zostawić?
8. **Raport PDF w nagłówku karty (5.2 pkt 1):** przy 300 px nagłówek z nazwą, obrębem, gminą, powierzchnią, przyciskiem i ⋯ będzie ciasny. Czy dopuszczasz przycisk w drugim wierszu nagłówka (nadal przyklejony)?
9. **Rejestr akcji (sekcja 6):** kod nie ma katalogu `src/` — jest `app-<wersja>/`, a funkcje już mają rejestr (`defineFeature`: narzędzia, polecenia, panele; paleta Ctrl+K korzysta z niego).
   - Proponuję rozszerzyć ten rejestr o pola `zone` i `alsoIn` oraz kontrolę limitów stref (błąd w konsoli w trybie deweloperskim), zamiast tworzyć drugi, równoległy.
   - Plik w TypeScript: `app-*/actions/registry.ts`, który zbiera akcje z funkcji.

   Zgoda?
10. **Wdrożenie do test23:** nie mam dostępu FTP do Twojego serwera. Po każdym etapie przygotuję paczkę „WGRAJ NA SERWER” (np. `msportal-19.48.0-etap1-serwer.zip`). Wgrywasz ją do nowego katalogu test23 — nigdy do test22 ani produkcji. Zrzuty i testy wykonuję na lokalnej kopii tej samej paczki. Zgoda?
