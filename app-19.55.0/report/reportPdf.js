import { requestScope } from '../core/requestScope.js';
import { RCN_MIN_MEDIAN_COUNT } from '../core/rcnDefaults.js';
import { collectReportData, terrainContext } from './reportData.js';
import { DISCLAIMER_LINE, INVEST_LABEL, LINKS, RULES_VERSION, decisionParameters, evaluateRules } from './reportRules.js';
import { renderReportMap } from './reportMaps.js';

/**
 * 19.36.0 — składanie raportu działki PDF (A4, jsPDF 4.2.1 z vendor/pdf, czcionka Inter z polskimi znakami).
 * 19.37.1 — nowy wygląd: barwny nagłówek, kafle z najważniejszymi danymi, mapa działki obok mapy położenia,
 * „W skrócie” jako karty ze statusem, tabele w pasy, krótkie komunikaty zamiast pustych kafli,
 * źródła razem z zastrzeżeniami (bez prawie pustej ostatniej strony).
 * Kolejność: dane (reportData.js) → mapy (reportMaps.js) → strony. Układ „płynący”: sekcja, która się nie mieści,
 * zaczyna się na nowej stronie.
 */
const PDF_LIB = './vendor/pdf/jspdf.umd.min.js';
const FONTS = [['Inter-Regular.ttf', './vendor/pdf/Inter_400Regular.ttf', 'normal'], ['Inter-Bold.ttf', './vendor/pdf/Inter_700Bold.ttf', 'bold']];
const PAGE_W = 210; const PAGE_H = 297; const M = 15; const CW = PAGE_W - 2 * M; const BOTTOM = PAGE_H - 16;
const PT = 25.4 / 72;
const INK = '#1c2621'; const MUTED = '#5b6660'; const LINE = '#dfe5df'; const SOFT = '#f3f6f3'; const ZEBRA = '#f7f9f7';
const TYPE_COLORS = { dom: ['Domy jednorodzinne', '#2f7d4f'], wielorodzinny: ['Wielorodzinne', '#c2410c'], uslugi: ['Usługi i handel', '#7c3aed'], przemysl: ['Przemysł i magazyny', '#475569'], energia: ['Energia (PV, wiatr)', '#ca8a04'], infrastruktura: ['Drogi i sieci', '#0e7490'], rozbiorka: ['Rozbiórki', '#b91c1c'], inne: ['Inne', '#9ca3af'] };
const PRICE_COLORS = ['#2563eb', '#60a5fa', '#f59e0b', '#ea580c', '#9a3412'];
const KIND_LABEL = { grunty: 'grunty niezabudowane', domy: 'domy (zabudowane działki)', mieszkania: 'lokale mieszkalne' };
const BASEMAP_LABEL = { orto: 'Ortofotomapa GUGiK', standard: 'Mapa OpenStreetMap', karto: 'Mapa kartograficzna (OpenStreetMap, NMT)', topo: 'Mapa topograficzna GUGiK' };
const TONES = {
    ok: { label: 'OK', fg: '#1f6b3d', bg: '#e3f1e7' },
    info: { label: 'INFO', fg: '#1d5e7a', bg: '#e2eff5' },
    warn: { label: 'UWAGA', fg: '#9a4a06', bg: '#fbeedd' },
    muted: { label: 'BRAK', fg: '#55605a', bg: '#eceeec' },
};
// 19.40.0: rodzaj informacji przy każdym wniosku i parametrze karty decyzyjnej.
const KINDS = {
    fakt: { label: 'FAKT', fg: '#1d4f8a', bg: '#e1ecf8' },
    obliczenie: { label: 'OBLICZENIE', fg: '#2f5d4a', bg: '#e3efe8' },
    ryzyko: { label: 'RYZYKO', fg: '#9a3d06', bg: '#fbe6d4' },
    weryfikacja: { label: 'DO WERYFIKACJI', fg: '#5b3d8a', bg: '#ece5f6' },
};
const SEV_LABEL = { 1: 'Może wykluczyć lokalizację', 2: 'Wymaga procedury lub uzgodnienia', 3: 'Informacyjne' };
const distText = (m) => (m == null || !Number.isFinite(m) ? '—' : m >= 1000 ? `${nf1.format(m / 1000)} km` : `${nf.format(Math.max(1, Math.round(m)))} m`);
const shareText = (c) => (!c || c.error ? 'brak odpowiedzi' : !c.insideCount ? '0%' : c.share >= 0.995 ? '100%' : c.share < 0.01 ? '< 1%' : `${nf.format(c.share * 100)}%`);

let libPromise = null;
let fontCache = null;
function loadLibrary() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    libPromise ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PDF_LIB; script.async = true;
        script.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('Biblioteka PDF nie załadowała się poprawnie.')));
        script.onerror = () => { libPromise = null; reject(new Error('Nie udało się pobrać biblioteki PDF (vendor/pdf).')); };
        document.head.appendChild(script);
    });
    return libPromise;
}
async function loadFonts() {
    if (fontCache) return fontCache;
    fontCache = await Promise.all(FONTS.map(async ([name, url, style]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Brak czcionki raportu (${url}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return { name, style, binary };
    }));
    return fontCache;
}

const nf = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const dateFmt = (d) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? few : many);
const niceLength = (m) => { const p = 10 ** Math.floor(Math.log10(m)); const n = m / p; return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p; };
const yearsText = (n) => `${n} ${plural(n, 'rok', 'lata', 'lat')}`;
const areaText = (m2) => (m2 >= 10000 ? `${nf2.format(m2 / 10000)} ha` : `${nf.format(m2)} m²`);
/** Jaśniejsza wersja koloru (#rrggbb) — tło akcentu. */
const tint = (hex, t) => {
    const n = parseInt(hex.slice(1), 16); const mix = (c) => Math.round(c + (255 - c) * t);
    return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/** Pomocnik układu strony (kursor y, nowa strona, nagłówki, tabele, mapy). */
class Layout {
    constructor(doc, meta) { this.doc = doc; this.meta = meta; this.y = M; this.accentSoft = tint(meta.color, 0.88); }
    font(size, bold = false, color = INK) { this.doc.setFont('Inter', bold ? 'bold' : 'normal'); this.doc.setFontSize(size); this.doc.setTextColor(color); }
    lh(size) { return size * PT * 1.3; }
    newPage() { this.doc.addPage('a4', 'portrait'); this.pageHeader(); }
    pageHeader() {
        const { doc, meta } = this;
        doc.setFillColor(meta.color); doc.rect(0, 0, PAGE_W, 2.2, 'F');
        this.font(7.5, true, meta.color);
        doc.text(`${meta.brand.toUpperCase()} · ${meta.title.toUpperCase()}`, M, 8.5, { baseline: 'top' });
        this.font(7.5, false, MUTED);
        doc.text(meta.parcelTitle, PAGE_W - M, 8.5, { baseline: 'top', align: 'right' });
        doc.setDrawColor(LINE); doc.setLineWidth(0.25); doc.line(M, 13, PAGE_W - M, 13);
        this.y = 19;
    }
    ensure(h) { if (this.y + h > BOTTOM) { this.newPage(); return true; } return false; }
    para(text, { size = 9.5, bold = false, color = INK, width = CW, x = M, gapAfter = 1.5 } = {}) {
        if (!text) return 0;
        this.font(size, bold, color);
        const lines = this.doc.splitTextToSize(String(text), width);
        const lh = this.lh(size);
        for (const line of lines) { this.ensure(lh); this.doc.text(line, x, this.y, { baseline: 'top' }); this.y += lh; }
        this.y += gapAfter;
        return lines.length * lh;
    }
    measure(text, size, width, bold = false) { this.font(size, bold); return this.doc.splitTextToSize(String(text ?? ''), width).length * this.lh(size); }
    /** Nagłówek sekcji: znacznik w kolorze akcentu, tytuł, opcjonalny podpis źródła z prawej. minBody — ile treści musi się zmieścić razem z nim. */
    heading(title, minBody = 30, source = '') {
        this.ensure(14 + minBody);
        this.y += 4;
        const { doc } = this;
        doc.setFillColor(this.meta.color); doc.roundedRect(M, this.y + 0.6, 1.6, 5.2, 0.6, 0.6, 'F');
        this.font(12.5, true, INK); doc.text(title, M + 4.2, this.y, { baseline: 'top' });
        if (source) { this.font(7.5, false, MUTED); doc.text(source, PAGE_W - M, this.y + 1.6, { baseline: 'top', align: 'right' }); }
        this.y += 7.6;
        doc.setDrawColor(LINE); doc.setLineWidth(0.25); doc.line(M, this.y, PAGE_W - M, this.y);
        this.y += 3.5;
    }
    note(text) { this.para(text, { size: 7.6, color: MUTED, gapAfter: 2 }); }
    /** Komunikat zamiast pustych danych. */
    empty(text, tone = 'muted') {
        const h = this.measure(text, 9, CW - 12) + 7;
        this.ensure(h + 2);
        const t = TONES[tone];
        this.doc.setFillColor(tone === 'muted' ? SOFT : t.bg); this.doc.roundedRect(M, this.y, CW, h, 1.8, 1.8, 'F');
        this.font(9, false, tone === 'muted' ? '#3e4843' : t.fg);
        this.doc.text(this.doc.splitTextToSize(text, CW - 12), M + 6, this.y + 3.4, { baseline: 'top', lineHeightFactor: 1.3 });
        this.y += h + 3;
    }
    link(label, url, { size = 8.5 } = {}) {
        if (!url) return;
        this.font(size, false, this.meta.color);
        for (const line of this.doc.splitTextToSize(label, CW)) {
            this.ensure(this.lh(size));
            this.doc.text(line, M, this.y, { baseline: 'top' });
            this.doc.link(M, this.y, this.doc.getTextWidth(line), this.lh(size), { url });
            this.y += this.lh(size);
        }
        this.y += 1.5;
    }
    /** Pary „etykieta — wartość” w jednej albo dwóch kolumnach, w pasy. */
    kv(rows, { cols = 1, labelW = 44, size = 9 } = {}) {
        const list = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
        const gap = 6; const colW = (CW - gap * (cols - 1)) / cols; const lw = cols === 1 ? labelW : Math.min(labelW, colW * 0.42);
        for (let i = 0; i < list.length; i += cols) {
            const chunk = list.slice(i, i + cols);
            const h = Math.max(...chunk.map(([l, v]) => Math.max(this.measure(l, size - 0.6, lw - 3), this.measure(v, size, colW - lw - 3, true)))) + 3;
            this.ensure(h);
            if ((i / cols) % 2 === 0) { this.doc.setFillColor(ZEBRA); this.doc.rect(M, this.y, CW, h, 'F'); }
            chunk.forEach(([label, value], j) => {
                const x = M + j * (colW + gap);
                this.font(size - 0.6, false, MUTED); this.doc.text(this.doc.splitTextToSize(label, lw - 3), x + 2, this.y + 1.5, { baseline: 'top', lineHeightFactor: 1.3 });
                this.font(size, true, INK); this.doc.text(this.doc.splitTextToSize(String(value), colW - lw - 3), x + lw, this.y + 1.5, { baseline: 'top', lineHeightFactor: 1.3 });
            });
            this.y += h;
        }
        this.y += 2.5;
    }
    table(columns, rows, { size = 8 } = {}) {
        const total = columns.reduce((a, c) => a + c.w, 0);
        const widths = columns.map((c) => (c.w / total) * CW);
        const pad = 1.6;
        const header = () => {
            const h = Math.max(...columns.map((c, i) => this.measure(c.label, size - 0.4, widths[i] - 2 * pad, true))) + 2 * pad;
            this.doc.setFillColor(this.accentSoft); this.doc.rect(M, this.y, CW, h, 'F');
            let x = M;
            columns.forEach((c, i) => { this.font(size - 0.4, true, INK); this.doc.text(this.doc.splitTextToSize(c.label, widths[i] - 2 * pad), x + pad, this.y + pad, { baseline: 'top', lineHeightFactor: 1.25 }); x += widths[i]; });
            this.y += h;
        };
        this.ensure(20); header();
        rows.forEach((row, r) => {
            const h = Math.max(...row.map((cell, i) => this.measure(cell ?? '—', size, widths[i] - 2 * pad))) + 2 * pad;
            if (this.ensure(h)) header();
            if (r % 2 === 1) { this.doc.setFillColor(ZEBRA); this.doc.rect(M, this.y, CW, h, 'F'); }
            let x = M;
            row.forEach((cell, i) => { this.font(size, false, INK); this.doc.text(this.doc.splitTextToSize(String(cell ?? '—'), widths[i] - 2 * pad), x + pad, this.y + pad, { baseline: 'top', lineHeightFactor: 1.25 }); x += widths[i]; });
            this.y += h;
        });
        this.doc.setDrawColor(LINE); this.doc.setLineWidth(0.25); this.doc.line(M, this.y, M + CW, this.y);
        this.y += 3;
    }
    /** Kafle z liczbami. items: [label, value, sub?]. */
    tiles(items, { h = 17 } = {}) {
        const gap = 3; const w = (CW - gap * (items.length - 1)) / items.length;
        this.ensure(h + 3);
        items.forEach(([label, value, sub], i) => {
            const x = M + i * (w + gap);
            this.doc.setFillColor(SOFT); this.doc.roundedRect(x, this.y, w, h, 2, 2, 'F');
            this.font(7.2, true, MUTED); this.doc.text(label.toUpperCase(), x + 3.5, this.y + 3, { baseline: 'top', maxWidth: w - 6 });
            const big = String(value);
            // Największy rozmiar, przy którym wartość mieści się w kaflu (identyfikator działki bywa długi).
            const size = [14, 12.5, 11, 10, 9, 8].find((sz) => { this.font(sz, true, INK); return this.doc.getTextWidth(big) <= w - 7; }) ?? 8;
            this.font(size, true, INK);
            this.doc.text(this.doc.splitTextToSize(big, w - 6)[0] ?? '', x + 3.5, this.y + 7.6 + (14 - size) * 0.18, { baseline: 'top' });
            if (sub) { this.font(7, false, MUTED); this.doc.text(this.doc.splitTextToSize(sub, w - 6)[0] ?? '', x + 3.5, this.y + h - 4.2, { baseline: 'top' }); }
        });
        this.y += h + 3.5;
    }
    /** Obraz mapy w ramce z zaokrąglonymi rogami, podziałką i strzałką północy. Zwraca wysokość. */
    mapImage(map, { x = M, y = this.y, w = CW, h } = {}) {
        const { doc } = this;
        h ??= (w * map.heightPx) / map.widthPx;
        doc.saveGraphicsState();
        doc.roundedRect(x, y, w, h, 2.2, 2.2, null); doc.clip(); doc.discardPath();
        doc.addImage(map.dataUrl, 'JPEG', x, y, w, h, undefined, 'FAST');
        doc.restoreGraphicsState();
        doc.setDrawColor('#cfd6cf'); doc.setLineWidth(0.3); doc.roundedRect(x, y, w, h, 2.2, 2.2, 'S');
        if (map.warning) {
            this.font(7, true, '#724300');
            const text = 'Dane mapy wymagają weryfikacji';
            doc.setFillColor('#fff2d5');
            doc.rect(x + 2, y + 2, doc.getTextWidth(text) + 4, 6, 'F');
            doc.text(text, x + 4, y + 3, { baseline: 'top' });
        }
        const mPerMm = (map.metersPerPx * map.widthPx) / w;
        const len = niceLength(mPerMm * Math.min(26, w * 0.28)); const barMm = len / mPerMm;
        const label = len >= 1000 ? `${nf1.format(len / 1000)} km` : `${len} m`;
        this.font(7, true, INK);
        const boxW = barMm + doc.getTextWidth(label) + 7;
        const bx = x + 3; const by = y + h - 9;
        doc.setFillColor('#ffffff'); doc.roundedRect(bx - 1.5, by - 1.2, boxW, 6.8, 1.2, 1.2, 'F');
        doc.setFillColor(INK); doc.rect(bx, by + 2, barMm, 1, 'F'); doc.rect(bx, by + 0.7, 0.35, 3.4, 'F'); doc.rect(bx + barMm - 0.35, by + 0.7, 0.35, 3.4, 'F');
        doc.text(label, bx + barMm + 2, by + 1.1, { baseline: 'top' });
        const nx = x + w - 7.5; const ny = y + 3.5;
        doc.setFillColor('#ffffff'); doc.circle(nx, ny + 3.3, 4, 'F');
        doc.setFillColor(INK); doc.triangle(nx, ny + 0.4, nx - 1.7, ny + 4.8, nx + 1.7, ny + 4.8, 'F');
        this.font(5.5, true, INK); doc.text('N', nx, ny + 5.1, { baseline: 'top', align: 'center' });
        return h;
    }
    image(map, { caption, minAfter = 0 } = {}) {
        if (!map) return;
        if (map.error) { this.empty(`Mapa niedostępna: ${map.error}`, 'warn'); return; }
        const h = (CW * map.heightPx) / map.widthPx;
        this.ensure(h + 8 + minAfter);
        this.mapImage(map, { h });
        this.y += h + 1.8;
        if (caption) this.note(caption);
    }
    legend(items) {
        let x = M; this.ensure(6);
        for (const [label, color] of items) {
            this.font(8, false, INK);
            const w = this.doc.getTextWidth(label) + 9;
            if (x + w > M + CW) { x = M; this.y += 4.8; this.ensure(5); }
            this.doc.setFillColor(color); this.doc.circle(x + 1.6, this.y + 1.7, 1.5, 'F');
            this.doc.text(label, x + 4.2, this.y, { baseline: 'top' });
            x += w;
        }
        this.y += 6.5;
    }
    /** 19.40.0: etykieta rodzaju informacji; zwraca szerokość. */
    chip(kind, x, y) {
        const k = KINDS[kind] ?? KINDS.obliczenie;
        this.font(6, true, k.fg);
        const w = this.doc.getTextWidth(k.label) + 3.6;
        this.doc.setFillColor(k.bg); this.doc.roundedRect(x, y, w, 3.9, 1, 1, 'F');
        this.doc.text(k.label, x + 1.8, y + 0.75, { baseline: 'top' });
        return w;
    }
    /** 19.40.0: tabela parametrów karty decyzyjnej: parametr | wartość | rodzaj informacji. */
    paramTable(rows) {
        const lw = 44; const kw = 25; const vw = CW - lw - kw; const pad = 1.25;
        rows.forEach((row, i) => {
            const h = Math.max(this.measure(row.label, 7.8, lw - 4), this.measure(row.value, 8.2, vw - 4, true)) + 2 * pad;
            this.ensure(h);
            if (i % 2 === 0) { this.doc.setFillColor(ZEBRA); this.doc.rect(M, this.y, CW, h, 'F'); }
            this.font(7.8, false, MUTED); this.doc.text(this.doc.splitTextToSize(row.label, lw - 4), M + 2, this.y + pad, { baseline: 'top', lineHeightFactor: 1.25 });
            this.font(8.2, true, INK); this.doc.text(this.doc.splitTextToSize(String(row.value), vw - 4), M + lw, this.y + pad, { baseline: 'top', lineHeightFactor: 1.25 });
            this.chip(row.kind, M + lw + vw + 1, this.y + pad - 0.2);
            this.y += h;
        });
        this.doc.setDrawColor(LINE); this.doc.setLineWidth(0.25); this.doc.line(M, this.y, M + CW, this.y);
        this.y += 3;
    }
    /** 19.40.0: lista wniosków z etykietą, tytułem, opisem i linkiem do weryfikacji. */
    findings(list, { groupBySev = false } = {}) {
        let sev = null;
        for (const f of list) {
            if (groupBySev && f.sev !== sev) {
                sev = f.sev; this.ensure(10);
                this.font(7.4, true, MUTED); this.doc.text(SEV_LABEL[sev].toUpperCase(), M, this.y + 0.5, { baseline: 'top' }); this.y += 4.6;
            }
            const textW = CW - 6;
            const body = `${f.text}`;
            const h = this.measure(body, 8, textW) + 5.4 + (f.link ? 3.5 : 0);
            this.ensure(h + 1.2);
            const top = this.y;
            const k = KINDS[f.kind] ?? KINDS.obliczenie;
            this.doc.setFillColor(k.fg); this.doc.rect(M, top, 0.9, h - 1.2, 'F');
            const cw = this.chip(f.kind, M + 3, top);
            this.font(8.8, true, INK); this.doc.text(f.title, M + 3 + cw + 2, top - 0.15, { baseline: 'top', maxWidth: CW - cw - 6 });
            this.font(8, false, '#33403a'); this.doc.text(this.doc.splitTextToSize(body, textW), M + 3, top + 4.7, { baseline: 'top', lineHeightFactor: 1.25 });
            if (f.link) {
                const ly = top + 4.7 + this.measure(body, 8, textW) + 0.3;
                this.font(7.6, false, this.meta.color); const label = `${f.link[0]} → ${f.link[1].replace(/^https?:\/\//, '')}`;
                this.doc.text(label, M + 3, ly, { baseline: 'top' }); this.doc.link(M + 3, ly, this.doc.getTextWidth(label), 3.5, { url: f.link[1] });
            }
            this.y = top + h + 1.1;
        }
    }
    /** Karty „W skrócie”: chip statusu, tytuł, opis — w dwóch kolumnach. */
    cards(items) {
        const gap = 3.5; const w = (CW - gap) / 2; const pad = 3.4;
        for (let i = 0; i < items.length; i += 2) {
            const pair = items.slice(i, i + 2);
            const h = Math.max(...pair.map(([, , text]) => this.measure(text, 8.6, w - 2 * pad))) + 12;
            this.ensure(h + gap);
            pair.forEach(([tone, title, text], j) => {
                const t = TONES[tone] ?? TONES.info;
                const x = M + j * (w + gap);
                this.doc.setFillColor(SOFT); this.doc.roundedRect(x, this.y, w, h, 2, 2, 'F');
                this.font(6.6, true, t.fg);
                const chipW = this.doc.getTextWidth(t.label) + 4;
                this.doc.setFillColor(t.bg); this.doc.roundedRect(x + pad, this.y + pad - 0.6, chipW, 4.2, 1.2, 1.2, 'F');
                this.doc.text(t.label, x + pad + 2, this.y + pad + 0.1, { baseline: 'top' });
                this.font(9, true, INK); this.doc.text(title, x + pad + chipW + 2.2, this.y + pad - 0.3, { baseline: 'top', maxWidth: w - chipW - 2 * pad - 2 });
                this.font(8.6, false, '#33403a'); this.doc.text(this.doc.splitTextToSize(text, w - 2 * pad), x + pad, this.y + pad + 5.6, { baseline: 'top', lineHeightFactor: 1.3 });
            });
            this.y += h + gap;
        }
        this.y += 1;
    }
}

// ---- treść sekcji -------------------------------------------------------------

/** 19.38.0: strefy planu ogólnego (rozporządzenie w sprawie POG) — opis prostym językiem. */
const POG_ZONES = {
    SW: ['Strefa wielofunkcyjna z zabudową mieszkaniową wielorodzinną', 'Teren miejski o mieszanym przeznaczeniu: bloki i kamienice, usługi, handel, zieleń, drogi. Dopuszczalna jest też zabudowa jednorodzinna, jeśli pozwoli na to plan miejscowy.'],
    SJ: ['Strefa wielofunkcyjna z zabudową mieszkaniową jednorodzinną', 'Przede wszystkim domy jednorodzinne z towarzyszącymi usługami, zielenią i drogami. Typowa strefa pod budowę domu.'],
    SZ: ['Strefa wielofunkcyjna z zabudową zagrodową', 'Tereny wiejskie: zabudowa zagrodowa (siedliska rolników), domy jednorodzinne, usługi, gospodarstwa rolne.'],
    SU: ['Strefa usługowa', 'Usługi: handel do 2000 m² sprzedaży, biura, gastronomia, oświata, zdrowie, sport. Mieszkania tylko jako uzupełnienie, jeśli dopuści je plan miejscowy.'],
    SH: ['Strefa handlu wielkopowierzchniowego', 'Obiekty handlowe o powierzchni sprzedaży powyżej 2000 m² i usługi im towarzyszące.'],
    SP: ['Strefa gospodarcza', 'Przemysł, magazyny, składy, bazy, energetyka i usługi. Zabudowa mieszkaniowa co do zasady niedopuszczalna.'],
    SR: ['Strefa produkcji rolniczej', 'Produkcja rolnicza, w tym hodowla, szklarnie i przetwórstwo rolne.'],
    SI: ['Strefa infrastrukturalna', 'Urządzenia infrastruktury technicznej: oczyszczalnie, stacje elektroenergetyczne, ujęcia wody itp.'],
    SN: ['Strefa zieleni i rekreacji', 'Parki, ogrody, tereny sportu i rekreacji, ogrody działkowe. Zabudowa ograniczona do obiektów służących rekreacji.'],
    SC: ['Strefa cmentarzy', 'Cmentarze i obiekty z nimi związane.'],
    SG: ['Strefa górnictwa', 'Eksploatacja złóż (kopalnie, żwirownie) i obiekty z nią związane.'],
    SO: ['Strefa otwarta', 'Tereny rolne, leśne, wody i nieużytki. Nowa zabudowa co do zasady niedopuszczalna, poza wyjątkami (np. zabudowa zagrodowa, infrastruktura).'],
    SK: ['Strefa komunikacyjna', 'Drogi, linie kolejowe, lotniska i inne tereny komunikacji.'],
};
const zoneCode = (label) => (String(label ?? '').match(/(SW|SJ|SZ|SU|SH|SP|SR|SI|SN|SC|SG|SO|SK)\b/) ?? [])[1] ?? null;
/** „12 m” → 12, „1,5” → 1.5, „60%” → 60; null, gdy brak liczby. */
const num = (v) => { const m = String(v ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };


/** Wysokość mapy w PDF (mm) — nagłówek sekcji nie zostaje sam na dole strony. */
const mapHeight = (map, extra = 0) => (map && !map.error ? (CW * map.heightPx) / map.widthPx + 8 + extra : 24);

function planSummary(plan) {
    const pog = plan?.layers?.pog; const mpzp = plan?.layers?.mpzp;
    const zones = (pog?.matches ?? []).filter((m) => m.kind === 'strefa');
    const act = (pog?.matches ?? []).find((m) => m.kind === 'akt');
    return { pog, mpzp, zones, act };
}

function sectionDzialka(L, ctx) {
    const { base, r, options, maps } = ctx;
    const p = base.parcel;
    const multi = base.parcels.length > 1;
    // 19.40.0: dane i mapy terenu od strony 2 — strona 1 to karta decyzyjna.
    L.newPage();
    L.heading(multi ? 'Teren inwestycji' : 'Działka', maps.mapa ? 100 : 20, 'GUGiK — ULDK');
    if (maps.mapa) {
        const wMain = 120; const gap = 4; const wLoc = CW - wMain - gap; const h = 82;
        L.ensure(h + 10);
        const top = L.y;
        if (maps.mapa.error) L.empty(`Mapa niedostępna: ${maps.mapa.error}`, 'warn');
        else L.mapImage(maps.mapa, { x: M, y: top, w: wMain, h });
        if (maps.polozenie && !maps.polozenie.error) L.mapImage(maps.polozenie, { x: M + wMain + gap, y: top, w: wLoc, h });
        L.y = top + h + 1.6;
        L.font(7.4, false, MUTED);
        L.doc.text(`${BASEMAP_LABEL[options.basemap]} z granicą ${multi ? 'terenu' : 'działki'} (ULDK)${base.shape?.rect && options.sections.includes('ksztalt') ? '; żółta przerywana — największy prostokąt' : ''}`, M, L.y, { baseline: 'top', maxWidth: wMain });
        L.doc.text('Położenie', M + wMain + gap, L.y, { baseline: 'top' });
        L.y += 6;
    }
    if (multi) {
        L.table([{ label: 'Działka', w: 30 }, { label: 'Obręb', w: 20 }, { label: 'Gmina', w: 22 }, { label: 'Powierzchnia', w: 14 }],
            base.parts.map(({ parcel, areaM2 }) => [parcel.id, parcel.region || '—', parcel.commune || '—', areaText(areaM2)]));
    }
    L.kv([
        ['Gmina', p.commune], ['Powiat, województwo', [p.county, p.voivodeship].filter(Boolean).join(', ')],
        ['Środek (PL-1992)', `X ${nf1.format(base.center[0])}, Y ${nf1.format(base.center[1])}`], ['Powierzchnia', `${nf.format(base.areaM2)} m² (z geometrii ULDK)`],
    ], { cols: 2, labelW: 34, size: 8.4 });
    if (!r.plan?.data && r.plan?.error) L.note(`Część danych działki niedostępna: ${r.plan.error}`);
}

function sectionKsztalt(L, ctx) {
    const s = ctx.base.shape;
    L.heading('Wymiary i kształt', 30, 'obliczenie z geometrii ULDK');
    if (!s) { L.empty('Nie udało się obliczyć wymiarów z geometrii.', 'warn'); return; }
    const tiles = [['Prostokąt opisany', `${nf.format(s.length)} × ${nf.format(s.width)} m`, `oś dłuższa: azymut ${nf.format(s.azimuth)}°`], ['Najmniejsza szerokość', `${nf.format(s.minWidth)} m`, 'między liniami podparcia']];
    if (s.rect) tiles.push(['Największy prostokąt', `${nf.format(s.rect.a)} × ${nf.format(s.rect.b)} m`, `${areaText(s.rect.area)} · ${nf.format((s.rect.area / ctx.base.areaM2) * 100)}% terenu`]);
    L.tiles(tiles);
    L.kv([
        ['Wydłużenie', s.elongation ? `${nf2.format(s.elongation)} (długość / szerokość prostokąta)` : null],
        ['Zwartość', s.compactness != null ? `${nf2.format(s.compactness)} (1 = koło; poniżej 0,4 — kształt nieregularny lub wąski)` : 'nie liczona dla terenu z kilku działek'],
        ['Obwód', s.perimeter ? `${nf.format(s.perimeter)} m` : null],
    ], { labelW: 34, size: 8.6 });
    L.note(`Największy prostokąt w osiach prostokąta opisanego, na siatce co ok. ${nf1.format(s.rect?.cell ?? 1)} m. Nie uwzględnia linii zabudowy, pasów ochronnych sieci ani odległości od granic — wynik pokazuje tylko, czy kształt terenu mieści układ technologiczny.`);
}

function sectionEwidencja(L, ctx) {
    L.heading('Mapa ewidencyjna', mapHeight(ctx.maps.ewidencja), 'GUGiK — KIEG');
    L.image(ctx.maps.ewidencja, { caption: 'Działki, budynki i numery działek z Krajowej Integracji Ewidencji Gruntów; granica działki na czerwono.' });
}

function sectionPog(L, ctx) {
    const plan = ctx.r.plan;
    const zones = plan?.data ? planSummary(plan.data).zones : [];
    L.heading('Plan ogólny gminy', zones.length ? mapHeight(ctx.maps.pog) : 18, 'Rejestr Urbanistyczny');
    if (plan?.error) { L.empty(`Rejestr nie odpowiedział: ${plan.error}`, 'warn'); return; }
    const { pog, act } = planSummary(plan.data);
    if (!act && !zones.length) { L.empty('Gmina nie ma planu ogólnego w Rejestrze Urbanistycznym (stan na dzień raportu). Brak planu w rejestrze nie oznacza braku procedury — sprawdź w urzędzie gminy.'); return; }
    if (plan.data.merged) L.note(`Strefy zsumowane dla ${plan.data.merged} działek terenu (udział w powierzchni całego terenu).`);
    if (ctx.maps.pog && !ctx.maps.pog.error && ctx.pogLegend) {
        const wMap = 118; const gap = 5; const h = (wMap * ctx.maps.pog.heightPx) / ctx.maps.pog.widthPx;
        L.ensure(h + 10);
        const top = L.y;
        L.mapImage(ctx.maps.pog, { x: M, y: top, w: wMap, h });
        const lw = CW - wMap - gap; const lh = Math.min(h - 6, (lw * ctx.pogLegend.h) / ctx.pogLegend.w);
        L.font(7.6, true, MUTED); L.doc.text('LEGENDA STREF', M + wMap + gap, top, { baseline: 'top' });
        L.doc.addImage(ctx.pogLegend.dataUrl, 'PNG', M + wMap + gap, top + 4.5, (lh * ctx.pogLegend.w) / ctx.pogLegend.h, lh, undefined, 'FAST');
        L.y = top + h + 1.8;
        L.note('Strefy planistyczne planu ogólnego (GUGiK — Plany Ogólne Gmin), granica działki na czerwono.');
    } else if (ctx.maps.pog) L.image(ctx.maps.pog, { caption: 'Strefy planistyczne planu ogólnego (GUGiK — Plany Ogólne Gmin) i granica działki.', minAfter: 20 });
    if (zones.length) {
        const val = (z, k) => z.attributes?.[k] && !['-', 'None', 'null'].includes(String(z.attributes[k]).trim()) ? z.attributes[k] : '—';
        // 19.38.0: opis każdej strefy prostym językiem i wyliczenie, co parametry znaczą dla tej działki.
        for (const z of zones) {
            const code = zoneCode(z.label);
            const [title, text] = POG_ZONES[code] ?? [z.attributes?.Nazwa || 'Strefa planistyczna', 'Opis strefy w uchwale planu ogólnego.'];
            const areaZ = z.areaM2 ?? (z.partPct != null ? (ctx.base.areaM2 * z.partPct) / 100 : ctx.base.areaM2);
            const h = num(val(z, 'Maksymalna wysokość zabudowy'));
            const inten = num(val(z, 'Maksymalna nadziemna intensywność zabudowy'));
            const cover = num(val(z, 'Maksymalny udział powierzchni zabudowy'));
            const pbc = num(val(z, 'Minimalny udział powierzchni biologicznie czynnej'));
            const boxText = `${text}`;
            const textH = L.measure(boxText, 8.8, CW - 12) + 13;
            L.ensure(textH + 30);
            L.doc.setFillColor(L.accentSoft); L.doc.roundedRect(M, L.y, CW, textH, 2, 2, 'F');
            L.font(10, true, INK); L.doc.text(`${z.label} — ${title}`, M + 5, L.y + 3.5, { baseline: 'top', maxWidth: CW - 10 });
            L.font(8.8, false, '#33403a'); L.doc.text(L.doc.splitTextToSize(boxText, CW - 12), M + 5, L.y + 9, { baseline: 'top', lineHeightFactor: 1.3 });
            L.y += textH + 3;
            const tiles = [];
            if (h != null) tiles.push(['Maks. wysokość', `${nf1.format(h)} m`, `≈ ${Math.max(1, Math.floor(h / 3))} ${plural(Math.max(1, Math.floor(h / 3)), 'kondygnacja', 'kondygnacje', 'kondygnacji')} nadziemne`]);
            if (cover != null) tiles.push(['Zabudowa maks.', `≈ ${nf.format((areaZ * cover) / 100)} m²`, `${nf.format(cover)}% z ${nf.format(areaZ)} m²`]);
            if (inten != null) tiles.push(['Pow. kondygnacji maks.', `≈ ${nf.format(areaZ * inten)} m²`, `intensywność ${nf2.format(inten)}`]);
            if (pbc != null) tiles.push(['Biologicznie czynna min.', `≈ ${nf.format((areaZ * pbc) / 100)} m²`, `${nf.format(pbc)}% powierzchni`]);
            if (tiles.length) L.tiles(tiles);
        }
        L.note('Wyliczenia dla części działki w strefie: zabudowa = powierzchnia × udział zabudowy; powierzchnia kondygnacji nadziemnych = powierzchnia × intensywność; kondygnacje przy ok. 3 m na kondygnację. Plan ogólny sam nie daje prawa do zabudowy — rozstrzyga plan miejscowy albo decyzja o warunkach zabudowy (od 2026 r. wydawana tylko w obszarze uzupełnienia zabudowy wyznaczonym w planie ogólnym).');
        L.table([
            { label: 'Strefa', w: 30 }, { label: 'Udział w działce', w: 15 }, { label: 'Maks. wysokość', w: 12 },
            { label: 'Intensywność nadziemna', w: 13 }, { label: 'Pow. zabudowy maks.', w: 12 }, { label: 'PBC min.', w: 10 },
        ], zones.map((z) => [
            `${z.label}${z.attributes?.Nazwa ? ` — ${z.attributes.Nazwa}` : ''}`,
            z.partPct != null ? `${z.approximate ? '≈ ' : ''}${nf.format(z.partPct)}%${z.areaM2 ? ` · ${nf.format(z.areaM2)} m²` : ''}` : '—',
            val(z, 'Maksymalna wysokość zabudowy'), val(z, 'Maksymalna nadziemna intensywność zabudowy'), val(z, 'Maksymalny udział powierzchni zabudowy'), val(z, 'Minimalny udział powierzchni biologicznie czynnej'),
        ]));
    } else L.empty('Strefy planu nie zostały rozpoznane w punktach działki.');
    if (act) {
        L.kv([['Akt', act.label], ['Status', act.status], [/opracowan|projekt/i.test(act.status ?? '') ? 'Data wersji projektu' : 'Obowiązuje od', act.attributes?.['Obowiązuje od']]], { labelW: 32 });
        if (act.link) L.link(`${act.linkLabel || 'Uchwała'}: ${act.link}`, act.link);
    }
    if (pog?.online?.draft) L.note(`Projekt planu: ${pog.online.draft.title || 'plan ogólny'} — ${pog.online.draft.status}.`);
    // 19.40.0: obszar uzupełnienia zabudowy — warunek decyzji o warunkach zabudowy (art. 61 ust. 1 pkt 1a u.p.z.p.).
    const o = ctx.r.ouz;
    if (o?.data) L.kv([['Obszar uzupełnienia zabudowy', o.data.summary]], { labelW: 52 });
    else if (o?.error) L.note(`Obszar uzupełnienia zabudowy: usługa nie odpowiedziała (${o.error}).`);
}

function sectionMpzp(L, ctx) {
    const plan = ctx.r.plan;
    L.heading('Miejscowy plan zagospodarowania', 18, 'Rejestr Urbanistyczny / GUGiK');
    if (plan?.error) { L.empty(`Rejestr nie odpowiedział: ${plan.error}`, 'warn'); return; }
    const mpzp = plan.data.layers?.mpzp;
    const matches = mpzp?.matches ?? [];
    if (!matches.length) { L.empty('Brak planu miejscowego w rejestrze dla tej działki. Rejestr nie obejmuje jeszcze wszystkich planów — sprawdź w urzędzie gminy.'); return; }
    for (const m of matches.slice(0, 6)) {
        L.para(m.label, { size: 9.5, bold: true, gapAfter: 1 });
        const attrs = Object.entries(m.attributes ?? {}).filter(([k, v]) => v && !/^(Identyfikator|geom)/i.test(k)).slice(0, 8);
        if (attrs.length) L.kv(attrs.map(([k, v]) => [k, String(v).slice(0, 300)]), { labelW: 36, size: 8.6 });
        if (m.partPct != null) L.note(`${m.approximate ? '≈ ' : ''}${nf.format(m.partPct)}% działki`);
        if (m.link) L.link(`${m.linkLabel || 'Karta planu'}: ${m.link}`, m.link);
    }
}

function sectionCeny(L, ctx) {
    const { r, options, maps, base } = ctx;
    const c = r.ceny?.data; const s = c?.stats ?? {};
    const hasData = Boolean(c?.items?.length);
    if (!hasData && !r.ceny?.error) { ctx.emptyNotes.push(`ceny transakcyjne (${KIND_LABEL[options.priceKind]}, ${options.radius} m, ${yearsText(options.years)})`); return; }
    L.heading('Ceny transakcyjne', hasData ? mapHeight(maps.ceny, 21) : 18, `RCN — ${KIND_LABEL[options.priceKind]}`);
    if (r.ceny?.error) { L.empty(`Rejestr cen nie odpowiedział: ${r.ceny.error}`, 'warn'); return; }
    // 19.46.0: mediana z 1–2 transakcji — wyraźne zastrzeżenie w kafelku.
    const tiles = [['Mediana', s.medianPerM2 ? `${nf.format(s.medianPerM2)} zł/m²` : '—', (s.perM2Count ?? 0) < RCN_MIN_MEDIAN_COUNT && s.medianPerM2 ? `tylko ${nf.format(s.perM2Count ?? 0)} transakcji — orientacyjnie` : `z ${nf.format(s.perM2Count ?? 0)} transakcji`]];
    if (s.p25PerM2 && s.perM2Count >= 4) tiles.push(['Połowa transakcji', `${nf.format(s.p25PerM2)}–${nf.format(s.p75PerM2)}`, 'zł/m² (25–75%)']);
    tiles.push(['Wszystkie transakcje', nf.format(c.count ?? 0), `${options.radius} m · ${yearsText(options.years)}`]);
    if (options.priceKind === 'grunty' && s.medianPerM2 && s.perM2Count >= 5) tiles.push(['Działka × mediana', `≈ ${nf.format(Math.round((base.areaM2 * s.medianPerM2) / 1000) * 1000)} zł`, 'orientacyjnie, nie wycena']);
    L.tiles(tiles);
    if (maps.ceny) L.image(maps.ceny, { caption: 'Kolor punktu = cena za m²: od niebieskiego (taniej) do brązowego (drożej); szare — pominięte w statystyce.' });
    const items = [...c.items].sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0)).slice(0, 12);
    L.table([{ label: 'Data', w: 11 }, { label: 'Działki', w: 22 }, { label: 'Powierzchnia', w: 12 }, { label: 'Cena', w: 13 }, { label: 'zł/m²', w: 9 }, { label: 'Odległość', w: 9 }],
        items.map((it) => [it.date, `${it.label}${it.note ? ` (${it.note})` : ''}${it.inStats ? '' : ' *'}`, it.area ? `${nf.format(it.area)} m²` : '—', it.price ? `${nf.format(it.price)} zł` : '—', it.perM2 ? nf.format(it.perM2) : '—', it.dist != null ? `${nf.format(it.dist)} m` : '—']));
    L.note('* pominięta w statystyce (udział, kilka działek, rynek pierwotny lub nietypowa cena). Ceny z aktów notarialnych — nie są wyceną tej działki.');
}

function sectionBudowy(L, ctx) {
    const { r, options, maps } = ctx;
    const b = r.budowy?.data;
    const hasData = Boolean(b?.count);
    if (!hasData && !r.budowy?.error) { ctx.emptyNotes.push(`budowy i pozwolenia (${options.radius} m, ${yearsText(Math.min(3, options.years))})`); return; }
    L.heading('Budowy i pozwolenia w okolicy', hasData ? mapHeight(maps.budowy, 21) : 18, `GUNB — RWDZ, dane z ${b?.dataDate ?? '—'}`);
    if (r.budowy?.error) { L.empty(`Baza pozwoleń nie odpowiedziała: ${r.budowy.error}`, 'warn'); return; }
    const counts = Object.entries(b.counts ?? {}).filter(([, n]) => n > 0).sort((a, b2) => b2[1] - a[1]);
    const big = (b.counts?.wielorodzinny ?? 0) + (b.counts?.uslugi ?? 0) + (b.counts?.przemysl ?? 0);
    L.tiles([['Inwestycje', nf.format(b.count), `${options.radius} m · ${yearsText(Math.min(3, options.years))}`], ['Domy jednorodzinne', nf.format(b.counts?.dom ?? 0)], ['Wielorodzinne, usługi, przemysł', nf.format(big)]]);
    if (maps.budowy) {
        L.image(maps.budowy, { caption: `${b.unlocated ? `${b.unlocated} bez ustalonego położenia. ` : ''}${b.yearsCapped ? 'Baza obejmuje ostatnie 3 lata.' : ''}`.trim() || null, minAfter: 6 });
        if (counts.length) L.legend(counts.map(([type, n]) => [`${TYPE_COLORS[type]?.[0] ?? type}: ${n}`, TYPE_COLORS[type]?.[1] ?? '#9ca3af']));
    }
    const priority = { wielorodzinny: 0, uslugi: 1, przemysl: 1, energia: 2, dom: 3, infrastruktura: 4, rozbiorka: 4, inne: 5 };
    const items = [...(b.items ?? [])].sort((a, c) => (priority[a.type] ?? 9) - (priority[c.type] ?? 9) || (a.dist ?? 0) - (c.dist ?? 0)).slice(0, 10);
    if (items.length) {
        L.table([{ label: 'Rodzaj', w: 12 }, { label: 'Zamierzenie', w: 36 }, { label: 'Data', w: 10 }, { label: 'Status', w: 11 }, { label: 'Odl.', w: 7 }],
            items.map((it) => [TYPE_COLORS[it.type]?.[0] ?? it.type, `${(it.name || it.intent || '').slice(0, 200)}${it.place ? ` · ${it.place}` : ''}`, it.dateDecision || it.date, it.src === 'Z' ? (it.status || 'zgłoszenie') : (it.dateDecision ? 'decyzja' : (it.status || 'wniosek')), it.dist != null ? `${nf.format(it.dist)} m` : '—']));
        L.note('Najpierw większe inwestycje (wielorodzinne, usługi, przemysł), potem najbliższe. Rodzaj ustalony automatycznie z kategorii obiektu i opisu zamierzenia — orientacyjnie.');
    }
}

function sectionUzbrojenie(L, ctx) {
    const u = ctx.r.uzbrojenie;
    L.heading('Uzbrojenie terenu', mapHeight(ctx.maps.uzbrojenie, 12), 'GUGiK — KIUT (GESUT powiatów)');
    if (u?.error) { L.empty(`Krajowa integracja uzbrojenia terenu nie odpowiedziała: ${u.error}`, 'warn'); return; }
    if (ctx.maps.uzbrojenie) {
        L.image(ctx.maps.uzbrojenie, { caption: null, minAfter: 8 });
        L.legend(u.data.networks.map((n) => [n.name, n.color]));
    }
    const fmt = (n) => {
        if (n.error) return ['—', `brak odpowiedzi (${n.error})`];
        if (!n.count) return ['nie', `brak w promieniu ${u.data.bufferM} m`];
        if (n.insideCount) return ['tak', 'przebiega przez działkę'];
        return ['nie', `≈ ${nf.format(Math.max(1, Math.round(n.minDist)))} m od granicy`];
    };
    L.table([{ label: 'Sieć', w: 18 }, { label: 'Na działce', w: 9 }, { label: 'Najbliżej', w: 30 }],
        u.data.networks.map((n) => { const [onParcel, near] = fmt(n); return [n.name, onParcel, near]; }));
    L.note(`Odległości mierzone na obrazie KIUT (ok. ${nf1.format(u.data.pixelM)} m na piksel) od granicy działki, w promieniu ${u.data.bufferM} m. KIUT pokazuje sieci z baz GESUT powiatów — kompletność zależy od powiatu; przyłącza i sieci niezgłoszone mogą nie występować. Warunki przyłączenia wydaje gestor sieci.`);
}

function sectionOdleglosci(L, ctx) {
    const plan = ctx.r.plan?.data;
    if (!plan?.bdot) { ctx.emptyNotes.push('odległości z BDOT10k (baza nie jest wgrana na serwer)'); return; }
    L.heading('Odległości', 14, 'BDOT10k');
    L.kv([['Najbliższy budynek', `${nf.format(plan.bdot.groups.buildings.nearestM)} m`], ['Najbliższa droga', `${nf.format(plan.bdot.groups.roads.nearestM)} m`]], { cols: 2, labelW: 40 });
}

function sectionTeren(L, ctx) {
    const t = ctx.r.teren;
    L.heading('Wysokość i spadek terenu', 30, 'GUGiK — NMT 1 m');
    if (t?.error) { L.empty(`Model wysokości niedostępny: ${t.error}`, 'warn'); return; }
    const d = t.data;
    L.tiles([['Wysokość', `${nf1.format(d.min)}–${nf1.format(d.max)} m`, `n.p.m. · różnica ${nf1.format(d.max - d.min)} m`], ['Średni spadek', d.slopeMean != null ? `${nf1.format(d.slopeMean)}%` : '—', d.slopeMax != null ? `maks. ${nf1.format(d.slopeMax)}%` : ''], ['Ekspozycja', d.aspect.split(' (')[0], d.aspect.includes('(') ? d.aspect.slice(d.aspect.indexOf('(') + 1, -1) : '']]);
    // Udział klas spadku jako pasek.
    const classes = d.classes.filter(([, v]) => v);
    if (classes.length) {
        const colors = ['#cfe6c4', '#9fd18c', '#f0d860', '#f1a64a', '#d9573b'];
        L.ensure(12);
        let x = M;
        d.classes.forEach(([, v], i) => { if (!v) return; const w = (CW * v) / 100; L.doc.setFillColor(colors[i]); L.doc.rect(x, L.y, w, 4.5, 'F'); x += w; });
        L.y += 6;
        L.legend(d.classes.filter(([, v]) => v).map(([k, v]) => [`${k}: ${v}%`, colors[d.classes.findIndex(([kk]) => kk === k)]]));
    }
    L.note(`${d.samples} punktów co ok. ${nf1.format(d.step)} m, wysokości ${d.datum}. Spadki liczone między sąsiednimi punktami siatki.`);
    // 19.38.0: profile wysokości w 3 osiach przez środek działki.
    const profiles = (d.profiles ?? []).filter((pr) => pr.points.filter((pt) => pt.h != null).length >= 5);
    if (profiles.length) {
        const gap = 4; const w = (CW - gap * (profiles.length - 1)) / profiles.length; const h = 49;
        L.ensure(h + 12);
        L.font(9.5, true, INK); L.doc.text('Profile terenu w 3 osiach', M, L.y, { baseline: 'top' }); L.y += 5.5;
        const top = L.y;
        profiles.forEach((pr, i) => drawProfile(L, M + i * (w + gap), top, w, h, pr));
        L.y = top + h + 2;
        L.note('Wysokości co 1/60 długości odcinka przez środek działki; szare tło — część odcinka w granicach działki. Skala pionowa jest powiększona, żeby było widać różnice.');
    }
}

function drawProfile(L, x, y, w, h, pr) {
    const { doc } = L;
    const pts = pr.points.filter((p) => p.h != null);
    const hs = pts.map((p) => p.h); let lo = Math.min(...hs); let hi = Math.max(...hs);
    if (hi - lo < 2) { const mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    doc.setFillColor(SOFT); doc.roundedRect(x, y, w, h, 1.8, 1.8, 'F');
    L.font(7.6, true, INK); doc.text(pr.name, x + 2.5, y + 2.2, { baseline: 'top', maxWidth: w - 5 });
    const cx = x + 9; const cy = y + 8; const cw = w - 11.5; const ch = h - 20;
    const sx = (dd) => cx + (dd / pr.length) * cw; const sy = (hh) => cy + ch - ((hh - lo) / (hi - lo)) * ch;
    // część w działce
    const inPts = pr.points.filter((p) => p.inside);
    if (inPts.length) { doc.setFillColor('#dde5dd'); doc.rect(sx(inPts[0].d), cy, Math.max(0.6, sx(inPts.at(-1).d) - sx(inPts[0].d)), ch, 'F'); }
    doc.setDrawColor('#c9d1c9'); doc.setLineWidth(0.15); doc.line(cx, cy + ch, cx + cw, cy + ch); doc.line(cx, cy, cx, cy + ch);
    // linia profilu
    doc.setDrawColor(L.meta.color); doc.setLineWidth(0.55);
    for (let i = 1; i < pts.length; i += 1) doc.line(sx(pts[i - 1].d), sy(pts[i - 1].h), sx(pts[i].d), sy(pts[i].h));
    L.font(6.2, false, MUTED);
    doc.text(`${nf1.format(hi - pad)}`, cx - 1, sy(hi - pad), { baseline: 'middle', align: 'right' });
    doc.text(`${nf1.format(lo + pad)}`, cx - 1, sy(lo + pad), { baseline: 'middle', align: 'right' });
    doc.text('0 m', cx, cy + ch + 1.2, { baseline: 'top' });
    doc.text(`${nf.format(pr.length)} m`, cx + cw, cy + ch + 1.2, { baseline: 'top', align: 'right' });
    const inH = inPts.map((p) => p.h).filter((v) => v != null);
    if (inH.length > 1) {
        const diff = Math.max(...inH) - Math.min(...inH);
        const len = (inPts.at(-1).d - inPts[0].d) || 1;
        L.font(6.6, true, INK);
        doc.text(`w działce: ${nf1.format(diff)} m różnicy (≈ ${nf1.format((diff / len) * 100)}%)`, x + w / 2, y + h - 2.2, { baseline: 'bottom', align: 'center', maxWidth: w - 4 });
    }
}

function sectionPowodz(L, ctx) {
    const f = ctx.r.powodz;
    L.heading('Zagrożenie powodziowe', 22, `Wody Polskie — ISOK${f?.data?.dataSince ? `, mapy od ${f.data.dataSince}` : ''}`);
    if (f?.error) { L.empty(`Usługa ISOK nie odpowiedziała: ${f.error}`, 'warn'); return; }
    const d = f.data;
    if (d.found) L.empty(`${d.share != null ? `${shareText({ insideCount: 1, share: d.share })} terenu` : 'Część terenu'} w obszarze zagrożenia powodziowego.${d.oszp ? ' W tym obszar szczególnego zagrożenia powodzią (scenariusze 10% lub 1%) — obowiązują zakazy z art. 77 Prawa wodnego.' : ''} Scenariusze w punktach kontrolnych: ${d.scenarios.join('; ') || 'nieustalone'}.`, 'warn');
    else L.empty('Brak trafienia w sprawdzonych danych ISOK.', d.warning ? 'warn' : 'ok');
    if (d.warning) L.note(d.warning);
    L.kv([
        ['Udział powierzchni', d.share != null ? shareText({ insideCount: d.share > 0 ? 1 : 0, share: d.share }) : `nie zmierzono${d.coverError ? ` (${d.coverError})` : ''}`],
        ['Najbliższy obszar zagrożenia', d.share != null && !d.share && d.minDist != null ? `≈ ${distText(d.minDist)} od granicy` : d.share ? '—' : `brak w ${nf.format(d.bufferM ?? 150)} m`],
    ], { cols: 2, labelW: 36 });
    L.note(`Udział zmierzony na obrazie ISOK (ok. ${nf1.format(d.pixelM ?? 1)} m na piksel); scenariusze odczytane w ${d.probes} punktach (środek, skrajne wierzchołki i miejsca zagrożenia). Mapy zagrożenia nie obejmują wszystkich cieków.`);
}

function sectionPrzyroda(L, ctx) {
    const p = ctx.r.przyroda;
    L.heading('Ochrona przyrody', ctx.maps.srodowisko ? mapHeight(ctx.maps.srodowisko, 10) : 16, 'GDOŚ');
    if (p?.error) { L.empty(`Nie udało się sprawdzić: ${p.error}`, 'warn'); return; }
    // 19.40.0: mapa tematyczna w skali terenu (ochrona przyrody, powódź, lasy, wody) i udział powierzchni.
    if (ctx.maps.srodowisko) {
        L.image(ctx.maps.srodowisko, { minAfter: 8 });
        L.legend([['Natura 2000', '#b33749'], ['Formy ochrony', '#4daf49'], ['Zagrożenie powodziowe (ISOK)', '#3b82f6'], ['Lasy (BDOT10k)', '#2f6b2f'], ['Wody (BDOT10k)', '#38bdf8'], ['Teren', '#e8432e']]);
    }
    // 19.50.0: źródło zapasowe (EEA), gdy GDOŚ nie odpowiedział.
    for (const note of p.data.notes ?? []) L.note(note);
    const sh = p.data.share ?? {};
    L.kv([['Natura 2000 — udział powierzchni', shareText(sh.natura)], ['Inne formy ochrony — udział powierzchni', shareText(sh.other)]], { cols: 2, labelW: 44 });
    if (ctx.maps.przyroda) {
        L.image(ctx.maps.przyroda, { minAfter: 8 });
        L.legend([['Natura 2000 (obszary ptasie i siedliskowe)', '#b33749'], ['Parki, rezerwaty, OChK, użytki ekologiczne', '#4daf49'], ['Działka', '#e8432e']]);
    }
    const d = p.data.dist ?? {};
    const distText = (x, names) => {
        if (names?.length) return `działka w obszarze: ${names.join('; ')}`;
        if (!x || x.error) return x?.error ? `nie udało się zmierzyć (${x.error})` : '—';
        if (!x.count) return `brak w promieniu ${nf1.format((p.data.radiusM ?? 3000) / 1000)} km`;
        if (x.insideCount) return 'na granicy działki lub w niej (dokładność ok. 10 m)';
        return `najbliższy ≈ ${x.minDist >= 1000 ? `${nf1.format(x.minDist / 1000)} km` : `${nf.format(Math.round(x.minDist / 10) * 10)} m`}`;
    };
    L.kv([['Natura 2000', p.data.natura === null && !d.natura ? 'brak odpowiedzi usługi' : distText(d.natura, p.data.natura)], ['Inne formy ochrony', p.data.other === null && !d.other ? 'brak odpowiedzi usługi' : distText(d.other, p.data.other)]], { cols: 1, labelW: 40 });
    L.note('Udział zmierzony na obrazie GDOŚ w skali terenu; nazwy odczytane w środku i w miejscach trafień; odległości zmierzone na mapie GDOŚ w promieniu 3 km (ok. 10 m na piksel). Inwestycja blisko obszaru Natura 2000 może wymagać oceny oddziaływania na środowisko.');
}

function sectionLas(L, ctx) {
    const f = ctx.r.las;
    if (f?.data && !f.data.found && !f.data.bdot?.insideCount && !f.data.bdot?.error) {
        const b = f.data.bdot;
        ctx.emptyNotes.push(`las w terenie (BDOT10k i BDL${b?.count ? `; najbliższy las ≈ ${distText(b.minDist)} od granicy` : '; brak lasu w 300 m'})`);
        return;
    }
    L.heading('Lasy', 16, 'BDOT10k · Bank Danych o Lasach');
    if (f?.error) { L.empty(`Nie udało się sprawdzić: ${f.error}`, 'warn'); return; }
    const d = f.data; const b = d.bdot;
    L.kv([['Las w terenie (BDOT10k)', b?.error ? `brak odpowiedzi (${b.error})` : shareText(b)], ['Najbliższy las poza terenem', b && !b.error ? (b.count ? (b.insideCount ? 'przylega lub w terenie' : `≈ ${distText(b.minDist)}`) : 'brak w 300 m') : '—']], { cols: 2, labelW: 40 });
    if (!d.found) { L.note('W punktach kontrolnych brak lasu w Banku Danych o Lasach (mały las prywatny bez planu urządzenia lasu może w nim nie występować — rozstrzyga ewidencja gruntów, użytek Ls).'); return; }
    const det = d.first?.details ?? {};
    L.kv([
        ['Własność', d.owners.join('; ')], ['Las w punktach działki', `${d.share}`],
        ['Nadleśnictwo / leśnictwo', [det.nadlesnictwo, det.lesnictwo].filter(Boolean).join(' / ') || null], ['RDLP', det.rdlp],
        ['Drzewostan', [det.gatunek, det.wiek ? `${det.wiek} lat` : null, det.siedlisko].filter(Boolean).join(', ') || null],
        ['Funkcja / ochronność', [det.funkcja, det.ochronnosc].filter(Boolean).join(', ') || null], ['Adres leśny', det.adres],
    ], { cols: 2, labelW: 34 });
    L.note('Wycinka, wyłączenie z produkcji leśnej i zabudowa w lesie wymagają decyzji — sprawdź w nadleśnictwie albo starostwie.');
}

function sectionInne(L, ctx) {
    const f = ctx.r.inne;
    L.heading('Zabytki, złoża, wody', 24, 'NID · PIG-PIB MIDAS · BDOT10k');
    if (f?.error) { L.empty(`Nie udało się sprawdzić: ${f.error}`, 'warn'); return; }
    const d = f.data;
    const nidText = (list) => (d.nid.errors >= d.nid.points * 2 ? 'brak odpowiedzi rejestru' : list.length ? list.join('; ') : `brak w ${d.nid.points} punktach terenu`);
    const cov = (c, label) => (!c || c.error ? `brak odpowiedzi${c?.error ? ` (${c.error})` : ''}` : c.insideCount ? `${shareText(c)} terenu` : c.count ? `poza terenem, ≈ ${distText(c.minDist)}` : `brak w ${nf.format(c.bufferM)} m`);
    L.table([{ label: 'Zagadnienie', w: 26 }, { label: 'Wynik', w: 50 }, { label: 'Źródło', w: 20 }], [
        ['Zabytki nieruchome (rejestr)', nidText(d.nid.immovable), 'NID'],
        ['Stanowiska archeologiczne (rejestr)', nidText(d.nid.archaeology), 'NID'],
        ['Złoża kopalin', cov(d.deposits), 'PIG-PIB MIDAS'],
        ['Obszary górnicze', cov(d.mining), 'PIG-PIB MIDAS'],
        ['Wody powierzchniowe, rowy', cov(d.water), 'BDOT10k'],
    ]);
    L.note('Rejestr NID sprawdzony w punktach siatki terenu; gminna ewidencja zabytków i strefy ochrony konserwatorskiej z planów nie są objęte. Złoża i wody — udział na obrazie usług (dokładność kilku metrów).');
}

function sectionOtoczenie(L, ctx) {
    const f = ctx.r.otoczenie;
    L.heading('Zabudowa mieszkaniowa i otoczenie', ctx.maps.otoczenie ? mapHeight(ctx.maps.otoczenie, 10) : 30, 'BDOT10k · KOWR · RWDZ');
    if (f?.error) { L.empty(`Nie udało się sprawdzić: ${f.error}`, 'warn'); return; }
    const d = f.data; const res = d.residential;
    if (res?.error) L.empty(`Zabudowa mieszkaniowa niesprawdzona: ${res.error}`, 'warn');
    else {
        if (ctx.maps.otoczenie) {
            L.image(ctx.maps.otoczenie, { minAfter: 8 });
            L.legend([['do 100 m', '#b91c1c'], ['100–300 m', '#ea580c'], ['300–500 m', '#ca8a04'], ['500–1000 m', '#6b7280']]);
        }
        L.tiles([['Najbliższy', res.nearest == null ? 'brak w 1 km' : res.nearest === 0 ? 'w terenie' : `≈ ${distText(res.nearest)}`, res.insideCount ? `mieszkalny; ${res.insideCount} w terenie` : 'mieszkalny, od granicy'],
            ...res.rings.map((ring, i) => [`do ${ring >= 1000 ? '1 km' : `${ring} m`}`, nf.format(res.counts[i]), plural(res.counts[i], 'budynek', 'budynki', 'budynków')])]);
        L.note(`Budynki mieszkalne (jednorodzinne, wielorodzinne, inne mieszkalne) z lokalnej bazy BDOT10k${res.dataDate ? ` (przygotowanej ${String(res.dataDate).slice(0, 10)})` : ''}; odległość od granicy terenu do najbliższego wierzchołka budynku.${res.truncated ? ' Wynik obcięty do 5000 budynków.' : ''}${res.tilesMissing ? ' Część obszaru poza zasięgiem bazy.' : ''} Funkcja budynku w BDOT10k bywa nieaktualna.`);
    }
    const k = d.kowr;
    if (k && !k.error) {
        L.para(`Biogazownie rolnicze w 20 km: ${k.within20} (w 10 km: ${k.within10}) — rejestr KOWR z ${k.date}`, { size: 9.5, bold: true, gapAfter: 1 });
        if (k.items.length) L.table([{ label: 'Wytwórca', w: 34 }, { label: 'Moc el. / biometan', w: 18 }, { label: 'Adres', w: 36 }, { label: 'Odl.', w: 9 }],
            k.items.map((it) => [it.company, [it.electric_mw ? `${nf2.format(it.electric_mw)} MWe` : null, it.biomethane_m3_year ? `${nf.format(it.biomethane_m3_year)} m³/rok` : null].filter(Boolean).join(' · ') || '—', it.address, `≈ ${distText(it.dist)}`]), { size: 7.6 });
        L.note('Położenie z kodu pocztowego lub miejscowości (orientacyjne) — odległość przybliżona o kilka kilometrów.');
    }
    const p = d.permits;
    if (p && !p.error) {
        L.para(`Inwestycje energetyczne i przemysłowe w 1,5 km (RWDZ, 3 lata): ${p.count}`, { size: 9.5, bold: true, gapAfter: 1 });
        if (p.items.length) L.table([{ label: 'Rodzaj', w: 12 }, { label: 'Zamierzenie', w: 44 }, { label: 'Data', w: 10 }, { label: 'Odl.', w: 8 }],
            p.items.map((it) => [TYPE_COLORS[it.type]?.[0] ?? it.type, `${(it.name || it.intent || '').slice(0, 160)}${it.place ? ` · ${it.place}` : ''}`, it.dateDecision || it.date, it.dist != null ? distText(it.dist) : '—']), { size: 7.6 });
    }
}

/** 19.40.0: strona modułu inwestycyjnego — parametry i miejsca weryfikacji dla typu inwestycji. */
function sectionModul(L, ctx) {
    const { r, options, base } = ctx;
    const type = options.investType;
    L.newPage();
    L.heading(`Moduł: ${INVEST_LABEL[type]}`, 40, `reguły ${RULES_VERSION}`);
    const net = (src) => r.uzbrojenie?.data?.networks?.find((n) => n.source === src);
    const netText = (n) => (r.uzbrojenie?.error ? 'KIUT nie odpowiedział' : !n ? 'nie sprawdzono' : n.error ? 'brak odpowiedzi KIUT' : n.insideCount ? 'przez teren' : n.count ? `≈ ${distText(n.minDist)}` : `brak w ${nf.format(r.uzbrojenie.data.bufferM)} m`);
    const res = r.otoczenie?.data?.residential;
    const resText = !res ? 'nie sprawdzono' : res.error ? 'brak bazy BDOT10k' : res.nearest == null ? 'brak w 1 km' : `${res.nearest === 0 ? 'w terenie' : `≈ ${distText(res.nearest)}`}; ${res.counts[1]} w 300 m; ${res.counts[2]} w 500 m`;
    const road = r.plan?.data?.bdot?.groups?.roads?.nearestM;
    const flood = r.powodz?.data;
    const floodText = !flood ? 'nie sprawdzono' : flood.found ? `${flood.share != null ? shareText({ insideCount: 1, share: flood.share }) : 'tak'}${flood.oszp ? ' — obszar szczególnego zagrożenia' : ''}` : (flood.warning || 'brak trafienia w sprawdzonych danych ISOK');
    const t = r.teren?.data; const g = r.gleby?.data;
    const rows = [];
    if (type === 'biometan') {
        rows.push(['Sieć gazowa (KIUT, ciśnienie nieznane)', netText(net('kiut_gas'))], ['Sieć elektroenergetyczna (KIUT)', netText(net('kiut_power'))], ['Wodociąg / kanalizacja', `${netText(net('kiut_water'))} / ${netText(net('kiut_sewer'))}`],
            ['Zabudowa mieszkaniowa', resText], ['Najbliższa droga (BDOT10k)', road != null ? `≈ ${distText(road)}` : 'brak bazy BDOT10k'], ['Zagrożenie powodziowe', floodText],
            ['Biogazownie KOWR', r.otoczenie?.data?.kowr && !r.otoczenie.data.kowr.error ? `${r.otoczenie.data.kowr.within10} w 10 km, ${r.otoczenie.data.kowr.within20} w 20 km` : 'nie sprawdzono'],
            ['Największy prostokąt', base.shape?.rect ? `${nf.format(base.shape.rect.a)} × ${nf.format(base.shape.rect.b)} m (${areaText(base.shape.rect.area)})` : '—']);
    } else if (type === 'pv') {
        rows.push(['Linia elektroenergetyczna (KIUT, napięcie nieznane)', netText(net('kiut_power'))], ['Teren', t ? `spadek śr. ${nf1.format(t.slopeMean ?? 0)}%, ekspozycja: ${t.aspect}` : 'nie sprawdzono'],
            ['Gleby', g ? `${Object.keys(g.classCounts ?? {}).length ? `klasy: ${Object.keys(g.classCounts).join(', ')}` : 'klasy: brak w EGiB'}; kompleksy: ${Object.entries(g.complexes ?? {}).map(([c, n]) => `${c} (${n})`).join(', ') || '—'}` : 'nie sprawdzono'],
            ['Las przy granicy', r.las?.data?.bdot && !r.las.data.bdot.error ? (r.las.data.bdot.count ? `≈ ${distText(r.las.data.bdot.minDist)}` : 'brak w 300 m') : 'nie sprawdzono'], ['Zagrożenie powodziowe', floodText],
            ['Inne inwestycje energetyczne (RWDZ, 1,5 km)', r.otoczenie?.data?.permits && !r.otoczenie.data.permits.error ? nf.format(r.otoczenie.data.permits.counts?.energia ?? 0) : 'nie sprawdzono'],
            ['Największy prostokąt', base.shape?.rect ? `${nf.format(base.shape.rect.a)} × ${nf.format(base.shape.rect.b)} m (${areaText(base.shape.rect.area)})` : '—']);
    } else {
        rows.push(['Najbliższa droga (BDOT10k)', road != null ? `≈ ${distText(road)}` : 'brak bazy BDOT10k'], ['Sieć elektroenergetyczna (KIUT)', netText(net('kiut_power'))], ['Sieć gazowa (KIUT)', netText(net('kiut_gas'))],
            ['Wodociąg / kanalizacja', `${netText(net('kiut_water'))} / ${netText(net('kiut_sewer'))}`], ['Zabudowa mieszkaniowa', resText], ['Zagrożenie powodziowe', floodText],
            ['Największy prostokąt', base.shape?.rect ? `${nf.format(base.shape.rect.a)} × ${nf.format(base.shape.rect.b)} m (${areaText(base.shape.rect.area)})` : '—']);
    }
    L.kv(rows, { labelW: 62, size: 8.8 });
    const links = type === 'biometan' ? [LINKS.psg, LINKS.kowr, LINKS.isok, LINKS.gdos] : type === 'pv' ? [LINKS.gdos, LINKS.isok, LINKS.geoportal] : [LINKS.isok, LINKS.gdos, LINKS.nid, LINKS.geoportal];
    L.para('Sprawdź u źródła', { size: 9.5, bold: true, gapAfter: 1 });
    for (const [label, url] of links) L.link(`${label}: ${url}`, url);
    L.note(type === 'biometan'
        ? 'Obecność sieci gazowej w KIUT nie oznacza możliwości wtłaczania biometanu. Chłonność sieci i warunki przyłączenia określa operator (PSG dla sieci dystrybucyjnej, Gaz-System dla przesyłowej).'
        : type === 'pv'
            ? 'Obecność linii w KIUT nie oznacza dostępnej mocy przyłączeniowej. O mocy rozstrzygają warunki przyłączenia wydane przez operatora sieci.'
            : 'Dostęp do drogi publicznej i warunki przyłączenia mediów potwierdzają zarządca drogi i gestorzy sieci.');
}

function sectionGleby(L, ctx) {
    const g = ctx.r.gleby;
    L.heading('Gleby i klasy', 24, 'GUGiK — mapa glebowo-rolnicza, EGiB');
    if (g?.error) { L.empty(`Nie udało się sprawdzić: ${g.error}`, 'warn'); return; }
    const d = g.data;
    const comp = Object.entries(d.complexes ?? {}).sort((a, b) => b[1] - a[1]);
    const cls = Object.entries(d.classCounts ?? {}).sort((a, b) => b[1] - a[1]);
    const rows = [];
    if (comp.length) rows.push(['Kompleksy przydatności (liczba punktów)', comp.map(([k, n]) => `${k}${KOMPLEKS_NAME[k] ? ` — ${KOMPLEKS_NAME[k]}` : ''}: ${n}`).join('; ')]);
    rows.push(['Klasy z ewidencji (liczba punktów)', cls.length ? cls.map(([k, n]) => `${k}: ${n}`).join('; ') : 'powiat nie udostępnia klasoużytków w usłudze krajowej']);
    if (d.soil[0]?.typ) rows.push(['Typ gleby (środek)', d.soil[0].typ]);
    L.kv(rows, { labelW: 52, size: 8.6 });
    L.note(`${d.points} punktów siatki w terenie.${d.sourceNote ? ` Mapa glebowa: ${d.sourceNote}.` : ''} Kompleks przydatności nie jest klasą bonitacyjną — klasy wiąże ewidencja gruntów (wypis z rejestru gruntów).${d.errors.length ? ` ${d.errors.join('; ')}.` : ''}`);
}

const KOMPLEKS_NAME = { 1: 'pszenny b. dobry', 2: 'pszenny dobry', 3: 'pszenny wadliwy', 4: 'żytni b. dobry', 5: 'żytni dobry', 6: 'żytni słaby', 7: 'żytni b. słaby', 8: 'zbożowo-pastewny mocny', 9: 'zbożowo-pastewny słaby', 10: 'pszenny górski', 11: 'zbożowy górski', 12: 'owsiano-ziemniaczany górski', 13: 'owsiano-pastewny górski', 14: 'orne pod użytki zielone', '1z': 'użytki zielone b. dobre i dobre', '2z': 'użytki zielone średnie', '3z': 'użytki zielone słabe' };

function sectionZrodla(L, ctx) {
    const { r, texts, fetchedAt, options } = ctx;
    const when = fetchedAt.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
    const has = (id) => options.sections.includes(id);
    const unknown = 'nie podaje usługa';
    const got = (key) => (r[key]?.error ? 'brak odpowiedzi' : when);
    // 19.40.0: osobno chwila pobrania i aktualność zbioru (gdy źródło ją podaje).
    const rows = [['Granica i dane działki', 'GUGiK — ULDK (EGiB powiatów)', when, 'bieżąca ewidencja powiatu']];
    if (has('pog') || has('mpzp')) {
        const act = (r.plan?.data?.layers?.pog?.matches ?? []).find((m) => m.kind === 'akt');
        rows.push(['Plan ogólny, MPZP', 'GUGiK — integracja planów, Rejestr Urbanistyczny', got('plan'), act?.attributes?.['Obowiązuje od'] ? (/opracowan|projekt/i.test(act.status ?? '') ? `projekt planu ogólnego, wersja z ${act.attributes['Obowiązuje od']}` : `plan ogólny obowiązuje od ${act.attributes['Obowiązuje od']}`) : unknown]);
    }
    if (has('przyroda')) rows.push(['Ochrona przyrody', 'GDOŚ — Natura 2000, formy ochrony', got('przyroda'), unknown]);
    if (has('powodz')) rows.push(['Zagrożenie powodziowe', 'Wody Polskie — ISOK (MZP/MRP)', got('powodz'), r.powodz?.data?.dataSince ? `mapy obowiązują od ${r.powodz.data.dataSince}` : unknown]);
    if (has('las')) rows.push(['Lasy', 'BDOT10k (GUGiK), Bank Danych o Lasach', got('las'), unknown]);
    if (has('inne')) rows.push(['Zabytki, złoża, wody', 'NID, PIG-PIB MIDAS, BDOT10k', got('inne'), unknown]);
    if (has('gleby')) rows.push(['Gleby i klasy', 'GUGiK — mapa glebowo-rolnicza, EGiB', got('gleby'), r.gleby?.data?.sourceNote ? String(r.gleby.data.sourceNote).slice(0, 90) : unknown]);
    if (has('uzbrojenie')) rows.push(['Uzbrojenie terenu', 'GUGiK — KIUT (GESUT powiatów)', got('uzbrojenie'), 'zależy od powiatu']);
    if (has('otoczenie')) {
        const o = r.otoczenie?.data;
        rows.push(['Zabudowa mieszkaniowa', 'BDOT10k — lokalna baza budynków', o?.residential && !o.residential.error ? when : 'brak bazy', o?.residential?.dataDate ? `baza z ${String(o.residential.dataDate).slice(0, 10)}` : unknown]);
        rows.push(['Biogazownie rolnicze', 'KOWR — rejestr wytwórców biogazu rolniczego', o?.kowr && !o.kowr.error ? when : 'brak odpowiedzi', o?.kowr?.date ? `rejestr z ${o.kowr.date}` : unknown]);
    }
    if (has('ceny')) rows.push(['Ceny transakcyjne', 'Rejestr Cen Nieruchomości — GUGiK', got('ceny'), r.ceny?.data?.from ? `transakcje od ${r.ceny.data.from}` : unknown]);
    if (has('budowy') || has('otoczenie')) rows.push(['Budowy i pozwolenia', 'GUNB — RWDZ (dane.gov.pl, zbiór 3467)', r.budowy?.error ? 'brak odpowiedzi' : when, r.budowy?.data?.dataDate || r.otoczenie?.data?.permits?.dataDate ? `dane z ${r.budowy?.data?.dataDate ?? r.otoczenie.data.permits.dataDate}` : unknown]);
    if (has('teren')) rows.push(['Wysokość terenu', 'GUGiK — NMT 1 m', got('teren'), unknown]);
    if (has('ewidencja')) rows.push(['Mapa ewidencyjna', 'GUGiK — Krajowa Integracja Ewidencji Gruntów', when, 'bieżąca ewidencja powiatu']);
    if (has('mapa') || has('ceny') || has('budowy')) rows.push(['Podkłady map', `${BASEMAP_LABEL[options.basemap]}; © autorzy OpenStreetMap`, when, unknown]);
    if (ctx.emptyNotes.length) {
        L.heading('Sprawdzono bez wyników', 12);
        L.para(`${ctx.emptyNotes.join('; ')}.`, { size: 8.6, color: '#33403a' });
    }
    const disclaimerH = L.measure(texts.disclaimer, 7.8, CW - 10) + 18;
    L.heading('Źródła danych i zastrzeżenia', rows.length * 5.6 + 10 + disclaimerH);
    L.table([{ label: 'Zakres', w: 20 }, { label: 'Źródło', w: 34 }, { label: 'Pobrano', w: 13 }, { label: 'Aktualność zbioru', w: 23 }], rows, { size: 7.4 });
    L.ensure(disclaimerH);
    L.doc.setFillColor(L.accentSoft); L.doc.roundedRect(M, L.y, CW, disclaimerH, 2, 2, 'F');
    L.y += 3.5;
    L.para('Zastrzeżenia', { size: 8.6, bold: true, x: M + 5, width: CW - 10, gapAfter: 0.8 });
    L.para(`${DISCLAIMER_LINE} ${texts.disclaimer}`, { size: 7.8, color: '#33403a', x: M + 5, width: CW - 10 });
    L.para(`Wnioski: reguły ${RULES_VERSION} (typ inwestycji: ${INVEST_LABEL[options.investType ?? 'ogolny']}). Odległości i udziały liczone na obrazach usług mają dokładność rozmiaru piksela podaną w sekcjach.`, { size: 7.4, color: MUTED, x: M + 5, width: CW - 10 });
    L.y += 3;
}

const RENDER = { dzialka: sectionDzialka, ksztalt: sectionKsztalt, ewidencja: sectionEwidencja, pog: sectionPog, mpzp: sectionMpzp, ceny: sectionCeny, budowy: sectionBudowy, odleglosci: sectionOdleglosci, uzbrojenie: sectionUzbrojenie, otoczenie: sectionOtoczenie, teren: sectionTeren, teren3d: sectionTeren3d, powodz: sectionPowodz, przyroda: sectionPrzyroda, las: sectionLas, inne: sectionInne, gleby: sectionGleby, zrodla: sectionZrodla };

// ---- mapy ------------------------------------------------------------------

function priceColor(value, sorted) {
    if (!Number.isFinite(value) || !sorted.length) return '#9aa3a0';
    const rank = sorted.findIndex((v) => v >= value);
    const q = (rank < 0 ? sorted.length - 1 : rank) / Math.max(1, sorted.length - 1);
    return PRICE_COLORS[Math.min(PRICE_COLORS.length - 1, Math.floor(q * PRICE_COLORS.length))];
}

async function renderMaps(base, options, r, { signal, progress }) {
    const maps = {};
    const has = (id) => options.sections.includes(id);
    const label = base.parcel.parcel;
    const context = options.basemap === 'orto' ? 'standard' : options.basemap;
    const jobs = [];
    const multi = base.parcels.length > 1;
    if (has('mapa')) {
        const lines = has('ksztalt') && base.shape?.rect ? [{ coords: base.shape.rect.corners, color: '#ffd400', width: 2.5, dash: [10, 6] }] : [];
        jobs.push(['mapa', 'mapa działki', { basemap: options.basemap, label: multi ? null : label, aspect: 82 / 120, padRatio: 0.18, minSpanM: 120, lines }]);
        jobs.push(['polozenie', 'mapa położenia', { basemap: 'standard', aspect: 82 / 58, cssWidth: 520, minSpanM: 2400, padRatio: 2.5, marker: true }]);
    }
    if (has('ewidencja')) jobs.push(['ewidencja', 'mapa ewidencyjna', { basemap: 'standard', overlays: ['kieg'], aspect: 0.52, minSpanM: 160, padRatio: 0.25, maxSpanM: 900 }]);
    if (has('pog') && r.plan?.data?.layers?.pog?.matches?.length) jobs.push(['pog', 'mapa planu ogólnego', { basemap: 'standard', overlays: ['pog'], aspect: 0.5, minSpanM: 320, padRatio: 0.6 }]);
    if (has('ceny') && r.ceny?.data?.items?.length) {
        const sorted = r.ceny.data.items.filter((i) => i.inStats).map((i) => i.perM2).filter(Number.isFinite).sort((a, b) => a - b);
        jobs.push(['ceny', 'mapa transakcji', { basemap: context, aspect: 0.56, radius: options.radius, center2180: base.center, points: r.ceny.data.items.filter((i) => Number.isFinite(i.x)).map((i) => ({ x: i.x, y: i.y, color: i.inStats ? priceColor(i.perM2, sorted) : '#9aa3a0', size: 7 })) }]);
    }
    if (has('budowy') && r.budowy?.data?.items?.length) {
        jobs.push(['budowy', 'mapa budów', { basemap: context, aspect: 0.56, radius: options.radius, center2180: base.center, points: r.budowy.data.items.filter((i) => Number.isFinite(i.x)).map((i) => ({ x: i.x, y: i.y, color: TYPE_COLORS[i.type]?.[1] ?? '#9ca3af', size: 7 })) }]);
    }
    if (has('uzbrojenie') && r.uzbrojenie?.data?.networks?.some((n) => n.count)) jobs.push(['uzbrojenie', 'mapa uzbrojenia', { basemap: 'standard', overlays: ['kiut'], aspect: 0.62, minSpanM: 140, padRatio: 0.25, label }]);
    // 19.40.0: mapy tematyczne w skali terenu — środowisko i zagrożenia; zabudowa mieszkaniowa w pasmach odległości.
    if (has('przyroda') && r.przyroda?.data) jobs.push(['srodowisko', 'mapa środowiska i zagrożeń', { basemap: 'standard', overlays: ['forest', 'water', 'flood', 'natura', 'gdos'], aspect: 0.56, minSpanM: 600, padRatio: 0.45 }]);
    const res = r.otoczenie?.data?.residential;
    if (has('otoczenie') && res && !res.error) {
        const band = (d) => (d <= 100 ? '#b91c1c' : d <= 300 ? '#ea580c' : d <= 500 ? '#ca8a04' : '#6b7280');
        jobs.push(['otoczenie', 'mapa zabudowy mieszkaniowej', { basemap: 'standard', aspect: 0.56, minSpanM: 2300, padRatio: 0.9, points: res.points.map((p) => ({ x: p.x, y: p.y, color: band(p.d), size: 3.2, z: 1000 - Math.round(p.d) })) }]);
    }
    if (has('przyroda') && r.przyroda?.data?.dist && Object.values(r.przyroda.data.dist).some((d) => d && !d.error)) jobs.push(['przyroda', 'mapa ochrony przyrody', { basemap: 'standard', overlays: ['natura', 'gdos'], aspect: 0.6, radius: 3000, center2180: base.center, marker: true }]);
    // 19.41.0: dwa ujęcia modelu 3D z niewidocznej sceny Three.js (rysowanie synchroniczne — działa także w karcie w tle).
    if (has('teren3d') && r.teren3d?.data?.grid) {
        progress?.('Rysowanie: teren 3D…');
        try { maps.teren3d = await renderTerrain3D(base, r.teren3d.data.grid); }
        catch (error) { if (signal?.aborted) throw error; maps.teren3d = { error: error?.message || String(error) }; }
    }
    for (const [id, name, opts] of jobs) {
        progress?.(`Rysowanie: ${name}…`);
        try { maps[id] = await renderReportMap({ ...opts, geometry: base.geometry }, signal); }
        catch (error) { if (signal?.aborted) throw error; maps[id] = { error: error?.message || String(error) }; }
    }
    return maps;
}

async function renderTerrain3D(base, grid) {
    const mod = await import('../terrain3d/terrainScene.js');
    if (!mod.webglAvailable()) throw new Error('przeglądarka bez WebGL');
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-6000px;top:0;width:900px;height:560px;pointer-events:none;';
    document.body.appendChild(host);
    const outline = (base.geometry.type === 'Polygon' ? [base.geometry.coordinates] : base.geometry.coordinates).map((p) => ({ coords: p[0], color: 0xe8432e }));
    const exaggeration = mod.defaultExaggeration(grid);
    const scene = mod.createTerrainScene(host, grid, { exaggeration, colorMode: 'height', lines: outline, antialias: true, pixelRatio: 1 });
    try {
        const shot = () => { const c = scene.snapshot(1.6); const url = c.toDataURL('image/jpeg', 0.88); c.width = 0; c.height = 0; return url; };
        scene.resetView('sw', 0.74);
        const sw = shot();
        scene.setColorMode('slope'); scene.resetView('top', 0.86);
        const top = shot();
        return { sw, top, exaggeration, aspect: 560 / 900 };
    } finally { scene.dispose(); host.remove(); }
}

function sectionTeren3d(L, ctx) {
    const t = ctx.r.teren3d; const m = ctx.maps.teren3d;
    const w = (CW - 4) / 2; const hImg = w * (m?.aspect ?? 0.62);
    L.heading('Teren 3D', hImg + 40, t?.data ? t.data.grid.sourceLabel : 'NMT GUGiK');
    if (t?.error) { L.empty(`Model 3D niedostępny: ${t.error}`, 'warn'); return; }
    if (!m || m.error) { L.empty(`Nie udało się narysować modelu 3D${m?.error ? `: ${m.error}` : ''}.`, 'warn'); return; }
    const { grid, inside, minIn, maxIn } = t.data;
    L.ensure(hImg + 12);
    const y0 = L.y;
    for (const [i, [img, cap]] of [[m.sw, `Widok z południowego zachodu · kolory: wysokość · przewyższenie ${m.exaggeration}×`], [m.top, 'Widok z góry · kolory: klasy nachylenia (0–2 / 2–5 / 5–10 / 10–15 / > 15%)']].entries()) {
        const x = M + i * (w + 4);
        L.doc.saveGraphicsState(); L.doc.roundedRect(x, y0, w, hImg, 2, 2, null); L.doc.clip(); L.doc.discardPath();
        L.doc.addImage(img, 'JPEG', x, y0, w, hImg, undefined, 'FAST'); L.doc.restoreGraphicsState();
        L.doc.setDrawColor('#cfd6cf'); L.doc.setLineWidth(0.3); L.doc.roundedRect(x, y0, w, hImg, 2, 2, 'S');
        L.font(7.2, false, MUTED); L.doc.text(L.doc.splitTextToSize(cap, w)[0], x, y0 + hImg + 1.4, { baseline: 'top' });
    }
    L.y = y0 + hImg + 6.5;
    const ex = grid.extent; const steep = inside.n ? (inside.shares[2] + inside.shares[3] + inside.shares[4]) * 100 : null;
    L.kv([
        ['Wysokość w terenie', minIn != null ? `${nf1.format(minIn)}–${nf1.format(maxIn)} m n.p.m. (różnica ${nf1.format(maxIn - minIn)} m)` : '—'],
        ['Wysokość w obszarze modelu', `${nf1.format(grid.min)}–${nf1.format(grid.max)} m n.p.m.`],
        ['Spadek ponad 5% w terenie', steep != null ? `${nf.format(steep)}% powierzchni (${inside.n} węzłów siatki)` : '—'],
        ['Obszar i siatka', `${nf.format(ex[2] - ex[0])} × ${nf.format(ex[3] - ex[1])} m (teren + 50 m) · krok ${nf1.format(grid.step)} m`],
    ], { cols: 2, labelW: 38, size: 8.4 });
    L.note(`Źródło: ${grid.sourceLabel}; wysokości ${grid.datum}. Przewyższenie pionowe ${m.exaggeration}× tylko na rysunku — liczby podane są w rzeczywistej skali. Granica terenu na czerwono.`);
}

// ---- całość ----------------------------------------------------------------

function firstPage(L, ctx) {
    const { doc } = L; const { texts, header, options, base, presetName } = ctx;
    const p = base.parcel;
    const bandH = 36;
    doc.setFillColor(L.meta.color); doc.rect(0, 0, PAGE_W, bandH, 'F');
    // logo w białym polu po prawej
    let right = PAGE_W - M;
    if (header.logo) {
        try {
            const props = doc.getImageProperties(header.logo);
            const ratio = props.width / props.height;
            let h = 14; let w = ratio * h;
            if (w > 46) { w = 46; h = w / ratio; }
            const bx = PAGE_W - M - w - 6; const by = (bandH - h) / 2 - 3;
            doc.setFillColor('#ffffff'); doc.roundedRect(bx, by, w + 6, h + 6, 2, 2, 'F');
            doc.addImage(header.logo, header.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', bx + 3, by + 3, w, h, undefined, 'FAST');
            right = bx - 5;
        } catch { right = PAGE_W - M; }
    }
    const light = tint(L.meta.color, 0.75);
    L.font(8, true, light);
    doc.text((header.name || texts.brand).toUpperCase(), M, 9, { baseline: 'top', maxWidth: right - M });
    L.font(8, false, light);
    doc.text(`${texts.title} · ${dateFmt(ctx.fetchedAt)}`, right, 9, { baseline: 'top', align: 'right' });
    const multi = base.parcels.length > 1;
    L.font(21, true, '#ffffff');
    doc.text(multi ? `Teren inwestycji — ${base.parcels.length} działki` : `Działka ${p.parcel}`, M, 14.5, { baseline: 'top', maxWidth: right - M });
    L.font(10, false, '#ffffff');
    doc.text([multi ? `${base.parcels.map((x) => x.parcel).slice(0, 6).join(', ')}${base.parcels.length > 6 ? '…' : ''}` : null, `obręb ${p.region}`, p.commune, p.county].filter(Boolean).join(' · '), M, 25.5, { baseline: 'top', maxWidth: right - M });
    // pasek parametrów pod nagłówkiem
    const meta = [`Typ inwestycji: ${INVEST_LABEL[options.investType ?? 'ogolny']}`, `szablon: ${presetName}`, `promień ${options.radius} m`, `reguły ${RULES_VERSION}`];
    if (options.note) meta.push(`dla: ${options.note}`);
    if (header.contact) meta.push(header.contact);
    L.font(7.8, false, MUTED);
    doc.text(doc.splitTextToSize(meta.join('  ·  '), CW)[0], M, bandH + 4, { baseline: 'top' });
    L.y = bandH + 10;
    decisionCard(L, ctx);
}

/** 19.40.0: karta decyzyjna — parametry, ograniczenia i ryzyka, sprawy do weryfikacji. */
function decisionCard(L, ctx) {
    L.font(11.5, true, INK); L.doc.text('Karta decyzyjna', M, L.y, { baseline: 'top' }); L.y += 6.5;
    L.paramTable(decisionParameters(ctx));
    const risks = ctx.findings.filter((f) => f.kind === 'ryzyko' || f.kind === 'fakt');
    const verify = ctx.findings.filter((f) => f.kind === 'weryfikacja');
    L.ensure(16);
    L.font(11, true, INK); L.doc.text('Ograniczenia i ryzyka', M, L.y + 1, { baseline: 'top' }); L.y += 7;
    if (risks.length) L.findings(risks, { groupBySev: true });
    else L.empty('Reguły nie wskazały ograniczeń w sprawdzonych danych. To nie potwierdza braku ograniczeń — patrz „Do weryfikacji” i zakres źródeł.', 'muted');
    L.ensure(16);
    L.font(11, true, INK); L.doc.text('Do weryfikacji', M, L.y + 2, { baseline: 'top' }); L.y += 8;
    if (verify.length) L.findings(verify);
    else L.empty('Brak spraw do weryfikacji wskazanych przez reguły.', 'muted');
    L.ensure(10);
    L.doc.setFillColor(L.accentSoft); L.doc.roundedRect(M, L.y + 1, CW, 8, 1.6, 1.6, 'F');
    L.font(8.4, true, INK); L.doc.text(DISCLAIMER_LINE, M + 4, L.y + 3.3, { baseline: 'top', maxWidth: CW - 8 });
    L.y += 11;
}

/**
 * Tworzy raport. options: { sections, radius, years, basemap, priceKind, note }.
 * Zwraca { blob, filename, pages, warnings }.
 */
export async function generateParcelReport(parcel, options, config, header, { signal, progress, presetName = 'Własny' } = {}) {
    progress?.('Przygotowanie…', 0);
    const [jsPDF, fonts] = await Promise.all([loadLibrary(), loadFonts()]);
    // 19.40.0: teren z kilku działek (options.parcels; pierwsza = działka główna).
    const base = terrainContext(options.parcels?.length ? options.parcels : [parcel]);
    const { results: r, fetchedAt } = await collectReportData(base, options, { signal, progress });
    const maps = await renderMaps(base, options, r, { signal, progress });
    if (signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
    progress?.('Składanie PDF…');
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    for (const f of fonts) { doc.addFileToVFS(f.name, f.binary); doc.addFont(f.name, 'Inter', f.style); }
    const texts = config.texts;
    const multi = base.parcels.length > 1;
    const meta = { color: texts.color, brand: texts.brand, title: texts.title, parcelId: parcel.id, parcelTitle: multi ? `Teren: ${base.parcels.length} działki · obręb ${parcel.region} · ${parcel.commune ?? ''}` : `Działka ${parcel.parcel} · obręb ${parcel.region} · ${parcel.commune ?? ''}` };
    doc.setProperties({ title: `${texts.title} ${parcel.id}`, subject: `Działka ${parcel.id}`, creator: `${texts.brand} — raport działki`, author: header.name || texts.brand });
    const L = new Layout(doc, meta);
    // 19.38.0: legenda stref POG z usługi GUGiK (obraz obok mapy).
    let pogLegend = null;
    if (maps.pog && !maps.pog.error) {
        const legendScope = requestScope(15000, signal);
        try {
            const blob = await fetch('./api/wms_legend.php?source=pog_zones&layer=strefaPlanistyczna', { signal: legendScope.signal }).then((res) => (res.ok && /^image\//.test(res.headers.get('content-type') || '') ? res.blob() : null));
            if (blob) {
                const dataUrl = await new Promise((resolve) => { const fr = new FileReader(); fr.onerror = () => resolve(null); fr.onload = () => resolve(String(fr.result)); fr.readAsDataURL(blob); });
                const bitmap = await createImageBitmap(blob);
                pogLegend = { dataUrl, w: bitmap.width, h: bitmap.height }; bitmap.close?.();
            }
        } catch { pogLegend = null; } finally { legendScope.dispose(); }
        if (signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
    }
    const ctx = { base, r, maps, options, texts, header, fetchedAt, presetName, pogLegend, emptyNotes: [] };
    ctx.findings = evaluateRules({ base, r, options, rules: config.rules });
    firstPage(L, ctx);
    for (const id of options.sections) {
        if (id === 'zrodla' && options.investType && options.investType !== 'ogolny') sectionModul(L, ctx);
        const render = RENDER[id];
        if (render) render(L, ctx);
    }
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
        doc.setPage(i);
        L.font(7, false, MUTED);
        doc.text(`${header.name ? `${header.name} · ` : ''}${texts.brand} · ${texts.footer} · reguły ${RULES_VERSION}`, M, PAGE_H - 9.5, { baseline: 'top', maxWidth: CW - 30 });
        L.font(7, true, INK);
        doc.text(`${i} / ${pages}`, PAGE_W - M, PAGE_H - 9.5, { baseline: 'top', align: 'right' });
    }
    const warnings = Object.entries(r).filter(([, v]) => v.error || v.data?.warning).map(([k, v]) => `${k}: ${v.error || v.data.warning}`)
        .concat(Object.entries(maps).filter(([, v]) => v.error || v.warning).map(([k, v]) => `mapa ${k}: ${v.error || v.warning}`));
    const blob = doc.output('blob');
    const filename = `raport-${multi ? 'terenu' : 'dzialki'}-${String(parcel.id).replace(/[^\w.-]+/g, '_')}${multi ? `-${base.parcels.length}dz` : ''}-${fetchedAt.toISOString().slice(0, 10)}.pdf`;
    return { blob, filename, pages, warnings, findings: ctx.findings.length };
}
