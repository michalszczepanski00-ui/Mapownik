import { describe, expect, it } from 'vitest';
import { transform } from 'ol/proj.js';
import { parseCoordinateQuery } from '@app/search/coordinateQuery.js';
import { ensureProjectProjectionRegistered } from '@app/projections/index.js';

const one = (text: string) => {
  const items = parseCoordinateQuery(text);
  expect(items.length, text).toBeGreaterThanOrEqual(1);
  return items[0];
};

describe('wyszukiwanie po współrzędnych', () => {
  it.each([
    ['52.2297, 21.0122'], ['52.2297,21.0122'], ['52,2297 21,0122'], ['52.2297 21.0122'], ['N52.2297 E21.0122'], ['52.2297N, 21.0122E'],
  ])('WGS84: %s', (text) => {
    const item = one(text);
    expect(item.lat).toBeCloseTo(52.2297, 6);
    expect(item.lon).toBeCloseTo(21.0122, 6);
  });
  it('rozpoznaje odwróconą kolejność (długość, szerokość)', () => {
    const item = one('21.0122, 52.2297');
    expect([item.lat, item.lon]).toEqual([52.2297, 21.0122]);
  });
  it('stopnie, minuty, sekundy', () => {
    const item = one(`52°13'47"N 21°00'44"E`);
    expect(item.lat).toBeCloseTo(52 + 13 / 60 + 47 / 3600, 6);
    expect(item.lon).toBeCloseTo(21 + 0 / 60 + 44 / 3600, 6);
  });
  it.each([
    ['https://www.google.com/maps/@52.2297,21.0122,15z', 52.2297, 21.0122],
    ['https://www.google.pl/maps?q=54.1496,18.5654', 54.1496, 18.5654],
    ['https://www.google.com/maps/place/Starogard/@53.97,18.48,13z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d53.9663!4d18.5296', 53.9663, 18.5296],
  ])('link Google Maps: %s', (text, lat, lon) => {
    const item = one(text);
    expect(item.lat).toBeCloseTo(lat, 6);
    expect(item.lon).toBeCloseTo(lon, 6);
  });
  it('PUWG 1992 — obie konwencje osi, punkt wraca do tych samych współrzędnych', () => {
    ensureProjectProjectionRegistered();
    const [e, n] = transform([21.0122, 52.2297], 'EPSG:4326', 'EPSG:2180');
    const items = parseCoordinateQuery(`${n.toFixed(2)} ${e.toFixed(2)}`); // geodezyjnie: X (północ), Y (wschód)
    const geodetic = items.find((item: { meta: string }) => item.meta.startsWith('X = północ'));
    expect(geodetic?.lat).toBeCloseTo(52.2297, 5);
    expect(geodetic?.lon).toBeCloseTo(21.0122, 5);
  });
  it.each([['Kórnik 1000'], ['141201_1.0001.6509'], ['40.7128, -74.0060'], ['1 2'], ['Marszałkowska 10']])('nie są współrzędnymi w Polsce: %s', (text) => {
    expect(parseCoordinateQuery(text)).toEqual([]);
  });
});
