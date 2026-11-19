import { defineFeature } from '../defineFeature.js';
import { t } from '../../i18n/index.js';
import { DEFAULT_MAP_OBJECT_STYLE, MAPOWNIK_PRESET_COLORS, MAPOWNIK_STROKE_PATTERNS } from '../../core/index.js';

/**
 * Pola zaznaczonego obiektu w pasku kontekstu (prawa strona).
 *
 * Wcześniej te pola były na sztywno w SelectionBar.js — osiem sekcji
 * wybieranych instrukcjami warunkowymi. Teraz każdy rodzaj obiektu wnosi
 * swoje pola przez slot `objectFields`, więc nowy rodzaj obiektu (w nowej
 * funkcji) dodaje własne pola bez zmiany paska.
 */

const commands = (ctx) => ctx.get('objectCommands');
const STYLED_KINDS = new Set(['geometry', 'rectangle', 'circle', 'arrow', 'callout', 'analysis']);
const POLYGONS = new Set(['Polygon', 'MultiPolygon']);

function styleFields(object, ctx) {
    const style = object.style ?? {};
    const id = object.id;
    const fields = [
        {
            id: 'color', type: 'color', label: t('context.color'),
            value: style.strokeColor ?? DEFAULT_MAP_OBJECT_STYLE.strokeColor,
            presets: MAPOWNIK_PRESET_COLORS,
            onChange: (color) => commands(ctx)?.setStyle(id, { strokeColor: color, fillColor: color }, 'color'),
        },
    ];
    if (object.kind === 'text') return fields;
    fields.push(
        {
            id: 'pattern', type: 'select', label: t('context.lineStyle'),
            value: style.strokePattern ?? 'solid',
            options: MAPOWNIK_STROKE_PATTERNS.map((item) => ({ value: item.id, label: item.label })),
            width: 132, // 18.11.2: było 150 — przy 1280 px lista wchodziła na „Grubość”
            onChange: (value) => commands(ctx)?.setStyle(id, { strokePattern: value }, 'strokePattern'),
        },
        {
            id: 'strokeWidth', type: 'number', label: t('context.strokeWidth'), unit: 'px',
            min: 1, max: 12, step: 1, value: style.strokeWidth ?? 2,
            onChange: (value) => commands(ctx)?.setStyle(id, { strokeWidth: Number(value) }, 'strokeWidth'),
        },
        {
            id: 'strokeOpacity', type: 'number', label: t('context.strokeOpacity'), unit: '%',
            min: 0, max: 100, step: 5, value: Math.round((style.strokeOpacity ?? 1) * 100),
            onChange: (value) => commands(ctx)?.setStyle(id, { strokeOpacity: Number(value) / 100 }, 'strokeOpacity'),
        },
    );
    if (POLYGONS.has(object.geometryType)) {
        fields.push({
            id: 'fillOpacity', type: 'number', label: t('context.fillOpacity'), unit: '%',
            min: 0, max: 100, step: 5, value: Math.round((style.fillOpacity ?? 0.18) * 100),
            onChange: (value) => commands(ctx)?.setStyle(id, { fillOpacity: Number(value) / 100 }, 'fillOpacity'),
        });
    }
    return fields;
}

export const objectStyleFeature = defineFeature({
    id: 'object-style',
    title: t('feature.object-style'),
    objectFields: [
        { id: 'circle-radius', order: 1, appliesTo: (object) => object.kind === 'circle', fields: (object, ctx) => [{
            id: 'radiusMeters', type: 'number', label: 'Promień', unit: 'm', min: 0.5, max: 50000, step: 0.5, value: object.properties?.radiusMeters ?? 25,
            onChange: (value) => commands(ctx).setCircleRadius(object.id, value),
        }] },
        {
            id: 'style',
            order: 10,
            appliesTo: (object) => STYLED_KINDS.has(object.kind ?? 'geometry') || object.kind === 'text',
            fields: styleFields,
        },
        { id: 'callout-link', order: 15, appliesTo: (object) => object.kind === 'callout', fields: (object, ctx) => [{
            id: 'linked-target', type: 'readout', label: 'Powiązanie', value: object.properties?.targetObjectId ? (ctx.get('objects').getSnapshot().items.find((item) => item.id === object.properties.targetObjectId)?.name ?? 'Cel niedostępny') : 'Niezależna etykieta',
        }, ...(object.properties?.targetObjectId ? [{ id: 'unlink', type: 'button', label: 'Odłącz etykietę', onClick: () => commands(ctx).setProperties(object.id, { targetObjectId: null }, 'targetObjectId') }] : [])] },
        {
            id: 'arrow',
            order: 20,
            appliesTo: (object) => object.kind === 'arrow',
            fields: (object, ctx) => [{
                id: 'arrowHeads', type: 'select', label: t('context.arrowHeads'), width: 120,
                value: object.properties?.arrowStart ? 'both' : 'end',
                options: [{ value: 'end', label: t('context.arrowEnd') }, { value: 'both', label: t('context.arrowBoth') }],
                onChange: (value) => commands(ctx)?.setProperties(object.id, { arrowStart: value === 'both', arrowEnd: true }, 'arrowHeads'),
            }],
        },
        {
            id: 'text',
            order: 30,
            appliesTo: (object) => object.kind === 'text' || object.kind === 'callout',
            fields: (object, ctx) => [
                {
                    id: 'text', type: 'text', label: t('context.text'), width: 180, maxLength: 500,
                    value: object.properties?.text ?? object.name,
                    onChange: (value) => commands(ctx)?.setProperties(object.id, { text: value }, 'text'),
                },
                {
                    id: 'fontWeight', type: 'select', label: t('context.fontWeight'), width: 110,
                    value: object.properties?.fontWeight ?? '600',
                    options: [{ value: '400', label: t('context.fontWeight.normal') }, { value: '600', label: t('context.fontWeight.semibold') }, { value: '700', label: t('context.fontWeight.bold') }],
                    onChange: (value) => commands(ctx)?.setProperties(object.id, { fontWeight: value }, 'fontWeight'),
                },
                {
                    id: 'fontSize', type: 'number', label: t('context.fontSize'), unit: 'px', min: 8, max: 72, step: 1,
                    value: object.properties?.fontSize ?? 14,
                    onChange: (value) => commands(ctx)?.setProperties(object.id, { fontSize: Number(value) }, 'fontSize'),
                },
                {
                    id: 'textRotation', type: 'number', label: t('context.textRotation'), unit: '°', min: -360, max: 360, step: 5,
                    value: object.properties?.rotationDeg ?? 0,
                    onChange: (value) => commands(ctx)?.setProperties(object.id, { rotationDeg: Number(value) }, 'rotationDeg'),
                },
            ],
        },
        {
            id: 'road',
            order: 40,
            appliesTo: (object) => object.kind === 'road',
            fields: (object, ctx) => {
                let analysis = null;
                try { analysis = ctx.get('objects')?.getRoadAnalysis?.(object.id) ?? null; } catch { analysis = null; }
                const fields = [
                    {
                        id: 'roadWidth', type: 'number', label: t('context.roadWidth'), unit: 'm', min: 3, max: 20, step: 0.5,
                        value: object.properties?.roadWidthMeters ?? 6,
                        onChange: (value) => commands(ctx)?.setProperties(object.id, { roadWidthMeters: Math.min(20, Math.max(3, Number(value) || 3)) }, 'roadWidthMeters'),
                    },
                    {
                        id: 'roadRadius', type: 'number', label: t('context.roadRadius'), unit: 'm', min: 3, max: 100, step: 1,
                        value: object.properties?.curveRadiusMeters ?? 12,
                        onChange: (value) => commands(ctx)?.setProperties(object.id, { curveRadiusMeters: Math.min(100, Math.max(3, Number(value) || 3)) }, 'curveRadiusMeters'),
                    },
                    { id: 'vehicle', type: 'badge', label: t('context.roadVehicle'), title: t('context.roadVehicle.hint') },
                ];
                if (analysis?.radiusAdjusted) {
                    fields.push({ id: 'radiusAdjusted', type: 'badge', tone: 'warning', label: t('context.roadRadiusAdjusted', { radius: analysis.minimumEffectiveRadius.toFixed(1) }), title: analysis.warnings?.[0] ?? t('context.roadRadiusAdjusted.hint') });
                }
                if (analysis?.innerClamped) {
                    fields.push({ id: 'innerClamped', type: 'badge', tone: 'danger', label: t('context.roadTopology'), title: t('context.roadTopology.hint') });
                }
                return fields;
            },
        },
        {
            id: 'rotation',
            order: 50,
            appliesTo: (object) => object.geometryType !== 'Point' && object.kind !== 'circle' && object.kind !== 'text'
                && object.kind !== 'measurement' && object.kind !== 'terrain-profile',
            fields: (object, ctx) => [{
                id: 'rotate', type: 'rotate', label: t('context.rotation'), unit: '°', step: 15,
                onRotate: (angle) => ctx.get('editing')?.rotateSelected(angle),
            }],
        },
        {
            id: 'measurement',
            order: 60,
            appliesTo: (object) => object.kind === 'measurement',
            fields: (object, ctx) => [
                { id: 'value', type: 'readout', label: object.properties?.measurementType === 'area' || POLYGONS.has(object.geometryType) ? t('context.area') : t('context.length'), value: object.name.replace(/^(Powierzchnia|Wymiar)\s+/, '') },
                { id: 'delete', type: 'button', label: t('context.deleteMeasurement'), tone: 'danger', title: 'Delete', onClick: () => ctx.get('measurement')?.removeSelected() },
                { id: 'clear', type: 'button', label: t('measurements.clear'), onClick: () => ctx.get('measurement')?.clear() },
            ],
        },
    ],
});
