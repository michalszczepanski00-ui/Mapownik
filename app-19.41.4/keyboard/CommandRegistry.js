import { t } from '../i18n/index.js';

/**
 * 18.0 — wspólny rejestr poleceń i skrótów klawiszowych.
 *
 * Każda akcja, którą da się wywołać z klawiatury albo z palety poleceń
 * (Ctrl+K), jest tu zarejestrowana: narzędzia (z manifestów), polecenia
 * powłoki (cofnij, usuń, Escape, szukaj) i polecenia funkcji. Dzięki temu:
 *  - konflikt skrótu wykrywa się przy rejestracji, dla WSZYSTKICH skrótów
 *    (wcześniej tylko między narzędziami; reszta miała 7 osobnych nasłuchów),
 *  - paleta poleceń i ekran skrótów czytają jedną listę,
 *  - nowa funkcja dodaje polecenie, nie nasłuch na oknie.
 *
 * Skrót: { code: 'KeyB' } (klawisz fizyczny — niezależny od układu),
 * albo { key: 'z', ctrl: true, shift?: bool, alt?: bool }.
 * `ctrl` oznacza Ctrl albo Cmd.
 */

const EMPTY = Object.freeze({ items: [], revision: 0 });

function normalizeShortcut(shortcut) {
    if (!shortcut) return null;
    const code = shortcut.code ?? null;
    const key = shortcut.key ? String(shortcut.key) : null;
    if (!code && !key) throw new Error('Skrót wymaga pola code albo key.');
    return Object.freeze({
        code,
        key: key && key.length === 1 ? key.toLowerCase() : key,
        ctrl: Boolean(shortcut.ctrl),
        shift: Boolean(shortcut.shift),
        alt: Boolean(shortcut.alt),
        label: shortcut.label ?? null,
    });
}

const KEY_LABELS = { Escape: 'Esc', Delete: 'Delete', Backspace: 'Backspace', Enter: 'Enter', ' ': t('key.space') };
const CODE_LABELS = { Space: t('key.space') };

export function shortcutLabel(shortcut) {
    if (!shortcut) return '';
    if (shortcut.label) return [shortcut.ctrl && 'Ctrl', shortcut.shift && 'Shift', shortcut.alt && 'Alt', shortcut.label].filter(Boolean).join('+');
    const base = shortcut.code
        ? (CODE_LABELS[shortcut.code] ?? shortcut.code.replace(/^Key/, '').replace(/^Digit/, ''))
        : (KEY_LABELS[shortcut.key] ?? (shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key));
    return [shortcut.ctrl && 'Ctrl', shortcut.shift && 'Shift', shortcut.alt && 'Alt', base].filter(Boolean).join('+');
}

/** Klucz porównania dwóch skrótów (ten sam klawisz i modyfikatory = konflikt). */
function comboKey(shortcut) {
    const base = shortcut.code ? `code:${shortcut.code}` : `key:${shortcut.key}`;
    return `${base}|${shortcut.ctrl ? 'c' : ''}${shortcut.shift ? 's' : ''}${shortcut.alt ? 'a' : ''}`;
}

/** Czy zdarzenie klawiatury pasuje do skrótu. */
export function matchesShortcut(shortcut, event) {
    if (!shortcut) return false;
    const ctrl = Boolean(event.ctrlKey || event.metaKey);
    if (ctrl !== shortcut.ctrl || Boolean(event.altKey) !== shortcut.alt) return false;
    if (shortcut.code) {
        if (event.code !== shortcut.code) return false;
        return Boolean(event.shiftKey) === shortcut.shift;
    }
    const key = event.key && event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key !== shortcut.key) return false;
    // Znaki pisane z Shiftem (?, !) same w sobie zawierają Shift.
    if (shortcut.key.length === 1 && !/[a-z0-9]/.test(shortcut.key)) return true;
    return Boolean(event.shiftKey) === shortcut.shift;
}

export class CommandRegistry {
    constructor() {
        this.commands = new Map();
        this.listeners = new Set();
        this.snapshot = EMPTY;
        this.revision = 0;
        this.getSnapshot = () => this.snapshot;
        this.subscribe = (listener) => {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        };
    }

    /**
     * @param {object} def
     * @param {string} def.id
     * @param {string} def.title       nazwa w palecie poleceń
     * @param {string} [def.group]     grupa w palecie i na ekranie skrótów
     * @param {object} [def.shortcut]
     * @param {Function} def.run       (context) => void
     * @param {Function} [def.when]    (context) => boolean — czy polecenie jest dostępne teraz
     * @param {boolean} [def.allowInInput]   skrót działa także w polu tekstowym
     * @param {boolean} [def.allowInDialog]  skrót działa przy otwartym oknie dialogowym
     * @param {boolean} [def.hidden]   nie pokazuj w palecie (np. Escape)
     * @param {string[]} [def.keywords] dodatkowe słowa wyszukiwania w palecie
     */
    register(def) {
        if (!def || typeof def.id !== 'string' || !def.id.trim()) throw new Error('Polecenie wymaga identyfikatora.');
        if (typeof def.run !== 'function') throw new Error(`Polecenie ${def.id} wymaga funkcji run().`);
        if (this.commands.has(def.id)) throw new Error(`Polecenie ${def.id} jest już zarejestrowane.`);
        const shortcut = normalizeShortcut(def.shortcut);
        if (shortcut) {
            const key = comboKey(shortcut);
            const clash = [...this.commands.values()].find((other) => other.shortcut && comboKey(other.shortcut) === key);
            if (clash) throw new Error(`Skrót ${shortcutLabel(shortcut)} polecenia ${def.id} jest już używany przez ${clash.id}.`);
        }
        const command = Object.freeze({
            id: def.id,
            title: def.title ?? def.id,
            group: def.group ?? null,
            shortcut,
            shortcutLabel: shortcutLabel(shortcut),
            run: def.run,
            when: typeof def.when === 'function' ? def.when : null,
            allowInInput: Boolean(def.allowInInput),
            allowInDialog: Boolean(def.allowInDialog),
            hidden: Boolean(def.hidden),
            keywords: Array.isArray(def.keywords) ? def.keywords : [],
            order: Number.isFinite(def.order) ? def.order : 1000,
            source: def.source ?? null,
        });
        this.commands.set(command.id, command);
        this.emit();
        return () => this.unregister(command.id);
    }

    unregister(id) {
        if (this.commands.delete(id)) this.emit();
    }

    get(id) {
        return this.commands.get(id) ?? null;
    }

    list() {
        return [...this.commands.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pl'));
    }

    /** Polecenie przypisane do zdarzenia klawiatury (bez sprawdzania warunków dostępności). */
    findByEvent(event) {
        for (const command of this.commands.values()) {
            if (command.shortcut && matchesShortcut(command.shortcut, event)) return command;
        }
        return null;
    }

    isAvailable(id, context) {
        const command = this.get(id);
        if (!command) return false;
        try { return command.when ? Boolean(command.when(context)) : true; }
        catch { return false; }
    }

    run(id, context) {
        const command = this.get(id);
        if (!command) throw new Error(`Nieznane polecenie: ${id}`);
        if (!this.isAvailable(id, context)) return false;
        const result = command.run(context);
        if (result && typeof result.catch === 'function') result.catch((error) => console.error(`[polecenie ${id}]`, error));
        return true;
    }

    emit() {
        this.revision += 1;
        this.snapshot = { items: this.list(), revision: this.revision };
        for (const listener of this.listeners) listener();
    }

    dispose() {
        this.commands.clear();
        this.listeners.clear();
        this.snapshot = EMPTY;
    }
}
