# Audyt warstw Mapownika i propozycja nowych warstw (16.11.2026)

**Stan bazowy:** 19.49.0.
- **Katalog:** `app-19.55.0/data/catalog/dataCatalog.js` i `sourceProfiles.js` (z `data/source-profiles.json`).
- **Serwer pośredniczący:** `api/_wms_sources.php`.

**Sprawdzenie kandydatów:** 16.11.2026, na żywo, przez zapytanie `GetCapabilities` z tego środowiska.
- Nie sprawdzałem rysowania obrazu (GetMap) — to pierwszy krok wdrożenia każdej warstwy.
- Nie sprawdzałem dostępu z hostingu OVH. GDOŚ i PIG potrafią blokować hosting (patrz 1.3).

---

## 1. Audyt obecnych warstw

### 1.1 Co jest (nakładki w panelu Warstwy)

| Grupa | Warstwy | Źródło |
|---|---|---|
| Działki i grunty | działki KIEG; klasy bonitacyjne i użytki EGiB; mapa glebowo-rolnicza; zasięg mapy glebowej; własność lasów (BDL) | GUGiK, BDL |
| Planowanie przestrzenne | MPZP — rysunek (integracja); MPZP z Rejestru: wiążące / w trakcie / w opracowaniu; POG uchwalony, projektowany, w opracowaniu; strefy POG wiążące i projektowane | GUGiK, Rejestr Urbanistyczny |
| Uzbrojenie terenu | KIUT: energetyka, gaz, woda, kanalizacja, telekomunikacja, ciepło, sieci specjalne / niezidentyfikowane; zestaw wszystkich sieci; BDOT500 | GUGiK |
| Energetyka | linie i stacje PSE; biogazownie KOWR (punkty) | PSE / GUGiK, KOWR |
| Środowisko i wody | Natura 2000 ptasia i siedliskowa; parki narodowe i krajobrazowe; rezerwaty; OChK; użytki ekologiczne; zespoły przyrodniczo-krajobrazowe; pomniki przyrody; stanowiska dokumentacyjne; powódź rzeczna, morska, awaria budowli piętrzących | GDOŚ, Wody Polskie (ISOK) |
| Geologia i górnictwo | złoża, obszary i tereny górnicze (MIDAS); osuwiska SOPO | PIG-PIB |
| Rzeźba i wysokości | nachylenie terenu (liczone w przeglądarce) | AWS Terrain Tiles |
| Dane pomocnicze | BDOT10k: budynki, transport, wody, pokrycie terenu; granice PRG; nazwy PRNG; adresy; zestawy zbiorcze Natura 2000 i form ochrony | GUGiK, GDOŚ |
| Archiwum | archiwalne tereny i obszary górnicze, złoża wybilansowane (MIDAS) | PIG-PIB |

**Narzędzia z własnymi warstwami na mapie** (poza panelem Warstwy):
- ceny transakcyjne (RCN);
- budowy i pozwolenia (RWDZ);
- bufor;
- wysokości, profil, Teren 3D;
- screening działki.

### 1.2 Warstwy ukryte, bo usługa nie oddaje danych
| Warstwa | Stan | Zalecenie |
|---|---|---|
| Mapa wysokości (hipsometria NMT) | jednolity obraz we wszystkich próbach (audyt 30.10.2026) | Sprawdzać raz w miesiącu monitorem. Zastępstwo: nachylenie terenu i podkład NMT. |
| Działki w zasobie KOWR | puste obrazy w każdej skali | jak wyżej |

### 1.3 Problemy z dostępnością (diagnostyka z 10.11.2026)
- **GDOŚ** (10 warstw ochrony przyrody, Natura 2000, wiersze werdyktu „Natura 2000” i „Inne formy ochrony”) zwraca serwerowi **403 (Incapsula)**.
  - W karcie działki te wiersze często mają stan „nie sprawdzono”.
  - To najważniejsza luka w obecnych danych, bo ochrona przyrody jest w werdykcie.
  - **Zalecenie:** po stronie przeglądarki (zapytanie bezpośrednie) GDOŚ zwykle odpowiada. Sprawdzić na test24, jak często werdykt kończy się „nie sprawdzono”. Jeśli często — dla GDOŚ ustawić najpierw przeglądarkę, jak dla KIEG.
- **PIG-PIB** (MIDAS i inne): okresowo 502. Bez zmian.

### 1.4 Spójność katalogu
- **Natura 2000 — zestaw zbiorczy i Formy ochrony — zestaw zbiorczy** (grupa Dane pomocnicze) powielają 10 osobnych warstw GDOŚ.
  - Zostają, bo z nich korzysta werdykt.
  - W panelu można je przenieść do Archiwum albo ukryć filtrem — do decyzji przy Etapie 5 (dok Warstwy).
- **Wpisy MIDAS w `dataCatalog.js`** (`layers: '0'` / `'1'`) są nadpisywane przez profile (`5` / `4`). Działa poprawnie, ale wpis w kodzie jest mylący. Do uporządkowania w Etapie 7.

### 1.5 Czego dziś nie da się sprawdzić w Mapowniku
Pytania, które kupujący, projektant albo inwestor zadaje przy działce, a na które Mapownik nie ma warstwy:
1. Czy na działce lub obok jest **zabytek** (rejestr zabytków)?
2. Czy w pobliżu jest **ferma zwierząt, oczyszczalnia, składowisko** (uciążliwości)?
3. Jaki jest **hałas** od drogi, kolei, lotniska?
4. Czy działka leży w **strefie ryzyka powodziowego** (MRP), a nie tylko w obszarze zagrożenia?
5. Czy działka jest nad **Głównym Zbiornikiem Wód Podziemnych** (ograniczenia dla inwestycji uciążliwych)?
6. Czy da się postawić **pompę ciepła z odwiertem** (geotermia płytka)?
7. Jaki **obszar analizowany** obejmie decyzja WZ (3× front działki, min. 50 m)?

---

## 2. Proponowane nowe warstwy

Wszystkie poniżej to **WMS z instytucji publicznych, sprawdzone 16.11.2026** (GetCapabilities odpowiada). Wpięcie odbywa się tak jak obecnych warstw:
- profil w `data/source-profiles.json` i `api/_wms_sources.php`;
- identyfikacja przez GetFeatureInfo tam, gdzie warstwa ją ma.

**Bez zmian w logice istniejących warstw.** Usługi tylko w EPSG:2180 obsługujemy już tak jak KIUT (`projection: 'EPSG:2180'`).

### Priorytet 1 — duża wartość, mały koszt

| # | Warstwa | Usługa (sprawdzona) | Nazwy warstw | Układ | Info o obiekcie | Grupa | Uwagi |
|---|---|---|---|---|---|---|---|
| N1 | **Zabytki nieruchome (rejestr)** | NID `https://usluga.zabytek.gov.pl/INSPIRE_IMD/service.svc/get` (WMS 1.3.0) | `Immovable_Monuments` | 2180, 3857 | tak (XML/HTML) | nowa: **Dziedzictwo** | Dobry kandydat do **wiersza werdyktu** „Zabytek”. Warstwa obejmuje rejestr zabytków nieruchomych. Ochrona konserwatorska z MPZP i gminnej ewidencji — nie. |
| N2 | **Obiekty produkcyjne i przemysłowe** | GUGiK INSPIRE PF `https://mapy.geoportal.gov.pl/wss/geosrv/wmsPF/wms` | m.in. `PF.AnimalProduction` (fermy), `PF.WasteTreatmentAndDisposal`, `PF.WasteCollection`, `PF.Sewerage`, `PF.MiningAndQuarrying`, `PF.ProductionOfElectricity`, `PF.ProductionBuilding` | 2180, 3857 | tak | nowa: **Uciążliwości** | Warstwy kategorii od 1:25 000 do 1:250 000, budynki produkcyjne od 1:25 000 w dół. Proponuję 3 warstwy w panelu: *Fermy zwierząt*, *Gospodarka odpadami i ściekami*, *Przemysł i wydobycie*. |
| N3 | **Strefa ryzyka powodziowego (MRP)** | Wody Polskie — ta sama usługa co obecna powódź: `wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS` | `NZ.RiskZone`; opcjonalnie elementy narażone `NZ.ExposedElement_q1` / `_q10` / `_q0_2` | grupa: 2180, 3857; warstwy podrzędne deklarują tylko 4258 / CRS:84 | tak | Środowisko i wody | Najtańsza z nowych: serwer i profil już są. **Do sprawdzenia:** czy GetMap w 3857 rysuje (deklaracje układów w warstwach podrzędnych są niepełne). |
| N4 | **Składowiska odpadów (2024)** | GIOŚ / ekoportal `https://iip.ekoportal.gov.pl/geoserver/wms` | `sklad_odp:skladowiska-odpadow-2024` | usługa: 2180, 3857 | do sprawdzenia | Uciążliwości | Dane z 2024 r. |

### Priorytet 2 — wartość dla części użytkowników

| # | Warstwa | Usługa (sprawdzona) | Nazwy warstw | Układ | Uwagi |
|---|---|---|---|---|---|
| N5 | **Główne Zbiorniki Wód Podziemnych** | PIG-PIB `https://cbdgmapa.pgi.gov.pl/arcgis/services/hydrogeologia/gzwp/MapServer/WMSServer` | `0` LZWP, `1` GZWP nieudokumentowane, `2` GZWP udokumentowane | **tylko 2180** | Info o obiekcie: tak. Grupa: Środowisko i wody. Dane aktualizowane co rok. |
| N6 | **Hałas — mapy akustyczne** | GIOŚ / ekoportal (jak N4) | główne drogi `DF4_8_MRoad2017Lden:PL_a_Mroad_Lden`, `…Lnight`; koleje `DF4_8_MRail2017Lden:…`; lotniska `DF4_8_Mair2017:…Lden`; aglomeracje: drogi, kolej, przemysł, lotnictwo (Lden / LN) | 2180 (3857 tylko na poziomie usługi) | **Dane z 2017 r.** Mapy GDDKiA z 2022 r. są publikowane jako WMS, ale strona z adresami była 16.11 niedostępna (503). Proponuję poczekać na adres 2022, a wersję z 2017 r. dać tylko z wyraźną datą. |
| N7 | **Geotermia płytka (pompy ciepła)** | PIG-PIB `https://cbdgmapa.pgi.gov.pl/arcgis/services/geotermia/mpgn/MapServer/WMSServer` | `23` możliwość wykonania odwiertów z uwarunkowaniami środowiskowymi; `3` / `2` wydajność cieplna na 70 / 100 m | **tylko 2180** | Info o obiekcie: tak. Mapy nie obejmują całego kraju — warstwa `30` „obszar map” pokazuje zasięg. Grupa: Geologia. |
| N8 | **Potencjał OZE — fotowoltaika i wiatr** | GIOŚ / ekoportal | `potencjal_oze-szczegolowe:pv_na_ladzie_szczegol`, `potencjal_oze-szczegolowe:fw_na_ladzie_szczegol` | do sprawdzenia | Grupa: Energetyka. Uzupełnia PSE i biogazownie. **Do sprawdzenia:** szczegółowość (siatka czy gmina) i czy uwzględnia odległości od zabudowy. |
| N9 | **Miejsca stosowania osadów ściekowych** | GIOŚ / ekoportal | `kos:KOS_25_raport_2026` (raport za 2025 r.) | do sprawdzenia | Dla kupujących grunty rolne. Grupa: Uciążliwości albo Działki i grunty. |

### Priorytet 3 — warstwy wyliczane w Mapowniku (bez nowej usługi zewnętrznej)

| # | Warstwa | Skąd dane | Uwagi |
|---|---|---|---|
| N10 | **Obszar analizowany WZ** | geometria działki z ULDK (już pobierana) + front działki od strony drogi | Bufor 3× szerokość frontu, min. 50 m — podstawa analizy „dobrego sąsiedztwa”. Silnik buforów już jest. Front działki trzeba wskazać (klik na krawędzi) albo wyznaczyć z działek drogowych EGiB. Warstwa pokazuje obszar, nie ocenia zgodności. |
| N11 | **Odległości od linii PSE** | linie PSE (już w katalogu) | Pasy orientacyjne wokół linii najwyższych napięć. **Wymaga danych wektorowych linii** — dziś PSE mamy tylko jako obraz WMS. Do sprawdzenia, czy PSE / GUGiK udostępnia WFS. |

### Sprawdzone i odrzucone (na dziś)
| Kandydat | Powód |
|---|---|
| Cieniowanie NMPT (wysokości budynków i drzew), GUGiK | usługa zwraca 401 (wymaga logowania) |
| Bank Danych o Lasach — lasy ochronne, siedliska | serwer WMS 16.11 zwracał 503; do ponownej próby |
| Zasięg internetu (UKE: PIT / SIDUSIS) | adres WMS PIT zwraca 404; dane o zasięgach są tylko w serwisie internet.gov.pl, bez publicznego WMS |
| Strefy ochronne ujęć wód, MPHP (Wody Polskie) | nie znalazłem publicznego WMS |
| Zabytki archeologiczne (NID) | usługa istnieje według metadanych INSPIRE, ale nie znalazłem działającego adresu. Katalog INSPIRE (inspire-geoportal.ec.europa.eu) jest niedostępny z tego środowiska — trzeba go dopuścić w ustawieniach sieci sesji albo podać adres. |
| Szczegółowa Mapa Geologiczna 1:50 000 | nie znalazłem adresu WMS w skali 1:50 000 (jest tylko mapa ogólna ≥ 1:500 000) |
| Pożary lasów, obszary gospodarki leśnej, dorzecza, usługi publiczne (INSPIRE US) | mała wartość przy ocenie działki |

---

## 3. Proponowany sposób wdrożenia

**Kolejność względem przebudowy UI.** Nowe warstwy to nowe funkcje, a specyfikacja przebudowy UI ich zabrania („nie dodajesz nowych funkcji”). Proponuję:
- osobne wydanie warstw po Etapie 5 (gdy dok Warstwy ma nowe filtry i grupy);
- **albo** osobną gałąź teraz, wgrywaną do osobnego katalogu testowego.

**Zakres jednego wydania:** priorytet 1 (N1–N4).

**Każda warstwa przechodzi te kroki:**
1. Próba rysowania (GetMap) w 3857 / 2180 przy 3 skalach.
2. Próba informacji o obiekcie w znanym punkcie (np. zabytek w Gdańsku, ferma z BDOT, obszar ryzyka na Wiśle).
3. Próba z hostingu OVH (`api/wms.php?source=…`).
4. Wpis do monitora dostępności i diagnostyki.
5. Opis w panelu z datą danych i zastrzeżeniem („pusta mapa nie oznacza braku…”).

**Wiersz werdyktu „Zabytek”** (z N1) — tylko za Twoją zgodą. Zmienia kartę działki, więc najlepiej razem z Etapem 4 (Inspektor).

**Grupy w panelu:** dwie nowe grupy — **Dziedzictwo** i **Uciążliwości**. Kolejność: po „Środowisko i wody”.

## 4. Pytania
1. **Wybór warstw:** które wchodzą do wdrożenia? Proponuję N1–N4. Czy dorzucić N5–N9?
2. **Termin:** osobne wydanie po Etapie 5 przebudowy UI czy osobna gałąź teraz?
3. **Werdykt:** czy dodać wiersz „Zabytek” do werdyktu karty działki?
4. **Hałas:** wersja z 2017 r. teraz czy czekamy na adresy map GDDKiA z 2022 r.?
5. **N10 (obszar analizowany WZ):** czy ta warstwa jest dla Ciebie przydatna? Wymaga wskazania frontu działki.

---

## 5. Stan po 19.50.0 (16.11.2026)

Na polecenie właściciela („napraw te luki”) wdrożone w 19.50.0 — szczegóły w `ZMIANY_19.50.0.md`:
- **GDOŚ 403:**
  - warstwy pytają najpierw z przeglądarki;
  - serwer ma zapas EEA dla Natura 2000, parków narodowych i krajobrazowych, rezerwatów i OChK (mapa, werdykt, raport).
- **Ukryte warstwy:**
  - hipsometria NMT wróciła (jeden obraz na widok — usługa jest wolna);
  - KOWR wrócił (usługa rysuje od ok. 1:50 000 — wcześniejsza diagnoza była błędna).
- **Zestawy zbiorcze GDOŚ:** poza listą w panelu; zostają dla raportu i analizy.
- **7 pytań o działkę:**
  - nowe warstwy: N1 zabytki, N2 obiekty produkcyjne (fermy, odpady, przemysł), N3 strefa ryzyka powodziowego, N4 składowiska, N5 GZWP, N6 hałas, N7 geotermia płytka;
  - wiersze werdyktu „Zabytek” i „Powódź”;
  - nowe pozycje w karcie działki;
  - narzędzie „Obszar analizowany WZ” (N10).
- **Bez zmian:**
  - N8 (potencjał OZE), N9 (osady ściekowe), N11 (pasy wokół linii PSE — brak danych wektorowych);
  - hałas GDDKiA 2022 (brak potwierdzonego adresu WMS).
