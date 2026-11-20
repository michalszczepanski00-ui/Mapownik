# msportal 19.2.0 — analiza RCN i BDOT10k na VPS

Nowe filtry cen transakcyjnych RCN oraz metryczna analiza sąsiedztwa budynków i dróg BDOT10k. Migracja i ponowny import źródeł. Szczegóły: `ZMIANY_19.2.0.md`.

---

# msportal 19.1.0 — harmonogram automatycznych źródeł

Nowości: automatyczne pobieranie BDOT10k i RCN na VPS ze skonfigurowanych źródeł, systemd timer, limity zasobów, status aktualizacji w panelu oraz transakcyjny import i filtr bbox. Pełna instrukcja: `ZMIANY_19.1.0.md`.

---

# 18.16.1 — audyt i monitor źródeł (14.10.2026)

- Monitor 41 pozycji: źródła WMS/WMTS/OSM, ULDK, NMT, KOWR, BDOT i API.
- Historia 20 prób, eksport JSON/CSV, powtarzanie przy otwartej karcie, Stop.
- Próby serwerowe ograniczone do allowlisty, TLS, czasu i rozmiaru; brak dowolnych URL.
- Limity czasu wyszukiwania 20 s, ULDK 35 s, WMS 12 s wraz z JSON.
- Telemetria ignoruje spóźnione i powtórzone zdarzenia kafli.
- Przejazd: limit trasy 2000 m i wierzchołków przed próbkowaniem; widoczny komunikat.
- Panel źródeł wyjaśnia ograniczenie skali. Powiększanie strony odblokowane.
- Raport i dowody testów w audyt/. Bez zmian schematu projektów.

# Mapownik — rejestr zmian

Od najnowszej wersji. Bieżąca wersja: 18.16.1.

## Mapownik 18.16.1 — szybszy start, komunikat o podkładzie, spadki terenu

Wersja zbudowana na 18.15.2 (bez wycofanej mapy topograficznej BDOT10k z 18.15.3).

### Szybszy start
- Kod aplikacji (`app-<wersja>/`) oraz style i biblioteki z wersją w adresie (`?v=…`) są przechowywane w przeglądarce na stałe — przy kolejnych wejściach przeglądarka nie pyta serwera o każdy z ~250 plików.
- Pomiar na prawdziwym serwerze Apache z `.htaccess` Mapownika: **powrót do aplikacji 0,4 s zamiast 3,2 s (4G)** i **0,6 s zamiast 12,1 s (słabe 3G)**. Pierwsze wejście bez zmian.
- Reguły w `.htaccess` przez `mod_rewrite` + zmienną środowiskową — gdy hosting nie ma któregoś modułu, zostaje dotychczasowa rewalidacja (bez błędu 500).
- Sprawdzone wdrożenie nowej wersji przy zapamiętanej aplikacji: zwykłe odświeżenie i nowa karta od razu wczytują nowy kod; stary katalog zwraca 410.
- **Ważne:** każda zmiana kodu musi mieć nowy numer wersji (`tools/bump_version.py`) — pliki w katalogu wersji nie są już sprawdzane na serwerze.
- Rozważone i odrzucone: późne wczytywanie biblioteki zod — kosztuje ok. 40 ms na komputerze, a jest potrzebna od razu do wczytania projektu.

### Komunikat, gdy podkład się nie wczyta
- Wcześniej kliknięcie niedziałającego podkładu nie robiło nic. Teraz komunikat: „Podkład „…” nie odpowiada — zostaje „…”. Serwer mapy może być chwilowo niedostępny.” z przyciskiem **Spróbuj ponownie**.
- Ponowienie naprawdę pobiera mapę od nowa — ręczna próba omija 60-sekundową blokadę źródła po serii błędów (automatyczne próby nadal ją respektują). Wcześniej ponowny wybór podkładu, który zawiódł, potrafił wisieć na „Ładowanie”.

### Spadki terenu na działce (Analiza wysokości)
- **Udział powierzchni w klasach nachylenia** — pasek i tabela (m², %): 0–<2%, 2–<5%, 5–<10%, 10–<15%, **≥15% (nowa klasa)**; średni spadek i spadek, poniżej którego leży 95% powierzchni.
- **Wykopy i nasypy do poziomej platformy:** poziom zrównoważony (wykop = nasyp, średnia wysokość terenu) albo własna wysokość [m n.p.m.]; objętości wykopu, nasypu i bilans. Szacunek orientacyjny z modelu NMT — bez skarp, spulchnienia i zdjęcia humusu.
- Mapa nachyleń i legenda w pięciu klasach; raport PNG/PDF zawiera pasek udziałów klas i wynik platformy.
- Dokładniejszy spadek przy granicy działki: wygładzanie w oknie symetrycznym (wcześniej jednostronne okno zaniżało spadek przy krawędziach — płaszczyzna 12% dawała średnio ~10%).

### Testy
- Nowe testy: obliczenia spadków i robót ziemnych na płaszczyźnie o znanym spadku (12%, 15 000 m³ przy poziomie zrównoważonym), zerowanie blokady źródła przy ręcznym ponowieniu, w przeglądarce — komunikat i ponowienie podkładu oraz pełny scenariusz spadków z podstawionym NMT. Razem 56 testów przeglądarkowych, wszystkie przechodzą; testy Node, PHP, Python i `package-check.py` bez błędów.

## Mapownik 18.15.2 — plan ogólny: strefy planistyczne

### Przyczyna
- GUGiK zmienił nazwy warstw w usługach planów ogólnych (PlanyOgolneGmin i ProjektowanePlanyOgolneGmin). Według GetCapabilities z 10.2026 warstwy to `strefaPlanistyczna`, `obszarUzupelnieniaZabudowy`, `obszarZabSrodmiejskiej` i `aktPlanowaniaprzestrzennego` (w planach projektowanych także `obszarStandardowDostepnosciInfrastrukturySpolecznej`). Tytuły mają przedrostek „POG - …”, a strefa jest w liczbie pojedynczej („Strefa Planistyczna” zamiast „Strefy Planistyczne”).
- Mapownik szukał stref po starym tytule. Dopasowanie zawodziło, a zapasowe dopasowanie po pozycji na liście wybierało **granicę aktu** zamiast stref. Skutek:
  - „Plan ogólny — uchwalony” (i przełącznik „Plan ogólny” na telefonie) pokazywał tylko obszar uzupełnienia zabudowy, obszar zabudowy śródmiejskiej i granicę aktu, bez stref planistycznych;
  - warstwa „Strefy planistyczne” rysowała granicę aktu, i to dopiero od zoomu 16;
  - pozycja „Strefa planistyczna” w karcie działki odpytywała granicę aktu.

### Poprawki
- Aktualne nazwy warstw w podglądzie mapy (`api/_wms_sources.php`), w odczycie działki (`api/identify.php`) i w katalogu (zapytania bezpośrednie przeglądarki). Tytuły mają aliasy dla starych i nowych nazw, a stare nazwy zostają tylko jako wariant zapasowy.
- „Plan ogólny — uchwalony” i „— projektowany” pokazują teraz także **strefy planistyczne**. Kolejność rysowania: granica aktu, strefy, obszar zabudowy śródmiejskiej, obszar uzupełnienia zabudowy (na wierzchu).
- Odczyt planu projektowanego w karcie działki obejmuje też strefę planistyczną.
- Warstwa „Strefy planistyczne” jest widoczna od zoomu 12 (wcześniej od 16). Usługa GUGiK sama ogranicza strefy do skali 1:100 000.
- Legenda planu ogólnego pokazuje strefy (korzysta z tej samej konfiguracji).

### Testy
- Nowy test `tests/pog-layers.php` (bez sieci): odtwarza aktualny GetCapabilities obu usług i sprawdza, które warstwy wybierze serwer dla mapy i dla karty działki. Na konfiguracji 18.15.1 test nie przechodzi w 6 na 6 przypadków i odtwarza zgłoszony objaw. Na 18.15.2 przechodzi.
- Test progów katalogu zaktualizowany (strefy od zoomu 12). Testy przeglądarkowe 54/54, testy Node, PHP, Python i `package-check.py` bez błędów.

## Mapownik 18.15.1 — przesuwanie mapy palcem (właściwa przyczyna)

### Przyczyna
- OpenLayers tworzy domyślne gesty mapy (przesuwanie, szczypanie, kółko myszy) z opcją `onFocusOnly: true`. Gdy element mapy ma `tabindex` — a Mapownik go ma, żeby działała klawiatura (strzałki, +/−) — gesty działają **tylko wtedy, gdy mapa ma fokus**.
- Na telefonie dotknięcie mapy dawało jej fokus i przesuwanie działało; dotknięcie wyszukiwarki, karty działki, przycisku albo arkusza zabierało fokus i kolejne przeciągnięcie nic nie robiło — aż do następnego dotknięcia mapy. Stąd „raz działa, raz nie”.
- Poprawka 18.14.2 (`touch-action: none`) była potrzebna, ale nie usuwała tej przyczyny. Wcześniejsze testy przesuwania palcem w emulatorze nie przechodziły i zostało to błędnie uznane za ograniczenie emulatora; czysta mapa OpenLayers w tym samym emulatorze przesuwa się poprawnie.

### Poprawka
- Mapa tworzy gesty z `onFocusOnly: false` — przesuwanie i szczypanie działają zawsze, bez względu na to, gdzie jest fokus. Na komputerze dotyczy to też pierwszego przeciągnięcia myszą i kółka po kliknięciu w panel.
- Gesty obrotu (Alt+Shift+przeciągnięcie, obrót dwoma palcami) są wyłączone — obrót mapy i tak jest zablokowany, a gest obrotu konkurował ze szczypaniem.

### Testy
- Nowy test przeglądarkowy z prawdziwym dotykiem (CDP): przesuwanie po starcie, po dotknięciu wyszukiwarki, po zamknięciu arkusza i 6 kolejnych przeciągnięć. Na kodzie sprzed poprawki test nie przechodzi. Razem 54, wszystkie przechodzą.

## Mapownik 18.15.0 — wersja mobilna: telefon poziomo, panele jak arkusze, rysowanie kciukiem

### Telefon trzymany poziomo
- Telefon obrócony poziomo (np. 844×390, 932×430) dostaje teraz powłokę mobilną; wcześniej dostawał wersję komputerową z drobnymi narzędziami. Warunek: szerokość do 760 px albo ekran dotykowy o wysokości do 500 px — ten sam w JS (`MOBILE_QUERY`) i w CSS. Tablet i niskie okno na komputerze bez zmian.
- Układ poziomy jak w Mapach Google: wyszukiwarka, przełączniki warstw, arkusze, panele i dolny pasek w lewej kolumnie, mapa po prawej na całej wysokości; przycisk lokalizacji w prawym dolnym rogu.
- Poprawka: minimalna wysokość 460 px (dla wersji komputerowej) przewijała w poziomie całą stronę — dolny pasek i przycisk lokalizacji były poza ekranem.
- Arkusze na niskim ekranie: wysokość „pół” nie jest już niższa niż pasek.

### Panele (Projekt, Analizy, Eksport, Ortofotomapy) jak arkusze
- Po puszczeniu uchwytu panel dociąga do jednej z trzech wysokości (niski / pół ekranu / prawie pełny); dotknięcie uchwytu przechodzi do następnej wyższej; przeciągnięcie w dół zamyka panel. Panel startuje na „pół ekranu”.
- Poprawka: najwyższa wysokość wychodziła ponad górną krawędź ekranu (nie liczyła dolnego paska).
- Bez przycisku „odepnij do okna” na telefonie — powłoka mobilna nie ma okien pływających, więc panel znikał bez śladu.
- Panel odpięty wcześniej na komputerze (zapisany układ) otwiera się na telefonie normalnie, w doku.

### Rysowanie na telefonie
- Nowy pasek u dołu podczas rysowania poligonu, linii, analizy wysokości i innych szkiców: bieżąca powierzchnia/długość, obwód, liczba punktów oraz **Cofnij** (ostatni punkt), **Zakończ** i **Anuluj** — w zasięgu kciuka, bez podwójnego dotknięcia (które koliduje z przybliżaniem). „Zakończ” jest aktywne dopiero przy wystarczającej liczbie punktów.
- Karta szkicu u góry ekranu nie jest już pokazywana na telefonie; w trakcie rysowania chowają się dolny pasek, wyszukiwarka i przełączniki warstw.
- Przycisk „Wstecz” przerywa rozpoczęty szkic.

### Drobne
- Przełączniki warstw mają obszar dotyku 44 px przy tym samym wyglądzie.

### Testy
- 3 nowe testy przeglądarkowe (układ poziomy i wykrywanie urządzeń, rysowanie z paskiem i Wstecz, dociąganie i zamykanie panelu); test z 18.11.0 zaktualizowany do paska rysowania. Razem 53, wszystkie przechodzą; testy Node, PHP, Python i `package-check.py` bez błędów (poza dwoma starymi testami wymagającymi sieci, jak w 18.14.x).

## Mapownik 18.14.3 — poprawki wersji mobilnej (audyt)

### Stabilność
- Przytrzymanie palca rozpoznaje drugi palec przez `isPrimary`, bez własnego licznika. Wcześniej jeden „zgubiony” palec (przełączenie aplikacji, powiadomienie, gest systemowy) wyłączał przytrzymanie do przeładowania strony. Odliczanie przerywa też utrata fokusu i schowanie karty.
- Przytrzymanie działa tylko w trybie spoczynku: nie otwiera menu punktu w trakcie pomiaru z celownikiem ani przy rysowaniu poligonu i innych narzędziach.
- Przerwany przez przeglądarkę gest na uchwycie arkusza (pointercancel) nie zmienia już wysokości arkusza; wcześniej arkusze same „skakały”.
- Przycisk „Wstecz” (Android, gest iOS) zamyka kolejno: menu punktu → pomiar → arkusz → kartę działki → panel, zamiast opuszczać aplikację.
- Lokalizacja: przesunięcie mapy palcem wyłącza śledzenie (jak w Mapach Google). Przekroczony czas GPS i chwilowy brak pozycji nie wyłączają lokalizacji; pokazuje się „Słaby sygnał GPS — dalej szukam pozycji…”. Lokalizację kończy tylko brak zgody.
- Komunikat o lokalizacji znika sam po kilku sekundach i stoi u góry ekranu, a nie pod arkuszem.
- Dolny pasek: przy Analizach, Ortofotomapach i Eksporcie świeci zakładka „Więcej”, nie „Mapa”.

### Układ
- Pole „Nr działki” było na telefonie schowane (szerokość 0). Pokazuje się jako druga linia wyszukiwarki po wybraniu miejscowości; lista podpowiedzi i przycisk Warstwy przesuwają się pod nią. Wyszukiwarka bez podwójnej ramki.
- Przycisk „Moja lokalizacja” stoi zawsze nad bieżącym arkuszem (wysokość arkusza w zmiennej `--m-sheet-h`); przy arkuszu na pełny ekran znika. Wcześniej chował się pod kartą działki.
- Jeden arkusz naraz: Warstwy, Więcej, Narzędzia i menu punktu przykrywają kartę działki zamiast nakładać się na nią; karta wraca po zamknięciu arkusza.

### Testy
- 4 nowe testy przeglądarkowe (zgubiony palec, przytrzymanie przy pomiarze i rysowaniu, pointercancel i przycisk Wstecz, śledzenie lokalizacji i położenie przycisku, pole numeru działki). Razem 50, wszystkie przechodzą; testy Node i `package-check.py` bez błędów.

## Mapownik 18.14.2 — przesuwanie mapy palcem

### Przyczyna
- Styl OpenLayers ustawia na mapie `touch-action: pan-x pan-y` — to ustawienie dla mapy osadzonej w przewijanej stronie. Przeglądarka sama rozstrzygała, czy przeciągnięcie palcem przewija stronę, czy przesuwa mapę, i potrafiła przejąć gest w trakcie (pointercancel). Dlatego przesuwanie raz działało, a raz nie.

### Poprawki
- Mapa ma `touch-action: none` — każde przeciągnięcie jednym palcem przesuwa mapę, dwa palce przybliżają.
- Wyłączone „przeciągnij, by odświeżyć” i odbijanie całej strony (`overscroll-behavior: none`).
- Strona nie powiększa się sama przy szczypaniu ani podwójnym dotknięciu — przybliża się mapa (`user-scalable=no`, jak w aplikacjach map); `viewport-fit=cover` dla telefonów z wycięciem ekranu.
- Przytrzymanie palca liczy palce po identyfikatorach — licznik nie „rozjeżdża się” po przerwanym geście.

### Testy
- Nowy test przeglądarkowy (ustawienia gestów na mapie). Razem 46; wszystkie testy Node i `package-check.py` bez błędów.

## Mapownik 18.14.1 — telefon: pomiar z celownikiem i menu przytrzymania (etap 2, część 1)

### Pomiar z celownikiem w środku ekranu
- Celownik stoi na środku mapy; przesuwasz mapę pod nim i dodajesz punkty dużym przyciskiem „+” — palec nie zasłania mierzonego miejsca, obsługa jedną ręką.
- Na żywo: długość albo powierzchnia (m/km, m²/ha), ostatni odcinek, obwód, liczba punktów. Przyciski „Cofnij”, „+”, „Gotowe”, „×” (anuluj). Krótka wibracja przy dodaniu punktu.
- „Gotowe” dolicza bieżące położenie celownika i zapisuje zwykły pomiar w projekcie (z potwierdzeniem „Zapisano pomiar: …”). Pomiar zerowy nie jest zapisywany.
- Trzy tryby: odległość, powierzchnia, profil terenu (zapisuje linię profilu i od razu pobiera wysokości).
- Na telefonie „Więcej → Narzędzia → Zmierz odległość / Zmierz powierzchnię / Profil terenu” uruchamiają celownik zamiast rysowania stukaniem.
- W trakcie pomiaru dotknięcie mapy nie otwiera karty działki; wyszukiwarka, przełączniki i dolny pasek chowają się.

### Menu po przytrzymaniu palca
- Przytrzymanie palca na mapie (~0,5 s) stawia czerwoną pinezkę i otwiera kartę „Wskazany punkt” ze współrzędnymi. Mapa przesuwa się tak, by pinezka była nad kartą.
- Akcje: Zmierz odległość stąd, Zmierz powierzchnię stąd, Profil terenu stąd (celownik startuje od tego punktu), Dodaj notatkę (napis na mapie w projekcie), Działka w tym miejscu, Nawiguj tutaj (Mapy Google), Kopiuj współrzędne (GPS / PL-1992).
- Przytrzymanie nie otwiera przy okazji karty działki i nie pokazuje systemowego menu przeglądarki.

### Testy
- Nowy test przeglądarkowy (przytrzymanie → menu → pomiar powierzchni z celownikiem → zapis). Razem 45; wszystkie testy Node i `package-check.py` bez błędów.

## Mapownik 18.14.0 — „Mapownik w terenie”: nowa wersja na telefon (etap 1)

Na telefonie (okno do 760 px) aplikacja ma własną powłokę wzorowaną na Mapach Google. Wersja na komputer bez zmian.

### Ekran główny
- Mapa na całym ekranie — bez palety narzędzi, paska paneli, paska stanu i przycisków +/− (powiększanie gestami).
- U góry pływająca wyszukiwarka (miejscowość, ulica, ID działki, numer działki) i przewijany rząd szybkich warstw: Orto, Działki, MPZP, Plan ogólny, Natura 2000, Ochrona przyrody, Sieci energetyczne, Budynki — jedno dotknięcie włącza/wyłącza.
- Po prawej przycisk „Warstwy” (typ mapy, szybkie warstwy, wszystkie ustawienia warstw) oraz „Moja lokalizacja”: niebieska kropka z kołem dokładności GPS; kolejne dotknięcia: pokaż → śledź → wyłącz.
- Dolny pasek: Mapa / Projekt / Więcej.

### Bez trybów: dotknięcie mapy = działka
- Domyślnie aktywna jest „Informacja o działce” — dotknięcie mapy od razu pokazuje kartę działki.
- Karta w trzech wysokościach (przeciąganie lub dotknięcie uchwytu): pasek z numerem, obrębem, gminą, powierzchnią i znacznikami (MPZP, Plan ogólny, Natura 2000, ochrona przyrody, klasa gruntu); pół ekranu z akcjami **Screening, Zapisz, Nawiguj** (trasa w Mapach Google), **Udostępnij** (systemowe udostępnianie albo kopiowanie linku); pełny ekran ze wszystkimi danymi.
- Screening uruchamia się i pokazuje wynik w tej samej karcie (z postępem i „Ponów” dla źródeł z błędem).

### Narzędzia i Więcej
- „Więcej → Narzędzia”: siatka narzędzi terenowych (pomiar odległości i powierzchni, punkt, poligon, pobranie działki, profil terenu, analiza wysokości, bufor). Aktywne narzędzie pokazuje się jako pigułka u góry z „×” powrotu do trybu działki.
- „Więcej”: Analizy i screening, Ortofotomapy, Eksport, jasny/ciemny motyw, „Wersja na komputer” (pełny układ na telefonie; wybór zapamiętany).
- Rysowanie napisów, strzałek, dróg dojazdowych i edycja stylów zostają w wersji na komputer.

### Inne
- Wyszukiwarka pokazuje „Wyszukiwarka jest chwilowo niedostępna” zamiast komunikatów technicznych (także na komputerze).
- Wszystkie przyciski powłoki mobilnej mają co najmniej 36–50 px.

### Testy
- 3 nowe testy przeglądarkowe (układ telefonu, karta działki po dotknięciu mapy, „Wersja na komputer”); testy dawnego układu telefonu działają w trybie „Wersja na komputer”. Razem 44 testy przeglądarkowe; wszystkie testy Node i `package-check.py` bez błędów.

### Dalej
- Etap 2: pomiar z celownikiem w środku ekranu, menu po przytrzymaniu palca, „Moje działki” jako lista z miniaturami, „Cofnij” w pasku u dołu.
- Etap 3: suwak historii zdjęć lotniczych, instalacja na ekranie głównym telefonu, praca przy słabym zasięgu.

## Mapownik 18.13.0 — realistyczny obrys przejazdu ciężarówki (krok 1)

### Problem
- Dotychczasowy obrys liczył boczny zasięg całego zestawu w punkcie, w którym była tylna oś ciągnika, i odkładał go w tym samym miejscu osi. Naczepa (8–12 m z tyłu) „ścinała” łuk w złym miejscu i w złym kształcie. Po narysowanej linii jechała tylna oś, a nie koła skrętne.

### Nowy model (road/vehicleSweep.js)
- Środek przedniej osi ciągnika jedzie dokładnie po narysowanej linii (tor kół skrętnych).
- Tylna oś ciągnika i zespół osi naczepy podążają za nią po traktrysach (rozstaw osi ciągnika 3,8 m, wyprzedzenie siodła 0,5 m, sworzeń → środek osi naczepy 7,7 m).
- Obrys nadwozia = suma kolejnych położeń ciągnika i naczepy co 0,5 m drogi, przypisana do właściwego miejsca na osi. Poszerzenie po wewnętrznej stronie łuku trwa także za łukiem, dopóki naczepa się nie wyprostuje.
- Osobno ślady kół (linia przerywana) — gdzie musi być nawierzchnia; obrys nadwozia — czego pojazd nie może dotknąć.
- Pojazd: ciągnik siodłowy z naczepą trzyosiową, 16,5 m × 2,55 m (wymiary dopuszczalne w UE), zapas modelu 0,2 m.
- Kontrola: przy zewnętrznym promieniu obrysu 12,5 m wewnętrzny wychodzi ok. 5,3 m — zgodnie z unijnym testem skrętności pojazdów członowych (pierścień 12,5 / 5,3 m).
- Gdy łuk jest ciaśniejszy, niż zestaw przejedzie, obrys po wewnętrznej stronie jest ograniczany, a pasek pokazuje ostrzeżenie „łuk zbyt ciasny”.
- Eksport mapy zawiera też ślady kół.

### Zmiana sposobu rysowania
- Rysowana linia to tor przedniej osi pojazdu (np. środek pasa ruchu), a nie tor tylnej osi.

### Testy
- Nowy `tests/road-sweep.mjs` (3 testy: unijny test skrętu, poszerzenie po wewnętrznej stronie łuku i szerokość na prostej, poprawność geometrii). Wszystkie testy Node, 41 testów przeglądarkowych i `package-check.py` bez błędów.

## Mapownik 18.12.3 — screening działki z Informacji o działce

### Problem
- Przycisk „Uruchom screening działki” był nieaktywny, gdy działkę wskazano narzędziem „Informacja o działce”. Screening działa na obiekcie projektu (pobrana działka, narysowany poligon), a wynik Informacji o działce nie był obiektem projektu — panel nie mówił, co zrobić.

### Zmiany
- Informacja o działce: przycisk „Screening tej działki” — dodaje działkę (granica z ULDK) do projektu, zaznacza ją, otwiera Analizy i od razu uruchamia screening. Ta sama działka nie jest dodawana drugi raz.
- Screening bez zaznaczonej działki pokazuje, jak ją wskazać: „Użyj działki … z Informacji o działce” (gdy jest odczytana) oraz „Wskaż działkę na mapie” (włącza „Pobierz działkę”), z krótkim wyjaśnieniem.
- `ParcelManager.addParcel(parcel)` — wspólne dodawanie działki do projektu.

### Testy
- 2 nowe testy przeglądarkowe (podpowiedź bez działki; „Screening tej działki” z danymi ULDK podstawionymi w teście). Razem 41.

## Mapownik 18.12.2 — layout narzędzi analitycznych (audyt 2026-10, punkty 23, 24, 26–29)

### 23. Wynik zaczyna się od podsumowania
- Informacja o działce: pod danymi działki pięć kafli „Najważniejsze” — MPZP, Plan ogólny, Natura 2000, Inne formy ochrony, Klasa gruntu (z symbolem klasy, gdy da się go odczytać). Kolory: ostrzeżenie (w obszarze ochrony), zielony (poza), neutralny (brak), wyciszony (brak danych).
- Screening: nad listą źródeł podsumowanie — najbliższy budynek, kolizje z działką, źródła z obiektami w promieniu, źródła bez obiektów, źródła bez odpowiedzi. Odległości w km/m wspólnym formatem.

### 24. Jednolite stany
- W trakcie wczytywania wszystkie pola działki pokazują „…” (wcześniej część pokazywała „—”, jakby nie było danych). Bez działki (błąd ULDK) zamiast siedmiu pustych pól jest tylko wskazany punkt.
- Anulowanie screeningu przez użytkownika to komunikat informacyjny, nie czerwony błąd.
- Błędy wyboru w panelu terenu („zaznacz działkę”, „wskaż prostokąt”) nie mają już przycisku „Ponów”, który dawał ten sam komunikat.

### 26. Bez żargonu
- Zastąpione m.in.: „swept path” → „obrys przejazdu”, „World file” → „Plik georeferencji”, „offline/niestab.” → „niedostępna/niestabilna”, „Katalog: N problem(y)” → „Warstwy z problemami: N”, „Studium (legacy)” → „Studium (dawny dokument)”, „Wyświetl dane wektorowe” → „Pokaż obiekty na mapie”, opisy z „GetFeatureInfo”, „IDW”, „ZipArchive”, „stale cache”, „bezpieczne limity RAM”, komunikaty o „deklaracjach funkcji”.
- Wynik analizy: zamiast „Baza: wersja” i „API BDOT: cache HIT · 12 ms” — „Dane BDOT10k z dnia …”.
- Podtytuł panelu terenu: „Wysokości z numerycznego modelu terenu (GUGiK NMT)” zamiast „GUGiK NMT · PL-KRON86-NH”; notka „{n} z {m} punktów wysokościowych”.

### 27. Analiza źródła w trzech krokach
- „1. Co sprawdzić”, „2. Gdzie”, „3. Co zrobić”. Opis źródła zastępuje ogólny akapit; margines i limit obiektów schowane w „Ustawienia zaawansowane”. Limit ręcznej analizy do 20 000.

### 28. Dolny panel terenu
- Bez wyniku (pusty, w trakcie, błąd) panel ma wysokość treści zamiast stałych ~280 px.
- Przy błędzie bez danych jeden komunikat zamiast trzech (status, wyjaśnienie, błąd).

### 29. Spójne nazwy
- Panel nazywa się „Informacja o działce” jak przycisk na belce i narzędzie (wcześniej „Informacja o miejscu” / „Szczegóły działki”).

### Testy
- 3 nowe testy przeglądarkowe (podsumowanie i tytuł, wysokość dolnego panelu i brak „Ponów” przy błędzie wyboru, trzy kroki bez żargonu). Razem 39 testów przeglądarkowych; wszystkie testy Node i `package-check.py` bez błędów.

## Mapownik 18.12.1 — działanie narzędzi analitycznych (audyt 2026-10, punkty 10, 12, 14, 15)

### 10. Jeden czytelny komunikat zamiast tego samego błędu w każdym wierszu
- Informacja o działce: gdy co najmniej 2 źródła (lub ULDK) nie odpowiadają, nad listą pojawia się jeden baner („12 źródeł nie odpowiada. Serwery GUGiK lub GDOŚ mogą być chwilowo niedostępne.”) z przyciskiem „Ponów źródła z błędem”.
- Wiersze pokazują krótki powód po polsku: „Serwis nie odpowiedział na czas” / „Serwis jest chwilowo niedostępny” / „Nie udało się odczytać danych z serwisu”. Po rozwinięciu wiersza — przycisk „Ponów” tylko dla tego źródła.
- Ponawiane są wyłącznie źródła z błędem (i ULDK, gdy działka się nie wczytała) — reszta wyników zostaje.
- Screening: ten sam układ (baner + „Ponów źródła z błędem”), krótkie powody w wierszach; brak bazy BDOT10k na serwerze opisany zwykłym zdaniem zamiast ścieżki katalogu.
- Poprawna odmiana liczebników („1 błąd”, „2 błędy”, „5 błędów”).

### 12. Analiza wysokości dla dowolnego obszaru
- Lista „Działki i obszary” obejmuje każdy poligon projektu (narysowany obrys, prostokąt, okrąg, bufor), nie tylko działki z ULDK. Działki są na początku listy; pomiary powierzchni są pomijane.

### 14. Odległości w wynikach screeningu
- Dla każdego źródła wektorowego zachowywana jest odległość do każdego obiektu i lista obiektów w promieniu. Po kliknięciu wiersza screeningu tabela wyników ma kolumnę odległości (sortowanie, eksport CSV) i oznacza obiekty w promieniu.

### 15. Szybszy screening z postępem
- Źródła sprawdzane po 3 naraz (wcześniej jedno po drugim); przycisk pokazuje „Sprawdzanie źródeł: N/M…”, a wiersze pojawiają się w miarę spływania wyników, w stałej kolejności.

### Testy
- 3 nowe testy przeglądarkowe (baner i „Ponów” w Informacji o działce, poligon w Analizie wysokości, postęp i baner w screeningu), 2 nowe testy w `tests/stability-1812.mjs`. Razem 36 testów przeglądarkowych; wszystkie testy Node i `package-check.py` bez błędów.

## Mapownik 18.12.0 — stabilność narzędzi analitycznych (audyt 2026-10, punkty 1, 3, 4, 5, 7, 8, 9)

### 1. Informacja o działce nie blokuje serwera
- `api/identify.php`: budżet 16 s na całe zapytanie (było do ~60 s), maks. 7 s na pojedyncze wywołanie, osobny bezpiecznik dla każdego źródła (`identify:<źródło>`), przerwanie po pierwszym timeoucie lub niedostępności zamiast próbowania kolejnych wariantów, zapamiętywanie działającego wariantu warstw.
- Błędy mają kod (`timeout`, `unavailable`, `upstream`) i flagę `retryable`, a treść jest po polsku, bez szczegółów technicznych („CONNECT tunnel failed…”).
- Przy niedostępnej usłudze odpowiedź przychodzi w ok. 1 s.

### 3. Bez fałszywych „przekroczono czas”
- Klient wysyła najwyżej 4 zapytania naraz; licznik 30 s startuje dopiero, gdy zapytanie faktycznie wychodzi (wcześniej liczył też czas w kolejce przeglądarki).

### 4. Spójny stan po nieudanej analizie
- Na starcie analizy znika poprzedni wynik; po błędzie lub anulowaniu znikają też podgląd i warstwa wyników. „Zapisz zestaw” nie zapisze już nowych geometrii z metadanymi starego przebiegu.

### 5. Screening budynków: najbliższe zamiast pierwszych + limit w panelu
- Serwer (parametr `near`) sortuje budynki według odległości od działki i zwraca N najbliższych. Odległość do najbliższego budynku jest pewna nawet przy obciętej liście; liczba w promieniu jest wtedy oznaczona „co najmniej N”.
- Nowe pole „Limit budynków” w panelu Analiz (500–20 000, domyślnie 5000; wcześniej na sztywno 1200). Limit serwera podniesiony z 5000 do 20 000.

### 7. Eksport
- Pakiet kafli: każdy kafel zapisywany do pliku tymczasowego i dodawany do ZIP przez `addFile` (wcześniej cały pakiet w pamięci → przekroczenie `memory_limit`).
- Sprzątanie plików tymczasowych także po przerwaniu (`register_shutdown_function`).
- Budżet czasu: 300 s dla pakietu, 120 s dla obrazu; przed końcem budżetu brakujące fragmenty trafiają do raportu 409 zamiast błędu 500.
- Pobrane fragmenty zostają na dobę (`cache/export-chunks`) — „Ponów” pobiera już tylko brakujące.
- Do limitu eksportów (4/h dla pakietów, 20/10 min dla obrazów) liczą się tylko udane eksporty.
- Bezpiecznik per źródło także w eksporcie.

### 8. Sprzątanie pamięci podręcznej
- `cache/terrain-v2` (wysokości NMT) objęte tym samym czyszczeniem co kafle (90 dni + limit rozmiaru).
- `export-chunks` i `export-rate` czyszczone po dobie, `identify-winner` po 30 dniach.

### 9. Profil terenu
- Zmiana innego obiektu w trakcie pobierania (np. dodanie pomiaru) nie restartuje już pobierania profilu.
- Narysowanie linii uruchamia jedno pobieranie (wcześniej dwa).
- Pobieranie profilu i analiza obszaru mają osobne przerwania — zmiana działek w analizie wysokości nie zatrzymuje profilu.

### Testy
- Nowy `tests/stability-1812.mjs` (7 testów), 2 nowe testy przeglądarkowe (szybka odpowiedź `identify.php` z kodem błędu, pole limitu w panelu). Razem 33 testy przeglądarkowe; wszystkie testy Node i `package-check.py` bez błędów.

## Mapownik 18.11.2 — audyt 2026-10, kroki 8–11

### Krok 8: osobna ikona Analizy wysokości
- Narzędzie miało tę samą ikonę (ramka z górami) co „Ortofotomapy” na prawej belce. Teraz to trzy warstwice — nie myli się też z okrągłą ikoną „Analiz”.

### Krok 9: pasek zaznaczonego obiektu przy 1280 px
- Lista „Linia ciągła” wychodziła poza swoje pole i wchodziła na etykietę „Grubość”. Lista jest węższa (132 px), a pola nie kurczą się pod kontrolką.
- Do 1366 px obrót ma same przyciski (krok 15°), bez pola kroku — cały pasek mieści się bez przewijania.

### Krok 10: stan panelu Warstw po uruchomieniu
- Sprawdzone: Warstwy otwierają się tylko przy pierwszym uruchomieniu, a potem aplikacja pamięta ostatni stan (zamknięty panel zostaje zamknięty, otwarty Eksport wraca po odświeżeniu). Ocena z audytu była błędna — bez zmian w kodzie.

### Krok 11: tekst wpisywany przy wskazanym miejscu
- „Tekst na mapie” i „Etykieta z odnośnikiem” otwierają małe pole tuż przy klikniętym punkcie zamiast okna na środku ekranu, które rozmywało mapę. Enter lub ✓ dodaje, Esc anuluje, kliknięcie obok dodaje wpisaną treść; zmiana narzędzia zamyka pole.
- Gdy mapa nie jest dostępna, zostaje dotychczasowe okno.

### Testy
- 3 nowe testy przeglądarkowe (ikona, pasek przy 1280 px, pole tekstu). Razem 31 testów przeglądarkowych, wszystkie testy Node i `package-check.py` bez błędów.

## Mapownik 18.11.1 — audyt 2026-10, kroki 4–7

### Krok 4: jednostki z jednego miejsca
- Nowy `core/units.js`: `formatLength` (m → km), `formatArea` (m² → ha → km²), `formatParcelArea` (działka: ha z 4 miejscami jak w EGiB + m²).
- Korzystają z niego: pasek szkicu (odczyt na żywo), etykiety pomiarów na mapie, nazwy pomiarów w Obiektach, Informacja o działce, Analizy, wyniki analiz, Profil terenu. Usunięto 6 lokalnych formaterów (m.in. „tys. m²”).
- Przykłady: „397 322 m” → „397 km”, „26 582 329 990 m²” → „26 582 km²”, działka „1,2345 ha (12 345 m²)”.

### Krok 5: rysowanie zaczyna się bez zaznaczenia
- Wybór narzędzia rysowania lub pomiaru odznacza poprzedni obiekt. Wcześniej pasek pokazywał jego styl i łatwo było zmienić kolor starego obiektu, myśląc, że ustawia się styl nowego.
- W trakcie szkicu pasek nie pokazuje pól zaznaczonego obiektu.

### Krok 6: eksport PNG działa od ręki
- Podkład bez renderowania po stronie serwera („Mapa standardowa” / OSM) jest w eksporcie zastępowany mapą topograficzną. Panel informuje o tym (komunikat informacyjny zamiast ostrzeżenia i okna potwierdzenia); legenda podaje faktyczny podkład.
- Szybki eksport sam dobiera „okrągłą” rozdzielczość (0,25 / 0,5 / 1 / 2 … 20 m/px), gdy wybrana dałaby za duży obraz, i pokazuje dobraną wartość pod przyciskiem.
- W „Więcej opcji” przy zbyt dużym obrazie jest przycisk „Dobierz: X m/px”.
- Gdy obszar jest za duży nawet przy 20 m/px (np. cała Polska), komunikat mówi wprost, żeby przybliżyć mapę albo zaznaczyć prostokąt.

### Krok 7: kursor zależny od narzędzia
- Krzyżyk przy rysowaniu, pomiarach, buforze i narzędziach terenu; „łapka” przy przesuwaniu mapy. Mapa ma atrybut `data-active-tool`.
- Nie zrobione: wskaźnik nad obiektem w trybie edycji (wymaga śledzenia ruchu myszy nad obiektami; do osobnego kroku).

### Testy
- Nowy `tests/units.mjs` (4 testy). 3 nowe testy przeglądarkowe (odznaczanie i kursor, jednostki pomiaru, szybki eksport). Test w `audit-hotfix.mjs` zaktualizowany do zastępowania podkładu OSM. Razem 28 testów przeglądarkowych, wszystkie testy Node i `package-check.py` bez błędów.

## Mapownik 18.11.0 — audyt 2026-10, kroki 1–3

### Krok 1: pierwsze kliknięcia po wyborze narzędzia już nie przepadają
- Kod narzędzia ładował się dopiero przy pierwszym użyciu (~0,4 s). Kliknięcia w tym czasie trafiały do zwykłej nawigacji: obiekt nie powstawał, a dwuklik przybliżał mapę.
- `ToolRegistry.preloadAll()` wczytuje w tle kod wszystkich narzędzi zaraz po starcie (`requestIdleCallback`), bez ich aktywowania. Wywołanie jest w `MapRuntime`.
- Gdyby narzędzie mimo to jeszcze się wczytywało, mapa nie przyjmuje kliknięć i pokazuje kursor oczekiwania (CSS).

### Krok 2: dolny dok nie jest przykrywany i nie zostaje pusty
- Prawy panel kończy się nad dolnym dokiem (Profil terenu / Analiza wysokości). `RightPanelDock` mierzy miejsce pod mapą i ustawia `--map-bottom-gap`.
- Przy zmianie narzędzia pusty dolny panel (bez wyniku, błędu i trwającego pobierania) zamyka się. Panel z wynikiem zostaje.

### Krok 3: telefon — Zakończ / Anuluj zawsze widoczne
- Podczas rysowania odczyt (długość, powierzchnia, obwód) oraz Zakończ / Anuluj pływają na karcie nad mapą, tuż pod paskiem, z przyciskami o wysokości 40 px. Wcześniej były poza ekranem w przewijanym poziomo pasku.
- Na komputerze bez zmian: odczyt i przyciski są w linii paska.

### Testy
- 3 nowe testy przeglądarkowe (kliknięcia tuż po wyborze narzędzia, panel nad dokiem i zamykanie pustego doku, widoczność przycisków na telefonie). Razem 25 testów przeglądarkowych, wszystkie testy Node i `package-check.py` bez błędów.

## Mapownik 18.10.5 — sprzątanie po usuniętych podpisach palety

Wersja bez zmian w wyglądzie i działaniu. Usuwa kod, który po 18.10.4 (paleta narzędzi bez opisów) stał się martwy.

### Zmiany
- `store/uiSlice.js`: usunięty stan `toolLabels`, akcja `setToolLabels`, selektor `selectToolLabels` i funkcja `defaultToolLabels`. Stary zapis `toolLabels` w localStorage jest ignorowany.
- `store/index.js`: usunięty eksport `setToolLabels` i `selectToolLabels`.
- `app/App.js`: preferencje zapisują już tylko `density`, więc starszy klucz `toolLabels` znika z localStorage przy najbliższym zapisie. Usunięty atrybut `data-tool-labels` na `.app-shell`.
- CSS: wszystkie reguły po podpisach usunięto w 18.10.4, w tej wersji potwierdzono, że nic po nich nie zostało (`tool-group-label`, `labeled`, `tool-button-label`, `tool-button-key`, `floating-tools-toggle`, `data-tool-labels`).
- i18n: krótkie nazwy grup (`group.<id>`) zostają, bo wymaga ich test kontraktowy funkcji; wykorzystuje je też `aria-label` sekcji palety w wersji `.long`.

### Testy
- Nowy `tests/ui-prefs.mjs` (3 testy): brak `toolLabels` w stanie, akcji i selektorze; stary zapis jest ignorowany, a gęstość się wczytuje; brak odwołań w kodzie aplikacji.
- Wynik: 15 plików testów Node bez błędów, 22 testy przeglądarkowe, `package-check.py` OK.

## Mapownik 18.10.4 — paleta narzędzi bez opisów

Na prośbę: w lewym pasku (paleta narzędzi) usunięto widoczne opisy przy narzędziach. Zostały same ikony, a nazwa, skrót i opis pokazują się wyłącznie w podpowiedzi po najechaniu (lub po fokusie klawiatury).

### Zmiany
- `FloatingTools.js`: usunięte nazwy grup, podpisy narzędzi, plakietki skrótów oraz przycisk „pokaż/ukryj nazwy”. Nagłówek palety to tylko strzałka zwijania. Sekcje grup zachowują `aria-label`, a przyciski `aria-label`, `aria-pressed` i podpowiedź.
- Paleta jest węższa: 44 px na komputerze (było 72 px), 48 px na telefonie (było 58 px).
- Usunięto ustawienie „Podpisy narzędzi w palecie” (menu Ustawień) i polecenie `shell.toolLabels` z palety poleceń. Stary zapis `toolLabels` w pamięci przeglądarki jest ignorowany.
- CSS: usunięto martwe reguły (`.tool-group-label`, `.floating-tools--labeled`, `.tool-button-label`, `.tool-button-key`, `.floating-tools-toggle`, przesunięcia przełącznika podkładów dla `data-tool-labels`). Zanikanie u dołu przewijanej palety przylega teraz do dolnej krawędzi.
- i18n: usunięte 5 kluczy po przełączniku podpisów.

### Testy
- Zastąpiono test z 18.10.1 (ukryte nazwy grup na telefonie) testem: brak jakichkolwiek opisów na komputerze i telefonie, każdy przycisk ma nazwę dostępną, paleta ≤ 64 px.
- Nowy test: podpowiedź po najechaniu pokazuje nazwę narzędzia.
- Wynik: 14 plików testów Node bez błędów, 22 testy przeglądarkowe, `package-check.py` OK.

## Mapownik 18.10.3 — audyt końcowy prawej belki

Kontrolny przebieg po wszystkich zmianach 18.9.11–18.10.2: sześć modułów szyny
na siedmiu rozmiarach ekranu (1920×1080 … 844×390, 390×844), kontrola nachodzenia
panelu na zoom, przełącznik podkładów i paletę, elementów poza panelem, małych
celów dotykowych, przewijania poziomego i błędów w konsoli. Błędów w konsoli
i przewijania poziomego nie było. Znalezione i poprawione:

- **Telefon, pierwsze uruchomienie:** panel Warstw otwierał się jako arkusz od dołu
  i zasłaniał paletę narzędzi oraz przełącznik podkładów. Bez zapisanego układu
  na szerokości do 760 px panel startuje zwinięty; zapisany układ ma
  pierwszeństwo, na komputerze nic się nie zmienia.
- **Skrót „Ortofotomapy” w Warstwach** miał 17–20 px wysokości na niższych
  ekranach; teraz min. 28 px (40 px na telefonie).
- **Pasek stanu na telefonie:** „Warstwy 0 aktywnych” się ucinało; teraz
  „Warstwy 0” (przy ładowaniu „· ładuje N”), wyjaśnienie w podpowiedzi.

### Testy

- `node tests/rail-browser.mjs` — 21/21 (2 nowe).
- Reszta zestawu bez zmian.

### Świadomie bez zmian

Na telefonie otwarty panel (arkusz od dołu) przykrywa paletę i przełącznik
podkładów — tak działa każdy arkusz; zwija się przyciskiem na szynie.

## Mapownik 18.10.2 — domknięcie uwag z audytu prawej belki

- **Jedno podświetlone narzędzie.** Po „Wskaż miejsce na mapie” w palecie świeci
  tylko „Informacja o działce” (wcześniej także Przesuwanie, bo identyfikacja
  przestawia edycję na przesuwanie, ale to ona przejmuje kliknięcia).
- **Eksport: jeden przycisk główny.** „Eksportuj PNG bieżącego widoku” zostaje
  głównym; „Zapisz projekt .mapownik” jest przyciskiem zwykłym.
- **Ortofotomapy:** „Pokaż zdjęcia” jest przyciskiem głównym (to jedyna czynność,
  która zmienia mapę); lista rodzaju zdjęć zajmuje całą szerokość i nie jest
  ucinana („Ortofotomapa aktual…”).
- Sprawdzony jasny motyw wszystkich paneli — bez zmian.

### Testy

- `node tests/rail-browser.mjs` — 19/19 (4 nowe, oblewają na 18.10.1).
- `node tests/right-panel.mjs` — 19/19; reszta zestawu bez zmian.

### Nadal otwarte (decyzje projektowe)

- Wariant „panel obok mapy” (mapa kurczy się o szerokość panelu).
- Skrót „Ortofotomapy” w panelu Warstw — zostawiony; do usunięcia, jeśli
  wystarcza szyna i przełącznik podkładów.

## Mapownik 18.10.1 — drobne poprawki prawej belki

Reszta uwag z audytu, które nie wymagały decyzji o układzie.

- **Ikona „Zadokuj”** w odpiętym oknie to zwykła pinezka (wcześniej
  przekreślona, czyli znaczenie odwrotne do działania).
- **ARIA szyny:** przycisk zadokowanego modułu ma `aria-expanded` i
  `aria-controls` (panel ma `id="right-dock-panel"`); odpięte okno zostaje
  przełącznikiem `aria-pressed`. Etykieta otwartego okna: „Zamknij okno …”.
- **Eksport:** listy wyboru zajmują całą szerokość wiersza (etykieta nad listą),
  więc „PUWG 1992 / EPSG:2180” i opis układu mapy nie są ucinane.
- **Informacja o działce:** przycisk „Wskaż miejsce na mapie” jest wyśrodkowany.
- **Odpięte Warstwy** kończą się nad przełącznikiem podkładów (wcześniej go
  przykrywały).
- **Telefon:** paleta narzędzi nie pokazuje ściętych nazw grup („Nawigac…”);
  sekcje zachowują `aria-label`, a grupy oddziela istniejąca linia.
  Checkbox grupy warstw ma 22×22 px z marginesem (wersja 18.9.11 dawała
  zbyt duży kwadrat 36 px).

### Testy

- `node tests/right-panel.mjs` — 19/19.
- `node tests/rail-browser.mjs` — 15/15 (5 nowych). Wszystkie nowe przypadki
  oblewają na 18.10.0.
- `python3 tests/package-check.py` — OK.

### Nadal otwarte

- Wariant „panel obok mapy” (mapa kurczy się o szerokość panelu) — do decyzji.
- Ortofotomapy: pierwsze włączenie wymaga „Pokaż zdjęcia”; w Warstwach jest
  dodatkowy skrót do tego panelu.
- Dwa przyciski główne w Eksporcie („Eksportuj PNG” i „Zapisz projekt”).
- Po „Wskaż miejsce na mapie” w palecie świecą dwa narzędzia (Przesuwanie i Informacja).

## Mapownik 18.10.0 — układ prawego panelu

Wynik audytu prawej belki (punkty 7–10). Wariant „panel na mapie”: panel
zostaje nakładką, a elementy mapy ustępują mu miejsca.

### Układ

- **Stała górna krawędź panelu.** Panel jest przypięty 8 px od góry, na wysokości
  początku szyny (wcześniej wyśrodkowany w pionie, więc „skakał” przy każdej
  zmianie modułu; przesunięcia ułamkowe rozmywały tekst).
- **Przyciski widoku (zoom, „Cała Polska”) przesuwają się przed panel**
  (`--dock-inset-right`); na telefonie unoszą się nad arkusz (`--dock-inset-bottom`).
  Wartości ustawia `RightPanelDock` na podstawie rzeczywistego rozmiaru panelu.
- **Dopasowanie widoku uwzględnia panel.** `OpenLayersMapController.setOcclusion()`
  dolicza przykrytą część do marginesu `fitExtent`, więc działka z wyszukiwarki,
  Obiektów i Analiz nie ląduje pod panelem. Przykrycie nie może zająć więcej
  niż 60% mapy.

### Obsługa

- **Escape** zamyka otwarty panel i oddaje fokus jego przyciskowi na szynie
  (pomijane w listach rozwijanych, menu i oknach, żeby nie kolidować z ich Escape).
- **Znacznik „jest wynik”** (zielona kropka) na przycisku Informacji, gdy wynik
  istnieje, ale panel jest zamknięty lub pokazuje inny moduł; dopisek w etykiecie
  dla czytników.
- Etykieta odpiętego i otwartego okna mówi „Zamknij okno …”.

### Liczniki warstw

- Jedna definicja w `layers/layerSummary.js` (`summarizeLayers`): plakietka na
  szynie, podtytuł panelu i pasek stanu liczą te same nakładki.
- Pasek stanu pokazuje „Warstwy N aktywnych”, a przy ładowaniu „· ładuje się M”
  (wcześniej „0/1”, które mieszało podkład z nakładkami).

### Testy

- `node tests/right-panel.mjs` — 18/18 (3 nowe).
- `node tests/rail-browser.mjs` — 10/10 (4 nowe): stała górna krawędź, brak
  nachodzenia na przyciski widoku (1440×900, 1024×640, 390×844), Escape i fokus,
  spójność liczników. Nowe przypadki oblewają na 18.9.11.
- `python3 tests/package-check.py` — spójność wersji, importów i zasobów.

### Nie zmieniono

- Wariant „panel obok mapy” (mapa kurczy się o szerokość panelu) — do decyzji.
- Okna odpięte (Warstwy otwierają się po lewej i zasłaniają przełącznik podkładów).

## Mapownik 18.9.11 — poprawki prawej szyny i paneli

Wynik audytu prawej belki (punkty 1–6).

### Poprawione błędy

- **Ctrl+\\** przywraca ostatnio używany moduł doku (wcześniej zawsze Warstwy).
  Moduł kontekstowy (Informacja) nie nadpisuje „ostatniego".
- **Odpięty pusty panel „Informacja o działce”** jest rysowany w oknie (wcześniej
  szyna pokazywała go jako otwarty, a na ekranie nic nie było). Okno ma teraz
  styl, przeciąganie i zmianę rozmiaru jak inne panele.
- **Polecenia „Pokaż panel …”** powstają z manifestów paneli. Paleta poleceń
  zawiera wszystkie moduły szyny (wcześniej brakowało Ortofotomap i Informacji).

### Układ i teksty

- Ortofotomapy: margines treści 10–12 px, podtytuł w nagłówku, własna wartość
  `order` (27) zamiast powtórzonego 25.
- Panel „Informacja o obiekcie” nazywa się teraz „Informacja o działce” — tak
  jak narzędzie w lewej palecie i pasek stanu.
- Przycisk „Ortofotomapy” w Warstwach ma odstęp od nagłówka.
- Przyciski szyny mają 40 px na szerokościach do 860 px (wcześniej 30 px
  między 761 a 860 px).
- Checkbox grupy warstw na telefonie jest kwadratowy 36×36 (wcześniej 36×16).

### Powody wyłączenia przycisków

- Eksport: pod wyłączonym „Eksportuj PNG bieżącego widoku” pojawia się powód
  (brak obsługi podkładu, limit rozmiaru, brak GD na serwerze).
- Analizy: wyłączony „Uruchom screening” ma `title` i `aria-describedby`
  wskazujące opis „Zaznacz działkę…”.

### Testy

- `node tests/right-panel.mjs` — 15/15 (4 nowe).
- `node tests/rail-browser.mjs` — 6/6, test w prawdziwej przeglądarce
  (Playwright + `php -S`); pomijany, gdy brak Playwrighta lub PHP. Wszystkie
  6 przypadków oblewa na 18.9.10.
- `python3 tests/package-check.py` — spójność wersji, importów i zasobów.

### Nie zmieniono (kolejny krok)

Pozycjonowanie panelu (skok pionowy, zasłanianie przycisków zoomu, padding
dopasowania widoku), Escape, znacznik „jest wynik”, ujednolicenie liczników
warstw.

## Mapownik 18.9.10 — rozróżnienie panelu i trybu mapy

- Otwarty panel na prawej szynie ma osobny stan wizualny: cienki obrys i ikonę w kolorze akcentu, bez wypełnienia.
- Aktywne narzędzie mapowe zachowuje niebieskie wypełnienie.
- Dodano test regresyjny obu oznaczeń.

### Weryfikacja

- `node tests/right-panel.mjs` — 11/11 testów.
- `python3 tests/package-check.py` — spójność wersji, importów, zasobów i modulepreload.

## Mapownik 18.9.9 — dopasowanie diagnostyki

Raport z 18.9.8 pokazał dwa błędy testów diagnostycznych, mimo że funkcje były
zaimplementowane. Poprawiłem kontrole, żeby odpowiadały obecnej konfiguracji:

- Analiza NMT: sprawdzane są etykiety 50, 200, 400 i 800 próbek oraz komplet
  czterech presetów z API. Poprzedni test oczekiwał trzech starych nazw.
- WMS: archiwalna ortofotomapa jest jawnie sprawdzana jako wyjątek korzystający
  z proxy EPSG:2180 i parametru TIME. Nie przechodzi przez transport bezpośredni,
  ponieważ ten nie umożliwiałby prawidłowej reprojekcji. Pozostałe źródła nadal
  muszą mieć bezpośredni transport i klucz do własnego proxy.
- Test dostępności CORS omija źródła skonfigurowane wyłącznie przez proxy.
- Nie zmieniałem zachowania mapy ani źródeł ortofotomap; poprawka usuwa fałszywe
  alarmy diagnostyki i sprawdza nową konfigurację wprost.

### Weryfikacja

- Raport wejściowy: 2 niezaliczone testy opisane wyżej; EGiB WMS zwrócił HTTP 502
  i został poprawnie oznaczony jako chwilowa niedostępność usługi zewnętrznej.
- Testy kontraktu diagnostyki sprawdzają etykiety NMT, limity API, wyjątek proxy
  archiwum oraz test CORS.
- Pełny pakiet testów, kontrola spójności wersji 18.9.9, składnia JS/PHP
  i generator modulepreload.
- Wdrożenie zdalne nie zostało wykonane. Aby uruchomić poprawioną diagnostykę
  na stronie, wgraj całą paczkę 18.9.9.

## Mapownik 18.9.8 — ortofotomapy i archiwum

- Osobny panel Ortofotomapy z ikoną na prawej szynie i skrótem w Warstwach.
  Korzysta z istniejącej karty, trybu pływającego i panelu mobilnego.
- Warianty: aktualna ortofotomapa, ortofotomapa archiwalna i prawdziwa
  ortofotomapa. Bez suwaka porównawczego. W dolnym przełączniku podkładów
  pozostaje jedna pozycja zdjęć pokazująca wybrany wariant.
- Rok i stan na 1. dzień miesiąca z zakresu publikowanego przez GUGiK.
  Nie jest to data wykonania wszystkich zdjęć ani gwarancja pokrycia kraju.
  Awaria GetCapabilities uruchamia oznaczony zakres z ostatniej weryfikacji;
  przycisk ponowienia odświeża zapytanie. Zweryfikowany zakres: 1995-01–2025-11.
- Odczyt w środku mapy: do 10 rekordów z datą, wielkością piksela i kolorem.
  Wynik znika po przesunięciu mapy; stare zapytanie jest anulowane.
- Archiwum jest pobierane w EPSG:2180 jako jeden obraz przez własne proxy,
  co umożliwia reprojekcję bez ograniczeń odczytu obrazu z obcego serwera.
  Proxy zachowuje TIME i oddziela cache okresów. Zmiana okresu usuwa stary obraz.
- Krycie 10–100%; okres i krycie są zapisywane lokalnie oraz w .mapownik.
  Eksport mapy PNG/PDF przekazuje właściwy podkład, TIME i krycie do serwera.
  Prawdziwa ortofotomapa ma ograniczone pokrycie; brak zdjęć może dać pusty obraz.
- Cache metadanych ma TTL 24 h i jest objęty limitem oraz usuwaniem starych plików.
  Nowe funkcje korzystają z istniejących OpenLayers/React, bez dodatkowej biblioteki.
- Poprawiono domyślny tryb eksportu dla żądania bez pola mode.

### Weryfikacja

- 103 testy JavaScript: wszystkie przechodzą; zapis projektu, TIME w proxy,
  spóźniony render, wybór wariantu, anulowanie i cache zakresu.
- Testy PHP: metadane na rzeczywistym formacie GUGiK, zakres miesięcy,
  walidacja TIME, eksport WMS z dwiema datami i poprawnym kryciem (GD),
  regresja API wysokości. Składnia wszystkich PHP i JavaScript sprawdzona.
- Kontrole paczki, bibliotek, ikon, CSS, KOWR i BDOT przechodzą.
- Żywe API: odczyt 10 rekordów oraz obrazy WMS dla 2020-09 i 2025-11
  z różnymi treściami; cache okresów działa. Podczas testów GetCapabilities
  było czasowo niedostępne — zakres awaryjny z ostrzeżeniem działał poprawnie.
- Żywy eksport przerwał się z informacją o niekompletnym wyniku przez timeout
  połączenia do GUGiK w środowisku testowym. Funkcje TIME/krycia eksportera
  są sprawdzone offline na rzeczywistym kodzie PHP i deterministycznym WMS.
- Test wizualny przeglądarki nie został wykonany: pobranie Chromium nie powiodło
  się. Interakcje i wygląd na docelowym hostingu wymagają kontroli z listy
  DEPLOYMENT_CHECK.txt. Paczka nie została opublikowana na zdalnym serwerze.

## Mapownik 18.9.7 - opcje analizy wysokości

- „Mapa nachyleń” w selektorze widoku okna Analiza wysokości. Cztery klasy:
  0 do <2%, 2 do <5%, 5 do <10%, co najmniej 10%. Krycie działa również
  dla tego widoku. Pod kursorem widoczna jest interpolowana wysokość
  i lokalne nachylenie. Pochodne obliczane są w metrach w EPSG:2180
  z wygładzonego pola wysokości; miejsca bez pochodnych pozostają przezroczyste.
- „Pokaż poziomice” jako niezależna opcja w tym samym oknie. Odstęp Auto
  albo 0,5 / 1 / 2 / 5 / 10 / 20 m. Co piąta poziomica jest wyróżniona
  i opisana. Poziomice powstają z istniejącego pola wysokości metodą
  marching squares, z łączeniem odcinków i przycinaniem do granic i otworów.
  Luki w danych nie są domykane. Dla płaskiego terenu panel opisuje brak linii.
- Obliczenia powierzchni i poziomic w Web Worker. Zmiana widoku, krycia
  i przełącznika poziomic nie uruchamia zapytań NMT. Wynik poziomic jest
  buforowany; zmiana obszaru lub odstępu anuluje poprzednie obliczenia.
  Limit 48 poziomów, 24 000 odcinków i 2000 połączonych linii chroni
  płynność mapy. Zbyt drobny odstęp jest zwiększany, z informacją w panelu.
- Eksport PNG i PDF z przycisków w wynikach analizy. Lokalny raport zawiera
  mapę samej analizy bez podkładu mapowego: bieżący widok, krycie, granice,
  opcjonalne poziomice i próbki, MIN / ≈ ŚR. / MAX, skalę, północ,
  legendę, statystyki, źródło, datę i kompletność. Niekompletne dane mają
  czerwone oznaczenie. PNG ma 1600 × 1132 piksele; PDF to jedna graficzna
  strona A4 w poziomie, bez zależności od zewnętrznych usług ani bibliotek PDF.
- Nachylenia i poziomice są orientacyjne i wynikają z interpolacji próbek.
  MIN/MAX oraz statystyki dotyczą pobranych wysokości; ≈ ŚR. oznacza próbkę
  najbliższą średniej. Nowe widoki nie zwiększają dokładności źródła.
- Backend PHP oraz pobieranie 50 / 200 / 400 / 800 próbek pozostają zgodne
  z poprzednim wydaniem. Wgraj całą paczkę, w tym nowe moduły i worker.

### Weryfikacja

96 testów Node przeszło, w tym obliczenia znanej płaszczyzny, progi klas,
NoData, poziomice i otwory mniejsze od komórki rastra, przypadek siodłowy,
limity złożoności, anulowanie i odrzucanie późnych odpowiedzi, brak pobierania
przy przełączaniu oraz struktura PDF. Kontrole paczki, importów, modulepreload,
tokenów, ikon i danych KOWR przeszły. PNG i wyrenderowany PDF sprawdzono
wizualnie dla obszaru z otworem i brakującymi wysokościami.

Nie przeprowadzono pełnego testu interakcji w przeglądarce ani wywołań
rzeczywistego NMT/PHP na hostingu. Lista prób po instalacji znajduje się
w DEPLOYMENT_CHECK.txt. Paczka nie oznacza wdrożenia na zdalnym serwerze.

## Mapownik 18.9.6 — analiza wysokości

- Wybór 50, 200, 400 i 800 próbek; prostokąt tworzy dokładną liczbę punktów.
  Dla działek limit dotyczy całej analizy (maksymalnie 12 działek), a liczba
  faktycznych punktów zależy od geometrii. Usunięto limit 220 na jedną działkę.
- Pobieranie po 40 punktów, maksymalnie dwa zapytania jednocześnie. Do czterech
  prób na brakującą próbkę, odstępy 0,6 / 1,2 / 2,4 s i dzielenie paczek.
  Seria awarii zatrzymuje kolejne zapytania, zachowując wyniki do wznowienia.
- Licznik pobranych punktów, kompletność, zatrzymanie, uzupełnianie braków
  i kompaktowa diagnostyka ostatnich sześciu zapytań.
- Backend dopasowuje wysokości po współrzędnych. Nowy cache terrain-v2
  zapisuje tylko poprawne wysokości; dawne paczki z null nie są używane.
- Domyślnie interpolowana powierzchnia wysokości i delikatne cieniowanie.
  Widoki Kolory / Cieniowanie / Kolory + cieniowanie, krycie 10–100%.
- Własna lokalna interpolacja IDW (do 12 sąsiadów, ograniczony zasięg)
  w EPSG:2180, Web Worker, limit 131 072 pikseli na analizę. Bufory są
  przekazywane bez kopiowania. Gotowe obrazy są buforowane w OpenLayers;
  przesuwanie mapy nie przelicza interpolacji ani nie pobiera NMT ponownie.
- Każdy rozłączny fragment jest przetwarzany osobno. Maska polygonu zachowuje
  otwory. Braki danych pozostają przezroczyste. Cieniowanie korzysta z
  wygładzonego pola pochodnych; wysokości i kolory zachowują oryginalne IDW.
- MIN/MAX oznaczają skrajne pobrane próbki. ≈ ŚR. oznacza próbkę najbliższą
  średniej. Wspólne lokalizacje mają jeden znacznik z połączonym opisem.
  Statystyki są liczone z pobranych danych, nie ze sztucznie zagęszczonego rastra.
- Odczyt pod kursorem jest oznaczony jako interpolowany. Sama interpolacja
  nie zwiększa rozdzielczości ani dokładności źródłowych danych NMT.
- Zmiana obszaru, siatki, geometrii lub zamknięcie panelu anuluje pracę.
  Warstwy, worker, źródła i adresy obrazów są zwalniane przy usunięciu wyniku.

### Weryfikacja

Nowe testy automatyczne: 800 wyników i ograniczona równoległość, częściowe
odpowiedzi, dzielenie paczek, wznawianie, timeouty, anulowanie, awaria usługi,
siatki, IDW, maski i luki, osobne fragmenty, worker oraz brak przywracania
nieaktualnych analiz. Testy PHP offline znajdują się w tests/terrain-api.php.
Środowisko lokalne nie ma interpretera PHP ani przeglądarki z silnikiem do
pełnego testu interfejsu. Próby API PHP i rzeczywistego NMT na hostingu opisuje
DEPLOYMENT_CHECK.txt.

## Mapownik 18.9.5 — układ mobilny

- Na ekranach do 760 px szerokości prawy panel otwiera się jako dolna karta. Prawa szyna „Panele” pozostaje przy krawędzi ekranu.
- Górny uchwyt karty pozwala zmienić jej wysokość przeciągnięciem. Przy użyciu klawiatury działają strzałki góra/dół oraz Home/End.
- Mapa jest widoczna nad kartą, a pasek stanu i atrybucji pozostaje odkryty na dole.
- Powiększono pola dotykowe ikon szyny, nagłówków i wierszy warstw, przełączników, wyszukiwarki oraz akcji obiektów.
- Układ na szerszych ekranach zachowuje dopasowanie wysokości panelu do treści z wersji 18.9.4.

Kontrola na telefonie: otwórz Warstwy, przeciągnij uchwyt, przewiń listę do końca, przełącz warstwę i grupę, otwórz Obiekty oraz sprawdź widoczność mapy i podpisów źródeł.

## Mapownik 18.9.4 — układ paneli i tryb Sama mapa

### Zmiany

- Prawa karta ma wysokość wynikającą z zawartości; długie listy przewijają się wewnątrz panelu. Maksymalna wysokość pozostaje ograniczona do dostępnego obszaru mapy.
- Prawa szyna nosi podpis „Panele”, a lewa paleta „Narzędzia mapy”. Paletę można zwinąć przyciskiem w jej nagłówku i rozwinąć ponownie.
- Przycisk „Sama mapa” w górnym pasku ukrywa panele i narzędzia. Interfejs wraca po kliknięciu „Przywróć interfejs”, naciśnięciu Esc albo Ctrl+Shift+M.
- W widoku samej mapy zachowano widoczne atrybucje aktywnych źródeł. Tryb jest tymczasowy i nie zapisuje się w projekcie ani preferencjach.

### Kontrola

- Otwórz po kolei Informację o obiekcie, Warstwy, Obiekty, Analizy i Eksport. Krótki panel ma dopasowaną wysokość, długi przewija swoją treść.
- Zwiń i rozwiń paletę po lewej, również przy włączonych podpisach narzędzi.
- Włącz „Sama mapa”, sprawdź pełną szerokość mapy, podpisy źródeł i powrót przyciskiem oraz klawiszem Esc.
- Uruchom `node --test tests/*.mjs` i `python3 tests/package-check.py`.

## Mapownik 18.9.3 — lokalizacje biogazowni KOWR

### Zmiany

- Warstwa KOWR pokazuje 215 instalacji z tabeli geolokalizacyjnej.
- Każdy punkt zachowuje metodę, źródło współrzędnych i odnośnik do OpenStreetMap.
- Informacja o punkcie pokazuje moce, roczną wydajność biogazu i biometanu oraz opis działalności.
- Poprawiono przypisanie dwóch instalacji IMA Polska do wpisu BGR/ARR00098/2016.
- Wykaz CSV pozostaje dostępny z panelu warstwy.
- Dodano importer skoroszytu XLSX, który sprawdza zgodność arkuszy, lokalizacje i przypisanie wpisów.

### Zakres i dokładność

Wykaz obejmuje 177 wytwórców i 215 instalacji. Współrzędne są orientacyjne:
208 punktów przypisano do kodu pocztowego, a 7 do miejscowości lub korekty
adresu. Tabela nie podaje współrzędnych działek instalacji. Punkt należy
potwierdzić przed użyciem w analizie odległości.

### Weryfikacja

- `python3 tests/kowr-data.py` — 215 punktów, źródła i metody geolokalizacji.
- `python3 tests/package-check.py` — zgodność paczki 18.9.3.
- `node --test tests/*.mjs` — 10 testów, wszystkie zaliczone.

## Mapownik 18.9.2 — identyfikacja i karta panelu

- Informacja o obiekcie pokazuje odpowiedzi z ULDK i źródeł mapowych na bieżąco,
  zamiast czekać na najwolniejsze zapytanie. Pasek postępu pokazuje liczbę
  zakończonych zapytań.
- Brak działki nie wygląda już jak trwające pobieranie pozostałych warstw.
  Współrzędne klikniętego punktu są dostępne od razu i można je skopiować.
- Każde źródło ma limit odpowiedzi 30 sekund. Błąd i treść odpowiedzi są
  widoczne przy danym źródle; wolne albo niedostępne źródło nie blokuje
  wyników pozostałych warstw.
- Sekcje wyników otwierają się automatycznie. Wiersze pokazują krótki podgląd
  znalezionych informacji, a kliknięcie rozwija pełną odpowiedź.
- API identyfikacji po pustej odpowiedzi sprawdza kolejne nazwy warstwy WMS,
  w tym warianty usługi. Zmniejsza to liczbę fałszywych komunikatów „brak danych”
  przy zmienionych nazwach technicznych.
- Prawa karta nakłada się na mapę. Mapa rozciąga się do stałej szyny ikon,
  dlatego nie ma już szarych pasów nad ani pod kartą.

### Weryfikacja

Uruchom `node --test tests/*.mjs`, `python3 tests/package-check.py`,
`python3 tests/kowr-data.py` i `python3 tests/bdot-coverage.py`.
Po wgraniu sprawdź `/api/health.php`, `/verify-deployment.php` oraz ręcznie
kliknięcie punktu w narzędziu Informacja o obiekcie na serwerze z dostępem do PHP.

## Mapownik 18.9.1 — kategoria narzędzia edycji

- „Wybierz i edytuj geometrię” znajduje się teraz w sekcji „Rysowanie”, obok
  narzędzi tworzących geometrię.
- Skrót klawiaturowy `V` pozostaje bez zmian.

Pozostałe zmiany panelu Warstw i prawej szyny są opisane w `ZMIANY_18.9.0.md`.

## Mapownik 18.9.0 — panel Warstw i układ prawej krawędzi

- Lista warstw jest krótsza: osobne bloki skrótów do aktywnych i ulubionych
  warstw zastąpiły trzy filtry Wszystkie / Aktywne / Ulubione.
- Wyszukiwarka i przycisk „Wyłącz wszystkie” mieszczą się w jednym wierszu.
- Filtry pokazują liczbę warstw. Wyszukiwanie działa w każdym filtrze, a
  pasujące grupy rozwijają się automatycznie.
- Grupy mają stałą kolejność: planowanie, granice i działki, grunty, budynki,
  uzbrojenie, infrastruktura, środowisko i dane referencyjne. Liczniki pokazują
  aktywne warstwy; nagłówki pozwalają włączyć lub wyłączyć całą grupę.
- Szyna wyboru modułu znajduje się przy skrajnym prawym boku mapy; wskazówki
  klawiszowe otwierają się w lewo.
- „Informacja o obiekcie” ma własną ikonę na szynie. Można otworzyć moduł
  wcześniej i uruchomić wskazywanie bez szukania narzędzia na mapie; po
  zamknięciu wyniku wraca poprzednio wybrany moduł.
- Instrukcja aktywnego narzędzia nie zajmuje już górnego paska. Jest dostępna
  po naciśnięciu/naprowadzeniu na ikonę informacji obok nazwy narzędzia.
- Otwarty moduł jest wyśrodkowaną kartą o wysokości do 78% obszaru roboczego
  (maksymalnie 760 px). Przy niskim oknie zwiększa wysokość, aby nie ucinać
  zawartości.

### Weryfikacja

`node --test tests/*.mjs` oraz kontrola paczki sprawdzają kontrakt filtrów,
kolejność szyny i układ karty. Dodatkowe sprawdzenie widoku przy różnych
wysokościach okna pozostaje w `DEPLOYMENT_CHECK.txt`.

## Mapownik 18.8.0 — prawy panel

- Szyna modułów pozostaje widoczna przy otwartym panelu. Kliknięcie ikony
  otwiera osobny moduł, a ponowne kliknięcie aktywnej ikony zwija panel.
- Każdy panel ma własny nagłówek z tytułem, przyciskiem odpięcia oraz
  widocznym X z opisem „Zwiń panel”. Nie trzeba szukać zamykania w menu.
- Warstwy i Obiekty nie mogą być już wyświetlone w jednym, dzielonym panelu.
  Działa przełączanie modułów, pamiętanie szerokości i odpinanie okna.
- Wcześniej zapisany podział nie jest przywracany. Pozostałe ustawienia
  paneli i migracja starszych projektów są zachowane.
- Liczniki włączonych warstw i obiektów są widoczne przy ikonach.

### Weryfikacja

`node --test tests/*.mjs` — 65 testów; kontrole paczki, KOWR i pokrycia BDOT
przechodzą. Ręczne próby panelu opisuje `DEPLOYMENT_CHECK.txt`.

## Mapownik 18.7.1 — poprawki po audycie

- Profil wysokości odpiętego okna przelicza pozycję kursora z układu SVG;
  punkt śledzący odpowiada osi przy każdej szerokości. Brakujące próbki NMT
  pozostają lukami, nie liczą się jako 0 m ani sztuczne nachylenia.
- Screening wiąże wynik z działką, wersją obiektu i promieniem, unieważnia
  go po zmianach i odrzuca spóźnione odpowiedzi. Brak kompletnych kafli BDOT
  oznacza wynik nierozstrzygający. Panel pokazuje odstęp siatki WMS.
- Brak najbliższego obiektu nie jest prezentowany jako „< 1 m”. Długie
  obliczenia można anulować, a żądania mają limit czasu.
- Eksport obrazu uwzględnia widoczne punkty KOWR. Przed wygenerowaniem
  ostrzega o pomijanych treściach; obliczenie zasięgu działa strumieniowo.
- Link do projektu można cofnąć tokenem właściciela. Magazyn udostępnionych
  plików ma ograniczenie liczby i łącznego rozmiaru.
- Listy obiektów i wyników są stronicowane. Dialogi utrzymują fokus,
  zakładki doku działają z klawiatury, a górny pasek zachowuje czytelny układ
  przy niskich oknach. Doprecyzowano opis pokrycia KOWR.

### Aktualizacja istniejącego BDOT

Po zachowaniu magazynu uruchom na serwerze `python3
tools/index_bdot_coverage.py data/bdot_buildings`. Narzędzie potwierdza
liczbę kafli przed zapisaniem indeksu; nie zastępuje odbudowy braków.

### Weryfikacja

Testy Node i Python oraz kontrole po instalacji są opisane w
`DEPLOYMENT_CHECK.txt`. Interakcje w przeglądarce i wykonanie PHP wymagają
serwera; szczególnie profil w odpiętym panelu, eksport i cofanie linku
sprawdź po wdrożeniu.

## Mapownik 18.7.0 — audyt layoutu: paleta, panele doku i jeden pasek u góry

Wydanie na bazie 18.6.0. Format pliku `.mapownik`, API serwera i katalog warstw się nie zmieniły. Zakres: punkty 1–4 audytu layoutu (plansza „Poprawki layoutu”).

### 1. Paleta narzędzi: nazwy grup nie są ucięte
- Nazwy grup („Nawigacja”, „Rysowanie”…) miały 11 px pogrubione w palecie o 64 px treści i traciły ostatnią literę. Teraz 10 px, półgrubo, bez wersalików i rozstrzelenia, jedna linia z wielokropkiem jako zabezpieczenie. Sprawdzone: żadna z 7 nazw nie ma `scrollWidth` większego niż `clientWidth`, w oknach 900 i 720 px wysokości.

### 2. Paleta narzędzi: sygnał, że jest co przewijać
- Gdy paleta jest wyższa niż mapa (okno poniżej ok. 800 px), dolna krawędź ma zanikanie i strzałkę w dół. Znika po przewinięciu do końca i w wysokich oknach. Element jest `aria-hidden` i nie przechwytuje kliknięć.
- Przycisk „pokaż/ukryj nazwy” przylega do dolnej krawędzi palety (wcześniej 4 px szczeliny, przez którą prześwitywały przewijane narzędzia) i ma pełne tło.

### 3. Jeden pasek u góry w niskich oknach
- Okna o wysokości do 780 px i szerokości od 1000 px: pasek kontekstu bez parametrów narzędzia i bez zaznaczonego obiektu (samo narzędzie z instrukcją, także w trakcie szkicu) wsuwa się do wiersza paska aplikacji, między historię a wyszukiwarkę. Nagłówek ma wtedy ok. 43 px zamiast 83 px, czyli mapa zyskuje ok. 40 px.
- Gdy narzędzie ma parametry (np. promień okręgu) albo zaznaczono obiekt, pasek dostaje własny wiersz jak dotąd — pola potrzebują szerokości. **Konsekwencja:** w niskich oknach mapa kurczy się o 40 px przy zaznaczeniu obiektu lub wyborze takiego narzędzia. W wysokich oknach układ jest bez zmian (stała wysokość z 18.0).
- Start szkicu NIE zmienia wysokości mapy (test: pozycja i wysokość mapy przed i po pierwszym kliknięciu rysowania są takie same).
- Okna węższe niż 1000 px zachowują dotychczasowy układ dwuwierszowy (elementy paska aplikacji zawijałyby się i wiersz rósłby).

### 4. Panele w doku bez wiersza z tytułem
- Panele w prawym doku z zakładkami (Warstwy, Obiekty, Analizy, Eksport) nie rysują wiersza z tytułem i podtytułem — tytuł powtarzał zakładkę tuż nad nim. Treść zaczyna się ok. 38 px wyżej.
- „Odepnij” jest teraz w menu ⋯ przy zakładkach (dla panelu u góry i, przy podziale, dla dolnego). „Zamknij” to istniejące „Zwiń dok”. Panele pływające i panele dolnego doku zachowują nagłówek z przyciskami.
- Panel **Identify (informacja o działce)** zachowuje nagłówek także w doku, bo tylko tam są „Przypnij” i „Zamknij” (znalezione w przeglądzie niezależnym). Mechanizm: parametr `keepHeader` w `PanelShell`.
- **Co znika z widoku:** podtytuły „0/28 aktywnych” (Warstwy) i „N obiektów” (Obiekty) — licznik zostaje na zakładce (znacznik). Osobne „×” dla górnego i dolnego panelu przy podziale: podział wyłącza menu ⋯, inny moduł wybiera się zakładką.

### Kod
- `app/components/FloatingTools.js` (etykiety, znacznik przewijania), `app/components/ContextBar.js` (klasy `is-idle` / `is-rich`), `app/components/TabbedDock.js` (menu Odepnij, kontekst `PanelChromeContext`), `app/ui/index.js` (`PanelChromeContext`, `keepHeader`), `app/components/IdentifyPanel.js`, `i18n/pl.js` (`dock.undock`).
- `assets/css/30-shell.css`: bloki „18.7” na końcu pliku, wewnątrz `@layer shell` (przegląd wykrył, że pierwsza wersja wypadła poza warstwę).

### Testy
Node 57/57; przeglądarka: nowy `ux185.mjs` 35/35 (paleta, dok bez nagłówka, Odepnij/Zadokuj, pasek w oknach 1280×720, 1100×700, 900×700 i 1600×900, Identify), funkcjonalne 32/32, dok (wszystkie ✔), 18.0 37/37, 18.1 13/13, 18.2 15/15, 18.3 4/4, 18.4 5/5. Starsze testy dostosowane: odczyt licznika z zakładki zamiast podtytułu, „Odepnij” przez menu ⋯, koniec testów „×” w nagłówku panelu w doku. Diagnostyka na PHP: 167 ✓ / 3 ✗ / 6 ⚠; te same 3 czerwone (legenda WMS, odporność WMS) są w 18.6.0 — wymagają zewnętrznych usług GUGiK/GDOŚ, niedostępnych w środowisku testowym. Przegląd niezależny: 2 błędy wysokie (Identify, warstwa CSS) i 3 średnie/niskie — naprawione.

Wcześniejszy zakres: `ZMIANY_18.6.0.md`, `ZMIANY_18.5.0.md`.

## Mapownik 18.6.0 — pasek kontekstu narzędzia: stabilny układ i wyraźna strefa obiektu

Wydanie na bazie 18.5.0. Format pliku `.mapownik`, API serwera i katalog warstw się nie zmieniły.

### Pasek kontekstu (dół mapy, nad paskiem stanu)

- **Koniec skakania przy zaznaczaniu.** Wcześniej instrukcja narzędzia zajmowała wolne miejsce, a pola narzędzia (np. promień okręgu), odczyt szkicu i przyciski Zakończ/Anuluj były dosunięte do prawej krawędzi strefy — przy każdym zaznaczeniu obiektu (pojawia się wtedy strefa obiektu) przesuwały się w lewo. Teraz instrukcja stoi na końcu strefy narzędzia i wypełnia resztę miejsca, a wszystko przed nią trzyma stałe miejsce od lewej. Pomiar: pole promienia okręgu stało wcześniej na 1456 px bez obiektu i 709 px z obiektem, teraz 261 px w obu przypadkach.
- **Wyraźniejsza strefa zaznaczonego obiektu.** Cienka kreska, która ginęła na tle paska, zastąpiona akcentowym paskiem z lewej i własnym tłem (kafelek), etykieta „Zaznaczony” w kolorze akcentu. Strefa trzyma się prawej krawędzi paska.
- Przyciski „Zakończ” i „Anuluj” były już widoczne wcześniej (nie tylko skróty Enter/Esc) — bez zmian. Priorytety miejsca na wąskim oknie (instrukcja skraca się pierwsza, pola obiektu przewijają się) też już były w 18.0 — bez zmian.

### Kod

- `app/components/ContextBar.js`: kolejność elementów strefy narzędzia (instrukcja na końcu).
- `assets/css/30-shell.css`: `.context-zone--object` (tło, akcentowy pasek, `margin-left: auto`), `.context-object-label`.

### Testy

Node 57/57; przeglądarka: funkcjonalne 32/32, dok (wszystkie ✔), 18.0 37/37, 18.1 13/13, 18.2 15/15, 18.3 4/4, nowy `ux184.mjs` 5/5 (na starym pakiecie 18.5.0 test poprawnie się wywala). Diagnostyka 165 ✓ / 7 ✗ / 4 ⚠ — jak w 18.5.0 (braki usług zewnętrznych w środowisku testowym). Przegląd niezależny pominięty — zmiana to kilka reguł CSS i przestawienie jednego elementu.

Wcześniejszy zakres: `ZMIANY_18.5.0.md`, `ZMIANY_18.4.0.md`.

## Mapownik 18.5.0 — zakładki prawego doku: klik w aktywną zwija dok, koniec automatycznego podziału

Wydanie na bazie 18.4.0. Format pliku `.mapownik`, API serwera i katalog warstw się nie zmieniły. Projekty i ustawienia z 17.x–18.4 działają bez zmian.

### Prawy dok (Warstwy / Obiekty / Analizy / Eksport)

Dwie zmiany w sposobie przełączania modułów, obie na wyraźną prośbę — bez zmian w treści czy działaniu samych paneli.

- **Klik w już aktywną zakładkę zwija dok.** Wcześniej nic się nie działo. Teraz zachowuje się jak przycisk „Zwiń dok” w menu ⋯ albo klik w podświetloną ikonę na szynie: dok znika, mapa zyskuje jego szerokość. Działa też wtedy, gdy w danym momencie widoczny jest podział na dwa moduły — zwija się cały dok, nie tylko górna część.
- **Bez automatycznego podziału.** Dok domyślnie pokazuje jeden moduł naraz (Warstwy przy starcie). Wcześniej otwarcie modułu ze zwiniętego doku albo z innej zakładki czasem automatycznie dokładało nad/pod nim drugi moduł (najczęściej Obiekty pod Warstwami) — to sam się teraz nie dzieje. Podział dwóch modułów naraz nadal istnieje i działa dokładnie tak jak wcześniej (przeciąganie uchwytu, zapamiętywanie proporcji, odpinanie/dokowanie modułu z dolnej części) — włącza go już tylko świadomy wybór w menu ⋯ → „Pokaż … pod spodem”. Raz włączony podział zostaje zapamiętany (tak jak wcześniej) i wraca po przełączeniu zakładek czy przeładowaniu strony, dopóki ktoś go sam nie wyłączy.

Kto miał wcześniej zapisany układ z włączonym podziałem (w przeglądarce, klucz `mapownik:workspace-v18`), może po wgraniu tej wersji nadal go widzieć — to jego własne, zapamiętane ustawienie, nie błąd. Wystarczy raz wyłączyć podział w menu ⋯ (albo wyczyścić dane strony w przeglądarce), żeby zobaczyć nowe domyślne zachowanie.

### Kod

- `store/panelsSlice.js`: domyślny stan doku prawego ma teraz `splitId: null` (wcześniej domyślnie `objects`); usunięta została funkcja pomocnicza i gałąź kodu, która przy otwieraniu modułu ze zwiniętego doku automatycznie przywracała drugi moduł podziału. Sam mechanizm podziału (`setDockSplit`, `effectiveSplitId`, zapis proporcji) się nie zmienił.
- `app/components/TabbedDock.js`: klik w zakładkę w miejscu `primary` (górna/jedyna aktywna część) dispatch'uje teraz `togglePanel(id)` zamiast nic nie robić — to ten sam reducer, którego już wcześniej używała szyna ikon (`ActivityBar`) i przycisk „Zwiń dok” w menu ⋯. Klik w zakładkę modułu dolnej części podziału (`split`) i w zakładkę odpiętą do okna (`floating`) zachowuje się bez zmian.
- `i18n/pl.js`: podpowiedź `dock.tab.primary` zmieniona z informacyjnej („— widoczny u góry doku”) na opisującą nową czynność kliknięcia („— kliknij, aby zwinąć dok”).

### Wyniki testów w środowisku testowym

- **Testy jednostkowe (Node):** 57/57 — `tests/dock-split.mjs` przepisany pod nowe domyślne zachowanie (jeden moduł na starcie, ręczne włączanie podziału, kolizja klik-w-aktywną-zakładkę vs. X na module) plus dwa nowe przypadki dla zwijania doku z włączonym podziałem.
- **`tests/package-check.py`:** OK.
- **Testy w przeglądarce:** funkcjonalne 32/32; dok 27/27 (test przepisany pod nowy domyślny stan i ręczne włączanie podziału do testów mechaniki dolnej części); obsługa 18.0: 37/37 (dodano jawne włączenie podziału na starcie skryptu, bo reszta scenariusza liczy na Warstwy+Obiekty widoczne naraz — to samo ustawienie, jakie zrobiłby użytkownik chcący obu paneli); 18.1: 13/13; 18.2: 15/15 (jw. — jawne włączenie podziału na starcie); 18.3: 4/4 (jawne otwarcie zakładki Obiekty przed sprawdzeniem listy obiektów). Bez błędów konsoli.
- **`diagnostyka.html`:** z symulowanymi WMS 165 ✓, 7 ✗, 4 ⚠ (176 razem); z prawdziwym backendem PHP ten sam zestaw. Dla porównania uruchomiłem też czysty, jeszcze niezmieniony pakiet 18.4.0 w tym samym środowisku testowym — dał dokładnie te same 7 niepowodzeń (usługi GUGiK/GDOŚ/legendy WMS niedostępne bez internetu w środowisku testowym), więc to nie są nowe problemy z tej wersji, tylko znane ograniczenie sandboksa.
- **Przegląd niezależny:** patrz sekcja niżej.

### Ograniczenia

- **Usługi zewnętrzne.** Jak w poprzednich wersjach — trzeba sprawdzić na serwerze (`/diagnostyka.html`).
- **Katalog warstw** i **komunikaty managerów o zapasowych nazwach kluczy** — jak opisano w `ZMIANY_18.3.0.md`.

Wcześniejszy zakres: `ZMIANY_18.4.0.md`, `ZMIANY_18.3.0.md`, `ZMIANY_18.2.0.md`, `ZMIANY_18.1.0.md`, `ZMIANY_18.0.0.md`.

## Mapownik 18.4.0 — paleta narzędzi zawsze na ikonach, przełącznik podkładów bliżej krawędzi

Wydanie na bazie 18.3.0. Format pliku `.mapownik`, API serwera i katalog warstw się nie zmieniły. Projekty i ustawienia z 17.x–18.3 działają bez zmian.

### Paleta narzędzi (lewa krawędź mapy)

- **Domyślnie same ikony.** Wcześniej podpisy narzędzi włączały się same na ekranach od 1440 px szerokości. Teraz paleta zawsze startuje z samymi ikonami — nazwy trzeba włączyć świadomie. Kto już wcześniej przełączył podpisy (ustawienie zapisane w przeglądarce), nie zauważy zmiany.
- **Nowy przycisk pod paletą** pokazuje i chowa nazwy narzędzi jednym kliknięciem, bez otwierania Ustawień — ta sama funkcja co polecenie „Pokaż / ukryj podpisy narzędzi” (Ctrl+K) i pozycja w menu Ustawień, tylko zawsze pod ręką. Przycisk zostaje widoczny na dole palety także wtedy, gdy lista narzędzi jest dłuższa niż wysokość mapy i paleta się przewija.
- **Przełącznik podkładów** (miniatury w lewym dolnym rogu mapy) stoi teraz bliżej lewej krawędzi — tuż obok palety, z mniejszym odstępem niż wcześniej.

### Narzędzia

- Do `i18n/pl.js` doszły 2 napisy: `tools.showLabels`, `tools.hideLabels`.
- Test katalogu tekstów (`tests/feature-contract.mjs`) przechodzi bez zmian — nowy przycisk korzysta z tych samych mechanizmów co reszta interfejsu.

### Wyniki testów w środowisku testowym

- **Testy jednostkowe (Node):** 53/53.
- **`tests/package-check.py`:** OK (przebudowany podzbiór ikon lucide-react o `PanelLeftClose`/`PanelLeftOpen`, 63 ikony razem).
- **Testy w przeglądarce:** funkcjonalne 32/32; dok 27/27; obsługa 18.0: 37/37; 18.1: 13/13; 18.2: 15/15; 18.3: 4/4. Bez błędów konsoli.
- **`diagnostyka.html`:** wynik jak w 18.2/18.3 — z symulowanymi WMS 167 ✓ i 3 ✗ (braki symulacji), z prawdziwym backendem PHP 152 ✓ i 17 ✗ (próby usług GUGiK/GDOŚ bez internetu w środowisku testowym).
- **Przegląd niezależny** sprawdził dostępność klawiaturową nowego przycisku, kolejność warstw CSS (`@layer shell` bije `@layer legacy` niezależnie od specyficzności — założenie się trzyma) i test katalogu tekstów. Wskazał, że przycisk jest dodatkowym, zawsze aktywnym przystankiem Tab wewnątrz `role="toolbar"` obok jednego przystanku reszty palety (roving tabindex) — świadome odstępstwo od wzorca ARIA toolbar, opisane komentarzem w kodzie, bo rzadka czynność „pokaż/ukryj nazwy” nie pasuje do przełączania strzałkami między narzędziami. Zgłosił też, że przy niskim oknie mapy i długiej liście narzędzi przycisk mógłby się chować pod przewijaną zawartością — poprawione (`position: sticky` trzyma przycisk na dole widocznego obszaru palety).

### Ograniczenia

- **Usługi zewnętrzne.** Usług WMS, ULDK i NMT nie dało się sprawdzić w środowisku testowym. Trzeba je sprawdzić na serwerze (`/diagnostyka.html`).
- **Katalog warstw** i **komunikaty managerów o zapasowych nazwach kluczy** — jak opisano w `ZMIANY_18.3.0.md`.

Wcześniejszy zakres: `ZMIANY_18.3.0.md`, `ZMIANY_18.2.0.md`, `ZMIANY_18.1.0.md`, `ZMIANY_18.0.0.md`.

## Mapownik 18.3.0 — komunikaty wszystkich modułów w katalogu tekstów

Wydanie na bazie 18.2.0. Format pliku `.mapownik`, API serwera i katalog warstw się nie zmieniły. Projekty z 17.x–18.2 otwierają się bez zmian, a projekt zapisany w 18.3 otwiera się w 18.2.

### Komunikaty modułów w katalogu

- **288 nowych napisów w `i18n/pl.js`** (razem 1180). Przeniesiono je z modułów, które działają pod interfejsem:
  - rysowanie i edycja, pomiary, bufor, droga;
  - profil i analiza terenu (NMT);
  - eksport mapy, zapis, odczyt i udostępnianie projektu, lokalna baza przeglądarki;
  - informacja o działce, pobieranie działki z ULDK, odczyt geometrii WKT;
  - walidacja topologii poligonów;
  - historia poleceń (etykiety „Cofnij: …” i „Ponów: …”);
  - źródła mapowe: wczytywanie obrazów i kafli, telemetria, wykaz KOWR;
  - silniki analiz i źródło BDOT10k;
  - domyślne przyciski okien dialogowych, nazwy stylów linii, domyślne nazwy nowych obiektów.
- **Brzmienie się nie zmieniło.** Osobny przegląd porównał wszystkie 249 zmienionych miejsc ze starym tekstem i wynik był identyczny. Jedyna świadoma zmiana to odmiana liczby obiektów w komunikatach projektu: „Zapisano projekt: 1 obiekt.”, „Wczytano …: 3 obiekty.”. Wcześniej zawsze było „obiektów”.
- **Zgodność projektów.** Teksty zapisywane w projektach (np. domyślna nazwa „Projekt lokalny”, nazwy obiektów) mają te same wartości co w 18.2.

### Test katalogu obejmuje całą aplikację

- **Zakres.** Test sprawdzał dotąd powłokę, panele i deklaracje funkcji, a teraz sprawdza każdy moduł. Zgłasza:
  - napis z polskimi znakami;
  - podpis (`title`, `label`, `confirmLabel`, `cancelLabel`, `placeholder`, `hint`, `message`, `description`);
  - komunikat błędu w kształcie zdania, także bez polskich znaków.
- **Wyjątki.** Test pomija:
  - katalog warstw `data/catalog/dataCatalog.js` (nazwy i opisy warstw to dane, nie napisy interfejsu);
  - atrapy diagnostyczne;
  - pliki kontraktu funkcji i rejestrów, których komunikaty są dla programisty (np. „narzędzie x nie ma instrukcji”);
  - 21 wierszy oznaczonych `// dev`: błędy programisty, np. „Manager został już zamknięty”.
- Nowy test sprawdza też, że komunikaty działki, topologii i liczby obiektów pochodzą z katalogu.

### Narzędzia i testy

- **Nowe testy w przeglądarce** `tools/harness/ux183.mjs`:
  - etykiety „Cofnij: Dodaj obiekt” i „Cofnij: Usuń obiekt” z katalogu;
  - komunikat „Zapisano projekt: 1 obiekt.”;
  - komunikat walidacji przy imporcie niepoprawnego GeoJSON.
- W `tools/harness/functional.mjs` test rysowania czeka chwilę po wyborze narzędzia. Wcześniej rzadko nie wyrabiał się z pierwszym kliknięciem.

### Wyniki testów w środowisku testowym

- **Testy jednostkowe (Node):** 54/54.
- **`tests/package-check.py`:** OK.
- **Testy w przeglądarce:**
  - funkcjonalne 32/32;
  - dok 27/27;
  - obsługa 18.0: 37/37;
  - 18.1: 13/13;
  - 18.2: 15/15;
  - nowe 18.3: 4/4.

  W konsoli nie było błędów ani brakujących kluczy.
- **`diagnostyka.html`:** wynik jak w 18.2:
  - z symulowanymi WMS: 167 ✓, a 3 ✗ to braki symulacji;
  - z prawdziwym backendem PHP: 152 ✓, a 17 ✗ to próby usług GUGiK i GDOŚ bez internetu.
- **Przegląd niezależny** nie znalazł błędów w przeniesionych tekstach ani w zgodności projektów. Wskazał napisy bez polskich znaków, których test nie widział. Są przeniesione, a test je teraz wykrywa.

### Ograniczenia

- **Katalog warstw** (nazwy, grupy i opisy warstw) pozostaje w `dataCatalog.js` jako dane. Tłumaczenie interfejsu na inny język wymagałoby osobnego katalogu warstw.
- **Klucze tekstów modułów** mają nazwy utworzone z pierwszych słów tekstu (np. `terrain.wybierzCoNajmniejJednaDzialke`). Są jednoznaczne, ale dłuższe niż klucze paneli.
- **Usługi zewnętrzne.** Usług WMS, ULDK i NMT nie dało się sprawdzić w środowisku testowym. Trzeba je sprawdzić na serwerze (`/diagnostyka.html`).

Wcześniejszy zakres: `ZMIANY_18.2.0.md`, `ZMIANY_18.1.0.md`, `ZMIANY_18.0.0.md`.

## Mapownik 18.2.0 — Warstwy i Obiekty na wspólnych kontrolkach, cała powłoka w katalogu tekstów, operacje analiz jako slot kontraktu funkcji

Wydanie na bazie 18.1.0. Format pliku `.mapownik`, API serwera i katalog warstw się nie zmieniły. Projekty z 17.x–18.1 otwierają się bez zmian, a projekt zapisany w 18.2 otwiera się w 18.1.

### Warstwy i Obiekty

- **Wspólna ramka i kontrolki.** Oba panele używają tej samej ramki co pozostałe panele (`PanelShell`), także w oknie odpiętym: uchwyt przeciągania i uchwyty szerokości i wysokości rysuje teraz ramka.
- **Wyszukiwanie.** Wyszukiwanie warstw i filtr obiektów to jedno pole z ikoną, własnym przyciskiem czyszczenia i czyszczeniem klawiszem Escape.
- **Warstwy:**
  - „Wyłącz wszystkie” jest zwykłym przyciskiem i jest nieaktywny, gdy nic nie jest włączone;
  - suwak krycia ma podpis „Krycie”;
  - ponowienie przy niedostępnym źródle ma podpowiedź;
  - pusta lista pokazuje opis.
- **Obiekty:**
  - lista typów ma szerokość najdłuższej opcji, więc „Wszystkie typy” nie jest ucinane;
  - pole „zaznacz wszystkie” ma nazwę dla czytnika ekranu i stan „częściowo zaznaczone”;
  - przyciski operacji grupowych są wspólnymi przyciskami z podpowiedzią.
- **Liczba mnoga po polsku:**
  - „1 element”, „3 elementy”, „5 elementów”;
  - „Usunąć 2 obiekty?”;
  - liczniki przy zakładkach doku.

  Wcześniej było „2 elementów” i „Usunąć 2 obiektów?”.
- **Zminimalizowane panele** (Warstwy, Obiekty, Analizy, Działka) mają jedną wspólną kontrolkę.
- **Porządki w CSS.** Usunięto 46 reguł starych klas tych paneli i parametrów analizy (pola wyszukiwania, paski narzędzi, suwak, wiersz błędu, pusty stan). Ich miejsce zajęły reguły kontrolek w `30-shell.css`.

### Cały interfejs w katalogu tekstów

- **Nowe napisy w katalogu.** Do `i18n/pl.js` trafiło 307 napisów (razem 892):
  - pasek stanu, komunikaty mapy i baner zapisu lokalnego;
  - wyszukiwarka miejsc i działek;
  - dok, szyna modułów i miniatury podkładów;
  - pasek górny, ekran błędu, polecenia powłoki (także słowa kluczowe palety Ctrl+K);
  - nazwy funkcji;
  - pola stylu tekstu i drogi;
  - komunikaty panelu Analiz.

  Brzmienie napisów zostało bez zmian. Jedyne różnice to formy liczby mnogiej i podpowiedź „Snap włączony … (obiekty: N)”.
- **Testy pilnujące katalogu:**
  - żaden komponent powłoki, panel ani deklaracja funkcji nie ma napisu wpisanego w kod — sprawdzane są napisy z polskimi znakami i każdy podpis `aria-label`, `title`, `placeholder` i `label`;
  - każdy klucz `t()`, `tr()` i `tn()` istnieje, a `tn()` ma formy one, few i many;
  - w katalogu nie ma nieużywanych kluczy.
- **Nowe funkcje pomocnicze:** `tn(klucz, liczba)` (liczba mnoga) i `formatNumber(liczba, miejsca)` (zapis polski).

### Operacje analiz jako slot kontraktu funkcji

- **Slot `analysisOperations`.** Podgląd danych, bufor i odległość są deklaracjami w `analysis/operations/` wpiętymi w `features/builtin/analysisFeature.js`. `AnalysisManager` nie ma już listy operacji ani kodu żadnej z nich. Nowa operacja, np. część wspólna z działką albo liczenie w siatce, to nowy plik i wpis w deklaracji, bez zmian w managerze i panelu.
- **Co deklaruje operacja:**
  - parametry (liczba z zakresem i jednostką albo lista z opisem opcji);
  - czy wymaga pełnej geometrii;
  - zapas pobierania danych;
  - `run()`;
  - wiersze i ostrzeżenia wyniku;
  - podpisy przycisków;
  - zapis do projektu.

  Panel Analiz rysuje to wszystko z deklaracji.
- **Zapis danych operacji.** Pola, których nie zna schemat zapisu projektu, trafiają automatycznie do `properties.features['<id funkcji>']`, więc nie giną przy zapisie. Pola bazowe analizy (źródło, data, obszar) mają pierwszeństwo przed polami operacji.
- **Naprawiony zapis linii odległości.** „Zapisz linię odległości” szukało linii wśród pobranych budynków zamiast w wyniku analizy. W 18.1 kończyło się to zawsze komunikatem „Najbliższy obiekt przecina…”, a teraz zapisuje „Najkrótsza odległość … m”.
- Nazwy, style i właściwości zapisywanych obiektów są takie jak w 18.1. Sprawdził to niezależny przegląd na 17 scenariuszach, porównując obie wersje obok siebie.

### Narzędzia i testy

- **Nowe testy w przeglądarce** `tools/harness/ux182.mjs` (15 sprawdzeń):
  - operacje z deklaracji: lista, parametry, wynik i zapis bufora, odległości i podglądu;
  - blokada operacji dla źródeł screeningu;
  - liczba mnoga, filtr obiektów i Escape, stan „częściowo zaznaczone”;
  - czyszczenie wyszukiwania warstw.
- **Diagnostyka.** Testy tekstów czytają katalog. Testy managera analiz rejestrują operacje z deklaracji tak jak runtime.

### Wyniki testów w środowisku testowym

- **Testy jednostkowe (Node):** 53/53. Nowe obejmują:
  - brak napisów poza katalogiem i nieużywanych kluczy, liczbę mnogą;
  - operacje analiz: kolejność, parametry, zakres i przycinanie, odległość z zapasem, zapis;
  - nową operację bez zmian w managerze;
  - przejście danych operacji przez schemat zapisu.
- **`tests/package-check.py`:** OK.
- **Testy w przeglądarce:**
  - funkcjonalne 32/32;
  - dok 27/27;
  - obsługa 18.0: 37/37;
  - 18.1: 13/13;
  - nowe 18.2: 15/15.

  W konsoli nie było błędów.
- **`diagnostyka.html`** (176 testów):
  - z symulowanymi WMS: 167 ✓ i 3 ✗ z braków symulacji;
  - z prawdziwym backendem PHP: 152 ✓, a wszystkie 17 ✗ to próby usług GUGiK i GDOŚ, niedostępnych bez internetu.

  Wynik jest taki sam jak w 18.1.
- **Przegląd niezależny.** Osobny przegląd porównał 18.1 i 18.2 w Node i w przeglądarce, w obu motywach. Nie znalazł regresji. Jego trzy mniejsze uwagi są poprawione i mają testy:
  - dane nowej operacji ginęły przy zapisie;
  - suwak krycia był węższy;
  - jeden podpis w doku nie był w katalogu.

### Ograniczenia

- **Komunikaty managerów.** Część komunikatów błędów zostaje w kodzie managerów: rysowania, profilu terenu, eksportu, zapisu projektu i informacji o działce (około stu napisów). Managera analiz już to nie dotyczy. Test katalogu obejmuje powłokę, panele i deklaracje funkcji, a managery przejdą na katalog w kolejnym kroku.
- **Usługi zewnętrzne.** Usług WMS, ULDK i NMT nie dało się sprawdzić w środowisku testowym. Trzeba je sprawdzić na serwerze (`/diagnostyka.html`).

Wcześniejszy zakres: `ZMIANY_18.1.0.md`, `ZMIANY_18.0.0.md`, `ZMIANY_17.8.13.md`.

## Mapownik 18.1.0 — starsze panele na wspólnych kontrolkach, kontrakt funkcji dla paneli, eksportu, analiz i ustawień

Wydanie na bazie 18.0.0. Format pliku `.mapownik`, API serwera i katalog warstw się nie zmieniły. Projekty z 17.x i 18.0 otwierają się bez zmian, a projekt zapisany w 18.1 otwiera się w 18.0.

### Jednolity wygląd paneli

- **Nowe kontrolki.** Na wspólne kontrolki z `app/ui/` przeszły panele:
  - Analizy, Wyniki analizy, Eksport i Profil terenu,
  - zakładka Działka i Stan źródeł.

  Pola, przyciski, komunikaty, zakładki i zestawienia mają te same wysokości, rozmiary tekstu i kolory co pasek kontekstu i menu z 18.0. W polach etykieta stoi po lewej, a wartość po prawej.
- **Katalog tekstów.** Wszystkie napisy tych paneli są w katalogu `i18n/pl.js`: 394 nowe klucze, razem 585. Brzmienie napisów się nie zmieniło.
- **Zakładki.** Działają jednakowo w każdym miejscu:
  - Analizy: „Screening działki” i „Analiza źródła”;
  - Profil terenu: działki i prostokąt;
  - Stan źródeł: aktywne i wszystkie.

  Między zakładkami przechodzi się strzałkami, Home i End. Czytnik ekranu wie, którą treść pokazuje dana zakładka.
- **Pola liczbowe w Analizach i Eksporcie** działają jak w pasku kontekstu:
  - strzałki góra i dół zmieniają wartość o krok;
  - liczba spoza zakresu jest po Enter albo po wyjściu z pola przycinana do granicy, np. limit 6000 zmienia się w 5000;
  - Escape przywraca wartość sprzed edycji;
  - czytnik ekranu dostaje nazwę pola z jednostką i zakres wartości.
- **Eksport:**
  - pod „Obrazem mapy” są sekcje formatów: „Projekt Mapownika” i „GeoJSON”;
  - „Układ eksportu” stoi nad „Eksportuj GeoJSON”, a „Sposób importu” nad „Importuj GeoJSON”;
  - plan eksportu (wymiary, MP, rozmiar pliku) nie jest odczytywany na głos po każdej zmianie opcji.
- **Wyniki analizy** mają filtr i przycisk CSV w pasku nad tabelą oraz opis pustego stanu.
- **Profil terenu** pokazuje statystyki linii i powierzchni jako kafelki.
- **Stan źródeł** ma przycisk „Ponów błędy” i ponowienie przy pojedynczym źródle.
- **Menu Ustawienia.** Pozycje z zaznaczeniem (podpisy narzędzi, układ kompaktowy i nowe ustawienia) czytnik ekranu odczytuje jako pola wyboru ze stanem.
- **Porządki w CSS.** Usunięto 167 reguł, których nie używa już żaden element. Były to style starych paneli w arkuszach `2x-legacy-*.css`. Kolory nadal pochodzą wyłącznie z tokenów.

### Nowe ustawienie

- **Ustawienia → Praca → „Pytaj przed usunięciem obiektu”** (domyślnie wyłączone).
  - Po włączeniu Delete i kosz w panelu Obiekty pytają o potwierdzenie.
  - Bez tego ustawienia usuwanie działa jak w 18.0: od razu, z powiadomieniem „Cofnij”.
  - Ustawienie jest zapamiętywane w przeglądarce.

### Kontrakt funkcji: panele, formaty eksportu, źródła analiz, ustawienia

Etap 3 audytu obejmował narzędzia, polecenia i paski. Teraz obejmuje także panele, eksport, analizy i ustawienia. Dodanie panelu albo formatu eksportu to plik funkcji i komponent, bez zmian we wspólnych plikach.

- **Slot `panels`.** Siedem paneli jest zadeklarowanych w funkcjach: Warstwy, Obiekty, Działka, Analizy, Wyniki analizy, Profil terenu i Eksport.
  - Stan doku (`PANEL_DEFS`) i rejestr komponentów wyliczają się z deklaracji. Nie trzeba już dopisywać panelu w `store/panelsSlice.js` i `registerBuiltInPanels.js`.
  - Komponent ładuje się przez `load()`, a pobieranie rusza przy starcie (moduły są też w `modulepreload`), więc pierwsze otwarcie panelu nie czeka na sieć.
- **Błąd jednego panelu zostaje w tym panelu.** Nieudane pobranie modułu albo wyjątek w komponencie pokazuje w panelu komunikat z przyciskami „Spróbuj ponownie” i „Odśwież stronę”. Mapa i pozostałe panele działają dalej.
- **Slot `exportFormats`.**
  - „Projekt Mapownika” (zapisz, otwórz, udostępnij link) i „GeoJSON” (eksport, import) są zadeklarowane w `features/builtin/exportFeature.js`.
  - Panel Eksport rysuje sekcję z opcji i akcji deklaracji. Nowy format (np. KML, DXF) to jeden wpis.
  - Potwierdzenia przy otwieraniu projektu i imporcie „zastąp” zostały bez zmian.
- **Slot `analysisSources`.**
  - Dziewięć źródeł danych jest zadeklarowanych w `features/builtin/analysisFeature.js`: dwa z lokalnej bazy BDOT10k i siedem źródeł screeningu WMS.
  - `AnalysisManager` nie ma już listy źródeł wpisanej w kod.
  - Zakładka „Screening działki” bierze źródła oznaczone `screening: true`, w kolejności deklaracji. Nowe źródło WMS to jeden wpis z kluczem z katalogu serwera.
- **Slot `settings`.**
  - Przełączniki zadeklarowane przez funkcje pojawiają się w menu Ustawienia → „Praca”, a funkcja czyta je przez `ctx.settings.get(id)`.
  - Gdy przeglądarka blokuje dane witryny, ustawienia działają do końca sesji, a aplikacja startuje normalnie.
- **Wspólne pliki i okna.**
  - Zapis i odczyt plików: `downloadText` i `readTextFile` z `core/files`, z limitem 25 MB dla importu.
  - Pytania do użytkownika: `appDialogs`.
- **Przewodnik** `JAK_DODAC_FUNKCJE.md` ma nowe sloty, przykład panelu, formatu eksportu, źródła analizy i ustawienia oraz listę kontrolek paneli.

### Narzędzia

- `tools/bump_version.py` nie zmienia już numerów w nazwach testów diagnostyki („17.8 — …”). Numer w nazwie mówi, od której wersji test istnieje.
- W `diagnostyka.html` testy paneli sprawdzają napisy także przez katalog tekstów. Test źródeł analiz czyta deklarację funkcji i sprawdza klucze w katalogu serwera.
- Nowe testy w przeglądarce, `tools/harness/ux181.mjs` (13 sprawdzeń):
  - pola liczbowe, zakładki i formaty eksportu;
  - ustawienia z deklaracji;
  - błąd jednego panelu;
  - start przy zablokowanej pamięci przeglądarki.

### Wyniki testów w środowisku testowym

- **Testy jednostkowe (Node):** 46/46. Nowe obejmują walidację slotów, panele z deklaracji, ustawienia (także przy zablokowanej pamięci), źródła screeningu, opcje przypięte do akcji eksportu i Delete z potwierdzeniem.
- **`tests/package-check.py`:** OK, 94 tokeny CSS i 7 paneli. Każdy `load()` wskazuje istniejący plik z właściwym eksportem.
- **Testy w przeglądarce:**
  - funkcjonalne 32/32;
  - dok 27/27;
  - obsługa 18.0: 37/37;
  - nowe testy 18.1: 13/13.

  W konsoli nie było błędów.
- **`diagnostyka.html`** (176 testów):
  - z symulowanymi usługami WMS: 167 ✓ i 3 ✗. Te 3 to artefakty symulacji (legenda i wymiar obrazu, których atrapa nie zwraca);
  - z prawdziwym backendem PHP: 152 ✓. Wszystkie 17 ✗ to próby usług GUGiK/GDOŚ, niedostępnych bez internetu w środowisku testowym. Trzeba je sprawdzić na serwerze.
- **Przegląd niezależny.** Zmiany 18.1 sprawdził osobny przegląd kodu i zachowania w porównaniu z 18.0. Wszystkie jego uwagi są poprawione i mają testy:
  - start przy zablokowanej pamięci;
  - przycinanie liczb;
  - błąd panelu;
  - screening z deklaracji;
  - miejsca po przecinku w odległościach;
  - dostępność pól i zakładek;
  - kolejność opcji GeoJSON.

### Ograniczenia

- **Warstwy i Obiekty.** Oba panele są już zadeklarowane w funkcjach, ale ich wnętrze ma jeszcze część napisów w komponentach i starsze klasy. To kolejny etap.
- **Operacje analizy.** Podgląd, bufor i odległość pozostają w `AnalysisManager`. Slot `analysisSources` dodaje źródła danych, a nie nowe rodzaje operacji.
- **„Spróbuj ponownie” w Chromium** nie pomaga po nieudanym pobraniu modułu panelu, bo przeglądarka pamięta błąd do przeładowania. Komunikat proponuje wtedy „Odśwież stronę”.
- **Usługi zewnętrzne.** Usług WMS, ULDK i NMT nie dało się sprawdzić w środowisku testowym. Trzeba je sprawdzić na serwerze (`/diagnostyka.html`).

Wcześniejszy zakres: `ZMIANY_18.0.0.md`, `ZMIANY_17.8.13.md`, `ZMIANY_17.8.12.md`, `ZMIANY_17.8.11.md`.

## Mapownik 18.0.0 — wdrożenie rekomendacji audytu ergonomii (etapy 1–3)

Wydanie na bazie 17.8.13 (etap 0). Katalog warstw, API serwera i format pliku `.mapownik` pozostają zgodne wstecz: projekty z 17.x otwierają się bez zmian, a projekt zapisany w 18.0 otwiera się w 17.8.x (nowe pole `properties.features` zostanie tam pominięte).

### Czytelność (etap 1)

- **Skala tekstu.** Sześć rozmiarów (11, 12, 13, 14, 16 i 18 px) zamiast 19. Wszystkie rozmiary w CSS pochodzą z tokenów `--fs-*`. W 19 zmierzonych stanach interfejsu nie ma napisu mniejszego niż 11 px (w 17.8.12 było ich ok. 70%).
- **Hierarchia.** Nazwy grup warstw i narzędzi zwykłą pisownią zamiast wersalików. Nazwy warstw i obiektów pisane są zwykłą grubością, a pogrubione są tylko włączone warstwy i zaznaczony obiekt.
- **Kontrast.** W jasnym motywie akcent, ostrzeżenie i kolor „działa” są o stopień ciemniejsze (`#1d4ed8`, `#92400e`, `#166534`). Placeholdery i tekst drugorzędny mają kolor z tokenu zamiast przezroczystości. W zmierzonych stanach żaden napis nie ma kontrastu poniżej 4,5:1, w żadnym z motywów. W 17.8.12 takich napisów było 32% w jasnym motywie i 5% w ciemnym.
- **Cele kliknięć.** Wiersze list mają 32 px, przyciski ikon 28 px, pola 28 px, a pasek stanu 26 px z tekstem 12 px. Nagłówki grup, przyciski kopiowania, miniatury i pola wyszukiwania mają co najmniej 24 px. Celów poniżej 24 px jest 17% zamiast 31%. Pozostały pola wyboru 16 px w wierszach 32 px oraz linki atrybucji, które są tekstem ciągłym (wyjątki kryterium WCAG 2.5.8).
- **Kolory na mapie.** Zaznaczenie nie zmienia już koloru obiektu: dostaje ciemną obwódkę z białym wnętrzem i uchwyty wierzchołków. Domyślny kolor obiektów to magenta (`#db2777`), inna niż niebieski akcent interfejsu i nakładki WMS. Pomiary są grafitowe z białą obwiednią i zawsze przerywane. Barwy mapy są w jednym pliku: `core/object/mapStyleTokens.js`.
- **Tokeny.** W CSS nie ma już ani jednego koloru wpisanego na sztywno poza `10-tokens.css` (było 185). Pilnuje tego `tests/package-check.py`.

### Obsługa (etap 2)

- **Pasek kontekstu** pod paskiem górnym ma stałą wysokość, więc mapa i dok już nie przeskakują o 43 px przy zaznaczaniu.
  - Po lewej: aktywne narzędzie, jedno zdanie instrukcji (zmienia się w trakcie rysowania) i parametry narzędzia (promień okręgu, odległość bufora, szerokość drogi).
  - W trakcie rysowania: bieżąca długość, powierzchnia (m² i ha) i obwód oraz przyciski **Zakończ** i **Anuluj**.
  - Po prawej: styl zaznaczonego obiektu, każde pole z etykietą (Kolor, Linia, Grubość, Krycie, Wypełnienie, Obrót). Przy wąskim oknie jako pierwsza skraca się instrukcja.
- **Paleta narzędzi z podpisami** (Ustawienia → „Podpisy narzędzi w palecie”, domyślnie włączone od 1440 px): ikona, krótka nazwa i klawisz skrótu.
  - Nowe grupy: Nawigacja, Działki, Rysowanie, Pomiary, Teren, Drogi, Opisy.
  - Nowe ikony dla edycji geometrii, bufora, analizy wysokości i pobierania działki.
  - Paleta jest jednym przystankiem tabulatora, a między narzędziami przechodzi się strzałkami, Home i End (wcześniej 18 przystanków).
- **Paleta poleceń Ctrl+K** zbiera wszystkie narzędzia, polecenia i panele. Wyszukiwanie działa także bez polskich znaków („bufor”, „dzialka”).
- **Nowe skróty:** „?” pokazuje ekran skrótów, „/” przenosi do wyszukiwarki, a Ctrl+\ zwija i rozwija dok. Podczas rysowania Backspace cofa ostatni punkt, a Enter kończy szkic.
- **Wyniki zawsze w doku albo w dolnym panelu.** Szczegóły działki otwierają się jako zakładka „Działka” w prawym doku zamiast okna nachodzącego na paletę. Zakładka zostaje po przejściu na inny moduł, a każdy nowy wynik wraca na wierzch. Po zamknięciu zakładki dok wraca do poprzedniego modułu.
- **Dok.** Zakładki mają szerokość zależną od treści, bez przeskakiwania. Przy pięciu zakładkach nieaktywne pokazują ikonę z licznikiem. Przełączniki podziału i zwijania są w menu ⋯. Nagłówek panelu w doku nie powtarza już nazwy zakładki.
- **Warstwy:**
  - widoczność przełącza się polem wyboru, tym samym co przy grupie, albo kliknięciem nazwy;
  - na górze listy jest sekcja „Włączone” z możliwością wyłączenia warstwy jednym kliknięciem;
  - legenda stref planistycznych stoi pod swoją warstwą;
  - znacznik stanu pojawia się tylko przy problemie;
  - „Ulubione” i „Pokaż tylko tę warstwę” są w menu ⋯ wiersza.
- **Obiekty.** Pomiary są w osobnej, zwijanej grupie „Pomiary” z przyciskiem „Wyczyść pomiary” i nie są obiektem analizy. Pojedyncze usunięcie działa bez okna potwierdzenia, a zamiast okna pojawia się powiadomienie „Usunięto … · Cofnij”, także po klawiszu Delete. Potwierdzenie zostało przy usuwaniu wielu obiektów naraz.
- **„Cofnij” w powiadomieniu** cofa tylko operację, którą opisuje. Po Ctrl+Z albo kolejnej zmianie powiadomienie znika.
- **Pola liczbowe** (promień, odległość bufora, grubość, obrót) nie poprawiają wartości w trakcie pisania. Wartość jest przyjmowana, gdy mieści się w zakresie; strzałki góra/dół zmieniają ją o krok.
- **Okna i menu:** paleta poleceń i ekran skrótów trzymają fokus w sobie (Tab nie ucieka pod tło), a Ctrl+K nie otwiera palety pod oknem potwierdzenia. Menu prawego przycisku przy krawędzi ekranu przesuwa się tak, żeby wszystkie pozycje były widoczne.
- **Komunikaty.** Błąd profilu terenu to jedno zdanie po ludzku z przyciskiem „Ponów”. Tekst techniczny jest pod rozwinięciem „Szczegóły techniczne”.
- **Menu Ustawienia** (ikona w pasku górnym) zastępuje menu Widok. Zawiera motyw, podpisy narzędzi, układ kompaktowy (wiersze i pola o 4 px niższe, tekst bez zmian), paletę poleceń, skróty i przywrócenie układu paneli. Ustawienia widoku są zapamiętywane w przeglądarce.
- **Pasek stanu** ma krótkie etykiety przy wartościach: „Układ EPSG:2180”, „Zoom 14,2”, „Warstwy 5/6”.
- **Menu prawego przycisku** ma nowe pozycje: „Informacja o działce w tym miejscu” oraz kopiowanie współrzędnych WGS84 i EPSG:2180. Obsługuje strzałki i Escape.

### Struktura pod nowe funkcje (etap 3)

- **Kontrakt funkcji** (`features/defineFeature.js`, `features/FeatureRegistry.js`). Funkcja deklaruje serwisy, tryb interakcji, narzędzia, polecenia, pozycje paska stanu, menu mapy i pola obiektu. Przewodnik z przykładem: `JAK_DODAC_FUNKCJE.md`.
- **Przeniesione funkcje:** rdzeń (cofnij/ponów, Delete, Esc, menu mapy), rysowanie i edycja, pomiary, bufor, informacja o działce, teren i styl obiektów. Bufor był wpięty w 15 plików. Teraz to 2 pliki (`bufferFeature.js`, `BufferManager.js`) i jedna linia w `features/index.js`.
- **Jeden rejestr poleceń i skrótów** (`keyboard/CommandRegistry.js`, `KeyboardService.js`). Jeden wspólny nasłuch klawiatury zastępuje osobne nasłuchy narzędzi, historii, Delete i Escape. Konflikt skrótów to błąd przy starcie, a wspólne zabezpieczenia obejmują pola tekstowe, otwarte okna oraz spację na przyciskach.
- **Rejestr trybów interakcji** zastąpił trzy listy wpisane na sztywno (koordynator narzędzi, identyfikacja, Escape).
- **Katalog tekstów** `i18n/pl.js` obejmuje nazwy, instrukcje i opisy narzędzi, grupy, polecenia, pasek kontekstu, pasek stanu, menu, dok i komunikaty. Starsze panele (Analizy, Eksport, szczegóły działki) mają jeszcze teksty w komponentach i będą przenoszone stopniowo.
- **Biblioteka kontrolek** `app/ui/`: Button, NumberField, SelectField, TextField, ColorField, Badge, Kbd, ModalShell. Nowe części interfejsu (pasek kontekstu, paleta, skróty, powiadomienia, menu ustawień) używają tylko jej. Starsze panele przechodzą na nią stopniowo.
- **Zapis projektu:**
  - jedna lista rodzajów obiektów (`core/object/objectKinds.js`); import GeoJSON zna teraz także wyniki analiz (wcześniej zamieniał je na zwykłą geometrię);
  - funkcje trzymają własne dane obiektu w `properties.features['<id>']`, a schemat zapisu ich nie usuwa.
- **Testy, które pilnują struktury:**
  - `tests/feature-contract.mjs` (13 testów, w tym „Cofnij” związane z własną operacją): skróty bez konfliktów, instrukcja i ikona każdego narzędzia, pasma kolejności grup, rejestry, klawiatura, Delete z Cofnij, miary szkicu, katalog tekstów i zapis danych funkcji;
  - `package-check.py` sprawdza tokeny CSS, kolory poza tokenami i rejestrację paneli;
  - diagnostyka liczy narzędzia z rejestru funkcji, bez „18” wpisanego na sztywno.

### Wyniki testów w środowisku testowym

- Testy jednostkowe (Node): 39/39.
- Testy funkcjonalne w przeglądarce: 32/32.
- Testy doku: 27/27.
- Nowe testy obsługi 18.0: 37/37. Obejmują paletę poleceń, skróty, pasek kontekstu, pola liczbowe, Cofnij, grupę Pomiary, sekcję Włączone, klawiaturę w palecie, ustawienia, fokus w oknach, zakładkę Działka i menu PPM.
- `diagnostyka.html`: 176 testów, bez czerwonych testów niezależnych od sieci.
  - Próby usług WMS GUGiK/GDOŚ, ULDK i NMT wymagają internetu. W środowisku testowym były symulowane albo niedostępne i trzeba je sprawdzić na serwerze.
  - Barwy mapy dobierano na kaflach syntetycznych, więc warto je obejrzeć na prawdziwej ortofotomapie i planach.

Wcześniejszy zakres: `ZMIANY_17.8.13.md`, `ZMIANY_17.8.12.md`, `ZMIANY_17.8.11.md`.

## Mapownik 17.8.13 — naprawy z audytu ergonomii (etap 0)

Wydanie poprawkowe na bazie 17.8.12. Nie zmienia układu, katalogu warstw, API ani formatu pliku projektu.

### Czytelność w ciemnym motywie

- Menu prawego przycisku na mapie (Google Maps, Street View, Geoportal) miało jasny tekst na białym tle (kontrast 1,04:1). Teraz ma tło motywu.
- Odpięty panel Analiz miał biały nagłówek z niewidocznym tytułem i aktywną zakładką. Teraz ma tło motywu.
- Przyczyną było 7 nazw kolorów używanych w starszych plikach CSS, ale nigdzie niezdefiniowanych (`--panel-bg`, `--panel-border`, `--border-soft`, `--hover-bg`, `--muted-text`, `--shadow-panel`, `--danger`). Są teraz zdefiniowane w `10-tokens.css` jako aliasy właściwych kolorów. Przy okazji wróciły obramowania w panelach Warstw, Stanu źródeł i profilu terenu.
- Panel Stan źródeł nie miał tła w żadnym motywie, więc lista źródeł rysowała się na mapie. Ma teraz tło, obramowanie i cień.
- Do tokenów doszły kolory statusu (`--success`, `--warning`, `--danger`, `--info`) dla obu motywów, z kontrastem co najmniej 4,5:1 na tle panelu.

### Pasek stanu i paleta

- Pasek stanu pokazuje nazwę aktywnego narzędzia po polsku, np. „Informacja o działce”, „Bufor wokół obiektu”, „Przesuwanie”. Wcześniej stało tam angielskie „Pan”, także przy innych narzędziach. Podpowiedź po najechaniu podaje opis narzędzia.
- Paleta narzędzi kończy się nad paskiem stanu. Przy 1280×720 wchodziła na niego o 14 px zawsze, przy 1366×768 po zaznaczeniu obiektu.

### Fokus klawiatury

- Pola „Szukaj warstwy” i „Filtruj obiekty” pokazują fokus obramowaniem (wcześniej nie zmieniały wyglądu).
- Miniatury podkładów mają wyraźny pierścień fokusu zamiast ledwo widocznego.

### Diagnostyka

Od 17.8.11 diagnostyka wykonuje wszystkie 176 testów, a nie tylko pierwsze cztery. W 17.8.12 nie przechodziło 14 testów niezależnych od sieci. 12 z nich nie przechodziło już w 17.8.10, a 2 zepsuły zmiany z 17.8.11, bo szukały w kodzie dosłownych fragmentów, które się zmieniły. Żaden nie wskazywał na błąd działania aplikacji, tylko na nieaktualny test. W opisach 17.8.11 i 17.8.12 błędnie podałem, że poza ULDK wszystkie testy przechodzą. Testy są poprawione:

- sprawdzają obecny kod: ikony z `tablerIcons.js`, wysokości paneli w `panelsPersistence.js`, podzbiór ikon lucide w `vendor/opt`, snapshot warstwy w `LayerManager.js`;
- identyfikator linku udostępniania ma teraz 32 znaki hex (starsze 10-znakowe nadal działają);
- katalog warstw ma 28 nakładek w 8 grupach; wersja katalogu ≥ 10;
- EGiB (klasy gruntów) działa tylko w EPSG:2180 i jest na liście wyjątków reprojekcji;
- audyt źródeł porównuje się z katalogiem, a nie z liczbą 31 wpisaną na sztywno;
- testy analizy przestrzennej rejestrują własnego dostawcę danych testowych;
- ULDK i profil terenu NMT są oznaczone jako usługi zewnętrzne (⚠ zamiast ✗ przy braku połączenia).

Wynik w środowisku testowym bez internetu: wszystkie testy niezależne od sieci przechodzą. Testy usług GUGiK/GDOŚ wymagają połączenia i trzeba je sprawdzić na serwerze.

### Narzędzia

- `tools/bump_version.py` zmienia numer wersji w całej paczce jednym poleceniem (katalog `app-…`, `index.html`, API, diagnostyka, `.htaccess`, testy). Komentarze historyczne w kodzie zostają.

Wcześniejszy zakres: `ZMIANY_17.8.12.md`, `ZMIANY_17.8.11.md`.

## Mapownik 17.8.12 — miniatury podkładów i dok z podziałem

Wydanie układu interfejsu na bazie 17.8.11. Zawiera wszystkie poprawki i optymalizacje 17.8.11. Nie zmienia katalogu warstw ani API serwera. Plik projektu `.mapownik` dostał dwa nowe, opcjonalne pola podziału doku.

### Podkłady jako miniatury na mapie

- W lewym dolnym rogu mapy, obok palety narzędzi, są cztery miniatury: Mapa, Topo, Orto i NMT. Podkład zmienia się jednym kliknięciem. Menu podkładów zniknęło z paska górnego.
- Każda miniatura pokazuje ten sam fragment (okolice Pelplina) w danym podkładzie. To jedno małe zapytanie na podkład, ładowane 1,2 s po starcie, żeby nie konkurować z mapą. Potem obraz zostaje w pamięci przeglądarki. Topografia i NMT idą przez `api/wms.php`, tą samą drogą co zapasowe pobieranie mapy. Gdy obraz nie przyjdzie, miniatura pokazuje zastępcze tło.
- Stan jest widoczny na miniaturze: niebieska ramka i znacznik przy aktywnym podkładzie, przerywana ramka i kółko ładowania przy przełączaniu, ostrzeżenie przy niedostępnym źródle. Zachowano dotychczasową zmianę dwufazową: poprzedni podkład zostaje, dopóki nowy się nie wczyta. Kliknięcie niedostępnego podkładu ponawia próbę.
- Strzałka zwija przełącznik do jednej miniatury, a ustawienie jest zapamiętywane w przeglądarce. Na ekranach węższych niż 1280 px przełącznik jest domyślnie zwinięty.
- W trybie zaznaczania prostokąta eksportu miniatury są schowane razem z resztą interfejsu.

### Dok z zakładkami: Warstwy i Obiekty naraz

- Prawy dok ma u góry zakładki Warstwy, Obiekty, Analizy i Eksport. Zastępują one szynę ikon, więc mapa jest o 46 px szersza. Widoczne moduły mają nazwę i licznik (włączone nakładki, liczba obiektów), pozostałe są ikoną z podpowiedzią.
- **Domyślnie Warstwy są u góry, a Obiekty pod nimi — oba panele widać jednocześnie.** Narysowany obiekt pojawia się od razu na liście, bez przełączania paneli.
- Zakładka Analizy albo Eksport zajmuje górną część, a Obiekty zostają pod spodem.
- Uchwyt między panelami zmienia podział: przeciąganiem albo klawiaturą (strzałki, Home/End, Enter przywraca 58/42). Proporcja jest zapamiętywana w przeglądarce i w pliku projektu.
- Przycisk w pasku zakładek włącza i wyłącza podział. „X” w dolnym panelu wyłącza podział, a „X” w górnym oddaje cały dok dolnemu panelowi.
- Przycisk „Zwiń dok” chowa dok. Na jego miejscu wraca wąska szyna ikon, a kliknięcie ikony przywraca dok razem z podziałem.
- Odpinanie do okna działa jak wcześniej. Odpięte Obiekty znikają z dolnej części, a po zadokowaniu wracają pod Warstwy. Zakładka odpiętego modułu ma kropkę.
- „Widok → Przywróć domyślny układ paneli” przywraca też podział Warstwy + Obiekty.

### Zgodność

- Starsze projekty i zapisane układy wczytują się bez zmian: bez pól podziału obowiązuje podział domyślny. Starsza wersja aplikacji pominie nowe pola (`dockRightSplitId`, `dockRightSplitRatio`).
- Wszystkie testy paneli w `diagnostyka.html` przechodzą, także przełączanie, dokowanie i zgodność formatu `.mapownik`.

### Testy

- `tests/dock-split.mjs` (nowy, 7 testów): podział domyślny, zakładki, zamykanie części, zwijanie i powrót z szyny, odpinanie przy podziale, zakres i zapis proporcji (także dla projektów sprzed 17.8.12), opis zakładek.
- Pozostałe testy paczki przechodzą, także `package-check.py` (import map, 63 ikony w podzbiorze lucide, lista modulepreload).
- W przeglądarce (symulowane usługi mapowe): test funkcjonalny 32/32, test doku i miniatur 27/27, diagnostyka 75 testów OK. Jedyny błąd diagnostyki (ULDK) wynika z braku internetu w środowisku testowym.

Wcześniejszy zakres zmian: `ZMIANY_17.8.11.md`.

## Mapownik 17.8.11 — stabilność warstw i szybszy start

Wydanie porządkowe po pełnym teście 17.8.10. Nie zmienia katalogu warstw, formatu projektu `.mapownik` ani API serwera.

### Naprawione błędy

- **Fałszywy status „offline” warstw z progiem przybliżenia.** Włączenie np. warstw planistycznych na widoku całej Polski kończyło się po 15 s komunikatem „Źródło niedostępne”: OpenLayers poza zakresem przybliżenia nie pobiera kafli, a watchdog uznawał brak kafli za awarię. Status nie wracał po przybliżeniu, a warstwa oznaczona błędem wypadała z „Informacji o działce” (odczyt strefy po kliknięciu). Teraz warstwa czeka na wejście w zakres i dopiero wtedy mierzy czas ładowania.
- **Szybkie wyłączenie i włączenie warstwy.** Warstwa ukryta w trakcie ładowania zostawiała kafle na stałe w stanie „ładowany”. Po ponownym włączeniu miała dziury, po 15 s dostawała „offline”, a każdy taki kafel zajmował na stałe jedno z 16 miejsc kolejki pobierania OpenLayers. Mapa zwalniała z każdym przełączeniem. Warstwa ukryta przed pierwszym obrazem jest teraz zwalniana w całości. Kafli już pobieranych dla wyświetlonej warstwy nie przerywamy, a kafel przerwany z innego powodu zwalnia miejsce w kolejce.
- **Stałe „ładuje” / „Ładowanie podkładu”.** Kafle zwolnione lub przerwane w trakcie ładowania nie zmniejszały licznika pobrań w toku. Stan wraca do „OK”, gdy nic się już nie pobiera.
- **Pasek stanu przy kilku nakładkach.** Podpisy źródeł nachodziły na współrzędne i przybliżenie. Podpisy są teraz skracane wielokropkiem, a pełna lista jest w podpowiedzi.
- **Panel Analizy.** Opis, pole promienia i przycisk „Uruchom screening” rozciągały się na całą wysokość doku.
- **Diagnostyka (`diagnostyka.html`) zatrzymywała się po 4 testach** przez brakujący nawias w funkcji pomocniczej. Poprawiono też dwa nieaktualne testy: podział arkuszy CSS 21–27 i nową etykietę screeningu.
- **Eksport** używał adresu `/api/export.php` od katalogu głównego domeny. Teraz używa adresu względnego, tak jak pozostałe funkcje.

### Wydajność

- **Rejestracja układów współrzędnych.** proj4 ma 130 wbudowanych definicji, a OpenLayers tworzył transformację dla każdej pary: ok. 16 800 obiektów przy starcie. OpenLayers dostaje teraz tylko trzy używane układy: EPSG:2180, EPSG:3857 i EPSG:4326.
- **Start bez czekania na `vendor_status.php`.** Wcześniej każdy start czekał na PHP, który liczył SHA-256 z ~5 MB bibliotek. Teraz OpenLayers i moduły aplikacji ładują się od razu i równolegle, a stan bibliotek jest sprawdzany tylko wtedy, gdy start się nie uda.
- **Lista `modulepreload`.** 183 moduły są zamawiane od razu, a nie kaskadowo (moduł → importy → ich importy…). Listę generuje `tools/generate_modulepreload.py`, a `tests/package-check.py` pilnuje, żeby była aktualna.
- **Ikony.** Zamiast pełnego lucide-react (1,3 MB, ok. 1500 ikon) ładowany jest podzbiór 60 używanych ikon (20 KB, `vendor/opt/lucide-subset.js`). Każda ikona renderuje się identycznie jak w pełnym pakiecie.
- **zod i proj4** są ładowane w wersjach zminifikowanych (te same wersje, `vendor/opt`).
- **Mniej przerysowań przy przesuwaniu mapy.** Panel Warstw, pasek stanu, menu podkładów i zapis projektu odświeżały się przy każdej partii kafli każdej warstwy. Zmiany są teraz łączone (najwyżej raz na klatkę), a niezmienione wiersze warstw nie są przerysowywane.
- **Obrazy z własnego serwera nie są dekodowane dwa razy.** Wymiary pochodzą z nagłówka `X-Mapownik-Raster-Size` (serwer sprawdza obraz sam) albo z nagłówka pliku.
- **Limit pamięci kafli liczony w pikselach.** Kafle 512 px z `dpiScale 2` (plany ogólne, strefy) mogły zająć do ~2 GB. Teraz każda warstwa ma budżet ~128 MB.
- **Możliwości eksportu** są pobierane przy otwarciu panelu Eksport, a nie przy każdym starcie.
- **Kompresja w `.htaccess`** (`mod_deflate`) dla HTML, CSS, JS, JSON i CSV.

Pomiary (Chromium, symulowane łącze i procesor, mediana z 3 prób, szczegóły w raporcie z testów):

| Scenariusz | 17.8.10 | 17.8.11 |
|---|---|---|
| Mapa gotowa — laptop (30 ms, 24 Mb/s), pierwsze wejście | 3,1 s | 2,3 s |
| Mapa gotowa — laptop, ponowne wejście | 2,9 s | 2,1 s |
| Mapa gotowa — wolny sprzęt (60 ms, 8 Mb/s, CPU ×4), pierwsze wejście | 5,4 s | 3,8 s |
| Pamięć JS po starcie | 37 MB | 12 MB |
| JavaScript interfejsu podczas 40 s przesuwania mapy z 5 nakładkami | 2,2 s | 1,0 s |

### Drobne zmiany interfejsu

- „Pokaż tylko tę warstwę” ma własną ikonę. Wcześniej w wierszu były dwa „oczka” o różnych znaczeniach.
- Ukryte warstwy bez problemów nie mają znacznika stanu (zamiast kreski „—” w każdym wierszu).
- Podpowiedź narzędzia Prostokąt opisuje faktyczny sposób rysowania: dwa kliknięcia w narożniki. Przeciąganie przesuwa mapę.
- Pole numeru działki zawsze pokazuje „Nr działki…”, a przed wyborem miejscowości ma podpowiedź, zamiast uciętego „Wybierz mie…”.
- Podpisy źródeł na pasku stanu są widoczne także na laptopach 1366 px.

### Testy

- `tests/layer-runtime.mjs` (nowy): warstwa poza zakresem przybliżenia, ukrycie przed i po renderze, łączenie powiadomień, telemetria przerwanych kafli. Wszystkie 4 testy nie przechodzą na kodzie 17.8.10 i przechodzą na 17.8.11.
- `tests/package-check.py`: dodatkowo import map, komplet ikon w podzbiorze lucide i aktualność listy modulepreload.
- Pozostałe testy paczki bez zmian — przechodzą.

Wcześniejszy zakres zmian: `ZMIANY_17.8.10.md`.

## Mapownik 17.8.10 — instalacje biogazu rolniczego KOWR

- Nowa, domyślnie wyłączona warstwa „Biogazownie rolnicze (KOWR)” w grupie „Infrastruktura”. Dane są wczytywane dopiero po włączeniu warstwy; nie powoduje ona zapytań do KOWR z przeglądarki ani obciążenia API hostingu.
- Rejestr KOWR z 16.09.2026 zawiera 215 instalacji 177 wytwórców. 135 instalacji ma orientacyjny punkt ze starszych danych Mapownika, 80 pozostaje bez punktu. Wszystkie 215 są w pliku CSV dostępnym przy informacji o warstwie. Kilka instalacji w tym samym miejscu można rozwinąć po kliknięciu punktu.
- Punkty nie zostały opublikowane jako współrzędne przez KOWR. Mogą odpowiadać adresowi pocztowemu; nie ustalono dokładności 5 km. W interfejsie są oznaczone jako orientacyjne; brak punktu nie oznacza braku instalacji.
- Offline importer PDF w `tools/import_kowr.py` pozwala aktualizować rejestr na Windows przez `tools/KOWR_AKTUALIZUJ.bat`. Podczas błędu odczytu PDF zachowuje poprzednią wersję plików. Instrukcje są w `data/kowr/README.txt`.
- Reguły Apache udostępniają publicznie tylko `installations.json` i `installations.csv` z katalogu `data/kowr`; PDF i pomocnicza tabela współrzędnych nie są publicznie serwowane przez `.htaccess`.

### Weryfikacja

Przeprowadzono test spójności paczki i importów JS, test panelu warstw, kontrolę składni adaptera i ponowny import PDF. Sprawdzono 215 różnych identyfikatorów instalacji, 177 wpisów w rejestrze, 135 orientacyjnych współrzędnych i 80 rekordów bez współrzędnych. Zachowanie mapy i uprawnienia Apache wymagają sprawdzenia po wgraniu na docelowy hosting.

Wcześniejszy zakres zmian znajduje się w `ZMIANY_17.8.9.md`.

## Mapownik 17.8.10

### Poprawka wyglądu grup

- Nagłówki grup mają tło takie jak panel warstw w jasnym i ciemnym motywie. Przycisk rozwijania nie korzysta już z domyślnego ciemnoszarego tła przeglądarki.
- Każda grupa ma checkbox zbiorczy. Zaznaczenie włącza wszystkie warstwy w grupie, ponowne kliknięcie wyłącza je; częściowy wybór jest oznaczony kreską. Zachowano indywidualne przełączniki i dotychczasowe progi przybliżenia.

### Panel warstw i szczegóły działki

- Kompaktowa lista warstw: opisy, źródło, nazwa usługi, regulacja krycia i legenda pozostałych warstw są w rozwijanej informacji. Sekcja „Ostatnio używane” została usunięta; Ulubione zachowują dotychczasowy zapis lokalny. Grupy są domyślnie zwinięte poza „Granice i działki”; rozwinięcie zapisuje się w przeglądarce.
- Wszystkie grupy mają wspólny przełącznik z widocznym stanem częściowym, zachowując indywidualne przełączniki. Warstwy korzystają z istniejącego mechanizmu i swoich dotychczasowych progów przybliżenia.
- Mapa glebowo-rolnicza została wycofana z interfejsu oraz z automatycznego screeningu. Serwerowe źródło danych pozostaje dostępne. „Klasy gruntów ornych (EGiB)” są w grupie „Grunty”.
- Strefy planistyczne korzystają z kolorowego obrazu i legendy oficjalnej usługi WMS; warstwa ma krycie 56% i jest ładowana od przybliżenia 16. Kliknięcie widocznej strefy pozwala odczytać symbol, nazwę i pozostałe informacje zwrócone przez usługę. Mapownik nie ma dostępu do indywidualnych geometrii poligonów ani sterowania etykietami narzuconymi przez styl serwera WMS; własne kolory poligonów i bezwarunkowe wyłączenie etykiet wymagają źródła wektorowego albo potwierdzonego stylu WMS bez etykiet.
- Panel działki ma sekcje „Działka”, „Planowanie przestrzenne”, „Grunty”, „Ograniczenia” i „Pozostałe dane”. Pokazuje identyfikator, numer, administrację, powierzchnię, współrzędne środka wyliczone z geometrii ULDK, kopiowanie danych i punktową klasę EGiB. Udział powierzchni klas nie jest wyliczany bez ich geometrii; ekran to wyraźnie wyjaśnia.

### Zmiany odziedziczone z 17.8.7

### Stan warstw WMS

Udane przełączenie na zapasową drogę pobierania mapy nie oznacza już samo w sobie stanu „niestab.”. Po trzech kolejnych prawidłowych obrazach warstwa wraca do stanu „OK”. Ostrzeżenie nadal pojawia się przy niedostępnych obrazach i danych odtworzonych z pamięci, a otwarty obwód zabezpieczający pokazuje stan „offline”. Podpowiedź przy statusie pokazuje bieżący ostatni błąd oraz informuje o możliwości pobierania przez serwer Mapownika. Poprawka dotyczy również warstw planowania przestrzennego ze zgłoszonego zrzutu.

### Wcześniejsze poprawki

Wydanie naprawia niedostępną warstwę klas gruntów ornych z wersji 17.8.5. Żądanie KIUG używa teraz urzędowej kompozycji WMS `kontury,uzytki` we wszystkich trzech miejscach: mapa, serwerowy obraz WMS i informacje o wskazanym punkcie.

### Nowe funkcje

- Główne pole wyszukiwania przyjmuje pełny identyfikator działki EGiB, także z numerem arkusza `AR_` i numerem łamanym. Wynik pochodzi z ULDK; wybór przybliża i podświetla działkę. Nie dodaje jej do projektu.
- W panelu Warstwy dostępne są kontury klasyfikacyjne EGiB z oznaczeniami gruntów ornych RI, RII, RIIIa, RIIIb, RIVa, RIVb, RV i RVI. Warstwa korzysta z urzędowej usługi KIUG GUGiK i obejmuje również klasy innych użytków. Włączenie warstwy umożliwia punktowy odczyt przez „Informacja o działce”.

### Zakres danych

Powiaty nie wszędzie publikują kontury klasyfikacyjne. Pusta mapa ani pusty wynik punktowy nie stanowią dowodu braku gruntów danej klasy. Kolor i oznaczenia pochodzą ze stylu urzędowej usługi WMS; nie są osobnym filtrem według klasy. Warstwa nie służy do obliczania powierzchni klas na działce.

### Weryfikacja wdrożenia

Sprawdź `verify-deployment.php`, `api/health.php` i `diagnostyka.html`. Na serwerze z PHP wykonaj wyszukanie poprawnego oraz błędnego identyfikatora, obejrzyj warstwę w obszarze publikującym kontury i sprawdź informacje o punkcie. Testy lokalne nie zastępują sprawdzenia odpowiedzi urzędowych usług w docelowym środowisku.

### 19.5.0 — Analizator działki 360° (etap integracyjny)
Patrz `ZMIANY_19.5.0.md` i `README_19.5.0_ANALIZATOR_DZIALKI.md`.
