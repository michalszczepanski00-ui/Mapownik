/**
 * 19.40.0 — jawne reguły wniosków raportu PDF. Bez sztucznej inteligencji i bez punktowej oceny działki.
 *
 * Każdy wniosek ma:
 *   kind — 'fakt' (wpis w rejestrze), 'obliczenie' (wynik obliczenia z danych), 'ryzyko' (interpretacja reguły),
 *          'weryfikacja' (brak danych, awaria usługi, rejestr niekompletny, sprawa do sprawdzenia u źródła);
 *   sev  — 1: może wykluczyć lokalizację, 2: wymaga procedury lub uzgodnienia, 3: informacyjne (kolejność czytania);
 *   title, text, link? [etykieta, adres].
 * Reguły nigdy nie stwierdzają, że inwestycja jest możliwa, działka odpowiednia albo moc dostępna.
 * Progi (zasady praktyczne i progi z przepisów) można zmienić w konfiguracja/raport-pdf.json → "reguly": {"progi": {…}, "wylaczone": […]}.
 */
export const RULES_VERSION = '1.0';

export const INVEST_TYPES = [
    ['ogolny', 'Ogólny'],
    ['biometan', 'Biometanownia, biogazownia'],
    ['pv', 'Fotowoltaika, magazyn energii'],
    ['przemysl', 'Przemysł, logistyka, odpady'],
];
export const INVEST_LABEL = Object.fromEntries(INVEST_TYPES);

export const DEFAULT_THRESHOLDS = {
    zabudowaMieszkaniowaM: 300, // biometan, przemysł: budynek mieszkalny bliżej → ryzyko konfliktu (zasada praktyczna)
    spadekProcent: 5, // biometan, przemysł: spadek powyżej … %
    spadekUdzial: 20, // … na ponad … % powierzchni → niwelacja (zasada praktyczna)
    spadekPvProcent: 15, // PV: spadek powyżej … % na ponad spadekUdzial % powierzchni
    naturaBliskoM: 1000, // Natura 2000 bliżej → do weryfikacji w RDOŚ
    lasBliskoM: 30, // PV: las bliżej granicy → możliwe zacienienie
    minBokProstokataM: { biometan: 60, przemysl: 40, pv: 0, ogolny: 0 }, // krótszy bok największego prostokąta (zasada praktyczna)
};

export const LINKS = {
    gdos: ['Geoserwis GDOŚ', 'https://geoserwis.gdos.gov.pl/mapy/'],
    isok: ['Hydroportal ISOK — mapy zagrożenia powodziowego', 'https://wody.isok.gov.pl/imap_kzgw/?gpmap=gpMZP'],
    nid: ['Mapa zabytków NID', 'https://mapy.zabytek.gov.pl/nid/'],
    midas: ['MIDAS — PIG-PIB', 'https://midas.pgi.gov.pl/'],
    psg: ['Mapa Chłonności — Polska Spółka Gazownictwa', 'https://www.psgaz.pl/'],
    kowr: ['KOWR — biogazownie rolnicze, warunki lokalizacji', 'https://www.gov.pl/web/kowr/biogazownie-rolnicze-nowe-warunki-od-11-wrzesnia'],
    kowrRejestr: ['Rejestr wytwórców biogazu rolniczego (KOWR)', 'https://www.gov.pl/web/kowr/rejestr-wytworcow-biogazu-rolniczego'],
    bdl: ['Bank Danych o Lasach', 'https://bdl.lasy.gov.pl/portal/mapy'],
    geoportal: ['Geoportal krajowy', 'https://geoportal.gov.pl/'],
};

export const DISCLAIMER_LINE = 'Wstępna analiza danych publicznych — nie potwierdza możliwości realizacji inwestycji.';

const nf = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const pct = (share) => (share >= 0.995 ? '100%' : share < 0.01 ? '< 1%' : `${nf.format(share * 100)}%`);
const dist = (m) => (m >= 1000 ? `${nf1.format(m / 1000)} km` : `${nf.format(Math.max(1, Math.round(m / (m > 100 ? 10 : 1)) * (m > 100 ? 10 : 1)))} m`);
const area = (m2) => (m2 >= 10000 ? `${nf1.format(m2 / 10000)} ha` : `${nf.format(m2)} m²`);
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? few : many);

/** Progi z konfiguracji serwera (nieznane klucze i błędne wartości pomijane). */
export function mergeThresholds(file) {
    const out = structuredClone(DEFAULT_THRESHOLDS);
    const src = file?.progi ?? file?.thresholds ?? {};
    for (const [k, v] of Object.entries(src)) {
        if (!(k in out)) continue;
        if (typeof out[k] === 'number' && Number.isFinite(Number(v)) && Number(v) >= 0) out[k] = Number(v);
        else if (typeof out[k] === 'object' && v && typeof v === 'object') for (const [t, n] of Object.entries(v)) if (t in out[k] && Number.isFinite(Number(n))) out[k][t] = Number(n);
    }
    const disabled = Array.isArray(file?.wylaczone ?? file?.disabled) ? (file.wylaczone ?? file.disabled).map(String) : [];
    return { thresholds: out, disabled };
}

const zoneCode = (label) => (String(label ?? '').match(/(SW|SJ|SZ|SU|SH|SP|SR|SI|SN|SC|SG|SO|SK)\b/) ?? [])[1] ?? null;
const ZONE_NAMES = { SW: 'wielofunkcyjna z zabudową wielorodzinną', SJ: 'wielofunkcyjna z zabudową jednorodzinną', SZ: 'wielofunkcyjna z zabudową zagrodową', SU: 'usługowa', SH: 'handlu wielkopowierzchniowego', SP: 'gospodarcza', SR: 'produkcji rolniczej', SI: 'infrastrukturalna', SN: 'zieleni i rekreacji', SC: 'cmentarzy', SG: 'górnictwa', SO: 'otwarta', SK: 'komunikacyjna' };

/** Klasy spadku z sekcji terenu → udział powierzchni o spadku ≥ próg (klasy 0–2, 2–5, 5–10, 10–15, >15). */
function slopeShareAbove(teren, limit) {
    const bounds = [[0, 2], [2, 5], [5, 10], [10, 15], [15, Infinity]];
    return (teren?.classes ?? []).reduce((sum, [, v], i) => sum + (bounds[i][0] >= limit ? (v ?? 0) : 0), 0);
}

const isSection = (options, id) => options.sections.includes(id);

/**
 * Parametry karty decyzyjnej (strona 1): [{ label, value, kind }].
 */
export function decisionParameters(ctx) {
    const { base, r, options } = ctx;
    const rows = [];
    const add = (label, value, kind) => rows.push({ label, value, kind });
    const s = base.shape;
    const multi = base.parcels.length > 1;
    add('Powierzchnia i wymiary', `${area(base.areaM2)}${multi ? ` (${base.parcels.length} działki)` : ''}${s ? ` · ok. ${nf.format(s.length)} × ${nf.format(s.width)} m${s.rect ? ` · największy prostokąt ${nf.format(s.rect.a)} × ${nf.format(s.rect.b)} m` : ''}` : ''}`, 'obliczenie');
    const plan = r.plan;
    if (isSection(options, 'pog') || isSection(options, 'mpzp')) {
        if (plan?.error) add('Plan ogólny i MPZP', `rejestr nie odpowiedział (${plan.error})`, 'weryfikacja');
        else {
            const matches = plan?.data?.layers?.pog?.matches ?? [];
            const zones = matches.filter((m) => m.kind === 'strefa');
            const act = matches.find((m) => m.kind === 'akt');
            add('Plan ogólny', zones.length ? zones.map((z) => `${z.label}${z.partPct != null ? ` (${z.approximate ? '≈ ' : ''}${nf.format(z.partPct)}%)` : ''}`).join('; ') : act ? `${act.label} — strefy nierozpoznane` : 'brak w rejestrze', zones.length ? 'fakt' : 'weryfikacja');
            const mp = plan?.data?.layers?.mpzp?.matches ?? [];
            add('MPZP', mp.length ? mp.slice(0, 2).map((m) => m.label).join('; ') : 'brak w rejestrze', mp.length ? 'fakt' : 'weryfikacja');
        }
        const o = r.ouz;
        if (o?.data) add('Obszar uzupełnienia zabudowy', o.data.summary, 'weryfikacja');
    }
    const t = r.teren?.data;
    if (t) add('Teren', `${nf1.format(t.min)}–${nf1.format(t.max)} m n.p.m. · spadek śr. ${nf1.format(t.slopeMean ?? 0)}% · ${nf.format(slopeShareAbove(t, 5))}% pow. ponad 5%`, 'obliczenie');
    else if (r.teren?.error) add('Teren', 'NMT nie odpowiedział', 'weryfikacja');
    const env = [];
    let envKind = 'obliczenie';
    const pz = r.przyroda?.data;
    if (pz) {
        const n = pz.share?.natura; const g = pz.share?.other;
        env.push(n && !n.error ? `Natura 2000 ${n.insideCount ? pct(n.share) : `0% (najbliżej ${pz.dist?.natura?.error ? 'odległość nieustalona' : pz.dist?.natura?.count ? dist(pz.dist.natura.minDist) : '> 3 km'})`}` : 'Natura 2000 — brak odpowiedzi');
        env.push(g && !g.error ? `formy ochrony ${g.insideCount ? pct(g.share) : '0%'}` : 'formy ochrony — brak odpowiedzi');
        if ((n?.error) || (g?.error)) envKind = 'weryfikacja';
    } else if (isSection(options, 'przyroda')) { env.push('ochrona przyrody — brak odpowiedzi'); envKind = 'weryfikacja'; }
    const lb = r.las?.data?.bdot;
    if (lb && !lb.error) env.push(`las ${lb.insideCount ? pct(lb.share) : '0%'}`);
    const w = r.inne?.data?.water;
    if (w && !w.error) env.push(`wody ${w.insideCount ? pct(w.share) : '0%'}`);
    if (env.length) add('Ograniczenia środowiskowe (udział powierzchni)', env.join(' · '), envKind);
    const f = r.powodz;
    if (f?.data) add('Zagrożenie powodziowe', (f.data.found ? `${f.data.share != null ? `${pct(f.data.share)} terenu` : 'tak'}${f.data.oszp ? ' · obszar szczególnego zagrożenia (10% / 1%)' : f.data.scenarios.length ? ` · ${f.data.scenarios.join('; ')}` : ''}` : 'brak trafienia w sprawdzonych danych') + (f.data.warning ? ' · ' + f.data.warning : ''), f.data.warning ? 'weryfikacja' : 'obliczenie');
    else if (f?.error) add('Zagrożenie powodziowe', 'ISOK nie odpowiedział', 'weryfikacja');
    const g = r.gleby?.data;
    if (g) {
        const cls = Object.entries(g.classCounts ?? {}).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 4);
        const comp = Object.entries(g.complexes ?? {}).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n})`).slice(0, 3);
        add('Gleby (siatka punktów)', `${cls.length ? `klasy w EGiB: ${cls.join(', ')}` : 'klasy: brak w usłudze EGiB'}${comp.length ? ` · kompleksy: ${comp.join(', ')} z ${g.points} pkt` : ''}`, cls.length ? 'fakt' : 'weryfikacja');
    }
    const res = r.otoczenie?.data?.residential;
    if (res && !res.error && res.tilesMissing && res.nearest == null) add('Zabudowa mieszkaniowa', 'brak budynków w części objętej bazą — reszta obszaru poza zasięgiem bazy BDOT10k', 'weryfikacja');
    else if (res && !res.error) add('Zabudowa mieszkaniowa', res.nearest == null ? 'brak budynków mieszkalnych w 1 km (BDOT10k)' : `najbliższy budynek ${res.nearest === 0 ? 'w terenie' : `≈ ${dist(res.nearest)}`} · ${res.counts[2]} w 500 m · ${res.counts[3]} w 1 km`, 'obliczenie');
    else if (isSection(options, 'otoczenie')) add('Zabudowa mieszkaniowa', 'niesprawdzona — brak lokalnej bazy BDOT10k', 'weryfikacja');
    const u = r.uzbrojenie;
    if (u?.data) {
        for (const [src, label] of [['kiut_power', 'Sieć elektroenergetyczna'], ['kiut_gas', 'Sieć gazowa']]) {
            const n = u.data.networks.find((x) => x.source === src);
            if (!n) continue;
            if (n.error) add(label, 'KIUT nie odpowiedział', 'weryfikacja');
            else add(label, n.insideCount ? 'przebiega przez teren' : n.count ? `≈ ${dist(n.minDist)} od granicy` : `brak w ${nf.format(u.data.bufferM)} m`, 'obliczenie');
        }
    } else if (u?.error) add('Sieci (KIUT)', 'KIUT nie odpowiedział', 'weryfikacja');
    return rows;
}

/**
 * Wnioski: [{ id, kind, sev, title, text, link }]. ctx: { base, r, options, rules: { thresholds, disabled } }.
 */
export function evaluateRules(ctx) {
    const { base, r, options } = ctx;
    const T = ctx.rules?.thresholds ?? DEFAULT_THRESHOLDS;
    const disabled = new Set(ctx.rules?.disabled ?? []);
    const type = options.investType ?? 'ogolny';
    const heavy = type === 'biometan' || type === 'przemysl';
    const out = [];
    const add = (id, kind, sev, title, text, link) => { if (!disabled.has(id)) out.push({ id, kind, sev, title, text, link }); };
    const has = (id) => isSection(options, id);

    // ---- ochrona przyrody
    const pz = r.przyroda;
    if (has('przyroda')) {
        if (pz?.error) add('przyroda.brak', 'weryfikacja', 3, 'Ochrona przyrody', `GDOŚ nie odpowiedział (${pz.error}) — sprawdź w geoserwisie GDOŚ.`, LINKS.gdos);
        else if (pz?.data) {
            const d = pz.data; const n = d.share?.natura; const o = d.share?.other;
            if (n?.insideCount) add('przyroda.natura', 'ryzyko', 1, 'Natura 2000', `${pct(n.share)} terenu w obszarze Natura 2000${d.natura?.length ? ` (${d.natura.join('; ')})` : ''}. Przedsięwzięcie może wymagać oceny oddziaływania na obszar Natura 2000.`, LINKS.gdos);
            else if (d.dist?.natura?.count && d.dist.natura.minDist <= T.naturaBliskoM) add('przyroda.natura-blisko', 'weryfikacja', 3, 'Natura 2000 w pobliżu', `Najbliższy obszar Natura 2000 ≈ ${dist(d.dist.natura.minDist)} od granicy. Zakres postępowania środowiskowego zależy od rodzaju i skali przedsięwzięcia — RDOŚ.`, LINKS.gdos);
            if (o?.insideCount) add('przyroda.formy', 'ryzyko', 2, 'Forma ochrony przyrody', `${pct(o.share)} terenu w parku, rezerwacie, obszarze chronionego krajobrazu albo użytku ekologicznym${d.other?.length ? ` (${d.other.join('; ')})` : ''}. Obowiązują zakazy z aktu ustanawiającego formę ochrony.`, LINKS.gdos);
            if (n?.error || o?.error) add('przyroda.udzial', 'weryfikacja', 3, 'Ochrona przyrody', 'Udział powierzchni nie został zmierzony (GDOŚ nie odpowiedział w pełni) — sprawdź w geoserwisie GDOŚ.', LINKS.gdos);
        }
    }
    // ---- powódź
    const f = r.powodz;
    if (has('powodz')) {
        if (f?.error) add('powodz.brak', 'weryfikacja', 2, 'Zagrożenie powodziowe', `ISOK nie odpowiedział (${f.error}) — sprawdź w Hydroportalu.`, LINKS.isok);
        else if (f?.data?.found) {
            const share = f.data.share != null ? `${pct(f.data.share)} terenu` : 'Część terenu';
            if (f.data.oszp) add('powodz.oszp', 'ryzyko', heavy ? 1 : 2, 'Obszar szczególnego zagrożenia powodzią', `${share} w obszarze zagrożenia, w tym scenariusze 10% lub 1% (obszar szczególnego zagrożenia powodzią). Zakazy z art. 77 Prawa wodnego, m.in. dla przetwarzania odpadów i gromadzenia substancji mogących zanieczyścić wody; zwolnienie wymaga decyzji Wód Polskich.`, LINKS.isok);
            else add('powodz.inne', 'ryzyko', 3, 'Zagrożenie powodziowe', `${share} w obszarze zagrożenia${f.data.scenarios.length ? ` (${f.data.scenarios.join('; ')})` : ' (scenariusz nieustalony w punktach kontrolnych)'}.`, LINKS.isok);
        }
    }
    // ---- las
    const l = r.las;
    if (has('las') && l?.data) {
        const b = l.data.bdot;
        if (b?.insideCount || l.data.found) add('las.w-terenie', 'ryzyko', 2, 'Las w terenie', `${b?.insideCount ? `${pct(b.share)} terenu to las (BDOT10k)` : 'Las w punktach kontrolnych (BDL)'}${l.data.owners?.length ? `; własność: ${l.data.owners.join('; ')}` : ''}. Zabudowa wymaga zmiany przeznaczenia i wyłączenia z produkcji leśnej.`, LINKS.bdl);
        else if (type === 'pv' && b?.count && b.minDist <= T.lasBliskoM) add('las.cien', 'ryzyko', 3, 'Las przy granicy', `Las ≈ ${dist(b.minDist)} od granicy — możliwe zacienienie paneli na krawędzi terenu.`);
        if (b?.error && !l.data.bdl) add('las.brak', 'weryfikacja', 3, 'Las', 'BDOT10k i BDL nie odpowiedziały — sprawdź użytki w ewidencji gruntów.', LINKS.bdl);
    } else if (has('las') && l?.error) add('las.brak', 'weryfikacja', 3, 'Las', `Nie udało się sprawdzić (${l.error}).`, LINKS.bdl);
    // ---- gleby
    const g = r.gleby?.data;
    if (has('gleby') && g) {
        const rel = type === 'pv' || type === 'biometan' || type === 'ogolny';
        if (g.highClassPoints) add('gleby.klasy', 'ryzyko', 2, 'Grunty klas I–III', `Klasy I–III w ${g.highClassPoints} z ${g.points} punktów (EGiB).${rel ? ' Ograniczenia lokalizacji PV i biogazowni, zgoda na zmianę przeznaczenia i opłaty za wyłączenie z produkcji rolnej.' : ' Zmiana przeznaczenia wymaga zgody i wyłączenia z produkcji rolnej.'}`);
        else if (g.highComplexPoints) add('gleby.kompleksy', 'weryfikacja', 2, 'Możliwe grunty wysokich klas', `Kompleksy 1, 2, 10 lub 1z (gleby pszenne bardzo dobre i dobre) w ${g.highComplexPoints} z ${g.points} punktów mapy glebowo-rolniczej — zwykle klasy I–III. Klasy bonitacyjne sprawdź w ewidencji gruntów.`);
        else if (g.midComplexPoints && !Object.keys(g.classCounts ?? {}).length) add('gleby.kompleksy-srednie', 'weryfikacja', 3, 'Klasy gleb', `Kompleksy 3, 4, 8 lub 11 w ${g.midComplexPoints} z ${g.points} punktów — możliwa klasa III. Klasy sprawdź w ewidencji gruntów (wypis z rejestru gruntów).`);
        else if (!Object.keys(g.classCounts ?? {}).length) add('gleby.egib', 'weryfikacja', 3, 'Klasy gleb', 'Powiat nie udostępnia klasoużytków w usłudze krajowej — klasy sprawdź w wypisie z rejestru gruntów.');
    }
    // ---- planowanie
    const plan = r.plan;
    if ((has('pog') || has('mpzp')) && plan?.data) {
        const matches = plan.data.layers?.pog?.matches ?? [];
        const zones = matches.filter((m) => m.kind === 'strefa');
        const act = matches.find((m) => m.kind === 'akt');
        const mp = plan.data.layers?.mpzp?.matches ?? [];
        if (!act && !zones.length && !mp.length) add('plan.brak', 'weryfikacja', 2, 'Brak planów w rejestrze', `Brak planu ogólnego i MPZP w rejestrze — sprawdź w urzędzie gminy.${type === 'biometan' ? ' Biogazownia rolnicza powyżej 1 MW: uchwała lokalizacyjna rady gminy.' : ' Możliwe ścieżki: MPZP albo decyzja o warunkach zabudowy.'}`, type === 'biometan' ? LINKS.kowr : null);
        if (mp.length && mp.every((m) => !Object.entries(m.attributes ?? {}).some(([k, v]) => v && /przeznacz|symbol|oznacz|funkcj/i.test(k) && !/^uwaga/i.test(k)))) add('plan.mpzp-przeznaczenie', 'weryfikacja', 2, 'Przeznaczenie w MPZP', 'Przeznaczenie terenu nieustalone automatycznie — potrzebny wypis i wyrys z planu miejscowego.');
        for (const z of zones) {
            const code = zoneCode(z.label); if (!code) continue;
            const part = z.partPct ?? 100; if (part < 10) continue;
            if (heavy && ['SO', 'SN', 'SC', 'SJ', 'SW', 'SU', 'SH', 'SK'].includes(code) && !(type === 'biometan' && code === 'SZ')) add(`plan.strefa-${code}`, 'ryzyko', 1, 'Strefa planu ogólnego', `${z.label} (≈ ${nf.format(part)}% terenu) — strefa ${ZONE_NAMES[code]} nie przewiduje zabudowy produkcyjnej.`);
            if (type === 'pv' && ['SO', 'SN', 'SC', 'SJ', 'SW'].includes(code)) add(`plan.strefa-pv-${code}`, 'ryzyko', 2, 'Strefa planu ogólnego', `${z.label} (≈ ${nf.format(part)}% terenu) — strefa ${ZONE_NAMES[code]}; lokalizacja PV zależy od ustaleń planu ogólnego i MPZP.`);
        }
        const o = r.ouz?.data;
        if (o && !o.hits && !mp.length) add('plan.ouz', 'weryfikacja', 2, 'Zasięg OUZ wymaga sprawdzenia', o.summary + ' Sprawdź granice obszaru w gminie.');
    } else if ((has('pog') || has('mpzp')) && plan?.error) add('plan.awaria', 'weryfikacja', 2, 'Planowanie', `Rejestr planów nie odpowiedział (${plan.error}) — sprawdź w gminie.`);
    if (type === 'biometan') add('biometan.tryb', 'weryfikacja', 2, 'Tryb lokalizacji biogazowni rolniczej', 'Powyżej 1 MW lokalizacja w trybie uchwały lokalizacyjnej rady gminy; do 1 ha w gospodarstwie bez zmiany przeznaczenia gruntu (ustawa z 13.07.2023 r.).', LINKS.kowr);
    // ---- otoczenie
    const ot = r.otoczenie?.data;
    if (has('otoczenie')) {
        const res = ot?.residential;
        if (!res || res.error) add('otoczenie.brak', 'weryfikacja', heavy ? 2 : 3, 'Zabudowa mieszkaniowa', `Niesprawdzona${res?.error ? ` (${res.error})` : ''} — sprawdź na ortofotomapie i w BDOT10k.`, LINKS.geoportal);
        else if (heavy && res.nearest != null && res.nearest <= T.zabudowaMieszkaniowaM) add('otoczenie.mieszkalne', 'ryzyko', 2, 'Zabudowa mieszkaniowa blisko', `Najbliższy budynek mieszkalny ${res.nearest === 0 ? 'w terenie' : `≈ ${dist(res.nearest)}`}; ${res.counts[2]} ${plural(res.counts[2], 'budynek', 'budynki', 'budynków')} w 500 m. Możliwy konflikt społeczny (uciążliwość zapachowa, transport).`);
        if (type === 'biometan' && ot?.kowr && !ot.kowr.error && ot.kowr.within20) add('otoczenie.kowr', 'fakt', 3, 'Biogazownie w okolicy', `${ot.kowr.within20} ${plural(ot.kowr.within20, 'biogazownia rolnicza', 'biogazownie rolnicze', 'biogazowni rolniczych')} w 20 km (${ot.kowr.within10} w 10 km) wg rejestru KOWR z ${ot.kowr.date}; lokalizacje orientacyjne. Konkurencja o substrat i odbiór pofermentu.`, LINKS.kowrRejestr);
        const en = ot?.permits;
        if ((type === 'pv' || type === 'ogolny') && en && !en.error && (en.counts?.energia ?? 0) > 0) add('otoczenie.energia', 'fakt', 3, 'Inwestycje energetyczne w okolicy', `${en.counts.energia} ${plural(en.counts.energia, 'wniosek lub decyzja', 'wnioski lub decyzje', 'wniosków lub decyzji')} dla inwestycji energetycznych w 1,5 km (RWDZ, 3 lata) — możliwe wyczerpanie mocy w okolicznych stacjach.`);
    }
    // ---- uzbrojenie
    const u = r.uzbrojenie;
    if (has('uzbrojenie')) {
        if (u?.error) add('uzbrojenie.brak', 'weryfikacja', 2, 'Uzbrojenie terenu', `KIUT nie odpowiedział (${u.error}) — sprawdź mapę zasadniczą w starostwie.`);
        else if (u?.data) {
            const net = (src) => u.data.networks.find((n) => n.source === src);
            const p = net('kiut_power'); const gz = net('kiut_gas');
            if (p?.insideCount) add('uzbrojenie.linia', 'ryzyko', 2, 'Linia elektroenergetyczna przez teren', 'Pas technologiczny linii ogranicza zabudowę i rozmieszczenie instalacji; napięcie linii nieznane (KIUT).');
            if (gz?.insideCount) add('uzbrojenie.gaz', 'ryzyko', 2, 'Gazociąg przez teren', 'Strefa kontrolowana gazociągu ogranicza zabudowę; ciśnienie nieznane (KIUT).');
            if (u.data.networks.some((n) => n.error)) add('uzbrojenie.czesc', 'weryfikacja', 3, 'Uzbrojenie terenu', 'Część sieci w KIUT nie odpowiedziała — kompletność sprawdź na mapie zasadniczej.');
        }
    }
    if (has('uzbrojenie')) {
        // Przypomnienie o przyłączeniu — także gdy KIUT nie odpowiedział.
        const net2 = (src) => u?.data?.networks?.find((n) => n.source === src);
        const p = net2('kiut_power'); const gz = net2('kiut_gas');
        const bufferM = nf.format(u?.data?.bufferM ?? options.utilBuffer ?? 60);
        if (type === 'biometan') add('uzbrojenie.gaz-przylacze', 'weryfikacja', 2, 'Wtłaczanie biometanu', `${gz && !gz.error ? (gz.count ? `Sieć gazowa ≈ ${gz.insideCount ? '0 m (przez teren)' : dist(gz.minDist)} od granicy, ciśnienie nieznane.` : `Brak sieci gazowej w KIUT w ${bufferM} m.`) : 'Sieć gazowa nie została sprawdzona.'} Chłonność sieci i warunki przyłączenia określa operator (PSG, Gaz-System).`, LINKS.psg);
        if (type === 'pv') add('uzbrojenie.moc', 'weryfikacja', 2, 'Moc przyłączeniowa', `${p && !p.error ? (p.count ? `Linia elektroenergetyczna ≈ ${p.insideCount ? '0 m (przez teren)' : dist(p.minDist)} od granicy, napięcie nieznane.` : `Brak linii w KIUT w ${bufferM} m.`) : 'Sieć nie została sprawdzona.'} O mocy rozstrzygają warunki przyłączenia; operatorzy publikują dostępne moce dla stacji (art. 7 ust. 8l Prawa energetycznego).`);
    }
    // ---- teren i kształt
    const t = r.teren?.data;
    if (has('teren') && t) {
        const above = slopeShareAbove(t, heavy ? T.spadekProcent : T.spadekPvProcent);
        if ((heavy || type === 'pv') && above > T.spadekUdzial) add('teren.spadki', 'ryzyko', 3, 'Spadki terenu', `${nf.format(above)}% powierzchni ma spadek ponad ${heavy ? T.spadekProcent : T.spadekPvProcent}%${heavy ? ' — plac lub hala wymaga niwelacji' : ' — trudniejszy montaż konstrukcji i układ rzędów'} (zasada praktyczna).`);
    }
    const s = base.shape;
    const minSide = T.minBokProstokataM?.[type] ?? 0;
    if (s?.rect && minSide && s.rect.b < minSide) add('ksztalt.prostokat', 'ryzyko', 3, 'Kształt terenu', `Największy prostokąt w terenie ma ${nf.format(s.rect.a)} × ${nf.format(s.rect.b)} m — krótszy bok poniżej ${minSide} m może ograniczać układ technologiczny (zasada praktyczna).`);
    // ---- inne uwarunkowania
    const inn = r.inne;
    if (has('inne')) {
        if (inn?.error) add('inne.brak', 'weryfikacja', 3, 'Zabytki, złoża, wody', `Nie udało się sprawdzić (${inn.error}).`);
        else if (inn?.data) {
            const d = inn.data;
            if (d.nid.archaeology.length) add('inne.archeologia', 'ryzyko', 2, 'Stanowisko archeologiczne', `W terenie: ${d.nid.archaeology.join('; ')} (rejestr NID). Uzgodnienie z konserwatorem zabytków, możliwe badania archeologiczne.`, LINKS.nid);
            if (d.nid.immovable.length) add('inne.zabytek', 'ryzyko', 2, 'Zabytek nieruchomy', `W terenie: ${d.nid.immovable.join('; ')} (rejestr NID). Prace wymagają pozwolenia konserwatora.`, LINKS.nid);
            if (d.nid.errors >= d.nid.points * 2) add('inne.nid', 'weryfikacja', 3, 'Zabytki', 'Rejestr NID nie odpowiedział; gminna ewidencja zabytków nie jest dostępna w usłudze — sprawdź w gminie.', LINKS.nid);
            if (d.deposits?.insideCount) add('inne.zloze', 'ryzyko', 2, 'Złoże kopaliny', `${pct(d.deposits.share)} terenu w granicach udokumentowanego złoża (MIDAS) — ochrona złoża w dokumentach planistycznych.`, LINKS.midas);
            if (d.mining?.insideCount) add('inne.gornicze', 'ryzyko', 2, 'Obszar górniczy', `${pct(d.mining.share)} terenu w obszarze górniczym (MIDAS) — uzgodnienia z przedsiębiorcą górniczym i urzędem górniczym.`, LINKS.midas);
            if (d.deposits?.error || d.mining?.error) add('inne.midas', 'weryfikacja', 3, 'Złoża i obszary górnicze', 'MIDAS (PIG-PIB) nie odpowiedział — sprawdź w serwisie MIDAS.', LINKS.midas);
            if (d.water?.insideCount) add('inne.wody', 'ryzyko', 3, 'Wody i rowy w terenie', `${pct(d.water.share)} powierzchni zajmują wody lub rowy (BDOT10k) — przebudowa wymaga pozwolenia wodnoprawnego.`);
        }
    }
    return out.sort((a, b) => a.sev - b.sev);
}
