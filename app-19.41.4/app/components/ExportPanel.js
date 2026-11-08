import { appDialogs } from '../../core/index.js';
import { createElement as h, Fragment, useEffect, useState } from 'react';
import { Download, FileJson, ImageDown, Link2, LoaderCircle, Upload } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { selectRightOverlayOffset, useAppSelector } from '../../store/index.js';
import { Button, CheckboxField, FileButton, Message, NumberField, PanelShell, RangeField, Section, SelectField, TextField } from '../ui/index.js';
import { t } from '../../i18n/index.js';
import { exportScreenPng } from '../../export/screenExport.js';
import { reportDialog } from './ReportPdfDialog.js';

/**
 * 19.35.0 — „Obraz jak na ekranie”: PNG składany w przeglądarce (podkłady wektorowe, rzeźba, narzędzia, obiekty —
 * dokładnie to, co widać). Eksport z serwera (niżej) zostaje do dużych formatów i kafli ZIP.
 */
const SCREEN_PREFS = 'msportal:screen-export:v1';
const exportAdvancedMemory = { open: false };
function readScreenPrefs() { try { const v = JSON.parse(localStorage.getItem(SCREEN_PREFS) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
/** 19.36.0: raport działki PDF — dla działki z karty (kliknięcie na mapie albo wyszukiwarka). */
const NO_IDENTIFY = Object.freeze({ open: false });
function ParcelReportSection() {
    const identify = useServiceSnapshot('identify', NO_IDENTIFY);
    const tools = useService('tools');
    const parcel = identify?.parcel?.wkt ? identify.parcel : null;
    return h(Section, { className: 'export-section export-section--report', icon: h(Download, { size: 16, 'aria-hidden': true }), title: 'Raport działki PDF',
        subtitle: parcel ? `Działka ${parcel.parcel}, obręb ${parcel.region} · ${parcel.commune ?? ''}` : 'Szablony: karta działki, dla kupującego, inwestycyjny, planistyczny…' },
        parcel
            ? h(Button, { variant: 'secondary', className: 'export-quick-action', icon: h(Download, { size: 17 }), onClick: () => reportDialog.open(parcel) }, 'Raport PDF tej działki…')
            : h(Fragment, null,
                h('small', null, 'Kliknij działkę na mapie albo wyszukaj ją — raport dotyczy działki z karty.'),
                h(Button, { variant: 'ghost', size: 'sm', onClick: () => void tools?.activate('core.identify') }, 'Wskaż działkę na mapie')));
}
function ScreenExportSection() {
    const controller = useService('mapController');
    const prefs = readScreenPrefs();
    const [scale, setScale] = useState(String(prefs.scale ?? 2));
    const [footer, setFooter] = useState(prefs.footer ?? true);
    const [state, setState] = useState({ busy: false, phase: null, message: null, error: null });
    useEffect(() => { try { localStorage.setItem(SCREEN_PREFS, JSON.stringify({ scale: Number(scale), footer })); } catch { /* tryb prywatny */ } }, [scale, footer]);
    const run = async () => {
        if (!controller?.map || state.busy) return;
        setState({ busy: true, phase: 'render', message: null, error: null });
        try {
            const result = await exportScreenPng(controller.map, { scale: Number(scale), footer, onPhase: (phase) => setState((s) => ({ ...s, phase })) });
            const url = URL.createObjectURL(result.blob);
            const a = document.createElement('a');
            a.href = url; a.download = `mapownik-widok-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
            document.body.append(a); a.click(); a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 4000);
            setState({ busy: false, phase: null, error: null,
                message: `Zapisano ${result.width} × ${result.height} px (${(result.blob.size / 1048576).toFixed(1).replace('.', ',')} MB).${result.complete ? '' : ' Część kafli nie wczytała się w 45 s — sprawdź obraz.'}` });
        } catch (error) {
            setState({ busy: false, phase: null, message: null, error: error instanceof Error ? error.message : String(error) });
        }
    };
    return h(Section, { className: 'export-section export-section--screen', icon: h(ImageDown, { size: 16, 'aria-hidden': true }), title: 'Obraz jak na ekranie',
        subtitle: 'PNG z przeglądarki — dokładnie to, co widać na mapie' },
        h('div', { className: 'export-grid export-grid--2' },
            h(SelectField, { label: 'Jakość', value: scale, onChange: setScale, options: [{ value: '1', label: 'jak ekran (×1)' }, { value: '2', label: 'wysoka (×2)' }, { value: '3', label: 'do druku (×3)' }] }),
            h(CheckboxField, { label: 'Pasek: podziałka, skala, warstwy', checked: footer, onChange: setFooter })),
        h(Button, { variant: 'primary', className: 'export-quick-action', icon: h(Download, { size: 17 }), disabled: state.busy || !controller, onClick: run },
            state.busy ? (state.phase === 'compose' ? 'Składanie obrazu…' : 'Wczytywanie mapy w wyższej rozdzielczości…') : 'Pobierz PNG jak na ekranie'),
        state.message && h('small', { role: 'status' }, state.message),
        state.error && h(Message, { tone: 'danger' }, state.error));
}

const EMPTY_TRANSFER = Object.freeze({ busy: false, operation: null, message: null, error: null });
const EMPTY_RASTER = Object.freeze({ busy: false, operation: null, progress: null, message: null, error: null, incomplete: null, capabilities: { gd: false, zip: false, batch: false, safe_single_pixels: 0 }, selectedExtent: null });
const ACTION_ICONS = { download: Download, upload: Upload, link: Link2, file: FileJson, image: ImageDown };
const actionIcon = (name, size = 16) => (ACTION_ICONS[name] ? h(ACTION_ICONS[name], { size, 'aria-hidden': true }) : null);

function fmtBytes(bytes) {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pl-PL')} kB`;
    return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}
function planFor(manager, settings) {
    try { return { value: manager?.buildPlan?.(settings) ?? null, error: null }; }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : String(error) }; }
}
const initialValues = (format) => Object.fromEntries((format.options ?? []).map((option) => [option.id, option.default ?? (option.type === 'checkbox' ? false : '')]));

/**
 * Sekcja formatu z deklaracji funkcji (slot `exportFormats`, 18.1).
 * Panel nie zna formatów z nazwy: rysuje opcje i akcje z deklaracji,
 * a akcja dostaje kontekst funkcji, wartości opcji i (dla kind: 'file') plik.
 */
export function FormatSection({ format, ctx, busy, run }) {
    const [values, setValues] = useState(() => initialValues(format));
    const set = (id, value) => setValues((current) => ({ ...current, [id]: value }));
    const options = new Map((format.options ?? []).map((option) => [option.id, option]));
    const renderOption = (option) => {
        if (option.type === 'select') return h(SelectField, { key: option.id, label: option.label, value: values[option.id], options: option.options ?? [], disabled: busy, onChange: (value) => set(option.id, value) });
        if (option.type === 'checkbox') return h(CheckboxField, { key: option.id, label: option.label, checked: values[option.id], disabled: busy, onChange: (value) => set(option.id, value) });
        return h(TextField, { key: option.id, label: option.label, value: values[option.id], disabled: busy, onChange: (value) => set(option.id, value) });
    };
    const renderAction = (action) => {
        const common = { key: action.id, variant: action.variant ?? 'secondary', icon: actionIcon(action.icon), disabled: busy || !ctx, className: 'export-action' };
        return action.kind === 'file'
            ? h(FileButton, { ...common, accept: action.accept, onFile: (file) => run(() => action.run(ctx, values, file)) }, action.label)
            : h(Button, { ...common, onClick: () => run(() => action.run(ctx, values)) }, action.label);
    };
    // Opcja wskazana w `action.options` stoi tuż nad swoim przyciskiem
    // (np. „Układ eksportu” nad „Eksportuj GeoJSON”); pozostałe są na górze
    // sekcji. Kolejne akcje bez opcji tworzą jeden rząd przycisków.
    const bound = new Set(format.actions.flatMap((action) => action.options ?? []));
    const blocks = [...[...options.values()].filter((option) => !bound.has(option.id)).map(renderOption)];
    let row = [];
    const flush = () => { if (row.length) blocks.push(h('div', { key: `actions-${blocks.length}`, className: 'export-actions' }, row)); row = []; };
    for (const action of format.actions) {
        if (!action.options?.length) { row.push(renderAction(action)); continue; }
        flush();
        blocks.push(h('div', { key: `action-${action.id}`, className: 'export-action-group' },
            action.options.map((id) => options.get(id)).filter(Boolean).map(renderOption),
            renderAction(action)));
    }
    flush();
    return h(Section, { className: `export-section export-section--${format.id}`, icon: actionIcon(format.icon ?? 'file'), title: format.title, subtitle: format.subtitle }, blocks);
}

/** Sekcja „Obraz mapy” — eksport rastra z serwera (plan, limity, kompletność). */
function RasterSection({ rasterManager, raster, busy, run }) {
    const [basemapChoice, setBasemapChoice] = useState('same');
    const [areaMode, setAreaMode] = useState('current');
    const [resolution, setResolution] = useState('0.25');
    const [format, setFormat] = useState('png');
    const [quality, setQuality] = useState('90');
    const [rasterMode, setRasterMode] = useState('single');
    const [layout, setLayout] = useState('plain');
    const [title, setTitle] = useState(t('export.raster.defaultTitle'));
    const [includeObjects, setIncludeObjects] = useState(true);
    const [includeOverlays, setIncludeOverlays] = useState(true);
    const [georef, setGeoref] = useState(true);
    useServiceSnapshot('layers', null);
    const basemapSnapshot = useServiceSnapshot('basemaps', null);
    const substitute = rasterManager?.visibleExportLayers?.().basemapSubstitute;
    // 19.0.0: gdy widoczny podkład nie jest renderowany w eksporcie, domyślnie wybieramy Topografię —
    // wcześniej panel zaczynał od komunikatu „wymaga wyboru”, pustego pola i wyłączonego przycisku.
    const effectiveBasemapChoice = substitute && basemapChoice === 'same' ? 'topography' : basemapChoice;
    const exportLayers = rasterManager?.visibleExportLayers?.({ basemapChoice: effectiveBasemapChoice });
    useServiceSnapshot('analysis', null);
    const caps = raster.capabilities ?? EMPTY_RASTER.capabilities;
    const effectiveLayout = rasterMode === 'batch' ? 'plain' : layout;
    useAppSelector((state) => state.mapView);
    useServiceSnapshot('objects', null);
    const settings = { basemapChoice: effectiveBasemapChoice, areaMode, resolution: Number(resolution), format, quality: Number(quality), mode: rasterMode, layout: effectiveLayout, title, includeObjects, includeOverlays, georef: georef && effectiveLayout === 'plain' };
    const planned = planFor(rasterManager, settings);
    const plan = planned.value;
    // 18.11.1: szybki eksport sam dobiera rozdzielczość, gdy wybrana daje za duży obraz.
    let fitted = null;
    // 19.18.0: szybki eksport widoku co najmniej w rozdzielczości ekranu (drobniejsza z: ustawienia, ekran).
    const screenResolution = rasterManager?.screenResolution?.() ?? null;
    const quickBase = Number.isFinite(screenResolution) ? Math.min(Number(resolution), screenResolution) : Number(resolution);
    let quickFitted = null;
    try { fitted = rasterManager?.fitResolution?.({ areaMode, resolution: Number(resolution) }) ?? null; } catch { fitted = null; }
    try { quickFitted = rasterManager?.fitResolution?.({ areaMode: 'current', resolution: quickBase }) ?? null; } catch { quickFitted = null; }
    const quickResolution = quickFitted != null ? Math.max(quickBase, quickFitted) : quickBase;
    const quickSettings = { basemapChoice: effectiveBasemapChoice, areaMode: 'current', resolution: quickResolution, format: 'png', quality: 100, mode: 'single', layout: 'plain', title: '', includeObjects: true, includeOverlays: true, georef: false };
    let fittedMore = null;
    try { fittedMore = rasterManager?.fitResolution?.(settings) ?? null; } catch { fittedMore = null; }
    const quickPlanned = planFor(rasterManager, quickSettings);
    const quickPlan = quickPlanned.value;
    // 18.9.11: powód wyłączenia szybkiego eksportu widać przy przycisku, a nie dopiero w „Więcej opcji”.
    const quickReason = busy || !rasterManager ? null
        : !caps.gd ? t('export.raster.unavailable')
            : !quickPlan ? (quickPlanned.error ?? t('export.raster.noPlan'))
                : !quickPlan.singleSafe ? t('export.raster.zoomHint') : null;
    const canExport = !busy && rasterManager && caps.gd && plan && (rasterMode === 'single' ? plan.singleSafe : caps.batch && plan.batchSafe);
    return h(Section, { className: 'export-section export-section--map', icon: h(ImageDown, { size: 16, 'aria-hidden': true }), title: t('export.raster.title') },
        raster.busy && h(Button, { onClick: () => rasterManager?.cancelExport() }, t('request.cancel')),
        h(SelectField, {
            label: t('export.raster.area'), value: areaMode, disabled: busy, onChange: setAreaMode,
            options: [
                { value: 'current', label: t('export.raster.area.current') },
                { value: 'objects', label: t('export.raster.area.objects') },
                { value: 'selection', label: t('export.raster.area.selection') },
            ],
        }),
        areaMode === 'selection' && h(Button, { variant: 'secondary', icon: h(ImageDown, { size: 16 }), disabled: busy || !rasterManager, onClick: () => rasterManager.selectArea() },
            raster.selectedExtent ? t('export.raster.selectOther') : t('export.raster.select')),
        h(Button, { disabled: busy || !rasterManager || !caps.gd || !plan, onClick: () => run(() => rasterManager.previewRaster(settings)) }, 'Podgląd kadru'),
        raster.previewUrl && h('figure', { className: 'export-raster-preview' }, h('img', { src: raster.previewUrl, alt: 'Ostatnio wygenerowany podgląd kadru eksportu' }), h('figcaption', null, 'Ostatni podgląd · po zmianie kadru lub parametrów odśwież podgląd.')),
        h(Button, { variant: 'primary', className: 'export-quick-action', icon: h(Download, { size: 17 }), disabled: busy || !rasterManager || !caps.gd || !quickPlan || !quickPlan.singleSafe, title: quickReason ?? undefined, 'aria-describedby': quickReason ? 'export-quick-reason' : undefined, onClick: () => run(() => rasterManager.exportRaster(quickSettings)) }, t('export.raster.quick')),
        quickReason && h('small', { id: 'export-quick-reason', className: `disabled-reason${quickPlan && !quickPlan.singleSafe ? ' disabled-reason--hint' : ''}`, role: 'note' }, quickReason),
        !quickReason && quickResolution > quickBase && h('small', { className: 'export-auto-resolution', role: 'note' }, t('export.raster.autoResolution', { value: quickResolution.toLocaleString('pl-PL') })),
        h('details', { className: 'export-more' },
            h('summary', null, t('export.raster.more')),
            h('div', { className: 'export-more-body' },
                // 19.8.5: podkład i jego zamiennik w „Więcej opcji” — na wierzchu panelu techniczne
                // zdanie o zamienniku podkładu myliło (audyt UX A6). Domyślny wybór się nie zmienia.
                h(Message, { tone: 'info', role: 'note' }, h('strong', null, t('export.raster.basemapPrefix') + ' '), effectiveBasemapChoice === 'none' ? t('export.raster.basemapNone') : exportLayers?.basemapSubstitute?.to ?? exportLayers?.activeTitle ?? t('export.raster.basemapNone')),
                substitute && h(SelectField, { label: t('export.raster.basemapSubstitute', { name: substitute.from }), value: effectiveBasemapChoice, disabled: busy, onChange: setBasemapChoice, options: [{ value: 'topography', label: t('export.raster.basemapTopography', { name: substitute.to }) }, { value: 'none', label: t('export.raster.basemapNone') }] }),
                h(NumberField, { label: t('export.raster.resolution'), value: resolution, min: 0.02, max: 20, step: 0.01, unit: 'm/px', disabled: busy, onChange: setResolution }),
                plan && !plan.singleSafe && rasterMode === 'single' && fittedMore != null && fittedMore > Number(resolution)
                    && h(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: () => setResolution(String(fittedMore)) }, t('export.raster.fitResolution', { value: fittedMore.toLocaleString('pl-PL') })),
                h('div', { className: 'export-grid export-grid--2' },
                    h(SelectField, { label: t('export.raster.format'), value: format, disabled: busy, onChange: setFormat, options: [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }] }),
                    h(SelectField, { label: t('export.raster.mode'), value: rasterMode, disabled: busy, onChange: setRasterMode, options: [{ value: 'single', label: t('export.raster.mode.single') }, { value: 'batch', label: t('export.raster.mode.batch'), disabled: !caps.batch }] })),
                format === 'jpeg' && h(RangeField, { label: t('export.raster.quality'), value: quality, min: 60, max: 100, step: 5, disabled: busy, onChange: setQuality, format: (value) => `${value}%` }),
                h(SelectField, { label: t('export.raster.layout'), value: layout, disabled: busy || rasterMode === 'batch', onChange: setLayout, options: [{ value: 'plain', label: t('export.raster.layout.plain') }, { value: 'project', label: t('export.raster.layout.project') }] }),
                layout === 'project' && rasterMode === 'single' && h(TextField, { label: t('export.raster.mapTitle'), value: title, maxLength: 120, disabled: busy, onChange: setTitle }),
                h('div', { className: 'export-checks' },
                    h(CheckboxField, { label: t('export.raster.overlays'), checked: includeOverlays, disabled: busy, onChange: setIncludeOverlays }),
                    h(CheckboxField, { label: t('export.raster.objects'), checked: includeObjects, disabled: busy, onChange: setIncludeObjects }),
                    h(CheckboxField, { label: t('export.raster.worldFile'), title: layout !== 'plain' ? t('export.raster.worldFile.hint') : undefined, checked: georef && layout === 'plain', disabled: busy || layout !== 'plain', onChange: setGeoref })),
                plan
                    // role="note": plan zmienia się przy każdej zmianie opcji — nie ogłaszamy go czytnikowi.
                    ? h(Message, { tone: !plan.singleSafe && rasterMode === 'single' ? 'warning' : 'info', role: 'note', className: 'export-plan' },
                        h('strong', null, `${plan.width.toLocaleString('pl-PL')} × ${plan.height.toLocaleString('pl-PL')} px`),
                        h('span', null, `${plan.megapixels.toFixed(1)} MP · ~${fmtBytes(plan.estimatedBytes)} · ${plan.resolution.toLocaleString('pl-PL')} m/px`),
                        !plan.singleSafe && h('small', null, plan.batchSafe ? t('export.raster.useBatch', { tiles: plan.batchTiles }) : t('export.raster.tooLargeManual')))
                    : h(Message, { tone: 'warning', role: 'note', className: 'export-plan' }, planned.error ?? t('export.raster.noPlan')),
                !caps.gd && h(Message, { tone: 'warning' }, t('export.raster.unavailable')),
                h(Button, { variant: 'primary', icon: h(Download, { size: 16 }), disabled: !canExport, onClick: () => run(() => rasterManager.exportRaster(settings)) },
                    rasterMode === 'batch' ? t('export.raster.runBatch') : layout === 'project' ? t('export.raster.runProject') : t('export.raster.run')))));
}

export function ExportPanel() {
    const manager = useService('transfers');
    const rasterManager = useService('rasterExport');
    const snapshot = useServiceSnapshot('transfers', EMPTY_TRANSFER);
    const raster = useServiceSnapshot('rasterExport', EMPTY_RASTER);
    const { open, docked } = usePanel('export');
    const rightOffset = useAppSelector(selectRightOverlayOffset);
    const [localError, setLocalError] = useState(null);
    // 19.39.0: eksport z serwera (PL-1992, kadr, georeferencja) to opcja zaawansowana — zwinięta, dopóki ktoś jej nie otworzy.
    // Pamięć na czas sesji: wybór kadru na mapie odmontowuje panel, a po powrocie sekcja ma zostać otwarta.
    const [advancedOpen, setAdvancedOpenState] = useState(() => exportAdvancedMemory.open);
    const setAdvancedOpen = (value) => { exportAdvancedMemory.open = value; setAdvancedOpenState(value); };
    useEffect(() => { if (open) rasterManager?.ensureCapabilities?.(); }, [open, rasterManager]);
    if (!open) return null;
    const busy = snapshot.busy || raster.busy;
    const run = async (task) => {
        setLocalError(null);
        manager?.clearMessage?.();
        rasterManager?.clearMessage?.();
        try { await task(); }
        catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
    };
    const message = localError ?? raster.error ?? snapshot.error ?? raster.message ?? snapshot.message;
    const messageTone = localError || raster.error || snapshot.error ? 'danger' : 'success';
    const incompleteEntries = raster.incomplete?.missing_by_source ? Object.entries(raster.incomplete.missing_by_source) : [];
    const progress = raster.busy && raster.progress ? raster.progress : null;
    return h(PanelShell, {
        className: 'export-panel export-panel--compact export-panel--wide',
        label: t('export.panelLabel'),
        docked,
        style: docked ? undefined : { right: rightOffset },
        icon: h(Download, { size: 16 }),
        title: t('panel.export.title'),
        subtitle: t('panel.export.subtitle'),
        actions: h(PanelHeaderActions, { id: 'export' }),
        footer: t('export.footer'),
    },
        h('div', { className: 'export-panel-body' },
            snapshot.busy && h(Button, { onClick: () => manager?.cancelRequest() }, t('request.cancel')),
            h(ParcelReportSection, null),
            h(ScreenExportSection, null),
            h('details', { className: 'export-advanced', open: advancedOpen || raster.busy || Boolean(raster.incomplete), onToggle: (event) => setAdvancedOpen(event.currentTarget.open) },
                h('summary', null, 'Obraz z serwera — PL-1992, duże formaty', h('small', null, 'kadr · A4/A3 · georeferencja')),
                h(RasterSection, { rasterManager, raster, busy, run })),
            h('p', { className: 'export-project-hint' }, 'Plik projektu .mapownik i dane GIS: menu Projekt u góry.')),
        raster.incomplete && h(Message, { tone: 'warning', role: 'alert', className: 'export-incomplete' },
            h('strong', null, t('export.incomplete.title', { count: raster.incomplete.missing_count ?? 0 })),
            h('span', null, t('export.incomplete.message')),
            incompleteEntries.length > 0 && h('ul', null, incompleteEntries.slice(0, 8).map(([source, count]) => h('li', { key: source }, `${source}: ${count}`))),
            h('div', { className: 'export-incomplete-actions' },
                h(Button, { variant: 'primary', size: 'sm', disabled: busy, onClick: () => run(async () => rasterManager?.retryIncomplete?.()) }, t('export.incomplete.retry')),
                h(Button, { variant: 'secondary', size: 'sm', disabled: busy, onClick: () => run(async () => rasterManager?.exportIncompleteAnyway?.()) }, t('export.incomplete.anyway')),
                h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: () => rasterManager?.cancelIncomplete?.() }, t('export.incomplete.cancel')))),
        progress && h('div', { className: 'export-progress', role: 'progressbar', 'aria-label': t('export.progress.label'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Number.isFinite(progress.percent) ? progress.percent : undefined },
            h('div', { className: 'export-progress-track' }, h('div', { className: `export-progress-bar${Number.isFinite(progress.percent) ? '' : ' is-indeterminate'}`, style: Number.isFinite(progress.percent) ? { width: `${progress.percent}%` } : undefined })),
            h('small', null, progress.phase === 'render' ? t('export.progress.render') : Number.isFinite(progress.percent) ? t('export.progress.download', { percent: progress.percent }) : t('export.progress.downloadAny'))),
        busy && h('div', { className: 'export-status', role: 'status' }, h(LoaderCircle, { size: 15, className: 'is-spinning' }), raster.operation ?? snapshot.operation ?? t('export.busy')),
        message && h(Message, { tone: messageTone, className: `export-message export-message--${messageTone === 'danger' ? 'error' : 'success'}` }, message));
}
