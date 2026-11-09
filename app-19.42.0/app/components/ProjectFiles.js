import { createElement as h, useState } from 'react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { FormatSection } from './ExportPanel.js';
import { Button, Message } from '../ui/index.js';
import { appDialogs } from '../../core/index.js';
const EMPTY = Object.freeze({ busy: false, shares: [] });
export function ProjectFiles() {
    const ctx = useService('featureContext'), features = useService('features'), manager = useService('transfers');
    const snapshot = useServiceSnapshot('transfers', EMPTY);
    const [error, setError] = useState(null);
    const run = async (task) => { setError(null); try { await task(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
    return h('details', { className: 'project-files' }, h('summary', null, 'Import i eksport plików GIS'),
        features?.list('exportFormats').map((format) => h(FormatSection, { key: format.id, format, ctx, busy: snapshot.busy || !manager, run })),
        snapshot.shares?.length > 0 && h('section', null, h('h3', null, 'Udostępnione kopie'), snapshot.shares.map((share) => h('div', { key: share.id, className: 'project-share-row' },
            h('span', null, `${share.name} · ${share.createdAt.slice(0, 10)}`), h(Button, { size: 'sm', disabled: snapshot.busy, onClick: () => run(async () => { if (await appDialogs.confirm({ title: 'Wyłącz link', message: 'Wyłączyć dostęp przez ten link?', tone: 'danger' })) await manager.revokeShare(share.id); }) }, 'Wyłącz link')))),
        (error || snapshot.error || snapshot.message) && h(Message, { tone: error || snapshot.error ? 'danger' : 'success' }, error || snapshot.error || snapshot.message));
}
