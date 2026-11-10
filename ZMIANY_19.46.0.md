# msportal 19.46.0 — poprawki karty działki, cen, Esc, statusu warstw i szybszy start

Poprawki zgłoszonych błędów (karta działki 3922/6, Wałcz) i wydajności.

## Karta działki
1. **Plan ogólny w podsumowaniu uwzględnia projekt planu.**
   - **Przyczyna:** podsumowanie brało pod uwagę tylko plan uchwalony. Przy projekcie w opracowaniu u góry było „brak planu”, a niżej, w sekcji Planowanie, ten sam projekt ze strefą.
   - **Teraz:**
     - w podsumowaniu karty „uchwalony (strefa)” albo „projekt (4SU)” (podpowiedź: projekt planu, jeszcze nieuchwalony);
     - „Pokaż na mapie” włącza warstwę projektów planów ogólnych;
     - porównanie działek pokazuje to samo.
2. **Rekordy planu bez powtórzeń.** Usługa planów ogólnych zwraca ten sam obiekt z kilku warstw; serwer usuwa teraz duplikaty (`api/_identify_parse.php`).
3. **Polskie etykiety pól.** Zamiast surowych nazw z usługi:

   | Było | Jest |
   |---|---|
   | `typPlanu` | Rodzaj planu |
   | `poziomHierarchii` | Poziom |
   | `tytulAlternatywny` | Nazwa skrócona |
   | `profilPodstawowy`, `profilDodatkowy` | Profil podstawowy, Profil dodatkowy |
   | `charakterUstalenia` | Charakter ustalenia |

   - **Data przy projekcie** (status „w opracowaniu”): opisana jako „Data wersji”, nie „Obowiązuje od”. Tak samo w raporcie PDF.
   - **Listy** („teren usług, teren komunikacji”): ze spacjami po przecinkach.
4. **Klasa gruntu — licznik.** Odpowiedź ewidencji bez klasy (sam identyfikator i grupa rejestrowa) nie liczy się już jako trafienie: „Grunty 0/1”, w podsumowaniu „brak w usłudze”.

## Ceny transakcyjne (RCN)
5. **Wspólne ustawienia.** Karta działki, zakładka Raport, raport PDF „Dla kupującego” i porównanie działek liczą medianę dla 500 m i 5 lat (grunty).
   - **Wcześniej:** karta 3 lata, raport 5 lat, porównanie 1 km — stąd 116 i 418 zł/m² dla tej samej działki.
   - **Teraz:** karta podaje parametry: „W okolicy (500 m, 5 lat)”.
6. **Mediana z 1–2 transakcji** nie jest pokazywana jako wynik:
   - **karta działki:** „za mało (1)”;
   - **zakładka Raport i raport PDF:** ostrzeżenie „orientacyjnie”;
   - **porównanie działek:** dopisek „tylko 1 trans.”.
7. **Udziały.** Udziały były i są wyłączone z mediany. Ich cena za m² na liście transakcji jest teraz liczona od części powierzchni odpowiadającej udziałowi. Przykład:

   | Transakcja | Było | Jest |
   |---|---|---|
   | dz. 3820/4, udział 1/10, 1230 zł | 22 zł/m² (cena dzielona przez całą działkę) | 216 zł/m² |

   Opis pozycji: „udział 1/10 — zł/m² od części działki, poza medianą”.

## Interfejs
8. **Esc** przy otwartym panelu (np. Eksport) zamyka tylko ten panel, także gdy fokus jest poza nim.
   - **Wcześniej:** trafiał do polecenia „wróć do przesuwania mapy”, które wyłączało narzędzie Sprawdź i kasowało wybraną działkę.
   - **Kolejność:** rozpoczęty szkic, pola tekstowe, listy i okna dialogowe obsługują Esc po swojemu, jak dotąd.
9. **Status warstwy (np. KIEG).**
   - **Wcześniej:** po kilku wolnych odpowiedziach GUGiK status zostawał „Źródło niedostępne”, choć działki były na mapie.
   - **Teraz:** gdy ostatni obraz się wczytał, status to najwyżej „z przerwami”.
10. **Wybrana działka** ma wyraźny obrys: niebieska linia 3 px na białej obwódce i wypełnienie 16%. Wcześniej była to linia 2 px z wypełnieniem 8%.
11. **Karta działki:**
    - przyciski „Do projektu / Bufor / Wysokości / 3D” w wąskiej karcie przechodzą do drugiego wiersza zamiast wychodzić poza krawędź;
    - przycisk raportu w Analizach nie ucina nazwy.
12. **Nazwa „Mapownik”** wszędzie, gdzie widzi ją użytkownik:
    - tytuł strony i ekran wczytywania;
    - pasek i paleta poleceń;
    - komunikaty, nazwy warstw i plików;
    - nowy opis strony (meta description).

## Wydajność startu
Pomiar na tym samym serwerze, pierwsze wejście, łącze 4G (opóźnienie 150 ms, 1,6 Mb/s):

| | 19.45.0 | 19.46.0 |
|---|---|---|
| Czas do gotowej mapy | 16,4 s | **4,6 s** |
| Zapytania do serwera | 176 | 31 |
| Pobrane dane | 2752 KB | 743 KB |
| Pliki JS przy starcie (przed kompresją) | 140 plików, 2,9 MB | 22 pliki, 1,9 MB |

Co zmieniono:
- **Diagnostyka budowana osobno** (`assets/build/diag/`). W 19.45.0 wspólne budowanie dzieliło kod portalu na ponad 140 drobnych plików.
- **Ikony:** 629 KB → 33 KB. Diagnostyka importowała cały pakiet ikon, a wspólny plik ikon pobierał też portal. Teraz tylko ikony importowane imiennie (`diag/ikony.js`).
- **zod:** 383 KB → 95 KB. `import * as z from 'zod'` zamiast obiektu `z` (który ciągnął wszystkie lokalizacje), a test diagnostyki sprawdza zod przez schemat aplikacji.
- **Okno raportu PDF** (ustawienia, szablony, reguły) i **eksport „jak na ekranie”** (60 KB) ładują się przy pierwszym użyciu.
- **`npm run build`** wypisuje liczbę i rozmiar plików ładowanych przy starcie (`STARTUP_LIST=1` — pełna lista).

Na później:
- **Usługi mapy** (profil terenu, droga, walidacja topologii) są tworzone przy starcie — wyświetlają obiekty zapisane w projekcie. Ich odroczenie wymaga przebudowy uruchamiania usług.
- **zod/mini:** dalsze ok. 80 KB, wymaga przepisania ok. 170 schematów.
- **Arkusz stylów:** 235 KB.

## Znane ograniczenie
**Nakładające się etykiety** (np. przystanek na numerach działek): numery działek KIEG są częścią obrazu z GUGiK, a nazwy przystanków — obrazu podkładu OSM. Dwóch obrazów nie da się rozsunąć w przeglądarce. Przy sprawdzaniu numerów pomaga podkład bez etykiet albo ortofotomapa.

## Testy
- **Vitest:** 71 testów (nowe: wspólne ustawienia cen i mała liczba transakcji, plan ogólny z mapy planów w porównaniu, status źródła).
- **PHP:** `tools/test_19.46.0.php` (opis planów: duplikaty, etykiety, „Data wersji”) w kontroli wydania.
- **Playwright:** 15 scenariuszy (nowe: Esc zamyka Eksport, a działka zostaje; start bez paczki diagnostyki).
- **Diagnostyka na lokalnym Apache:** 198 testów, 186 OK — jak w 19.45.0 (różnice to chwilowe błędy serwerów PIG i BDOT10k).
- **Kontrola wdrożenia i kontrola wydania:** bez błędów.
- **Karta działki 321701_1.0001.3922/6 (Wałcz)** sprawdzona w przeglądarce na lokalnym Apache.

## Wgranie
Jak 19.45.0: cała zawartość `msportal-19.46.0-serwer.zip` („nadpisz zawsze”), `index.html` i `.htaccess` na końcu. Potem `verify-deployment.php` → `"leftover_files": []` (usuń katalogi `app-*`, jeśli zostały).
