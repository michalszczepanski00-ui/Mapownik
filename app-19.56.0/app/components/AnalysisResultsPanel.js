import { Pagination, PAGE_SIZE, pageRange } from './Pagination.js';
import { formatDistance as fmtDistance } from '../../analysis/formatDistance.js';
import { createElement as h, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Crosshair, Download, Table2 } from 'lucide-react';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { Button, EmptyState, PanelShell, TextField } from '../ui/index.js';
import { downloadText } from '../../core/index.js';
import { t } from '../../i18n/index.js';
import { formatArea as formatUnitArea } from '../../core/units.js';

const EMPTY = Object.freeze({
    lastResult: null, previewRevision: 0, previewCount: 0, previewSourceCount: 0,
    previewLimited: false, selectedFeature: null, busy: false,
});

function fmtArea(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return formatUnitArea(n);
}
function text(value) {
    if (value == null || value === '') return '—';
    return Array.isArray(value) ? value.join(', ') : String(value);
}

/**
 * Kolumny tabeli — opis sterujący nagłówkiem, sortowaniem i eksportem CSV.
 *
 * Kolumna odległości pojawia się tylko dla analizy odległości; dla pozostałych
 * operacji nie ma czego w niej pokazać, a pusta kolumna zabierałaby miejsce.
 */
const COLUMNS = [
    { key: 'distanceMeters', label: t('results.column.distance'), get: (r) => r.distanceMeters, sort: 'number', format: fmtDistance, align: 'right', onlyDistance: true },
    { key: 'categoryLabel', label: t('results.column.type'), get: (r) => r.categoryLabel, sort: 'text' },
    { key: 'name', label: t('results.column.name'), get: (r) => r.name, sort: 'text' },
    { key: 'areaSqm', label: t('results.column.area'), get: (r) => r.areaSqm, sort: 'number', format: fmtArea, align: 'right' },
    { key: 'functionDetail', label: t('results.column.function'), get: (r) => r.functionDetail, sort: 'text' },
    { key: 'floors', label: t('results.column.floors'), get: (r) => r.floors, sort: 'number', align: 'right' },
    { key: 'existence', label: t('results.column.status'), get: (r) => r.existence, sort: 'text' },
];

function compare(a, b, column, direction) {
    const av = column.get(a);
    const bv = column.get(b);
    let result;
    if (column.sort === 'number') {
        const an = Number(av); const bn = Number(bv);
        const aok = Number.isFinite(an); const bok = Number.isFinite(bn);
        result = aok && bok ? an - bn : aok ? -1 : bok ? 1 : 0;
    } else {
        const as = av == null ? '' : String(av);
        const bs = bv == null ? '' : String(bv);
        // Puste wartości zawsze na końcu, niezależnie od kierunku sortowania —
        // inaczej odwrócenie kolejności wypycha na górę same myślniki.
        if (!as && !bs) result = 0;
        else if (!as) return 1;
        else if (!bs) return -1;
        else result = as.localeCompare(bs, 'pl');
    }
    return direction === 'desc' ? -result : result;
}

/**
 * Eksportowane wyłącznie po to, by format CSV dało się przypiąć testem:
 * separator, cytowanie i BOM decydują o tym, czy Excel w polskiej lokalizacji
 * rozłoży plik na kolumny, a to łatwo zepsuć nieuważną zmianą.
 */
export function toCsv(rows, inRadius, columns = COLUMNS) {
    const header = [...columns.map((c) => c.label), 'ID'];
    if (inRadius) header.splice(header.length - 1, 0, t('results.csv.inRadius'));
    const lines = [header];
    for (const row of rows) {
        const values = columns.map((c) => {
            const raw = c.get(row);
            // Liczby bez formatowania jednostkami — arkusz ma je policzyć,
            // a nie wyświetlić jako tekst „1,2 km".
            if (c.key === 'areaSqm' || c.key === 'distanceMeters') {
                return Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : '';
            }
            return raw == null ? '' : String(raw);
        });
        if (inRadius) values.push(inRadius.has(row.id) ? t('results.csv.yes') : t('results.csv.no'));
        values.push(row.id);
        lines.push(values);
    }
    // Separator średnikiem i BOM — Excel w polskiej lokalizacji inaczej wrzuca
    // cały wiersz do jednej kolumny.
    return '﻿' + lines.map((cells) => cells
        .map((cell) => (/[";\n]/.test(cell) ? `"${String(cell).replace(/"/g, '""')}"` : cell))
        .join(';')).join('\r\n');
}

/**
 * Tabela wyników analizy — drugi moduł dolnego doku.
 *
 * Panel Analiz pokazuje pojedynczy wybrany obiekt; zestawienie wszystkich
 * trafień potrzebuje szerokości, której panel boczny nie ma. Moduł jest
 * kontekstowy: otwiera się, gdy pojawi się nowy wynik, i daje się zamknąć bez
 * powrotu przy następnym renderze.
 *
 * Wiersze pobierane są z menedżera na żądanie (nie przez snapshot), bo przy
 * limicie 1200 obiektów kopiowanie ich do stanu przy każdej zmianie byłoby
 * kosztowne bez żadnego zysku.
 */
export function AnalysisResultsPanel() {
    const manager = useService('analysis');
    const snapshot = useServiceSnapshot('analysis', EMPTY);
    // 19.27.0: po odpięciu — położenie, przeciąganie i zmiana rozmiaru jak w innych oknach
    // (wcześniej okno bez pozycji lądowało pod paskiem aplikacji i nie dało się go przesunąć).
    const { open, docked, style: panelStyle, onDragStart, onResizeStart, onResizeHeightStart } = usePanel('analysisResults');
    const [sort, setSort] = useState(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);

    // 18.12.1: także odległości z wyniku screeningu (wcześniej znikały).
    const distanceById = snapshot.lastResult?.details?.distanceById ?? snapshot.screeningDetails?.distanceById ?? null;

    const rows = useMemo(() => {
        const base = manager?.getResultRows ? manager.getResultRows() : [];
        if (!distanceById) return base;
        return base.map((row) => ({ ...row, distanceMeters: distanceById[row.id] ?? null }));
    // previewRevision zmienia się przy każdej podmianie zawartości podglądu
    // — także przy pokazaniu wyniku screeningu, który nie tworzy lastResult.
    }, [manager, snapshot.previewRevision, distanceById]);

    const columns = useMemo(
        () => COLUMNS.filter((column) => !column.onlyDistance || distanceById),
        [distanceById],
    );

    // Przy analizie odległości sensowną domyślną kolejnością jest „od
    // najbliższego"; w pozostałych przypadkach — od największej powierzchni.
    const effectiveSort = sort ?? (distanceById
        ? { key: 'distanceMeters', direction: 'asc' }
        : { key: 'areaSqm', direction: 'desc' });

    const inRadius = useMemo(() => {
        const ids = snapshot.lastResult?.details?.inRadiusIds ?? snapshot.screeningDetails?.inRadiusIds;
        return Array.isArray(ids) ? new Set(ids.map(String)) : null;
    }, [snapshot.lastResult, snapshot.screeningDetails]);

    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('pl');
        const column = columns.find((c) => c.key === effectiveSort.key) ?? columns[0];
        const filtered = needle
            ? rows.filter((row) => columns.some((c) => String(c.get(row) ?? '').toLocaleLowerCase('pl').includes(needle)))
            : rows;
        return [...filtered].sort((a, b) => compare(a, b, column, effectiveSort.direction));
    }, [rows, query, columns, effectiveSort]);

    useEffect(() => setPage(0), [query, sort, snapshot.previewRevision]);
    useEffect(() => {
        const index = visible.findIndex((row) => row.id === snapshot.selectedFeature?.id);
        if (index >= 0) setPage(Math.floor(index / PAGE_SIZE));
    }, [snapshot.selectedFeature?.id]);
    const range = pageRange(visible.length, page);
    if (!open) return null;

    const selectedId = snapshot.selectedFeature?.id ?? null;
    const result = snapshot.lastResult;
    const count = rows.length.toLocaleString('pl-PL');
    const nearestLabel = distanceById && result?.details?.nearestDistanceMeters != null && Number.isFinite(result.details.nearestDistanceMeters)
        ? t('results.nearest', { distance: fmtDistance(result.details.nearestDistanceMeters) })
        : '';
    const subtitle = result
        ? t('results.subtitle', { source: result.sourceTitle, count }) + (snapshot.previewLimited ? t('results.onMap', { count: snapshot.previewCount.toLocaleString('pl-PL') }) : '') + nearestLabel
        : t('results.subtitlePreview', { count });

    const toggleSort = (key) => setSort(() => (effectiveSort.key === key
        ? { key, direction: effectiveSort.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'areaSqm' || key === 'floors' ? 'desc' : 'asc' }));

    const exportCsv = () => {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const source = (result?.sourceId ?? 'analiza').replace(/[^a-z0-9._-]+/gi, '-');
        downloadText(toCsv(visible, inRadius, columns), `mapownik-wyniki-${source}-${stamp}.csv`, 'text/csv;charset=utf-8');
    };

    return h(PanelShell, {
        className: 'analysis-results-panel',
        label: t('results.panelLabel'),
        docked,
        style: docked ? undefined : panelStyle,
        onDragStart: docked ? undefined : onDragStart,
        onResizeWidth: docked ? undefined : onResizeStart,
        onResizeHeight: docked ? undefined : onResizeHeightStart,
        icon: h(Table2, { size: 16 }),
        title: t('panel.analysisResults.title'),
        subtitle,
        toolbar: h('div', { className: 'results-toolbar' },
            h(TextField, { className: 'results-filter', type: 'search', value: query, placeholder: t('results.filter'), ariaLabel: t('results.filter.aria'), onChange: setQuery }),
            h(Button, { variant: 'secondary', size: 'sm', className: 'results-export', icon: h(Download, { size: 15 }), disabled: !visible.length, title: t('results.csv.hint'), onClick: exportCsv }, 'CSV')),
        actions: h(PanelHeaderActions, { id: 'analysisResults' }),
        footer: visible.length === rows.length
            ? t('results.footer', { count })
            : t('results.footerFiltered', { visible: visible.length.toLocaleString('pl-PL'), count }),
    },
        h(Pagination, { count: visible.length, page, onChange: setPage }),
        rows.length === 0
            ? h(EmptyState, { title: t('results.empty') }, t('results.empty.hint'))
            : h('div', { className: 'results-table-wrap' },
                h('table', { className: 'results-table' },
                    h('thead', null, h('tr', null,
                        inRadius ? h('th', { scope: 'col', className: 'results-col-flag' }, t('results.column.inRadius')) : null,
                        columns.map((column) => h('th', {
                            key: column.key,
                            scope: 'col',
                            className: `${column.align === 'right' ? 'is-numeric ' : ''}${effectiveSort.key === column.key ? 'is-sorted' : ''}`.trim(),
                            'aria-sort': effectiveSort.key === column.key ? (effectiveSort.direction === 'asc' ? 'ascending' : 'descending') : 'none',
                        }, h('button', {
                            type: 'button',
                            onClick: () => toggleSort(column.key),
                            title: t('results.sortBy', { column: column.label }),
                        }, column.label, h(ArrowDownUp, { size: 12, 'aria-hidden': true })))))),
                    h('tbody', null, visible.slice(range.start, range.end).map((row) => h('tr', {
                        key: row.id,
                        className: `${row.id === selectedId ? 'is-selected' : ''}${inRadius?.has(row.id) ? ' is-in-radius' : ''}`.trim(),
                        tabIndex: 0,
                        onClick: () => manager?.selectFeatureById?.(row.id),
                        onKeyDown: (event) => { if (event.key === 'Enter') manager?.selectFeatureById?.(row.id); },
                        title: row.rendered ? t('results.row.show') : t('results.row.notRendered'),
                    },
                        inRadius ? h('td', { className: 'results-col-flag' }, inRadius.has(row.id) ? h(Crosshair, { size: 13, 'aria-label': t('results.csv.inRadius') }) : null) : null,
                        columns.map((column) => h('td', {
                            key: column.key,
                            className: column.align === 'right' ? 'is-numeric' : undefined,
                        }, column.format ? column.format(column.get(row)) : text(column.get(row))))))))
            ));
}
