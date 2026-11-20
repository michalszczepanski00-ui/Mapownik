# 19.16.0 — spójny układ: jedna rama paneli, trzy rodzaje przycisków, jeden język stanów

Kroki 1–4 z propozycji „bardziej spójny layout”. Dotyczy komputera; na telefonie tylko
drobna poprawka karty działki. Bez zmian w API, katalogu warstw i formacie projektu.

## 1. Jedna rama panelu

- Karta po lewej i panele po prawej: ten sam nagłówek (tytuł 13 px, podtytuł 11 px, akcje
  28 px), ta sama ramka (bez obramowania, promień 10 px, jeden cień), stopka 11 px.
- Karta miejsca bez drugiego nagłówka: zakładka (Działka · Raport · Analizy) jest tytułem,
  a „przypnij wynik” i „zamknij” są na pasku zakładek. Znika też stopka karty.

## 2. Przyciski: główny, zwykły, tekstowy (+ chip)

- Wszystkie przyciski w panelach: wysokość 28–30 px, promień 7 px, tekst 12 px pogrubiony.
  Główny — akcent, zwykły — białe tło z ramką, tekstowy — sam akcent.
- Karta Działka: jedna akcja główna „Screening tej działki” i „Działania ▾” (Dodaj do projektu,
  Bufor wokół działki, Wysokości i nachylenie) — ten sam wzór co w panelu Obiekty.
  Wcześniej: pełny niebieski przycisk i rząd trzech obramowanych.
- „Pokaż na mapie” — przycisk tekstowy zamiast kolejnej pigułki.
- Jeden odcień akcentu (#1F4FD1, jak w projekcie); ciemny motyw bez zmian.

## 3. Jeden język stanów

● jest / znaleziono · ○ brak · ▲ ograniczenie, błąd albo „nie sprawdzono” · ◌ sprawdzanie —
w werdykcie karty Działka, w sekcjach źródeł (zamiast zielonych/żółtych/czerwonych kropek
i kolorowych plakietek „znaleziono”), w podsumowaniu screeningu (zamiast kolorowych pasków
z lewej) i przy „danych w widoku” w Warstwach. Znaczki biorą kolor tekstu, więc działają
w obu motywach; tylko ▲ jest bursztynowy.

## 4. Jedna skala

- Tekst w panelach 11 / 12 / 13 px, wiersze list i sekcji 28–30 px, pola formularzy 28 px,
  odstępy 4 / 8 / 12 px (karta Działka, sekcje źródeł, pola w Raporcie i Analizach, Obiekty).

## Poprawki przy okazji

- Panel Obiekty: miary zaznaczonego obiektu mogą zajmować dwa wiersze (w 19.15.0 „Obwód”
  bywał ucięty).
- Telefon: w podglądzie karty działki kafle werdyktu bez „Pokaż na mapie” (nie mieściło się).

## Nie w tej wersji

- Krok 5 (porządek w arkuszach stylów, test zrzutów ekranu w diagnostyce) — osobna wersja.
- Pasek stanu (Podkład OK / błąd źródła) zostaje przy swoich kolorach.

## Testy

- Jasny i ciemny motyw 1440 × 900: karta Działka z zakładkami i akcjami na pasku, „Działania”
  → Dodaj do projektu → panel Obiekty, zakładka Analizy, zamknięcie karty z paska zakładek.
- Telefon 390 × 844: karta działki.
- `check_release.py` bez błędów, wersja spójna; diagnostyka lokalnie — tylko testy sieciowe.
