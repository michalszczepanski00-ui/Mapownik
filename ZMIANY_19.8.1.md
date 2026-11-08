# msportal 19.8.1 — poprawki po teście na https://mapownik.swiadectwa.net/test22/

## Plany ogólne (POG) nie wyświetlały się prawidłowo

1. **Portal w podkatalogu sięgał do innej instalacji.** Katalog warstw miał adresy bezwzględne
   `/api/wms.php?source=…`. Gdy portal działa w podkatalogu (np. `/test22/`), zapasowe pobieranie kafli
   przez serwer trafiało do `https://domena/api/wms.php` — na tym serwerze do starego Mapownika 18.18.4.
   Dotyczyło to wszystkich warstw WMS przy niedostępności połączenia bezpośredniego, w tym POG.
   Teraz wszystkie adresy są względne (`./api/…`), walidacja katalogu je dopuszcza.
2. **Strefy POG — wiążące / realizowane**: usługa Rejestru Urbanistycznego rysuje strefy tylko w skali
   1:10 000 i większej (`MaxScaleDenominator=10000`, sprawdzone na planie gminy Spytkowice). Warstwa była
   dostępna od zoomu 11, więc po włączeniu mapa była pusta. Teraz `min_zoom` 15,8 — panel pokazuje
   „Widoczna od … — Przybliż”, a strefy pojawiają się po przybliżeniu.
3. **POG — w trakcie przyjmowania** zawierało wyłącznie warstwy stref (widoczne dopiero od 1:10 000), bez
   zasięgu aktu. Dodano `APP.POG.WTrakciePrzyjmowania` — zasięg projektu widać od zoomu 9, strefy po przybliżeniu.

Zmienione: `data/source-profiles.json` (+ wygenerowany `app-19.8.1/data/catalog/sourceProfiles.js`),
`app-19.8.1/data/catalog/dataCatalog.js`, `layerDefinition.js`, `diagnostyka.html` (oczekiwany adres względny).

## Analiza działki (z poprawki 19.8.0-1)

Gmina, powiat, województwo i obręb z ULDK w jednym zapytaniu (~1 s) zamiast PRG (~11 s, przekraczało limit).

## Wersja

Kod aplikacji przeniesiony do `app-19.8.1/` (przeglądarki trzymają `app-<wersja>/` w pamięci na stałe —
bez nowego katalogu użytkownicy nie dostaliby poprawki).
