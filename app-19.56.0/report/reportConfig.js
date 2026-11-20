import { INVEST_TYPES, mergeThresholds } from './reportRules.js';

/**
 * 19.36.0 — raport działki PDF: sekcje, gotowe szablony i teksty.
 *
 * Trzy poziomy konfiguracji (każdy następny nadpisuje poprzedni):
 *   1. wartości domyślne z tego pliku (wersja aplikacji);
 *   2. plik serwera `konfiguracja/raport-pdf.json` — opcjonalny, nie jest nadpisywany przez aktualizacje
 *      (przykład: konfiguracja/raport-pdf.przyklad.json). Zmienia nazwy i opisy sekcji, dodaje, zmienia albo
 *      ukrywa szablony, ustawia nagłówek (nazwa biura, kontakt, logo), kolor i tekst zastrzeżeń;
 *   3. ustawienia użytkownika w przeglądarce (własne szablony, nagłówek, ostatni wybór) — reportStore.js.
 *
 * Nowa sekcja w PDF wymaga kodu (reportData.js zbiera dane, reportPdf.js rysuje). Zmiana tego, KTÓRE sekcje
 * i z jakimi parametrami tworzą szablon, nie wymaga.
 */

/** Sekcje raportu w kolejności w PDF. weight — udział strony A4 (szacunek liczby stron w oknie). */
export const REPORT_SECTIONS = [
    { id: 'dzialka', group: 'Działka', label: 'Karta decyzyjna i dane terenu', hint: 'parametry, ograniczenia i ryzyka, sprawy do weryfikacji', weight: 0.9, locked: true },
    { id: 'mapa', group: 'Działka', label: 'Mapa działki', hint: 'wybrany podkład, granica, największy prostokąt, położenie', weight: 0.5 },
    { id: 'ksztalt', group: 'Działka', label: 'Wymiary i kształt', hint: 'prostokąt opisany, najmniejsza szerokość, największy prostokąt pod zabudowę', weight: 0.2 },
    { id: 'ewidencja', group: 'Działka', label: 'Mapa ewidencyjna z sąsiadami', hint: 'działki i budynki z ewidencji (KIEG), numery działek', weight: 0.35 },
    { id: 'pog', group: 'Planowanie', label: 'Plan ogólny (POG)', hint: 'strefy z opisem, obszar uzupełnienia zabudowy, ile można zbudować', weight: 0.7 },
    { id: 'mpzp', group: 'Planowanie', label: 'Plan miejscowy (MPZP)', hint: 'plan w terenie, uchwała, link', weight: 0.2 },
    { id: 'przyroda', group: 'Środowisko i zagrożenia', label: 'Ochrona przyrody', hint: 'Natura 2000 i formy ochrony: udział powierzchni, odległości, mapa (GDOŚ)', weight: 0.55 },
    { id: 'powodz', group: 'Środowisko i zagrożenia', label: 'Zagrożenie powodziowe', hint: 'udział powierzchni, scenariusze 10% / 1% / 0,2% (ISOK)', weight: 0.2 },
    { id: 'las', group: 'Środowisko i zagrożenia', label: 'Lasy', hint: 'udział i odległość (BDOT10k), własność i nadleśnictwo (BDL)', weight: 0.2 },
    { id: 'inne', group: 'Środowisko i zagrożenia', label: 'Zabytki, złoża, wody', hint: 'rejestr NID, złoża i obszary górnicze (MIDAS), wody i rowy (BDOT10k)', weight: 0.2 },
    { id: 'gleby', group: 'Środowisko i zagrożenia', label: 'Gleby i klasy (siatka punktów)', hint: 'kompleksy przydatności, klasy z ewidencji w kilkunastu punktach', weight: 0.25 },
    { id: 'uzbrojenie', group: 'Infrastruktura i otoczenie', label: 'Uzbrojenie terenu', hint: 'prąd, gaz, woda, kanalizacja, telekom., ciepło — mapa i odległości (KIUT)', weight: 0.6 },
    { id: 'otoczenie', group: 'Infrastruktura i otoczenie', label: 'Zabudowa mieszkaniowa i otoczenie', hint: 'budynki mieszkalne w 100–1000 m (BDOT10k), biogazownie KOWR, inwestycje energetyczne (RWDZ)', weight: 0.4 },
    { id: 'odleglosci', group: 'Infrastruktura i otoczenie', label: 'Odległości', hint: 'najbliższy budynek i droga (BDOT10k, gdy jest baza)', weight: 0.1 },
    { id: 'teren', group: 'Teren', label: 'Wysokość i spadek terenu', hint: 'NMT 1 m: wysokości, spadki, ekspozycja, profile w 3 osiach', weight: 0.45 },
    { id: 'teren3d', group: 'Teren', label: 'Teren 3D', hint: 'dwa ujęcia modelu 3D z otoczeniem 50 m: z południowego zachodu i z góry w klasach nachylenia', weight: 0.55 },
    { id: 'ceny', group: 'Rynek (załączniki)', label: 'Ceny transakcyjne', hint: 'mediana zł/m², mapa i lista transakcji (RCN)', weight: 0.75 },
    { id: 'budowy', group: 'Rynek (załączniki)', label: 'Budowy i pozwolenia', hint: 'wnioski, decyzje, zgłoszenia na mapie (RWDZ)', weight: 0.8 },
    { id: 'zrodla', group: 'Załączniki', label: 'Źródła i zastrzeżenia', hint: 'pobranie, aktualność zbiorów, dokładność, wersja reguł', weight: 0.35, locked: true },
];

const ALL = REPORT_SECTIONS.map((section) => section.id);

/**
 * Gotowe szablony. sections — lista id sekcji (zawsze dochodzą sekcje „locked”).
 * radius: 300 | 500 | 1000 m; years: 2 | 3 | 5; basemap: orto | standard | karto | topo; priceKind: grunty | domy | mieszkania;
 * investType: ogolny | biometan | pv | przemysl (19.40.0); utilBuffer: 60 | 150 | 300 | 500 m (19.40.0).
 */
export const REPORT_PRESETS = [
    { id: 'karta', name: 'Karta działki', description: 'Najkrótszy: mapa, plan ogólny i zagrożenia.', sections: ['dzialka', 'mapa', 'pog', 'powodz', 'zrodla'], radius: 300, years: 3, basemap: 'orto', priceKind: 'grunty', investType: 'ogolny', utilBuffer: 60 },
    { id: 'kupujacy', name: 'Dla kupującego', description: 'Plany, zagrożenia, ceny i budowy w okolicy.', sections: ['dzialka', 'mapa', 'ewidencja', 'pog', 'mpzp', 'ceny', 'budowy', 'odleglosci', 'uzbrojenie', 'powodz', 'przyroda', 'las', 'zrodla'], radius: 500, years: 5, basemap: 'orto', priceKind: 'grunty', investType: 'ogolny', utilBuffer: 60 },
    { id: 'oze', name: 'OZE i przemysł', description: 'Ograniczenia na całej powierzchni, zabudowa mieszkaniowa, sieci w 300 m, wnioski dla typu inwestycji.', sections: ['dzialka', 'mapa', 'ksztalt', 'ewidencja', 'pog', 'mpzp', 'przyroda', 'powodz', 'las', 'inne', 'gleby', 'uzbrojenie', 'otoczenie', 'teren', 'teren3d', 'zrodla'], radius: 1000, years: 3, basemap: 'orto', priceKind: 'grunty', investType: 'biometan', utilBuffer: 300 },
    { id: 'inwestor', name: 'Inwestycyjny', description: 'Parametry zabudowy, teren i rynek w promieniu 1 km.', sections: ['dzialka', 'mapa', 'ksztalt', 'ewidencja', 'pog', 'mpzp', 'ceny', 'budowy', 'odleglosci', 'uzbrojenie', 'teren', 'zrodla'], radius: 1000, years: 5, basemap: 'karto', priceKind: 'grunty', investType: 'ogolny', utilBuffer: 150 },
    { id: 'planistyczny', name: 'Planistyczny', description: 'Przepisy i ograniczenia, bez rynku.', sections: ['dzialka', 'ewidencja', 'pog', 'mpzp', 'powodz', 'przyroda', 'las', 'inne', 'gleby', 'zrodla'], radius: 300, years: 3, basemap: 'standard', priceKind: 'grunty', investType: 'ogolny', utilBuffer: 60 },
    { id: 'pelny', name: 'Pełny', description: 'Wszystkie sekcje — do archiwum albo wyceny.', sections: ALL, radius: 500, years: 5, basemap: 'orto', priceKind: 'grunty', investType: 'ogolny', utilBuffer: 150 },
];

export const REPORT_OPTIONS = {
    radius: [[300, '300 m'], [500, '500 m'], [1000, '1 km']],
    years: [[2, '2 lata'], [3, '3 lata'], [5, '5 lat']],
    basemap: [['orto', 'Orto'], ['standard', 'Standard'], ['karto', 'Karto'], ['topo', 'Topo']],
    priceKind: [['grunty', 'Grunty'], ['domy', 'Domy'], ['mieszkania', 'Mieszkania']],
    investType: INVEST_TYPES,
    utilBuffer: [[60, '60 m'], [150, '150 m'], [300, '300 m'], [500, '500 m']],
};

export const REPORT_TEXTS = {
    title: 'Raport działki',
    brand: 'MSportal',
    color: '#2e6b3f',
    header: { name: '', contact: '', logo: '' },
    disclaimer: 'Raport ma charakter informacyjny i nie zastępuje wypisu i wyrysu z planu, wypisu z rejestru gruntów ani mapy do celów projektowych. '
        + 'Powierzchnia jest liczona z geometrii ULDK i może różnić się od ewidencyjnej. Brak wpisu w rejestrze nie oznacza braku ograniczenia — '
        + 'rejestry nie obejmują jeszcze wszystkich gmin. Wiążący jest tekst i rysunek aktu planistycznego oraz dokumenty z właściwego urzędu.',
    footer: 'Dane informacyjne — wiążący jest akt i rejestr',
    defaultPreset: 'kupujacy',
};

export const MAX_TERRAIN_PARCELS = 10;

export const REPORT_CONFIG_URL = './konfiguracja/raport-pdf.json';

const SECTION_IDS = new Set(ALL);
const clean = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const pick = (value, allowed, fallback) => (allowed.some(([v]) => v === value) ? value : fallback);

/** Ujednolica szablon (z pliku, przeglądarki albo importu). Zwraca null, gdy niepoprawny. */
export function normalizePreset(raw, fallback = REPORT_PRESETS[1]) {
    if (!raw || typeof raw !== 'object') return null;
    const id = clean(raw.id, 40).replace(/[^\w-]/g, '');
    const name = clean(raw.name ?? raw.nazwa, 60);
    if (!id || !name) return null;
    const list = Array.isArray(raw.sections ?? raw.sekcje) ? (raw.sections ?? raw.sekcje) : fallback.sections;
    const locked = REPORT_SECTIONS.filter((s) => s.locked).map((s) => s.id);
    const sections = ALL.filter((sid) => locked.includes(sid) || list.includes(sid));
    return {
        id, name,
        description: clean(raw.description ?? raw.opis, 160),
        sections,
        radius: pick(Number(raw.radius ?? raw.promien), REPORT_OPTIONS.radius, fallback.radius),
        years: pick(Number(raw.years ?? raw.lata), REPORT_OPTIONS.years, fallback.years),
        basemap: pick(raw.basemap ?? raw.podklad, REPORT_OPTIONS.basemap, fallback.basemap),
        priceKind: pick(raw.priceKind ?? raw.rodzajCen, REPORT_OPTIONS.priceKind, fallback.priceKind),
        investType: pick(raw.investType ?? raw.typInwestycji, REPORT_OPTIONS.investType, fallback.investType ?? 'ogolny'),
        utilBuffer: pick(Number(raw.utilBuffer ?? raw.buforUzbrojenia), REPORT_OPTIONS.utilBuffer, fallback.utilBuffer ?? 60),
    };
}

/** Szablon w formacie pliku konfiguracji (polskie klucze) — eksport do przeniesienia na serwer. */
export function presetToFile(preset) {
    return { id: preset.id, nazwa: preset.name, opis: preset.description, sekcje: preset.sections, promien: preset.radius, lata: preset.years, podklad: preset.basemap, rodzajCen: preset.priceKind, typInwestycji: preset.investType, buforUzbrojenia: preset.utilBuffer };
}

/** Scala wartości domyślne z plikiem serwera. Błędny plik nie psuje raportu — zostają wartości domyślne. */
export function mergeReportConfig(file) {
    const sections = REPORT_SECTIONS.map((section) => {
        const override = file?.sekcje?.[section.id] ?? file?.sections?.[section.id];
        return override && typeof override === 'object'
            ? { ...section, label: clean(override.nazwa ?? override.label, 80) || section.label, hint: clean(override.opis ?? override.hint, 160) || section.hint }
            : section;
    });
    let presets = REPORT_PRESETS.map((p) => ({ ...p, source: 'built-in' }));
    const filePresets = Array.isArray(file?.szablony ?? file?.presets) ? (file.szablony ?? file.presets) : [];
    for (const raw of filePresets) {
        const id = clean(raw?.id, 40);
        if (raw?.ukryty === true || raw?.hidden === true) { presets = presets.filter((p) => p.id !== id); continue; }
        const base = presets.find((p) => p.id === id);
        const preset = normalizePreset(base ? { ...presetToFile(base), ...raw } : raw);
        if (!preset) continue;
        presets = base ? presets.map((p) => (p.id === id ? { ...preset, source: 'server' } : p)) : [...presets, { ...preset, source: 'server' }];
    }
    const header = file?.naglowek ?? file?.header ?? {};
    const color = /^#[0-9a-f]{6}$/i.test(file?.kolor ?? file?.color ?? '') ? (file.kolor ?? file.color) : REPORT_TEXTS.color;
    const texts = {
        ...REPORT_TEXTS,
        color,
        title: clean(file?.tytul ?? file?.title, 60) || REPORT_TEXTS.title,
        header: { name: clean(header.nazwa ?? header.name, 80), contact: clean(header.kontakt ?? header.contact, 160), logo: clean(header.logo, 300) },
        disclaimer: clean(file?.zastrzezenia ?? file?.disclaimer, 1500) || REPORT_TEXTS.disclaimer,
        footer: clean(file?.stopka ?? file?.footer, 160) || REPORT_TEXTS.footer,
        defaultPreset: presets.some((p) => p.id === (file?.domyslnySzablon ?? file?.defaultPreset)) ? (file.domyslnySzablon ?? file.defaultPreset) : (presets.some((p) => p.id === REPORT_TEXTS.defaultPreset) ? REPORT_TEXTS.defaultPreset : presets[0]?.id),
    };
    // 19.40.0: progi reguł wniosków i reguły wyłączone (konfiguracja/raport-pdf.json → "reguly").
    const rules = mergeThresholds(file?.reguly ?? file?.rules);
    return { sections, presets, texts, rules, fromFile: Boolean(file) };
}

let cached = null;
/** Konfiguracja raportu: domyślna + plik serwera (pobierany raz na sesję). */
export async function loadReportConfig({ fetchImpl = fetch } = {}) {
    if (cached) return cached;
    let file = null;
    try {
        const response = await fetchImpl(REPORT_CONFIG_URL, { cache: 'no-cache' });
        const type = response.headers.get('content-type') || '';
        if (response.ok && !type.includes('text/html')) {
            const parsed = JSON.parse(await response.text());
            if (parsed && typeof parsed === 'object') file = parsed;
        }
    } catch { file = null; }
    cached = mergeReportConfig(file);
    return cached;
}

export function estimatePages(sectionIds) {
    let pages = 0; let load = 1;
    for (const section of REPORT_SECTIONS) {
        if (!sectionIds.includes(section.id)) continue;
        if (load + section.weight > 1.0001) { pages += 1; load = 0; }
        load += section.weight;
    }
    return Math.max(1, pages);
}

export const isSectionId = (id) => SECTION_IDS.has(id);
