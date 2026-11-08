BIOGAZOWNIE ROLNICZE KOWR — dane dla Mapownika

Rejestr KOWR z 16.09.2026 r.
Źródło rejestru: https://www.gov.pl/web/kowr/rejestr-wytworcow-biogazu-rolniczego

Wykaz obejmuje 215 instalacji i 177 wytwórców. Każda instalacja ma punkt
orientacyjny. 208 punktów pochodzi z geolokalizacji kodu pocztowego, a 7 z
lokalizacji miejscowości lub korekty adresu. Współrzędne nie wskazują działki
instalacji. Przed analizą odległości sprawdź metodę i źródło w oknie punktu
i potwierdź lokalizację.

PLIKI
- installations.json — dane warstwy pobierane po jej włączeniu.
- installations.csv — pełny wykaz do otwarcia z informacji o warstwie.
- locations.csv — współrzędne, metoda geolokalizacji i źródło dla importu.
- kowr-20260916-geolokalizacja.xlsx — wejściowy skoroszyt rejestru i lokalizacji.
- kowr-20260916.pdf — źródłowy rejestr KOWR.

AKTUALIZACJA NA WINDOWS
1. Zainstaluj Python 3 i biblioteki:
   py -3 -m pip install -r tools\requirements-kowr.txt
2. Przeciągnij kompletny skoroszyt KOWR z arkuszami „Rejestr” i
   „Geolokalizacja” na tools\KOWR_AKTUALIZUJ.bat. Skrypt zatrzymuje import,
   jeśli układ tabeli, dane instalacji albo współrzędne są niepełne.
3. Sprawdź liczbę wytwórców i instalacji w konsoli. Otwórz kilka punktów na
   mapie i sprawdź ich metodę oraz źródło geolokalizacji.
4. Na serwer wgraj installations.json i installations.csv. Pozostałe pliki
   danych są blokowane regułami .htaccess.

Instalacje z tym samym kodem pocztowym mogą leżeć pod jednym punktem. Okno
punktu pokaże wtedy wszystkie wpisy. Warstwa służy do przeglądu wykazu, a nie
do potwierdzania lokalizacji inwestycji ani pomiarów odległości.
