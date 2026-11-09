import { normalizePreset, presetToFile } from './reportConfig.js';

/**
 * 19.36.0 — ustawienia raportu PDF zapamiętane w tej przeglądarce:
 * własne szablony, nagłówek (nazwa biura, kontakt, logo) i ostatni wybór w oknie.
 * Szablony można wyeksportować do pliku JSON (ten sam format co konfiguracja/raport-pdf.json)
 * i zaimportować w innej przeglądarce albo przenieść na serwer dla wszystkich.
 */
const KEY = 'msportal:pdf-report:v1';
const MAX_LOGO_CHARS = 400000; // ok. 300 KB obrazu w data URL

function read() {
    try { const value = JSON.parse(window.localStorage.getItem(KEY) || 'null'); return value && typeof value === 'object' ? value : {}; }
    catch { return {}; }
}
function write(value) {
    try { window.localStorage.setItem(KEY, JSON.stringify(value)); return true; }
    catch { return false; }
}

export function loadReportPrefs() {
    const raw = read();
    const userPresets = (Array.isArray(raw.userPresets) ? raw.userPresets : []).map((p) => normalizePreset(p)).filter(Boolean).map((p) => ({ ...p, source: 'user' }));
    const header = raw.header && typeof raw.header === 'object' ? {
        name: String(raw.header.name ?? '').slice(0, 80),
        contact: String(raw.header.contact ?? '').slice(0, 160),
        logo: typeof raw.header.logo === 'string' && raw.header.logo.startsWith('data:image/') && raw.header.logo.length <= MAX_LOGO_CHARS ? raw.header.logo : '',
    } : null;
    return { userPresets, header, last: raw.last && typeof raw.last === 'object' ? raw.last : null };
}

export function saveReportPrefs(patch) {
    const current = read();
    const next = { ...current, ...patch };
    if (patch.userPresets) next.userPresets = patch.userPresets.map(presetToFile);
    return write(next);
}

export function exportPresetsFile(presets) {
    const body = JSON.stringify({ szablony: presets.map(presetToFile) }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `mapownik-szablony-raportu-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Szablony z pliku JSON (eksport z okna albo konfiguracja serwera). */
export async function importPresetsFile(file) {
    if (!file || file.size > 300000) throw new Error('Plik jest za duży albo pusty.');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('To nie jest plik JSON z szablonami raportu.'); }
    const list = Array.isArray(parsed) ? parsed : (parsed?.szablony ?? parsed?.presets);
    const presets = (Array.isArray(list) ? list : []).map((p) => normalizePreset(p)).filter(Boolean);
    if (!presets.length) throw new Error('Plik nie zawiera szablonów raportu.');
    return presets.map((p) => ({ ...p, source: 'user' }));
}

/** Logo do nagłówka: obraz zmniejszony do 600 px szerokości, zapisany jako data URL (PNG albo JPEG). */
export async function readLogoFile(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Wybierz obraz PNG, JPG albo WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Obraz jest za duży (maks. 5 MB).');
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Nie udało się odczytać obrazu.')); img.src = url; });
        const scale = Math.min(1, 600 / image.naturalWidth, 200 / image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/png');
        if (data.length > MAX_LOGO_CHARS) return canvas.toDataURL('image/jpeg', 0.85);
        return data;
    } finally { URL.revokeObjectURL(url); }
}
