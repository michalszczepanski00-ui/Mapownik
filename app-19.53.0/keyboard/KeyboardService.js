/**
 * 18.0 — jeden nasłuch klawiatury na oknie dla całej aplikacji.
 *
 * Zastępuje osobne nasłuchy: skróty narzędzi (ToolRegistry), Ctrl+Z/Y,
 * Delete i Escape (App.js). Zabezpieczenia są wspólne, więc każde nowe
 * polecenie dostaje je bez przepisywania:
 *  - nie zabiera klawiszy polom tekstowym (chyba że allowInInput),
 *  - otwarte okno dialogowe przejmuje klawiaturę (chyba że allowInDialog),
 *  - spacja na przycisku, linku czy zakładce należy do tego elementu.
 * Komponenty z własną obsługą klawiszy (okna dialogowe, wyszukiwarka,
 * paleta poleceń) nadal obsługują je lokalnie i zatrzymują zdarzenie.
 */

/** Czy spacja na tym elemencie znaczy „uruchom mnie”? */
export function activatedBySpace(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(target.closest('button, a[href], summary, [role="button"], [role="tab"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"]'));
}

/** Czy zdarzenie padło w polu, w którym litery i Delete znaczą pisanie. */
export function isTextEntry(target) {
    const tag = target?.tagName?.toLowerCase?.();
    return Boolean(target?.isContentEditable) || tag === 'input' || tag === 'textarea' || tag === 'select';
}

export class KeyboardService {
    /**
     * @param {import('./CommandRegistry.js').CommandRegistry} registry
     * @param {object} options
     * @param {() => boolean} [options.isDialogOpen]
     * @param {() => object} [options.getContext] kontekst przekazywany do run()/when()
     */
    constructor(registry, { isDialogOpen = () => false, getContext = () => ({}) } = {}) {
        this.registry = registry;
        this.isDialogOpen = isDialogOpen;
        this.getContext = getContext;
        this.target = null;
        this.onKeyDown = (event) => this.handle(event);
    }

    handle(event) {
        if (event.defaultPrevented || event.isComposing) return false;
        const command = this.registry.findByEvent(event);
        if (!command) return false;
        const target = event.target;
        if (!command.allowInInput && isTextEntry(target)) return false;
        if (!command.allowInDialog && this.isDialogOpen()) return false;
        // Spacja i Enter na przycisku, linku czy zakładce należą do tego elementu.
        if ((command.shortcut?.code === 'Space' || command.shortcut?.key === 'Enter') && activatedBySpace(target)) return false;
        const context = this.getContext();
        if (!this.registry.isAvailable(command.id, context)) return false;
        event.preventDefault();
        this.registry.run(command.id, context);
        return true;
    }

    bind(target) {
        if (this.target === target) return;
        this.unbind();
        this.target = target;
        target.addEventListener('keydown', this.onKeyDown);
    }

    unbind() {
        if (!this.target) return;
        this.target.removeEventListener('keydown', this.onKeyDown);
        this.target = null;
    }

    dispose() {
        this.unbind();
    }
}
