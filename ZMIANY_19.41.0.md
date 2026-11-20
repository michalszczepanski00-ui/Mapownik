# msportal 19.41.0 — Teren 3D (Three.js)

Trójwymiarowy model terenu działki albo wieloboku z otoczeniem, zbudowany na danych NMT GUGiK. Profil terenu 2D i analiza „Wysokości” działają bez zmian.

## Jak uruchomić
- **Karta działki:** przycisk **3D** w wierszu „Do projektu · Bufor · Wysokości”.
- **Mierz → Teren 3D** (skrót **U**): otwiera działkę z karty albo zaznaczony wielobok. Jeśli nic nie jest wybrane, wystarczy kliknąć działkę na mapie.
- **Panel Obiekty:** akcja **Teren 3D** dla wieloboku (np. teren z kilku działek) i linii.

## Okno
- **Rozmiar:** ok. 80% ekranu z przyciskiem Maksymalizuj, Esc zamyka. Na telefonie zawsze pełny ekran.
- **Pasek kontrolek:**
  - Widok domyślny;
  - Przewyższenie 1× / 2× / 5× / 10×;
  - Kolory: Wysokość albo Nachylenie (klasy 0–2 / 2–5 / 5–10 / 10–15 / ponad 15%);
  - Szczegółowość: Szybka / Standardowa / Szczegółowa;
  - Otoczenie: 0 / 50 / 150 / 300 m.
- **Klik w teren** pokazuje:
  - wysokość w m n.p.m.;
  - spadek;
  - odległość od granicy;
  - współrzędne PL-1992.
- **Legenda:**
  - skala kolorów;
  - przewyższenie (zawsze podpisane);
  - krok siatki;
  - źródło i układ wysokości;
  - kompas.
- **Zaawansowane:**
  - ortofotomapa na powierzchni;
  - linie i obrysy z projektu;
  - pobranie kafli NMT 1 m z GUGiK.
- **PNG:** obraz widoku z podpisem (obszar, siatka, przewyższenie, źródło, data).
- **Raport PDF:** nowa sekcja „Teren 3D” (w szablonach „OZE i przemysł” i „Pełny”). Zawiera dwa ujęcia oraz:
  - wysokości w terenie i w obszarze modelu;
  - udział spadków ponad 5%;
  - krok siatki.

## Dane wysokości
Model korzysta z jednego źródła naraz; źródła nigdy nie są mieszane:
1. **Kafle NMT 1 m z WCS GUGiK** (`DTM_PL-KRON86-NH_TIFF`).
   - Pobiera je serwer przez nowe `api/dem.php` i zapisuje w `cache/dem/` na 180 dni.
   - Kafle mają 256 × 256 komórek co 1, 2, 4, 8 albo 16 m.
   - Ten sam teren otwiera się potem natychmiast (test: siatka 1 m w 26 ms, okno w 0,2 s).
2. **Siatka punktów z obecnej usługi punktowej GUGiK** (ta sama co profil), gdy kafli nie ma jeszcze w cache.
   - Szybka 24, Standardowa 40, Szczegółowa 64 punkty na dłuższym boku.
   - Pierwsze otwarcie trwa ok. 7–50 s, kolejne korzystają z cache punktów.

WCS GUGiK odpowiada wolno: w testach 70–151 s na kafel, część zapytań przekroczyła limit. Dlatego kafle nie są pobierane automatycznie, tylko z cache albo na żądanie (przycisk w „Zaawansowane”).

## Poprawka usługi punktowej (dotyczy też profilu i „Wysokości”)
GUGiK pod obciążeniem zwracał wysokość 0 dla całych paczek punktów, a `api/terrain.php` zapisywał te zera w cache. W teście dotyczyło to całego wiersza siatki w Starogardzie; poprawna wysokość to 82 m.
- Zero obok niezerowych wysokości w tej samej odpowiedzi jest teraz ponawiane.
- Wysokość dokładnie 0 nie trafia do cache i nie jest z niego brana.

## Układ wysokościowy
Kafle WCS są opisane jako PL-KRON86-NH. Usługa punktowa różni się od nich zależnie od miejsca: o −0,31 m w Witankowie i −0,07 m średnio (maks. 0,6 m) w Starogardzie.
- Model i odczyty w oknie pochodzą zawsze z jednego źródła, opisanego w legendzie.
- Ustalenie układu usługi punktowej pozostaje osobnym zadaniem.

## Biblioteka
Three.js 0.170.0 (MIT) i OrbitControls w `vendor/opt/`, bez zmian, w importmap jako `three` i `three-orbit-controls`.
- Biblioteka ładuje się dopiero przy otwarciu okna 3D, więc start Mapownika się nie zmienia.
- Sumy plików są w `tools/vendor-lock.json`.

## Kontrola
- **Geometria:** wymiary modelu 155 × 138 m zgodne z obszarem; północ na górze; rzeźba 12,37 m zgodna z danymi.
- **Rzędne:**
  - węzły siatki punktów są identyczne z usługą punktową (12 punktów, różnica 0,000 m);
  - wysokość z kliknięcia jest równa siatce przy przewyższeniu 1×, 2×, 5× i 10×.
- **Wydajność:**
  - 0 klatek w spoczynku (rysowanie na żądanie);
  - obracanie: 39 klatek, mediana 0,3 ms, p95 0,5 ms;
  - siatka 1 m: 42 780 trójkątów.
- **Pamięć:**
  - po zamknięciu 0 geometrii i 0 tekstur GPU, żaden canvas nie zostaje;
  - sterta stała w 30 cyklach otwórz–zamknij (1236–1258 kB);
  - zapis obrazu dokłada ok. 3 kB na cykl.
- **Telefon (390 × 844):** pełny ekran, poziom Szybka, Szczegółowa wyłączona.
- **Diagnostyka:** 189 testów przechodzi, w tym nowe testy 19.41.0. Nie przechodzi 7, wszystkie przez zewnętrzne serwery niedostępne z testowego środowiska (WMS GUGiK, GDOŚ 403, PIG-PIB).
- **Regresja interfejsu:** 14 z 14 scenariuszy na 1366×768 i 1920×1080.

## Wgranie (aktualizacja_19.41.0.zip)
1. Wgraj `aktualizuj-19.41.0.php` i od razu go otwórz. Sprawdź `katalog_api`.
2. Wgraj resztę paczki:
   - `index.html`, `diagnostyka.html`, `VERSION.txt`;
   - `assets/css/39-teren-3d.css`;
   - `vendor/opt/three.module.min.js`, `vendor/opt/three-orbit-controls.js`, `vendor/opt/three-LICENSE.txt`, `vendor/opt/README.txt`;
   - `app-19.41.0/`;
   - cały katalog `api/` (nowe `dem.php`, `_dem.php`, poprawione `_terrain.php`).
3. Odśwież stronę: Ctrl+Shift+R.
4. Otwórz `aktualizuj-19.41.0.php?sprzatanie=1`.
5. **Pilotaż:** otwórz `diagnostyka.html`. Ostatni test „pilotaż: kafel NMT 1 m z WCS GUGiK przez serwer” pokaże czas pobrania kafla z OVH (do 150 s). Limit czasu PHP jest w teście „Teren 3D: biblioteka, siatka, api/dem.php”.
