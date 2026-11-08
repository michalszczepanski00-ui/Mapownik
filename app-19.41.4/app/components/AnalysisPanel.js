import { createElement as h, useId, useState } from 'react';
import { Building2, Eye, EyeOff, Layers3, LoaderCircle, RotateCw, ScanSearch, Search, Trash2 } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { selectRightOverlayOffset, useAppSelector } from '../../store/index.js';
import { Button, KeyValue, Message, NumberField, PanelMinimized, PanelShell, Section, SelectField, Tabs, tabPanelProps } from '../ui/index.js';
import { screeningCategory, screeningQuality, summarizeScreening, QUALITY_LABELS } from '../../analysis/screeningQuality.js';
import { formatNumber, t, tn } from '../../i18n/index.js';
import { formatArea as formatUnitArea, formatLength } from '../../core/units.js';

const EMPTY = Object.freeze({
    sources: [], operations: [], sourceId: null, operationId: null, operationParams: {}, operationProgress: null, areaMode: 'viewport', marginMeters: 0, limit: 1200,
    selectingBox: false, customExtent: null, selectedObjectId: null, selectedObjectName: null,
    busy: false, error: null, lastResult: null, previewVisible: true, previewCount: 0, previewSourceCount: 0, previewLimited: false, previewSimplificationTolerance: 0, resultVisible: true, resultCount: 0, selectedFeature: null,
    screeningBusy: false, screeningError: null, screeningRadiusMeters: 2000, screeningLimit: 5000, screeningResults: [], screeningUpdatedAt: null,
});
const pl = formatNumber;
const findOperation = (snapshot, id) => snapshot.operations.find((operation) => operation.id === id) ?? null;

function formatExtent(extent) {
    if (!Array.isArray(extent) || extent.length !== 4) return t('analysis.extent.none');
    const width = Math.max(0, Number(extent[2]) - Number(extent[0]));
    const height = Math.max(0, Number(extent[3]) - Number(extent[1]));
    return `${Math.round(width).toLocaleString('pl-PL')} × ${Math.round(height).toLocaleString('pl-PL')} m`;
}
function formatArea(value) {
    const n = Number(value);
    return !Number.isFinite(n) || n <= 0 ? '—' : formatUnitArea(n);
}
function scalar(value) {
    if (value == null || value === '') return '—';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
function detailRows(feature) {
    const p = feature?.properties ?? {};
    return [
        [t('analysis.feature.type'), feature?.categoryLabel ?? '—'],
        [t('analysis.feature.area'), formatArea(feature?.areaSqm)],
        [t('analysis.feature.functionDetail'), scalar(p.functionDetail ?? p.function)],
        [t('analysis.feature.functionGeneral'), scalar(p.functionGeneral)],
        [t('analysis.feature.floors'), scalar(p.floors)],
        [t('analysis.feature.status'), scalar(p.existence)],
        [t('analysis.feature.name'), scalar(p.name)],
        [t('analysis.feature.id'), feature?.id ?? '—'],
    ];
}
function progressLabel(snapshot) {
    if (!snapshot.busy) return null;
    const progress = snapshot.operationProgress;
    const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
    const operation = findOperation(snapshot, snapshot.operationId);
    if (progress && operation?.progress) return operation.progress(percent);
    return t('analysis.progress.fetch');
}
function screeningValue(row, radius) {
    if (row.code === 'CANCELLED') return 'Nie sprawdzono';
    if (row.status === 'error') return t('analysis.screening.error');
    if (screeningQuality(row) === 'incomplete') return t('analysis.screening.incomplete');
    if (row.approximate) return row.featureCount ? t('analysis.screening.sampledHit') : t('analysis.screening.undecided');
    if (row.status === 'inconclusive') return t('analysis.screening.incomplete');
    if (row.nearestDistanceMeters == null) return t('analysis.screening.none', { radius: pl(radius) });
    return row.collision ? t('analysis.screening.collision') : formatLength(row.nearestDistanceMeters);
}
/** 18.12.2: podsumowanie screeningu nad listą źródeł. */
function ScreeningSummary({ snapshot }) {
    const rows = snapshot.screeningResults ?? [];
    if (!rows.length || snapshot.screeningBusy || !snapshot.screeningUpdatedAt) return null;
    const radius = snapshot.screeningContext?.radius ?? snapshot.screeningRadiusMeters;
    const decided = rows.filter((row) => row.status === 'ready');
    const summary = summarizeScreening(rows);
    const collisions = summary.collision;
    const within = summary.within;
    const clear = summary.clear;
    const unknown = summary.unknown + summary.unavailable;
    const building = decided.find((row) => screeningQuality(row) === 'precise' && /budyn/i.test(row.title));
    const items = [
        building && [t('analysis.summary.nearestBuilding'), building.nearestDistanceMeters == null ? t('analysis.summary.noneWithin', { radius: formatLength(radius) }) : formatLength(building.nearestDistanceMeters), building.nearestDistanceMeters == null ? 'ok' : 'warning'],
        [t('analysis.summary.collisions'), String(collisions), collisions ? 'danger' : 'ok'],
        [t('analysis.summary.within', { radius: formatLength(radius) }), String(within), within ? 'warning' : 'ok'],
        [t('analysis.summary.clear'), String(clear), clear ? 'ok' : 'muted'],
        summary.sampledHit ? ['Trafienia przybliżone', String(summary.sampledHit), 'warning'] : null,
        unknown ? [t('analysis.summary.unknown'), String(unknown), 'muted'] : null,
    ].filter(Boolean);
    return h('section', { className: 'screening-summary', 'aria-label': t('analysis.summary.title') },
        items.map(([label, value, tone]) => h('div', { key: label, className: `screening-summary-item screening-summary-item--${tone}` }, h('span', null, label), h('strong', null, value))));
}
const screeningFailed = (snapshot) => (snapshot.screeningResults ?? []).filter((row) => row.status === 'error' && row.code !== 'CANCELLED').length;
function screeningNote(row) {
    // 18.12.1: krótki powód; techniczny tekst serwera zostaje w podpowiedzi.
    if (row.code === 'CANCELLED') return 'Nie sprawdzono — pobieranie zatrzymane.';
    if (row.status === 'error') return row.code === 'BDOT_STORE_UNAVAILABLE' ? t('analysis.screening.storeMissing') : t('analysis.screening.sourceDown');
    if (row.metadata?.incomplete) return t('analysis.incompleteCoverage');
    if (row.approximate) {
        const failed = row.metadata?.failedSamples ? t('analysis.screening.failedSamples', { count: row.metadata.failedSamples }) : '';
        const spacing = row.metadata?.sampleSpacingMeters;
        return t('analysis.screening.sampled', { hits: row.featureCount, samples: row.metadata?.sampleCount ?? '?' }) + failed + (spacing ? t('analysis.screening.spacing', { x: Math.round(spacing[0]), y: Math.round(spacing[1]) }) : '');
    }
    // 18.12.0: przy obciętej liście (najbliższe najpierw) liczba w promieniu to dolne oszacowanie.
    const count = row.countLimited ? t('analysis.screening.countLimited', { count: pl(row.inRadiusCount || 0) }) : pl(row.inRadiusCount || 0);
    return t('analysis.screening.inRadius', { count }) + (row.metadata?.truncated && !row.metadata?.nearestReliable ? t('analysis.screening.truncated') : '');
}

function ScreeningTargetHelp() {
    const tools = useService('tools');
    const parcels = useService('parcels');
    const identify = useServiceSnapshot('identify', EMPTY_IDENTIFY_SNAPSHOT);
    const parcel = identify?.parcel?.wkt ? identify.parcel : null;
    // 19.28.0: działka z karty jest celem od razu (przycisk „Sprawdź otoczenie działki …” poniżej) — tu tylko „wskaż inną”.
    return h('div', { className: 'screening-target-help' },
        h(Button, { variant: 'secondary', size: 'sm', onClick: () => void tools?.activate('core.parcel.pick') }, parcel ? t('analysis.screening.pickParcel') : t('identify.pickOnMap')),
        h('small', null, t('analysis.screening.pickHint')));
}
const EMPTY_IDENTIFY_SNAPSHOT = Object.freeze({ parcel: null });

/** Zakładka „Screening działki” — wszystkie źródła screeningowe naraz wokół zaznaczonej działki. */
function ScreeningTab({ manager, snapshot }) {
    const parcels = useService('parcels');
    const identify = useServiceSnapshot('identify', EMPTY_IDENTIFY_SNAPSHOT);
    // 19.28.0: bez zaznaczonego obiektu, ale z działką w karcie — sprawdzamy tę działkę (dodawana do projektu przy starcie).
    const cardParcel = !snapshot.selectedObjectId && identify?.parcel?.wkt ? identify.parcel : null;
    const cardName = cardParcel ? (cardParcel.parcel || cardParcel.id) : '';
    const run = () => {
        if (!cardParcel) { void manager?.runParcelScreening(); return; }
        try { parcels?.addParcel(cardParcel); } catch (error) { console.warn('[analizy → działka z karty]', error); return; }
        window.setTimeout(() => void manager?.runParcelScreening(), 0);
    };
    // Bez tytułu sekcji — nazwę trybu podaje zakładka nad nią.
    return h(Section, { className: 'analysis-section screening-section', ariaLabel: t('analysis.tab.screening') },
        h('p', { id: 'analysis-screening-reason', className: 'analysis-hint' }, snapshot.selectedObjectName ? t('analysis.screening.target', { name: snapshot.selectedObjectName }) : cardParcel ? t('analysis.screening.fromCard', { name: cardName }) : t('analysis.screening.pick')),
        // 18.12.3: bez zaznaczonej działki — od razu droga, jak ją wskazać.
        !snapshot.selectedObjectId && h(ScreeningTargetHelp, { manager }),
        h(NumberField, { label: t('analysis.screening.radius'), value: snapshot.screeningRadiusMeters, min: 100, max: 10000, step: 100, unit: 'm', disabled: snapshot.screeningBusy, ariaLabel: t('analysis.screening.radius.aria'), onChange: (value) => manager?.setScreeningRadius(value) }),
        // 19.23.0: limit dotyczy budynków z magazynu BDOT10k — bez takiego źródła pole jest zbędne.
        snapshot.sources.some((source) => source.kind === 'precise') && h(NumberField, { label: t('analysis.screening.limit'), value: snapshot.screeningLimit ?? 5000, min: 500, max: 20000, step: 500, title: t('analysis.screening.limit.hint'), disabled: snapshot.screeningBusy, onChange: (value) => manager?.setScreeningLimit(value) }),
        // 18.12.2: anulowanie przez użytkownika to informacja, nie awaria.
        snapshot.screeningError && h(Message, { tone: snapshot.screeningError === t('analysis.screening.cancelled') ? 'info' : 'danger' }, snapshot.screeningError),
        h('div', { className: 'analysis-run-row' },
            h(Button, { variant: 'primary', className: 'analysis-run-button', icon: snapshot.screeningBusy ? h(LoaderCircle, { size: 15, className: 'is-spinning' }) : h(ScanSearch, { size: 15 }), disabled: !manager || snapshot.screeningBusy || snapshot.busy || (!snapshot.selectedObjectId && !cardParcel), 'aria-describedby': 'analysis-screening-reason', title: snapshot.selectedObjectId || cardParcel ? undefined : t('analysis.screening.pick'), onClick: run },
                snapshot.screeningBusy
                    ? (snapshot.screeningProgress ? t('analysis.screening.runningProgress', { done: snapshot.screeningProgress.done, total: snapshot.screeningProgress.total }) : t('analysis.screening.running'))
                    : cardParcel ? t('analysis.screening.runFor', { name: cardName }) : t('analysis.screening.run')),
            snapshot.screeningBusy && h(Button, { variant: 'ghost', className: 'analysis-cancel-button', onClick: () => manager?.cancelScreening() }, t('analysis.screening.cancel'))),
        h(ScreeningSummary, { snapshot }),
        !snapshot.screeningBusy && snapshot.screeningResults?.some((row) => row.code === 'CANCELLED') && h(Button, { size: 'sm', onClick: () => void manager?.retryScreeningFailed() }, 'Ponów niesprawdzone źródła'),
        // 18.12.1: zbiorczy komunikat zamiast tego samego błędu w każdym wierszu.
        screeningFailed(snapshot) >= 2 && !snapshot.screeningBusy && h(Message, { tone: 'warning', className: 'screening-sources-down', role: 'status' },
            h('span', null, tn('analysis.screening.sourcesDown', screeningFailed(snapshot))),
            h(Button, { size: 'sm', variant: 'secondary', icon: h(RotateCw, { size: 13 }), onClick: () => void manager?.retryScreeningFailed() }, t('analysis.screening.retryFailed'))),
        snapshot.screeningResults?.length > 0 && h('div', { className: 'screening-results' },
            snapshot.screeningResults.map((row) => h('button', {
                key: row.sourceId,
                type: 'button',
                className: `screening-row screening-row--${row.status}${row.collision ? ' is-collision' : ''}`,
                disabled: row.status !== 'ready',
                onClick: () => manager?.showScreeningResult(row.sourceId),
                title: row.status === 'error' ? undefined : t('analysis.screening.show'),
            },
                h('span', { className: 'screening-row-title' }, row.title),
                h('strong', null, screeningValue(row, snapshot.screeningContext?.radius ?? snapshot.screeningRadiusMeters)),
                h('span', { className: `data-quality is-${screeningQuality(row)}` }, QUALITY_LABELS[screeningQuality(row)]),
                h('small', null, screeningNote(row))))),
        snapshot.screeningUpdatedAt && h('p', { className: 'analysis-hint screening-note' }, t('analysis.screening.disclaimer')));
}

function ResultSection({ manager, snapshot }) {
    const last = snapshot.lastResult;
    // 18.2: tytuł, wiersze, ostrzeżenia i podpisy przycisków daje deklaracja
    // operacji (analysis/operations/) — panel nie zna operacji z nazwy.
    const operation = findOperation(snapshot, last.operationId);
    const texts = operation?.texts ?? {};
    const warnings = [
        last.testData && t('analysis.result.testData'),
        last.metadata?.incomplete && t('analysis.incompleteCoverage'),
        last.truncated && (texts.truncated ?? t('analysis.result.truncated')),
        last.metadata?.sampled && t('analysis.result.sampled', { samples: last.metadata.sampleCount, failed: last.metadata.failedSamples }),
        ...(operation?.warnings?.(last) ?? []),
        last.preview?.limited && t('analysis.result.previewLimited', { rendered: pl(last.preview.renderedCount), total: pl(last.preview.sourceCount) })
            + (Number(last.preview.simplifyTolerance ?? 0) > 0 ? t('analysis.result.simplified', { tolerance: last.preview.simplifyTolerance }) : '')
            + t('analysis.result.fullGeometry'),
        last.resultPreview?.limited && t('analysis.result.resultLimited', { rendered: pl(last.resultPreview.renderedCount), total: pl(last.resultPreview.sourceCount) }),
    ].filter(Boolean);
    const meta = [
        // 18.12.2: zamiast wersji magazynu i stanu pamięci podręcznej — data danych.
        last.metadata?.dataGeneratedAt && t('analysis.result.store', { version: String(last.metadata.dataGeneratedAt).slice(0, 10) }),
    ].filter(Boolean);
    const producesResultLayer = Boolean(operation?.producesResultLayer);
    const hasResultLayer = producesResultLayer && snapshot.resultCount > 0;
    const savable = (producesResultLayer ? snapshot.resultCount : last.featureCount) > 0;
    return h(Section, { className: 'analysis-result', icon: h(Layers3, { size: 15 }), title: texts.resultTitle ?? t('analysis.result.preview') },
        h(KeyValue, {
            className: 'analysis-result-grid',
            rows: [
                [t('analysis.result.objects'), pl(last.featureCount)],
                ...(operation?.summary?.(last) ?? []),
                [t('analysis.result.area'), last.extentLabel],
                [t('analysis.result.source'), last.sourceTitle],
            ],
        }),
        warnings.map((text) => h(Message, { key: text, tone: 'warning', className: 'analysis-result-test' }, text)),
        meta.map((text) => h('div', { key: text, className: 'analysis-source-meta' }, text)),
        h('div', { className: 'analysis-preview-actions' },
            h(Button, { variant: 'secondary', size: 'sm', icon: snapshot.previewVisible ? h(EyeOff, { size: 14 }) : h(Eye, { size: 14 }), onClick: () => manager?.setPreviewVisible(!snapshot.previewVisible) }, snapshot.previewVisible ? t('analysis.result.hideData') : t('analysis.result.showData')),
            hasResultLayer && h(Button, { variant: 'secondary', size: 'sm', icon: snapshot.resultVisible ? h(EyeOff, { size: 14 }) : h(Eye, { size: 14 }), onClick: () => manager?.setResultVisible(!snapshot.resultVisible) },
                snapshot.resultVisible ? (texts.hideLayer ?? t('analysis.result.hideResult')) : (texts.showLayer ?? t('analysis.result.showResult'))),
            h(Button, { variant: 'ghost', size: 'sm', icon: h(Trash2, { size: 14 }), onClick: () => manager?.clearPreview() }, t('analysis.result.clear'))),
        hasResultLayer && h(Button, { variant: 'secondary', className: 'analysis-focus-button', onClick: () => manager?.focusAnalysisResult() }, texts.focus ?? t('analysis.result.focusAll')),
        last.objectId
            ? h(Button, { variant: 'secondary', className: 'analysis-focus-button', onClick: () => manager?.focusLastResult() }, t('analysis.result.focusSaved'))
            : savable && h(Button, {
                variant: 'primary', className: 'analysis-focus-button', disabled: Boolean(last.truncated),
                title: last.truncated ? t('analysis.result.saveBlocked.hint') : undefined,
                onClick: () => manager?.saveLastResultAsObject(),
            }, last.truncated ? t('analysis.result.saveBlocked') : (texts.save ?? t('analysis.result.saveSet'))),
        snapshot.previewCount > 0 && h('p', { className: 'analysis-hint' }, t('analysis.result.clickHint')));
}

/** Parametr operacji z deklaracji (liczba z jednostką albo lista z opisem wybranej opcji). */
function OperationParam({ operation, param, value, disabled, manager }) {
    const set = (next) => manager?.setOperationParam(operation.id, param.id, next);
    if (param.type === 'select') {
        const chosen = (param.options ?? []).find((option) => option.value === value);
        return h('div', { className: 'analysis-param' },
            h(SelectField, { label: param.label, ariaLabel: param.ariaLabel, value: value ?? param.default, disabled, options: param.options ?? [], onChange: set }),
            chosen?.description && h('p', { className: 'analysis-hint' }, chosen.description));
    }
    return h(NumberField, { label: param.label, ariaLabel: param.ariaLabel, value: value ?? param.default, min: param.min, max: param.max, step: param.step ?? 1, unit: param.unit ?? null, disabled, onChange: set });
}

/** Zakładka „Analiza źródła” — jedno źródło, obszar, operacja i wynik. */
function ManualTab({ manager, snapshot }) {
    const selectedSource = snapshot.sources.find((source) => source.id === snapshot.sourceId) ?? null;
    const selectedOperation = findOperation(snapshot, snapshot.operationId);
    const params = snapshot.operationParams?.[snapshot.operationId] ?? {};
    const targetHint = snapshot.areaMode === 'selected'
        ? (snapshot.selectedObjectName ? t('analysis.area.object', { name: snapshot.selectedObjectName }) : t('analysis.area.noObject'))
        : snapshot.areaMode === 'box' ? t('analysis.area.box', { extent: formatExtent(snapshot.customExtent) }) : t('analysis.area.viewportHint');
    const sourceOptions = [
        ...snapshot.sources.filter((source) => source.kind !== 'screening').map((source) => ({ value: source.id, label: source.title, group: t('analysis.source.group.precise') })),
        ...snapshot.sources.filter((source) => source.kind === 'screening').map((source) => ({ value: source.id, label: source.title, group: t('analysis.source.group.screening') })),
    ];
    return h('div', { className: 'analysis-manual' },
        // 18.12.2: trzy kroki zamiast formularza — co sprawdzić, gdzie, co zrobić.
        h(Section, { className: 'analysis-section analysis-section--manual analysis-step', title: t('analysis.step.what') },
            h(SelectField, { ariaLabel: t('analysis.source.aria'), value: snapshot.sourceId ?? '', disabled: !manager || snapshot.busy, options: sourceOptions, onChange: (value) => manager?.setSourceId(value) }),
            h('p', { className: `analysis-hint${selectedSource?.testData ? ' is-warning' : ''}` }, selectedSource?.description || t('analysis.source.hint'))),
        h(Section, { className: 'analysis-section analysis-step', title: t('analysis.step.where') },
            h(SelectField, {
                ariaLabel: t('analysis.area.aria'), value: snapshot.areaMode, disabled: snapshot.busy || snapshot.selectingBox, onChange: (value) => manager?.setAreaMode(value),
                options: [
                    { value: 'viewport', label: t('analysis.area.viewport') },
                    { value: 'selected', label: t('analysis.area.selected') },
                    { value: 'box', label: t('analysis.area.boxOption') },
                ],
            }),
            h('div', { className: 'analysis-target-row' },
                h('span', { className: snapshot.areaMode === 'selected' && !snapshot.selectedObjectId ? 'is-warning' : '' }, targetHint),
                snapshot.areaMode === 'box' && h(Button, { variant: 'secondary', size: 'sm', disabled: snapshot.busy, onClick: () => manager?.selectBox() },
                    snapshot.selectingBox ? t('analysis.area.selecting') : snapshot.customExtent ? t('analysis.area.changeBox') : t('analysis.area.pickBox'))),
            ),
        h(Section, { className: 'analysis-section analysis-step', title: t('analysis.step.how') },
            h(SelectField, {
                ariaLabel: t('analysis.operation.aria'), value: snapshot.operationId, disabled: snapshot.busy, onChange: (value) => manager?.setOperationId(value),
                options: snapshot.operations.map((operation) => ({ value: operation.id, label: operation.title, disabled: selectedSource?.kind === 'screening' && Boolean(operation.requiresFullGeometry) })),
            }),
            selectedOperation?.description && h('p', { className: 'analysis-hint' }, selectedOperation.description),
            (selectedOperation?.params?.length > 0 || selectedOperation?.hint) && h('div', { className: 'analysis-operation-params' },
                (selectedOperation.params ?? []).map((param) => h(OperationParam, { key: param.id, operation: selectedOperation, param, value: params[param.id], disabled: snapshot.busy, manager })),
                selectedOperation.hint && h('p', { className: 'analysis-hint' }, selectedOperation.hint)),
            h('details', { className: 'analysis-advanced' },
                h('summary', null, t('analysis.advanced')),
                h(NumberField, { label: t('analysis.area.margin'), value: snapshot.marginMeters, min: 0, max: 50000, step: 50, unit: 'm', disabled: snapshot.busy, ariaLabel: t('analysis.area.margin.aria'), onChange: (value) => manager?.setMarginMeters(value) }),
                h(NumberField, { label: t('analysis.limit'), value: snapshot.limit, min: 1, max: 20000, step: 100, disabled: snapshot.busy, ariaLabel: t('analysis.limit.aria'), onChange: (value) => manager?.setLimit(value) }))),
        snapshot.error && h(Message, { tone: 'danger' }, snapshot.error),
        h('div', { className: 'analysis-run-row' },
            h(Button, { variant: 'primary', className: 'analysis-run-button', icon: snapshot.busy ? h(LoaderCircle, { size: 15, className: 'is-spinning' }) : h(Search, { size: 15 }), disabled: !manager || snapshot.busy || snapshot.screeningBusy || snapshot.selectingBox, onClick: () => void manager?.run() },
                snapshot.busy ? progressLabel(snapshot) : (selectedOperation?.texts?.run ?? t('analysis.run.preview'))),
            snapshot.busy && h(Button, { variant: 'ghost', className: 'analysis-cancel-button', onClick: () => manager?.cancelRun() }, t('analysis.cancel'))),
        snapshot.lastResult && h(ResultSection, { manager, snapshot }),
        snapshot.selectedFeature && h(Section, { className: 'analysis-building-card', icon: h(Building2, { size: 15 }), title: t('analysis.feature.title') },
            h(KeyValue, { className: 'analysis-building-grid', rows: detailRows(snapshot.selectedFeature) }),
            h('div', { className: 'analysis-preview-actions' },
                h(Button, { variant: 'secondary', size: 'sm', onClick: () => manager?.focusSelectedFeature() }, t('analysis.feature.focus')),
                h(Button, { variant: 'ghost', size: 'sm', onClick: () => manager?.clearSelectedFeature() }, t('analysis.feature.deselect')))));
}

export function AnalysisPanel() {
    const manager = useService('analysis');
    const snapshot = useServiceSnapshot('analysis', EMPTY);
    const { open, collapsed, docked, restore: onRestore } = usePanel('analysis');
    const panelMode = snapshot.panelMode ?? 'screening';
    const setPanelMode = (value) => manager?.setPanelMode(value);
    const tabsId = useId();
    // Odpięty panel jest zakotwiczony do prawej krawędzi obszaru mapy
    // i ustępuje odpiętym Obiektom — odsunięcie liczy selektor, nie JSX.
    const rightOffset = useAppSelector(selectRightOverlayOffset);
    if (!open) return null;
    const style = docked ? undefined : { right: rightOffset };
    if (collapsed && !docked) {
        return h(PanelMinimized, { className: 'analysis-panel panel-minimized--analysis', title: t('panel.analysis.title'), icon: h(ScanSearch, { size: 18 }), style, onRestore });
    }
    const screening = panelMode === 'screening';
    return h(PanelShell, {
        className: 'analysis-panel',
        label: t('analysis.panelLabel'),
        docked,
        style,
        icon: h(ScanSearch, { size: 16 }),
        title: t('panel.analysis.title'),
        subtitle: screening ? t('analysis.subtitle.screening') : t('analysis.subtitle.manual'),
        actions: h(PanelHeaderActions, { id: 'analysis' }),
        footer: t('analysis.footer'),
    },
        h(Tabs, {
            className: 'analysis-mode-tabs', label: t('analysis.modeLabel'), value: panelMode, onChange: setPanelMode, idBase: tabsId,
            items: [{ value: 'screening', label: t('analysis.tab.screening') }, { value: 'manual', label: t('analysis.tab.manual') }],
        }),
        h('div', { className: 'analysis-panel-body', ...tabPanelProps(tabsId, panelMode) },
            screening ? h(ScreeningTab, { manager, snapshot }) : h(ManualTab, { manager, snapshot })));
}
