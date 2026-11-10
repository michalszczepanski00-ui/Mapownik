// msportal 19.47.0 — testy jednostkowe (npm test). Moduły aplikacji importuje się aliasem „@app/…”,
// który wskazuje bieżący katalog app-<wersja>/ (zmienia się przy każdym podbiciu wersji).
import { defineConfig } from 'vitest/config';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const appDirs = readdirSync(root).filter((n) => /^app-\d+\.\d+\.\d+$/.test(n) && statSync(join(root, n)).isDirectory());
if (appDirs.length !== 1) throw new Error(`Oczekiwano jednego katalogu app-<wersja>, jest: ${appDirs.join(', ') || 'brak'}`);

export default defineConfig({
  resolve: { alias: { '@app': join(root, appDirs[0]) } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
