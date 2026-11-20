/**
 * 19.9.0: grupy pierwszego poziomu (od 19.53.0 cztery tryby, opis niżej).
 * „Przesuń” nie ma własnego
 * przycisku: przeciąganie zawsze przesuwa mapę, a kliknięcie znaczy „sprawdź tu”
 * (spacja nadal włącza czyste przesuwanie). Skróty klawiszowe bez zmian.
 *
 * `sections` dzielą pasek narzędzi doku separatorami (nazwa sekcji w dymku i dla czytnika ekranu);
 * `tools` to płaska lista (katalog mobilny).
 */
function group(entry) {
    return Object.freeze({ ...entry, tools: entry.sections.flatMap((section) => section.tools) });
}

// 19.53.0 (Etap 3): cztery tryby — Sprawdź · Rysuj · Mierz · Teren. Mierz to tylko pomiar
// (Odległość, Powierzchnia); narzędzia działające na terenie i obszarze (Bufor, Obszar WZ,
// Profil, Wysokości, Teren 3D) mają własny tryb. Rysuj: kształty · opisy · specjalne · Edytuj.
// Narzędzia, skróty i ich działanie bez zmian — zmienia się tylko przydział do trybu.
export const TOOL_GROUPS = Object.freeze([
    group({ id: 'information', title: 'Sprawdź', icon: 'identify', sections: [{ tools: ['core.identify'] }] }),
    group({
        id: 'drawing', title: 'Rysuj', icon: 'polygon', defaultTool: 'core.draw.polygon',
        sections: [
            { title: 'Kształty', tools: ['core.draw.point', 'core.draw.line', 'core.draw.polygon', 'core.draw.rectangle', 'core.draw.circle'] },
            { title: 'Opisy', tools: ['core.draw.text', 'core.draw.arrow', 'core.draw.callout'] },
            { title: 'Specjalne', tools: ['core.parcel.pick', 'core.draw.road'] },
            { title: 'Edycja', tools: ['core.select'] },
        ],
    }),
    group({
        id: 'measurement', title: 'Mierz', icon: 'measure-line', defaultTool: 'core.measure.line',
        sections: [{ title: 'Pomiar', tools: ['core.measure.line', 'core.measure.area'] }],
    }),
    group({
        id: 'terrain', title: 'Teren', icon: 'terrain-profile', defaultTool: 'core.buffer',
        sections: [
            { title: 'Obszar', tools: ['core.buffer', 'core.wz.area'] },
            { title: 'Rzeźba terenu', tools: ['core.terrain.profile', 'core.terrain.area', 'core.terrain.3d'] },
        ],
    }),
]);

/** Krótkie nazwy narzędzi — dymek ikony w doku (19.53.0: bez podpisów pod ikonami) i arkusze telefonu. */
export const DOCK_LABELS = Object.freeze({
    'core.draw.point': 'Punkt', 'core.draw.line': 'Linia', 'core.draw.polygon': 'Poligon', 'core.draw.rectangle': 'Prostokąt',
    'core.draw.circle': 'Okrąg', 'core.parcel.pick': 'Działka', 'core.draw.text': 'Tekst', 'core.draw.arrow': 'Strzałka',
    'core.draw.callout': 'Etykieta', 'core.draw.road': 'Przejazd', 'core.select': 'Edytuj',
    'core.measure.line': 'Odległość', 'core.measure.area': 'Powierzchnia', 'core.buffer': 'Bufor', 'core.wz.area': 'Obszar WZ',
    'core.terrain.profile': 'Profil', 'core.terrain.area': 'Wysokości', 'core.terrain.3d': 'Teren 3D',
});

/** Narzędzia „spoczynkowe” — nie rozwijają doku. */
export const IDLE_TOOL_IDS = Object.freeze(['core.identify', 'core.pan']);

export function groupOfTool(toolId) {
    return TOOL_GROUPS.find((entry) => entry.tools.includes(toolId)) ?? null;
}
