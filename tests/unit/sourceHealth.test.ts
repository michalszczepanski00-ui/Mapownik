import { describe, expect, it } from 'vitest';
import { healthFromOutcomes, sourceIsDown } from '@app/data/sources/adapters/healthState.js';

describe('status źródła mapy (19.46.0)', () => {
  it('ostatni obraz udany → nie „niedostępne”, nawet po serii błędów', () => {
    expect(healthFromOutcomes([false, false, false, true], 'closed')).toBe('degraded');
    expect(sourceIsDown({ health: healthFromOutcomes([false, false, false, true], 'closed') })).toBe(false);
  });
  it('ostatni obraz nieudany przy większości błędów → niedostępne', () => {
    expect(healthFromOutcomes([true, false, false, false], 'closed')).toBe('down');
  });
  it('trzy udane z rzędu → działa; otwarty bezpiecznik → wyłączone', () => {
    expect(healthFromOutcomes([false, false, true, true, true], 'closed')).toBe('healthy');
    expect(healthFromOutcomes([true], 'open')).toBe('circuit-open');
    expect(healthFromOutcomes([], 'closed')).toBe('unknown');
  });
});
