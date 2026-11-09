#!/usr/bin/env node
/**
 * 19.43.0 — wykrywanie nieużywanych reguł CSS (assets/css/*.css).
 *
 *   node tools/css_unused.mjs            # raport: ile reguł i bajtów można usunąć
 *   node tools/css_unused.mjs --apply    # usuwa reguły, w których KAŻDY selektor odwołuje się do nieużywanej klasy
 *
 * Klasa jest „używana”, jeśli jej nazwa występuje w kodzie aplikacji (app-<wersja>/**.js), index.html,
 * diagnostyka.html, assets/js/*.js albo w bibliotekach (OpenLayers .ol-*, Radix, Three) — jako całe słowo.
 * Nazwy składane dynamicznie (`parcelplus-row--${status}`, 'is-' + stan) są chronione: każda klasa zaczynająca
 * się od rozpoznanego przedrostka dynamicznego jest traktowana jako używana. Ostrożnie: reguła zostaje,
 * jeśli choć jeden jej selektor może być używany. Reguły bez klas (elementy, :root, @font-face) zostają zawsze.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const appDir = readdirSync(ROOT).find((n) => /^app-\d+\.\d+\.\d+$/.test(n));
const sources = [
  ...walk(join(ROOT, appDir)).filter((f) => f.endsWith('.js')),
  join(ROOT, 'index.html'), join(ROOT, 'diagnostyka.html'), join(ROOT, 'monitor-zrodel.html'),
  ...walk(join(ROOT, 'assets', 'js')), ...walk(join(ROOT, 'monitor')).filter((f) => f.endsWith('.js')),
].map((f) => readFileSync(f, 'utf8')).join('\n');

const words = new Set(sources.match(/[A-Za-z_][\w-]*/g));
// Przedrostki dynamiczne: `abc-${…}`, 'abc-' + …, "abc--" + …
const prefixes = new Set();
for (const m of sources.matchAll(/([a-z][\w-]*[-_])\$\{/gi)) prefixes.add(m[1]);
for (const m of sources.matchAll(/['"]([a-z][\w-]*[-_])['"]\s*\+/gi)) prefixes.add(m[1]);
// Klasy nadawane przez biblioteki i przeglądarkę.
const libraryPrefixes = ['ol-', 'ol_', 'radix', 'lucide', 'three'];
const isUsed = (cls) => words.has(cls) || [...prefixes].some((p) => cls.startsWith(p)) || libraryPrefixes.some((p) => cls.startsWith(p));

const selectorUsed = (selector) => {
  let used = true;
  selectorParser((root) => { root.walkClasses((node) => { if (!isUsed(node.value)) used = false; }); }).processSync(selector);
  return used;
};

let removedRules = 0, removedBytes = 0, total = 0;
const report = [];
for (const file of readdirSync(join(ROOT, 'assets', 'css')).filter((f) => f.endsWith('.css')).sort()) {
  const path = join(ROOT, 'assets', 'css', file);
  const css = readFileSync(path, 'utf8');
  const root = postcss.parse(css, { from: path });
  let fileRemoved = 0;
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    total += 1;
    let selectors;
    try { selectors = rule.selectors; } catch { return; }
    if (!selectors.some((s) => s.includes('.'))) return;
    if (selectors.every((s) => !selectorUsed(s))) {
      removedRules += 1; fileRemoved += 1; removedBytes += rule.toString().length;
      report.push(`${file}: ${rule.selector.replace(/\s+/g, ' ').slice(0, 110)}`);
      if (apply) rule.remove();
    }
  });
  if (apply && fileRemoved) {
    // Puste bloki @media/@supports/@layer po usunięciu reguł też znikają.
    root.walkAtRules((at) => { if (['media', 'supports', 'layer', 'container'].includes(at.name) && at.nodes && at.nodes.length === 0) at.remove(); });
    writeFileSync(path, root.toResult().css);
  }
}
console.log(report.join('\n'));
console.log(`\n${apply ? 'Usunięto' : 'Do usunięcia'}: ${removedRules} z ${total} reguł (${(removedBytes / 1024).toFixed(1)} kB). Przedrostki dynamiczne: ${prefixes.size}.`);
