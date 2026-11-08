Mapownik 17.8.11+ — zoptymalizowane moduły ładowane przez importmap w index.html.
(17.8.12: podzbiór ikon przebudowany — 63 ikony, doszły ikony doku i miniatur.)

lucide-subset.js  — tylko ikony używane przez aplikację (lucide-react 1.47.0,
                    ok. 20 KB zamiast 1,3 MB). Każda z ikon renderuje się
                    identycznie jak w pełnym pakiecie.
zod.min.js        — ten sam zod 4.6.5 co vendor/static/zod.js, zminifikowany.
proj4.min.js      — ten sam proj4 2.22.0 co vendor/static/proj4.js, zminifikowany.

Pliki w vendor/static zostają bez zmian (sprawdza je vendor_status.php
i setup-vendors.php). Po dodaniu nowej ikony w kodzie aplikacji dopisz ją
do lucide-subset.js (node tools/build_lucide_subset.mjs) —
tests/package-check.py zgłasza brakującą ikonę.

19.30.0 — biblioteki podkładów wektorowych i modelu wysokości (ładowane dopiero po wybraniu podkładu/warstwy):
- ol-mapbox-style.js — ol-mapbox-style 13.5.1 (BSD-2-Clause, github.com/openlayers/ol-mapbox-style) wraz z
  @maplibre/maplibre-gl-style-spec (ISC) i mapbox-to-css-font (BSD-2-Clause); jeden plik ES (esbuild),
  moduły „ol/…” z vendor/ol-esm-2.
- maplibre-contour.js — maplibre-contour 0.1.0 (BSD-3-Clause, github.com/onthegomap/maplibre-contour),
  używany tylko LocalDemManager (warstwice z modelu wysokości), bez MapLibre.

19.41.0 — widok „Teren 3D” (ładowany dopiero po otwarciu okna 3D, bez preload):
- three.module.min.js — three.js 0.170.0 (MIT, licencja w three-LICENSE.txt), build/three.module.min.js bez zmian.
- three-orbit-controls.js — examples/jsm/controls/OrbitControls.js z three.js 0.170.0 bez zmian
  (import z „three” rozwiązuje importmap w index.html).
