#!/usr/bin/env node
/**
 * msportal 19.49.0 — budowanie paczki serwerowej: npm run build
 *
 * 1. Vite buduje frontend (index.html + assets/build/*) do build/www/.
 * 2. Skrypt dokłada pliki serwera, które wgrywa się przez FTP jak dotąd (api/, PHP, konfiguracja, dane,
 *    diagnostyka), i sprawdza wynik: CSP w index.html, istnienie plików z index.html, brak plików
 *    deweloperskich. build/www/ to dokładnie to, co trafia do katalogu portalu na serwerze.
 *
 * 19.45.0: diagnostyka.html jest drugim wejściem Vite — na serwer nie trafiają już źródła app-<wersja>/,
 * arkusze assets/css/ ani dawne biblioteki vendor/ (zostaje vendor/pdf, wczytywany przez raport PDF).
 */
import { build } from 'vite';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'www');
const version = readFileSync(join(ROOT, 'VERSION.txt'), 'utf8').trim();

// Pliki i katalogi z repozytorium, które idą na serwer (poza index.html, który powstaje w budowaniu).
const SERVER_ENTRIES = [
  '.htaccess', 'manifest.webmanifest', 'VERSION.txt', 'verify-deployment.php', 'monitor-zrodel.html',
  'api', 'assets', 'cache', 'cron', 'data', 'konfiguracja', 'monitor', 'tools', 'vendor', 'audyt',
];
const DOC_PATTERN = /^(ZMIANY.*\.md|RAPORT_AUDYTU.*\.md|README.*\.(txt|md))$/;
// Nigdy na serwer: środowisko programisty i stare jednorazowe aktualizatory.
const NEVER = [/^node_modules(\/|$)/, /^build(\/|$)/, /^dist(\/|$)/, /^tests(\/|$)/, /^\.github(\/|$)/, /^\.git(\/|$)/,
  /^package(-lock)?\.json$/, /^(vite|vitest|playwright)\.config\.js$/, /^tsconfig\.json$/, /^aktualizuj-.*\.php$/,
  /^cache\/.+(?<!\.htaccess)$/, /^data\/(rwdz|shared)\//, /^data\/msportal\/.*\.sqlite3?$/,
  // 19.45.0: źródła wbudowane w paczkę Vite — na serwerze zbędne.
  /^app-[^/]+(\/|$)/, /^diag(\/|$)/, /^assets\/css\/(?!monitor\.css$)/, /^vendor\/geometry(\/|$)/, /^\.vite(\/|$)/];

const fail = (message) => { console.error(`\nBŁĄD: ${message}`); process.exit(1); };

console.log(`msportal ${version} — budowanie frontendu (Vite)…`);
await build({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'warn' });
// 19.46.0: diagnostyka osobno (assets/build/diag/) — nie wpływa na podział paczki portalu.
await build({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'warn', mode: 'diag' });

// 19.45.0: pliki potrzebne portalowi (wejście index.html z importami) — według manifestu Vite.
// Paczka diagnostyki (w tym teksty źródeł) nie trafia do pamięci trybu offline.
const appBundle = (() => {
  const manifestFile = join(OUT, '.vite', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  rmSync(join(OUT, '.vite'), { recursive: true, force: true });
  const out = new Set();
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    const chunk = manifest[key];
    out.add(chunk.file);
    for (const f of [...(chunk.css || []), ...(chunk.assets || [])]) out.add(f);
    for (const k of [...(chunk.imports || []), ...(chunk.dynamicImports || [])]) visit(k);
  };
  visit('index.html');
  if (!out.size) fail('manifest Vite nie zawiera wejścia index.html');
  // 19.46.0: pliki pobierane przy starcie (tylko importy statyczne od index.html) — do kontroli wydajności.
  const startup = new Set(); const seenStart = new Set();
  const visitStart = (key) => {
    if (seenStart.has(key) || !manifest[key]) return;
    seenStart.add(key);
    startup.add(manifest[key].file);
    for (const f of manifest[key].css || []) startup.add(f);
    for (const k of manifest[key].imports || []) visitStart(k);
  };
  visitStart('index.html');
  globalThis.__startupFiles = [...startup];
  return [...out].sort();
})();

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

// 19.43.0: manifest aplikacji (instalacja na telefonie) — dopisany po budowaniu, żeby Vite go nie przenosił
// do assets/build/ (ścieżki ikon w manifeście są względne do katalogu portalu).
{
  const file = join(OUT, 'index.html');
  const html = readFileSync(file, 'utf8');
  if (!html.includes('rel="manifest"')) {
    writeFileSync(file, html.replace('</head>', '  <link rel="manifest" href="./manifest.webmanifest" />\n  <link rel="apple-touch-icon" href="./assets/icons/icon-192.png" />\n</head>'));
  }
}

// --- kontrole wyniku
const index = readFileSync(join(OUT, 'index.html'), 'utf8');
const diagHtml = readFileSync(join(OUT, 'diagnostyka.html'), 'utf8');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(diagHtml)) fail('diagnostyka.html po budowaniu zawiera skrypt wbudowany');
if (/importmap|vendor\/static|app-\d/.test(diagHtml)) fail('diagnostyka.html po budowaniu odwołuje się do dawnych bibliotek lub źródeł');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(index.replace(/<script type="importmap"[\s\S]*?<\/script>/, ''))) {
  // Vite nie dodaje skryptów wbudowanych; gdyby się pojawiły, CSP (script-src 'self') zablokuje start.
  fail('index.html po budowaniu zawiera skrypt wbudowany — zablokuje go CSP');
}
if (!index.includes("script-src 'self'")) fail('index.html po budowaniu nie ma polityki CSP');
if (!index.includes(`assets/js/boot.js?v=${version}`)) fail('index.html nie ładuje assets/js/boot.js z bieżącą wersją');
const refs = [...(index + diagHtml).matchAll(/(?:src|href)="\.\/([^"?#]+)/g)].map((m) => m[1]).filter((r) => r !== '');
const missing = refs.filter((r) => !existsSync(join(OUT, r)));
if (missing.length) fail(`index.html wskazuje nieistniejące pliki: ${missing.join(', ')}`);
if (!refs.some((r) => /^assets\/build\/main-[\w-]+\.js$/.test(r))) fail('brak paczki assets/build/main-*.js');
// Strony bez budowania (monitor źródeł) — ich lokalne pliki też muszą być w paczce.
for (const page of ['monitor-zrodel.html']) {
  const html = readFileSync(join(OUT, page), 'utf8');
  const lost = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)].map((m) => m[1]).filter((r) => r && !existsSync(join(OUT, r)));
  if (lost.length) fail(`${page} wskazuje nieistniejące pliki: ${lost.join(', ')}`);
}

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


// 19.43.0: service worker (tryb offline) z listą plików do zapamiętania; wersja = wydanie + suma index.html.
{
  const { createHash } = await import('node:crypto');
  const precache = ['./', './index.html', `./assets/js/boot.js?v=${version}`, './manifest.webmanifest',
    './assets/icons/icon-192.png', './assets/icons/icon-512.png', ...appBundle.map((f) => './' + f)];
  const swVersion = `${version}-${createHash('sha256').update(index).digest('hex').slice(0, 10)}`;
  const template = readFileSync(join(ROOT, 'tools', 'sw.template.js'), 'utf8');
  writeFileSync(join(OUT, 'sw.js'), template.replace("'__VERSION__'", JSON.stringify(swVersion)).replace('__PRECACHE__', JSON.stringify(precache, null, 1)));
  for (const f of precache.slice(4)) if (!existsSync(join(OUT, f.replace(/^\.\//, '').replace(/\?.*$/, '')))) fail(`sw.js: brak pliku ${f}`);
  console.log(`sw.js: tryb offline, ${precache.length} plików (${swVersion})`);
}
const size = (list) => list.reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0);
{
  const start = globalThis.__startupFiles ?? [];
  const js = start.filter((f) => f.endsWith('.js'));
  const startBytes = size(start); const jsBytes = size(js);
  console.log(`Start aplikacji: ${start.length} plików (${js.length} JS), ${(startBytes / 1024).toFixed(0)} KB, w tym JS ${(jsBytes / 1024).toFixed(0)} KB (przed kompresją).`);
  if (process.env.STARTUP_LIST) for (const f of start.sort((a, b) => statSync(join(OUT, b)).size - statSync(join(OUT, a)).size)) console.log(`  ${(statSync(join(OUT, f)).size / 1024).toFixed(0).padStart(5)} KB  ${f}`);
}
writeFileSync(join(OUT, 'assets', 'build', 'BUILD.txt'),
  `msportal ${version}\nzbudowano: ${new Date().toISOString()}\nplików paczki: ${bundle.length}\n`);
console.log(`Gotowe: build/www/ — ${files.length - 1} plików, paczka aplikacji ${appBundle.length} plików (${(size(appBundle) / 1048576).toFixed(2)} MB), diagnostyka ${bundle.length - appBundle.length} plików.`);
