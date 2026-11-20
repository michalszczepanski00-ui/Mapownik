import { Trash2 } from 'lucide-react';
import { IconButton } from './IconButton.js';
import { removeObjectWithUndo } from '../../features/builtin/objectsFeature.js';
import { createElement as h } from 'react';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { ContextField, ObjectMeasures } from './ContextBar.js';
import { ObjectActions } from './ObjectActions.js';
import { TextField } from '../ui/index.js';
const EMPTY_BUFFER = Object.freeze({ active: false });
export function ObjectInspector({ object, presentation = 'panel' }) {
    const ctx = useService('featureContext');
    const features = useService('features');
    const buffer = useServiceSnapshot('buffer', EMPTY_BUFFER);
    if (!object || !ctx || !features) return null;
    const fields = features.list('objectFields').filter((entry) => entry.appliesTo(object)).flatMap((entry) => entry.fields(object, ctx));
    const actionsAllowed = !buffer.active && !Number.isFinite(object.properties?.bufferDistanceMeters);
    // 19.15.0: zwarty nagłówek — nazwa, miary i „Działania” w jednym wierszu; nazwa do
    // edycji w „Parametry i wygląd” (wcześniej 6 przycisków i pole nazwy ~170 px).
    // 19.24.0: 'window' — okno „Zaawansowane” paska stylu (jak dawna lewa karta 'workspace').
    const wide = presentation === 'workspace' || presentation === 'window';
    return h('section', { className: `object-inspector object-inspector--compact${wide ? ' object-inspector--workspace' : ''}`, style: wide ? { padding: '10px 12px 12px', boxSizing: 'border-box', minWidth: 0 } : undefined, 'aria-label': `Właściwości: ${object.name}` },
        h('div', { className: 'object-inspector-head' },
            h('div', { className: 'object-inspector-title' },
                h('h3', { title: object.name }, object.name),
                h(ObjectMeasures, { object })),
            actionsAllowed && h(ObjectActions, { object, menu: true }),
            wide && h(IconButton, { label: `Usuń: ${object.name}`, onClick: () => {
                void removeObjectWithUndo(ctx, object.id).catch((error) => ctx.toasts?.show({ tone: 'danger', message: error instanceof Error ? error.message : String(error) }));
            } }, h(Trash2, { size: 16 }))),
        object.kind === 'road' && h('p', { className: 'object-quality-note' }, 'Symulacja orientacyjna · tor przedniej osi · zestaw 16,5 m. Czerwony obrys oznacza nadwozie, linia przerywana — ślady kół. Wynik nie ocenia kolizji z otoczeniem.'),
        h('details', { className: 'object-properties', open: wide || ['circle', 'text', 'callout', 'road'].includes(object.kind) || undefined },
            h('summary', null, 'Nazwa, parametry i wygląd'),
            h('div', { className: 'object-properties-fields' },
                h(TextField, { label: 'Nazwa obiektu', value: object.name, maxLength: 120, onChange: (value) => ctx.get('objectCommands').setName(object.id, value) }),
                fields.map((field) => h(ContextField, { key: field.id, field })))));
}
