/**
 * 19.45.0 — porównanie działek projektu: dla każdej działki dodanej do projektu (obiekt „parcel:<identyfikator>”)
 * zbiera najważniejsze dane z tych samych usług co karta działki i raport PDF:
 *   - plan miejscowy (MPZP) i plan ogólny (strefy) — analiza działki api/vps.php (Rejestr Urbanistyczny),
 *   - przeznaczenie terenu w MPZP (symbol, opis) — identyfikacja na mapie planów (ta sama co w karcie działki),
 *   - Natura 2000 i inne formy ochrony przyrody, zagrożenie powodziowe (ISOK) — identyfikacja w punktach działki,
 *   - klasy użytków z ewidencji (EGiB) — identyfikacja w punktach działki,
 *   - ceny gruntów z Rejestru Cen Nieruchomości (mediana zł/m² w promieniu 1 km, 5 lat),
 *   - wysokości terenu z NMT (najniższy i najwyższy punkt, różnica).
 * Każde źródło jest niezależne: błąd jednego daje „nie sprawdzono” w tej kolumnie, reszta wiersza powstaje.
 * Funkcje formatujące (summarize*, toComparisonCsv) nie korzystają z sieci — sprawdzają je testy Vitest.
 */
import { getJson, identify, parseIdentifyText, probePoints, gridPoints } from '../report/reportData.js';
import { geometryArea, parcelCentroid } from './parcelGeometrySummary.js';
import { RCN_DEFAULTS, RCN_MIN_MEDIAN_COUNT } from '../core/rcnDefaults.js';

/* Odpowiedzi usług mają luźny kształt (JSON z PHP) — typujemy tylko to, z czego korzysta porównanie. */
type Json = any;
type Point = [number, number];
type Settled = Json | { error: string };
export type HitSummary = { status: 'in' | 'out' | 'unknown'; names: string[]; checked: number; of: number };
export type FloodSummary = { status: 'in' | 'out' | 'unknown'; scenarios: string[]; checked: number; of: number };
export type ZoningSummary = { status: 'in' | 'out' | 'unknown'; plans: string[]; zones: { symbol: string; use: string | null }[]; checked: number; of: number };
export type PogPointSummary = { status: 'adopted' | 'draft' | 'none' | 'unknown'; symbol: string | null };
export type SoilSummary = { status: 'ok' | 'unknown'; classes: string[]; checked: number; of: number };
export type PlanSummary = ReturnType<typeof summarizePlan>;
export type PriceSummary = ReturnType<typeof summarizePrices>;
export type TerrainSummary = { min: number; max: number; drop: number; samples: number };
export type ComparisonRow = {
    objectId?: string; parcelId?: string; name?: string; number?: string | null; region?: string | null; commune?: string | null;
    areaM2?: number | null; plan?: PlanSummary | { error: string }; natura?: HitSummary; protection?: HitSummary; flood?: FloodSummary;
    soil?: SoilSummary; zoning?: ZoningSummary; pogPoint?: PogPointSummary; prices?: PriceSummary | { error: string }; terrain?: TerrainSummary | { error: string } | null; checkedAt?: string;
};
export type ColumnKey = 'area' | 'mpzp' | 'zoning' | 'pog' | 'natura' | 'protection' | 'flood' | 'soil' | 'price' | 'terrain';
const isError = (v: unknown): v is { error: string } => Boolean(v && typeof v === 'object' && 'error' in v && (v as { error?: unknown }).error);

// 19.46.0: te same parametry co karta działki i zakładka Raport (core/rcnDefaults.js).
export const PRICE_RADIUS_M: number = RCN_DEFAULTS.radius;
export const PRICE_YEARS: number = RCN_DEFAULTS.years;
const PROBES = 3;

/** Obiekty projektu będące działkami z ewidencji (dodane z karty działki albo narzędziem „Działka”). */
export function projectParcelItems<T extends { id?: unknown; origin?: unknown }>(items: readonly T[] | null | undefined): T[] {
    return (items ?? []).filter((item) => item?.origin === 'parcel' && typeof item.id === 'string' && item.id.startsWith('parcel:'));
}

export function parcelIdFromObjectId(id: unknown): string {
    return String(id ?? '').replace(/^parcel:/, '').trim();
}

/** Analiza działki (api/vps.php) → dane ewidencyjne, MPZP, plan ogólny. */
export function summarizePlan(analysis: Json) {
    const admin = analysis?.parcel?.admin ?? {};
    const layer = (key: string): Json => analysis?.layers?.[key] ?? null;
    const mpzpLayer = layer('mpzp'); const pogLayer = layer('pog');
    const complete = (l: Json): boolean => !l?.online || l.online.status === 'complete';
    const mpzp = (mpzpLayer?.matches ?? []).map((m: Json): string => String(m.label ?? m.name ?? '').trim()).filter(Boolean);
    const zones = (pogLayer?.matches ?? []).filter((m: Json) => m.kind === 'strefa')
        .map((m: Json): { label: string; pct: number | null } => ({ label: String(m.label ?? '').trim(), pct: Number.isFinite(m.partPct) ? Math.round(m.partPct) : null }))
        .filter((z: { label: string }) => z.label);
    const acts = (pogLayer?.matches ?? []).filter((m: Json) => m.kind === 'akt').map((m: Json): string => String(m.label ?? '').trim()).filter(Boolean);
    return {
        number: (admin.parcel ?? null) as string | null, region: (admin.region ?? null) as string | null, commune: (admin.commune ?? null) as string | null, county: (admin.county ?? null) as string | null,
        areaM2: (Number.isFinite(analysis?.parcel?.areaM2) ? analysis.parcel.areaM2 : null) as number | null,
        mpzp: { items: [...new Set<string>(mpzp)], complete: complete(mpzpLayer) },
        pog: { zones: zones as { label: string; pct: number | null }[], acts: [...new Set<string>(acts)], complete: complete(pogLayer) },
    };
}

/** Nazwy obiektów z odpowiedzi identyfikacji (Natura 2000, formy ochrony). */
function namesFrom(text: string): string[] {
    return parseIdentifyText(text).map((o: Json) => o.nazwa || o.NAZWA || o.Nazwa || o.name || o.kod || o.KOD || Object.values(o)[0]).filter(Boolean).map(String);
}

/**
 * Wyniki identyfikacji w kilku punktach działki → { status: 'in'|'out'|'unknown', names, checked, of }.
 * „out” tylko wtedy, gdy odpowiedziały wszystkie punkty; częściowa odpowiedź bez trafienia → „unknown”.
 */
export function summarizeHits(results: Settled[]): HitSummary {
    const answered = results.filter((r) => r && !r.error);
    const names = new Set<string>();
    let hit = false;
    for (const r of answered) if (r.found) { hit = true; for (const n of namesFrom(r.text)) names.add(n); }
    const status: HitSummary['status'] = hit ? 'in' : answered.length === results.length && results.length > 0 ? 'out' : 'unknown';
    return { status, names: [...names].slice(0, 4), checked: answered.length, of: results.length };
}

/** Zagrożenie powodziowe (MZP/MRP, ISOK) → status i scenariusze (np. „wysokie (10%)”). */
export function summarizeFlood(results: Settled[]): FloodSummary {
    const base = summarizeHits(results);
    const scenarios = new Set<string>();
    for (const r of results) if (r && !r.error && r.found) for (const o of parseIdentifyText(r.text) as Json[]) if (o.loo_qualitativelikelihood) scenarios.add(String(o.loo_qualitativelikelihood));
    return { status: base.status, scenarios: [...scenarios].sort(), checked: base.checked, of: base.of };
}

/**
 * Mapa planów miejscowych (identify source=mpzp) → nazwy planów i przeznaczenie (symbol + opis) w punktach działki.
 * Nazwy pól różnią się między gminami („Symbol przeznaczenia”, „SYMBOL”, „NAZWA_PLAN”, „Tytuł planu”…).
 */
export function summarizeZoning(results: Settled[]): ZoningSummary {
    const answered = results.filter((r) => r && !r.error);
    const plans = new Set<string>(); const zones = new Map<string, string | null>();
    for (const r of answered) {
        if (!r.found) continue;
        // Obiekty w odpowiedzi rozdziela pusta linia (tekst z api/identify.php) albo linia „-----”.
        for (const chunk of String(r.text ?? '').split(/\r?\n\s*\r?\n/)) {
            for (const o of parseIdentifyText(chunk) as Json[]) {
                let symbol: string | null = null; let use: string | null = null;
                for (const [key, value] of Object.entries(o)) {
                    const v = String(value).trim();
                    if (!v) continue;
                    if (/nazwa.?planu?|tytu[lł]|^plan$/i.test(key)) plans.add(v);
                    else if (/symbol|oznaczenie/i.test(key)) symbol ??= v;
                    else if (/^przeznaczenie|funkcja/i.test(key)) use ??= v;
                }
                if (symbol && !zones.has(symbol)) zones.set(symbol, use);
            }
        }
    }
    const hit = answered.some((r) => r.found);
    return {
        status: hit ? 'in' : answered.length === results.length && results.length > 0 ? 'out' : 'unknown',
        plans: [...plans].slice(0, 3), zones: [...zones].slice(0, 6).map(([symbol, use]) => ({ symbol, use })), checked: answered.length, of: results.length,
    };
}

const POG_ZONE = /^\s*Oznaczenie:\s*(\d*(?:SW|SJ|SZ|SU|SH|SP|SR|SI|SN|SC|SG|SO|SK))\s*$/mi;
/** 19.46.0: plan ogólny w punkcie działki z mapy planów (uchwalony / projekt) — gdy Rejestr Urbanistyczny go nie zna. */
export function summarizePogPoint(adopted: Settled, draft: Settled): PogPointSummary {
    const symbolOf = (r: Settled): string | null => (r && !r.error && r.found ? (String(r.text ?? '').match(POG_ZONE)?.[1]?.toUpperCase() ?? null) : null);
    if (adopted && !adopted.error && adopted.found) return { status: 'adopted', symbol: symbolOf(adopted) };
    if (draft && !draft.error && draft.found) return { status: 'draft', symbol: symbolOf(draft) };
    if (adopted && !adopted.error && draft && !draft.error) return { status: 'none', symbol: null };
    return { status: 'unknown', symbol: null };
}

/** Klasy użytków z ewidencji (np. RIIIa, ŁIV) z odpowiedzi identyfikacji egib_classes. */
export function summarizeSoilClasses(results: Settled[]): SoilSummary {
    const found = new Set<string>(); let answered = 0;
    for (const r of results) {
        if (!r || r.error) continue;
        answered += 1;
        if (!r.found) continue;
        for (const o of parseIdentifyText(r.text)) for (const [key, value] of Object.entries(o)) {
            if (!/OZK|OZU|klas|użyt|kontur/i.test(key) || /grupa/i.test(key)) continue;
            for (const m of String(value).matchAll(/(?:^|[\s,;(])(R|Ł|Ps|Ls|Lz|N|B|Br|dr|W|Wp|Ws|Tr|Ba|Bi|Bp|Bz|K|S)\s*-?\s*(VI(?:z)?|IV[ab]?|V|I{1,3}[ab]?)?(?![a-zA-Z])/g)) {
                if (m[2] || !['R', 'Ł', 'Ps', 'Ls', 'Lz'].includes(m[1])) found.add(`${m[1]}${m[2] ?? ''}`);
            }
        }
    }
    return { status: answered ? 'ok' : 'unknown', classes: [...found].sort(), checked: answered, of: results.length };
}

/** Odpowiedź api/rcn.php → mediana i typowy przedział ceny za m². */
export function summarizePrices(data: Json) {
    const s = data?.stats ?? {};
    return {
        median: (s.medianPerM2 ?? null) as number | null, p25: (s.p25PerM2 ?? null) as number | null, p75: (s.p75PerM2 ?? null) as number | null,
        count: (s.perM2Count ?? data?.marketCount ?? 0) as number, radiusM: (data?.radius ?? PRICE_RADIUS_M) as number, years: (data?.years ?? PRICE_YEARS) as number,
    };
}

/** Wysokości NMT w punktach działki → najniższy, najwyższy, różnica (m). */
export function summarizeTerrain(heights: readonly unknown[] | null | undefined): TerrainSummary | null {
    const values = (heights ?? []).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length < 2) return null;
    const min = Math.min(...values); const max = Math.max(...values);
    return { min, max, drop: max - min, samples: values.length };
}

const settle = async (promise: Promise<Json>): Promise<Settled> => { try { return await promise; } catch (error: any) { if (error?.name === 'AbortError') throw error; return { error: error?.message || String(error) }; } };

/**
 * Dane jednej działki. object: obiekt projektu z geometrią EPSG:2180 (ObjectManager.getObject).
 * Zwraca wiersz porównania; pola, których nie udało się pobrać, mają `error`.
 */
export async function compareParcel(object: { id: string; name: string; geometry: Json }, { signal }: { signal?: AbortSignal } = {}): Promise<ComparisonRow> {
    const parcelId = parcelIdFromObjectId(object.id);
    const geometry = object.geometry;
    const areaM2 = geometryArea(geometry);
    let probes: Point[];
    try { probes = probePoints(geometry).slice(0, PROBES); } catch {
        const c = parcelCentroid(geometry);
        if (!c) throw new Error('Brak geometrii działki.');
        probes = [c as Point];
    }
    const center = probes[0];
    const hits = (source: string): Promise<Settled[]> => Promise.all(probes.map((p) => settle(identify(source, p, signal))));
    const terrainPoints = gridPoints(geometry, center, 24);

    const [plan, zoning, natura, protection, flood, soil, prices, terrain, pogAdopted, pogDraft] = await Promise.all([
        settle(getJson('./api/vps.php?route=parcel/analyze', { signal, method: 'POST', body: { parcel_id: parcelId, radius_m: 500, include_prg: true } })),
        hits('mpzp'), hits('natura2000'), hits('gdos_protection'), hits('flood_mzpmrp'), hits('egib_classes'),
        settle(getJson(`./api/rcn.php?x=${center[0].toFixed(1)}&y=${center[1].toFixed(1)}&r=${PRICE_RADIUS_M}&kind=grunty&years=${PRICE_YEARS}`, { signal })),
        settle(getJson('./api/terrain.php', { signal, method: 'POST', body: { points: terrainPoints } })),
        settle(identify('pog_adopted', center, signal)), settle(identify('pog_draft', center, signal)),
    ]);
    const planSummary = plan.error ? null : summarizePlan(plan);
    return {
        objectId: object.id, parcelId, name: object.name,
        number: planSummary?.number ?? parcelId.split('.').pop() ?? parcelId,
        region: planSummary?.region ?? null, commune: planSummary?.commune ?? null,
        areaM2,
        plan: isError(plan) ? { error: plan.error } : (planSummary as PlanSummary),
        zoning: summarizeZoning(zoning), pogPoint: summarizePogPoint(pogAdopted, pogDraft), natura: summarizeHits(natura), protection: summarizeHits(protection), flood: summarizeFlood(flood),
        soil: summarizeSoilClasses(soil),
        prices: isError(prices) ? { error: prices.error } : summarizePrices(prices),
        terrain: isError(terrain) ? { error: terrain.error } : (summarizeTerrain(terrain.heights) ?? { error: 'za mało wysokości z NMT' }),
        checkedAt: new Date().toISOString(),
    };
}

// ---- tekst komórek (tabela i CSV) ---------------------------------------------------------

const nf0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const NOT_CHECKED = 'nie sprawdzono';

export function areaText(m2: number | null | undefined): string {
    if (typeof m2 !== 'number' || !Number.isFinite(m2)) return '—';
    return m2 >= 10000 ? `${nf2.format(m2 / 10000)} ha` : `${nf0.format(m2)} m²`;
}

export function cellText(row: ComparisonRow, column: ColumnKey | string): string {
    const plan = isError(row.plan) ? null : row.plan;
    const prices = isError(row.prices) ? null : row.prices;
    const terrain = isError(row.terrain) ? null : row.terrain;
    switch (column) {
        case 'area': return areaText(row.areaM2);
        case 'mpzp': {
            // Pełna nazwa z Rejestru Urbanistycznego; skrócona nazwa z mapy planów tylko wtedy, gdy rejestr jej nie zna.
            const names = plan?.mpzp.items.length ? plan.mpzp.items : (row.zoning?.plans ?? []);
            if (names.length) return names.join('; ');
            if (row.zoning?.status === 'in') return 'obowiązuje';
            if (row.zoning?.status === 'out' && plan?.mpzp.complete) return 'brak planu';
            if (plan?.mpzp.complete) return 'brak w rejestrze';
            return NOT_CHECKED;
        }
        case 'zoning': {
            const z = row.zoning;
            if (!z || z.status === 'unknown') return NOT_CHECKED;
            if (z.status === 'out') return '—';
            return z.zones.length ? z.zones.map((x) => (x.use ? `${x.symbol} (${x.use})` : x.symbol)).join(', ') : 'bez opisu w usłudze';
        }
        case 'pog': {
            if (isError(row.plan)) return NOT_CHECKED;
            const p = plan?.pog;
            if (!p) return NOT_CHECKED;
            if (p.zones.length) return p.zones.map((z) => (z.pct != null && z.pct < 99.5 ? `${z.label} (${z.pct}%)` : z.label)).join('; ');
            const point = row.pogPoint;
            if (point?.status === 'adopted') return `uchwalony${point.symbol ? ` (${point.symbol})` : ''}`;
            if (point?.status === 'draft') return `w opracowaniu${point.symbol ? ` (${point.symbol})` : ''}`;
            if (p.acts.length) return p.acts.join('; ');
            if (point?.status === 'none' && p.complete) return 'brak planu';
            return p.complete ? 'brak w rejestrze' : NOT_CHECKED;
        }
        case 'natura': case 'protection': {
            const v = row[column as 'natura' | 'protection'];
            if (!v || v.status === 'unknown') return NOT_CHECKED;
            return v.status === 'in' ? (v.names.length ? v.names.join('; ') : 'tak') : 'poza';
        }
        case 'flood': {
            const v = row.flood;
            if (!v || v.status === 'unknown') return NOT_CHECKED;
            return v.status === 'in' ? `zagrożenie${v.scenarios.length ? `: ${v.scenarios.join(', ')}` : ''}` : 'poza';
        }
        case 'soil': {
            const v = row.soil;
            if (!v || v.status === 'unknown') return NOT_CHECKED;
            return v.classes.length ? v.classes.join(', ') : 'brak danych w ewidencji';
        }
        case 'price': {
            const v = prices;
            if (!v) return NOT_CHECKED;
            if (!v.median) return `brak transakcji (${v.radiusM >= 1000 ? `${nf0.format(v.radiusM / 1000)} km` : `${v.radiusM} m`})`;
            if (v.count < RCN_MIN_MEDIAN_COUNT) return `${nf0.format(v.median)} zł/m² (tylko ${v.count} trans.)`;
            return `${nf0.format(v.median)} zł/m²`;
        }
        case 'terrain': {
            const v = terrain;
            if (!v) return NOT_CHECKED;
            return `${nf1.format(v.drop)} m (${nf1.format(v.min)}–${nf1.format(v.max)} m n.p.m.)`;
        }
        default: return '';
    }
}

/** Czy komórka zasługuje na wyróżnienie (ograniczenie albo ryzyko dla inwestycji). */
export function cellTone(row: ComparisonRow, column: ColumnKey | string): '' | 'muted' | 'warn' {
    if (cellText(row, column) === NOT_CHECKED) return 'muted';
    if ((column === 'natura' || column === 'protection' || column === 'flood') && row[column]?.status === 'in') return 'warn';
    if (column === 'soil' && (row.soil?.classes ?? []).some((c) => /^(R|Ł|Ps)(I{1,3}[ab]?)$/.test(c))) return 'warn';
    return '';
}

export const COLUMNS: [ColumnKey, string][] = [
    ['area', 'Powierzchnia'], ['mpzp', 'MPZP'], ['zoning', 'Przeznaczenie (MPZP)'], ['pog', 'Plan ogólny'], ['natura', 'Natura 2000'], ['protection', 'Inne formy ochrony'],
    ['flood', 'Powódź (ISOK)'], ['soil', 'Klasy użytków (EGiB)'], ['price', `Grunty — mediana RCN (${PRICE_RADIUS_M >= 1000 ? `${PRICE_RADIUS_M / 1000} km` : `${PRICE_RADIUS_M} m`}, ${PRICE_YEARS} lat)`], ['terrain', 'Różnica wysokości'],
];

/** CSV (średnik, UTF-8 z BOM — otwiera się w Excelu z polskimi znakami). Liczby w osobnych kolumnach, bez formatowania. */
export function toComparisonCsv(rows: readonly ComparisonRow[]): string {
    const prices = (r: ComparisonRow) => (isError(r.prices) ? null : r.prices);
    const terrain = (r: ComparisonRow) => (isError(r.terrain) ? null : r.terrain);
    const esc = (v: unknown): string => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const num = (v: number | null | undefined, d = 0): string => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '');
    const head = ['identyfikator', 'numer', 'obreb', 'gmina', 'powierzchnia_m2', 'mpzp', 'przeznaczenie_mpzp', 'plan_ogolny', 'natura_2000', 'inne_formy_ochrony', 'powodz_isok',
        'klasy_uzytkow', 'cena_mediana_zl_m2', 'cena_p25_zl_m2', 'cena_p75_zl_m2', 'liczba_transakcji', 'wysokosc_min_m', 'wysokosc_max_m', 'roznica_wysokosci_m', 'sprawdzono'];
    const lines = rows.map((r) => [
        r.parcelId, r.number, r.region, r.commune, num(r.areaM2), cellText(r, 'mpzp'), cellText(r, 'zoning'), cellText(r, 'pog'), cellText(r, 'natura'), cellText(r, 'protection'),
        cellText(r, 'flood'), cellText(r, 'soil'), num(prices(r)?.median), num(prices(r)?.p25), num(prices(r)?.p75), prices(r)?.count ?? '',
        num(terrain(r)?.min, 1), num(terrain(r)?.max, 1), num(terrain(r)?.drop, 1), r.checkedAt ?? '',
    ].map(esc).join(';'));
    return '﻿' + [head.join(';'), ...lines].join('\r\n');
}
