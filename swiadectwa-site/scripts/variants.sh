#!/usr/bin/env bash
# Buduje warianty kolorystyczne do dist-<motyw>/ (podglądy bez indeksowania).
set -e
for t in pasibus spokojny avada; do
  PUBLIC_THEME=$t PUBLIC_PREVIEW=1 npx astro build --outDir dist-$t >/dev/null
  node scripts/typo.mjs dist-$t
  printf 'User-agent: *\nDisallow: /\n' > dist-$t/robots.txt
done
