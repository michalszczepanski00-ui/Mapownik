import { createElement as h, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Type } from 'lucide-react';
import { appDialogs } from '../../core/index.js';

/**
 * Jedno miejsce, w którym rysują się okna dialogowe aplikacji.
 *
 * Host czyta kolejkę z `appDialogs` i renderuje jej GŁOWĘ. Wywołujący nie zna
 * Reacta — woła `appDialogs.confirm(...)` i czeka na obietnicę — więc dodanie
 * kolejnego pytania nigdzie nie dokłada komponentu.
 *
 * Okno trafia przez portal do <body>, a nie w drzewo powłoki: `.app-shell` ma
 * `isolation: isolate` i własny kontekst nakładania, przez co modal wewnątrz
 * mógłby wylądować pod pływającym panelem. Zmienne motywu są zdublowane na
 * `:root`, więc poza powłoką kolorystyka pozostaje ta sama.
 */
export function DialogHost() {
    const snapshot = useSyncExternalStore(appDialogs.subscribe, appDialogs.getSnapshot, appDialogs.getSnapshot);
    const request = snapshot.request;
    if (!request) return null;
    // `key` na identyfikatorze: dwa pytania pod rząd mają zaczynać od własnego
    // stanu pola, a nie dziedziczyć tekst po poprzednim.
    return createPortal(h(DialogWindow, { key: request.id, request }), document.body);
}

function DialogWindow({ request }) {
    const isPrompt = request.kind === 'prompt';
    const [value, setValue] = useState(request.defaultValue ?? '');
    const dialogRef = useRef(null);
    const inputRef = useRef(null);
    const confirmRef = useRef(null);
    const titleId = useId();
    const messageId = useId();

    useEffect(() => {
        const previous = document.activeElement;
        const root = document.getElementById('root');
        const wasInert = root?.inert;
        if (root) root.inert = true;
        const dialog = dialogRef.current;
        const focusable = () => Array.from(dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
        const focusFirst = () => (inputRef.current ?? confirmRef.current ?? dialog)?.focus();
        focusFirst(); inputRef.current?.select();
        const onFocus = (event) => { if (dialog && !dialog.contains(event.target)) focusFirst(); };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); appDialogs.cancel(); }
            if (event.key !== 'Tab') return;
            const items = focusable(), first = items[0], last = items.at(-1);
            if (!items.length) { event.preventDefault(); dialog?.focus(); return; }
            if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('focusin', onFocus, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('focusin', onFocus, true);
            if (root) root.inert = wasInert;
            if (previous?.isConnected) previous.focus();
        };
    }, []);

    const submit = (event) => {
        event.preventDefault();
        appDialogs.settle(isPrompt ? value : true);
    };

    const Icon = isPrompt ? Type : (request.tone === 'danger' ? AlertTriangle : HelpCircle);

    return h('div', {
        className: 'dialog-backdrop',
        // Zamknięcie tylko kliknięciem w samo tło: bez tego warunku puszczenie
        // przycisku myszy nad tłem po zaznaczaniu tekstu w oknie zamykałoby je.
        onPointerDown: (event) => { if (event.target === event.currentTarget) appDialogs.cancel(); },
    },
        h('form', {
            className: `dialog-window${request.tone === 'danger' ? ' dialog-window--danger' : ''}`,
            ref: dialogRef, tabIndex: -1,
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': titleId,
            'aria-describedby': request.message ? messageId : undefined,
            onSubmit: submit,
        },
            h('div', { className: 'dialog-head' },
                h('span', { className: 'dialog-icon', 'aria-hidden': true }, h(Icon, { size: 18 })),
                h('h2', { className: 'dialog-title', id: titleId }, request.title)),
            request.message ? h('p', { className: 'dialog-message', id: messageId }, request.message) : null,
            isPrompt ? h('label', { className: 'dialog-field' },
                h('span', null, request.label),
                h('input', {
                    ref: inputRef,
                    type: 'text',
                    value,
                    maxLength: request.maxLength,
                    placeholder: request.placeholder || undefined,
                    onChange: (event) => setValue(event.target.value),
                })) : null,
            request.hint ? h('p', { className: 'dialog-hint' }, request.hint) : null,
            h('div', { className: 'dialog-actions' },
                h('button', { type: 'button', className: 'dialog-button', onClick: () => appDialogs.cancel() }, request.cancelLabel),
                h('button', { ref: confirmRef, type: 'submit', className: 'dialog-button dialog-button--primary' }, request.confirmLabel))));
}
