import { createElement as h, useEffect, useRef, useState } from 'react';
import { Info, RotateCcw, RotateCw } from 'lucide-react';
import { ToolIcon } from '../icons/tablerIcons.js';
import { IconButton } from './IconButton.js';
import { Badge, Button, ColorField, NumberField, SelectField, TextField } from '../ui/index.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { t } from '../../i18n/index.js';
import { openPanel, useAppDispatch } from '../../store/index.js';
import { formatArea, formatLength } from '../../core/units.js';

const EMPTY_TOOLS = Object.freeze({ items: [], loadingCount: 0, errorCount: 0 });
const EMPTY_OBJECTS = Object.freeze({ count: 0, visibleCount: 0, selectedId: null, items: [] });
const IDLE_SKETCH = Object.freeze({ active: false });
const NO_SERVICE = '__none__';


// 18.11.1: jednostki z jednego miejsca (core/units.js).
export { formatArea, formatLength };

/** Obrót o zadany krok — krok jest stanem paska, nie obiektu. */
function RotateField({ field }) {
    const [step, setStep] = useState(field.step ?? 15);
    return h('div', { className: 'ui-field ui-field--rotate', role: 'group', 'aria-label': field.label },
        h('span', { className: 'ui-field-label' }, field.label),
        h(IconButton, { label: t('context.rotateLeft', { step }), tooltipSide: 'bottom', onClick: () => field.onRotate?.(-step) }, h(RotateCcw, { size: 16 })),
        h(NumberField, { value: step, min: 0.1, max: 360, step: 0.5, unit: '°', ariaLabel: t('context.rotationStep'), title: t('context.rotationStep'), onChange: (value) => setStep(Number(value)) }),
        h(IconButton, { label: t('context.rotateRight', { step }), tooltipSide: 'bottom', onClick: () => field.onRotate?.(step) }, h(RotateCw, { size: 16 })));
}

/** Rysuje pole z deskryptora (features/defineFeature.js → FieldDescriptor). */
export function ContextField({ field }) {
    switch (field.type) {
        case 'number':
            return h(NumberField, { label: field.label, value: field.value, onChange: field.onChange, unit: field.unit, min: field.min, max: field.max, step: field.step, disabled: field.disabled, title: field.title, width: field.width });
        case 'select':
            return h(SelectField, { label: field.label, value: field.value, onChange: field.onChange, options: field.options, disabled: field.disabled, title: field.title, width: field.width });
        case 'text':
            return h(TextField, { label: field.label, value: field.value, onChange: field.onChange, maxLength: field.maxLength, disabled: field.disabled, title: field.title, width: field.width });
        case 'color':
            return h(ColorField, { label: field.label, value: field.value, onChange: field.onChange, presets: field.presets, customLabel: t('context.customColor'), presetsLabel: t('context.presetColors') });
        case 'badge':
            return h(Badge, { tone: field.tone ?? 'neutral', title: field.title }, field.label);
        case 'button':
            return h(Button, { size: 'sm', variant: field.tone === 'danger' ? 'danger' : 'secondary', title: field.title, disabled: field.disabled, onClick: field.onClick }, field.label);
        case 'readout':
            return h('span', { className: 'ui-readout', title: field.title || undefined },
                h('span', { className: 'ui-field-label' }, field.label), h('strong', null, field.value));
        case 'rotate':
            return h(RotateField, { field });
        default:
            return null;
    }
}

/**
 * 19.0.0: pole i obwód poligonu albo długość linii dla zaznaczonego obiektu.
 * Wcześniej po zakończeniu rysowania nie było ich nigdzie (odczyt istniał tylko w trakcie szkicu),
 * więc zaznaczony „Poligon 1" nie mówił nic o swojej wielkości.
 */
export function ObjectMeasures({ object }) {
    const measures = object?.measures;
    if (!measures) return null;
    const parts = measures.type === 'polygon'
        ? [[t('context.area'), formatArea(measures.areaM2)], [t('context.perimeter'), formatLength(measures.perimeterM)]]
        : measures.type === 'line' ? [[t('context.length'), formatLength(measures.lengthM)]] : [];
    if (!parts.length) return null;
    return h('div', { className: 'context-readouts context-readouts--object', role: 'group', 'aria-label': t('context.objectMeasures') },
        parts.map(([label, value]) => h('span', { key: label, className: 'ui-readout', title: `${label}: ${value}` },
            h('span', { className: 'ui-field-label' }, label), h('strong', null, value))));
}

function SketchReadout({ sketch }) {
    if (!sketch.active) return null;
    const parts = [];
    if (sketch.type === 'line') parts.push([t('context.length'), formatLength(sketch.lengthM)]);
    if (sketch.type === 'polygon') {
        parts.push([t('context.area'), formatArea(sketch.areaM2)]);
        parts.push([t('context.perimeter'), formatLength(sketch.perimeterM)]);
    }
    if (!parts.length) return null;
    return h('div', { className: 'context-readouts', role: 'status', 'aria-live': 'polite' },
        parts.map(([label, value]) => h('span', { key: label, className: 'ui-readout ui-readout--live' },
            h('span', { className: 'ui-field-label' }, label), h('strong', null, value))));
}

/**
 * 18.0 — pasek kontekstu pod paskiem aplikacji. ZAWSZE obecny i o stałej
 * wysokości, więc zaznaczenie obiektu nie przesuwa już mapy, palety i doku
 * (wcześniej: 43 px w każdej rozdzielczości).
 *
 * Lewa część — aktywne narzędzie: nazwa, jedno zdanie instrukcji, parametry
 * narzędzia (np. odległość bufora), bieżący pomiar szkicu i przyciski
 * Zakończ / Anuluj. Prawa część — zaznaczony obiekt: nazwa i pola z etykietami.
 *
 * Pasek nie zna żadnej funkcji z nazwy: instrukcje i parametry narzędzi oraz
 * pola obiektów pochodzą z deklaracji funkcji (slot tools.options/hint
 * i objectFields w features/).
 */
export function ContextBar({ presentation = 'bar' } = {}) {
    const dispatch = useAppDispatch();
    const ctx = useService('featureContext');
    const features = useService('features');
    useServiceSnapshot('settings', null);
    const tools = useServiceSnapshot('tools', EMPTY_TOOLS);
    const objects = useServiceSnapshot('objects', EMPTY_OBJECTS);
    const sketch = useServiceSnapshot('sketch', IDLE_SKETCH);

    const activeTools = tools.items.filter((item) => item.active);
    const activeTool = activeTools.find((item) => item.id !== 'core.pan') ?? activeTools[0] ?? tools.items.find((item) => item.id === 'core.pan') ?? null;
    const toolDef = activeTool ? features?.getTool(activeTool.id) : null;
    // Odświeżenie przy zmianie stanu serwisu narzędzia (np. odległość bufora, rozpoczęty szkic).
    useServiceSnapshot(toolDef?.service ?? NO_SERVICE, null);

    // 18.11.0: na telefonie odczyt szkicu i Zakończ/Anuluj pływają nad mapą tuż pod
    // paskiem (wcześniej były poza ekranem w przewijanym poziomo pasku).
    const barRef = useRef(null);
    const [sketchTop, setSketchTop] = useState(null);
    useEffect(() => {
        if (!sketch.active) return undefined;
        const measure = () => {
            const rect = barRef.current?.getBoundingClientRect();
            if (rect) setSketchTop(Math.round(rect.bottom + 8));
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [sketch.active]);

    const selected = objects.items.find((item) => item.id === objects.selectedId) ?? null;


    if (!ctx || !features) return h('div', { className: 'context-bar is-idle', role: 'toolbar', 'aria-label': t('context.tool') });

    let helpHint = '';
    let options = [];
    try {
        helpHint = typeof toolDef?.hint === 'function' ? toolDef.hint(ctx) : (toolDef?.hint ?? '');
        options = toolDef?.options ? toolDef.options(ctx) : [];
    } catch (error) {
        console.error(`[narzędzie ${toolDef?.id}]`, error);
    }
    const sketchOwner = sketch.active ? ctx.interactions.activeSketch() : null;
    const title = toolDef?.id === 'core.pan' ? t('tool.pan.title') : (activeTool?.title ?? t('tool.pan.title'));
    const toolHelp = [toolDef?.description, helpHint, activeTool?.error].filter(Boolean).join(' ');

    // 18.7: „bogaty” pasek (parametry narzędzia albo zaznaczony obiekt) ma
    // własny wiersz także w niskich oknach; „pusty” (samo narzędzie i
    // instrukcja, także w trakcie szkicu — odczyt i Zakończ/Anuluj mieszczą się
    // w linii) w niskich oknach wsuwa się do paska aplikacji (30-shell.css,
    // @media max-height: 780px). Szkic celowo NIE czyni paska bogatym: pierwsze
    // kliknięcie rysowania nie może przesunąć mapy o wysokość wiersza.
    const rich = Boolean(selected) || options.length > 0;
    return h('div', { ref: barRef, style: presentation === 'card' && activeTool?.id === 'core.select' ? { padding: '12px', boxSizing: 'border-box', maxWidth: '100%' } : undefined, className: `context-bar ${rich ? 'is-rich' : 'is-idle'}${sketch.active ? ' is-sketching' : ''}${presentation === 'card' ? ' context-bar--card' : ''}`, role: 'toolbar', 'aria-label': t('context.tool') },
        h('section', { className: 'context-zone context-zone--tool', 'aria-label': t('context.tool') },
            h('span', { className: 'context-tool-icon', 'aria-hidden': true }, h(ToolIcon, { name: activeTool?.icon ?? 'pan', size: 18, strokeWidth: 1.9 })),
            h('strong', { className: 'context-tool-name' }, title),
            toolHelp && h(IconButton, { className: 'context-tool-help', label: `${t('context.toolHelp', { title })}. ${toolHelp}`, tooltipSide: 'bottom' }, h(Info, { size: 15 })),
            h('span', { className: 'context-next-step', role: 'status', title: helpHint }, helpHint),
            options.length > 0 && h('div', { className: 'context-fields' }, options.map((field) => h(ContextField, { key: field.id, field }))),
            sketch.active && h('div', { className: 'context-sketch', style: sketchTop != null ? { '--sketch-top': `${sketchTop}px` } : undefined },
                h(SketchReadout, { sketch }),
                sketchOwner?.undoLastPoint && h(Button, { size: 'sm', variant: 'secondary', onClick: () => ctx.interactions.undoLastPoint(), title: 'Backspace' }, 'Cofnij punkt'),
                sketchOwner?.finishSketch && h(Button, { size: 'sm', variant: 'primary', disabled: sketch.type === 'line' ? !(sketch.vertices >= 3 && sketch.lengthM > 0.01) : sketch.type === 'polygon' ? !(sketch.vertices >= 4 && sketch.areaM2 > 0.01) : false, onClick: () => ctx.interactions.finishActiveSketch(), title: 'Enter' }, t('context.finish')),
                sketchOwner && h(Button, { size: 'sm', variant: 'ghost', onClick: () => ctx.interactions.abortActiveSketch(), title: 'Esc' }, t('context.cancel'))),
            ),
        // 18.11.1: w trakcie szkicu pasek nie pokazuje pól poprzedniego obiektu.
        selected && !sketch.active && presentation !== 'card' && h('section', { className: `context-zone context-zone--object${selected.measures ? ' has-measures' : ''}`, 'aria-label': t('context.object') },
            h('span', { className: 'context-object-label' }, t('context.object')),
            h('span', { className: 'context-object-name', title: selected.name }, selected.name),
            h(ObjectMeasures, { object: selected }),
            h(Button, { size: 'sm', onClick: () => dispatch(openPanel('objects')) }, 'Działania i właściwości')));
}
