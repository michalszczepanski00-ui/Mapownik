import { describe, expect, it } from 'vitest';
import { shortArea, itemState, shortProtectedName, shortForestOwner, RESTRICTIONS, ouzMark } from '@app/app/components/ParcelCard.js';

describe('karta działki 19.51.0 — krótkie wartości', () => {
  it('powierzchnia: ha z dwoma miejscami, poniżej 1 ha w m²', () => {
    expect(shortArea(218541)).toBe('21,85 ha');
    expect(shortArea(349)).toBe('349 m²');
    expect(shortArea(null)).toBeNull();
  });
  it('formy ochrony i las — skróty', () => {
    expect(shortProtectedName('Kampinoski Park Narodowy')).toBe('Kampinoski PN');
    expect(shortProtectedName('Dłubniański Park Krajobrazowy')).toBe('Dłubniański PK');
    expect(shortForestOwner('sp w zarządzie parków narodowych, poza LP')).toBe('park narodowy');
    expect(shortForestOwner('prywatny, poza LP')).toBe('prywatny');
  });
});

describe('karta działki 19.51.0 — grupowanie ograniczeń', () => {
  const L = (status: string, extra = {}) => ({ status, ...extra });
  it('stan pozycji z kilku źródeł', () => {
    expect(itemState([])).toBe('none');
    expect(itemState([L('empty'), L('ready')])).toBe('yes');
    expect(itemState([L('empty'), L('loading')])).toBe('loading');
    expect(itemState([L('empty'), L('error')])).toBe('unknown');
    expect(itemState([L('empty'), L('empty')])).toBe('no');
  });
  it('każde źródło ograniczeń ma nazwę do linii „Brak: …” i warstwę na mapie', () => {
    for (const r of RESTRICTIONS) { expect(r.short.length).toBeGreaterThan(1); expect(r.show.length).toBeGreaterThan(0); }
  });
});

describe('obszar uzupełnienia zabudowy (19.55.0)', () => {
  it('odczytuje oznaczenie OUZ z odpowiedzi planu ogólnego', () => {
    const text = 'Tytuł: Plan ogólny gminy Zapolice\nObowiązuje od: 2025/11/28\n\nOznaczenie: 93OUZ\nSymbol: OUZ\nObowiązuje od: 2025/11/28';
    expect(ouzMark(text)).toBe('93OUZ');
    expect(ouzMark('Symbol: OUZ')).toBe('OUZ');
  });
  it('strefa planistyczna to nie obszar uzupełnienia', () => {
    expect(ouzMark('Oznaczenie: 107SO\nSymbol: SO')).toBeNull();
    expect(ouzMark('')).toBeNull();
  });
});
