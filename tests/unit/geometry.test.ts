import { describe, expect, it } from 'vitest';
import { lineLength, ringArea, measureGeometry } from '@app/geometry/planarMeasures.js';
import { countGeometryVertices, assertTransferGeometryLimits, MAX_OBJECT_VERTICES } from '@app/geometry/geometryLimits.js';
import { validatePolygonalGeometryTopology } from '@app/geometry/topologyValidation.js';

const square = (x: number, y: number, s: number): number[][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

describe('miary geometrii (EPSG:2180, metry)', () => {
  it('długość łamanej', () => {
    expect(lineLength([[0, 0], [3, 4], [3, 10]])).toBeCloseTo(11, 9);
  });
  it('pole kwadratu 100 m = 10 000 m², bez względu na kierunek obiegu', () => {
    expect(ringArea(square(0, 0, 100))).toBe(10000);
    expect(ringArea(square(0, 0, 100).reverse())).toBe(10000);
  });
  it('poligon z otworem: pole bez otworu, obwód z otworem', () => {
    const m = measureGeometry({ type: 'Polygon', coordinates: [square(0, 0, 100), square(40, 40, 20)] });
    expect(m).toEqual({ type: 'polygon', areaM2: 9600, perimeterM: 480 });
  });
  it('wielokąt złożony sumuje części', () => {
    const m = measureGeometry({ type: 'MultiPolygon', coordinates: [[square(0, 0, 10)], [square(100, 0, 20)]] });
    expect(m && 'areaM2' in m ? m.areaM2 : null).toBe(500);
  });
  it('punkt nie ma miar', () => {
    expect(measureGeometry({ type: 'Point', coordinates: [1, 2] })).toBeNull();
  });
});

describe('limity geometrii (import i udostępnianie)', () => {
  it('liczy wierzchołki', () => {
    expect(countGeometryVertices({ type: 'Polygon', coordinates: [square(0, 0, 1)] })).toBe(5);
  });
  it('odrzuca obiekt ponad limit wierzchołków', () => {
    const line = Array.from({ length: MAX_OBJECT_VERTICES + 1 }, (_, i) => [i, 0]);
    expect(() => countGeometryVertices({ type: 'LineString', coordinates: line })).toThrow();
  });
  it('odrzuca plik z ponad 5000 obiektów', () => {
    const items = Array.from({ length: 5001 }, () => ({ geometry: { type: 'Point', coordinates: [0, 0] } }));
    expect(() => assertTransferGeometryLimits(items)).toThrow(/5000/);
  });
});

describe('topologia poligonów', () => {
  it('kwadrat jest poprawny', () => {
    expect(validatePolygonalGeometryTopology({ type: 'Polygon', coordinates: [square(0, 0, 10)] }).valid).toBe(true);
  });
  it('„kokardka” (samoprzecięcie) jest odrzucana', () => {
    const bowtie = [[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]];
    expect(validatePolygonalGeometryTopology({ type: 'Polygon', coordinates: [bowtie] }).valid).toBe(false);
  });
});
