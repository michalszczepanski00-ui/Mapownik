/**
 * 18.0 — powiadomienie „… · Cofnij” związane z KONKRETNYM wpisem historii.
 *
 * Przycisk cofa tylko operację, o której mówi powiadomienie. Gdy historia się
 * zmieni (Ctrl+Z, kolejna edycja), powiadomienie znika — jego „Cofnij” nie
 * mogłoby już zrobić tego, co obiecuje.
 *
 * @param {object} args
 * @param {import('./ToastManager.js').ToastManager} args.toasts
 * @param {{ topUndoToken(): any, undoIf(token): boolean, subscribe(listener): () => void }} args.history  CommandBus
 * @param {string} args.message
 * @param {string} args.label   podpis przycisku (np. „Cofnij”)
 */
export function showUndoToast({ toasts, history, message, label }) {
    const token = history?.topUndoToken?.() ?? null;
    if (!token) return toasts.show({ message });
    let unsubscribe = null;
    const id = toasts.show({
        message,
        action: { label, run: () => history.undoIf(token) },
        onDismiss: () => unsubscribe?.(),
    });
    unsubscribe = history.subscribe(() => {
        if (history.topUndoToken() !== token) toasts.dismiss(id);
    });
    return id;
}
