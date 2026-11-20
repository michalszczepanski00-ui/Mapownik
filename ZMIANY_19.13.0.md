# 19.13.0 — telefon w układzie v2: Sprawdź · Warstwy · Szkic · Pomiar · Projekt

Zawiera też 19.11.0 i 19.12.0 (na serwerze działała jeszcze 19.10.0). Bez zmian w API,
katalogu warstw, formacie projektu i na komputerze.

## Dolny pasek na telefonie (`MobileShell.js`, `34-v2.css`)

- Pięć pozycji jak na płótnie projektu (tablice 8–11): **Sprawdź · Warstwy · Szkic · Pomiar ·
  Projekt** (było: Mapa · Sprawdź · Pomiar · Projekt).
- **Sprawdź** zastępuje „Mapa”: zamyka arkusze i wraca do trybu „dotknięcie = karta działki”.
  Przesuwanie mapy palcem działa jak dotąd.
- **Warstwy** w pasku zamiast okrągłego przycisku po prawej (ten przycisk usunięty; przycisk
  lokalizacji zostaje).
- **Szkic** i **Pomiar** otwierają arkusz ze **wszystkimi narzędziami grupy w sekcjach** —
  tych samych co dok na komputerze:
  - Szkic: Obiekty (Punkt, Linia, Poligon, Prostokąt, Okrąg, Działka), Opis (Tekst, Strzałka,
    Etykieta), Przejazd, Edycja (Edytuj),
  - Pomiar: Pomiar (Odległość, Powierzchnia, Bufor), Teren (Profil terenu, Wysokości).
  Odległość, powierzchnia i profil nadal działają z celownikiem.
- Podświetlona zakładka odpowiada otwartemu arkuszowi albo grupie aktywnego narzędzia
  (np. rysowany poligon → Szkic).
- „Wszystkie narzędzia” w menu ⋯ pokazują teraz narzędzia pogrupowane jak w doku.

## Testy

- Telefon 390 × 844: przełączanie wszystkich pięciu zakładek, wybór Poligonu z arkusza Szkic
  (zakładka Szkic zostaje podświetlona), arkusz Pomiar z sekcją Teren, karta działki 60/18
  z werdyktem i „Pokaż na mapie”.
- `check_release.py` bez błędów, wersja spójna. Diagnostyka lokalnie: tylko testy sieciowe
  środowiska testowego.
