import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installBackupReminder, markBackupSaved, BACKUP_REMINDER_CHANGES } from '@app/persistence/backupReminder.js';

function fakeObjects() {
  const listeners = new Set<() => void>();
  return { subscribeMutations: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); }, emit: () => listeners.forEach((fn) => fn()) };
}

describe('przypomnienie o kopii projektu', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    vi.stubGlobal('navigator', {});
  });
  it(`przypomina po ${BACKUP_REMINDER_CHANGES} zmianach, raz na 2 godziny, a zapis pliku zeruje licznik`, () => {
    const objects = fakeObjects(); const show = vi.fn(); let now = Date.UTC(2026, 10, 9);
    installBackupReminder({ objectManager: objects, toasts: { show }, saveBackup: async () => {}, now: () => now });
    for (let i = 0; i < BACKUP_REMINDER_CHANGES - 1; i++) objects.emit();
    expect(show).not.toHaveBeenCalled();
    objects.emit();
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0].action.label).toBe('Zapisz kopię');
    objects.emit();
    expect(show).toHaveBeenCalledTimes(1); // nie częściej niż co 2 h
    now += 2 * 3600 * 1000;
    markBackupSaved();
    for (let i = 0; i < BACKUP_REMINDER_CHANGES - 1; i++) objects.emit();
    expect(show).toHaveBeenCalledTimes(1); // licznik wyzerowany zapisem pliku
  });
});
