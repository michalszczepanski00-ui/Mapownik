/**
 * 18.0 — jedna lista rodzajów obiektów projektu.
 *
 * Wcześniej była wpisana osobno w schemacie zapisu (10 rodzajów) i w imporcie
 * GeoJSON (9 — brakowało „analysis”, więc wynik analizy po eksporcie
 * i ponownym imporcie stawał się zwykłą geometrią). Nowy rodzaj obiektu
 * dopisuje się tylko tutaj.
 */
export const MAP_OBJECT_KINDS = Object.freeze([
    'geometry', 'text', 'callout', 'arrow', 'rectangle', 'circle', 'road',
    'measurement', 'terrain-profile', 'analysis',
]);

export function isMapObjectKind(value) {
    return MAP_OBJECT_KINDS.includes(value);
}

/**
 * Przestrzeń danych funkcji w `properties.features[<id funkcji>]`.
 * Schemat zapisu usuwa nieznane pola z `properties`, więc funkcja, która
 * potrzebuje własnych właściwości obiektu, trzyma je tutaj — pod własnym
 * identyfikatorem — i nic nie ginie przy zapisie, eksporcie ani imporcie.
 */
export const FEATURE_DATA_KEY = 'features';
export const FEATURE_ID_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/;
