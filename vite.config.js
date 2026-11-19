// msportal 19.54.0 — budowanie frontendu (npm run build → tools/build.mjs → build/www/).
//
// Wynik to zwykłe pliki statyczne: index.html i assets/build/*.js|css z sumą treści w nazwie.
// Wgrywa się je przez FTP jak dotąd; na serwerze nie jest potrzebny Node.js. Backend PHP (api/) bez zmian.
// base './' — portal działa także w podkatalogu (np. /test22/).
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 19.46.0: diagnostyka budowana OSOBNO (tryb „diag”, tools/build.mjs) — wspólne budowanie z portalem dzieliło kod
// portalu na ponad 140 drobnych plików ładowanych przy starcie (moduły wspólne dla obu wejść).
export default defineConfig(({ mode }) => ({
  base: './',
  publicDir: false,
  resolve: {
    alias: {
      // Dawny vendor/opt/three-orbit-controls.js to OrbitControls z tej samej wersji three.
      'three-orbit-controls': fileURLToPath(new URL('./node_modules/three/examples/jsm/controls/OrbitControls.js', import.meta.url)),
    },
  },
  build: {
    outDir: 'build/www',
    assetsDir: mode === 'diag' ? 'assets/build/diag' : 'assets/build',
    emptyOutDir: mode !== 'diag',
    target: 'es2022',
    sourcemap: false,
    // Lista plików każdego wejścia — tools/build.mjs zapamiętuje do trybu offline tylko pliki portalu (bez diagnostyki).
    manifest: mode !== 'diag',
    // Największy plik to teksty źródeł dla diagnostyki (diag/zrodla.js, ok. 2,3 MB) — wczytuje go tylko diagnostyka.html.
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      // 19.45.0: diagnostyka z tych samych pakietów npm co portal (wcześniej importmapa + vendor/ i źródła app-*/).
      input: mode === 'diag'
        ? { diagnostyka: fileURLToPath(new URL('./diagnostyka.html', import.meta.url)) }
        : { main: fileURLToPath(new URL('./index.html', import.meta.url)) },
      output: {
        // Ikony w jednym pliku zamiast kilkunastu drobnych (każda użyta ikona to osobny moduł lucide-react).
        // 19.46.0: do pliku trafiają tylko ikony importowane imiennie (aplikacja: ok. 60, diagnostyka: diag/ikony.js) —
        // nikt nie może importować całego pakietu ('lucide-react' jako przestrzeń nazw), bo wtedy plik ma ~630 KB.
        manualChunks(id) {
          if (id.includes('/node_modules/lucide-react/')) return 'icons';
          // zod razem z core/zodConfig.js: konfiguracja (jitless, CSP) wykonuje się w tym samym pliku co biblioteka,
          // więc zawsze przed pierwszym schematem — niezależnie od tego, który plik paczki użyje zod najpierw.
          if (id.includes('/node_modules/zod/') || id.endsWith('/core/zodConfig.js')) return 'zod';
          return undefined;
        },
      },
      onwarn(warning, warn) {
        // Radix oznacza moduły dyrektywą "use client" (dla React Server Components) — bez znaczenia tutaj.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
  worker: { format: 'es' },
  server: {
    // npm run dev: frontend z Vite, API z lokalnego PHP (php -S 127.0.0.1:8000 w katalogu portalu).
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/konfiguracja': 'http://127.0.0.1:8000',
      '/data/kowr': 'http://127.0.0.1:8000',
      '/vendor/pdf': 'http://127.0.0.1:8000',
    },
  },
}));
