import { createElement as h } from 'react';

/**
 * Ikony narzędzi i modułów — Tabler Icons 3.48.0 (MIT).
 *
 * Plik jest GENEROWANY: 24 miejsca w interfejsie, 24 unikalnych ikon,
 * wklejonych wprost z pakietu `@tabler/icons`. Świadomie nie ma tu zależności
 * vendorowej ani wpisu w importmapie — pobieranie całej biblioteki (5 166 ikon)
 * przez esm.sh dla dwudziestu kilku kształtów oznaczałoby kolejny punkt awarii
 * przy instalacji na hostingu, a nic by nie dało.
 *
 * Tabler rysuje na tej samej siatce co Lucide (24 x 24, kontur, `currentColor`),
 * więc te ikony stoją obok lucide'owych ikon interfejsu (oko, kosz, strzałki
 * cofania) bez różnicy w wadze kreski.
 *
 * Każda ikona to lista atrybutów `d` — w tym zestawie wszystkie elementy
 * Tablera to zwykłe `<path>`, więc nie ma potrzeby odwzorowywać innych
 * znaczników.
 */
const GLYPHS = {
    'pin-plus': ['M8 16l-3 -5a6 6 0 1 1 12 0l-5 9z','M18 15v6','M15 18h6'],
    'callout-leader': ['M5 3h15v11h-7l-5 4v-4H5z','M8 7h9','M8 10h6','M4 18l-2 4'],
    'area-search': ['M3 4h12v12H3z','M8 10a5 5 0 1 0 10 0a5 5 0 1 0 -10 0','M17 14l5 7'],
    'map-info': ['M3 5l6 -2l6 2l6 -2v11','M3 5v14l6 -2l3 1','M9 3v14','M17 15v.01','M17 18v3','M13 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0'],
    // 19.8.5: raport działki (panel „Działka, ceny i otoczenie”) — wcześniej
    // dzielił ikonę z panelem Analizy.
    'file-analytics': ['M14 3v4a1 1 0 0 0 1 1h4','M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2','M9 17v-5','M12 17v-1','M15 17v-3'],
    'photo-time': ['M4 5h16v14H4z', 'M4 16l5-6 4 4 3-3 4 5', 'M15 8h2'],
    // 19.32.0: narzędzia „Ceny transakcyjne” i „Pozwolenia na budowę” (Tabler: tag, crane).
    'tag': ['M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0','M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z'],
    'crane': ['M6 21h6','M9 21v-18l-6 6h18','M9 3l10 6','M17 9v4a2 2 0 1 1 -2 2'],
    // 18.0 — ikony własne msportalu (ten sam styl: siatka 24, kontur 2 px),
    // tam gdzie ikona Tablera myliła się z inną w palecie (audyt ergonomii):
    // bufor ≠ okrąg, analiza wysokości ≠ siatka kropek, pobranie działki,
    // edycja geometrii ≠ pomiar powierzchni.
    'buffer-zone': [
        'M9 9h6v6h-6z',
        'M4 8a4 4 0 0 1 4 -4', 'M11 4h2', 'M16 4a4 4 0 0 1 4 4', 'M20 11v2',
        'M20 16a4 4 0 0 1 -4 4', 'M13 20h-2', 'M8 20a4 4 0 0 1 -4 -4', 'M4 13v-2',
    ],
    // 18.11.2: analiza wysokości = trzy warstwice (wcześniej ramka z górami, ta sama
    // co „Ortofotomapy” na prawej belce — w palecie z samymi ikonami myliło się).
    'terrain-frame': [
        'M3 18.5c2.5 -1.6 4.6 -1.6 7 0s4.6 1.6 7 0c1.4 -.9 2.6 -1.2 4 -1',
        'M5 13.5c2 -2.6 4.2 -3.1 6.6 -1.6s4.2 1.2 6.4 -1.2',
        'M8.5 8.5c1.4 -2 3 -2.5 4.6 -1.5s2.6 .9 3.9 -.4',
    ],
    'parcel-add': [
        'M4 7l7 -3l6 3l-1 7l-7 4l-5 -3z',
        'M19 15v6', 'M16 18h6',
    ],
    'cursor-vertex': [
        'M5 4l12 5l-5.5 2l-2 5.5z',
        'M15 15h5v5h-5z',
    ],
    'hand-move': [
        'M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5',
        'M11 11.5v-2a1.5 1.5 0 0 1 3 0v2.5',
        'M14 10.5a1.5 1.5 0 0 1 3 0v1.5',
        'M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47',
        'M2.541 5.594a13.487 13.487 0 0 1 2.46 -1.427',
        'M14 3.458c1.32 .354 2.558 .902 3.685 1.612',
    ],
    'vector': [
        'M3 4a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -2',
        'M17 4a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -2',
        'M17 18a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -2',
        'M3 18a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -2',
        'M5 7l0 10',
        'M19 7l0 10',
        'M7 5l10 0',
        'M7 19l10 0',
    ],
    'pointer-question': [
        'M15.062 12.506l-.284 -.284l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l1.278 1.278',
        'M19 22v.01',
        'M19 19a2.003 2.003 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483',
    ],
    'map-down': [
        'M12 18.5l-3 -1.5l-6 3v-13l6 -3l6 3l6 -3v8.5',
        'M9 4v13',
        'M15 7v8',
        'M19 16v6',
        'M22 19l-3 3l-3 -3',
    ],
    'map-pin': [
        'M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
        'M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0',
    ],
    'line': [
        'M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
        'M16 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
        'M7.5 16.5l9 -9',
    ],
    'polygon': [
        'M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
        'M17 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
        'M3 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
        'M13 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
        'M6.5 9.5l3.5 -3',
        'M14 5.5l3 1.5',
        'M18.5 10l-2.5 7',
        'M13.5 17.5l-7 -5',
    ],
    'rectangle': ['M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10'],
    'circle': ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0'],
    'tir': [
        'M3 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
        'M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
        'M7 18h8m4 0h2v-6a5 7 0 0 0 -5 -7h-1l1.5 7h4.5',
        'M12 18v-13h3',
        'M3 17l0 -5l9 0',
    ],
    'arrow-up-right': [
        'M17 7l-10 10',
        'M8 7l9 0l0 9',
    ],
    'typography': [
        'M4 20l3 0',
        'M14 20l7 0',
        'M6.9 15l6.9 0',
        'M10.2 6.3l5.8 13.7',
        'M5 20l6 -16l2 0l7 16',
    ],
    'tag': [
        'M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3',
    ],
    'ruler-measure': [
        'M19.875 12c.621 0 1.125 .512 1.125 1.143v5.714c0 .631 -.504 1.143 -1.125 1.143h-15.875a1 1 0 0 1 -1 -1v-5.857c0 -.631 .504 -1.143 1.125 -1.143h15.75',
        'M9 12v2',
        'M6 12v3',
        'M12 12v3',
        'M18 12v3',
        'M15 12v2',
        'M3 3v4',
        'M3 5h18',
        'M21 3v4',
    ],
    'dimensions': [
        'M3 5h11',
        'M12 7l2 -2l-2 -2',
        'M5 3l-2 2l2 2',
        'M19 10v11',
        'M17 19l2 2l2 -2',
        'M21 12l-2 -2l-2 2',
        'M3 12a2 2 0 0 1 2 -2h7a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2l0 -7',
    ],
    'circle-dashed': [
        'M8.56 3.69a9 9 0 0 0 -2.92 1.95',
        'M3.69 8.56a9 9 0 0 0 -.69 3.44',
        'M3.69 15.44a9 9 0 0 0 1.95 2.92',
        'M8.56 20.31a9 9 0 0 0 3.44 .69',
        'M15.44 20.31a9 9 0 0 0 2.92 -1.95',
        'M20.31 15.44a9 9 0 0 0 .69 -3.44',
        'M20.31 8.56a9 9 0 0 0 -1.95 -2.92',
        'M15.44 3.69a9 9 0 0 0 -3.44 -.69',
    ],
    'chart-area-line': [
        'M4 19l4 -6l4 2l4 -5l4 4l0 5l-16 0',
        'M4 12l3 -4l4 2l5 -6l4 4',
    ],
    'grid-dots': [
        'M4 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M18 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M4 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M18 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    ],
    'stack-2': [
        'M12 4l-8 4l8 4l8 -4l-8 -4',
        'M4 12l8 4l8 -4',
        'M4 16l8 4l8 -4',
    ],
    'list-details': [
        'M13 5h8',
        'M13 9h5',
        'M13 15h8',
        'M13 19h5',
        'M3 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
        'M3 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
    ],
    'analyze': [
        'M20 11a8.1 8.1 0 0 0 -6.986 -6.918a8.095 8.095 0 0 0 -8.019 3.918',
        'M4 13a8.1 8.1 0 0 0 15 3',
        'M18 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M4 8a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    ],
    'download': [
        'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2',
        'M7 11l5 5l5 -5',
        'M12 4l0 12',
    ],
    'table': [
        'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14',
        'M3 10h18',
        'M10 3v18',
    ],
    'circle-dot': [
        'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
        'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
    ],
};

/**
 * Nazwa ikony z manifestu narzędzia albo panelu -> nazwa w bibliotece.
 *
 * Manifesty mówią o ROLI ('parcel', 'measure-area'), a nie o kształcie, więc
 * zmiana biblioteki albo pojedynczej ikony kończy się na tej jednej tablicy.
 */
const BY_SLOT = {
    'pan': 'hand-move',
    'select': 'cursor-vertex',
    'identify': 'map-info',
    'parcel': 'parcel-add',
    'point': 'pin-plus',
    'line': 'line',
    'polygon': 'polygon',
    'rectangle': 'rectangle',
    'circle': 'circle',
    'road': 'tir',
    'arrow': 'arrow-up-right',
    'text': 'typography',
    'callout': 'callout-leader',
    'measure-line': 'ruler-measure',
    'measure-area': 'dimensions',
    'buffer': 'buffer-zone',
    'terrain-profile': 'chart-area-line',
    'terrain-area': 'terrain-frame',
    'layers': 'stack-2',
    'orthophoto': 'photo-time',
    'market-prices': 'tag',
    'building-permits': 'crane',
    'objects': 'list-details',
    'analysis': 'area-search',
    // 19.54.0 (audyt K3): dok Analizy i Otoczenie działki mają własne kształty (wcześniej trzy razy ta sama lupa).
    'analyses': 'analyze',
    'screening': 'circle-dot',
    'parcel-report': 'file-analytics',
    'export': 'download',
    'terrain': 'chart-area-line',
    'table': 'table',
};

const FALLBACK = 'circle-dot';

/**
 * Renderuje ikonę po nazwie slotu. `size` i `strokeWidth` zachowują się tak
 * samo jak w `lucide-react`, żeby miejsca użycia nie musiały się zmieniać.
 */
export function ToolIcon({ name, size = 24, strokeWidth = 2, className, ...rest }) {
    const glyph = GLYPHS[BY_SLOT[name] ?? name] ?? GLYPHS[FALLBACK];
    return h('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        'aria-hidden': true,
        ...rest,
    }, glyph.map((d, index) => h('path', { key: index, d })));
}

/** Nazwa ikony Tablera dla slotu — na potrzeby testów i diagnostyki. */
export function tablerNameFor(name) {
    return BY_SLOT[name] ?? null;
}

export { BY_SLOT as TOOL_ICON_NAMES };
