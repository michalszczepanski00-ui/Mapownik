// msportal 19.44.0 — scenariusze w przeglądarce na zbudowanej paczce.
import { test, expect } from '@playwright/test';

/** Zbiera błędy konsoli, wyjątki i naruszenia CSP strony. */
async function watch(page) {
  const problems = [];
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(String(e)));
  return problems;
}

test('start aplikacji: bez błędów, bez naruszeń CSP, z wersją wydania', async ({ page }) => {
  const problems = await watch(page);
  await page.goto('/index.html');
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.ol-viewport')).toBeVisible();
  const version = await page.evaluate(() => window.__MAPOWNIK_DEPLOY_VERSION__);
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(problems).toEqual([]);
});

test('link „Przejdź do wyszukiwarki” ustawia fokus w polu wyszukiwania', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('#map-search-input')).toBeFocused();
});

test('podkłady: każdy kończy ładowanie, większość działa', async ({ page }) => {
  // Podkłady pochodzą z usług zewnętrznych (GUGiK, OSM, OpenFreeMap). Gdy usługa nie odpowiada, portal ma
  // wrócić do poprzedniego podkładu z komunikatem — test sprawdza to zachowanie, a nie dostępność usług.
  test.slow();
  await page.goto('/index.html');
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await page.locator('button[aria-label="Pokaż wszystkie podkłady"]').click();
  const options = page.locator('button.basemap-option');
  const count = await options.count();
  expect(count).toBeGreaterThanOrEqual(5);
  const results = [];
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    await option.click();
    // nie może zawisnąć w „Ładowanie…”
    await expect(option).not.toHaveClass(/is-pending/, { timeout: 60_000 });
    const active = /is-active/.test((await option.getAttribute('class')) || '');
    results.push(`${await option.getAttribute('aria-label')}: ${active ? 'działa' : 'usługa nie odpowiada — powrót do poprzedniego'}`);
  }
  console.log(results.join('\n'));
  expect(results.filter((r) => r.endsWith('działa')).length).toBeGreaterThanOrEqual(count - 2);
});

test('projekt z linku udostępniania otwiera się po potwierdzeniu', async ({ page, request }) => {
  const now = new Date().toISOString();
  const style = { strokeColor: '#1d4ed8', strokeWidth: 2, strokeOpacity: 1, strokePattern: 'solid', fillColor: '#1d4ed8', fillOpacity: 0.18, pointRadius: 6 };
  const project = {
    format: 'mapownik-project', formatVersion: 1, app: { name: 'msportal', version: 'e2e' }, exportedAt: now, crs: 'EPSG:2180',
    project: { name: 'Projekt E2E', schemaVersion: 2, createdAt: now, updatedAt: now }, state: null,
    objects: [{ id: 'e2e-1', name: 'Kwadrat', visible: true, origin: 'user', kind: 'geometry', properties: {}, style, order: 0, createdAt: now, updatedAt: now,
      geometry: { type: 'Polygon', coordinates: [[[471000, 698000], [471100, 698000], [471100, 698100], [471000, 698100], [471000, 698000]]] } }],
  };
  const created = await request.post('/api/shared_project.php', { data: project });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();
  await page.goto(`/index.html?p=${id}`);
  await expect(page.getByText('Otworzyć udostępniony projekt?')).toBeVisible({ timeout: 60_000 });
  // Przed zastąpieniem projektu aplikacja pobiera kopię bezpieczeństwa bieżącego projektu.
  const backup = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Otwórz', exact: true }).click();
  expect((await backup).suggestedFilename()).toMatch(/kopia-przed-importem\.mapownik$/);
  // Projekt z linku ma jeden obiekt (licznik przy przyciąganiu pokazuje liczbę obiektów projektu).
  await expect(page.getByRole('button', { name: /obiekty: 1\)/ })).toBeVisible({ timeout: 30_000 });
});

test('brak pliku paczki (niepełne wgranie) → komunikat zamiast pustego ekranu', async ({ page }) => {
  await page.route(/assets\/build\/main-[\w-]+\.js$/, (route) => route.fulfill({ status: 404, body: 'nie ma' }));
  await page.goto('/index.html');
  await expect(page.getByText('Niepełna aktualizacja na serwerze')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/assets\/build\//).first()).toBeVisible();
});

test('wyszukiwanie po współrzędnych (WGS84, PUWG 1992, link Google Maps)', async ({ page }) => {
  await page.goto('/index.html');
  const input = page.locator('#map-search-input');
  await expect(input).toBeVisible({ timeout: 60_000 });
  for (const [query, expected] of [
    ['54.1496, 18.5654', /54,14960° N, 18,56540° E/],
    ['https://www.google.com/maps/@54.1496,18.5654,17z', /Link Google Maps/],
    ['698030 471720', /PUWG 1992: X 698030,00 m, Y 471720,00 m/],
  ]) {
    await input.fill(query);
    await expect(page.getByRole('option').first()).toContainText(expected, { timeout: 10_000 });
  }
  await input.fill('54.1496, 18.5654');
  await page.getByRole('option').first().click();
  // Wybór przenosi mapę i otwiera kartę miejsca (sprawdzanie działki w punkcie).
  await expect(page.getByRole('complementary', { name: 'Działka i narzędzia' })).toBeVisible({ timeout: 30_000 });
});

test('tryb offline: aplikacja otwiera się bez internetu', async ({ page, context }) => {
  await page.goto('/index.html');
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // strona pod kontrolą service workera, pliki zapamiętane
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#msportal-offline')).toContainText('Brak połączenia');
  await context.setOffline(false);
  await expect(page.locator('#msportal-offline')).toHaveCount(0);
});

test('zgłaszanie błędów z przeglądarki: przyjmuje POST, odrzuca inne', async ({ request }) => {
  const ok = await request.post('/api/client_errors.php', { data: { type: 'error', message: 'test e2e', stack: '', source: 'x.js:1:1', path: '/', appVersion: 'e2e' } });
  expect(ok.status()).toBe(204);
  expect((await request.get('/api/client_errors.php')).status()).toBe(405);
  expect((await request.post('/api/client_errors.php', { data: { message: '' } })).status()).toBe(400);
  expect((await request.post('/api/client_errors.php', { data: { message: 'x'.repeat(9000) } })).status()).toBe(413);
});

test('pomoc: link do polityki prywatności tylko gdy jest opublikowana', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Jak zacząć — pomoc' }).click();
  await expect(page.getByRole('button', { name: 'Skróty klawiszowe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Polityka prywatności' })).toHaveCount(0); // paczka zawiera tylko szkic
  await page.keyboard.press('Escape');
  await page.route('**/konfiguracja/polityka-prywatnosci.html', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Polityka</title>' }));
  await page.reload();
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Jak zacząć — pomoc' }).click();
  await expect(page.getByRole('link', { name: 'Polityka prywatności' })).toHaveAttribute('href', './konfiguracja/polityka-prywatnosci.html');
});

test('„miejscowość + numer działki”: wynik pierwszego etapu bez czekania na przeszukanie gminy', async ({ page }) => {
  test.slow();
  await page.goto('/index.html');
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await page.fill('#map-search-input', 'Kórnik 1000');
  await expect(page.getByRole('option', { name: /dz\. 1000/ }).first()).toBeVisible({ timeout: 20_000 });
});

test('„Wysokości” w karcie działki liczy od razu, pasek stylu nie zasłania mapy', async ({ page }) => {
  test.slow();
  await page.goto('/index.html');
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await page.fill('#map-search-input', '220408_2.0006.210/2');
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Wysokości', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByText('deniwelacja').first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.object-style-bar')).toHaveCount(0);
});
