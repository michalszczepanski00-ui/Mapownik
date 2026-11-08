const OPENLAYERS_URL = new URL('../static/openlayers.js?v=10.10.0', import.meta.url).href;

async function loadOpenLayersGlobal() {
  if (globalThis.ol?.Map) return globalThis.ol;

  if (typeof document === 'undefined') {
    throw new Error('OpenLayers full build nie został załadowany i brak DOM do jego uruchomienia.');
  }

  const promiseKey = '__MAPOWNIK_OPENLAYERS_LOAD_PROMISE__';
  if (!globalThis[promiseKey]) {
    globalThis[promiseKey] = new Promise((resolve, reject) => {
      const absoluteBase = OPENLAYERS_URL.split('?')[0];
      const existing = Array.from(document.scripts || []).find((script) => {
        try { return new URL(script.src, document.baseURI).href.split('?')[0] === absoluteBase; }
        catch { return false; }
      });

      const script = existing || document.createElement('script');
      let settled = false;
      const cleanup = () => {
        script.removeEventListener?.('load', onLoad);
        script.removeEventListener?.('error', onError);
      };
      const onLoad = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (globalThis.ol?.Map) resolve(globalThis.ol);
        else reject(new Error('Lokalny OpenLayers został pobrany, ale nie udostępnił globalThis.ol.Map.'));
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Nie udało się załadować lokalnego OpenLayers: ' + OPENLAYERS_URL));
      };

      script.addEventListener?.('load', onLoad, { once: true });
      script.addEventListener?.('error', onError, { once: true });
      // Fallback for very small test DOM shims without addEventListener.
      if (!script.addEventListener) {
        script.onload = onLoad;
        script.onerror = onError;
      }

      if (!existing) {
        script.src = OPENLAYERS_URL;
        script.async = false;
        document.head.appendChild(script);
      } else if (globalThis.ol?.Map) {
        onLoad();
      }
    }).catch((error) => {
      delete globalThis[promiseKey];
      throw error;
    });
  }

  const ol = await globalThis[promiseKey];
  if (!ol?.Map) throw new Error('OpenLayers full build jest niedostępny po próbie inicjalizacji.');
  return ol;
}

const ol = await loadOpenLayersGlobal();
export { ol };
