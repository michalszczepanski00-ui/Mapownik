import { createElement as h, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { reportDialog } from './reportDialogStore.js';
// 19.46.0: stan okna i ReportPdfHost w reportDialogStore.js (to okno ładuje się przy pierwszym otwarciu).
export { reportDialog };
import { Download, FileJson, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button } from '../ui/index.js';
import { MAX_TERRAIN_PARCELS, REPORT_OPTIONS, REPORT_SECTIONS, estimatePages, loadReportConfig } from '../../report/reportConfig.js';
import { exportPresetsFile, importPresetsFile, loadReportPrefs, readLogoFile, saveReportPrefs } from '../../report/reportStore.js';

/**
 * 19.36.0 — okno „Raport działki PDF”: szablony, zakres, ustawienia, nagłówek i przenoszenie szablonów.
 * Otwierane przez reportDialog.open(parcel) — z karty działki albo z panelu Eksport.
 */
const sortSections = (ids) => REPORT_SECTIONS.map((s) => s.id).filter((id) => ids.includes(id));
const LOCKED = REPORT_SECTIONS.filter((s) => s.locked).map((s) => s.id);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const fromPreset = (p) => ({ presetId: p.id, sections: p.sections, radius: p.radius, years: p.years, basemap: p.basemap, priceKind: p.priceKind, investType: p.investType ?? 'ogolny', utilBuffer: p.utilBuffer ?? 60 });
const PARCEL_ID_RE = /^\d{6}_[1-9]\.\d{4}\.(?:AR_\d+\.)?\d+(?:\/\d+)?$/;

/** 19.40.0: działka po pełnym identyfikatorze (ULDK przez api/search.php) — do terenu z kilku działek. */
async function fetchParcelById(id) {
    const url = new URL('./api/search.php', window.location.href);
    url.searchParams.set('mode', 'parcel-id'); url.searchParams.set('q', id);
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Nie znaleziono działki ${id}.`);
    const item = payload.items?.[0];
    if (!item?.wkt) throw new Error(`Nie znaleziono działki ${id}.`);
    return { id: item.id, parcel: item.parcel, region: item.region, commune: item.commune, county: item.county, voivodeship: item.voivodeship, wkt: item.wkt };
}

function Pills({ label, options, value, onChange }) {
    return h('div', { className: 'rpdf-field', role: 'group', 'aria-label': label },
        h('span', { className: 'rpdf-label' }, label),
        h('div', { className: 'rpdf-pills' }, options.map(([v, text]) => h('button', {
            key: v, type: 'button', className: `rpdf-pill${value === v ? ' is-selected' : ''}`, 'aria-pressed': value === v, onClick: () => onChange(v),
        }, text))));
}

export function ReportPdfWindow({ parcel }) {
    const [config, setConfig] = useState(null);
    const [prefs, setPrefs] = useState(() => loadReportPrefs());
    const [selection, setSelection] = useState(null); // { presetId, sections, radius, years, basemap, priceKind }
    const [note, setNote] = useState('');
    const [run, setRun] = useState({ busy: false, message: '', error: '', result: null });
    const [saveName, setSaveName] = useState('');
    const [extra, setExtra] = useState([]); // 19.40.0: dodatkowe działki terenu inwestycji
    const [addIds, setAddIds] = useState('');
    const [adding, setAdding] = useState(false);
    const [info, setInfo] = useState('');
    const abortRef = useRef(null);
    const dialogRef = useRef(null);
    const importRef = useRef(null);
    const logoRef = useRef(null);

    useEffect(() => {
        let alive = true;
        loadReportConfig().then((cfg) => {
            if (!alive) return;
            setConfig(cfg);
            const all = [...cfg.presets, ...prefs.userPresets];
            const last = prefs.last;
            const preset = all.find((p) => p.id === last?.presetId) ?? all.find((p) => p.id === cfg.texts.defaultPreset) ?? all[0];
            if (last?.presetId === 'wlasny' && Array.isArray(last.sections)) {
                setSelection({ presetId: 'wlasny', sections: sortSections([...new Set([...last.sections, ...LOCKED])]), radius: last.radius ?? preset.radius, years: last.years ?? preset.years, basemap: last.basemap ?? preset.basemap, priceKind: last.priceKind ?? preset.priceKind, investType: last.investType ?? preset.investType ?? 'ogolny', utilBuffer: last.utilBuffer ?? preset.utilBuffer ?? 60 });
            } else setSelection(fromPreset(preset));
        });
        return () => { alive = false; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Okno modalne: reszta strony nieaktywna, Esc zamyka (gdy nie trwa tworzenie), fokus w oknie.
    useEffect(() => {
        const root = document.getElementById('root');
        const wasInert = root?.inert;
        if (root) root.inert = true;
        const previous = document.activeElement;
        dialogRef.current?.focus();
        const onKey = (event) => { if (event.key === 'Escape' && !abortRef.current) { event.preventDefault(); reportDialog.close(); } };
        document.addEventListener('keydown', onKey, true);
        return () => { document.removeEventListener('keydown', onKey, true); if (root) root.inert = wasInert; if (previous?.isConnected) previous.focus(); abortRef.current?.abort(); };
    }, []);

    const presets = useMemo(() => (config ? [...config.presets, ...prefs.userPresets] : []), [config, prefs.userPresets]);
    const header = { name: prefs.header?.name || config?.texts.header.name || '', contact: prefs.header?.contact || config?.texts.header.contact || '', logo: prefs.header?.logo || '' };
    const serverLogo = config?.texts.header.logo || '';

    if (!config || !selection) {
        return h('div', { className: 'dialog-backdrop rpdf-backdrop' }, h('div', { className: 'rpdf-window rpdf-window--loading', ref: dialogRef, tabIndex: -1, role: 'dialog', 'aria-label': 'Raport działki PDF' }, 'Wczytywanie ustawień raportu…'));
    }

    const sections = config.sections;
    const choosePreset = (p) => setSelection(fromPreset(p));
    const custom = (patch) => setSelection((s) => {
        const next = { ...s, ...patch };
        const base = presets.find((p) => p.id === s.presetId);
        const stillPreset = base && sameSet(next.sections, base.sections) && next.radius === base.radius && next.years === base.years && next.basemap === base.basemap && next.priceKind === base.priceKind && next.investType === (base.investType ?? 'ogolny') && next.utilBuffer === (base.utilBuffer ?? 60);
        return { ...next, presetId: stillPreset ? base.id : 'wlasny', basePresetId: stillPreset ? undefined : (s.basePresetId ?? s.presetId) };
    });
    const toggle = (id) => custom({ sections: sortSections(selection.sections.includes(id) ? selection.sections.filter((x) => x !== id) : [...selection.sections, id]) });
    const presetName = presets.find((p) => p.id === selection.presetId)?.name ?? 'Własny';
    const updateHeader = (patch) => { const next = { name: '', contact: '', logo: '', ...(prefs.header ?? {}), ...patch }; saveReportPrefs({ header: next }); setPrefs((p) => ({ ...p, header: next })); };
    const setUserPresets = (list) => { saveReportPrefs({ userPresets: list }); setPrefs((p) => ({ ...p, userPresets: list })); };

    const saveAsPreset = () => {
        const name = saveName.trim();
        if (!name) { setInfo('Wpisz nazwę szablonu.'); return; }
        const id = `moj-${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || Date.now()}`;
        const preset = { id, name: name.slice(0, 60), description: 'Mój szablon', sections: selection.sections, radius: selection.radius, years: selection.years, basemap: selection.basemap, priceKind: selection.priceKind, investType: selection.investType, utilBuffer: selection.utilBuffer, source: 'user' };
        setUserPresets([...prefs.userPresets.filter((p) => p.id !== id), preset]);
        setSelection((s) => ({ ...s, presetId: id }));
        setSaveName(''); setInfo(`Zapisano szablon „${preset.name}” w tej przeglądarce.`);
    };
    const removePreset = (p) => { setUserPresets(prefs.userPresets.filter((x) => x.id !== p.id)); if (selection.presetId === p.id) setSelection((s) => ({ ...s, presetId: 'wlasny' })); };
    const onImport = async (event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        try { const list = await importPresetsFile(file); const ids = new Set(list.map((p) => p.id)); setUserPresets([...prefs.userPresets.filter((p) => !ids.has(p.id)), ...list]); setInfo(`Zaimportowano ${list.length} ${list.length === 1 ? 'szablon' : 'szablony'}.`); }
        catch (error) { setInfo(error.message); }
    };
    const onLogo = async (event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        try { updateHeader({ logo: await readLogoFile(file) }); setInfo('Logo zapisane w tej przeglądarce.'); } catch (error) { setInfo(error.message); }
    };

    // 19.37.1: raport powstaje w tej karcie. Wcześniej „Otwórz PDF” od razu otwierało nową kartę — ta przechodziła
    // w tło, przeglądarka wstrzymywała rysowanie i mapy w raporcie wychodziły białe. Po utworzeniu: Otwórz / Pobierz.
    const generate = async () => {
        const controller = new AbortController(); abortRef.current = controller;
        if (run.result?.url) URL.revokeObjectURL(run.result.url);
        setRun({ busy: true, message: 'Przygotowanie…', error: '', result: null });
        saveReportPrefs({ last: { presetId: selection.presetId, sections: selection.sections, radius: selection.radius, years: selection.years, basemap: selection.basemap, priceKind: selection.priceKind, investType: selection.investType, utilBuffer: selection.utilBuffer } });
        try {
            let logo = header.logo;
            if (!logo && serverLogo) logo = await fetch(serverLogo).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); }) : '')).catch(() => '');
            const { generateParcelReport } = await import('../../report/reportPdf.js');
            const result = await generateParcelReport(parcel, { ...selection, note: note.trim(), parcels: [parcel, ...extra] }, config, { ...header, logo }, {
                signal: controller.signal, presetName, progress: (message) => setRun((r) => ({ ...r, message })),
            });
            setRun({ busy: false, message: '', error: '', result: { ...result, url: URL.createObjectURL(result.blob) } });
        } catch (error) {
            setRun({ busy: false, message: '', error: error?.name === 'AbortError' ? 'Przerwano tworzenie raportu.' : (error?.message || String(error)), result: null });
        } finally { abortRef.current = null; }
    };
    const addParcels = async () => {
        const ids = [...new Set(addIds.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))];
        if (!ids.length) { setInfo('Wpisz identyfikator działki, np. 141201_1.0001.6509.'); return; }
        const bad = ids.filter((id) => !PARCEL_ID_RE.test(id));
        if (bad.length) { setInfo(`Nieprawidłowy identyfikator: ${bad.join(', ')} (pełny identyfikator, np. 141201_1.0001.6509).`); return; }
        const have = new Set([parcel.id, ...extra.map((p) => p.id)].map((x) => String(x).toUpperCase()));
        const todo = ids.filter((id) => !have.has(id)).slice(0, Math.max(0, MAX_TERRAIN_PARCELS - 1 - extra.length));
        if (!todo.length) { setInfo(have.size >= MAX_TERRAIN_PARCELS ? `Teren może mieć najwyżej ${MAX_TERRAIN_PARCELS} działek.` : 'Te działki są już w terenie.'); return; }
        setAdding(true); setInfo('');
        const added = []; const errors = [];
        for (const id of todo) { try { added.push(await fetchParcelById(id)); } catch (error) { errors.push(error.message); } }
        setExtra((list) => [...list, ...added]); setAdding(false);
        if (added.length) setAddIds('');
        setInfo([added.length ? `Dodano do terenu: ${added.map((p) => p.parcel).join(', ')}.` : '', errors.join(' ')].filter(Boolean).join(' '));
    };
    const download = () => { const a = document.createElement('a'); a.href = run.result.url; a.download = run.result.filename; document.body.appendChild(a); a.click(); a.remove(); };
    const openPdf = () => { window.open(run.result.url, '_blank', 'noopener'); };

    const groups = [];
    for (const s of sections) { let g = groups.find((x) => x.name === s.group); if (!g) { g = { name: s.group, items: [] }; groups.push(g); } g.items.push(s); }
    const place = [parcel.commune, parcel.region ? `obręb ${parcel.region}` : null, parcel.parcel ? `nr ${parcel.parcel}` : null].filter(Boolean).join(' · ');
    const pages = estimatePages(selection.sections) + (selection.investType !== 'ogolny' ? 1 : 0);

    return h('div', { className: 'dialog-backdrop rpdf-backdrop', onPointerDown: (e) => { if (e.target === e.currentTarget && !run.busy) reportDialog.close(); } },
        h('div', { className: 'rpdf-window', ref: dialogRef, tabIndex: -1, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rpdf-title' },
            h('header', { className: 'rpdf-head' },
                h('div', { className: 'rpdf-head-text' }, h('strong', { id: 'rpdf-title' }, 'Raport działki PDF'), h('span', null, `${parcel.id} · ${place}`)),
                h('button', { type: 'button', className: 'rpdf-close', 'aria-label': 'Zamknij', disabled: run.busy, onClick: () => reportDialog.close() }, h(X, { size: 18, 'aria-hidden': true }))),
            h('div', { className: 'rpdf-body' },
                h('div', { className: 'rpdf-main' },
                    h('section', { className: 'rpdf-section' },
                        h('div', { className: 'rpdf-section-head' }, h('strong', null, 'Teren inwestycji'), h('small', null, `działka z karty${extra.length ? ` + ${extra.length}` : ''} · do ${MAX_TERRAIN_PARCELS} działek`)),
                        h('div', { className: 'rpdf-terrain' },
                            [parcel, ...extra].map((p, i) => h('span', { key: p.id, className: 'rpdf-terrain-chip' }, h('span', null, `${p.parcel} · ${p.region}`),
                                i ? h('button', { type: 'button', 'aria-label': `Usuń działkę ${p.parcel} z terenu`, title: 'Usuń z terenu', disabled: run.busy, onClick: () => setExtra((list) => list.filter((x) => x.id !== p.id)) }, h(X, { size: 12, 'aria-hidden': true })) : null))),
                        h('div', { className: 'rpdf-row rpdf-row--wrap' },
                            h('input', { type: 'text', className: 'rpdf-input', value: addIds, disabled: adding || run.busy, placeholder: 'Identyfikatory kolejnych działek, np. 321705_2.0062.454/14', 'aria-label': 'Identyfikatory działek do dodania do terenu', onChange: (e) => setAddIds(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); void addParcels(); } } }),
                            h(Button, { variant: 'secondary', size: 'sm', disabled: adding || run.busy, icon: h(Plus, { size: 14 }), onClick: () => void addParcels() }, adding ? 'Szukam…' : 'Dodaj do terenu')),
                        h('small', { className: 'rpdf-hint' }, 'Raport oceni cały teren: powierzchnię, kształt, ograniczenia i otoczenie wszystkich działek razem.')),
                    h('section', { className: 'rpdf-section' },
                        h('div', { className: 'rpdf-section-head' }, h('strong', null, 'Typ inwestycji'), h('small', null, 'dobiera reguły wniosków i stronę modułu')),
                        h('div', { className: 'rpdf-pills' }, REPORT_OPTIONS.investType.map(([v, text]) => h('button', { key: v, type: 'button', className: `rpdf-pill${selection.investType === v ? ' is-selected' : ''}`, 'aria-pressed': selection.investType === v, onClick: () => custom({ investType: v }) }, text)))),
                    h('section', { className: 'rpdf-section' },
                        h('div', { className: 'rpdf-section-head' }, h('strong', null, '1. Szablon'), h('small', null, 'zmiana zakresu tworzy szablon „Własny”')),
                        h('div', { className: 'rpdf-presets' },
                            presets.map((p) => h('div', { key: p.id, className: `rpdf-preset${selection.presetId === p.id ? ' is-selected' : ''}` },
                                h('button', { type: 'button', className: 'rpdf-preset-main', 'aria-pressed': selection.presetId === p.id, onClick: () => choosePreset(p) },
                                    h('span', { className: 'rpdf-preset-top' }, h('strong', null, p.name), h('small', null, `${estimatePages(p.sections)} str.`)),
                                    h('span', { className: 'rpdf-preset-desc' }, p.description || (p.source === 'user' ? 'Mój szablon' : ''))),
                                p.source === 'user' ? h('button', { type: 'button', className: 'rpdf-preset-remove', 'aria-label': `Usuń szablon ${p.name}`, title: 'Usuń szablon', onClick: () => removePreset(p) }, h(Trash2, { size: 14, 'aria-hidden': true })) : null)),
                            selection.presetId === 'wlasny' ? h('div', { className: 'rpdf-preset is-selected' }, h('div', { className: 'rpdf-preset-main' }, h('span', { className: 'rpdf-preset-top' }, h('strong', null, 'Własny'), h('small', null, `${pages} str.`)), h('span', { className: 'rpdf-preset-desc' }, 'Twój zakres — możesz go zapisać jako szablon niżej.'))) : null)),
                    h('section', { className: 'rpdf-section' },
                        h('div', { className: 'rpdf-section-head' }, h('strong', null, '2. Zakres raportu')),
                        h('div', { className: 'rpdf-groups' }, groups.map((g) => h('fieldset', { key: g.name, className: 'rpdf-group' },
                            h('legend', null, g.name),
                            g.items.map((s) => h('label', { key: s.id, className: 'rpdf-check' },
                                h('input', { type: 'checkbox', checked: selection.sections.includes(s.id), disabled: s.locked, onChange: () => toggle(s.id) }),
                                h('span', null, h('span', null, s.label), h('small', null, s.hint)))))))),
                    h('section', { className: 'rpdf-section' },
                        h('div', { className: 'rpdf-section-head' }, h('strong', null, '3. Ustawienia')),
                        h('div', { className: 'rpdf-settings' },
                            h(Pills, { label: 'Promień otoczenia (ceny, budowy)', options: REPORT_OPTIONS.radius, value: selection.radius, onChange: (v) => custom({ radius: v }) }),
                            h(Pills, { label: 'Okres (ceny i budowy)', options: REPORT_OPTIONS.years, value: selection.years, onChange: (v) => custom({ years: v }) }),
                            h(Pills, { label: 'Podkład mapy działki', options: REPORT_OPTIONS.basemap, value: selection.basemap, onChange: (v) => custom({ basemap: v }) }),
                            h(Pills, { label: 'Rodzaj cen', options: REPORT_OPTIONS.priceKind, value: selection.priceKind, onChange: (v) => custom({ priceKind: v }) }),
                            h(Pills, { label: 'Uzbrojenie — promień od granicy', options: REPORT_OPTIONS.utilBuffer, value: selection.utilBuffer, onChange: (v) => custom({ utilBuffer: v }) }),
                            h('label', { className: 'rpdf-field rpdf-field--wide' }, h('span', { className: 'rpdf-label' }, 'Dla kogo / notatka (opcjonalnie)'),
                                h('input', { type: 'text', className: 'rpdf-input', maxLength: 120, value: note, placeholder: 'np. oferta dla klienta z 3.11.2026', onChange: (e) => setNote(e.target.value) })))),
                    h('details', { className: 'rpdf-section rpdf-more' },
                        h('summary', null, 'Nagłówek raportu (nazwa biura, kontakt, logo)'),
                        h('div', { className: 'rpdf-settings' },
                            h('label', { className: 'rpdf-field' }, h('span', { className: 'rpdf-label' }, 'Nazwa w nagłówku'),
                                h('input', { type: 'text', className: 'rpdf-input', maxLength: 80, value: prefs.header?.name ?? '', placeholder: config.texts.header.name || 'np. Biuro Nieruchomości …', onChange: (e) => updateHeader({ name: e.target.value }) })),
                            h('label', { className: 'rpdf-field' }, h('span', { className: 'rpdf-label' }, 'Kontakt (telefon, e-mail, www)'),
                                h('input', { type: 'text', className: 'rpdf-input', maxLength: 160, value: prefs.header?.contact ?? '', placeholder: config.texts.header.contact || 'np. tel. 600 000 000 · www.example.pl', onChange: (e) => updateHeader({ contact: e.target.value }) })),
                            h('div', { className: 'rpdf-field rpdf-field--wide' }, h('span', { className: 'rpdf-label' }, 'Logo'),
                                h('div', { className: 'rpdf-row' },
                                    header.logo ? h('img', { src: header.logo, alt: 'Logo w nagłówku', className: 'rpdf-logo' }) : h('small', null, serverLogo ? 'Logo z konfiguracji serwera.' : 'Brak logo.'),
                                    h(Button, { variant: 'secondary', size: 'sm', onClick: () => logoRef.current?.click() , icon: h(Upload, { size: 14 }) }, header.logo ? 'Zmień' : 'Dodaj logo'),
                                    header.logo ? h(Button, { variant: 'ghost', size: 'sm', onClick: () => updateHeader({ logo: '' }) }, 'Usuń') : null,
                                    h('input', { ref: logoRef, type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onChange: onLogo }))),
                            h('small', { className: 'rpdf-hint rpdf-field--wide' }, 'Zapamiętane w tej przeglądarce. Dla wszystkich użytkowników ustaw nagłówek w pliku konfiguracja/raport-pdf.json na serwerze.'))),
                    h('details', { className: 'rpdf-section rpdf-more' },
                        h('summary', null, 'Moje szablony — zapis, eksport, import'),
                        h('div', { className: 'rpdf-row rpdf-row--wrap' },
                            h('input', { type: 'text', className: 'rpdf-input', maxLength: 60, value: saveName, placeholder: 'Nazwa nowego szablonu', 'aria-label': 'Nazwa nowego szablonu', onChange: (e) => setSaveName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saveAsPreset(); } } }),
                            h(Button, { variant: 'secondary', size: 'sm', onClick: saveAsPreset }, 'Zapisz bieżący zakres jako szablon')),
                        h('div', { className: 'rpdf-row rpdf-row--wrap' },
                            h(Button, { variant: 'ghost', size: 'sm', disabled: !prefs.userPresets.length, onClick: () => exportPresetsFile(prefs.userPresets) , icon: h(FileJson, { size: 14 }) }, 'Eksportuj moje szablony'),
                            h(Button, { variant: 'ghost', size: 'sm', onClick: () => importRef.current?.click() , icon: h(Upload, { size: 14 }) }, 'Importuj z pliku'),
                            h('input', { ref: importRef, type: 'file', accept: 'application/json,.json', hidden: true, onChange: onImport })),
                        h('small', { className: 'rpdf-hint' }, 'Wyeksportowany plik ma format konfiguracji serwera: jego listę „szablony” można wkleić do konfiguracja/raport-pdf.json, żeby szablony widzieli wszyscy.')),
                    info ? h('p', { className: 'rpdf-info', role: 'status' }, info) : null),
                h('aside', { className: 'rpdf-aside' },
                    h('strong', { className: 'rpdf-aside-title' }, 'Układ PDF'),
                    h('div', { className: 'rpdf-count' }, h('span', null, `≈ ${pages}`), h('small', null, `${pages === 1 ? 'strona' : pages < 5 ? 'strony' : 'stron'} A4 · ${presetName}`)),
                    h('ol', { className: 'rpdf-toc' }, sections.filter((s) => selection.sections.includes(s.id)).map((s) => h('li', { key: s.id }, s.label)), selection.investType !== 'ogolny' ? h('li', { key: 'modul' }, `Moduł: ${REPORT_OPTIONS.investType.find(([v]) => v === selection.investType)?.[1]}`) : null),
                    h('small', { className: 'rpdf-hint' }, 'Strona 1 to karta decyzyjna: parametry, ograniczenia i ryzyka, sprawy do weryfikacji. Dane są pobierane na bieżąco (ULDK, Rejestr Urbanistyczny, ISOK, GDOŚ, KIUT, NMT…). Tworzenie trwa zwykle 30–120 s.'),
                    run.busy ? h('p', { className: 'rpdf-progress', role: 'status' }, h('span', { className: 'rpdf-spinner', 'aria-hidden': true }), run.message) : null,
                    run.error ? h('p', { className: 'rpdf-error', role: 'alert' }, run.error) : null,
                    run.result ? h('p', { className: 'rpdf-done', role: 'status' }, `Gotowe: ${run.result.pages} ${run.result.pages === 1 ? 'strona' : run.result.pages < 5 ? 'strony' : 'stron'}.${run.result.warnings.length ? ` Bez części danych: ${run.result.warnings.length} ${run.result.warnings.length === 1 ? 'źródło nie odpowiedziało' : 'źródła nie odpowiedziały'} (opis w raporcie).` : ''}`) : null,
                    run.busy ? h('p', { className: 'rpdf-hint' }, 'Nie zamykaj tej karty do końca tworzenia — mapy rysują się w niej.') : null,
                    h('div', { className: 'rpdf-actions' },
                        run.busy
                            ? h(Button, { variant: 'secondary', onClick: () => abortRef.current?.abort() }, 'Przerwij')
                            : run.result
                                ? h(Fragment, null,
                                    h(Button, { variant: 'secondary', onClick: openPdf }, 'Otwórz'),
                                    h(Button, { variant: 'primary', icon: h(Download, { size: 16 }), onClick: download }, 'Pobierz'))
                                : h(Button, { variant: 'primary', icon: h(Download, { size: 16 }), onClick: () => void generate() }, 'Utwórz raport PDF')),
                    run.result && !run.busy ? h('button', { type: 'button', className: 'rpdf-again', onClick: () => void generate() }, 'Utwórz ponownie (po zmianie ustawień)') : null))));
}
