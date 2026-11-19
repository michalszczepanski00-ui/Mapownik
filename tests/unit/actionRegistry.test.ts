import { describe, expect, it, vi } from 'vitest';
import { ActionRegistry, actionErrors, isActionZone } from '@app/actions/registry.js';
import { parcelActionsFeature } from '@app/features/builtin/parcelActionsFeature.js';
import { BUILTIN_FEATURES, defineFeature } from '@app/features/index.js';

const action = (over: Record<string, unknown> = {}) => ({ id: 'a', zone: 'inspector.analyses', label: 'A', order: 1, run: () => {}, ...over });

describe('rejestr akcji (19.53.0, Etap 3)', () => {
  it('strefy: stałe oraz mode:<tryb> i dock:<panel>', () => {
    for (const zone of ['topbar.project', 'contextbar', 'inspector.primary', 'inspector.secondary', 'inspector.analyses', 'mode:terrain', 'dock:analyses'])
      expect(isActionZone(zone)).toBe(true);
    for (const zone of ['inspector', 'mode:', 'dock:x y', 'footer', '', null]) expect(isActionZone(zone)).toBe(false);
  });

  it('najwyżej jedna akcja w inspector.primary i inspector.secondary', () => {
    expect(actionErrors([action({ id: 'p1', zone: 'inspector.primary' }), action({ id: 'p2', zone: 'inspector.primary' })]).join(' ')).toMatch(/inspector\.primary/);
    expect(actionErrors([action({ id: 's1', zone: 'inspector.secondary' }), action({ id: 's2', zone: 'inspector.secondary' })]).join(' ')).toMatch(/inspector\.secondary/);
    expect(() => new ActionRegistry([action({ id: 'p1', zone: 'inspector.primary' }), action({ id: 'p2', zone: 'inspector.primary' })])).toThrow(/najwyżej 1/);
  });

  it('unikalne id, jedna strefa, etykieta, run i kolejność', () => {
    expect(actionErrors([action(), action()]).join(' ')).toMatch(/dwa razy/);
    expect(actionErrors([action({ zone: ['inspector.analyses', 'contextbar'] })]).join(' ')).toMatch(/jedna strefa/);
    expect(actionErrors([action({ label: '' })]).join(' ')).toMatch(/etykiety/);
    expect(actionErrors([action({ run: null })]).join(' ')).toMatch(/run/);
    expect(actionErrors([action({ order: undefined })]).join(' ')).toMatch(/kolejności/);
    expect(() => defineFeature({ id: 'x', actions: [action({ zone: 'stopka' })] })).toThrow(/strefa/);
  });

  it('list(): kolejność order i filtr when(ctx); run(): błąd do powiadomienia', async () => {
    const registry = new ActionRegistry([action({ id: 'b', order: 2 }), action({ id: 'a', order: 1, when: (ctx: { ok: boolean }) => ctx.ok })]);
    expect(registry.list('inspector.analyses').map((a) => a.id)).toEqual(['a', 'b']);
    expect(registry.list('inspector.analyses', { ok: false }).map((a) => a.id)).toEqual(['b']);
    const show = vi.fn();
    const failing = new ActionRegistry([action({ run: () => { throw new Error('nie'); } })]);
    failing.run('a', { toasts: { show } });
    expect(show).toHaveBeenCalledWith({ tone: 'danger', message: 'nie' });
  });

  it('wbudowane akcje: karta działki ma 1 główny i 1 drugi przycisk, menu Analizy i dok Analizy z rejestru', () => {
    const all = BUILTIN_FEATURES.flatMap((feature: { actions?: unknown[] }) => feature.actions ?? []);
    expect(actionErrors(all)).toEqual([]);
    const registry = new ActionRegistry(all);
    expect(registry.list('inspector.primary').map((a) => a.label)).toEqual(['Raport PDF']);
    expect(registry.list('inspector.secondary').map((a) => a.label)).toEqual(['Do projektu']);
    expect(registry.list('inspector.analyses').map((a) => a.label)).toEqual([
      'Otoczenie działki', 'Ceny transakcyjne', 'Budowy i pozwolenia', 'Analiza działki (serwer)',
      'Bufor', 'Obszar analizowany WZ', 'Wysokości i nachylenie', 'Profil terenu', 'Teren 3D']);
    expect(registry.list('dock:analyses')).toHaveLength(5);
    // Akcje działki niedostępne bez działki na karcie (paleta poleceń ich nie pokazuje).
    const ctx = { get: () => ({ getSnapshot: () => ({ open: false }) }) };
    expect(registry.list('inspector.analyses', ctx)).toEqual([]);
    expect(parcelActionsFeature.actions.every((a: { palette?: boolean }) => a.palette !== false)).toBe(true);
  });

  it('akcja otwiera panel przez ctx.panels (bez Reacta w deklaracji)', () => {
    const open = vi.fn();
    const registry = new ActionRegistry(parcelActionsFeature.actions);
    registry.run('analyses.permits', { panels: { open }, get: () => null });
    expect(open).toHaveBeenCalledWith('buildingPermits');
  });
});
