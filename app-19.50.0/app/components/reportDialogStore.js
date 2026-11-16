import { createElement as h, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/**
 * 19.46.0 — stan okna „Raport działki PDF” bez samego okna. Karta działki, Eksport i Analizy otwierają raport
 * przez reportDialog.open(parcel); okno (ReportPdfDialog.js z ustawieniami, szablonami i regułami raportu)
 * ładuje się dopiero przy pierwszym otwarciu, a nie przy starcie portalu.
 */
let state = { parcel: null };
const listeners = new Set();
export const reportDialog = {
    open(parcel) { state = { parcel }; listeners.forEach((l) => l()); },
    close() { state = { parcel: null }; listeners.forEach((l) => l()); },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    getSnapshot() { return state; },
};

export function ReportPdfHost() {
    const snapshot = useSyncExternalStore(reportDialog.subscribe, reportDialog.getSnapshot, reportDialog.getSnapshot);
    const [Window, setWindow] = useState(null);
    useEffect(() => {
        if (!snapshot.parcel || Window) return;
        let alive = true;
        import('./ReportPdfDialog.js').then((module) => { if (alive) setWindow(() => module.ReportPdfWindow); }).catch(() => reportDialog.close());
        return () => { alive = false; };
    }, [snapshot.parcel, Window]);
    if (!snapshot.parcel || !Window) return null;
    return createPortal(h(Window, { key: snapshot.parcel.id, parcel: snapshot.parcel }), document.body);
}
