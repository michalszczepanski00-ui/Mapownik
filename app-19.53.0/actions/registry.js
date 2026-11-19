/**
 * 19.53.0 (Etap 3) — rejestr akcji interfejsu ze strefami.
 *
 * Akcja to DANE z deklaracji funkcji (slot `actions` w defineFeature): gdzie stoi przycisk
 * (strefa), jak się nazywa i co robi. Komponenty powłoki rysują strefę z listy rejestru,
 * więc nowa akcja to wpis w funkcji, a nie zmiana komponentu. Ta sama akcja trafia też
 * do palety poleceń (Ctrl+K), chyba że ma `palette: false`.
 *
 * Strefy:
 *   topbar.project        menu Projekt w górnym pasku
 *   contextbar            pasek kontekstowy u góry mapy
 *   inspector.primary     główny przycisk karty działki (najwyżej 1 — jedyny wypełniony)
 *   inspector.secondary   drugi przycisk karty działki (najwyżej 1)
 *   inspector.analyses    menu „Analizy ▾” karty działki
 *   mode:<tryb>           pasek narzędzi trybu (np. mode:terrain)
 *   dock:<panel>          lista w doku panelu (np. dock:analyses)
 *
 * Akcja:
 *   { id, zone, label, order, run(ctx), when?(ctx), hint?, description?, icon?,
 *     separatorBefore?, palette?: boolean, paletteTitle?, keywords? }
 * Każda akcja ma dokładnie jedną strefę — jedna funkcja w jednym miejscu (zasada przebudowy).
 */

export const ACTION_ZONE_LIMITS = Object.freeze({ 'inspector.primary': 1, 'inspector.secondary': 1 });
const FIXED_ZONES = new Set(['topbar.project', 'contextbar', 'inspector.primary', 'inspector.secondary', 'inspector.analyses']);
const PREFIXED_ZONE = /^(mode|dock):[a-zA-Z][a-zA-Z0-9-]*$/;

export function isActionZone(zone) {
    return typeof zone === 'string' && (FIXED_ZONES.has(zone) || PREFIXED_ZONE.test(zone));
}

/** Błędy deklaracji akcji (puste = poprawne). Sprawdzane przy starcie i w teście jednostkowym. */
export function actionErrors(actions) {
    const errors = [];
    const ids = new Set();
    const perZone = new Map();
    for (const action of actions) {
        const name = action?.id ?? '(bez id)';
        if (!action?.id || typeof action.id !== 'string') errors.push('Akcja bez id.');
        else if (ids.has(action.id)) errors.push(`Akcja ${name} jest zadeklarowana dwa razy.`);
        else ids.add(action.id);
        if (Array.isArray(action?.zone)) errors.push(`Akcja ${name}: jedna strefa, nie lista.`);
        else if (!isActionZone(action?.zone)) errors.push(`Akcja ${name}: nieznana strefa „${action?.zone}”.`);
        if (!action?.label) errors.push(`Akcja ${name} nie ma etykiety (label).`);
        if (typeof action?.run !== 'function') errors.push(`Akcja ${name} wymaga run(ctx).`);
        if (action?.when !== undefined && typeof action.when !== 'function') errors.push(`Akcja ${name}: when musi być funkcją.`);
        if (!Number.isFinite(action?.order)) errors.push(`Akcja ${name} nie ma kolejności (order).`);
        if (isActionZone(action?.zone)) perZone.set(action.zone, (perZone.get(action.zone) ?? 0) + 1);
    }
    for (const [zone, max] of Object.entries(ACTION_ZONE_LIMITS)) {
        const count = perZone.get(zone) ?? 0;
        if (count > max) errors.push(`Strefa ${zone} mieści najwyżej ${max} akcję, zadeklarowano ${count}.`);
    }
    return errors;
}

export class ActionRegistry {
    constructor(actions = []) {
        const errors = actionErrors(actions);
        if (errors.length) throw new Error(`Rejestr akcji: ${errors.join(' ')}`);
        this.actions = Object.freeze([...actions].sort((a, b) => a.order - b.order).map((action) => Object.freeze({ ...action })));
        this.byId = new Map(this.actions.map((action) => [action.id, action]));
    }

    /**
     * Akcje strefy w kolejności `order`; z `ctx` — tylko te, których when(ctx) pozwala.
     * @param {string} zone
     * @param {any} [ctx]
     */
    list(zone, ctx = null) {
        return this.actions.filter((action) => action.zone === zone && (!ctx || !action.when || action.when(ctx)));
    }

    get(id) {
        return this.byId.get(id) ?? null;
    }

    /**
     * Uruchamia akcję; błąd trafia do powiadomienia zamiast do konsoli bez śladu.
     * @param {string} id
     * @param {any} ctx
     */
    run(id, ctx) {
        const action = this.get(id);
        if (!action) throw new Error(`Nieznana akcja: ${id}`);
        const fail = (error) => ctx?.toasts?.show?.({ tone: 'danger', message: error instanceof Error ? error.message : String(error) });
        try {
            const result = action.run(ctx);
            if (result && typeof result.catch === 'function') result.catch(fail);
            return result;
        } catch (error) {
            fail(error);
            return undefined;
        }
    }

    /** Polecenia palety (Ctrl+K) z akcji — ta sama funkcja run, bez drugiej kopii logiki. */
    paletteCommands(ctx, group) {
        return this.actions.filter((action) => action.palette !== false).map((action) => ({
            id: `action.${action.id}`,
            title: action.paletteTitle ?? action.label,
            group,
            order: 700 + action.order,
            keywords: action.keywords ?? [action.description ?? action.hint ?? ''].filter(Boolean),
            source: 'actions',
            run: () => this.run(action.id, ctx),
            when: action.when ? () => action.when(ctx) : undefined,
        }));
    }
}
