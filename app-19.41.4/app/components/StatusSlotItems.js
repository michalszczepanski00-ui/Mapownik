import { createElement as h, Fragment } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ToolIcon } from '../icons/tablerIcons.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';

const TONE = { accent: 'status-item--busy', danger: 'status-item--error', warning: 'status-item--warning', success: 'status-item--ok' };

function SlotItem({ item, ctx }) {
    const snapshot = useServiceSnapshot(item.service ?? '__none__', null);
    let view = null;
    try { view = item.select(snapshot, ctx); }
    catch (error) { console.error(`[pasek stanu ${item.id}]`, error); }
    if (!view) return null;
    return h(Fragment, null,
        h('span', { className: 'status-separator' }),
        h('span', { className: `status-item status-slot-item ${TONE[view.tone] ?? ''}`.trim(), title: view.title || undefined },
            view.icon === 'busy'
                ? h(LoaderCircle, { size: 13, className: 'is-spinning', 'aria-hidden': true })
                : view.icon ? h(ToolIcon, { name: view.icon, size: 13, strokeWidth: 2 }) : null,
            view.text));
}

/**
 * 18.0 — pozycje paska stanu wnoszone przez funkcje (slot `statusItems`).
 * Wcześniej każda funkcja dopisywała swój element do MapStage.
 */
export function StatusSlotItems() {
    const ctx = useService('featureContext');
    const features = useService('features');
    if (!features) return null;
    return h(Fragment, null, features.list('statusItems').map((item) => h(SlotItem, { key: item.id, item, ctx })));
}
