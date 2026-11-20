# msportal 19.31.1 — mocniejsza rzeźba terenu w podkładzie Kartograficznym

## Co się zmienia (tylko podkład „Karto”)
- **Barwy wysokości (hipsometria)**:
  - zieleń nizin → żółć wyżyn (200–400 m) → brąz gór → jasna szarość szczytów;
  - progi gęstsze w niskich wysokościach, bo większość Polski leży poniżej 300 m.
- **Silniejsze cieniowanie**: przewyższenie rzeźby ×4 zamiast ×2,5, stoki w cieniu ciemniejsze — doliny, grzbiety i skarpy
  wyraźnie widać także na nizinach (np. dolina Wierzycy w Starogardzie).
- Barwy i cieniowanie są w jednym obrazie **przyciemniającym mapę (mnożenie)**: drogi, budynki i napisy pod spodem zostają czytelne.
- **Warstwice**:
  - ciemniejsze i grubsze, z wyraźniejszym opisem wysokości;
  - widoczne o jeden poziom wcześniej (od ok. 1:270 000);
  - gęstsze: co 10 m od ok. 1:140 000, co 5 m od ok. 1:70 000.

## Wydajność i pamięć
- Rzeźba to jedna warstwa liczona z tego samego kafla modelu wysokości, nałożona przy rysowaniu mapy, bez dodatkowego
  składania obrazu przez przeglądarkę.
- Przesuwanie mapy jest tak samo płynne jak w 19.31.0 (pomiar: 2,56 s zadań > 50 ms wobec 2,6 s).
- Pamięć wraca po zmianie podkładu tak jak w 19.31.0 (34,5 → 14,8 MB po minucie).

## Wgranie (aktualizacja_19.31.1.zip)
1. Wgraj `aktualizuj-19.31.1.php` i otwórz go w przeglądarce.
   W `poprawki_serwera` będzie „już zastosowana” (poprawka z 19.31.0 jest na serwerze).
2. Wgraj i nadpisz: `index.html`, `diagnostyka.html`, `VERSION.txt` i katalog `app-19.31.1/`.
3. Odśwież portal, wybierz podkład Karto.
4. Otwórz `aktualizuj-19.31.1.php?sprzatanie=1`, potem `verify-deployment.php` → `"deployment_consistent": true`.

Model wysokości ma rozdzielczość ok. 30 m: pokazuje formy terenu, nie drobne nasypy. Dokładne wysokości działki: profil i wysokości obszaru (NMT 1 m).
