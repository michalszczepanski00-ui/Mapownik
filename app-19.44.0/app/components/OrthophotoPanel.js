import { createElement as h, useEffect, useRef, useState } from 'react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { PanelIcon } from './PanelIcon.js';
import { Button, Message, PanelMinimized, PanelShell, RangeField, SelectField } from '../ui/index.js';
import { t } from '../../i18n/index.js';
import { PHOTO_IDS, center2180, loadOrthoDates, monthForYear, orthophotoRequest } from '../../orthophoto/orthophotoApi.js';
const EMPTY = { items: [], activeId: null, pendingId: null, archiveMonth: '2025-11', photoOpacity: 1 };
export function OrthophotoPanel() {
    const manager = useService('basemaps'), controller = useService('mapController');
    const snapshot = useServiceSnapshot('basemaps', EMPTY);
    const panel = usePanel('orthophoto');
    const [chosenId, setChosenId] = useState(() => PHOTO_IDS.includes(snapshot.pendingId ?? snapshot.activeId) ? snapshot.pendingId ?? snapshot.activeId : PHOTO_IDS[0]);
    const [dates, setDates] = useState(null), [dateBusy, setDateBusy] = useState(false), [dateError, setDateError] = useState(null);
    const [reload, setReload] = useState(0), [point, setPoint] = useState(null), [pointBusy, setPointBusy] = useState(false), [pointError, setPointError] = useState(null);
    const pointController = useRef(null);
    const selectedId = snapshot.pendingId ?? snapshot.activeId;
    const mode = PHOTO_IDS.includes(snapshot.pendingId) ? snapshot.pendingId : chosenId;
    useEffect(() => { if (PHOTO_IDS.includes(snapshot.activeId)) setChosenId(snapshot.activeId); }, [snapshot.activeId]);
    useEffect(() => {
        if (!panel.open || panel.collapsed || mode !== 'basemap.orthophoto.archive') return undefined;
        const abort = new AbortController(); setDateBusy(true); setDateError(null);
        loadOrthoDates(abort.signal, reload > 0).then(setDates).catch((error) => { if (!abort.signal.aborted) setDateError(t('ortho.loadError')); })
            .finally(() => { if (!abort.signal.aborted) setDateBusy(false); });
        return () => abort.abort();
    }, [panel.open, panel.collapsed, mode, reload]);
    useEffect(() => {
        if (!panel.open) return undefined;
        const clear = () => { pointController.current?.abort(); setPoint(null); setPointBusy(false); setPointError(null); };
        const unsubscribe = controller?.onMoveEnd(clear);
        return () => { unsubscribe?.(); pointController.current?.abort(); }; 
    }, [panel.open, controller]);
    const select = (id) => { setChosenId(id); manager?.setActive(id); };
    const readPoint = async () => {
        pointController.current?.abort(); const abort = new AbortController(); pointController.current = abort;
        const coordinate = center2180(controller); setPointBusy(true); setPointError(null); setPoint(null);
        try {
            const result = await orthophotoRequest({ mode: 'point', x: coordinate[0], y: coordinate[1] }, abort.signal);
            if (!abort.signal.aborted && center2180(controller).join(':') === coordinate.join(':')) setPoint(result);
        } catch (error) { if (!abort.signal.aborted) setPointError(t('ortho.pointError')); }
        finally { if (!abort.signal.aborted) setPointBusy(false); }
    };
    if (!panel.open) return null;
    const title = t('panel.orthophoto.title');
    if (panel.collapsed && !panel.docked) return h(PanelMinimized, { title, icon: h(PanelIcon, { name: 'orthophoto' }), style: panel.style, onRestore: panel.restore });
    const active = snapshot.items.find((item) => item.id === mode);
    const months = dates?.months ?? [], month = snapshot.archiveMonth ?? '2025-11';
    const years = [...new Set([...months, month].map((value) => value.slice(0, 4)))].sort().reverse();
    const monthOptions = [...new Set([...months, month])].sort().filter((value) => value.startsWith(month.slice(0, 4))).map((value) => ({ value, label: new Date(`${value}-15T12:00:00Z`).toLocaleString('pl-PL', { month: 'long', timeZone: 'UTC' }) }));
    const archive = mode === 'basemap.orthophoto.archive';
    const setMonth = (value) => { manager?.applyPreferences({ archiveMonth: value }); select('basemap.orthophoto.archive'); };
    return h(PanelShell, { className: 'orthophoto-panel', title, subtitle: t('ortho.subtitle'), label: title, docked: panel.docked, style: panel.style,
        icon: h(PanelIcon, { name: 'orthophoto', size: 16 }), actions: h(PanelHeaderActions, { id: 'orthophoto' }),
        onDragStart: panel.onDragStart, onResizeWidth: panel.onResizeStart, onResizeHeight: panel.onResizeHeightStart,
    },
    h('div', { className: 'ortho-body' },
    h('div', { className: 'ortho-controls' },
            h(SelectField, { label: t('ortho.type'), value: mode, onChange: select, options: [
                { value: PHOTO_IDS[0], label: t('ortho.current') }, { value: PHOTO_IDS[1], label: t('ortho.archive') }, { value: PHOTO_IDS[2], label: t('ortho.true') },
            ] }),
            archive && h('div', { className: 'ortho-date-fields' },
                h(SelectField, { label: t('ortho.year'), value: month.slice(0, 4), disabled: !months.length,
                    onChange: (year) => setMonth(monthForYear(months, year, month)), options: years.map((value) => ({ value, label: value })) }),
                h(SelectField, { label: t('ortho.month'), value: month, disabled: !months.length, onChange: setMonth, options: monthOptions })),
            h(RangeField, { label: t('ortho.opacity'), min: 10, max: 100, value: Math.round((snapshot.photoOpacity ?? 1) * 100),
                onChange: (value) => manager?.applyPreferences({ photoOpacity: Number(value) / 100 }), format: (value) => `${value}%` })),
        archive && dateBusy && h('small', { role: 'status' }, t('ortho.loadingDates')),
        archive && dates?.rangeStale && !dateError && h(Message, { tone: 'warning' }, t('ortho.staleRange', { date: dates.checkedAt.slice(0, 10) }),
            h(Button, { size: 'sm', disabled: dateBusy, onClick: () => setReload((value) => value + 1) }, t('ortho.retry'))),
        archive && dateError && h(Message, { tone: 'danger' }, dateError, h(Button, { size: 'sm', onClick: () => setReload((value) => value + 1) }, t('ortho.retry'))),
        archive && months.length > 0 && !months.includes(month) && h(Message, { tone: 'warning' }, t('ortho.outOfRange', { month }),
            h(Button, { size: 'sm', onClick: () => setMonth(months.at(-1)) }, t('ortho.latest'))),
        PHOTO_IDS.includes(selectedId) && !active?.error && h('small', { className: 'ortho-status', role: 'status' },
            active?.awaitingZoom ? t('ortho.zoom') : snapshot.pendingId || active?.status === 'loading' ? t('ortho.loadingMap') :
                t('ortho.selected', { name: active?.title ?? '', date: archive ? ` · ${month}` : '' })),
        active?.error && h(Message, { tone: 'danger' }, t('ortho.mapError')),
        (selectedId !== mode || active?.error) && h(Button, { variant: 'primary', size: 'sm', onClick: () => select(mode) }, t('ortho.show')),
        archive && h('div', { className: 'ortho-point' },
            h(Button, { size: 'sm', disabled: pointBusy || !controller, onClick: readPoint }, pointBusy ? t('ortho.loadingPoint') : t('ortho.checkPoint')),
            h('small', null, t('ortho.pointHint')),
            pointError && h(Message, { tone: 'danger' }, pointError),
            point && h('small', null, t('ortho.coordinate', { x: point.coordinate[0], y: point.coordinate[1] })),
            point && !point.records.length && h(Message, { tone: 'info' }, t('ortho.noRecords')),
            point?.records.length > 0 && h('ul', { className: 'ortho-records' }, point.records.map((record, index) => h('li', { key: `${record.date}:${index}` },
                h('strong', null, new Date(`${record.date}T12:00:00Z`).toLocaleDateString('pl-PL', { timeZone: 'UTC' })),
                h('span', null, record.resolution ? t('ortho.resolution', { value: record.resolution.toLocaleString('pl-PL') }) : '', record.colour ? ` · ${record.colour}` : ''))))),
        h('details', { className: 'ortho-details' }, h('summary', null, t('ortho.details')),
            h('p', null, archive ? t('ortho.archiveHint') : mode === PHOTO_IDS[2] ? t('ortho.trueHint') : t('ortho.currentHint')),
            h('p', null, t('ortho.source')))));
}
