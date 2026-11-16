import { describe, expect, it } from 'vitest';
import { frontAt, wzDistance } from '@app/buffer/WzAreaManager.js';
import { floodVerdict, verdictState } from '@app/app/components/IdentifyPanel.js';

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

describe('werdykt: powódź i zabytek (19.50.0)', () => {
  const by = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([k, status]) => [k, { sourceKey: k, status }]));
  it('obszar zagrożenia ma pierwszeństwo przed strefą ryzyka', () => {
    expect(floodVerdict(by({ flood_mzpmrp: 'ready', flood_risk: 'ready' }))[0]).toBe('obszar zagrożenia');
    expect(floodVerdict(by({ flood_mzpmrp: 'empty', flood_risk: 'ready' }))[0]).toBe('strefa ryzyka');
    expect(floodVerdict(by({ flood_mzpmrp: 'empty', flood_risk: 'empty' }))[0]).toBe('brak w mapach');
    expect(floodVerdict(by({ flood_mzpmrp: 'error', flood_risk: 'empty' }))[0]).toBe('nie sprawdzono');
  });
  it('stan wiersza powodzi liczony z obu źródeł', () => {
    const item = { key: 'flood_mzpmrp', keys: ['flood_mzpmrp', 'flood_risk'] };
    expect(verdictState(item, by({ flood_mzpmrp: 'empty', flood_risk: 'ready' }))).toBe('yes');
    expect(verdictState(item, by({ flood_mzpmrp: 'empty', flood_risk: 'empty' }))).toBe('no');
  });
});
