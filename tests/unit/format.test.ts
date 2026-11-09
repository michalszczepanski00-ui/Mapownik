import { describe, expect, it } from 'vitest';
import { formatLength, formatArea, formatParcelArea } from '@app/core/units.js';
import { isParcelIdentifier, isParcelIdentifierCandidate, normalizeParcelIdentifier } from '@app/search/parcelIdentifier.js';
import { parseParcelWkt } from '@app/parcels/wkt.js';

// Intl (pl-PL) oddziela tysiące spacją niełamliwą — porównujemy po zamianie na zwykłą spację.
const plain = (text: string): string => text.replace(/[  ]/g, ' ');

describe('formatowanie odległości i powierzchni', () => {
  it.each([
    [0, '0 m'], [7.25, '7,3 m'], [250, '250 m'], [1500, '1,50 km'], [25400, '25,4 km'], [397322, '397 km'],
  ])('%s m → %s', (value, expected) => expect(plain(formatLength(value))).toBe(expected));
  it.each([
    [921.2, '921 m²'], [15011, '1,50 ha'], [2_500_000, '250,0 ha'], [2_000_000_000, '2000 km²'], [25_000_000_000, '25 000 km²'],
  ])('%s m² → %s', (value, expected) => expect(plain(formatArea(value))).toBe(expected));
  it('działka: ha z 4 miejscami i m²', () => expect(plain(formatParcelArea(12345))).toBe('1,2345 ha (12 345 m²)'));
  it('brak wartości → kreska', () => expect(formatLength(null)).toBe('—'));
});

describe('identyfikator działki EGiB', () => {
  it('rozpoznaje pełny identyfikator (także z arkuszem i mianownikiem)', () => {
    expect(isParcelIdentifier('141201_1.0001.6509')).toBe(true);
    expect(isParcelIdentifier(' 220408_2.0006.210/2 ')).toBe(true);
    expect(isParcelIdentifier('146501_8.0101.AR_12.45/3')).toBe(true);
  });
  it('odrzuca niepełne', () => {
    expect(isParcelIdentifier('141201_1.0001')).toBe(false);
    expect(isParcelIdentifierCandidate('141201_1.')).toBe(true);
  });
  it('normalizuje wielkość liter', () => expect(normalizeParcelIdentifier(' 146501_8.0101.ar_12.45 ')).toBe('146501_8.0101.AR_12.45'));
});

describe('WKT z ULDK', () => {
  it('POLYGON z SRID', () => {
    const g = parseParcelWkt('SRID=2180;POLYGON((0 0,10 0,10 10,0 10,0 0))');
    expect(g.type).toBe('Polygon');
    expect(g.coordinates[0]).toHaveLength(5);
  });
  it('MULTIPOLYGON z dwiema częściami', () => {
    const g = parseParcelWkt('MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((5 5,6 5,6 6,5 5)))');
    expect(g.type).toBe('MultiPolygon');
    expect(g.coordinates).toHaveLength(2);
  });
  it('odrzuca inne typy', () => expect(() => parseParcelWkt('POINT(1 2)')).toThrow());
});
