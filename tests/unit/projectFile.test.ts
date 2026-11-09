import { describe, expect, it } from 'vitest';
import { createmsportalProjectFile, parsemsportalProjectFile, serializeTransferFile } from '@app/persistence/projectTransfer.js';
import { DEFAULT_MAP_OBJECT_STYLE } from '@app/core/object/MapObject.js';

const now = '2026-11-09T10:00:00.000Z';
const object = (id: string, geometry: object, kind = 'geometry', properties: object = {}) =>
  ({ id, name: `Obiekt ${id}`, visible: true, origin: 'user', kind, properties, style: { ...DEFAULT_MAP_OBJECT_STYLE }, geometry, createdAt: now, updatedAt: now });
const square = (x: number, y: number, s: number) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

describe('plik projektu .mapownik', () => {
  const objects = [
    object('a', { type: 'Polygon', coordinates: [square(471000, 698000, 100), square(471030, 698030, 20).reverse()] }),
    object('b', { type: 'LineString', coordinates: [[471000, 698200], [471150.25, 698260.5]] }, 'measurement'),
    object('c', { type: 'Point', coordinates: [471050, 698150] }, 'text', { text: 'Zażółć gęślą jaźń' }),
  ];

  it('zapis → odczyt zachowuje obiekty i geometrię', () => {
    const file = createmsportalProjectFile({ state: null, meta: { name: 'Test' }, objects }, '19.42.0');
    const parsed = parsemsportalProjectFile(serializeTransferFile(file));
    expect(parsed.objects.map((o: { id: string }) => o.id)).toEqual(['a', 'b', 'c']);
    expect(parsed.objects[0].geometry).toEqual(objects[0].geometry);
    expect(parsed.objects[2].properties.text).toBe('Zażółć gęślą jaźń');
  });
  it('odrzuca plik innego formatu', () => {
    expect(() => parsemsportalProjectFile(JSON.stringify({ format: 'inny', objects: [] }))).toThrow();
  });
  it('odrzuca powtórzone identyfikatory obiektów', () => {
    const file = createmsportalProjectFile({ state: null, meta: { name: 'Test' }, objects: [objects[2], objects[2]] }, '19.42.0');
    expect(() => parsemsportalProjectFile(serializeTransferFile(file))).toThrow();
  });
  it('odrzuca samoprzecinający się poligon', () => {
    const bad = object('x', { type: 'Polygon', coordinates: [[[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]] });
    const text = JSON.stringify({ ...createmsportalProjectFile({ state: null, meta: { name: 'T' }, objects: [] }, '19.42.0'), objects: [bad] });
    expect(() => parsemsportalProjectFile(text)).toThrow();
  });
});
