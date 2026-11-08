# 19.8.5 — prostsza obsługa prawego panelu (audyt UX, etapy 1 i 2)

Zawiera też wszystkie poprawki 19.8.4 (plany ogólne i MPZP — Starogard Gdański), które nie były jeszcze wgrane.
Podstawa: `AUDYT_UX_PRAWY_PANEL.md` (punkty A1–A7 i B9–B11).

## Szybkie poprawki (A)

- **A1 — podpisy ikon prawego paska**: pod każdą ikoną krótka nazwa (Warstwy, Obiekty, Działka, Raport,
  Zdjęcia, Analizy, Eksport). Panel „Działka, ceny i otoczenie” ma własną ikonę raportu — wcześniej
  dzielił lupę z „Analizami”. Na telefonie pasek zostaje wąski (bez podpisów).
- **A2 — klasa gruntu bez HTML i kodu QR**: `identify.php` czyta odpowiedzi GeoMedia
  (`<Attribute Name="…">`, krajowa integracja EGiB) — wcześniej wszystkie pola nadpisywały się
  i zostawał tylko obrazek z kodem QR. Wartości pól są oczyszczane ze znaczników HTML; pomijane są
  kod QR, link do raportu i formułka prawna. Kafelek „Klasa gruntu” pokazuje klasę tylko wtedy,
  gdy usługa ją podała (np. „R · IIIa”); w przeciwnym razie „brak w usłudze” z wyjaśnieniem.
- **A3 — werdykty trójstanowe**: MPZP i plan ogólny: „obowiązuje / uchwalony”, „brak planu”
  (usługa odpowiedziała), „nie sprawdzono” (usługa nie odpowiedziała, kolor ostrzegawczy).
  Podpowiedź po najechaniu wyjaśnia znaczenie stanu i kolorów.
- **A4 — pasek akcji karty działki**: „Screening tej działki” w osobnym wierszu, pozostałe przyciski
  zawijają się — nic nie jest ucinane.
- **A5 — współrzędne zwinięte**: na wierzchu identyfikator, numer, powierzchnia, obręb, gmina;
  powiat, województwo i trzy zestawy współrzędnych pod „Powiat, województwo i współrzędne”
  (kopiowanie bez zmian).
- **A6 — eksport**: zamiast komunikatu błędu na starcie — podpowiedź „Przybliż mapę albo wybierz
  zaznaczony prostokąt”. Informacja o podkładzie i jego zamienniku przeniesiona do „Więcej opcji”
  (domyślny wybór bez zmian).
- **A7 — komunikaty administracyjne ukryte**: „Źródła w indeksie”, instrukcje importu/FTP,
  lista zaimportowanych zbiorów — tylko w trybie administratora (`?admin=1` w adresie albo
  `localStorage.setItem('msportal.admin','1')`). Użytkownik widzi: „Ceny transakcyjne nie są jeszcze
  dostępne na tym portalu. Skorzystaj z analizy działki — działa bez tych danych.”

## Uproszczenie pracy z działką (B)

- **B9 — „Sprawdź” bez podmenu**: kliknięcie od razu włącza „Sprawdź miejsce”.
  „Dodaj działkę” (skrót D) jest w grupie „Rysuj”.
- **B10 — działka z wyszukiwarki = działka sprawdzana**: po wyborze działki (identyfikator albo
  miejscowość + numer) mapa przybliża się, obrys zostaje na mapie (nie znika po 12 s), a karta
  „Informacja o działce” otwiera się sama dla punktu wewnątrz działki — bez włączania narzędzia
  i klikania w mapę. Dotychczas ok. 6 kroków od numeru działki do wyniku planistycznego, teraz 2.
- **B11 — „Działka, ceny i otoczenie”**: domyślnie „Analiza działki: plan, granice, otoczenie”
  (działa bez bazy). Opcje RCN/BDOT oznaczone „(niedostępne)”, gdy baza ich nie ma.

## Weryfikacja

- `tools/test_identify_parse.php` — 20/20 (nowe: GeoMedia EGiB, wartości z HTML).
- `tests/ui_hosting.cjs` — 5/5 (nowe: domyślna analiza działki, brak komunikatów FTP dla użytkownika,
  tryb administratora).
- Lokalnie na żywych usługach: wyszukanie 221303_1.0021.60/18 → karta działki otwarta automatycznie,
  plan ogólny „uchwalony” (strefa 234SJ), klasa gruntu „brak w usłudze” (powiat starogardzki
  nie publikuje klas w integracji krajowej), obrys działki na mapie; brak błędów JavaScript;
  widok 390 px bez przewijania w poziomie.
- `diagnostyka.html` — test ikon zaktualizowany (26 slotów), `check_release.py`, `bump_version.py --check`.
- Po wgraniu do sprawdzenia na hostingu: MPZP Starogardu przez sondę rysunku planu (serwer gminy
  odrzuca połączenia z chmury testowej).

## Poprawka po wdrożeniu (19.8.5, 28.10.2026) — tylko pliki PHP

Test produkcyjny po wgraniu: MPZP Starogardu potwierdzony („obowiązuje” — sonda rysunku planu działa
na hostingu), ale plan ogólny „brak planu”, a strefy POG — przekroczenie czasu.

- **Przyczyna**: `identify.php` pamiętał w `cache/identify-winner/` „zwycięski” wariant warstw bez terminu
  ważności. Na serwerze został wpis z 19.8.3, gdy plany ogólne szły z Rejestru Urbanistycznego —
  portal nadal pytał najpierw RU (który nie ma planu Starogardu albo nie odpowiada), a jego pusta
  odpowiedź kończyła sprawdzanie. Lokalnie pamięć była pusta, dlatego testy przed wydaniem przechodziły.
- **Zmiana**: zapamiętany wariant = adres usługi + warstwy, ważny 24 h i tylko w tej samej wersji portalu;
  pusty wynik źródła zapasowego nie jest zapamiętywany. Stare wpisy są ignorowane — nie trzeba nic usuwać.
- Opis planu ogólnego bez identyfikatorów technicznych (identifier, lokalnyId, wersjaId…), z polskimi
  nazwami parametrów strefy: „Maks. wysokość zabudowy: 10 m”, „Uchwała (dziennik urzędowy): …”.
- `tools/test_identify_parse.php` — 21/21.
