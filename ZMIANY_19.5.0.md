# msportal 19.5.0 — 20.10.2026

- Dodano analizator rzeczywistej działki EGiB z ULDK (geometria, powierzchnia, rysowanie na mapie).
- Dodano weryfikację jednostek administracyjnych z PRG OGC API Features.
- Dodano odległości BDOT10k mierzone od granicy działki oraz statystyki RCN w otoczeniu.
- Dodano opcjonalny rejestr warstw wektorowych `parcel_layers.py`: MPZP, POG, gleby, obszary chronione, uzbrojenie.
- Dodano precyzyjne obliczenia przecięć stref z działką, z jawnie oznaczonym brakiem pokrycia danych.
- Zabezpieczono operacje: limity API, limit jednego zadania oraz transakcyjny import warstw.
- Zachowano poprzedni panel RCN/BDOT10k, dane SQLite, Cockpit i mechanizm poboru danych 19.4.0.
- Wydanie testowe: zewnętrzne usługi oraz realny import plików z gmin wymagają weryfikacji na OVH.
