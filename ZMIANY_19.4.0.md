# msportal 19.4.0 — jakość danych i wstępny screening

- Nowy endpoint `/vps/api/site/screening` i formularz w panelu RCN/BDOT10k. Wynik punktowy 500 m ze wskazaniem brakujących źródeł, bez podszywania się pod pełne badanie działki.
- Statystyki RCN obejmują pełną liczbę pasujących rekordów. Dla powyżej 15 000 transakcji mediany/kwartyle z powtarzalnej próby równomiernie losowej, z czytelnym ostrzeżeniem o przybliżeniu.
- Synchronizator sprawdza obecność rekordu importu i danych w indeksie, zanim uzna odpowiedź HTTP ETag/304 za wystarczającą.
- Endpoint `/vps/api/quality` udostępnia ograniczony stan obecności rekordów oraz wiek danych (pełny test integralności w skrypcie serwerowym), bez ujawniania URL lub sekretów.
- Usunięto niepotrzebne automatyczne `modulepreload` przy starcie, pozostawiając naturalne dynamiczne ładowanie ESM.
- Zachowano funkcje 19.3.1 i wszystkie istniejące źródła w konfiguracji VPS.

**Ograniczenia:** brak kompletnego screeningu granic działki, serwerowych analiz MPZP/NMT/GESUT, automatycznego adresowania wszystkich plików RCN i rzeczywistych testów na OVH; te wymagają kolejnych integracji i źródeł.

- Bezpieczna zmiana regionu: przy błędzie choćby jednego importu synchronizator zachowuje poprzednie źródła zamiast od razu je usuwać.
