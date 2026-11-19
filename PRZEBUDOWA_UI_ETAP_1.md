# Etap 1 — szybkie poprawki bez zmiany układu (msportal 19.54.0)

Paczka: `dist/msportal-19.48.0-serwer.zip` → wgrać do **nowego** katalogu `/test23/`. test22 i produkcja bez zmian.

## Zmienione pliki
Wszystkie w `app-19.54.0/`, chyba że zaznaczono inaczej.

| Plik | Zmiana |
|---|---|
| `app/components/AppBar.js` | M2: przyciąganie / cofnij / ponów tylko w trybie Rysuj albo podczas szkicu |
| `app/components/ProjectMenu.js` | M3: kropka stanu zapisu zamiast tekstu „Zapis lokalny” (`projectSaveStatus`) |
| `app/components/MapStage.js` | M16: stopka pokazuje stan podkładu tylko przy problemie |
| `app/components/LayersPanel.js` | M17: grupa „Archiwum” ukryta, włączana w menu ⋯ panelu |
| `app/components/PanelHeaderActions.js` | menu ⋯ panelu przyjmuje pozycje panelu (`menuItems`) |
| `app/components/IdentifyPanel.js` | werdykt: 3 stany + ładowanie, oko w stałej kolumnie we wszystkich wierszach |
| `app/panels/PanelRegistry.js` | szkielet panelu zamiast pustego panelu przy pierwszym otwarciu; komponent po wczytaniu podmieniany, bez kolejnego mignięcia |
| `assets/css/38-ergonomia.css` | style kropki stanu, ikon werdyktu, kolumny oka, szkieletu (kolory z palety Las) |
| `store/uiSlice.js`, `app/components/SettingsMenu.js`, `app/hooks/useShellCommands.js` | tylko gęstość zwarta |
| `app/components/BasemapSwitcher.js` | wszystkie podkłady w przełączniku (także „Prawdziwa”); stan „przybliż mapę” zamiast wiecznego ładowania |
| usunięte: `app/components/OrthophotoPanel.js`, `features/builtin/orthophotoFeature.js` | moduł zdjęć archiwalnych (decyzja właściciela) |
| `features/index.js`, `data/catalog/dataCatalog.js`, `orthophoto/orthophotoApi.js`, `app/mobile/MobileShell.js`, `app/hooks/usePanelLayoutPersistence.js` | usunięcie odwołań do modułu archiwalnego |
| `diagnostyka.html`, `tests/e2e/portal.spec.js` (poza `app-*`) | testy dostosowane do zamierzonych zmian |
| `README_WGRAJ_NA_SERWER.txt` | paczka 19.48.0, wgrywanie do nowego katalogu testowego |

## Zrealizowane pozycje

| Poz. | Stan | Co zrobiono |
|---|---|---|
| M2 | ✅ | Przyciąganie, cofnij i ponów zniknęły z górnego paska w Sprawdź i Mierz. Wcześniej były widoczne, gdy projekt miał jakiekolwiek obiekty. W Rysuj są jak dotąd. |
| M3 | ✅ | „Zapis lokalny” → kropka przy „Projekt”. Szara: brak zmian. Pomarańczowa: zapisywanie. Zielona: zapisano. Czerwona: błąd. Pełny opis w dymku i dla czytnika ekranu. |
| M16 | ✅ | „Podkład OK” zniknęło ze stopki. Stan podkładu pojawia się (ikona ostrzeżenia) tylko przy błędzie lub problemach źródła. Skala i atrybucja bez zmian. |
| M17 | ✅ | Grupa „Archiwum” (archiwalne MIDAS) domyślnie ukryta. Warstwy ⋯ → „Pokaż warstwy archiwalne” (zapamiętywane). Włączona warstwa archiwalna jest widoczna zawsze. |
| Szkielet | ✅ | Panel ładowany przy pierwszym użyciu pokazuje szkielet z tytułem zamiast pustego obszaru. Po wczytaniu przełączanie paneli nie pokazuje szkieletu ani pustki (pomiar: 0 ms). |
| Werdykt | ✅ | Wiersze werdyktu mają 3 stany z ikoną: **tak** (pełne kółko z ✓), **nie** (pusty pierścień), **nie sprawdzono / brak danych** (pierścień z „?”) oraz ładowanie. Oko „Pokaż na mapie” w stałej kolumnie we wszystkich 6 wierszach. Dotąd Natura 2000, Inne formy ochrony, Klasa gruntu i Las go nie miały. Oko włącza istniejące warstwy (GDOŚ, klasy EGiB, własność lasów). |
| Gęstość | ✅ | Tylko zwarta. Pozycja „Gęstość” usunięta z Ustawień i palety poleceń. Zapisana „wygodna” jest ignorowana. |
| Zdjęcia archiwalne | ✅ | Usunięte: ikona „Zdjęcia” w prawej kolumnie, panel, podkład „Ortofotomapa archiwalna”. „Prawdziwa ortofotomapa” jest teraz w przełączniku podkładów (była dostępna tylko z panelu Zdjęcia). Pliki serwera (`api/orthophoto.php`, źródło `orthophoto_archive`) zostają do sprzątania w Etapie 7. |

**Bez zmian w tym etapie:** M1, M4–M15 — według planu etapów 2–6.

## Odstępstwa
1. **„Prawdziwa ortofotomapa” w przełączniku podkładów.** Po usunięciu panelu Zdjęcia nie byłoby innego miejsca na tę funkcję, a zasada brzmi „nie usuwaj funkcji”.
   - **Zachowanie:** usługa rysuje dopiero od skali ok. 1:25 000. Przy mniejszej skali miniatura pokazuje lupę z podpowiedzią „Przybliż mapę, aby zobaczyć zdjęcia.” — ten sam tekst co w dawnym panelu. Poprzedni podkład zostaje do czasu przybliżenia.
   - **Wcześniej:** w pierwszej wersji tego etapu kręcił się wskaźnik ładowania bez końca. Wychwycił to test e2e i jest poprawione.
2. **Oko w wierszach „nie” / „nie sprawdzono”.** Włącza warstwę źródłową, żeby można było sprawdzić sytuację na mapie. Nie dodaje nowej funkcji — korzysta z tego samego włączania warstwy co MPZP i Plan ogólny.

## Regresje
Nie stwierdzono.

| Test | Wynik |
|---|---|
| Vitest | 79/79 |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15; dostosowane 2 testy, oba z powodu zamierzonych zmian |
| Diagnostyka (lokalny Apache) | 198 testów, 186 OK |
| Kontrola wdrożenia | 20 kontroli: 16 OK, 4 ostrzeżenia, 0 błędów |
| Konsola przeglądarki | 0 błędów we wszystkich 21 stanach zrzutów |

Szczegóły:
- **Playwright — dostosowane testy:**
  - test projektu z linku przechodzi do Rysuj, bo tam jest licznik przyciągania (M2);
  - test podkładów akceptuje stan „czeka na przybliżenie”.
- **Diagnostyka — 9 błędów**, wszystkie spoza tego etapu, jak w 19.47.0:
  - GDOŚ 403/502 i PIG 502 — usługi zewnętrzne z tego środowiska;
  - brak bazy RWDZ (2 testy);
  - znany test „Faza 4”.
- **Diagnostyka — test transportu WMS** sprawdza teraz, że podkładu archiwalnego nie ma w katalogu.
- **Kontrola wdrożenia — ostrzeżenia:** GDOŚ, baza RWDZ, eksport ortofotomapy (biały obraz z tego środowiska) — jak wcześniej.
- **Poprawione w trakcie etapu:** podmiana komponentu po wczytaniu panelu dawała błąd React #130 (panel dostawał obiekt modułu zamiast komponentu). Wykryte na zrzutach, poprawione przed wydaniem.

## Zrzuty
- **Plik:** `dist/etap1-zrzuty.zip` — 21 zrzutów `etap1-<szerokość>-<stan>.png` i `etap1-pomiar.json`.
- **Rozdzielczości:** 1280×800, 1440×900, 1920×1080.
- **Stany:**
  1. start;
  2. działka 221312_2.0405.27/1;
  3. Rysuj → Poligon;
  4. Mierz → Odległość;
  5. „Teren → Bufor” (dziś Mierz → Bufor);
  6. dok Warstwy;
  7. dok Analizy → Ceny (dziś ikona Ceny).
- **Dodatkowo:** `etap1-1440-warstwy-archiwum.png` — Warstwy po włączeniu „Pokaż warstwy archiwalne” (menu ⋯).

## Udział mapy
Szerokość mapy niezasłonięta przez lewy panel i prawy dok, względem szerokości okna:

| Stan | 1280×800 test22 → 19.48 | 1440×900 test22 → 19.48 | 1920×1080 test22 → 19.48 |
|---|---|---|---|
| start, działka, Rysuj, Mierz, Bufor | 75% → 75% | 78% → 78% | 83% → 83% |
| dok Warstwy, dok Ceny | 55% → 55% | 60% → 60% | 70% → 70% |

- **Dolne panele:** nie pojawiły się w żadnym stanie.
- **Udział mapy:** nie mniejszy niż w test22.

## Pytania
1. **„Prawdziwa ortofotomapa” w przełączniku** (odstępstwo 1). Czy zostaje tam na stałe? Inna opcja: tylko orto standardowa w przełączniku, a prawdziwa w Warstwach jako nakładka.
2. **Ikony werdyktu.** Czy rozróżnienie „nie” (pusty pierścień) i „nie sprawdzono” („?”) jest czytelne na Twoim ekranie? Kolor „tak” to zieleń butelkowa z palety, bez nowego koloru.

Czekam na akceptację przed Etapem 2 (pasek kontekstowy, M1).
