#!/usr/bin/env node
/**
 * msportal 19.42.0 — budowanie paczki serwerowej: npm run build
 *
 * 1. Vite buduje frontend (index.html + assets/build/*) do build/www/.
 * 2. Skrypt dokłada pliki serwera, które wgrywa się przez FTP jak dotąd (api/, PHP, konfiguracja, dane,
 *    diagnostyka), i sprawdza wynik: CSP w index.html, istnienie plików z index.html, brak plików
 *    deweloperskich. build/www/ to dokładnie to, co trafia do katalogu portalu na serwerze.
 *
 * Źródła app-<wersja>/ i vendor/ nadal są wgrywane — korzysta z nich wyłącznie diagnostyka.html
 * (sprawdza treść modułów i importuje je bez budowania). Użytkownicy portalu dostają paczki z assets/build/.
 */
import { build } from 'vite';
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'www');
const version = readFileSync(join(ROOT, 'VERSION.txt'), 'utf8').trim();

// Pliki i katalogi z repozytorium, które idą na serwer (poza index.html, który powstaje w budowaniu).
const SERVER_ENTRIES = [
  '.htaccess', 'VERSION.txt', 'verify-deployment.php', 'setup-vendors.php', 'diagnostyka.html', 'monitor-zrodel.html',
  'api', 'assets', 'cache', 'cron', 'data', 'konfiguracja', 'monitor', 'tools', 'vendor', 'audyt', `app-${version}`,
];
const DOC_PATTERN = /^(ZMIANY.*\.md|RAPORT_AUDYTU.*\.md|README.*\.(txt|md))$/;
// Nigdy na serwer: środowisko programisty i stare jednorazowe aktualizatory.
const NEVER = [/^node_modules(\/|$)/, /^build(\/|$)/, /^dist(\/|$)/, /^tests(\/|$)/, /^\.github(\/|$)/, /^\.git(\/|$)/,
  /^package(-lock)?\.json$/, /^(vite|vitest|playwright)\.config\.js$/, /^tsconfig\.json$/, /^aktualizuj-.*\.php$/,
  /^cache\/.+(?<!\.htaccess)$/, /^data\/(rwdz|shared)\//, /^data\/msportal\/.*\.sqlite3?$/];

const fail = (message) => { console.error(`\nBŁĄD: ${message}`); process.exit(1); };

console.log(`msportal ${version} — budowanie frontendu (Vite)…`);
await build({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'warn' });

console.log('Dokładanie plików serwera…');
const copy = (rel) => {
  const src = join(ROOT, rel);
  if (!existsSync(src)) fail(`brak ${rel} w repozytorium`);
  cpSync(src, join(OUT, rel), {
    recursive: true,
    // Nie nadpisujemy wyniku Vite (assets/build/) i pomijamy pliki z listy NEVER.
    filter: (from) => {
      const r = relative(ROOT, from).split(sep).join('/');
      if (r === '') return true;
      if (r.startsWith('assets/build')) return false;
      // Katalogi przechodzimy zawsze (np. cache/bdot-query/ dla jego .htaccess), chyba że cały katalog jest wykluczony.
      if (statSync(from).isDirectory()) return !NEVER.some((rx) => rx.source.endsWith('(\\/|$)') && rx.test(r));
      return !NEVER.some((rx) => rx.test(r));
    },
  });
};
for (const entry of SERVER_ENTRIES) copy(entry);
for (const name of readdirSync(ROOT)) if (DOC_PATTERN.test(name)) copy(name);

// --- kontrole wyniku
const index = readFileSync(join(OUT, 'index.html'), 'utf8');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(index.replace(/<script type="importmap"[\s\S]*?<\/script>/, ''))) {
  // Vite nie dodaje skryptów wbudowanych; gdyby się pojawiły, CSP (script-src 'self') zablokuje start.
  fail('index.html po budowaniu zawiera skrypt wbudowany — zablokuje go CSP');
}
if (!index.includes("script-src 'self'")) fail('index.html po budowaniu nie ma polityki CSP');
if (!index.includes(`assets/js/boot.js?v=${version}`)) fail('index.html nie ładuje assets/js/boot.js z bieżącą wersją');
const refs = [...index.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)].map((m) => m[1]);
const missing = refs.filter((r) => !existsSync(join(OUT, r)));
if (missing.length) fail(`index.html wskazuje nieistniejące pliki: ${missing.join(', ')}`);
if (!refs.some((r) => /^assets\/build\/main-[\w-]+\.js$/.test(r))) fail('brak paczki assets/build/main-*.js');

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(OUT).map((p) => relative(OUT, p).split(sep).join('/'));
const leaked = files.filter((f) => NEVER.some((rx) => rx.test(f)));
if (leaked.length) fail(`do paczki trafiły pliki deweloperskie: ${leaked.slice(0, 10).join(', ')}`);

// Spójność wersji tymi samymi regułami co verify-deployment.php (PHP z wiersza poleceń, jeśli jest).
try {
  const out = execFileSync('php', [join(OUT, 'verify-deployment.php')], { encoding: 'utf8' });
  const report = JSON.parse(out);
  if (!report.deployment_consistent) fail(`verify-deployment.php: ${out}`);
  console.log('verify-deployment.php: deployment_consistent = true');
} catch (error) {
  if (error.code === 'ENOENT') console.log('(brak PHP — pominięto verify-deployment.php)');
  else fail(`verify-deployment.php: ${error.message}`);
}

const bundle = files.filter((f) => f.startsWith('assets/build/'));
const size = (list) => list.reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0);
writeFileSync(join(OUT, 'assets', 'build', 'BUILD.txt'),
  `msportal ${version}\nzbudowano: ${new Date().toISOString()}\nplików paczki: ${bundle.length}\n`);
console.log(`Gotowe: build/www/ — ${files.length} plików, paczka aplikacji ${bundle.length} plików (${(size(bundle) / 1048576).toFixed(2)} MB).`);
