// msportal 19.42.0 — scenariusze w przeglądarce na zbudowanej paczce.
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

test('wszystkie podkłady przełączają się', async ({ page }) => {
  test.slow();
  await page.goto('/index.html');
  await expect(page.locator('#map-search-input')).toBeVisible({ timeout: 60_000 });
  await page.locator('button[aria-label="Pokaż wszystkie podkłady"]').click();
  const options = page.locator('button.basemap-option');
  const count = await options.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < count; i += 1) {
    await options.nth(i).click();
    await expect(options.nth(i)).toHaveClass(/is-active/, { timeout: 30_000 });
  }
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
