import { t } from '../../i18n/index.js';
/**
 * Pliki po stronie przeglądarki: pobranie tekstu jako pliku i odczyt pliku
 * wskazanego przez użytkownika. Wspólne dla eksportu (features/builtin/
 * exportFeature.js) i kopii bezpieczeństwa przed wczytaniem linku (App.js).
 * 18.1: przeniesione z app/utils, żeby deklaracje funkcji nie sięgały do powłoki.
 */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export function downloadText(text, filename, mimeType) {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readTextFile(file, maxBytes = MAX_IMPORT_BYTES) {
    if (!file) throw new Error(t('core.nieWybranoPliku'));
    if (file.size > maxBytes) throw new Error(t('core.plikPrzekraczaLimitMb', { value: Math.round(maxBytes / 1024 / 1024) }));
    return file.text();
}
