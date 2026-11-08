/**
 * 18.0 — biblioteka kontrolek powłoki.
 *
 * Nowe i przebudowane części interfejsu używają tych kontrolek zamiast
 * surowych <button>/<input> z własnymi klasami. Wygląd bierze się wyłącznie
 * z tokenów (10-tokens.css) i reguł .ui-* w 30-shell.css, więc każda funkcja
 * wygląda tak samo: te same wysokości (28 px), rozmiary tekstu, fokus.
 *
 *   Button       przycisk tekstowy: primary | secondary | ghost | danger, size md | sm
 *   NumberField  liczba z etykietą i jednostką
 *   SelectField  lista wyboru z etykietą
 *   TextField    pole tekstowe z etykietą
 *   ColorField   kolor: próbki palety projektu + dowolny kolor
 *   Badge        znacznik: neutral | accent | warning | danger | success
 *   Kbd          skrót klawiszowy
 *   ModalShell   okno nad tłem (paleta poleceń, skróty)
 *
 * 18.1 — kontrolki paneli (Analizy, Eksport, Profil terenu, Działka, Stan źródeł):
 *   PanelShell    ramka panelu: nagłówek z ikoną, tytułem, podtytułem i akcjami, stopka
 *   Section       sekcja z tytułem, opcjonalnym podtytułem i ikoną
 *   Message       komunikat: info | success | warning | danger
 *   Tabs          przełącznik zakładek (strzałki, Home/End)
 *   CheckboxField pole wyboru z etykietą
 *   RangeField    suwak z etykietą i wartością
 *   FileButton    przycisk wyboru pliku
 *   Stats         rząd liczb z podpisami (profil terenu, wyniki)
 *   KeyValue      siatka „etykieta — wartość”
 *   EmptyState    pusty stan z instrukcją
 *
 * 18.2 — Warstwy i Obiekty:
 *   IconButton     przycisk z ikoną i podpowiedzią (dawniej app/components/IconButton.js)
 *   SearchField    pole wyszukiwania z ikoną i przyciskiem czyszczenia
 *   PanelMinimized zminimalizowany panel pływający (jeden przycisk przywracania)
 *   PanelShell     w oknie pływającym także uchwyt przeciągania i uchwyty rozmiaru
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Search, X } from 'lucide-react';
import { t } from '../../i18n/index.js';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', size = 'md', icon = null, className = '', children, ...props }) {
    return h('button', {
        type: 'button',
        ...props,
        className: cx('ui-button', `ui-button--${variant}`, size === 'sm' && 'ui-button--sm', className),
    }, icon, children != null && h('span', { className: 'ui-button-label' }, children));
}

function FieldShell({ label, title, className = '', children }) {
    return h('label', { className: cx('ui-field', className), title: title || undefined },
        label && h('span', { className: 'ui-field-label' }, label),
        children);
}

/**
 * Pole liczbowe z wersją roboczą: wpisywany tekst nie jest poprawiany w trakcie
 * pisania (wcześniej „12” przy min 3 stawało się 3, a potem 20). Wartość trafia
 * do onChange dopiero, gdy jest liczbą w zakresie [min, max]; po wyjściu
 * z pola (albo Enter) niepoprawny tekst wraca do bieżącej wartości.
 */
export function NumberField({ label, value, onChange, unit = null, min, max, step = 1, disabled = false, title, width = null, ariaLabel, className = '' }) {
    const [draft, setDraft] = useState(null);
    const startValue = useRef(null);
    const hasMin = min !== undefined && min !== null;
    const hasMax = max !== undefined && max !== null;
    const toNumber = (text) => {
        const trimmed = String(text ?? '').trim().replace(',', '.');
        if (trimmed === '' || trimmed === '-' || trimmed.endsWith('.')) return null;
        const number = Number(trimmed);
        return Number.isFinite(number) ? number : null;
    };
    const clamp = (number) => Math.min(hasMax ? Number(max) : Infinity, Math.max(hasMin ? Number(min) : -Infinity, number));
    // W trakcie pisania przyjmowane są tylko wartości w zakresie (bez
    // „poprawiania” pod kursorem). Po zatwierdzeniu (Enter, wyjście z pola)
    // liczba spoza zakresu jest przycinana do granicy — tak jak robiły to
    // menedżery w 18.0 — zamiast cofać się do ostatniego prefiksu (6000 → 600).
    const parse = (text) => {
        const number = toNumber(text);
        return number !== null && clamp(number) === number ? number : null;
    };
    const commit = () => {
        if (draft !== null) {
            const number = toNumber(draft);
            if (number !== null && clamp(number) !== number) onChange?.(String(clamp(number)));
        }
        setDraft(null);
    };
    const current = toNumber(draft ?? value);
    return h(FieldShell, { label, title, className: cx('ui-field--number', className) },
        h('span', { className: cx('ui-control', 'ui-number', disabled && 'is-disabled') },
            h('input', {
                type: 'text', inputMode: 'decimal', disabled,
                role: 'spinbutton',
                value: draft ?? (value ?? ''),
                style: width ? { width } : undefined,
                'aria-label': ariaLabel ?? (label && unit ? `${label} [${unit}]` : label),
                'aria-valuemin': hasMin ? Number(min) : undefined,
                'aria-valuemax': hasMax ? Number(max) : undefined,
                'aria-valuenow': current ?? undefined,
                'aria-invalid': draft !== null && parse(draft) === null ? true : undefined,
                onFocus: () => { startValue.current = value; },
                onChange: (event) => {
                    const text = event.target.value;
                    setDraft(text);
                    const number = parse(text);
                    if (number !== null) onChange?.(String(number));
                },
                onBlur: commit,
                onKeyDown: (event) => {
                    if (event.key === 'Enter') { commit(); event.currentTarget.blur(); }
                    else if (event.key === 'Escape') {
                        // Escape wraca do wartości sprzed edycji (także gdy prefiksy
                        // w zakresie zostały już przyjęte w trakcie pisania).
                        if (draft !== null && startValue.current !== null && String(startValue.current) !== String(value)) onChange?.(String(startValue.current));
                        setDraft(null);
                    }
                    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        const base = toNumber(draft ?? value) ?? 0;
                        const next = clamp(Math.round((base + (event.key === 'ArrowUp' ? 1 : -1) * Number(step)) * 1000) / 1000);
                        setDraft(null);
                        onChange?.(String(next));
                    }
                },
            }),
            unit && h('span', { className: 'ui-unit', 'aria-hidden': true }, unit)));
}

function selectOptions(options) {
    // Opcje z polem `group` trafiają do <optgroup> (kolejność grup jak w danych).
    const groups = [];
    const byGroup = new Map();
    for (const option of options) {
        const key = option.group ?? null;
        if (!byGroup.has(key)) { byGroup.set(key, []); groups.push(key); }
        byGroup.get(key).push(option);
    }
    const render = (option) => h('option', { key: option.value, value: option.value, disabled: option.disabled || undefined }, option.label);
    return groups.map((group) => (group === null
        ? byGroup.get(group).map(render)
        : h('optgroup', { key: `group-${group}`, label: group }, byGroup.get(group).map(render))));
}

export function SelectField({ label, value, onChange, options = [], disabled = false, title, width = null, ariaLabel, className = '' }) {
    return h(FieldShell, { label, title, className },
        h('select', {
            className: 'ui-control ui-select', value, disabled,
            style: width ? { width } : undefined,
            'aria-label': ariaLabel ?? label,
            onChange: (event) => onChange?.(event.target.value),
        }, selectOptions(options)));
}

export function TextField({ label, value, onChange, maxLength, disabled = false, title, width = null, ariaLabel, placeholder, type = 'text', className = '' }) {
    return h(FieldShell, { label, title, className },
        h('input', {
            className: 'ui-control ui-text', type, value: value ?? '', maxLength, disabled, placeholder,
            style: width ? { width } : undefined,
            'aria-label': ariaLabel ?? label,
            onChange: (event) => onChange?.(event.target.value),
        }));
}

export function ColorField({ label, value, onChange, presets = [], customLabel = t('color.custom'), presetsLabel = t('color.presets') }) {
    return h('div', { className: 'ui-field ui-field--color', role: 'group', 'aria-label': label },
        label && h('span', { className: 'ui-field-label' }, label),
        h(DropdownMenu.Root, null,
            h(DropdownMenu.Trigger, { asChild: true },
                h('button', { type: 'button', className: 'ui-control ui-swatch-trigger', 'aria-label': `${label}: ${presetsLabel}`, title: presetsLabel },
                    h('span', { className: 'ui-swatch', style: { backgroundColor: value } }))),
            h(DropdownMenu.Portal, null,
                h(DropdownMenu.Content, { className: 'dropdown-content color-palette-menu', sideOffset: 8, align: 'start' },
                    h(DropdownMenu.Label, { className: 'dropdown-label' }, presetsLabel),
                    h('div', { className: 'preset-color-grid' }, presets.map((color) => h(DropdownMenu.Item, {
                        key: color, className: 'preset-color-item', 'aria-label': color, title: color,
                        onSelect: () => onChange?.(color),
                    }, h('span', { className: 'preset-color-swatch', style: { backgroundColor: color } }))))))),
        h('input', {
            className: 'ui-color-input', type: 'color', value,
            title: customLabel, 'aria-label': customLabel,
            onChange: (event) => onChange?.(event.target.value),
        }));
}

export function Badge({ tone = 'neutral', title, children }) {
    return h('span', { className: cx('ui-badge', `ui-badge--${tone}`), title: title || undefined }, children);
}

export function Kbd({ children }) {
    return h('kbd', { className: 'ui-kbd' }, children);
}

/** Okno nad tłem z zamykaniem Escape i kliknięciem w tło; fokus wraca na poprzedni element. */
export function ModalShell({ label, onClose, className = '', initialFocusRef = null, children }) {
    const windowRef = useRef(null);
    useEffect(() => {
        const previous = document.activeElement;
        const target = initialFocusRef?.current ?? windowRef.current?.querySelector('input, button, [tabindex]');
        target?.focus?.();
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose?.();
                return;
            }
            // Pułapka fokusu: Tab i Shift+Tab krążą wewnątrz okna (aria-modal),
            // zamiast wychodzić do wyszukiwarki i doku pod tłem.
            if (event.key !== 'Tab' || !windowRef.current) return;
            const focusable = [...windowRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const inside = windowRef.current.contains(document.activeElement);
            if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus(); }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            if (previous && typeof previous.focus === 'function') previous.focus();
        };
    }, [onClose, initialFocusRef]);
    return h('div', { className: 'dialog-backdrop ui-modal-backdrop', onPointerDown: (event) => { if (event.target === event.currentTarget) onClose?.(); } },
        h('section', { ref: windowRef, className: cx('ui-modal', className), role: 'dialog', 'aria-modal': true, 'aria-label': label }, children));
}

/* ------------------------------------------------------------------ 18.1 -- */

export function PanelShell({
    className = '', label, icon = null, title, subtitle = null, actions = null, toolbar = null, footer = null,
    docked = false, style, headerClassName = '', children, before = null,
    // 18.2: okno pływające — uchwyt przeciągania w nagłówku i uchwyty rozmiaru.
    onDragStart = null, onResizeWidth = null, onResizeHeight = null, resizeSide = 'left',
}) {
    const floating = !docked;
    return h('aside', { className: cx('ui-panel compact-panel', className, docked ? 'is-docked' : 'panel-enter'), style, 'aria-label': label ?? title },
        floating && onResizeWidth && h('div', {
            className: cx('panel-resizer', resizeSide === 'right' && 'panel-resizer--right'),
            role: 'separator', 'aria-orientation': 'vertical', 'aria-label': t('panel.resizeWidth', { title }), onPointerDown: onResizeWidth,
        }),
        floating && onResizeHeight && h('div', {
            className: 'panel-height-resizer', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': t('panel.resizeHeight', { title }), onPointerDown: onResizeHeight,
        }),
        before,
        h('div', { className: cx('panel-header panel-header--compact ui-panel-head', headerClassName) },
            floating && onDragStart && h('span', { className: 'panel-drag-handle', title: t('panel.drag'), onPointerDown: onDragStart, 'aria-hidden': true }),
            h('div', { className: 'panel-title panel-title--compact', role: 'heading', 'aria-level': 2, tabIndex: -1 },
                icon,
                h('div', null, h('strong', null, title), subtitle != null && h('span', { title: typeof subtitle === 'string' ? subtitle : undefined }, subtitle))),
            toolbar,
            actions),
        children,
        footer != null && h('div', { className: 'panel-footer panel-footer--compact' }, h('span', null, footer)));
}

/** Przycisk z samą ikoną; podpis jest nazwą dostępną i podpowiedzią. */
export function IconButton({ label, children, className = '', tooltipSide = 'right', ...buttonProps }) {
    return h(Tooltip.Root, null,
        h(Tooltip.Trigger, { asChild: true },
            h('button', { type: 'button', className: cx('icon-button', className), 'aria-label': label, ...buttonProps }, children)),
        h(Tooltip.Portal, null,
            h(Tooltip.Content, { className: 'tooltip-content', side: tooltipSide, sideOffset: 8 }, label, h(Tooltip.Arrow, { className: 'tooltip-arrow' }))));
}

/** Zminimalizowany panel pływający: jeden przycisk przywracający panel. */
export function PanelMinimized({ className = '', title, icon, style, onRestore, label, restoreLabel }) {
    const restore = restoreLabel ?? t('panel.restore', { title });
    return h('aside', { className: cx('compact-panel panel-minimized', className), style, 'aria-label': label ?? t('panel.minimized', { title }) },
        h('button', { type: 'button', className: 'panel-mini-button', title: restore, 'aria-label': restore, onClick: onRestore }, icon));
}

/** Pole wyszukiwania: ikona, pole typu search i przycisk czyszczenia (Escape też czyści). */
export function SearchField({ value, onChange, placeholder, ariaLabel, className = '', disabled = false }) {
    return h('label', { className: cx('ui-search', disabled && 'is-disabled', className) },
        h(Search, { size: 14, 'aria-hidden': true }),
        h('input', {
            type: 'search', value, placeholder, disabled, 'aria-label': ariaLabel ?? placeholder,
            onChange: (event) => onChange?.(event.currentTarget.value),
            onKeyDown: (event) => { if (event.key === 'Escape' && value) { event.stopPropagation(); onChange?.(''); } },
        }),
        value ? h('button', { type: 'button', className: 'ui-search-clear', title: t('search.clear'), 'aria-label': t('search.clear'), onClick: () => onChange?.('') }, h(X, { size: 13 })) : null);
}

export function Section({ title, subtitle = null, icon = null, actions = null, className = '', children, ariaLabel }) {
    return h('section', { className: cx('ui-section', className), 'aria-label': ariaLabel ?? (typeof title === 'string' ? title : undefined) },
        (title || actions) && h('div', { className: 'ui-section-head' },
            icon && h('span', { className: 'ui-section-icon', 'aria-hidden': true }, icon),
            h('div', { className: 'ui-section-titles' },
                title && h('strong', { className: 'ui-section-title' }, title),
                subtitle && h('span', { className: 'ui-section-subtitle' }, subtitle)),
            actions),
        children);
}

export function Message({ tone = 'info', role, title, children, className = '' }) {
    return h('div', {
        className: cx('ui-message', `ui-message--${tone}`, className),
        role: role ?? (tone === 'danger' ? 'alert' : 'status'),
        title: title || undefined,
    }, children);
}

/**
 * Zakładki (role tablist/tab). Z `idBase` każda zakładka wskazuje panel
 * treści (aria-controls), a treść dostaje atrybuty z tabPanelProps(idBase, value).
 */
export function tabPanelProps(idBase, value) {
    return { id: `${idBase}-panel`, role: 'tabpanel', 'aria-labelledby': `${idBase}-tab-${value}` };
}

export function Tabs({ value, onChange, items, label, className = '', size = 'md', idBase = null }) {
    const onKeyDown = (event) => {
        const index = items.findIndex((item) => item.value === value);
        let next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % items.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        if (next === null) return;
        event.preventDefault();
        onChange?.(items[next].value);
        event.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
    };
    return h('div', { className: cx('ui-tabs', size === 'sm' && 'ui-tabs--sm', className), role: 'tablist', 'aria-label': label, onKeyDown },
        items.map((item) => h('button', {
            key: item.value,
            type: 'button',
            role: 'tab',
            id: idBase ? `${idBase}-tab-${item.value}` : undefined,
            'aria-controls': idBase ? `${idBase}-panel` : undefined,
            className: cx('ui-tab', item.value === value && 'is-active', item.className),
            'aria-selected': item.value === value,
            tabIndex: item.value === value ? 0 : -1,
            disabled: item.disabled || undefined,
            title: item.title || undefined,
            onClick: () => onChange?.(item.value),
        }, item.label)));
}

export function CheckboxField({ label, checked, onChange, disabled = false, title, className = '', hint = null, ariaLabel, indeterminate = false }) {
    return h('label', { className: cx('ui-check', disabled && 'is-disabled', className), title: title || undefined },
        h('input', {
            type: 'checkbox', checked: Boolean(checked), disabled, 'aria-label': ariaLabel,
            ref: (node) => { if (node) node.indeterminate = Boolean(indeterminate) && !checked; },
            onChange: (event) => onChange?.(event.target.checked),
        }),
        h('span', { className: 'ui-check-label' }, label),
        hint && h('small', { className: 'ui-check-hint' }, hint));
}

export function RangeField({ label, value, onChange, min, max, step = 1, disabled = false, format = (v) => v, ariaLabel, className = '' }) {
    return h('label', { className: cx('ui-field ui-field--range', className) },
        label && h('span', { className: 'ui-field-label' }, label),
        h('input', { className: 'ui-range', type: 'range', min, max, step, value, disabled, 'aria-label': ariaLabel ?? label, onChange: (event) => onChange?.(event.target.value) }),
        h('output', { className: 'ui-range-value' }, format(value)));
}

export function FileButton({ accept, onFile, children, ...buttonProps }) {
    const inputRef = useRef(null);
    return h('span', { className: 'ui-file-button' },
        h(Button, { ...buttonProps, onClick: () => inputRef.current?.click() }, children),
        h('input', {
            ref: inputRef, className: 'visually-hidden', type: 'file', accept, tabIndex: -1, 'aria-hidden': true,
            onChange: (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile?.(file); },
        }));
}

export function Stats({ items, className = '' }) {
    return h('div', { className: cx('ui-stats', className) },
        items.filter(Boolean).map((item) => h('span', { key: item.label, className: 'ui-stat' },
            h('strong', null, item.value), h('small', null, item.label))));
}

export function KeyValue({ rows, className = '' }) {
    return h('dl', { className: cx('ui-kv', className) },
        rows.filter(Boolean).flatMap(([label, value]) => [
            h('dt', { key: `${label}-k` }, label),
            h('dd', { key: `${label}-v`, title: typeof value === 'string' ? value : undefined }, value),
        ]));
}

export function EmptyState({ icon = null, title, children }) {
    return h('div', { className: 'ui-empty' },
        icon && h('div', { className: 'ui-empty-icon', 'aria-hidden': true }, icon),
        h('strong', null, title),
        children && h('p', null, children));
}
