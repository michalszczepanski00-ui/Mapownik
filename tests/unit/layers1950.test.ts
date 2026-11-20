import { describe, expect, it } from 'vitest';
import { frontAt, wzDistance } from '@app/buffer/WzAreaManager.js';
import { RESTRICTIONS, itemState } from '@app/app/components/ParcelCard.js';

// Działka 30 × 20 m, dolna krawędź podzielona na trzy odcinki w jednej linii (jak obrys z ewidencji).
const parcel = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [20, 0.1], [30, 0], [30, 20], [0, 20], [0, 0]]] };

describe('obszar analizowany WZ (19.50.0)', () => {
  it('3 × front, nie mniej niż 50 m', () => {
    expect(wzDistance(10)).toBe(50);
    expect(wzDistance(24.3)).toBe(72.9);
    expect(wzDistance(0)).toBeNull();
    expect(wzDistance('abc')).toBeNull();
  });
  it('front: łączy odcinki w jednej linii, nie bierze narożnika', () => {
    const front = frontAt(parcel, [15, -2]);
    expect(front?.length).toBeCloseTo(30, 0);
    expect(front?.line.coordinates).toHaveLength(4);
    const side = frontAt(parcel, [32, 10]);
    expect(side?.length).toBe(20);
  });
});

describe('karta działki: powódź (19.50.0, od 19.53.0 tylko karta w grupach)', () => {
  const by = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([k, status]) => [k, { sourceKey: k, status }]));
  const flood = RESTRICTIONS.find((r) => r.id === 'flood')!;
  const layersOf = (map: Map<string, { sourceKey: string; status: string }>) => flood.keys.map((k) => map.get(k)).filter(Boolean) as { sourceKey: string; status: string }[];
  it('obszar zagrożenia ma pierwszeństwo przed strefą ryzyka', () => {
    expect(flood.value([], by({ flood_mzpmrp: 'ready', flood_risk: 'ready' }))).toBe('obszar zagrożenia');
    expect(flood.value([], by({ flood_mzpmrp: 'empty', flood_risk: 'ready' }))).toBe('strefa ryzyka');
  });
  it('stan wiersza powodzi liczony z obu źródeł', () => {
    expect(itemState(layersOf(by({ flood_mzpmrp: 'empty', flood_risk: 'ready' })))).toBe('yes');
    expect(itemState(layersOf(by({ flood_mzpmrp: 'empty', flood_risk: 'empty' })))).toBe('no');
    expect(itemState(layersOf(by({ flood_mzpmrp: 'error', flood_risk: 'empty' })))).toBe('unknown');
  });
});
