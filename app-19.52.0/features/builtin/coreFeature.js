import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';
import { removeObjectWithUndo } from './objectsFeature.js';

/**
 * Polecenia rdzenia mapy: historia, usuwanie, Escape, szkic (Backspace,
 * Enter) oraz podstawowe pozycje menu prawego przycisku.
 *
 * Polecenia zależne od powłoki (paleta poleceń, motyw, panele) rejestruje
 * App.js — potrzebują stanu interfejsu, a nie runtime mapy.
 */

const PAN_TOOL_ID = 'core.pan';

function openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function copyText(ctx, value) {
    try {
        await navigator.clipboard.writeText(value);
        ctx.toasts.show({ message: t('contextMenu.copied', { value }), tone: 'success', timeoutMs: 3500 });
    } catch {
        ctx.toasts.show({ message: value, tone: 'info', timeoutMs: 8000 });
    }
}

export const coreFeature = defineFeature({
    id: 'core',
    title: t('feature.core'),
    commands: [
        {
            id: 'core.undo',
            title: t('command.undo'),
            group: t('command.group.edit'),
            shortcut: { key: 'z', ctrl: true },
            order: 300,
            when: (ctx) => Boolean(ctx.interactions.activeSketch()?.undoLastPoint || ctx.get('commands')?.getSnapshot().canUndo),
            run: (ctx) => ctx.interactions.activeSketch()?.undoLastPoint ? ctx.interactions.undoLastPoint() : ctx.get('commands').undo(),
        },
        {
            id: 'core.redo',
            title: t('command.redo'),
            group: t('command.group.edit'),
            shortcut: { key: 'y', ctrl: true },
            order: 301,
            when: (ctx) => Boolean(ctx.get('commands')?.getSnapshot().canRedo),
            run: (ctx) => ctx.get('commands').redo(),
        },
        {
            id: 'core.redo.shift',
            title: t('command.redo'),
            hidden: true,
            shortcut: { key: 'z', ctrl: true, shift: true },
            when: (ctx) => Boolean(ctx.get('commands')?.getSnapshot().canRedo),
            run: (ctx) => ctx.get('commands').redo(),
        },
        {
            // Delete usuwa zaznaczony obiekt bez pytania — z powiadomieniem
            // „Cofnij”, bo działa Ctrl+Z (patrz ToastManager).
            id: 'core.delete',
            title: t('command.delete'),
            group: t('command.group.edit'),
            shortcut: { key: 'Delete' },
            order: 302,
            when: (ctx) => Boolean(ctx.get('objects')?.getSnapshot().selectedId),
            run: (ctx) => removeObjectWithUndo(ctx, ctx.get('objects').getSnapshot().selectedId),
        },
        {
            // Escape: najpierw porzuca rozpoczęty szkic, potem wraca do przesuwania.
            // W trybie zaznaczania kadru eksportu Escape należy do kontrolera mapy.
            id: 'core.escape',
            title: t('command.escape'),
            hidden: true,
            shortcut: { key: 'Escape' },
            when: (ctx) => {
                if (ctx.get('rasterExport')?.getSnapshot?.().selecting) return false;
                if (ctx.interactions.activeSketch()) return true;
                const pan = ctx.tools.getSnapshot().items.find((item) => item.id === PAN_TOOL_ID);
                return Boolean(pan && !pan.active);
            },
            run: (ctx) => {
                if (ctx.interactions.abortActiveSketch()) return;
                void ctx.tools.activate(PAN_TOOL_ID);
            },
        },
        {
            id: 'core.sketch.undoPoint',
            title: t('command.sketchUndoPoint'),
            group: t('command.group.edit'),
            shortcut: { key: 'Backspace' },
            order: 305,
            when: (ctx) => Boolean(ctx.interactions.activeSketch()?.undoLastPoint),
            run: (ctx) => ctx.interactions.undoLastPoint(),
        },
        {
            id: 'core.sketch.finish',
            title: t('command.sketchFinish'),
            group: t('command.group.edit'),
            shortcut: { key: 'Enter' },
            order: 306,
            when: (ctx) => Boolean(ctx.interactions.activeSketch()?.finishSketch),
            run: (ctx) => ctx.interactions.finishActiveSketch(),
        },
    ],
    contextMenu: [
        {
            id: 'core.copy.wgs84',
            order: 20,
            label: t('contextMenu.copyWgs'),
            run: (ctx, place) => {
                const [lon, lat] = place.coordinateLonLat;
                return copyText(ctx, `${lat.toFixed(6)}, ${lon.toFixed(6)}`);
            },
        },
        {
            id: 'core.copy.puwg',
            order: 30,
            label: t('contextMenu.copyPuwg'),
            when: (ctx, place) => Array.isArray(place?.coordinate2180),
            run: (ctx, place) => {
                const [x, y] = place.coordinate2180;
                return copyText(ctx, `X ${x.toFixed(2)}, Y ${y.toFixed(2)}`);
            },
        },
        {
            id: 'core.open.google',
            order: 40,
            label: t('contextMenu.googleMaps'),
            run: (ctx, place) => {
                const [lon, lat] = place.coordinateLonLat;
                openExternal(`https://www.google.com/maps/@?api=1&map_action=map&center=${lat.toFixed(7)},${lon.toFixed(7)}&zoom=18`);
            },
        },
        {
            id: 'core.open.streetview',
            order: 50,
            label: t('contextMenu.streetView'),
            run: (ctx, place) => {
                const [lon, lat] = place.coordinateLonLat;
                openExternal(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(7)},${lon.toFixed(7)}`);
            },
        },
        {
            id: 'core.open.geoportal',
            order: 60,
            label: t('contextMenu.geoportal'),
            run: (ctx, place) => {
                const [lon, lat] = place.coordinateLonLat;
                const mapview = `${lat.toFixed(7)},${lon.toFixed(7)},2000s`;
                openExternal(`https://mapy.geoportal.gov.pl/imapnext/imap/index.html?moduleId=modulGiK&mapview=${encodeURIComponent(mapview)}`);
            },
        },
    ],
});
