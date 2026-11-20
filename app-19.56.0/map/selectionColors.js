/**
 * 19.54.0 (audyt T2) — jedyny kolor spoza palety „Las”: zaznaczenie NA MAPIE
 * (obrys wybranej działki, celownik, wybrana budowa, położenie użytkownika).
 * Niebieski jest najlepiej widoczny na zielono-beżowej mapie; w panelach nie występuje.
 * W CSS ten sam kolor to zmienna --zaznaczenie (assets/css/40-system-las.css).
 */
export const MAP_SELECTION = '#1d4ed8';
export const MAP_SELECTION_LIGHT = '#2563eb';
/** Wypełnienie / poświata zaznaczenia z podaną nieprzezroczystością. */
export const mapSelectionFill = (alpha) => `rgba(37, 99, 235, ${alpha})`;
