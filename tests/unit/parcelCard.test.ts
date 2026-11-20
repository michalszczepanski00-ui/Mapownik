import { describe, expect, it } from 'vitest';
import { shortArea, itemState, shortProtectedName, shortForestOwner, RESTRICTIONS, ouzMark } from '@app/app/components/ParcelCard.js';
import { isHighClass, profileLabel, areaLabel, pctLabel, significantItems, dateLabel } from '@app/app/components/parcelShares.js';

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

describe('udziały w granicy działki (19.56.0)', () => {
  it('klasy I–III gruntów rolnych, także w użytkach zabudowanych', () => {
    for (const c of ['RI', 'RII', 'RIIIa', 'RIIIb', 'ŁIII', 'PsII', 'Br-RIIIa', 'K-RII']) expect(isHighClass(c)).toBe(true);
    for (const c of ['RIVa', 'RIVb', 'RV', 'ŁIV', 'PsIV', 'B', 'Br-RIVb', 'LsIII', 'dr']) expect(isHighClass(c)).toBe(false);
  });
  it('profil strefy bez powtórzeń „teren”', () => {
    expect(profileLabel('teren zabudowy mieszkaniowej jednorodzinnej,teren usług')).toBe('tereny zabudowy mieszkaniowej jednorodzinnej, usług');
  });
  it('powierzchnia, procent, data i drobne paski na styku konturów', () => {
    expect(areaLabel(2400)).toBe('0,24 ha');
    expect(areaLabel(42)).toBe('42 m²');
    expect(pctLabel(0.544)).toBe('54%');
    expect(pctLabel(0.004)).toBe('<1%');
    expect(dateLabel('2025/11/28')).toBe('28.11.2025');
    const items = significantItems({ areaM2: 4408, items: [{ code: 'Br-PsIV', share: 0.544 }, { code: 'RV', share: 0.0007 }] }, 4416);
    expect(items.map((i: { code: string }) => i.code)).toEqual(['Br-PsIV']);
    expect(Math.round(items[0].areaM2)).toBe(2402);
  });
});
