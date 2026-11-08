# msportal 19.31.0: audyt, poprawki i optymalizacja

Zawiera też 19.30.1 (czytelność podkładów wektorowych), czyli wszystko po 19.30.0, które działa na serwerze.
Układ, wygląd i sposób obsługi bez zmian.

## Naprawione błędy

| # | Co nie działało | Skutek dla użytkownika | Naprawa |
|---|---|---|---|
| 1 | **Zagrożenie powodziowe w „Otoczeniu działki” i „Analizie źródła”**. Wody Polskie (ISOK) wycofały warstwę `NZ.HazardArea`, o którą pytał portal. | Każde sprawdzenie kończyło się błędem 502/504, nawet w strefie zalewowej. Dodatkowo do 25 zapytań po ~10 s obciążało serwer. | Nowe warstwy: `NZ.Fluvial`, `NZ.SeaWater`, `NZ.ArtificialWaterBearingInfrastructure`. Odpowiedź w formacie tekstowym (kilka kB zamiast 5,9 MB geometrii). Sprawdzone: Wrocław-Kozanów „w strefie”, Starogard Gd. „brak trafień” w 2,5 s. |
| 2 | **Wysokości obszaru (W)**: podpowiedź „Przeciągnij prostokąt”, a narzędzie działa przez dwa kliknięcia. | Przeciągnięcie przesuwało mapę i nic się nie działo. | Podpowiedź jak w narzędziu Prostokąt: „Kliknij jeden narożnik, potem przeciwległy”. |
| 3 | **Opis narzędzia w karcie** (np. „Edytuj kształt”). | Trzecia linia opisu nachodziła na zakładki Działka/Raport/Analizy. | Opis ma pełną wysokość. |
| 4 | **Pole „Filtruj obiekty…”** w panelu Obiekty. | Podpowiedź ucięta do „Filtruj obie”. | Krótsza podpowiedź „Filtruj…”; pełny opis zostaje dla czytników ekranu. |
| 5 | **Sonda „W widoku”** (dane planistyczne w kadrze). | Przy awarii źródła (np. Rejestru Urbanistycznego) każde przesunięcie mapy wysyłało do niego nowe zapytania (10 przesunięć = 20 zapytań po ~10 s na serwerze). Działające warstwy czekały w kolejce. | Jedno zapytanie na warstwę naraz. Zmiana kadru go nie przerywa. Po błędzie warstwa odpoczywa 2 minuty. |

## Optymalizacje

| Obszar | Przed | Po |
|---|---|---|
| Przesuwanie mapy na podkładzie Pastel/Zmierzch (blokada przeglądarki na tej samej trasie testowej) | 7,3–9,4 s, przestoje do 1,4 s | 2,4 s, przestoje do 0,47 s |
| Pamięć po powrocie z Pastel/Zmierzch na mapę standardową | +20 MB na stałe | zwolniona po 60 s (32,6 → 14,2 MB) |
| Pamięć po powrocie z Kartograficznego | +23 MB na stałe | zwolniona po 60 s (34,5 → 14,7 MB) |
| Pamięć modelu wysokości dla warstwic | do ~31 MB (120 kafli) | do ~12 MB (48 kafli), zwalniana razem z podkładem |

Szczegóły:
- **Podkłady wektorowe.** Punkty usług i nazwy ulic wracają na progi stylu bazowego: główne od z15, pozostałe od z16–17.
  W 19.30 wszystkie były od z14,5, co mnożyło etykiety do rozmieszczenia. Numery adresowe i przeznaczenie terenu zostają.
- **Ukryte podkłady wektorowe i warstwy z modelu wysokości** są zwalniane po minucie. Powrót na taki podkład trwa ok. 2,5 s.
  Podkłady rastrowe dalej są trzymane jak dotąd.

## Serwer (`api/identify.php`)
- Poprawkę nr 1 skrypt `aktualizuj-19.31.php` nakłada w miejscu, **tylko jeśli plik na serwerze ma oczekiwaną treść**.
  Oryginał zapisuje w `cache/kopia-19.31/`; krok 2 skryptu go usuwa.
- Gdy skrypt zgłosi „POMINIĘTA — plik ma inną treść”, wgraj `api/identify.php` z pełnej paczki.
- Nowa opcja źródła `info_formats` wskazuje kolejność formatów odpowiedzi.

## Diagnostyka
- „19.31.0 — zagrożenie powodziowe ISOK (identyfikacja)”: punkt w strefie zagrożenia we Wrocławiu musi dać wynik.
- „19.31.0 — wydajność podkładów i sondy »W widoku«”: sprawdza progi etykiet, przerwę po błędzie źródła i zwalnianie podkładów.

## Wgranie (`aktualizacja_19.31.0.zip`)
1. Wgraj `aktualizuj-19.31.php` i otwórz go w przeglądarce (krok 1). W odpowiedzi sprawdź `poprawki_serwera`:
   obie pozycje powinny mieć „zastosowana”.
2. Wgraj i nadpisz: `index.html`, `diagnostyka.html`, `VERSION.txt`, `assets/css/35-workspace-1c.css` i cały katalog `app-19.31.0/`.
3. Odśwież portal (zwykłe odświeżenie wystarczy). Sprawdź podkłady i Działka → Analizy → Otoczenie działki.
4. Otwórz `aktualizuj-19.31.php?sprzatanie=1` (krok 2). Usunie `app-19.30.0/`, stary `vendor/ol-esm/`, kopie i stare skrypty.
5. `verify-deployment.php` → `"deployment_consistent": true`; `diagnostyka.html` → testy 19.31.0 na zielono.

## Wycofanie (przed krokiem 2)
Do kroku 2 stara wersja zostaje na serwerze. Aby wycofać:
1. Przywróć `.htaccess.bak-19.30.0` jako `.htaccess`.
2. Przywróć `cache/kopia-19.31/identify.php` jako `api/identify.php`.
3. Wgraj `index.html` i `VERSION.txt` z paczki 19.30.0.

Pełna kopia wersji wyjściowej: `msportal-19.30.1-pelna.zip`.
