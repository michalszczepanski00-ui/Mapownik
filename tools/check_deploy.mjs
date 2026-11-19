#!/usr/bin/env node
/**
 * msportal 19.54.0 — kontrola wgranego portalu (lista kontrolna wdrożenia jako skrypt).
 *
 *   node tools/check_deploy.mjs https://mapownik.example.pl/test22            # pełna kontrola po wgraniu
 *   node tools/check_deploy.mjs https://… --monitor                           # krótka kontrola dostępności (monitoring)
 *   node tools/check_deploy.mjs https://… --browser                           # + tryb offline w przeglądarce (Playwright)
 *   node tools/check_deploy.mjs https://… --json                              # wynik jako JSON
 *
 * Kod wyjścia: 0 — wszystko OK albo tylko ostrzeżenia, 1 — co najmniej jeden błąd.
 * Skrypt tylko czyta (GET/HEAD i jeden mały eksport PNG); niczego na serwerze nie zmienia.
 */
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) || '').replace(/\/+$/, '');
const monitor = args.includes('--monitor');
const browser = args.includes('--browser');
const asJson = args.includes('--json');
if (!base) {
  console.error('Użycie: node tools/check_deploy.mjs https://adres-portalu [--monitor] [--browser] [--json]');
  process.exit(2);
}

const results = [];
const add = (group, name, state, detail = '') => results.push({ group, name, state, detail: String(detail).slice(0, 300) });
const url = (path) => `${base}/${path.replace(/^\//, '')}`;

async function get(path, { redirect = 'follow', method = 'GET', timeoutMs = 45000, body, headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url(path), { redirect, method, signal: controller.signal, body, headers, cache: 'no-store' });
    const buffer = method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, buffer, text: () => buffer.toString('utf8'), ms: Date.now() - started };
  } catch (error) {
    return { status: 0, headers: new Headers(), buffer: Buffer.alloc(0), text: () => '', ms: Date.now() - started, error: error?.name === 'AbortError' ? 'przekroczony czas' : String(error?.message || error) };
  } finally { clearTimeout(timer); }
}
const json = (r) => { try { return JSON.parse(r.text()); } catch { return null; } };
const check = async (group, name, fn) => {
  try { const out = await fn(); if (out) add(group, name, out[0], out[1]); }
  catch (error) { add(group, name, 'BŁĄD', error?.message || error); }
};

// Punkt odniesienia: działka 220408_2.0006.210/2 (Trąbki Wielkie) i obszar Natura 2000 (punkt wzorcowy monitora).
const PARCEL = { x: 471720, y: 698030 };
const NATURA = { x: 605589, y: 497133 };

// ---------------------------------------------------------------- dostępność (także --monitor)
await check('Dostępność', 'Strona główna', async () => {
  const r = await get('index.html');
  if (r.status !== 200) return ['BŁĄD', `HTTP ${r.status} ${r.error ?? ''}`];
  const html = r.text();
  const bundle = (html.match(/src="\.\/(assets\/build\/main-[\w-]+\.js)"/) || [])[1];
  if (!bundle) return ['BŁĄD', 'index.html bez paczki assets/build/main-*.js'];
  const js = await get(bundle, { method: 'HEAD' });
  return js.status === 200 ? ['OK', `${r.ms} ms, paczka ${bundle}`] : ['BŁĄD', `brak ${bundle} (HTTP ${js.status})`];
});
let health = null;
await check('Dostępność', 'API (health.php)', async () => {
  const r = await get('api/health.php');
  health = json(r);
  if (r.status !== 200 || !health?.ok) return ['BŁĄD', `HTTP ${r.status} ${r.error ?? ''}`];
  return ['OK', `${health.version}, PHP ${health.php}, ${r.ms} ms`];
});
await check('Dostępność', 'Działki ULDK (api/uldk.php)', async () => {
  const r = await get(`api/uldk.php?x=${PARCEL.x}&y=${PARCEL.y}`);
  const d = json(r);
  return d?.ok ? ['OK', `${d.parcel?.id} · ${r.ms} ms`] : ['BŁĄD', d?.error || `HTTP ${r.status} ${r.error ?? ''}`];
});
await check('Dostępność', 'Wyszukiwarka (api/search.php)', async () => {
  const r = await get('api/search.php?mode=parcel-id&q=220408_2.0006.210%2F2');
  const d = json(r);
  return d?.ok && d.items?.length ? ['OK', `${r.ms} ms`] : ['BŁĄD', d?.error || `HTTP ${r.status}`];
});
await check('Dostępność', 'Mapa: kafel ewidencji (api/wms.php)', async () => {
  const bbox = [PARCEL.x - 150, PARCEL.y - 150, PARCEL.x + 150, PARCEL.y + 150].join(',');
  const r = await get(`api/wms.php?source=dzialki&SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&SRS=EPSG:2180&BBOX=${bbox}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true`);
  const cache = r.headers.get('x-msportal-cache') || '';
  if (r.status !== 200 || !/^image\//.test(r.headers.get('content-type') || '')) return ['BŁĄD', `HTTP ${r.status}`];
  return /FALLBACK/i.test(cache) ? ['OSTRZEŻENIE', `usługa nie odpowiada (${r.headers.get('x-msportal-upstream-error') || 'zastępczy kafel'})`] : ['OK', `${cache}, ${r.ms} ms`];
});

if (!monitor) {
  // -------------------------------------------------------------- wersja i wgranie
  await check('Wgranie', 'verify-deployment.php', async () => {
    const r = await get('verify-deployment.php');
    const d = json(r);
    if (!d) return ['BŁĄD', `HTTP ${r.status} — plik niewgrany albo błąd PHP`];
    if (!d.deployment_consistent) return ['BŁĄD', `niespójne: wersja ${d.expected}, katalogi ${JSON.stringify(d.app_directories_present)}, brakujące pliki ${JSON.stringify(d.bundle_missing)}`];
    // 19.45.0: katalogi app-*, dawne biblioteki vendor/ i setup-vendors.php są zbędne (kod jest w assets/build/).
    if (d.leftover_files?.length) return ['OSTRZEŻENIE', `wersja ${d.expected}; do usunięcia z serwera: ${d.leftover_files.join(', ')}`];
    return ['OK', `wersja ${d.expected}, ${d.bundle_files} plików paczki`];
  });
  await check('Wgranie', 'Rozszerzenia PHP', async () => {
    if (!health) return ['BŁĄD', 'brak odpowiedzi health.php'];
    const missing = ['curl', 'gd', 'zip', 'pdo_sqlite', 'cache_writable', 'ca_bundle'].filter((k) => !health[k]);
    return missing.length ? ['BŁĄD', `brak: ${missing.join(', ')}`] : ['OK', 'curl, gd, zip, pdo_sqlite, zapis cache, certyfikaty'];
  });
  await check('Wgranie', 'Sprzątanie cache (cron)', async () => {
    const age = health?.cache_maintenance_age_s;
    if (age === undefined) return ['OSTRZEŻENIE', 'health.php sprzed 19.44.0'];
    if (age === null) return ['OSTRZEŻENIE', 'jeszcze nie działało — ustaw zadanie: php tools/maintain_cache.php (raz dziennie)'];
    return age <= 2 * 86400 ? ['OK', `${Math.round(age / 3600)} h temu`] : ['OSTRZEŻENIE', `${Math.round(age / 86400)} dni temu — sprawdź zadanie crona`];
  });

  // -------------------------------------------------------------- bezpieczeństwo
  await check('Bezpieczeństwo', 'Nagłówki ochronne', async () => {
    const r = await get('index.html');
    const h = r.headers; const html = r.text();
    const missing = [];
    if (!/script-src 'self'/.test(html)) missing.push('CSP w index.html');
    if (!/frame-ancestors/.test(h.get('content-security-policy') || '')) missing.push('Content-Security-Policy');
    if (!h.get('x-frame-options')) missing.push('X-Frame-Options');
    if ((h.get('x-content-type-options') || '') !== 'nosniff') missing.push('X-Content-Type-Options');
    if (!h.get('permissions-policy')) missing.push('Permissions-Policy');
    if (base.startsWith('https:') && !h.get('strict-transport-security')) missing.push('Strict-Transport-Security');
    const powered = h.get('x-powered-by');
    if (missing.length) return ['BŁĄD', `brak: ${missing.join(', ')} — czy wgrano .htaccess (plik ukryty)?`];
    return powered ? ['OSTRZEŻENIE', `X-Powered-By: ${powered}`] : ['OK', 'CSP, X-Frame-Options, nosniff, Permissions-Policy' + (base.startsWith('https:') ? ', HSTS' : '')];
  });
  const blocked = ['README_WGRAJ_NA_SERWER.txt', 'ZMIANY_19.43.0.md', 'api/_common.php', 'api/certs/cacert.pem', 'data/rwdz/rwdz.sqlite',
    'data/shared/00/0000000000.json', 'data/msportal/msportal.sqlite3', 'setup-vendors.php', 'api/vendor_status.php', 'vendor/static/react.js', 'app-19.44.0/main.js', 'cron/rwdz_update.php', 'tools/check_release.py',
    'audyt/wyniki-serwera.json', 'konfiguracja/polityka-prywatnosci.szkic.html', 'cache/', '.htaccess', 'package.json', 'node_modules/', 'app-1.0.0/main.js'];
  await check('Bezpieczeństwo', 'Zablokowane pliki i katalogi', async () => {
    const open = [];
    for (const path of blocked) { const r = await get(path, { redirect: 'manual', method: 'HEAD' }); if (r.status === 200) open.push(path); }
    return open.length ? ['BŁĄD', `dostępne z sieci: ${open.join(', ')}`] : ['OK', `${blocked.length} ścieżek zablokowanych`];
  });
  await check('Bezpieczeństwo', 'Listowanie katalogów', async () => {
    const r = await get('assets/');
    return r.status === 200 && /Index of/i.test(r.text()) ? ['BŁĄD', 'assets/ pokazuje listę plików — dodaj Options -Indexes'] : ['OK', `HTTP ${r.status}`];
  });
  await check('Bezpieczeństwo', 'Pliki publiczne', async () => {
    const bad = [];
    for (const path of ['data/kowr/installations.json', 'konfiguracja/raport-pdf.przyklad.json', 'manifest.webmanifest', 'assets/js/boot.js']) {
      const r = await get(path, { method: 'HEAD' }); if (r.status !== 200) bad.push(`${path} (HTTP ${r.status})`);
    }
    return bad.length ? ['BŁĄD', `niedostępne: ${bad.join(', ')}`] : ['OK', 'KOWR, konfiguracja raportu, manifest, boot.js'];
  });

  // -------------------------------------------------------------- pamięć przeglądarki i tryb offline
  await check('Wydajność i offline', 'Długie przechowywanie paczek', async () => {
    const html = (await get('index.html')).text();
    const bundle = (html.match(/src="\.\/(assets\/build\/main-[\w-]+\.js)"/) || [])[1];
    const r = await get(bundle, { method: 'HEAD' });
    const cc = r.headers.get('cache-control') || '';
    const gz = await get(bundle, { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } });
    const enc = gz.headers.get('content-encoding') || 'brak';
    return /immutable/.test(cc) ? ['OK', `immutable, kompresja: ${enc}`] : ['OSTRZEŻENIE', `Cache-Control: ${cc || 'brak'} — bez mod_headers/mod_rewrite powtórne wejścia są wolniejsze`];
  });
  await check('Wydajność i offline', 'Service worker (sw.js)', async () => {
    const r = await get('sw.js');
    if (r.status !== 200) return ['BŁĄD', `HTTP ${r.status}`];
    if (!/javascript/.test(r.headers.get('content-type') || '')) return ['BŁĄD', `typ ${r.headers.get('content-type')}`];
    if (!/no-cache/.test(r.headers.get('cache-control') || '')) return ['OSTRZEŻENIE', 'sw.js bez no-cache — aktualizacja może się opóźnić'];
    if (!base.startsWith('https:')) return ['OSTRZEŻENIE', 'portal nie jest pod HTTPS — tryb offline nie zadziała'];
    return /self\.registration\.unregister/.test(r.text()) ? ['OSTRZEŻENIE', 'wgrany jest wyłącznik trybu offline (sw-wylacz.js)'] : ['OK', 'no-cache, HTTPS'];
  });

  // -------------------------------------------------------------- usługi zewnętrzne przez serwer
  await check('Usługi', 'Natura 2000 (GDOŚ)', async () => {
    const r = await get(`api/identify.php?source=natura2000&x=${NATURA.x}&y=${NATURA.y}`);
    const d = json(r);
    if (d?.ok) return d.found ? ['OK', `obszar znaleziony, ${r.ms} ms`] : ['OSTRZEŻENIE', 'odpowiedź bez obiektu w punkcie wzorcowym'];
    return ['OSTRZEŻENIE', `${d?.error || 'HTTP ' + r.status} — GDOŚ bywa niedostępny z niektórych serwerów (403 Incapsula)`];
  });
  await check('Usługi', 'MPZP (integracja GUGiK)', async () => {
    const r = await get('api/identify.php?source=mpzp&x=637371&y=486679');
    const d = json(r);
    return d?.ok ? ['OK', `${r.ms} ms`] : ['OSTRZEŻENIE', d?.error || `HTTP ${r.status}`];
  });
  await check('Usługi', 'Ceny RCN', async () => {
    const r = await get(`api/rcn.php?x=${PARCEL.x}&y=${PARCEL.y}&r=500&kind=grunty&years=3`);
    const d = json(r);
    return d?.ok ? ['OK', `${d.marketCount ?? d.count ?? '?'} transakcji, ${r.ms} ms`] : ['OSTRZEŻENIE', d?.error || `HTTP ${r.status}`];
  });
  await check('Usługi', 'Wysokości NMT', async () => {
    const r = await get('api/terrain.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ points: [[PARCEL.x, PARCEL.y]] }) });
    const d = json(r);
    const h = d?.heights?.[0];
    return d?.ok && Number.isFinite(h) && h > 0 ? ['OK', `${h.toFixed(1)} m n.p.m.`] : ['OSTRZEŻENIE', d?.error || `HTTP ${r.status}`];
  });
  await check('Usługi', 'Pozwolenia (baza RWDZ)', async () => {
    const d = json(await get('api/permits.php?status=1'));
    if (d?.ok) return ['OK', `dane z ${d.dataDate}, ${d.investments} wpisów`];
    return ['OSTRZEŻENIE', d?.error || 'brak odpowiedzi'];
  });
  await check('Usługi', 'Eksport ortofotomapy przez serwer', async () => {
    const body = JSON.stringify({ mode: 'single', bbox: [PARCEL.x - 150, PARCEL.y - 150, PARCEL.x + 150, PARCEL.y + 150], width: 512, height: 512, format: 'png', basemap: 'orthophoto_high', overlays: [], objects: [] });
    const r = await get('api/export.php', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, timeoutMs: 120000 });
    if (r.status !== 200) return ['OSTRZEŻENIE', `HTTP ${r.status} ${(json(r)?.error) || ''}`];
    // Jednolity (np. biały) obraz PNG 512×512 kompresuje się do kilku kB; zdjęcie lotnicze do setek kB.
    return r.buffer.length > 30000 ? ['OK', `${Math.round(r.buffer.length / 1024)} kB`] : ['OSTRZEŻENIE', `obraz ${Math.round(r.buffer.length / 1024)} kB — prawdopodobnie jednolity (biały); sprawdź ręcznie w Eksporcie`];
  });
}

// ---------------------------------------------------------------- przeglądarka: start i tryb offline
if (browser) {
  await check('Przeglądarka', 'Start aplikacji i tryb offline', async () => {
    let chromium;
    try { ({ chromium } = await import('playwright')); } catch { return ['OSTRZEŻENIE', 'brak Playwright (npm install)']; }
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext();
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(url('index.html'));
      await page.locator('#map-search-input').waitFor({ timeout: 60000 });
      if (errors.length) return ['BŁĄD', `błędy JS: ${errors[0]}`];
      if (!base.startsWith('https:')) return ['OSTRZEŻENIE', 'start OK; offline wymaga HTTPS'];
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await page.reload(); await page.locator('#map-search-input').waitFor({ timeout: 60000 });
      await ctx.setOffline(true);
      await page.reload();
      const ok = await page.locator('#map-search-input').isVisible({ timeout: 30000 }).catch(() => false);
      return ok ? ['OK', 'aplikacja otwiera się bez internetu'] : ['BŁĄD', 'bez internetu aplikacja się nie otwiera'];
    } finally { await b.close(); }
  });
}

// ---------------------------------------------------------------- wynik
const failed = results.filter((r) => r.state === 'BŁĄD').length;
const warned = results.filter((r) => r.state === 'OSTRZEŻENIE').length;
if (asJson) console.log(JSON.stringify({ base, checkedAt: new Date().toISOString(), failed, warned, results }, null, 1));
else {
  let group = '';
  for (const r of results) {
    if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
    const mark = r.state === 'OK' ? '✓' : r.state === 'BŁĄD' ? '✗' : '!';
    console.log(`  ${mark} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }
  console.log(`\n${results.length} kontroli: ${results.length - failed - warned} OK, ${warned} ostrzeżeń, ${failed} błędów — ${base}`);
}
process.exit(failed ? 1 : 0);
