/**
 * 18.0 — kolory obiektów na mapie w jednym miejscu (odpowiednik 10-tokens.css
 * dla stylów OpenLayers, które nie widzą zmiennych CSS).
 *
 * Zasady z audytu ergonomii:
 *  - zaznaczenie NIE zmienia koloru obiektu; dostaje obwódkę (biała linia
 *    wewnątrz, ciemny granat na zewnątrz) i uchwyty wierzchołków — widoczne
 *    na każdym podkładzie i niemylące się z bursztynem ostrzeżeń,
 *  - obiekty projektu mają cienką białą obwiednię, która oddziela je od
 *    nakładek WMS,
 *  - domyślny kolor obiektu jest inny niż akcent interfejsu (#2563eb),
 *  - pomiary mają jeden stały, neutralny kolor i zawsze przerywaną linię.
 */
export const MAP_STYLE_TOKENS = Object.freeze({
    defaultObject: '#db2777',
    selectionHalo: 'rgba(15, 23, 42, 0.88)',
    selectionInner: '#ffffff',
    vertexFill: '#ffffff',
    vertexStroke: '#0f172a',
    casing: 'rgba(255, 255, 255, 0.85)',
    measurement: '#334155',
    measurementLabel: '#ffffff',
    terrainProfile: '#059669',
    road: '#475569',
    roadFill: 'rgba(71, 85, 105, 0.42)',
    sweptPath: 'rgba(220, 38, 38, 0.92)',
    sweptPathFill: 'rgba(220, 38, 38, 0.18)',
    roadAxis: 'rgba(255, 255, 255, 0.92)',
    textHalo: 'rgba(255, 255, 255, 0.7)',
    textHaloStrong: 'rgba(255, 255, 255, 0.92)',
    textBoxStroke: 'rgba(15, 23, 42, 0.35)',
});
