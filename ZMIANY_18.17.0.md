# Mapownik 18.17.0 — wdrożone zmiany

15.10.2026

## Nawigacja

Sześć podpisanych grup: Przesuń, Sprawdź, Rysuj, Mierz, Teren, Przejazd. Wszystkie 18 narzędzi i skróty zachowane; pełna paleta opcjonalna.

## Krok pracy

Stale widoczna instrukcja, Cofnij punkt, Zakończ rysowanie, Anuluj szkic. Enter przy za małej liczbie punktów nie zapisuje linii/obszaru. Ctrl+Z w szkicu cofa punkt.

## Obiekty

Inspektor z Buforem, Analizuj otoczenie, Odległościami, Wysokościami, profilem linii, Duplikowaniem i oddzielnym Edytuj kształt. Zaznaczanie w trybie neutralnym nie przesuwa wierzchołków.

## Bufor

Podgląd jest oddzielną warstwą; zapis dopiero po Utwórz bufor. Zmiana odległości unieważnia stary podgląd; opóźnienie 140 ms ogranicza zbędne obliczenia podczas pisania. Esc i Anuluj nie dodają obiektu.

## Rysowanie

Jednorazowe tworzenie z opcją Dodawaj kolejne. Dla istniejących preferencji zachowano serię jako ustawienie migracyjne. Nowy użytkownik zaczyna jednorazowo.

## Tekst i etykiety

Zapisz/Anuluj oraz Enter/Esc; utrata fokusu nie zapisuje tekstu. Etykieta może być powiązana z obiektem. Kotwica śledzi przesunięcie środka celu; opis pozostaje w wybranym miejscu. Powiązanie można odłączyć.

## Okrąg i strzałka

Podgląd promienia przed kliknięciem. Promień można zmieniać w inspektorze z cofnięciem w jednej operacji. Strzałka domyślnie dwupunktowa, łamana pozostaje opcją.

## Pomiary

Zapis w projekcie albo pomiar tymczasowy. Tymczasowy wynik można dodać, skopiować lub wyczyścić. Ten sam model działa przy celowniku mobilnym.

## Projekt i eksport

Menu Projekt zawiera Otwórz, Zapisz plik i Udostępnij. W panelu Obiekty: Plik projektu i dane GIS oraz zarządzanie linkami. Eksport mapy zawiera raster i parametry kadru.

## Podkład eksportu

Nazwa faktycznego podkładu przed pobraniem. Źródło nieobsługiwane wymaga jawnego wyboru topografii lub braku podkładu. Podgląd renderowany tym samym endpointem co gotowy plik, w mniejszej rozdzielczości.

## Wiarygodność danych

Wspólna klasyfikacja jakości na komputerze i telefonie. Próba WMS bez trafienia, błędy próbek i niepełne dane nie zwiększają licznika potwierdzonego braku. Trafienia przybliżone są osobno. Zatrzymanie zachowuje gotowe wyniki i pozwala ponowić niesprawdzone źródła.

## Kolory i ikony

System/Jasny/Ciemny z pamiętaniem wyboru. Mocniejsze obrysy kontrolek, ciemny akcent #93c5fd, cztery doprecyzowane lokalne SVG. Kolory sieci i rastry źródłowe zachowują oryginalną konwencję.

## Teren i przejazd

Spadki mają uporządkowaną skalę kremowo-pomarańczową, wysokości oddzielną skalę, NoData szare kreskowanie i jawną legendę. Przejazd opisany jako symulacja orientacyjna, z limitem 2000 m i wyjaśnieniem obrysu pojazdu.

## Warstwy i podkład

Zestawy Działka/Uzbrojenie/Otoczenie. Nagłówek rozwija grupę, oddzielny Włącz/Wyłącz (liczba) zmienia całą grupę. Podkład i zdjęcia dostępny z szybkich podkładów oraz Warstw.

## Telefon

Mapa/Sprawdź/Mierz/Projekt w jednym wierszu, Więcej przy wyszukiwaniu. Wszystkie 18 narzędzi, parametry aktywnego zadania, Uzbrojenie ze wszystkimi siedmioma kategoriami. Karta działki 156 px z Do projektu/Analizuj/Bufor. Start od mapy bez odziedziczonego panelu.

## Klawiatura i wydajność

Opcje odpinania panelu w menu z nazwą. Nagłówek panelu otrzymuje fokus po otwarciu klawiaturą; Escape oddaje go przyciskowi. Font systemowy, lokalne SVG, bez nowych bibliotek i bez rozmywania nawigacji nad mapą. Monitor 41 źródeł zachowany.

## Weryfikacja

79/79 testów: 28 regresyjnych JS, 8 nowych jednostkowych, 26 ścieżek przeglądarkowych, 12 dodatkowych ścieżek UX/dotyku/klawiatury, 5 fixture PHP.

Składnia 262 plików JS i 21 PHP; 254 poprawnych wpisów modulepreload, 11 sum kontrolnych bibliotek.

## Zakres i ograniczenia

- Przygotowano paczkę do instalacji. W tej sesji nie wgrywano jej na mapownik.swiadectwa.net i nie badano aktualnej dostępności zewnętrznych źródeł.
- Testy UI używają kontrolowanych odpowiedzi API i przykładowej geometrii. Podgląd eksportu testowano jako ścieżkę żądania i odbioru PNG; po instalacji należy sprawdzić rzeczywiste kafle i końcowy plik na hostingu.
- Nie przeprowadzono badania z użytkownikami, fizycznego telefonu ani pełnej certyfikacji WCAG. Kontrola obejmuje emulację dotyku, klawiaturę, wybrane kontrasty i layout.
- Powiązana etykieta podąża za środkiem obiektu; nie jest zaczepem do konkretnego indeksu wierzchołka. Przy zmianie kształtu należy sprawdzić położenie kotwicy.
- Szablony projektów, dodatkowe modele pojazdów i dokładne numeryczne wymiary prostokąta są dalszym rozwojem; obecna aktualizacja nie dodaje takich formatów ani modeli.
- Biogazownie KOWR pozostają lokalizacjami orientacyjnymi z dotychczasowego zbioru. Aktualizacja interfejsu nie zwiększa precyzji ani aktualności danych źródłowych.
- Monitor działa w otwartej karcie, z pauzą w tle i offline; nie jest serwerową usługą 24/7.
