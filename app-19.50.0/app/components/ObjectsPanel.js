import { useIsMobile } from '../hooks/useIsMobile.js';
import { ProjectFiles } from './ProjectFiles.js';
import { ObjectInspector } from './ObjectInspector.js';
import { Pagination, PAGE_SIZE, pageRange } from './Pagination.js';
import { createElement as h, useEffect, useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, GripVertical, Ruler, Shapes, MapPin, Pentagon, Route, Table2, Trash2 } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { appDialogs } from '../../core/index.js';
import { removeObjectWithUndo } from '../../features/builtin/objectsFeature.js';
import { Button, CheckboxField, EmptyState, IconButton, PanelMinimized, PanelShell, SearchField, SelectField } from '../ui/index.js';
import { t, tn } from '../../i18n/index.js';
import { openPanel, useAppDispatch } from '../../store/index.js';

/**
 * Panel Obiekty (18.2: wspólne kontrolki i katalog tekstów).
 *
 * Wiersz obiektu zostaje własnym elementem listy (przeciąganie, zaznaczanie
 * wielu, szybkie akcje) — reszta panelu to kontrolki z app/ui.
 */
const EMPTY_OBJECTS = Object.freeze({ count: 0, visibleCount: 0, selectedId: null, items: [] });
const TYPE_OPTIONS = ['all', 'Point', 'LineString', 'area'];
const TYPE_LABEL_KEYS = { all: 'objects.type.all', Point: 'objects.type.point', LineString: 'objects.type.line', area: 'objects.type.area' };

function GeometryIcon({ type }) {
    if (type === 'Point') return h(MapPin, { size: 17 });
    if (type === 'LineString') return h(Route, { size: 17 });
    return h(Pentagon, { size: 17 });
}
const geometryLabel = (type) => t(`objects.geometry.${['Point', 'LineString', 'Polygon'].includes(type) ? type : 'MultiPolygon'}`);
function ordered(items) { return [...items].sort((a, b) => b.order - a.order); }

export function ObjectsPanel() {
    const mobile = useIsMobile();
    const manager = useService('objects');
    const commands = useService('objectCommands');
    const featureContext = useService('featureContext');
    const measurement = useService('measurement');
    const snapshot = useServiceSnapshot('objects', EMPTY_OBJECTS);
    const dispatch = useAppDispatch();
    // 19.45.0: porównanie działek projektu — przycisk widoczny od dwóch działek z ewidencji.
    const parcelCount = useMemo(() => snapshot.items.filter((item) => item.origin === 'parcel' && String(item.id).startsWith('parcel:')).length, [snapshot.items]);
    const {
        open, collapsed, docked, style: panelStyle,
        restore: onRestore, onResizeStart, onResizeHeightStart, onDragStart,
    } = usePanel('objects');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const [measurementPage, setMeasurementPage] = useState(0);
    const [type, setType] = useState('all');
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [draggedId, setDraggedId] = useState(null);
    const [dropId, setDropId] = useState(null);
    const [measurementsOpen, setMeasurementsOpen] = useState(false);

    useEffect(() => {
        const available = new Set(snapshot.items.map((item) => item.id));
        setSelectedIds((current) => {
            const next = new Set([...current].filter((id) => available.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [snapshot.items]);

    const filteredItems = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('pl');
        return ordered(snapshot.items.filter((item) => {
            const matchesText = !needle || item.name.toLocaleLowerCase('pl').includes(needle);
            const matchesType = type === 'all' || (type === 'area'
                ? item.geometryType === 'Polygon' || item.geometryType === 'MultiPolygon'
                : item.geometryType === type);
            return matchesText && matchesType;
        }));
    }, [snapshot.items, query, type]);

    const projectItems = filteredItems.filter((item) => item.kind !== 'measurement');
    const measurementItems = filteredItems.filter((item) => item.kind === 'measurement');

    useEffect(() => { setPage(0); setMeasurementPage(0); }, [query, type]);
    useEffect(() => {
        const i = projectItems.findIndex((item) => item.id === snapshot.selectedId);
        const m = measurementItems.findIndex((item) => item.id === snapshot.selectedId);
        if (i >= 0) setPage(Math.floor(i / PAGE_SIZE));
        if (m >= 0) setMeasurementPage(Math.floor(m / PAGE_SIZE));
    }, [snapshot.selectedId]);
    const projectRange = pageRange(projectItems.length, page);
    const measurementRange = pageRange(measurementItems.length, measurementPage);
    if (!open) return null;

    const title = t('panel.objects.title');
    if (collapsed && !docked) {
        return h(PanelMinimized, { className: 'objects-panel objects-panel--compact panel-minimized--objects', title, icon: h(Shapes, { size: 18 }), style: panelStyle, onRestore });
    }

    const chosen = [...selectedIds];
    const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));
    const someFilteredSelected = filteredItems.some((item) => selectedIds.has(item.id));
    const setChosen = (id, checked) => setSelectedIds((current) => {
        const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next;
    });
    const selectAllFiltered = (checked) => setSelectedIds((current) => {
        const next = new Set(current); for (const item of filteredItems) { if (checked) next.add(item.id); else next.delete(item.id); } return next;
    });
    // 18.0: pojedyncze usunięcie bez pytania, z powiadomieniem „Cofnij” (działa
    // Ctrl+Z); 18.1: z pytaniem po włączeniu ustawienia. Potwierdzenie zostaje
    // przy usuwaniu wielu obiektów naraz.
    const confirmDelete = async (ids) => {
        if (!ids.length) return;
        if (ids.length === 1) {
            if (featureContext && await removeObjectWithUndo(featureContext, ids[0])) {
                setSelectedIds((current) => { const next = new Set(current); next.delete(ids[0]); return next; });
            }
            return;
        }
        const accepted = await appDialogs.confirm({
            title: tn('objects.confirmMany.title', ids.length),
            message: t('objects.confirmMany.message'),
            hint: t('objects.confirmMany.hint'),
            confirmLabel: t('objects.delete'),
            tone: 'danger',
        });
        if (!accepted) return;
        commands?.removeMany(ids);
        setSelectedIds((current) => { const next = new Set(current); ids.forEach((id) => next.delete(id)); return next; });
    };
    // Jedno przeciągnięcie = jedna operacja w historii. Wyliczanie kroków
    // należy do ObjectCommandService.moveTo — panel mówi tylko „postaw ten
    // wiersz w miejscu tamtego".
    const moveByDrag = (sourceId, targetId) => { commands?.moveTo(sourceId, targetId); };

    const renderItem = (item) => {
        const kind = geometryLabel(item.geometryType);
        return h('div', {
            key: item.id,
            className: `object-row object-row--draggable${item.selected ? ' is-selected' : ''}${selectedIds.has(item.id) ? ' is-checked' : ''}${!item.visible ? ' is-hidden' : ''}${draggedId === item.id ? ' is-dragging' : ''}${dropId === item.id ? ' is-drop-target' : ''}`,
            role: 'option', 'aria-selected': selectedIds.has(item.id), tabIndex: 0,
            onClick: () => manager?.select(item.id),
            onKeyDown: (event) => { if (event.key === 'Enter') manager?.select(item.id); },
            onDragOver: (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dropId !== item.id) setDropId(item.id); },
            onDragLeave: () => { if (dropId === item.id) setDropId(null); },
            onDrop: (event) => { event.preventDefault(); const source = event.dataTransfer.getData('text/plain') || draggedId; moveByDrag(source, item.id); setDraggedId(null); setDropId(null); },
            onDragEnd: () => { setDraggedId(null); setDropId(null); },
        },
            h('span', { className: 'object-drag-grip', title: t('objects.drag'), 'aria-label': t('objects.drag.aria', { name: item.name }), draggable: true, onClick: (event) => event.stopPropagation(), onDragStart: (event) => { event.stopPropagation(); setDraggedId(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); } }, h(GripVertical, { size: 14 })),
            h('input', { className: 'object-check', type: 'checkbox', checked: selectedIds.has(item.id), 'aria-label': t('objects.choose', { name: item.name }), onClick: (event) => event.stopPropagation(), onChange: (event) => setChosen(item.id, event.target.checked) }),
            h('span', { className: 'object-kind-icon', title: `${kind} · ${item.origin}`, 'aria-label': kind }, h(GeometryIcon, { type: item.geometryType })),
            h('span', { className: 'object-row-copy' }, h('strong', { title: `${item.name} · ${kind} · ${item.origin}` }, item.name)),
            h('button', { type: 'button', className: 'object-row-action', 'aria-label': item.visible ? t('objects.hide', { name: item.name }) : t('objects.show', { name: item.name }), onClick: (event) => { event.stopPropagation(); commands?.setVisibility(item.id, !item.visible); } }, item.visible ? h(Eye, { size: 15 }) : h(EyeOff, { size: 15 })),
            h('button', { type: 'button', className: 'object-row-action object-row-action--danger', title: t('objects.delete'), 'aria-label': t('objects.delete.aria', { name: item.name }), onClick: (event) => { event.stopPropagation(); confirmDelete([item.id]); } }, h(Trash2, { size: 15 })));
    };

    const listContent = snapshot.count === 0
        ? h(EmptyState, { icon: h(Shapes, { size: 24 }), title: t('objects.empty.title') }, t('objects.empty.hint'))
        : filteredItems.length === 0
            ? h(EmptyState, { title: t('objects.noResults.title') }, t('objects.noResults.hint'))
            : h('div', { className: 'objects-list', role: 'listbox', 'aria-label': t('objects.list'), 'aria-multiselectable': true },
                projectItems.slice(projectRange.start, projectRange.end).map(renderItem),
                h(Pagination, { count: projectItems.length, page, onChange: setPage }),
                // 18.0: pomiary w osobnej, zwijanej grupie — nie mieszają się
                // z geometrią projektu (i nie są pierwsze na liście po pomiarze).
                measurementItems.length > 0 && h('details', {
                    className: 'objects-measurements',
                    open: measurementsOpen || measurementItems.some((item) => item.selected) ? true : undefined,
                    onToggle: (event) => setMeasurementsOpen(event.currentTarget.open),
                },
                    h('summary', { className: 'objects-measurements-head' },
                        h(Ruler, { size: 14, 'aria-hidden': true }),
                        h('span', null, `${t('measurements.group')} (${measurementItems.length})`),
                        h(Button, { size: 'sm', variant: 'ghost', className: 'objects-measurements-clear', title: t('measurements.hint'), onClick: (event) => { event.preventDefault(); event.stopPropagation(); measurement?.clear(); } }, t('measurements.clear'))),
                    measurementItems.slice(measurementRange.start, measurementRange.end).map(renderItem),
                    h(Pagination, { count: measurementItems.length, page: measurementPage, onChange: setMeasurementPage })));

    return h(PanelShell, {
        className: 'objects-panel objects-panel--compact',
        label: t('objects.panelLabel'),
        docked,
        style: panelStyle,
        icon: h(Shapes, { size: 16 }),
        title,
        subtitle: tn('objects.count', snapshot.count),
        actions: h(PanelHeaderActions, { id: 'objects' }),
        footer: snapshot.selectedId ? t('objects.footer.selected') : t('objects.footer'),
        // Uchwyty rozmiaru i przeciągania należą do okna pływającego; w doku
        // o szerokości decyduje sam dok, a panel nie ma własnego położenia.
        onDragStart, onResizeWidth: onResizeStart, onResizeHeight: onResizeHeightStart,
    },
        h('div', { className: 'objects-controls' },
            h(SearchField, { className: 'objects-search', value: query, onChange: setQuery, placeholder: t('objects.filter'), ariaLabel: t('objects.filter.aria') }),
            h(SelectField, {
                className: 'objects-type', value: type, onChange: setType, ariaLabel: t('objects.type.aria'),
                options: TYPE_OPTIONS.map((value) => ({ value, label: t(TYPE_LABEL_KEYS[value]) })),
            })),
        h('div', { className: 'objects-toolbar' },
            h(CheckboxField, {
                className: 'objects-select-all',
                checked: allFilteredSelected,
                indeterminate: someFilteredSelected,
                disabled: filteredItems.length === 0,
                ariaLabel: t('objects.selectAll'),
                label: chosen.length ? t('objects.selected', { count: chosen.length }) : t('objects.visible', { visible: snapshot.visibleCount, total: snapshot.count }),
                onChange: selectAllFiltered,
            }),
            chosen.length ? h('div', { className: 'objects-bulk-actions', role: 'group', 'aria-label': t('objects.bulk') },
                h(IconButton, { label: t('objects.bulk.show'), onClick: () => commands?.setVisibilityMany(chosen, true) }, h(Eye, { size: 15 })),
                h(IconButton, { label: t('objects.bulk.hide'), onClick: () => commands?.setVisibilityMany(chosen, false) }, h(EyeOff, { size: 15 })),
                h(IconButton, { label: t('objects.bulk.duplicate'), onClick: () => commands?.duplicateMany(chosen) }, h(Copy, { size: 15 })),
                h(IconButton, { label: t('objects.bulk.delete'), onClick: () => confirmDelete(chosen) }, h(Trash2, { size: 15 }))) : null),
        parcelCount >= 2 && h(Button, { size: 'sm', className: 'objects-compare', icon: h(Table2, { size: 14 }), onClick: () => dispatch(openPanel('parcelCompare')), title: 'Tabela: powierzchnia, plany, ograniczenia, ceny — z eksportem do CSV' }, `Porównaj działki (${parcelCount})`),
        mobile && h(ObjectInspector, { object: snapshot.items.find((item) => item.id === snapshot.selectedId) }),
        listContent,
        // 19.28.0: import i eksport plików GIS pod listą — lista obiektów zaczyna się od filtra.
        h(ProjectFiles, null));
}
