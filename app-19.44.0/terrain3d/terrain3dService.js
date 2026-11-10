import { createElement as h, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/**
 * 19.41.0 — „Teren 3D”: stan otwarcia widoku i host okna. Ten plik jest lekki (bez Three.js) — okno i scena
 * ładują się przez import() dopiero przy pierwszym otwarciu.
 *
 * terrain3d.open({ geometries: [{ type, coordinates }] (EPSG:2180), label, kind: 'parcel' | 'object' | 'line', lines? })
 */
let state = { request: null, seq: 0 };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const terrain3d = {
    open(request) {
        if (!request?.geometries?.length) throw new Error('Brak obszaru do widoku 3D.');
        state = { request, seq: state.seq + 1 }; emit();
    },
    close() { state = { request: null, seq: state.seq }; emit(); },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    getSnapshot() { return state; },
};

/** Linie i wieloboki projektu (ObjectManager, EPSG:2180) w zasięgu obszaru → linie na modelu (profile, obrysy). */
export function projectLines(objectManager, extent, skipIds = []) {
    const out = [];
    const items = objectManager?.getSnapshot?.()?.items ?? [];
    for (const item of items) {
        if (item.visible === false || skipIds.includes(item.id)) continue;
        let g = null;
        try { g = objectManager.getObject(item.id)?.geometry; } catch { g = null; }
        if (!g) continue;
        const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
        for (const coords of lines) {
            if (!coords.some(([x, y]) => x >= extent[0] && x <= extent[2] && y >= extent[1] && y <= extent[3])) continue;
            out.push({ coords, color: g.type === 'LineString' ? 0x1d4ed8 : 0x7c3aed, name: item.name });
        }
    }
    return out.slice(0, 40);
}

export function Terrain3DHost({ objects }) {
    const snapshot = useSyncExternalStore(terrain3d.subscribe, terrain3d.getSnapshot, terrain3d.getSnapshot);
    const [View, setView] = useState(null);
    const [loadError, setLoadError] = useState(null);
    useEffect(() => {
        if (!snapshot.request || View) return;
        import('./Terrain3DView.js').then((m) => setView(() => m.Terrain3DView)).catch((e) => setLoadError(e?.message || String(e)));
    }, [snapshot.request, View]);
    if (!snapshot.request) return null;
    if (loadError) return createPortal(h('div', { className: 't3d-backdrop' }, h('div', { className: 't3d-window t3d-window--msg', role: 'alertdialog' }, h('p', null, `Nie udało się wczytać widoku 3D: ${loadError}`), h('button', { type: 'button', className: 't3d-btn', onClick: () => terrain3d.close() }, 'Zamknij'))), document.body);
    if (!View) return createPortal(h('div', { className: 't3d-backdrop' }, h('div', { className: 't3d-window t3d-window--msg', role: 'status' }, 'Wczytywanie widoku 3D…')), document.body);
    return createPortal(h(View, { key: snapshot.seq, request: snapshot.request, objects, onClose: () => terrain3d.close() }), document.body);
}
