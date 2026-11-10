import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';
import { showUndoToast } from '../../core/toasts/undoToast.js';

/**
 * Panel Obiekty i ustawienie potwierdzania usunięć (18.1).
 * Ustawienie czyta polecenie Delete (coreFeature) i kosz w panelu.
 */
export const OBJECTS_CONFIRM_SINGLE_DELETE = 'objects.confirmSingleDelete';

/**
 * Usunięcie jednego obiektu — wspólne dla klawisza Delete i kosza w panelu.
 * Domyślnie bez pytania, z powiadomieniem „Cofnij”; z pytaniem, gdy
 * użytkownik włączył to w Ustawieniach.
 * @returns {Promise<boolean>} czy obiekt został usunięty
 */
export async function removeObjectWithUndo(ctx, id) {
    const item = ctx.get('objects')?.getSnapshot().items.find((entry) => entry.id === id);
    if (!item) return false;
    if (ctx.settings?.get(OBJECTS_CONFIRM_SINGLE_DELETE)) {
        const accepted = await ctx.dialogs.confirm({
            title: t('objects.confirmOne.title', { name: item.name }),
            message: t('objects.confirmOne.message'),
            hint: t('objects.confirmOne.hint'),
            confirmLabel: t('objects.delete'),
            tone: 'danger',
        });
        if (!accepted) return false;
    }
    ctx.get('objectCommands').remove(item.id);
    showUndoToast({ toasts: ctx.toasts, history: ctx.get('commands'), message: t('toast.deleted', { name: item.name }), label: t('toast.undo') });
    return true;
}

export const objectsFeature = defineFeature({
    id: 'objects',
    title: t('feature.objects'),
    panels: [{
        id: 'objects',
        railLabel: 'Obiekty',
        title: t('panel.objects.title'),
        subtitle: t('panel.objects.subtitle'),
        icon: 'objects',
        dock: 'right',
        order: 20,
        collapsible: true,
        floatGroup: 'right-float',
        defaultWidth: 318,
        minWidth: 248,
        maxWidth: 460,
        resizeDirection: -1,
        load: () => import('../../app/components/ObjectsPanel.js').then((module) => module.ObjectsPanel),
    }, {
        // 19.45.0: porównanie działek projektu (tabela + CSV). Otwierane przyciskiem w panelu Obiekty i z palety poleceń.
        id: 'parcelCompare',
        title: 'Porównanie działek',
        subtitle: 'Działki projektu: plany, ograniczenia, ceny',
        icon: 'table',
        dock: 'bottom',
        order: 61,
        rail: false,
        collapsible: false,
        floatGroup: 'bottom-float',
        defaultWidth: 1000,
        minWidth: 520,
        maxWidth: 1600,
        resizeDirection: -1,
        load: () => import('../../app/components/ParcelComparisonPanel.js').then((module) => module.ParcelComparisonPanel),
    }],
    settings: [{
        id: OBJECTS_CONFIRM_SINGLE_DELETE,
        label: t('settings.confirmSingleDelete'),
        description: t('settings.confirmSingleDelete.hint'),
        type: 'toggle',
        default: false,
        order: 10,
    }],
});
