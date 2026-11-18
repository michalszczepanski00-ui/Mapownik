/**
 * 19.9.0: trzy grupy pierwszego poziomu — Sprawdź, Szkic, Pomiar.
 * „Przejazd” należy do Szkicu, „Teren” do Pomiaru. „Przesuń” nie ma własnego
 * przycisku: przeciąganie zawsze przesuwa mapę, a kliknięcie znaczy „sprawdź tu”
 * (spacja nadal włącza czyste przesuwanie). Skróty klawiszowe bez zmian.
 *
 * `sections` dzielą pasek narzędzi doku separatorami (`caption` — podpis sekcji,
 * tylko tam, gdzie mieści się w pasku); `tools` to płaska lista (katalog mobilny).
 */
function group(entry) {
    return Object.freeze({ ...entry, tools: entry.sections.flatMap((section) => section.tools) });
}

export const TOOL_GROUPS = Object.freeze([
    group({ id: 'information', title: 'Sprawdź', icon: 'identify', sections: [{ tools: ['core.identify'] }] }),
    group({
        id: 'drawing', title: 'Rysuj', icon: 'polygon', defaultTool: 'core.draw.polygon',
        sections: [
            { title: 'Obiekty', tools: ['core.draw.point', 'core.draw.line', 'core.draw.polygon', 'core.draw.rectangle', 'core.draw.circle', 'core.parcel.pick'] },
            { title: 'Opis', tools: ['core.draw.text', 'core.draw.arrow', 'core.draw.callout'] },
            { title: 'Przejazd', tools: ['core.draw.road'] },
            { title: 'Edycja', tools: ['core.select'] },
        ],
    }),
    group({
        id: 'measurement', title: 'Mierz', icon: 'measure-line', defaultTool: 'core.measure.line',
        sections: [
            { title: 'Pomiar', caption: 'Pomiar', tools: ['core.measure.line', 'core.measure.area', 'core.buffer', 'core.wz.area'] },
            { title: 'Teren', caption: 'Teren', tools: ['core.terrain.profile', 'core.terrain.area', 'core.terrain.3d'] },
        ],
    }),
]);

/** Krótsze podpisy w pasku doku (pełna nazwa zostaje w podpowiedzi). */
// 19.28.0: podpisy pod ikonami doku na komputerze — te same nazwy co w arkuszach telefonu.
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
