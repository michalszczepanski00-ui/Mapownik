// msportal 19.42.0 — budowanie frontendu (npm run build → tools/build.mjs → build/www/).
//
// Wynik to zwykłe pliki statyczne: index.html i assets/build/*.js|css z sumą treści w nazwie.
// Wgrywa się je przez FTP jak dotąd; na serwerze nie jest potrzebny Node.js. Backend PHP (api/) bez zmian.
// base './' — portal działa także w podkatalogu (np. /test22/).
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
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
    assetsDir: 'assets/build',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: fileURLToPath(new URL('./index.html', import.meta.url)) },
      output: {
        // Ikony w jednym pliku zamiast kilkunastu drobnych (każda użyta ikona to osobny moduł lucide-react).
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
});
