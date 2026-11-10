import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { memo, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { Activity, Layers3, RefreshCw, X } from 'lucide-react';
import { IconButton } from './IconButton.js';
import { hasRecentSourceIssue, sourceIsDown } from '../../data/sources/adapters/healthState.js';
import { Badge, Button, PanelShell, Tabs, tabPanelProps } from '../ui/index.js';
import { t as tr } from '../../i18n/index.js';

const EMPTY = { catalogVersion: 0, issues: [], layers: [] };
function stateFor(layer) {
    const t = layer.sourceTelemetry;
    if (layer.visible && layer.awaitingZoom) return { key: 'idle', label: 'Wymaga przybliżenia' };
    if (layer.status === 'error' || sourceIsDown(t)) return { key: 'down', label: tr('health.state.down') };
    if (layer.status === 'loading' || (t?.inFlight ?? 0) > 0) return { key: 'busy', label: tr('health.state.busy') };
    if (hasRecentSourceIssue(t)) return { key: 'warn', label: tr('health.state.warn') };
    if (layer.visible && (layer.status === 'ready' || t?.health === 'healthy')) return { key: 'ok', label: tr('health.state.ok') };
    return { key: 'idle', label: tr('health.state.idle') };
}
function formatTime(value) {
    if (!Number.isFinite(value) || value <= 0) return '—';
    try { return new Date(value).toLocaleTimeString('pl-PL'); } catch { return '—'; }
}

const NO_SUBSCRIPTION = () => () => undefined;
const EMPTY_SNAPSHOT_FN = () => EMPTY;
/**
 * 17.8.11: zamknięty panel nie subskrybuje LayerManagera. Wcześniej przeliczał
 * się przy każdej partii kafli, także gdy nie był widoczny.
 */
export const SourceHealthPanel = memo(function SourceHealthPanel({ open, manager, onClose }) {
    if (!open) return null;
    return _jsx(SourceHealthPanelOpen, { manager, onClose });
});
function SourceHealthPanelOpen({ manager, onClose }) {
    const open = true;
    const snapshot = useSyncExternalStore(manager?.subscribe ?? NO_SUBSCRIPTION, manager?.getSnapshot ?? EMPTY_SNAPSHOT_FN, EMPTY_SNAPSHOT_FN);
    const [showAll, setShowAll] = useState(false);
    const filterId = useId();
    // 18.18.1: Esc i kliknięcie poza oknem zamykają panel (przycisk w pasku stanu przełącza go sam).
    useEffect(() => {
        const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
        const onPointerDown = (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('.source-health-panel, .status-source-button, [role="menu"], [role="tooltip"]')) return;
            onClose?.();
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown, true);
        };
    }, [onClose]);
    const layers = useMemo(() => snapshot.layers.filter((layer) => showAll || layer.visible), [snapshot.layers, showAll]);
    const summary = useMemo(() => {
        const visible = snapshot.layers.filter((layer) => layer.visible);
        const states = visible.map(stateFor);
        return {
            total: visible.length,
            ok: states.filter((state) => state.key === 'ok').length,
            warning: states.filter((state) => state.key === 'warn').length,
            down: states.filter((state) => state.key === 'down').length,
            busy: states.filter((state) => state.key === 'busy').length,
        };
    }, [snapshot.layers]);
    if (!open) return null;
    const subtitle = tr('health.subtitle', { ok: summary.ok, total: summary.total })
        + (summary.warning ? tr('health.subtitle.warn', { count: summary.warning }) : '')
        + (summary.down ? tr('health.subtitle.down', { count: summary.down }) : '');
    const detail = { ok: tr('health.detail.ok'), busy: tr('health.detail.busy'), warn: tr('health.detail.warn'), idle: tr('health.detail.idle') };
    return _jsxs(PanelShell, {
        className: 'source-health-panel',
        label: tr('health.label'),
        icon: _jsx(Activity, { size: 16 }),
        title: tr('health.title'),
        subtitle,
        actions: _jsx(IconButton, { label: tr('health.close'), tooltipSide: 'bottom', onClick: onClose, children: _jsx(X, { size: 16 }) }),
        children: [
            _jsxs('div', { className: 'source-health-toolbar', children: [
                _jsxs('div', { className: 'source-health-summary', children: [
                    _jsx(Badge, { tone: 'success', children: tr('health.badge.ok', { count: summary.ok }) }),
                    summary.warning ? _jsx(Badge, { tone: 'warning', children: tr('health.badge.warn', { count: summary.warning }) }) : null,
                    summary.down ? _jsx(Badge, { tone: 'danger', children: tr('health.badge.down', { count: summary.down }) }) : null,
                    summary.busy ? _jsx(Badge, { tone: 'accent', children: tr('health.badge.busy', { count: summary.busy }) }) : null,
                ] }),
                _jsxs('div', { className: 'source-health-actions', children: [
                    _jsx('a', { href: './monitor-zrodel.html', target: '_blank', rel: 'noopener noreferrer', className: 'ui-button', children: 'Monitor źródeł i historia' }),
                    _jsx(Tabs, { size: 'sm', label: tr('health.filter'), value: showAll ? 'all' : 'active', onChange: (value) => setShowAll(value === 'all'), idBase: filterId,
                        items: [{ value: 'active', label: tr('health.filter.active') }, { value: 'all', label: tr('health.filter.all') }] }),
                    _jsx(Button, { variant: 'secondary', size: 'sm', icon: _jsx(RefreshCw, { size: 13 }), title: tr('health.retryAll.hint'), onClick: () => manager?.retryAllVisibleFailures?.(), children: tr('health.retryAll') }),
                ] }),
            ] }, 'toolbar'),
            _jsx('div', { className: 'source-health-list', ...tabPanelProps(filterId, showAll ? 'all' : 'active'), children: layers.map((layer) => {
                const state = stateFor(layer); const t = layer.sourceTelemetry;
                const lastError = t?.lastTerminalError ? ` · ${t.lastTerminalError}` : layer.error ? ` · ${layer.error}` : '';
                return _jsxs('article', { className: `source-health-row source-health-row--${state.key}`, children: [
                    _jsx('span', { className: `source-health-dot source-health-dot--${state.key}`, 'aria-hidden': true }),
                    _jsxs('div', { className: 'source-health-copy', children: [
                        _jsxs('div', { className: 'source-health-title', children: [_jsx('strong', { children: layer.title }), _jsx('span', { children: state.label })] }),
                        _jsx('small', { children: detail[state.key] ?? tr('health.detail.down') }),
                        _jsx('small', { children: tr('health.lastOk', { time: formatTime(t?.lastGoodAt) }) + lastError }),
                    ] }),
                    layer.visible && (state.key === 'down' || state.key === 'warn') ? _jsx(IconButton, { className: 'source-health-retry', label: tr('health.retry', { title: layer.title }), tooltipSide: 'left', onClick: () => manager?.retry(layer.id), children: _jsx(RefreshCw, { size: 14 }) }) : null,
                ] }, layer.id);
            }) }, 'list'),
            layers.length === 0 ? _jsxs('div', { className: 'source-health-empty', children: [_jsx(Layers3, { size: 16 }), tr('health.empty')] }, 'empty') : null,
        ],
    });
}
