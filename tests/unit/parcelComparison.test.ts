import { describe, expect, it } from 'vitest';
import {
  cellText, cellTone, projectParcelItems, parcelIdFromObjectId, summarizeFlood, summarizeHits, summarizePlan,
  summarizePrices, summarizeSoilClasses, summarizeTerrain, summarizeZoning, toComparisonCsv, NOT_CHECKED,
} from '@app/parcels/parcelComparison';

const plain = (text: string): string => text.replace(/[  ]/g, ' ');

// Fragment rzeczywistej odpowiedzi api/vps.php?route=parcel/analyze (działka 220408_2.0006.210/2) z dopisanymi trafieniami.
const analysis = {
  ok: true,
  parcel: { id: '220408_2.0006.210/2', areaM2: 35164.84, admin: { voivodeship: 'pomorskie', county: 'powiat gdański', commune: 'Trąbki Wielkie', region: 'Gołębiewo', parcel: '210/2' } },
  layers: {
    mpzp: { status: 'online_rejestr', matches: [{ label: 'MPZP wsi Gołębiewo — 1MN', link: 'https://example.invalid/plan' }, { label: 'MPZP wsi Gołębiewo — 1MN' }], online: { status: 'complete' } },
    pog: { status: 'online_rejestr', matches: [{ kind: 'akt', label: 'Plan ogólny gminy Trąbki Wielkie' }, { kind: 'strefa', label: 'SM — strefa mieszkaniowa', partPct: 70.2 }, { kind: 'strefa', label: 'SR — strefa rolna', partPct: 29.8 }], online: { status: 'complete' } },
  },
};

describe('porównanie działek — dane', () => {
  it('działki projektu to obiekty „parcel:<identyfikator>” z ewidencji', () => {
    const items = [
      { id: 'parcel:220408_2.0006.210/2', origin: 'parcel' }, { id: 'abc', origin: 'user' }, { id: 'parcel:x', origin: 'import' }, { id: 'p2', origin: 'parcel' },
    ];
    expect(projectParcelItems(items).map((i: { id: string }) => i.id)).toEqual(['parcel:220408_2.0006.210/2']);
    expect(parcelIdFromObjectId('parcel:220408_2.0006.210/2')).toBe('220408_2.0006.210/2');
  });

  it('analiza działki → MPZP bez powtórzeń, strefy planu ogólnego z udziałem', () => {
    const plan = summarizePlan(analysis);
    expect(plan.number).toBe('210/2');
    expect(plan.region).toBe('Gołębiewo');
    expect(plan.mpzp.items).toEqual(['MPZP wsi Gołębiewo — 1MN']);
    expect(plan.pog.zones).toEqual([{ label: 'SM — strefa mieszkaniowa', pct: 70 }, { label: 'SR — strefa rolna', pct: 30 }]);
    const row = { plan, areaM2: 35164.84 };
    expect(cellText(row, 'pog')).toBe('SM — strefa mieszkaniowa (70%); SR — strefa rolna (30%)');
    expect(plain(cellText(row, 'area'))).toBe('3,52 ha');
  });

  it('brak wpisu w rejestrze ≠ „nie sprawdzono”; niepełna odpowiedź rejestru → „nie sprawdzono”', () => {
    const empty = summarizePlan({ parcel: { admin: {} }, layers: { mpzp: { matches: [], online: { status: 'complete' } }, pog: { matches: [], online: { status: 'partial' } } } });
    expect(cellText({ plan: empty }, 'mpzp')).toBe('brak w rejestrze');
    expect(cellText({ plan: empty }, 'pog')).toBe(NOT_CHECKED);
    expect(cellText({ plan: { error: 'HTTP 502' } }, 'mpzp')).toBe(NOT_CHECKED);
  });

  it('„poza” tylko wtedy, gdy odpowiedziały wszystkie punkty', () => {
    const none = { ok: true, found: false, text: null };
    expect(summarizeHits([none, none, none]).status).toBe('out');
    expect(summarizeHits([none, { error: 'upstream' }, none]).status).toBe('unknown');
    const hit = summarizeHits([none, { ok: true, found: true, text: 'nazwa = Dolina Wisły\nkod = PLB040003' }]);
    expect(hit).toMatchObject({ status: 'in', names: ['Dolina Wisły'] });
    expect(cellText({ natura: hit }, 'natura')).toBe('Dolina Wisły');
    expect(cellTone({ natura: hit }, 'natura')).toBe('warn');
    expect(cellText({ natura: summarizeHits([{ error: 'x' }]) }, 'natura')).toBe(NOT_CHECKED);
    expect(cellTone({ natura: summarizeHits([{ error: 'x' }]) }, 'natura')).toBe('muted');
  });

  it('powódź: scenariusze z odpowiedzi ISOK', () => {
    const text = "Results for FeatureType 'NZ.Fluvial':\r\n--------------------------------------------\r\nhazardcategory = fluvial\r\nloo_qualitativelikelihood = scenariusz Q 10% (raz na 10 lat)\r\n";
    const flood = summarizeFlood([{ ok: true, found: true, text }, { ok: true, found: false }]);
    expect(flood.status).toBe('in');
    expect(cellText({ flood }, 'flood')).toBe('zagrożenie: scenariusz Q 10% (raz na 10 lat)');
  });

  it('klasy użytków z ewidencji; grupa rejestrowa pomijana', () => {
    const soil = summarizeSoilClasses([
      { ok: true, found: true, text: 'Numer działki: 210/2\nGrupa rejestrowa: 7\nOznaczenie klasoużytku: RIIIa\nOFU (użytek): B' },
      { ok: true, found: true, text: 'Oznaczenie klasoużytku: ŁIV, PsV' },
    ]);
    expect(soil.classes).toEqual(['B', 'PsV', 'RIIIa', 'ŁIV']);
    expect(cellTone({ soil }, 'soil')).toBe('warn');
    expect(cellText({ soil: summarizeSoilClasses([{ ok: true, found: true, text: 'Grupa rejestrowa: 7' }]) }, 'soil')).toBe('brak danych w ewidencji');
  });

  it('ceny i wysokości', () => {
    const prices = summarizePrices({ radius: 1000, years: 5, marketCount: 71, stats: { medianPerM2: 155, p25PerM2: 117, p75PerM2: 187 } });
    expect(plain(cellText({ prices }, 'price'))).toBe('155 zł/m²');
    expect(cellText({ prices: summarizePrices({ radius: 1000, stats: {} }) }, 'price')).toBe('brak transakcji (1 km)');
    expect(summarizeTerrain([101.2, null, 99.5, 104.0])).toEqual({ min: 99.5, max: 104, drop: 4.5, samples: 3 });
    expect(summarizeTerrain([5])).toBeNull();
    expect(cellText({ terrain: summarizeTerrain([99.5, 104]) }, 'terrain')).toBe('4,5 m (99,5–104 m n.p.m.)');
  });

  it('CSV: średniki, BOM, liczby z przecinkiem, cudzysłowy przy średniku w treści', () => {
    const row = {
      parcelId: '220408_2.0006.210/2', number: '210/2', region: 'Gołębiewo', commune: 'Trąbki Wielkie', areaM2: 35164.84,
      plan: summarizePlan(analysis), natura: summarizeHits([{ ok: true, found: false }]), protection: summarizeHits([{ error: 'x' }]),
      flood: summarizeFlood([{ ok: true, found: false }]), soil: summarizeSoilClasses([{ ok: true, found: false }]),
      prices: summarizePrices({ radius: 1000, years: 5, marketCount: 71, stats: { medianPerM2: 155, p25PerM2: 117, p75PerM2: 187 } }),
      terrain: summarizeTerrain([99.5, 104]), checkedAt: '2026-11-10T07:00:00.000Z',
    };
    const csv = toComparisonCsv([row]);
    expect(csv.startsWith('﻿identyfikator;numer;obreb;gmina;powierzchnia_m2;')).toBe(true);
    const line = csv.split('\r\n')[1];
    expect(line).toContain('220408_2.0006.210/2;210/2;Gołębiewo;Trąbki Wielkie;35165;MPZP wsi Gołębiewo — 1MN;nie sprawdzono;"SM — strefa mieszkaniowa (70%); SR — strefa rolna (30%)";poza;nie sprawdzono;poza;');
    expect(line).toContain(';155;117;187;71;99,5;104,0;4,5;2026-11-10T07:00:00.000Z');
  });
  it('mapa planów: nazwa planu i przeznaczenie bez powtórzeń (odpowiedź z Warszawy)', () => {
    const text = 'Intensywność zabudowy: 0,2\nPrzeznaczenie: zieleń urządzona\nSymbol przeznaczenia: 10C ZP(U)\nNAZWA_PLAN: rej. ul. Zelaznej cz. północna A\nWWW: ../dane/plany/17.11.html\n\n'
      + 'Przeznaczenie: usługi kultu religijnego\nSymbol przeznaczenia: 10B UKS\nNAZWA_PLAN: rej. ul. Zelaznej cz. północna A\n\n'
      + 'Przeznaczenie: zieleń urządzona\nSymbol przeznaczenia: 10C ZP(U)\nNAZWA_PLAN: rej. ul. Zelaznej cz. północna A';
    const zoning = summarizeZoning([{ ok: true, found: true, text }, { error: 'timeout' }]);
    expect(zoning.status).toBe('in');
    expect(zoning.plans).toEqual(['rej. ul. Zelaznej cz. północna A']);
    expect(cellText({ zoning }, 'zoning')).toBe('10C ZP(U) (zieleń urządzona), 10B UKS (usługi kultu religijnego)');
    // Pełna nazwa z rejestru ma pierwszeństwo przed skróconą z mapy planów; bez rejestru — nazwa z mapy.
    const plan = summarizePlan({ parcel: { admin: {} }, layers: { mpzp: { matches: [{ label: 'REJ. UL. ZELAZNEJ CZ. PÓŁNOCNA A' }], online: { status: 'complete' } }, pog: { matches: [] } } });
    expect(cellText({ plan, zoning }, 'mpzp')).toBe('REJ. UL. ZELAZNEJ CZ. PÓŁNOCNA A');
    const noRegistry = summarizePlan({ parcel: { admin: {} }, layers: { mpzp: { matches: [], online: { status: 'complete' } }, pog: { matches: [] } } });
    expect(cellText({ plan: noRegistry, zoning }, 'mpzp')).toBe('rej. ul. Zelaznej cz. północna A');
    // Mapa planów pusta we wszystkich punktach + rejestr pusty → „brak planu”; usługa gminy niedostępna → „brak w rejestrze”.
    const none = summarizeZoning([{ ok: true, found: false }, { ok: true, found: false }]);
    const empty = summarizePlan({ parcel: { admin: {} }, layers: { mpzp: { matches: [], online: { status: 'complete' } }, pog: { matches: [] } } });
    expect(cellText({ plan: empty, zoning: none }, 'mpzp')).toBe('brak planu');
    expect(cellText({ plan: empty, zoning: summarizeZoning([{ error: 'not_published' }]) }, 'mpzp')).toBe('brak w rejestrze');
  });
});
