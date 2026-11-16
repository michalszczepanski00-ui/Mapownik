# msportal 19.50.0 — luki z audytu warstw: GDOŚ, ukryte warstwy, nowe dane o działce

Wydanie zbudowane na 19.49.0 — zawiera też Etap 2 przebudowy UI (pasek kontekstowy), który czeka na akceptację.

Podstawa: `AUDYT_WARSTW_2026-11.md`. Każda usługa sprawdzona na żywo 16.11.2026 (obraz mapy i informacja o obiekcie w znanych punktach).

## 1. GDOŚ: werdykt „Natura 2000” i „Inne formy ochrony” bez „nie sprawdzono”

**Problem:** zapora Incapsula serwera GDOŚ odpowiada serwerom 403 — także zwykłym zapytaniom z przeglądarki uruchomionej w serwerowni. Werdykt często kończył się „nie sprawdzono”, a warstwy GDOŚ się nie rysowały.

**Teraz:**
- **Mapa:** warstwy GDOŚ pytają najpierw z przeglądarki użytkownika (jak KIEG). U większości użytkowników domowych GDOŚ odpowiada.
- **Zapas na serwerze:** gdy GDOŚ odmówi albo nie odpowie, serwer bierze te same formy ochrony z **Europejskiej Agencji Środowiska (EEA)** — dane zgłoszone przez Polskę:
  - Natura 2000 (obszary ptasie i siedliskowe), wersja 2024;
  - parki narodowe, rezerwaty, parki krajobrazowe, obszary chronionego krajobrazu (NatDA v24).
- **Werdykt i karta działki:** wynik z EEA ma dopisek „· dane EEA”. W dymku jest wyjaśnienie, skąd dane i czego nie obejmują.
- **Raport PDF:** sekcja Ochrona przyrody ma notę o źródle zapasowym.
- **Udział powierzchni w raporcie:** liczony jak dotąd — obraz EEA ma jednolite wypełnienie, nie kreskowanie.
- **Ograniczenie:** EEA nie publikuje użytków ekologicznych, zespołów przyrodniczo-krajobrazowych, pomników przyrody ani stanowisk dokumentacyjnych. Dla nich nadal tylko GDOŚ. Przy „Inne formy ochrony” z EEA opis mówi, że tych form nie sprawdzono.

**Sprawdzone:**
- Kampinos: Natura 2000 PLC140001 i Kampinoski Park Narodowy;
- okolice Krakowa: Dłubniański Park Krajobrazowy;
- Starogard: poza.

## 2. Warstwy ukryte w 19.23 — wróciły

| Warstwa | Co się okazało | Teraz |
|---|---|---|
| **Mapa wysokości (hipsometria NMT)** | Usługa GUGiK znów rysuje, ale wolno: kafel 6–27 s, jeden obraz widoku ok. 6 s | Jeden obraz na widok, dłuższe limity (serwer 25 s, przeglądarka 32 s). Grupa Rzeźba i wysokości. |
| **Działki w zasobie KOWR** | Usługa działa, tylko w dużych skalach: punkty do 1:50 000, granice od ok. 1:15 000 (diagnoza „puste w każdej skali” była błędna) | Warstwa od ok. 1:50 000. Wiersz „Zasób KOWR” wrócił do karty działki (Pozostałe dane). |

## 3. Zestawy zbiorcze GDOŚ poza listą warstw

„Natura 2000 — zestaw zbiorczy” i „Formy ochrony — zestaw zbiorczy” dublowały 10 osobnych warstw GDOŚ.
- **W panelu Warstwy:** zniknęły z listy, chyba że są włączone (np. w starszym projekcie).
- **Bez zmian:** dalej korzystają z nich raport PDF i analiza otoczenia.

## 4. Odpowiedzi na częste pytania o działkę

### Nowe warstwy (panel Warstwy)

| Pytanie | Warstwa | Źródło | Uwagi |
|---|---|---|---|
| Zabytek? | **Zabytki nieruchome — rejestr (NID)** — nowa grupa *Dziedzictwo* | Narodowy Instytut Dziedzictwa | od ok. 1:70 000; szare obszary to m.in. układy urbanistyczne; nie obejmuje gminnej ewidencji zabytków |
| Uciążliwi sąsiedzi? | **Fermy i chów zwierząt**; **Odpady i ścieki — instalacje**; **Przemysł, wydobycie i elektrownie** — nowa grupa *Uciążliwości i hałas* | GUGiK, obiekty produkcyjne INSPIRE | usługa rysuje je tylko w skalach 1:25 000–1:250 000 (przy większym zbliżeniu oddal mapę) |
| | **Składowiska odpadów (2024)** | GIOŚ / ekoportal | |
| Hałas? | **Hałas — główne drogi, koleje, lotniska (LDWN)**; **Hałas — aglomeracje (LDWN)** | GIOŚ / ekoportal, strategiczne mapy hałasu | dane z 2017 r. — nowszych map GDDKiA (2022) nie ma w potwierdzonej usłudze WMS |
| Ryzyko powodzi? | **Powódź — strefa ryzyka (MRP)** | Wody Polskie (ISOK) | obejmuje też tereny za wałami (np. Żuławy), których nie ma w obszarach zagrożenia; usługa rysuje od ok. 1:25 000 |
| Zbiornik wód podziemnych? | **Główne Zbiorniki Wód Podziemnych (GZWP)** | PIG-PIB | tylko EPSG:2180 (obraz obracany jak KIUT) |
| Pompa ciepła z odwiertem? | **Pompa ciepła — możliwość odwiertów (geotermia płytka)** | PIG-PIB, MPGN | mapy obejmują wybrane obszary kraju; tylko EPSG:2180 |

### Karta działki
- **Nowe wiersze werdyktu:**
  - **Zabytek** — „w rejestrze” albo „brak w rejestrze”;
  - **Powódź** — „obszar zagrożenia”, „strefa ryzyka” albo „brak w mapach” (z zastrzeżeniem, że mapy nie obejmują wszystkich cieków).
  - Oko przy obu wierszach włącza warstwy na mapie.
- **Sekcja Ograniczenia:** zabytek, powódź (obszar zagrożenia i strefa ryzyka), GZWP, hałas (źródło i przedział LDWN w dB, np. „główna droga, 55–59 dB”).
- **Sekcja Pozostałe dane:** zasób KOWR i pompa ciepła (np. „instalacja bez przeciwwskazań”).
- **Opisy po polsku** zamiast surowych pól usług, np. „Data wpisu do rejestru”, „Poziom ryzyka”, „Nr GZWP”, „Głębokość średnia (m)”.
- **Liczba źródeł karty:** 11 → 18, nadal najwyżej 4 zapytania naraz. Najwolniejsze jest źródło hałasu (ok. 7 s).

### Nowe narzędzie: Obszar analizowany WZ (Mierz → Obszar WZ, skrót Z)
1. Kliknij działkę w projekcie (dodasz ją w karcie: „Do projektu”).
2. Kliknij krawędź od strony drogi. Front to ta krawędź razem z sąsiednimi odcinkami w jednej linii. Szerokość frontu możesz też wpisać.
3. Podgląd: obszar w odległości **3 × front, nie mniej niż 50 m** wokół działki (§ 3 ust. 2 rozporządzenia z 26.08.2003 r.). Front jest zaznaczony na mapie.
4. „Utwórz obszar” zapisuje go w projekcie z opisem wyliczenia.

To jest minimum z przepisu — urząd może przyjąć większy obszar. Narzędzie używa tego samego silnika buforów co Bufor.

## Serwer
- **Nowe pliki i obsługa:**
  - `api/_eea_protected.php` — zapas EEA (obraz i identyfikacja);
  - `api/wms.php` — wariant „eksport ArcGIS” (dowolny układ, w tym EPSG:2180).
- **`api/identify.php`:**
  - zapas EEA dla źródeł GDOŚ;
  - źródło `noise_all` (7 warstw hałasu jednym zapytaniem, czytelny opis dB);
  - dłuższy limit dla wolnych źródeł.
- **`data/source-profiles.json`:** 11 nowych profili. Nowe pola profilu:
  - `client_transport` — ekoportal tylko przez serwer: odpowiedź bezpośrednia jest blokowana przez przeglądarkę;
  - `single_image`;
  - `client_timeout_ms`.
- **Monitor dostępności:** punkty kontrolne dla zabytków, strefy ryzyka, GZWP i hałasu.

## Testy
| Test | Wynik |
|---|---|
| Vitest | 83/83 — nowe: front działki, odległość WZ, werdykt powodzi |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 |
| Diagnostyka (lokalny Apache) | 198 testów, **189 OK** (19.49.0: 187) |
| Kontrola wdrożenia | 0 błędów; Natura 2000 OK, wcześniej ostrzeżenie 403 |
| Konsola przeglądarki | 0 błędów |
| Udział mapy | bez zmian: 75 / 78 / 83 %, z dokiem 55 / 60 / 70 % |

- **Diagnostyka — co przechodzi:** testy GDOŚ WMS i Natura 2000 WMS (zapas EEA).
- **Diagnostyka — co nie przechodzi:**
  - usługi zewnętrzne: Rejestr Urbanistyczny 502, Bank Danych o Lasach 502, warstwy GDOŚ bez odpowiednika w EEA;
  - brak bazy RWDZ;
  - znany test „Faza 4”.
- **Diagnostyka — testy dostosowane:**
  - KOWR i hipsometria mają być w katalogu;
  - GZWP i geotermia na liście warstw tylko w EPSG:2180.

**Uwaga do karty działki 221312_2.0405.27/1:** plan ogólny pokazuje teraz „projekt”, a w Etapie 1 było „uchwalony”. W punkcie działki usługa GUGiK zwraca dziś tylko projekt planu gminy wiejskiej („w opracowaniu”). Kod planów ogólnych w tej wersji się nie zmienił — to zmiana po stronie danych źródła.

## Nie dało się sprawdzić tutaj
- **GDOŚ bezpośrednio z przeglądarki:** zapora blokuje całą pulę adresów tego środowiska. Na test-serwerze sprawdź, czy warstwy GDOŚ rysują się z przeglądarki (szybciej i z pełnym zakresem form ochrony).
- **Dostęp z hostingu OVH** do EEA, NID, ekoportalu i PIG — sprawdź `verify-deployment.php` i kontrolę wdrożenia po wgraniu.

## Wgranie
Do **nowego** katalogu testowego, np. `/test25/`: cała zawartość `msportal-19.50.0-serwer.zip`, `index.html` i `.htaccess` na końcu.

**Nie nadpisuj `/test22/` ani produkcji.**
