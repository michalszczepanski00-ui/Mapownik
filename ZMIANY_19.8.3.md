# 19.8.3 — plan ogólny i MPZP w analizie działki bez importu, stabilniejsze źródła, wiarygodna diagnostyka

Wydanie oparte na 19.8.2 (kompaktowy układ) — wszystkie zmiany 19.8.2 zachowane.

## Analiza działki 360°: POG i MPZP z Rejestru Urbanistycznego (bez importu)

- Sekcje „Plan ogólny (POG)” i „MPZP” pobierają dane na bieżąco z usług Rejestru Urbanistycznego (MRiT).
  Wcześniej wymagały ręcznego importu wektorów i zwykle pokazywały „Brak zaimportowanej warstwy”.
- RU zwraca geometrię strefy (EPSG:2180) — **udział strefy w działce liczony dokładnie** z geometrii,
  np. działka 121113_2.0001.2869/18: strefa 8SO 72,7% (3132 m²), 47SJ 27,3% (1174 m²).
- Dla stref: nazwa, maksymalna wysokość, intensywność, udział zabudowy, minimalna PBC i link
  „Karta w Rejestrze Urbanistycznym”. Dla aktu: tytuł, status, data obowiązywania.
- Punkty zapytań wewnątrz działki, kolejne rundy tylko tam, gdzie strefa nie jest jeszcze znana;
  limit 10 s na całą część RU, 5 s na zapytanie; zapytania równoległe. Typowo 1–4 s.
- Gdy RU nie odpowie dla części działki — ostrzeżenie „wynik może być niepełny”. Brak planu w RU
  opisany wprost (rejestr MPZP nie obejmuje jeszcze wszystkich planów).
- Nowy plik `api/_vps_ru.php`; parametr `include_ru: false` w `parcel/analyze` wyłącza tę część.

## Wolne źródła

- BDOT10k (budynki, transport, wody, pokrycie terenu): limit oczekiwania serwera 18 s (było 10 s),
  przeglądarki 22 s (było 12 s). Usługa GUGiK odpowiada w 5–12 s; wcześniej część kafli była pusta.

## Diagnostyka (`diagnostyka.html`) — usunięte fałszywe alarmy

- Strefy POG: oczekiwany próg zoomu 15–16 (skala 1:10 000 usługi RU), nie 11–12.
- Grupy warstw: limit wg `OVERLAY_GROUP_ORDER` (9 grup z „Archiwum”); Studium dozwolone w „Archiwum”.
- Ikony narzędzi zgodne z aktualnym zestawem (map-info, pin-plus, callout-leader, area-search, photo-time).
- Polityka cache: „immutable” dla `app-<wersja>/` jest zamierzone (.htaccess 18.18.0); test pilnuje
  rewalidacji `index.html` i jednego katalogu `app-*` na serwerze.

## Interfejs

- Raport działki: „Planowanie i warstwy przecinające działkę”, poprawna odmiana („3 obiekty”),
  puste pola rejestru pomijane, nagłówek „Jednostki administracyjne” (dane z ULDK).

## Weryfikacja

- Prawdziwe usługi: 5 działek (Spytkowice — 1 i 2 strefy, 100% pokrycia; Mińsk Mazowiecki — brak planu).
- Porównanie API z oryginałem Python 19.7.0 — 0 różnic (poza nowym polem `online`).
- Testy przeglądarkowe 4/4, `check_release.py`, `bump_version.py --check`, `verify-deployment.php`.
