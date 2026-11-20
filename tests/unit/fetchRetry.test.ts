import { describe, expect, it, vi } from 'vitest';
import { fetchJsonWithRetry, friendlyMessage, FRIENDLY_ERROR } from '@app/core/fetchRetry.js';

const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

describe('zapytania z ponowieniem (19.47.0)', () => {
  it('502 z GUGiK → ponowienie → wynik', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(502, { ok: false, error: 'SSL_ERROR_SYSCALL, errno 104', retryable: true }))
      .mockResolvedValueOnce(reply(200, { ok: true, count: 5 }));
    await expect(fetchJsonWithRetry('x', { fetchImpl, delays: [1] })).resolves.toEqual({ ok: true, count: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('po 3 nieudanych próbach — zwykły komunikat zamiast tekstu OpenSSL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(502, { ok: false, error: 'OpenSSL SSL_read: SSL_ERROR_SYSCALL, errno 104', retryable: true }));
    await expect(fetchJsonWithRetry('x', { fetchImpl, delays: [1] })).rejects.toThrow(FRIENDLY_ERROR);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('błąd zapytania (400) nie jest ponawiany i zachowuje treść', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(400, { ok: false, error: 'Nieprawidłowe współrzędne.' }));
    await expect(fetchJsonWithRetry('x', { fetchImpl, delays: [1] })).rejects.toThrow('Nieprawidłowe współrzędne.');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('brak sieci → ponowienia, potem zwykły komunikat', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchJsonWithRetry('x', { fetchImpl, delays: [1] })).rejects.toThrow(FRIENDLY_ERROR);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('komunikaty techniczne zamieniane, zwykłe zostają', () => {
    expect(friendlyMessage('curl error 56: Recv failure')).toBe(FRIENDLY_ERROR);
    expect(friendlyMessage('Rejestr cen GUGiK odpowiada zbyt wolno.')).toBe('Rejestr cen GUGiK odpowiada zbyt wolno.');
  });
});
