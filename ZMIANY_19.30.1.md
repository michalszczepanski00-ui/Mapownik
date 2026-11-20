# msportal 19.30.1 — czytelność nowych podkładów

## Naprawione
- **Szare plamy na podkładach Pastel, Zmierzch i Karto.** Pola, łąki i inne tereny bez obiektów
  pokazywały szare tło mapy zamiast koloru podkładu. W Zmierzchu wyglądało to jak niewczytane
  fragmenty mapy.
  - **Przyczyna:** biblioteka stylów nie rysowała tła stylu na naszych warstwach OpenLayers.
  - **Naprawa:** tło jest teraz ustawiane bezpośrednio na warstwie.
- **Puste białe tabliczki zamiast numerów dróg w Zmierzchu.** Napis był jasny na białej tabliczce,
  teraz jest ciemny.
- **Tereny zabudowy znikały od skali ok. 1:70 000.** Styl bazowy wyłączał je od zoomu 12, więc miasto zlewało się
  z tłem. Teraz są widoczne przy każdym przybliżeniu (Pastel, Zmierzch i Karto).

## Czytelność
- **Pastel:**
  - wyraźniejsze obwiednie dróg, mocniejsze drogi główne i autostrady;
  - ciemniejsze napisy z grubszą obwódką;
  - wyraźniejsze lasy, parki, woda i tereny przemysłowe;
  - piaski, lotniska i granice w kolorach palety.
- **Zmierzch:**
  - jaśniejsze osiedla, lasy i parki, odróżnialne od tła;
  - lepiej widoczne ulice lokalne i ścieżki;
  - przygaszony wzór mokradeł (wcześniej jasna plama).

## Wgranie (paczka aktualizacja_19.30.1.zip)
1. Wgraj `aktualizuj-19.30.1.php` i otwórz go w przeglądarce (krok 1).
2. Wgraj `index.html`, `diagnostyka.html`, `VERSION.txt` i katalog `app-19.30.1/`.
3. Sprawdź portal (zwykłe odświeżenie wystarczy): przełącznik podkładów → Pastel, Zmierzch, Karto.
4. Otwórz `aktualizuj-19.30.1.php?sprzatanie=1`. Usunie `app-19.30.0/`, stary katalog `vendor/ol-esm/` i stare skrypty.
5. `verify-deployment.php` → `"deployment_consistent": true`.
