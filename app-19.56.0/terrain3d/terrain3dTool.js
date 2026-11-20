import { suspendOtherInteractionModes } from '../tools/builtins/interactionCoordinator.js';
import { parseParcelWkt } from '../parcels/wkt.js';
import { terrain3d } from './terrain3dService.js';

/**
 * 19.41.0 — wejścia do widoku „Teren 3D”: działka z karty, obiekt z projektu, narzędzie Mierz → Teren 3D.
 * Narzędzie: działka z karty albo zaznaczony wielobok/linia otwiera widok od razu; w przeciwnym razie
 * włącza „Sprawdź” i otwiera widok po kliknięciu działki na mapie (jednorazowo).
 */
export const parcelLabel = (parcel) => `działka ${parcel.parcel ?? parcel.id}${parcel.region ? `, obręb ${parcel.region}` : ''}`;

export function openParcel3D(parcel) {
    if (!parcel?.wkt) throw new Error('Brak granicy działki — kliknij działkę na mapie jeszcze raz.');
    terrain3d.open({ geometries: [parseParcelWkt(parcel.wkt)], label: parcelLabel(parcel), kind: 'parcel' });
}

export function openObject3D(object) {
    const g = object?.geometry;
    if (!g || !['Polygon', 'MultiPolygon', 'LineString'].includes(g.type)) throw new Error('Widok 3D obsługuje wieloboki, działki i linie.');
    terrain3d.open({ geometries: [g], label: object.name || 'obiekt', kind: g.type === 'LineString' ? 'line' : 'object', objectId: object.id });
}

let pending = null; // oczekiwanie na kliknięcie działki

export function createTerrain3DTool(ctx) {
    return {
        activate() {
            const identify = ctx.get('identify');
            const objects = ctx.get('objects');
            const snap = identify?.getSnapshot?.();
            if (snap?.parcel?.wkt) { openParcel3D(snap.parcel); return; }
            const selectedId = objects?.getSnapshot?.()?.selectedId;
            if (selectedId) {
                let object = null; try { object = objects.getObject(selectedId); } catch { object = null; }
                if (object && ['Polygon', 'MultiPolygon', 'LineString'].includes(object.geometry?.type)) { openObject3D(object); return; }
            }
            pending?.();
            suspendOtherInteractionModes(ctx.coordinator, 'identify');
            ctx.coordinator.editingManager?.setMode('pan');
            identify.activate();
            ctx.toasts?.show?.({ tone: 'info', message: 'Kliknij działkę na mapie — otworzy się widok Teren 3D.' });
            const startedFor = snap?.parcel?.id ?? null;
            const stop = identify.subscribe(() => {
                const s = identify.getSnapshot();
                if (s.parcel?.wkt && !s.parcelBusy && s.parcel.id !== startedFor) { cleanup(); try { openParcel3D(s.parcel); } catch { /* komunikat w karcie */ } }
            });
            const timer = window.setTimeout(() => cleanup(), 120000);
            const cleanup = () => { stop(); window.clearTimeout(timer); if (pending === cleanup) pending = null; };
            pending = cleanup;
        },
    };
}
