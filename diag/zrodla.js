// msportal 19.47.0 — teksty źródłowe dla testów diagnostyki, które sprawdzają treść modułów
// (np. „panel używa klucza X”, „arkusz zawiera regułę Y”).
//
// Do 19.44.0 diagnostyka pobierała je z serwera (katalog app-<wersja>/ i assets/css/). Od 19.45.0
// tych katalogów na serwerze nie ma: Vite dołącza teksty w czasie budowania do osobnego pliku
// assets/build/zrodla-*.js, wczytywanego tylko przez diagnostykę (nie przez portal i nie do trybu offline).
const pliki = import.meta.glob(['../app-*/**/*.js', '../assets/css/*.css'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Ścieżka względna do katalogu portalu (np. „app-19.47.0/main.js”) → treść pliku. */
export const ZRODLA = new Map(
  Object.entries(pliki).map(([sciezka, tresc]) => [sciezka.replace(/^\.\.\//, ''), String(tresc)]),
);
