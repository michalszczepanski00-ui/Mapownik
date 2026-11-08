import { profileScale, profileIndexAtX, profilePointerX } from '../../terrain/profileChart.js';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useId } from 'react';
import { LoaderCircle } from 'lucide-react';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { t } from '../../i18n/index.js';
import { describeTerrainError } from '../../terrain/describeTerrainError.js';
import { Button, CheckboxField, Message, NumberField, PanelShell, RangeField, SelectField, Stats, Tabs, tabPanelProps } from '../ui/index.js';
import { SLOPE_COLORS } from '../../terrain/terrainSurface.js';
import { formatArea, formatLength } from '../../core/units.js';

// 18.12.2: błędy wyboru (np. „zaznacz działkę”) nie mają przycisku „Ponów” —
// ponowienie dałoby ten sam komunikat.
const VALIDATION_KEYS = ['terrain.zaznaczCoNajmniejJednaDzialke', 'terrain.wybierzCoNajmniejJednaDzialke', 'terrain.najpierwWskazProstokatNaMapie', 'terrain.wybraneObiektyNieSaDzialkami', 'terrain.profilWymagaGeometriiLiniowej'];
function TerrainError({ message, onRetry }) {
  const { text, details } = describeTerrainError(message);
  const retryable = !VALIDATION_KEYS.some((key) => t(key) === message);
  return _jsxs(Message, { tone: 'danger', className: 'terrain-profile-error', children: [
    _jsxs('div', { className: 'terrain-profile-error-body', children: [
      _jsx('span', { children: text }),
      details ? _jsxs('details', { className: 'terrain-profile-error-details', children: [_jsx('summary', { children: t('error.details') }), _jsx('code', { children: details })] }) : null,
    ] }),
    retryable ? _jsx(Button, { variant: 'secondary', size: 'sm', onClick: onRetry, children: t('error.retry') }) : null,
  ] });
}

const EMPTY_TERRAIN = Object.freeze({
  active: false, mode: null, view: 'line', drawing: false, busy: false, open: false,
  objectId: null, error: null, profile: null, hoverIndex: null,
  availableParcels: [], selectedParcelIds: [], areaAnalysis: null,
});

function fmt(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toLocaleString('pl-PL', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
}
const fmtDistance = (value) => formatLength(value);
const fmtArea = (value) => formatArea(value);
function slopeLabel(value) {
  if (!Number.isFinite(value)) return '—';
  return `${fmt(value, 2)}%`;
}

function ElevationProgress({ manager, snapshot }) {
  const progress = snapshot.progress;
  if (!progress) return null;
  if (!snapshot.busy && !snapshot.error && progress.received === progress.total) return null;
  const analysis = snapshot.view === 'area' ? snapshot.areaAnalysis : snapshot.profile;
  const noData = analysis?.points?.filter((point) => point.status === 'no_data').length ?? 0;
  const complete = progress.received === progress.total;
  const status = snapshot.busy ? (progress.retrying ? t('terrain.progress.retrying') : t('terrain.progress.loading'))
    : progress.canceled ? t('terrain.progress.canceled') : complete ? t('terrain.progress.complete')
      : progress.received === 0 ? t('terrain.progress.empty') : t('terrain.progress.partial');
  const diagnostics = analysis?.diagnostics ?? [];
  // 18.12.2: przy błędzie bez żadnych danych wystarczy jeden komunikat błędu —
  // wcześniej ten sam problem był opisany trzy razy (status, wyjaśnienie, błąd).
  if (!snapshot.busy && snapshot.error && progress.received === 0) return null;
  return _jsxs('div', { className: 'terrain-fetch-progress', children: [
    _jsxs('div', { className: 'terrain-fetch-status', role: 'status', children: [
      snapshot.busy && _jsx(LoaderCircle, { size: 15, className: 'is-spinning' }),
      _jsx('strong', { children: t('terrain.progress.count', { received: progress.received, total: progress.total }) }),
      _jsx('span', { children: status }),
      snapshot.busy ? _jsx(Button, { size: 'sm', variant: 'ghost', onClick: () => manager?.cancelLoading(), children: t('terrain.progress.cancel') })
        : !complete && !snapshot.error ? _jsx(Button, { size: 'sm', onClick: () => void manager?.retry(), children: t('terrain.progress.fill') }) : null,
    ] }),
    _jsx('progress', { value: progress.received, max: progress.total, 'aria-label': t('terrain.progress.label') }),
    progress.outage && !snapshot.error && _jsx('small', { children: t('terrain.progress.outage') }),
    !snapshot.busy && !complete && !snapshot.error && _jsx('small', { children: t('terrain.progress.missing', { count: progress.total - progress.received, noData }) }),
    diagnostics.length > 0 && _jsxs('details', { className: 'terrain-fetch-details', children: [
      _jsx('summary', { children: t('terrain.progress.details', { count: diagnostics.length }) }),
      ...diagnostics.slice(-6).map((item, index) => _jsx('div', { children: t('terrain.progress.batch', {
        received: item.received, total: item.samples, attempt: item.attempt, seconds: fmt(item.durationMs / 1000),
      }) + (item.error ? ` · ${item.error}` : '') }, index)),
    ] }),
  ] });
}

export function LineProfileView({ manager, snapshot }) {
  const profile = snapshot.profile;
  const stats = profile?.stats;
  const points = profile?.points ?? [];
  // 19.39.0: etykiety jako zwykły tekst nad wykresem (SVG rozciągany do szerokości panelu zniekształcał napisy
  // i rezerwował ok. 90 px marginesu po lewej) — w SVG zostają tylko linie i wypełnienie.
  const width = 720, height = 220, padding = { left: 4, right: 4, top: 14, bottom: 6 };
  const scale = profileScale(points, width, height, padding);
  const hovered = Number.isInteger(snapshot.hoverIndex) ? points[snapshot.hoverIndex] : null;
  const hoverPos = hovered && Number.isFinite(hovered.elevation) && scale ? scale.xy(hovered) : null;
  const onMove = (event) => {
    if (!points.length) return;
    const x = profilePointerX(event.currentTarget, event.clientX, event.clientY);
    manager?.setProfileHover(profileIndexAtX(points, x, width, padding));
  };
  return _jsxs('div', { className: 'terrain-profile-body', children: [
    profile && _jsx(Stats, { className: 'terrain-profile-stats', items: [
      { label: t('terrain.stat.length'), value: fmtDistance(stats?.lengthMeters) },
      { label: t('terrain.stat.min'), value: `${fmt(stats?.minElevation)} m` },
      { label: t('terrain.stat.max'), value: `${fmt(stats?.maxElevation)} m` },
      { label: t('terrain.stat.range'), value: `${fmt(stats?.elevationRange)} m` },
      { label: t('terrain.stat.avgSlope'), value: slopeLabel(stats?.averageSlopePercent) },
      { label: t('terrain.stat.maxSlope'), value: slopeLabel(stats?.maxSlopePercent) },
    ] }),
    profile && _jsxs('div', { className: 'terrain-profile-chart', children: [
      _jsxs('svg', { onPointerMove: onMove, onPointerLeave: () => manager?.setProfileHover(null), preserveAspectRatio: 'none', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': t('terrain.chart.label'), children: [
        _jsx('line', { x1: padding.left, y1: height - padding.bottom, x2: width - padding.right, y2: height - padding.bottom, className: 'terrain-axis', vectorEffect: 'non-scaling-stroke' }),
        scale?.path && _jsx('path', { d: scale.fillPath, className: 'terrain-profile-fill' }),
        scale?.path && _jsx('path', { d: scale.path, className: 'terrain-profile-line', vectorEffect: 'non-scaling-stroke' }),
        hoverPos && _jsx('line', { x1: hoverPos.x, y1: padding.top, x2: hoverPos.x, y2: height - padding.bottom, className: 'terrain-hover-line', vectorEffect: 'non-scaling-stroke' })
      ] }),
      scale && _jsx('span', { className: 'terrain-ylabel terrain-ylabel--max', children: `${fmt(scale.maxH)} m` }),
      scale && _jsx('span', { className: 'terrain-ylabel terrain-ylabel--min', children: `${fmt(scale.minH)} m` }),
      hoverPos && _jsx('span', { className: 'terrain-hover-dot', style: { left: `${(hoverPos.x / width) * 100}%`, top: `${(hoverPos.y / height) * 100}%` } }),
      hoverPos && _jsx('span', { className: `terrain-hover-tip${hoverPos.x > width * 0.7 ? ' is-left' : ''}`, style: { left: `${(hoverPos.x / width) * 100}%`, top: `${(hoverPos.y / height) * 100}%` }, children: `${fmt(hovered.elevation)} m · ${fmtDistance(hovered.distance)}` })
    ] }),
    profile && _jsxs('div', { className: 'terrain-profile-xaxis', children: [_jsx('span', { children: '0 m' }), _jsx('span', { children: fmtDistance(stats?.lengthMeters) })] }),
    profile && _jsxs('div', { className: 'terrain-profile-note', children: [
      t('terrain.note.samples', { valid: stats?.validSamples ?? 0, total: stats?.sampleCount ?? 0, datum: profile?.verticalDatum ?? 'PL-KRON86-NH' }),
      Number.isFinite(stats?.profileCoveragePercent) && stats.profileCoveragePercent < 99.5
        ? _jsx('span', { children: t('terrain.note.coverage', { percent: fmt(stats.profileCoveragePercent, 0) }) })
        : null,
      _jsx('span', { children: t('terrain.note.hover') })
    ] })
  ] });
}

const fmtVolume = (value) => (Number.isFinite(value) ? `${Math.round(value).toLocaleString('pl-PL')} m³` : '—');
const fmtShare = (value) => (Number.isFinite(value) ? `${(value * 100).toLocaleString('pl-PL', { maximumFractionDigits: value < 0.1 ? 1 : 0 })}%` : '—');

/** 18.18.0 — udział powierzchni działki w klasach nachylenia. */
function SlopeSummaryView({ summary }) {
  return _jsxs('section', { className: 'terrain-slope-summary', 'aria-label': t('terrain.slopes.title'), children: [
    _jsx('strong', { className: 'terrain-section-title', children: t('terrain.slopes.title') }),
    _jsx('div', { className: 'terrain-slope-bar', role: 'img', 'aria-label': summary.classes.map((item, i) => `${t(`terrain.slope.class.${i}`)}: ${fmtShare(item.share)}`).join(', '),
      children: summary.classes.map((item, i) => item.share > 0 ? _jsx('span', { style: { width: `${item.share * 100}%`, background: `rgb(${SLOPE_COLORS[i].join(',')})` }, title: `${t(`terrain.slope.class.${i}`)} · ${fmtShare(item.share)}` }, i) : null) }),
    _jsx('div', { className: 'terrain-slope-table', role: 'table', children: summary.classes.map((item, i) => _jsxs('div', { className: 'terrain-slope-row', role: 'row', children: [
      _jsxs('span', { role: 'cell', children: [_jsx('i', { className: `terrain-slope-swatch terrain-slope-swatch--${i}`, 'aria-hidden': true }), t(`terrain.slope.class.${i}`)] }),
      _jsx('span', { role: 'cell', children: fmtArea(item.areaSqm) }),
      _jsx('strong', { role: 'cell', children: fmtShare(item.share) }),
    ] }, i)) }),
    _jsx(Stats, { className: 'terrain-profile-stats', items: [
      { label: t('terrain.slopes.mean'), value: slopeLabel(summary.meanSlopePercent) },
      { label: t('terrain.slopes.p95'), value: slopeLabel(summary.p95SlopePercent) },
    ] }),
  ] });
}

/** 18.18.0 — wykopy i nasypy do poziomej platformy. */
function EarthworksView({ manager, snapshot }) {
  const result = snapshot.earthworks;
  const custom = snapshot.earthworkMode === 'custom';
  return _jsxs('section', { className: 'terrain-earthworks', 'aria-label': t('terrain.earthworks.title'), children: [
    _jsx('strong', { className: 'terrain-section-title', children: t('terrain.earthworks.title') }),
    _jsxs('div', { className: 'terrain-earthworks-controls', children: [
      _jsx(SelectField, { label: t('terrain.earthworks.level'), value: custom ? 'custom' : 'balanced',
        options: [{ value: 'balanced', label: t('terrain.earthworks.balanced') }, { value: 'custom', label: t('terrain.earthworks.custom') }],
        onChange: (value) => manager?.setEarthworkLevel(value, value === 'custom' ? (snapshot.earthworkLevel ?? Math.round((snapshot.earthworkBalancedLevel ?? 0) * 10) / 10) : snapshot.earthworkLevel) }),
      custom && _jsx(NumberField, { label: t('terrain.earthworks.customLevel'), unit: 'm', step: 0.1, value: snapshot.earthworkLevel ?? '',
        onChange: (value) => manager?.setEarthworkLevel('custom', value) }),
    ] }),
    result ? _jsx(Stats, { className: 'terrain-profile-stats terrain-earthworks-stats', items: [
      { label: t('terrain.earthworks.levelValue'), value: `${fmt(result.level, 2)} m` },
      { label: t('terrain.earthworks.cut'), value: fmtVolume(result.cutM3) },
      { label: t('terrain.earthworks.fill'), value: fmtVolume(result.fillM3) },
      { label: t('terrain.earthworks.net'), value: `${Math.round(result.netM3) > 0 ? '+' : ''}${fmtVolume(Math.round(result.netM3) === 0 ? 0 : result.netM3)}` },
    ] }) : _jsx('small', { className: 'terrain-surface-note', children: t('terrain.earthworks.needLevel') }),
    result && _jsx('small', { className: 'terrain-surface-note', children: t('terrain.earthworks.note', { area: fmtArea(result.areaSqm) }) }),
  ] });
}

function AreaAnalysisView({ manager, snapshot }) {
  const modeId = useId();
  const analysis = snapshot.areaAnalysis;
  const stats = analysis?.stats;
  const selected = new Set(snapshot.selectedParcelIds ?? []);
  const selectionMode = snapshot.areaSelectionMode === 'rectangle' ? 'rectangle' : 'parcels';
  const rectangle = snapshot.areaRectangle;
  const accuracy = snapshot.areaAccuracy ?? 'accurate';
  const accuracyOptions = [
    { value: 'fast', label: t('terrain.accuracy.fast') },
    { value: 'accurate', label: t('terrain.accuracy.accurate') },
    { value: 'veryAccurate', label: t('terrain.accuracy.veryAccurate') },
    { value: 'dense', label: t('terrain.accuracy.dense') },
  ];
  const analysisNote = analysis?.selectionMode === 'rectangle' && analysis.rectangle
    ? t('terrain.note.rectangle', {
      samples: stats?.validSamples ?? 0,
      width: fmtDistance(analysis.rectangle.widthMeters), height: fmtDistance(analysis.rectangle.heightMeters),
      columns: analysis.rectangle.columns, rows: analysis.rectangle.rows,
      spacing: `${Math.round(analysis.rectangle.spacingX)}×${Math.round(analysis.rectangle.spacingY)}`,
      accuracy: analysis.accuracyLabel, source: analysis.source, datum: analysis.verticalDatum ?? 'PL-KRON86-NH',
    })
    : t('terrain.note.parcels', {
      samples: stats?.validSamples ?? 0,
      parcels: analysis?.parcels?.length ?? 0,
      spacing: analysis?.spacingRange ? t('terrain.note.spacing', { spacing: `${Math.round(analysis.spacingRange[0])}${Math.round(analysis.spacingRange[1]) !== Math.round(analysis.spacingRange[0]) ? `–${Math.round(analysis.spacingRange[1])}` : ''}` }) : '',
      accuracy: analysis?.accuracyLabel ? ` · ${analysis.accuracyLabel}` : '',
      source: analysis?.source ?? 'GUGiK NMT', datum: analysis?.verticalDatum ?? 'PL-KRON86-NH',
    });
  return _jsxs('div', { className: 'terrain-area-body', children: [
    _jsxs('details', { className: 'terrain-selection-settings', open: !analysis, children: [
      _jsx('summary', { children: analysis
        ? `Obszar: ${analysis.selectionMode === 'rectangle' ? 'prostokąt' : `${analysis.parcels?.length ?? 0} działek / obszarów`} · Zmień`
        : 'Obszar i próbkowanie' }),
      !analysis && _jsx('p', { className: 'terrain-area-intro', children: 'Wybierz obszar i uruchom analizę wysokości.' }),
    _jsxs('div', { className: 'terrain-area-controls', children: [
      _jsx(Tabs, { className: 'terrain-area-mode', size: 'sm', label: t('terrain.area.modeLabel'), value: selectionMode, onChange: (value) => manager?.setAreaSelectionMode(value), idBase: modeId,
        items: [{ value: 'parcels', label: t('terrain.area.parcels') }, { value: 'rectangle', label: t('terrain.area.rectangle') }] }),
      _jsx(SelectField, { className: 'terrain-accuracy', label: t('terrain.accuracy'), value: accuracy, disabled: snapshot.busy, options: accuracyOptions, onChange: (value) => manager?.setAreaAccuracy(value) })
    ] }),
    _jsx('div', { className: 'terrain-area-selection', ...tabPanelProps(modeId, selectionMode), children: selectionMode === 'parcels'
      ? (snapshot.availableParcels?.length ? _jsxs('div', { className: 'terrain-parcel-selector', children: [
          _jsx('div', { className: 'terrain-parcel-list', children: snapshot.availableParcels.map((parcel) => _jsx(CheckboxField, {
            className: 'terrain-parcel-check', label: parcel.name, hint: parcel.visible ? null : t('terrain.area.hidden'),
            checked: selected.has(parcel.id), disabled: snapshot.busy, onChange: (checked) => manager?.setAreaParcelSelected(parcel.id, checked),
          }, parcel.id)) }),
          _jsxs('div', { className: 'terrain-area-actions', children: [
            _jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => manager?.selectVisibleParcels(), children: t('terrain.area.visible') }),
            _jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => manager?.clearAreaSelection(), children: t('terrain.area.clear') }),
            _jsx(Button, { variant: 'primary', size: 'sm', disabled: snapshot.busy || selected.size === 0, onClick: () => void manager?.analyzeArea(), children: snapshot.busy ? t('terrain.area.busy') : t('terrain.area.analyze', { count: selected.size }) })
          ] })
        ] }) : _jsx(Message, { tone: 'info', className: 'terrain-area-empty', children: t('terrain.area.noParcels') }))
      : _jsxs('div', { className: 'terrain-rectangle-selector', children: [
          _jsxs('div', { className: 'terrain-rectangle-info', children: [
            _jsx('strong', { children: rectangle ? t('terrain.rect.selected') : t('terrain.rect.manual') }),
            _jsx('span', { children: snapshot.drawing ? t('terrain.rect.drag') : rectangle ? `${fmtDistance(rectangle.widthMeters)} × ${fmtDistance(rectangle.heightMeters)} · ${fmtArea(rectangle.areaSqm)}` : t('terrain.rect.pickHint') })
          ] }),
          _jsxs('div', { className: 'terrain-area-actions terrain-rectangle-actions', children: [
            _jsx(Button, { variant: 'secondary', size: 'sm', disabled: snapshot.busy, onClick: () => manager?.startAreaRectangleSelection(), children: snapshot.drawing ? t('terrain.rect.drawing') : rectangle ? t('terrain.rect.change') : t('terrain.rect.pick') }),
            _jsx(Button, { variant: 'primary', size: 'sm', disabled: snapshot.busy || snapshot.drawing || !rectangle, onClick: () => void manager?.analyzeArea(), children: snapshot.busy ? t('terrain.area.busy') : t('terrain.rect.analyze') })
          ] })
        ] }) }),
    ] }),
    analysis && _jsxs('div', { className: 'terrain-area-results', children: [
      _jsx(Stats, { className: 'terrain-profile-stats terrain-area-stats', items: [
        { label: t('terrain.stat.lowest'), value: `${fmt(stats?.minElevation)} m` },
        { label: t('terrain.stat.highest'), value: `${fmt(stats?.maxElevation)} m` },
        { label: t('terrain.stat.mean'), value: `${fmt(stats?.meanElevation)} m` },
        { label: t('terrain.stat.relief'), value: `${fmt(stats?.elevationRange)} m` },
        { label: t('terrain.stat.planeSlope'), value: slopeLabel(stats?.planeSlopePercent) },
        { label: t('terrain.stat.direction'), value: `${stats?.downhillDirection ?? '—'}${Number.isFinite(stats?.downhillAzimuth) ? ` ${Math.round(stats.downhillAzimuth)}°` : ''}` },
      ] }),
      _jsxs('div', { className: 'terrain-display-toolbar', children: [
        _jsx(SelectField, { label: t('terrain.surface.view'), value: snapshot.surfaceMode ?? 'combined',
          options: ['combined', 'colors', 'shade', 'slope'].map((value) => ({ value, label: t(`terrain.surface.${value}`) })),
          onChange: (value) => manager?.setSurfaceMode(value) }),
        _jsxs('details', { className: 'terrain-display-options', children: [
          _jsx('summary', { children: 'Opcje wyświetlania' }),
          _jsxs('div', { className: 'terrain-surface-controls', children: [
        _jsx(RangeField, { label: t('terrain.surface.opacity'), value: snapshot.surfaceOpacity ?? 65, min: 10, max: 100, step: 5,
          format: (value) => `${value}%`, onChange: (value) => manager?.setSurfaceOpacity(value) }),
        _jsx(CheckboxField, { label: t('terrain.surface.samples'), checked: snapshot.showAreaSamples,
          onChange: (value) => manager?.setShowAreaSamples(value) }),
        _jsx(CheckboxField, { label: t('terrain.contours.show'), checked: snapshot.showContours,
          onChange: (value) => manager?.setShowContours(value) }),
        snapshot.showContours && _jsx(SelectField, { label: t('terrain.contours.interval'), value: snapshot.contourInterval ?? 'auto',
          options: [{ value: 'auto', label: t('terrain.contours.auto') }, ...['0.5', '1', '2', '5', '10', '20'].map((value) => ({ value, label: `${value.replace('.', ',')} m` }))],
          onChange: (value) => manager?.setContourInterval(value) }),
          ] }),
        ] }),
      ] }),
      snapshot.contourBusy && _jsx('div', { className: 'terrain-surface-status', role: 'status', children: t('terrain.contours.busy') }),
      snapshot.contourError && _jsxs(Message, { tone: 'warning', children: [snapshot.contourError,
        _jsx(Button, { size: 'sm', onClick: () => void manager?.refreshContours(), children: t('error.retry') })] }),
      snapshot.showContours && !snapshot.contourBusy && !snapshot.contourError && !snapshot.surfaceBusy && _jsx('small', {
        className: 'terrain-surface-note', children: snapshot.contourStep
          ? t(snapshot.contourAdjusted ? 'terrain.contours.adjusted' : 'terrain.contours.actual', { step: fmt(snapshot.contourStep, 2) })
          : t('terrain.contours.flat') }),
      snapshot.surfaceBusy && _jsx('div', { className: 'terrain-surface-status', role: 'status', children: t('terrain.surface.busy') }),
      snapshot.surfaceError && _jsxs(Message, { tone: 'warning', children: [snapshot.surfaceError,
        _jsx(Button, { size: 'sm', onClick: () => manager?.retrySurface(), children: t('error.retry') })] }),
      snapshot.surfaceMode === 'slope' && !snapshot.surfaceBusy && !snapshot.surfaceError && !snapshot.slopeAvailable
        && _jsx(Message, { tone: 'warning', children: t('terrain.slope.noData') }),
      snapshot.surfaceMode === 'slope' ? _jsxs('div', { className: 'terrain-slope-legend', children: [
        ...SLOPE_COLORS.map((_, i) => i).map((i) => _jsxs('span', { children: [_jsx('i', { className: `terrain-slope-swatch terrain-slope-swatch--${i}`, 'aria-hidden': true }), t(`terrain.slope.class.${i}`)] }, i)),
      ] }) : snapshot.surfaceMode === 'shade' ? _jsx('small', { className: 'terrain-surface-note', children: t('terrain.surface.shadeHint') }) : _jsxs('div', { className: 'terrain-hypsometry', children: [
        _jsx('div', { className: 'terrain-hypsometry-bar' }),
        _jsxs('div', { className: 'terrain-hypsometry-labels', children: [_jsx('span', { children: `${fmt(stats?.minElevation)} m` }), _jsx('span', { children: `${fmt(stats?.maxElevation)} m` })] }),
      ] }),
      _jsx('div', { className: 'terrain-surface-readout', children: snapshot.areaHover == null ? t('terrain.surface.hover')
        : snapshot.surfaceMode === 'slope' ? t('terrain.slope.hover', { height: fmt(snapshot.areaHover), slope: fmt(snapshot.slopeHover) })
          : t('terrain.surface.height', { height: fmt(snapshot.areaHover) }) }),
      _jsxs('div', { className: 'terrain-result-sections', children: [
      snapshot.slopeSummary && _jsxs('details', { className:'terrain-result-section', children:[_jsx('summary', {children:'Rozkład nachyleń'}), _jsx(SlopeSummaryView, { summary: snapshot.slopeSummary })] }),
      Number.isFinite(snapshot.earthworkBalancedLevel) && _jsxs('details', { className:'terrain-result-section', children:[_jsx('summary', {children:'Wykopy i nasypy'}), _jsx(EarthworksView, { manager, snapshot })] }),
      analysis.parcels?.length > 1 && _jsxs('details', { className: 'terrain-parcel-comparison', children: [
        _jsx('summary', { children: t('terrain.compare.title') }),
        _jsxs('div', { className: 'terrain-parcel-table', children: [
          _jsxs('div', { className: 'terrain-parcel-table-head', children: [_jsx('span', { children: t('terrain.compare.parcel') }), _jsx('span', { children: t('terrain.compare.minMax') }), _jsx('span', { children: t('terrain.compare.mean') }), _jsx('span', { children: 'ΔH' })] }),
          analysis.parcels.map((parcel) => _jsxs('div', { className: 'terrain-parcel-table-row', children: [
            _jsx('span', { title: parcel.name, children: parcel.name }),
            _jsx('span', { children: `${fmt(parcel.stats?.minElevation)}–${fmt(parcel.stats?.maxElevation)} m` }),
            _jsx('span', { children: `${fmt(parcel.stats?.meanElevation)} m` }),
            _jsx('span', { children: `${fmt(parcel.stats?.elevationRange)} m` })
          ] }, parcel.id))
        ] })
      ] }),
        _jsxs('details', { className: 'terrain-data-details', children: [
          _jsx('summary', { children: 'Dane i próbkowanie' }),
          snapshot.surfaceMode !== 'shade' && _jsx('small', { children: t(snapshot.surfaceMode === 'slope' ? 'terrain.slope.note' : 'terrain.hypsometry.hint') }),
      _jsx('small', { className: 'terrain-surface-note terrain-nodata-note', children: 'Szare kreskowanie: brak danych lub brak oceny. Wysokości: m n.p.m. · nachylenia: %.' }),
      _jsx('small', { className: 'terrain-surface-note', children: t('terrain.surface.note') }),
      _jsx('div', { className: 'terrain-profile-note', children: analysisNote }),
        ] }),
      ] }),
    ] })
  ] });
}

/**
 * Profil terenu — pierwszy moduł dolnego doku.
 *
 * Wykres profilu jest z natury szeroki i niski, więc w panelu bocznym marnował
 * miejsce. Moduł jest kontekstowy: o jego widoczności decyduje narzędzie
 * (TerrainProfileManager), a nie zapisany układ — dlatego nie ma go w szynie
 * ikon, a zamknięcie nagłówkiem zamyka też stan w menedżerze.
 */
function TerrainAreaFooter({manager,snapshot}) { return _jsxs('div', {className:'terrain-area-footer', children:[
      _jsxs('div', { className: 'terrain-report-actions', title: t('terrain.report.scope'), children: [
        _jsx(Button, { size: 'sm', disabled: snapshot.busy || snapshot.exportBusy || snapshot.surfaceBusy || snapshot.contourBusy || snapshot.surfaceError || (snapshot.showContours && snapshot.contourError),
          onClick: () => void manager?.exportArea('png'), children: t('terrain.report.png') }),
        _jsx(Button, { size: 'sm', disabled: snapshot.busy || snapshot.exportBusy || snapshot.surfaceBusy || snapshot.contourBusy || snapshot.surfaceError || (snapshot.showContours && snapshot.contourError),
          onClick: () => void manager?.exportArea('pdf'), children: t('terrain.report.pdf') }),
        snapshot.exportBusy && _jsx('span', { role: 'status', children: t('terrain.report.busy') }),
      ] }),
      snapshot.exportError && _jsx(Message, { tone: 'danger', children: snapshot.exportError }),
]}); }

export function TerrainProfilePanel() {
  const manager = useService('terrainProfile');
  const snapshot = useServiceSnapshot('terrainProfile', EMPTY_TERRAIN);
  const { open, docked, style, onDragStart, onResizeStart, onResizeHeightStart } = usePanel('terrainProfile');
  if (!open || !snapshot?.open) return null;
  const areaView = snapshot.view === 'area';
  const source = areaView ? snapshot.areaAnalysis?.source : snapshot.profile?.source;
  const verticalDatum = areaView ? snapshot.areaAnalysis?.verticalDatum : snapshot.profile?.verticalDatum;
  return _jsxs(PanelShell, {
    // 18.12.2: bez wyniku panel ma wysokość treści, a nie stałe ~280 px.
    className: `terrain-profile-panel${areaView ? ' terrain-area-panel' : ''}${(areaView ? snapshot.areaAnalysis : snapshot.profile) ? '' : ' is-compact'}`,
    headerClassName: 'terrain-profile-header',
    label: areaView ? t('terrain.label.area') : t('terrain.label.line'),
    docked, style: areaView && !docked ? { ...style, height: style?.height ?? 260 } : style, onDragStart, onResizeWidth: onResizeStart, onResizeHeight: onResizeHeightStart,
    title: areaView ? t('terrain.title.area') : t('panel.terrainProfile.title'),
    // 18.12.2: bez kodu układu wysokości w podtytule (jest w raporcie i podpowiedzi).
    subtitle: areaView ? null : t('terrain.subtitle', { source: source ?? 'GUGiK NMT' }),
    actions: _jsx(PanelHeaderActions, { id: 'terrainProfile', onClose: () => manager?.closePanel() }),
    children: [
      _jsx(ElevationProgress, { manager, snapshot }, 'progress'),
      snapshot.busy && !snapshot.progress && _jsxs('div', { className: 'terrain-profile-loading', role: 'status', children: [_jsx(LoaderCircle, { size: 16, className: 'is-spinning' }), areaView ? t('terrain.busy.area') : t('terrain.busy.line')] }, 'busy'),
      snapshot.error && _jsx(TerrainError, { message: snapshot.error, onRetry: () => void manager?.retry() }, 'error'),
      areaView ? _jsx(AreaAnalysisView, { manager, snapshot }, 'area') : _jsx(LineProfileView, { manager, snapshot }, 'line'),
      areaView && snapshot.areaAnalysis && _jsx(TerrainAreaFooter,{manager,snapshot},'footer'),
    ],
  });
}
