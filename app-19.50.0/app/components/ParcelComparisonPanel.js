import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Table2 } from 'lucide-react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { usePanel } from '../hooks/useDockGeometry.js';
import { PanelHeaderActions } from './PanelHeaderActions.js';
import { Button, EmptyState, Message, PanelShell } from '../ui/index.js';
import { downloadText } from '../../core/index.js';
import { COLUMNS, cellText, cellTone, compareParcel, projectParcelItems, toComparisonCsv } from '../../parcels/parcelComparison.ts';

/**
 * 19.45.0 — „Porównanie działek”: tabela działek dodanych do projektu (powierzchnia, MPZP, plan ogólny, ochrona przyrody,
 * powódź, klasy użytków, ceny gruntów w okolicy, różnica wysokości) z eksportem do CSV.
 * Dane pobierane po kolei dla każdej działki (usługi publiczne nie lubią serii zapytań) i pamiętane do zmiany
 * działki albo odświeżenia — ponowne otwarcie panelu nie pyta usług drugi raz.
 */
const ID = 'parcelCompare';
const NO_OBJECTS = Object.freeze({ items: [] });
/** Wyniki zapamiętane między otwarciami panelu: klucz = id obiektu + data zmiany geometrii. */
const memory = new Map();
const keyOf = (item) => `${item.id}|${item.updatedAt ?? ''}`;

export function ParcelComparisonPanel() {
    const panel = usePanel(ID);
    const objects = useService('objects');
    const snapshot = useServiceSnapshot('objects', NO_OBJECTS);
    const parcels = useMemo(() => projectParcelItems(snapshot.items).slice().sort((a, b) => a.order - b.order), [snapshot.items]);
    const [rows, setRows] = useState(() => new Map());
    const [progress, setProgress] = useState(null);
    const [revision, setRevision] = useState(0);
    const abortRef = useRef(null);

    // Pobranie danych brakujących działek (albo wszystkich po „Odśwież”).
    useEffect(() => {
        if (!panel.open || !objects) return undefined;
        const abort = new AbortController(); abortRef.current = abort;
        const todo = parcels.filter((item) => !memory.has(keyOf(item)));
        setRows(new Map(parcels.filter((item) => memory.has(keyOf(item))).map((item) => [item.id, memory.get(keyOf(item))])));
        if (!todo.length) { setProgress(null); return () => abort.abort(); }
        // Dwie działki naraz: serwer ma dwa miejsca na analizy działek (api/vps.php), a każda działka to ok. 10 zapytań.
        let next = 0; let done = 0;
        const worker = async () => {
            while (next < todo.length) {
                const item = todo[next]; next += 1;
                if (abort.signal.aborted) return;
                setProgress({ index: Math.min(done + 1, todo.length), total: todo.length, name: item.name });
                let row;
                try { row = await compareParcel(objects.getObject(item.id), { signal: abort.signal }); }
                catch (error) {
                    if (abort.signal.aborted) return;
                    row = { objectId: item.id, parcelId: item.id.replace(/^parcel:/, ''), name: item.name, failed: error instanceof Error ? error.message : String(error) };
                }
                if (abort.signal.aborted) return;
                if (!row.failed) memory.set(keyOf(item), row);
                done += 1;
                setRows((prev) => new Map(prev).set(item.id, row));
            }
        };
        Promise.all([worker(), worker()]).then(() => { if (!abort.signal.aborted) setProgress(null); });
        return () => abort.abort();
    }, [panel.open, objects, parcels, revision]);

    const refresh = useCallback(() => { for (const item of parcels) memory.delete(keyOf(item)); setRevision((v) => v + 1); }, [parcels]);
    const ready = parcels.map((item) => rows.get(item.id)).filter((row) => row && !row.failed);
    const exportCsv = () => downloadText(toComparisonCsv(ready), `mapownik-porownanie-dzialek-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    const focus = (id) => { try { objects?.select(id); objects?.focus(id); } catch { /* działka usunięta w międzyczasie */ } };

    if (!panel.open) return null;
    const title = 'Porównanie działek';
    const subtitle = parcels.length ? `${parcels.length} ${parcels.length === 1 ? 'działka' : parcels.length % 10 >= 2 && parcels.length % 10 <= 4 && !(parcels.length % 100 >= 12 && parcels.length % 100 <= 14) ? 'działki' : 'działek'} w projekcie` : 'Działki dodane do projektu';
    return h(PanelShell, {
        className: 'analysis-results-panel parcel-compare-panel', label: title, docked: panel.docked, style: panel.style,
        onDragStart: panel.docked ? undefined : panel.onDragStart, onResizeWidth: panel.docked ? undefined : panel.onResizeStart, onResizeHeight: panel.docked ? undefined : panel.onResizeHeightStart,
        icon: h(Table2, { size: 16 }), title, subtitle,
        toolbar: h('div', { className: 'results-toolbar' },
            progress ? h('small', { role: 'status', className: 'compare-progress' }, `Pobieranie danych: ${progress.index} z ${progress.total} (${progress.name})…`) : h('span', { className: 'compare-progress' }),
            h(Button, { size: 'sm', icon: h(RefreshCw, { size: 14 }), disabled: !parcels.length || Boolean(progress), onClick: refresh, title: 'Pobierz dane wszystkich działek jeszcze raz' }, 'Odśwież'),
            h(Button, { size: 'sm', icon: h(Download, { size: 15 }), disabled: !ready.length, onClick: exportCsv, title: 'Tabela do arkusza (Excel, LibreOffice)' }, 'CSV')),
        actions: h(PanelHeaderActions, { id: ID }),
        footer: 'Wstępne porównanie danych publicznych w punktach działki — nie zastępuje wypisu z planu ani sprawdzenia w urzędzie.',
    },
    !parcels.length
        ? h(EmptyState, { title: 'Brak działek w projekcie' }, 'Kliknij działkę na mapie i wybierz „Dodaj do projektu” (albo użyj narzędzia „Działka”). Porównanie obejmie wszystkie działki projektu.')
        : h('div', { className: 'results-table-wrap' },
            h('table', { className: 'results-table compare-table' },
                h('thead', null, h('tr', null,
                    h('th', { scope: 'col' }, 'Działka'),
                    COLUMNS.map(([key, label]) => h('th', { key, scope: 'col', className: key === 'area' || key === 'price' || key === 'terrain' ? 'is-numeric' : undefined }, label)))),
                h('tbody', null, parcels.map((item) => {
                    const row = rows.get(item.id);
                    const place = row && !row.failed ? [row.region, row.commune].filter(Boolean).join(', ') : '';
                    return h('tr', { key: item.id, tabIndex: 0, onClick: () => focus(item.id), onKeyDown: (event) => { if (event.key === 'Enter') focus(item.id); }, title: 'Pokaż działkę na mapie' },
                        h('th', { scope: 'row', className: 'compare-name' }, h('strong', null, item.name), place && h('small', null, place)),
                        !row ? h('td', { colSpan: COLUMNS.length, className: 'compare-wait' }, 'czeka na dane…')
                            : row.failed ? h('td', { colSpan: COLUMNS.length }, h(Message, { tone: 'danger' }, `Nie udało się pobrać danych: ${row.failed}`))
                                : COLUMNS.map(([key]) => h('td', { key, className: [key === 'area' || key === 'price' || key === 'terrain' ? 'is-numeric' : '', cellTone(row, key) ? `is-${cellTone(row, key)}` : ''].filter(Boolean).join(' ') || undefined }, cellText(row, key))));
                })))));
}
