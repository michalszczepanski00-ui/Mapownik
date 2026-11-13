// Typografia polska po zbudowaniu: twarda spacja po jednoliterowych spójnikach i przyimkach (a, i, o, u, w, z).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith('.html')) yield p;
  }
}
const fix = (text) => text.replace(/(^|[\s(>„"])([aiouwzAIOUWZ])[ \t]+(?=[^\s<])/g, '$1$2 ');
let n = 0;
for await (const file of walk(process.argv[2] || 'dist')) {
  const html = await readFile(file, 'utf8');
  // przetwarzamy tylko tekst poza tagami, <script> i <style>
  const out = html.replace(/(<(script|style|textarea)\b[\s\S]*?<\/\2>)|(<[^>]*>)|([^<]+)/g, (m, skip, _t, tag, text) => (text ? fix(text) : m));
  if (out !== html) { await writeFile(file, out); n++; }
}
console.log(`typo: ${n} plików`);
