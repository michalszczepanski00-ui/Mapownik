import { describe, expect, it } from 'vitest';
import { effectiveOpacityFactor } from '@app/layers/LayerManager.js';

const planning = (id: string) => ({ id, role: 'overlay', group: 'Planowanie przestrzenne' });

describe('krycie efektywne warstw planistycznych (19.47.0)', () => {
  it('na ortofotomapie/NMT wypełnienia planistyczne ×0,6', () => {
    expect(effectiveOpacityFactor(planning('overlay.pog.zones'), { darkBasemap: true })).toBeCloseTo(0.6);
    expect(effectiveOpacityFactor(planning('overlay.pog.zones'), { darkBasemap: false })).toBe(1);
  });
  it('MPZP przy włączonych strefach POG ×0,5 (na ortofotomapie razem ×0,3)', () => {
    expect(effectiveOpacityFactor(planning('overlay.ru.mpzp.wopracowaniu'), { zonesVisible: true })).toBeCloseTo(0.5);
    expect(effectiveOpacityFactor(planning('overlay.mpzp'), { zonesVisible: true, darkBasemap: true })).toBeCloseTo(0.3);
    expect(effectiveOpacityFactor(planning('overlay.pog.adopted'), { zonesVisible: true })).toBe(1);
  });
  it('inne warstwy bez zmian', () => {
    expect(effectiveOpacityFactor({ id: 'overlay.dzialki', role: 'overlay', group: 'Działki i grunty' }, { darkBasemap: true, zonesVisible: true })).toBe(1);
    expect(effectiveOpacityFactor({ id: 'basemap.orthophoto', role: 'basemap', group: 'Podkłady' }, { darkBasemap: true })).toBe(1);
  });
});
