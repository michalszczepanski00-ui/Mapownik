# msportal 19.55.0 — obszary uzupełnienia zabudowy z planów ogólnych

## Obszary uzupełnienia zabudowy (OUZ)

Po wejściu planu ogólnego decyzję o warunkach zabudowy wydaje się tylko w obszarze uzupełnienia zabudowy. Usługa GUGiK publikuje te obszary, ale rysuje je cienką przerywaną kreską. Pod kolorowymi strefami planu były praktycznie niewidoczne.

### Nowe warstwy

W grupie Planowanie przestrzenne są dwie nowe warstwy:

| Warstwa | Źródło | Widoczna od |
|---|---|---|
| **Obszary uzupełnienia zabudowy (plan ogólny)** | GUGiK, Plany Ogólne Gmin (uchwalone) | ok. 1:100 000, jak w usłudze |
| **Obszary uzupełnienia zabudowy (projekt planu)** | GUGiK, Projektowane Plany Ogólne Gmin | ok. 1:100 000 |

- **Styl własny:** ciemny obrys 2 px w kolorze „Bór” z palety i lekkie wypełnienie. Serwer pośredniczący dodaje do zapytania styl SLD (usługa GUGiK go obsługuje).
- **Zapas:** gdyby usługa przestała przyjmować styl, warstwa przełączy się na styl GUGiK.
- **Uwaga:** dziś uchwalony plan ogólny ma ok. 150 gmin. W 11 z 12 sprawdzonych są obszary uzupełnienia zabudowy.

### Karta działki

W grupie Planowanie jest nowy wiersz **„Uzupełnienie zabudowy”**:
- „w obszarze · 93OUZ” albo „poza obszarem”;
- dopisek „(projekt)”, gdy obszar pochodzi z projektu planu;
- po rozwinięciu wiersza: wyjaśnienie, co to znaczy dla decyzji o warunkach zabudowy, i „Pokaż na mapie”.

Szczegóły:
- **Kiedy jest wiersz:** tylko tam, gdzie w punkcie jest plan ogólny (uchwalony albo projekt). Bez planu pojęcie nie ma zastosowania.
- **Bez nowego zapytania:** informacja pochodziła już z odpowiedzi planu ogólnego („Symbol: OUZ”), ale karta jej nie pokazywała.
- **Sprawdzone na działce 113/2 w Paprotni (gm. Zapolice):** „Plan ogólny: uchwalony · 102SJ”, „Uzupełnienie zabudowy: w obszarze · 93OUZ”.

## Panel Warstwy bez legendy planów ogólnych

Plany ogólne (obszary planów, strefy, obszary uzupełnienia) nie pokazują już legendy w panelu Warstwy:
- ani pod włączonymi strefami;
- ani w rozwiniętych informacjach o warstwie.

Legenda planu jest nadal dostępna w przycisku **„Legenda”** na mapie.

## Serwer

- `api/_wms_sources.php`: źródła `pog_ouz` i `pog_draft_ouz` ze stylem SLD i wariantem zapasowym w stylu GUGiK.
- `api/wms.php`: podpis wariantu uwzględnia parametry stałe (np. styl).
  - Bez tego zapamiętany „zwycięski” wariant mylił wariant ze stylem z zapasowym — kafle przychodziły w stylu GUGiK.
  - Dla dotychczasowych źródeł (bez parametrów stałych) nic się nie zmienia.

## Testy

| Test | Wynik |
|---|---|
| Vitest | 95/95 (nowy test odczytu oznaczenia OUZ) |
| TypeScript | bez błędów |
| Kontrola wydania | bez błędów |
| Playwright | 15/15 |
| Diagnostyka (lokalny Apache) | 199 testów, **191 OK** (jak w 19.54.0) |
| Konsola przeglądarki | 0 błędów |

Diagnostyka nie przechodzi w tych samych miejscach co wcześniej: GDOŚ 502 z tego środowiska (2 testy), brak bazy RWDZ (2 testy), znany test „Faza 4”.

## Wgranie

Do **nowego** katalogu testowego, np. `/test30/`: cała zawartość `msportal-19.55.0-serwer.zip`, `index.html` i `.htaccess` na końcu.

**Nie nadpisuj `/test22/` ani produkcji.**
