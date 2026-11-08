#!/usr/bin/env python3
"""
19.32.0 — baza pozwoleń na budowę i zgłoszeń (RWDZ, GUNB) dla narzędzia „Pozwolenia na budowę”.

Pobiera z dane.gov.pl (zbiór 3467) pliki „Wnioski i decyzje w sprawach budowlanych — województwo …”
oraz „Zgłoszenia w sprawach budowlanych — cały kraj od 2022 roku”, zostawia wpisy z ostatnich N lat
i zapisuje je w data/rwdz/rwdz.sqlite:

  investments  — jedna inwestycja (wniosek/decyzja albo zgłoszenie): daty, organ, numer, typ, opis, kubatura;
  parcels      — działki inwestycji (jednostka, obręb, numer) z indeksem (unit, obreb);
  meta         — data danych, data budowy, zakres lat.

Użycie:  python3 tools/build_rwdz_store.py [--years 3] [--out data/rwdz/rwdz.sqlite] [--cache katalog_na_zip]
Plik bazy wgrywa się na serwer do data/rwdz/ (FTP). Aktualizacja: co miesiąc (GUNB publikuje ok. 21. dnia).
Lokalizacje działek nie są w bazie — serwer pobiera je z ULDK przy pierwszym zapytaniu i pamięta
w cache/rwdz/geo.sqlite (ten plik przeżywa aktualizacje bazy).
"""
from __future__ import annotations
import argparse, csv, datetime as dt, io, json, os, re, sqlite3, sys, tempfile, urllib.request, zipfile

DATASET = 'https://api.dane.gov.pl/1.4/datasets/3467/resources?per_page=50'
UA = 'msportal-build-rwdz/19.32 (+https://mapownik.swiadectwa.net)'
csv.field_size_limit(10_000_000)

# Typ do filtrów narzędzia. Kategorie obiektów wg załącznika do Prawa budowlanego, gdzie przypisanie jest pewne;
# resztę rozstrzygają słowa w nazwie i rodzaju zamierzenia.
TYPE_RULES = [
    ('rozbiorka', r'rozbi[oó]rk'),
    ('energia', r'fotowolt|elektrowni|turbin|wiatrak|farm[ay] (pv|fotow|wiatr)|magazyn energii'),
    ('wielorodzinny', r'wielorodzinn|wielolokal'),
    ('dom', r'jednorodzinn|rekreacji indywidualnej|letniskow'),
    ('przemysl', r'hal[ai]? |hala|magazyn|przemysł|produkcyj|warsztat|logistycz'),
    ('uslugi', r'usług|handl|sklep|biur|hotel|pensjonat|szkoł|przedszkol|żłob|restaurac|gastronom|przychodni|szpital|apartament'),
    ('infrastruktura', r'sieci|sieć|kanalizac|wodociąg|gazoci|przyłącz|linii|kabl|telekomunik|maszt|stacj[ai] (trans|bazow)|drog|ulic|chodnik|parking|most|ścieżk'),
]
CATEGORY_TYPES = {'I': 'dom', 'XIII': 'wielorodzinny', 'XXVI': 'infrastruktura', 'XVII': 'przemysl', 'XVIII': 'przemysl'}


def classify(category: str, kind: str, intent: str, name: str) -> str:
    # Rodzaj z wniosku („Budynek mieszkalny jednorodzinny” / „Obiekt budowlany INNY NIŻ budynek mieszkalny jednorodzinny”)
    # sprawdzamy dokładnie — w treści drugiego wariantu też jest słowo „jednorodzinny”.
    text = f'{intent} {name}'.lower()
    if re.search(TYPE_RULES[0][1], text):
        return 'rozbiorka'
    if kind.lower().startswith('budynek mieszkalny jednorodzinny'):
        return 'dom'
    if category in CATEGORY_TYPES:
        return CATEGORY_TYPES[category]
    for type_name, pattern in TYPE_RULES[1:]:
        if re.search(pattern, text):
            return type_name
    return 'inne'


def fetch_json(url: str):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
        return json.load(r)


def download(url: str, target: str) -> None:
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=600) as r, open(target, 'wb') as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)


def rows_from_zip(path: str):
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith('.csv'))
        with z.open(name) as raw:
            reader = csv.reader(io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''), delimiter=';')
            header = next(reader)
            seen = {}
            cols = []
            for h in header:  # kolumny „cecha”, „ulica” występują dwa razy
                seen[h] = seen.get(h, 0) + 1
                cols.append(h if seen[h] == 1 else f'{h}_{seen[h]}')
            for row in reader:
                if len(row) >= len(cols) - 2:
                    yield dict(zip(cols, row))


def clean(value: str | None, limit: int = 200) -> str:
    v = re.sub(r'\s+', ' ', (value or '').strip().strip('"'))
    return v[:limit]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--years', type=int, default=3)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'rwdz', 'rwdz.sqlite'))
    ap.add_argument('--cache', default=None, help='katalog na pobrane ZIP (domyślnie tymczasowy, kasowany)')
    ap.add_argument('--only', default=None, help='np. opolskie — tylko jedno województwo (test)')
    args = ap.parse_args()
    cutoff = (dt.date.today() - dt.timedelta(days=round(365.25 * args.years))).isoformat()
    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp_db = out + '.building'
    if os.path.exists(tmp_db):
        os.remove(tmp_db)
    db = sqlite3.connect(tmp_db)
    db.executescript('''
        PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=4096;
        CREATE TABLE investments (id INTEGER PRIMARY KEY, src TEXT NOT NULL, date_in TEXT, date_dec TEXT, number TEXT, organ INTEGER,
            investor TEXT, type TEXT, category TEXT, kind INTEGER, intent INTEGER, name TEXT, volume REAL, status INTEGER, place TEXT);
        CREATE TABLE lookup (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE);
        CREATE TABLE parcels (inv INTEGER NOT NULL, unit TEXT NOT NULL, obreb TEXT NOT NULL, nr TEXT NOT NULL);
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    ''')
    resources = fetch_json(DATASET)['data']
    wanted = []
    for r in resources:
        a = r['attributes']
        title = a.get('title', '')
        if title.startswith('Wnioski i decyzje') or ('Zgłoszenia' in title and 'od 2022' in title):
            if args.only and args.only not in title and 'Zgłoszenia' not in title:
                continue
            # Plik bywa na dane.gov.pl (file_url) albo tylko jako odnośnik do serwera GUNB (link, np. śląskie).
            wanted.append((title, a.get('file_url') or a.get('link') or a.get('download_url'), a.get('data_date') or a.get('modified', '')[:10]))
    if not wanted:
        print('Nie znaleziono plików RWDZ w zbiorze 3467 — sprawdź dane.gov.pl.', file=sys.stderr)
        return 2
    work = args.cache or tempfile.mkdtemp(prefix='rwdz-')
    os.makedirs(work, exist_ok=True)
    keys: dict[str, int] = {}
    missing: list[str] = []
    lookups: dict[str, int] = {}

    def lookup(value: str | None):
        # Powtarzalne teksty (organ, rodzaj, zamierzenie, stan) raz w tabeli lookup — baza ok. 25% mniejsza.
        if not value:
            return None
        if value not in lookups:
            lookups[value] = db.execute('INSERT INTO lookup (value) VALUES (?)', (value,)).lastrowid
        return lookups[value]
    stats = {'rows': 0, 'kept': 0, 'investments': 0, 'parcels': 0}
    data_date = max(w[2] for w in wanted)
    for title, url, _ in wanted:
        zone = 'Z' if 'Zgłoszenia' in title else 'P'
        path = os.path.join(work, re.sub(r'[^a-z0-9]+', '-', title.lower())[:80] + '.zip')
        if not os.path.exists(path):
            print('pobieram', title, flush=True)
            try:
                download(url, path)
            except Exception as error:  # jeden brakujący plik nie zatrzymuje budowy — trafia do meta.missing
                print(f'  POMINIĘTO {title}: {error}', flush=True)
                missing.append(title)
                if os.path.exists(path):
                    os.remove(path)
                continue
        n0 = stats['kept']
        for row in rows_from_zip(path):
            stats['rows'] += 1
            date_in = (row.get('data_wplywu_wniosku') or row.get('data_wplywu_wniosku_do_urzedu') or '')[:10]
            if not date_in or date_in < cutoff:
                continue
            if args.only and zone == 'Z' and args.only not in (row.get('wojewodztwo_objekt') or ''):
                continue
            unit = clean(row.get('jednosta_numer_ew') or row.get('jednostki_numer'), 20)
            obreb = clean(row.get('obreb_numer'), 10)
            nr = clean(row.get('numer_dzialki'), 30)
            if not (unit and obreb and nr) or not re.fullmatch(r'\d{6}_\d(\.\d{4})?', unit):
                continue
            stats['kept'] += 1
            if zone == 'P':
                key = 'P|' + (row.get('numer_gunb') or (row.get('numer_urzad', '') + '|' + row.get('nazwa_organu', '')))
            else:
                key = 'Z|' + (row.get('numer_ewidencyjny_system') or (row.get('numer_ewidencyjny_urzad', '') + '|' + row.get('nazwa_organu', '')))
            inv = keys.get(key)
            if inv is None:
                category = clean(row.get('kategoria'), 8)
                kind = clean(row.get('rodzaj_inwestycji'), 80)
                intent = clean(row.get('nazwa_zamierzenia_bud') or row.get('rodzaj_zam_budowlanego'), 80)
                name = clean(row.get('nazwa_zam_budowlanego'), 180)
                try:
                    volume = float((row.get('kubatura') or '').replace(',', '.')) or None
                except ValueError:
                    volume = None
                street = clean(row.get('ulica'), 60)
                place = ', '.join(p for p in [clean(row.get('miasto'), 60), ' '.join(p for p in [street, clean(row.get('nr_domu'), 12)] if p)] if p)
                cur = db.execute('INSERT INTO investments (src, date_in, date_dec, number, organ, investor, type, category, kind, intent, name, volume, status, place) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
                    zone, date_in, (row.get('data_wydania_decyzji') or '')[:10] or None,
                    clean(row.get('numer_decyzji_urzedu') or row.get('numer_ewidencyjny_urzad') or row.get('numer_urzad'), 60),
                    lookup(clean(row.get('nazwa_organu'), 120)), clean(row.get('nazwa_inwestor'), 160) or None,
                    classify(category, kind, intent, name), category, lookup(kind), lookup(intent), name or None, volume,
                    lookup(clean(row.get('stan'), 60)), place or None))
                inv = cur.lastrowid
                keys[key] = inv
                stats['investments'] += 1
            db.execute('INSERT INTO parcels (inv, unit, obreb, nr) VALUES (?,?,?,?)', (inv, unit, obreb, nr))
            stats['parcels'] += 1
        print(f'  {title}: {stats["kept"] - n0} wpisów od {cutoff}', flush=True)
        if not args.cache:
            os.remove(path)
    print('indeksy…', flush=True)
    db.executescript('''
        DELETE FROM parcels WHERE rowid NOT IN (SELECT MIN(rowid) FROM parcels GROUP BY inv, unit, obreb, nr);
        CREATE INDEX parcels_region ON parcels (unit, obreb);
        CREATE INDEX parcels_inv ON parcels (inv);
    ''')
    meta = {'data_date': data_date, 'built_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'cutoff': cutoff,
            'years': str(args.years), 'missing': '; '.join(missing), 'source': 'GUNB — Rejestr Wniosków, Decyzji i Zgłoszeń (dane.gov.pl, zbiór 3467)', **{k: str(v) for k, v in stats.items()}}
    db.executemany('INSERT INTO meta (key, value) VALUES (?, ?)', meta.items())
    db.commit()
    db.execute('VACUUM')
    db.close()
    os.replace(tmp_db, out)
    print(json.dumps(meta, ensure_ascii=False, indent=1))
    print('baza:', out, f'{os.path.getsize(out) / 1048576:.1f} MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
