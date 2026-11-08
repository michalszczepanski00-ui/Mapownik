# Mapownik 18.18.0 — warstwy, źródła i NMT

15.10.2026

## Warstwy i grupy

61 pozycji katalogu. Siedem grup tematycznych: Działki i grunty, Planowanie przestrzenne, Uzbrojenie terenu, Energetyka, Środowisko i wody, Geologia i górnictwo, Rzeźba i wysokości. Osobno Dane pomocnicze i Archiwum. Zachowano identyfikatory 34 wcześniejszych pozycji i migrowano nazwy rozwiniętych grup.

## MIDAS

Złoża: 5, obszary: 4, dodane tereny: 3. Archiwalne 0/1/2 osobno. Jedne profile konfiguracji dla mapy, proxy i identyfikacji. Zmiana konfiguracji automatycznie zmienia klucz cache obrazów.

## Klasy gruntów

Klasy bonitacyjne I–VI i użytki EGiB korzystają przede wszystkim z KIEG, z dodatkowym wariantem dawnej integracji użytków. Zmieniona nazwa, opis pokrycia i priorytet na liście. Mapa glebowo-rolnicza oraz jej zasięg są osobnymi, opcjonalnymi warstwami. Nie dodano wyliczania udziału klas z obrazów WMS.

## Planowanie

POG i strefy korzystają z Rejestru Urbanistycznego: wiążące/realizowane, w trakcie przyjmowania i w opracowaniu. 13 typów stref bez ponownego rysowania tego samego zestawu. Nowe obszary MPZP według statusu RU; rysunek MPZP z integracji pozostaje osobno. Studium w Archiwum.

## Uzbrojenie

Poprawiono nazwy sieci specjalnych i niezidentyfikowanych. Zestaw wszystkich sieci KIUT pobiera jeden obraz. Wybór kategorii wyłącza zestaw i odwrotnie. Siedem dotychczasowych kategorii jest nadal dostępnych na komputerze i telefonie. Wspólna kolejka ogranicza KIUT do dwóch równoległych żądań.

## Energetyka

Dodane linie najwyższych napięć i stacje PSE, z opisem edycji III kwartał 2026. Skrót do tej samej warstwy lokalnej sieci KIUT nie tworzy dodatkowej kopii danych.

## Środowisko i zagrożenia

Osobny wybór dziesięciu kategorii GDOŚ, w tym pomników i stanowisk dokumentacyjnych. Zestawy zbiorcze zachowano dla starszych projektów w danych pomocniczych. Dodano obszary zagrożenia powodzią rzeczną, morską i awarią budowli piętrzących z usługi INSPIRE MZP/MRP Wód Polskich oraz SOPO.

## Wysokości i nachylenie

Mapa wysokości NMT oraz skróty do cieniowania i analizy nachylenia wskazanego obszaru. Pływający panel ograniczony do przestrzeni mapy, z uchwytami i przewijanym wnętrzem. Dok zajmuje maksymalnie 55% kolumny mapy; przelicza rozmiar przy zmianie okna. Rozkład nachyleń i wykopy/nasypy w zwijanych sekcjach. Eksport w stałym pasku poza przewijaną treścią.

## Diagnostyka

Monitor obejmuje 70 pozycji, w tym API i usługi WMS. Sprawdza Name i skonfigurowane znaczenie Title, prawidłowy obraz o oczekiwanym rozmiarze, brakujące nazwy, blokadę 403 i niepotwierdzone pokrycie. Test obrazu respektuje wersję WMS i osie EPSG:2180. Szczegóły oddzielają datę danych od czasu sprawdzenia konfiguracji i próby.

## Wydajność i cache

Nowe nakładki domyślnie wyłączone, preload 0. Mniejszy budżet bitmap nakładek niż podkładów. Ograniczanie i usuwanie anulowanych żądań w kolejce. Zestaw KIUT zamiast siedmiu jednoczesnych obrazów; współdzielony cache katalogów diagnostyki. Krótsza ważność obrazów działek, MPZP i KIUT, z zachowaniem ostatniego poprawnego obrazu przy awarii. Bez nowych bibliotek, fontów i procesów działających w tle.

## Testy

119/119 przypadków lokalnych. Składnia 264 JS i 23 PHP, 256 wpisów modulepreload.

## Zakres i ograniczenia

- Paczka przygotowana do wgrania na hosting. W tej sesji nie publikowano jej na mapownik.swiadectwa.net.
- Próby bezpośrednie potwierdziły katalogi RU, PSE, MIDAS, SOPO, gleb i NMT oraz poprawny format obrazu usługi INSPIRE MZP/MRP. Nie potwierdzają kompletności kraju ani każdego obiektu.
- Końcowe testy rzeczywistego proxy PHP zwróciły poprawne PNG dla MIDAS, PSE i MZP. Monitor potwierdził katalog i znaczenie złóż MIDAS. Wcześniej występowały ograniczenia pośrednika sieciowego środowiska; po wgraniu należy ponowić próby z docelowego hostingu. Nie wykonano pełnego testu wszystkich warstw z serwera produkcyjnego.
- GDOŚ blokował dostęp z sieci audytu kodem 403. Dodane kategorie mają oficjalne nazwy zbiorów, ale pełne renderowanie z docelowego hostingu wymaga sprawdzenia. Nie dodano zgadywanych adresów otulin ani automatycznego obchodzenia blokady.
- Publikacja klas gruntów zależy od powiatu. Poprawny pusty obraz KIEG nie pozwala ustalić klasy. Nie dołączono niezweryfikowanych usług poszczególnych powiatów jako rzekomo pewnego źródła zapasowego.
- Nachylenie nadal jest analizą wybranego obszaru na podstawie próbek NMT; nie dodano ogólnopolskiego rastra nachyleń 1 m ani magazynu nowych danych wektorowych.
- MZP/MRP jest prezentacją zbiorów INSPIRE. Nie utworzono osobnych przełączników prawdopodobieństwa 10/1/0,2% na podstawie niewłaściwych warstw „elementów narażonych”. Scenariusz i pokrycie należy sprawdzić w identyfikacji/Hydroportalu.
- Monitor pracuje w otwartej karcie i wstrzymuje się w tle/offline. Zachowuje 20 ostatnich prób na pozycję, nie stanowi monitoringu serwerowego 24/7. Rozpoczyna nową historię konfiguracji, aby nie przypisywać starych wyników zmienionym warstwom. Poprzednia historia nie jest usuwana z przeglądarki.
- Testy układu obejmują Chromium i sześć rozmiarów okna; nie obejmują fizycznych telefonów, Safari/Firefox ani pełnego badania WCAG. Nie zmieniano magazynu BDOT, danych udostępnień ani geometrii projektów.
