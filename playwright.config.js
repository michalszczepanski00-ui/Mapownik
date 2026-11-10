// msportal 19.45.0 — testy E2E (npm run test:e2e) na ZBUDOWANEJ paczce build/www/ (najpierw npm run build).
// Serwer: wbudowany serwer PHP (bez .htaccess — reguły Apache sprawdza diagnostyka i verify-deployment.php).
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 8095);
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0, // podkłady zależą od usług zewnętrznych (GUGiK, OSM)
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 1440, height: 900 }, trace: 'off' },
  webServer: {
    command: `php -S 127.0.0.1:${PORT} -t build/www`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
