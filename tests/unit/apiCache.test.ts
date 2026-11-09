import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiQueryClient, cachedJson, canonicalApiUrl, ApiError } from '@app/core/apiCache.js';

const okResponse = (payload: object) => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('pamięć zapytań API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { apiQueryClient.clear(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('adres kanoniczny: x/y do 0,1 m, stała kolejność parametrów', () => {
    expect(canonicalApiUrl('http://h/api/identify.php?y=698030.123&source=mpzp&x=471720.987'))
      .toBe('http://h/api/identify.php?source=mpzp&x=471721.0&y=698030.1');
  });
  it('karta (3 miejsca) i raport (2 miejsca) dzielą jeden wpis i jedno zapytanie', async () => {
    fetchMock.mockResolvedValue(okResponse({ ok: true, found: true }));
    const [a, b] = await Promise.all([
      cachedJson('http://h/api/identify.php?source=mpzp&x=471720.987&y=698030.123'),
      cachedJson('http://h/api/identify.php?source=mpzp&x=471720.99&y=698030.12'),
    ]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await cachedJson('http://h/api/identify.php?source=mpzp&x=471721&y=698030.1');
    expect(fetchMock).toHaveBeenCalledTimes(1); // z pamięci
  });
  it('błąd nie jest zapamiętywany — kolejne wywołanie pyta serwer', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'nie', retryable: true }), { status: 502 }));
    await expect(cachedJson('http://h/api/x.php?a=1')).rejects.toBeInstanceOf(ApiError);
    fetchMock.mockResolvedValueOnce(okResponse({ ok: true, v: 2 }));
    await expect(cachedJson('http://h/api/x.php?a=1')).resolves.toEqual({ ok: true, v: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('ponawia błąd przejściowy, gdy wywołujący na to pozwala', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"ok":false,"retryable":true}', { status: 503 })).mockResolvedValueOnce(okResponse({ ok: true }));
    await expect(cachedJson('http://h/api/r.php', { retry: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('przerwanie przez jedynego oczekującego anuluje zapytanie', async () => {
    let aborted = false;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); });
    }));
    const controller = new AbortController();
    const pending = cachedJson('http://h/api/slow.php', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 0));
    expect(aborted).toBe(true);
  });
});
