import { createElement as h, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { appToasts } from '../../core/index.js';
import { t } from '../../i18n/index.js';

/** 18.0 — powiadomienia z akcją (np. „Usunięto … · Cofnij”) nad paskiem stanu. */
export function ToastHost() {
    const snapshot = useSyncExternalStore(appToasts.subscribe, appToasts.getSnapshot, appToasts.getSnapshot);
    // Kontener jest zawsze w DOM (także pusty) — czytniki ekranu pomijają
    // pierwszy komunikat w regionie „live” wstawionym razem z nim.
    return h('div', { className: 'toast-host', role: 'status', 'aria-live': 'polite' },
        snapshot.items.map((toast) => h('div', { key: toast.id, className: `toast toast--${toast.tone}` },
            h('span', { className: 'toast-message' }, toast.message),
            toast.action && h('button', { type: 'button', className: 'ui-button ui-button--ghost ui-button--sm toast-action', onClick: () => appToasts.runAction(toast.id) }, toast.action.label),
            h('button', { type: 'button', className: 'toast-close', 'aria-label': t('toast.close'), onClick: () => appToasts.dismiss(toast.id) }, h(X, { size: 14 })))));
}
