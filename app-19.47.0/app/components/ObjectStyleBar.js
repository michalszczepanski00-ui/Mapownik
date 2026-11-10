import { createElement as h, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Settings2, X } from 'lucide-react';
import { IconButton } from './IconButton.js';
import { ContextField } from './ContextBar.js';
import { ObjectInspector } from './ObjectInspector.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { useSketchActive } from '../hooks/useSketchActive.js';

const NO_OBJECTS = Object.freeze({ selectedId: null, items: [] });
const NO_TOOLS = Object.freeze({ items: [] });
const MEASURE_TOOL = /^core\.(measure\.|terrain\.|buffer$)/;
/** Pola pokazywane w pasku — pozostałe (parametry rodzaju obiektu, nazwa, działania) są w oknie „Zaawansowane”. */
const MAIN_FIELDS = Object.freeze(['color', 'strokeWidth', 'pattern', 'strokeOpacity', 'fontSize']);
// 19.25.0: okno poziome — nowy klucz, żeby pozycja wąskiego okna z 19.24.0 nie wypychała go poza mapę.
const WINDOW_PREFS_KEY = 'msportal.objectWindow.v2';
const WINDOW_WIDTH = 720;
const WINDOW_MIN_WIDTH = 560;
const WINDOW_MARGIN = 8;
/** Odstęp od dołu mapy przy domyślnym położeniu: dok narzędzi i pasek stylu. */
const DOCK_CLEARANCE = 112;

function storage() { try { return window.localStorage; } catch { return null; } }
function readPosition() {
    try {
        const value = JSON.parse(storage()?.getItem(WINDOW_PREFS_KEY) ?? 'null');
        return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? { x: value.x, y: value.y } : null;
    } catch { return null; }
}
function clampPosition(position, area, element) {
    const width = area?.clientWidth ?? window.innerWidth;
    const height = area?.clientHeight ?? window.innerHeight;
    const ownWidth = element?.offsetWidth || Math.min(WINDOW_WIDTH, width - 2 * WINDOW_MARGIN);
    const ownHeight = element?.offsetHeight || 200;
    return {
        x: Math.round(Math.min(Math.max(WINDOW_MARGIN, position.x), Math.max(WINDOW_MARGIN, width - ownWidth - WINDOW_MARGIN))),
        y: Math.round(Math.min(Math.max(WINDOW_MARGIN, position.y), Math.max(WINDOW_MARGIN, height - ownHeight - WINDOW_MARGIN))),
    };
}

/**
 * 19.24.0 — okno „Zaawansowane”: pełne właściwości zaznaczonego obiektu (nazwa, miary, wszystkie
 * pola stylu i parametry rodzaju obiektu, działania). Pływa nad mapą, przeciąga się za nagłówek,
 * pamięta położenie. Pokazuje zawsze BIEŻĄCO zaznaczony obiekt.
 */
function ObjectPropertiesWindow({ object, onClose }) {
    const ref = useRef(null);
    const dragCleanup = useRef(null);
    const area = () => ref.current?.parentElement ?? null;
    const [position, setPosition] = useState(() => readPosition());
    const [fitWidth, setFitWidth] = useState(null);
    useEffect(() => {
        if (position) return;
        const width = area()?.clientWidth ?? window.innerWidth;
        const height = area()?.clientHeight ?? window.innerHeight;
        const own = ref.current;
        // Domyślnie wyśrodkowane w wolnej części mapy (między lewą kartą a prawym panelem),
        // tuż nad dokiem narzędzi i paskiem stylu.
        const css = area() ? window.getComputedStyle(area()) : null;
        const inset = (name, fallback = 0) => { const value = parseFloat(css?.getPropertyValue(name) ?? ''); return Number.isFinite(value) ? value : fallback; };
        const left = inset('--work-card-inset-left');
        const right = inset('--dock-inset-right') + inset('--activity-bar-width', 62);
        const free = width - left - right - 2 * WINDOW_MARGIN;
        // Węższa wolna część mapy: okno zwęża się (pola przechodzą do mniejszej liczby kolumn),
        // zamiast zasłaniać lewą kartę albo panel Warstw.
        const ownWidth = Math.max(WINDOW_MIN_WIDTH, Math.min(WINDOW_WIDTH, free));
        if (ownWidth < WINDOW_WIDTH) setFitWidth(ownWidth);
        const x = free >= ownWidth ? left + WINDOW_MARGIN + (free - ownWidth) / 2 : (width - ownWidth) / 2;
        setPosition(clampPosition({ x, y: height - (own?.offsetHeight ?? 200) - DOCK_CLEARANCE }, area(), { offsetWidth: ownWidth, offsetHeight: own?.offsetHeight }));
    }, [position]);
    useEffect(() => {
        const keep = () => setPosition((current) => current && clampPosition(current, area(), ref.current));
        window.addEventListener('resize', keep);
        return () => { window.removeEventListener('resize', keep); dragCleanup.current?.(); };
    }, []);
    useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
    const save = (value) => { try { storage()?.setItem(WINDOW_PREFS_KEY, JSON.stringify(value)); } catch { /* tryb prywatny */ } };
    const dragStart = (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest('button')) return;
        event.preventDefault();
        dragCleanup.current?.();
        const origin = position ?? { x: 0, y: 0 };
        const pointer = { x: event.clientX, y: event.clientY };
        let last = position;
        const move = (next) => { last = clampPosition({ x: origin.x + next.clientX - pointer.x, y: origin.y + next.clientY - pointer.y }, area(), ref.current); setPosition(last); };
        const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); dragCleanup.current = null; if (last) save(last); };
        dragCleanup.current = stop;
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop, { once: true });
        window.addEventListener('pointercancel', stop, { once: true });
    };
    const moveByKeys = (event) => {
        const step = event.shiftKey ? 40 : 10;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta || !position) return;
        event.preventDefault();
        const next = clampPosition({ x: position.x + delta[0], y: position.y + delta[1] }, area(), ref.current);
        setPosition(next); save(next);
    };
    return h('section', {
        ref, className: 'object-window', role: 'dialog', 'aria-modal': false, 'aria-label': `Właściwości zaawansowane: ${object.name}`, tabIndex: -1,
        style: { width: `min(${fitWidth ?? WINDOW_WIDTH}px, calc(100% - ${2 * WINDOW_MARGIN}px))`, ...(position ? { left: `${position.x}px`, top: `${position.y}px` } : { left: 0, top: 0, visibility: 'hidden' }) },
        onKeyDown: (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } },
    },
        h('header', { className: 'object-window-head', onPointerDown: dragStart },
            h('span', { className: 'object-window-grip', tabIndex: 0, role: 'button', 'aria-label': 'Przesuń okno (strzałki)', title: 'Przeciągnij, aby przesunąć okno', onKeyDown: moveByKeys }, h(GripVertical, { size: 15 })),
            h('strong', null, 'Właściwości obiektu'),
            h(IconButton, { label: 'Zamknij właściwości zaawansowane (Esc)', onClick: onClose }, h(X, { size: 15 }))),
        // 19.25.0: układ poziomy — pola w kolumnach (35-workspace-1c.css, .object-window).
        h('div', { className: 'object-window-body' }, h(ObjectInspector, { key: object.id, object, presentation: 'window' })));
}

/**
 * 19.24.0 — pasek stylu zaznaczonego obiektu nad dolnym dokiem narzędzi (zamiast inspektora
 * w lewej karcie). Tylko najczęściej zmieniane pola: kolor, grubość, styl linii, przezroczystość
 * (dla tekstu: kolor i rozmiar). „Zaawansowane” otwiera okno z pełnymi właściwościami.
 * Widoczny wyłącznie przy zaznaczonym obiekcie i poza rysowaniem szkicu.
 */
export function ObjectStyleBar() {
    const ctx = useService('featureContext');
    const features = useService('features');
    const objectsService = useService('objects');
    const objects = useServiceSnapshot('objects', NO_OBJECTS);
    const sketching = useSketchActive();
    // 19.44.0 (audyt 19.43.0): przy narzędziach pomiaru i terenu pasek stylu nie zasłania mapy — działka dodana
    // przyciskiem „Wysokości”/„Bufor” jest zaznaczona, ale użytkownik nie zmienia teraz jej wyglądu.
    const tools = useServiceSnapshot('tools', NO_TOOLS);
    const measuring = (tools.items ?? []).some((item) => item.active && MEASURE_TOOL.test(item.id));
    const [advanced, setAdvanced] = useState(false);
    const [host, setHost] = useState(null);
    const barRef = useRef(null);
    const selected = objects.items.find((item) => item.id === objects.selectedId) ?? null;
    useEffect(() => { setHost(barRef.current?.closest('.map-area') ?? null); });
    useEffect(() => { if (!selected) setAdvanced(false); }, [selected]);
    if (!selected || sketching || measuring || !ctx || !features) return null;
    let fields = [];
    try {
        fields = features.list('objectFields').filter((entry) => entry.appliesTo(selected)).flatMap((entry) => entry.fields(selected, ctx))
            .filter((field) => MAIN_FIELDS.includes(field.id))
            // Podpisy pól są chowane w wąskim oknie — nazwa zostaje w podpowiedzi.
            .map((field) => ({ ...field, title: field.title ?? field.label }));
    } catch (error) {
        console.error('[pasek stylu]', error);
    }
    const deselect = () => { try { objectsService?.select(null); } catch { /* obiekt już usunięty */ } };
    return h('div', { ref: barRef, className: 'tool-dock-row object-style-bar', role: 'toolbar', 'aria-label': `Styl: ${selected.name}` },
        h('span', { className: 'object-style-name', title: selected.name }, selected.name),
        fields.length > 0 && h('div', { className: 'object-style-fields' }, fields.map((field) => h(ContextField, { key: field.id, field }))),
        h('button', { type: 'button', className: `object-style-advanced${advanced ? ' is-active' : ''}`, 'aria-pressed': advanced, 'aria-haspopup': 'dialog', 'aria-label': 'Zaawansowane właściwości obiektu',
            title: 'Wszystkie właściwości obiektu w osobnym oknie', onClick: () => setAdvanced((value) => !value) },
            h(Settings2, { size: 15 }), h('span', null, 'Zaawansowane')),
        h(IconButton, { label: 'Odznacz obiekt', className: 'object-style-close', onClick: deselect }, h(X, { size: 15 })),
        advanced && host && createPortal(h(ObjectPropertiesWindow, { object: selected, onClose: () => setAdvanced(false) }), host));
}
