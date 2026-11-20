import * as z from 'zod';
import { PROJECT_SCHEMA_VERSION } from './projectTypes.js';
import { validatePolygonalGeometryTopology } from '../geometry/topologyValidation.js';
import { FEATURE_ID_PATTERN, MAP_OBJECT_KINDS } from '../core/object/objectKinds.js';
import { t } from '../i18n/index.js';
const finiteNumber = z.number().finite();
const position2D = z.tuple([finiteNumber, finiteNumber]);

function samePosition(a, b, tolerance = 1e-9) {
    return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}
function normalizeRing(ring) {
    const normalized = [];
    for (const position of ring) {
        if (!normalized.length || !samePosition(normalized[normalized.length - 1], position)) normalized.push(position);
    }
    if (normalized.length >= 3 && !samePosition(normalized[0], normalized[normalized.length - 1])) normalized.push([...normalized[0]]);
    return normalized;
}
function distinctRingVertices(ring) {
    const unique = [];
    for (const position of ring) {
        if (!unique.some((candidate) => samePosition(candidate, position))) unique.push(position);
        if (unique.length === 3) return 3;
    }
    return unique.length;
}
const linearRingSchema = z.array(position2D).min(3)
    .refine((ring) => distinctRingVertices(ring) >= 3, { message: t('persistence.pierscienPoligonuWymagaCoNajmniej') })
    .transform(normalizeRing)
    .refine((ring) => ring.length >= 4 && samePosition(ring[0], ring[ring.length - 1]), { message: t('persistence.pierscienPoligonuMusiBycDomkniety') });
const mapObjectStyleSchema = z.object({
    strokeColor: z.string().min(1),
    strokeWidth: finiteNumber.min(1).max(12),
    strokeOpacity: finiteNumber.min(0).max(1).optional().default(1),
    strokePattern: z.enum(['solid', 'dash-short', 'dash-medium', 'dash-long', 'dots', 'dash-dot', 'double']).optional().default('solid'),
    fillColor: z.string().min(1),
    fillOpacity: finiteNumber.min(0).max(1),
    pointRadius: finiteNumber.min(2).max(20),
});
const pointGeometrySchema = z.object({
    type: z.literal('Point'),
    coordinates: position2D,
});
const lineStringGeometrySchema = z.object({
    type: z.literal('LineString'),
    coordinates: z.array(position2D).min(2),
});
const polygonGeometrySchema = z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(linearRingSchema).min(1),
}).superRefine((geometry, ctx) => {
    const result = validatePolygonalGeometryTopology(geometry);
    if (!result.valid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['coordinates'], message: result.message });
});
const multiPolygonGeometrySchema = z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(linearRingSchema).min(1)).min(1),
}).superRefine((geometry, ctx) => {
    const result = validatePolygonalGeometryTopology(geometry);
    if (!result.valid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['coordinates'], message: result.message });
});
const geometryV1Schema = z.discriminatedUnion('type', [
    pointGeometrySchema,
    lineStringGeometrySchema,
    polygonGeometrySchema,
]);
const geometrySchema = z.discriminatedUnion('type', [
    pointGeometrySchema,
    lineStringGeometrySchema,
    polygonGeometrySchema,
    multiPolygonGeometrySchema,
]);
const mapObjectCommon = {
    id: z.string().min(1),
    name: z.string().min(1),
    visible: z.boolean(),
    origin: z.enum(['user', 'parcel', 'analysis', 'import', 'system']),
    kind: z.enum(MAP_OBJECT_KINDS).optional().default('geometry'),
    properties: z.object({
        text: z.string().max(500).optional(),
        fontSize: finiteNumber.min(8).max(72).optional(),
        fontWeight: z.enum(['400', '500', '600', '700']).optional(),
        rotationDeg: finiteNumber.min(-360).max(360).optional(),
        backgroundOpacity: finiteNumber.min(0).max(1).optional(),
        center2180: z.tuple([finiteNumber, finiteNumber]).optional(),
        sourceObjectId: z.string().max(240).optional(),
        bufferDistanceMeters: finiteNumber.min(0.5).max(20000).optional(),
        targetObjectId: z.string().max(240).nullable().optional(),
        targetCenter2180: z.tuple([finiteNumber, finiteNumber]).optional(),
        radiusMeters: finiteNumber.min(0.5).max(50000).optional(),
        arrowStart: z.boolean().optional(),
        arrowEnd: z.boolean().optional(),
        roadWidthMeters: finiteNumber.min(3).max(20).optional(),
        curveRadiusMeters: finiteNumber.min(3).max(100).optional(),
        vehicleProfile: z.literal('typical-eu-semitrailer').optional(),
        sweptPathApproximate: z.boolean().optional(),
        measurementType: z.enum(['length', 'area']).optional(),
        terrainProfileModel: z.literal('NMT').optional(),
        terrainVerticalDatum: z.literal('PL-KRON86-NH').optional(),
        analysisProviderId: z.string().max(120).optional(),
        analysisOperationId: z.string().max(120).optional(),
        analysisFeatureCount: z.number().int().nonnegative().max(10000000).optional(),
        analysisResultCount: z.number().int().nonnegative().max(10000000).nullable().optional(),
        analysisAreaMode: z.enum(['viewport', 'selected', 'box']).optional(),
        analysisMarginMeters: finiteNumber.min(0).max(50000).optional(),
        analysisGeneratedAt: z.string().max(80).optional(),
        analysisTestData: z.boolean().optional(),
        analysisTruncated: z.boolean().optional(),
        analysisDataVersion: z.string().max(160).nullable().optional(),
        analysisDataGeneratedAt: z.string().max(160).nullable().optional(),
        analysisCategory: z.string().max(120).nullable().optional(),
        analysisBufferDistanceMeters: finiteNumber.min(0.5).max(20000).nullable().optional(),
        analysisBufferMode: z.enum(['merged', 'separate']).nullable().optional(),
        analysisBufferFailedCount: z.number().int().nonnegative().max(10000000).nullable().optional(),
        analysisDistanceRadiusMeters: finiteNumber.min(0.5).max(50000).nullable().optional(),
        analysisNearestDistanceMeters: finiteNumber.min(0).max(10000000).nullable().optional(),
        analysisInRadiusCount: z.number().int().nonnegative().max(10000000).nullable().optional(),
        analysisNearestFeatureId: z.string().max(240).nullable().optional(),
        // 18.0: przestrzeń danych funkcji — properties.features[<id funkcji>] = { … }.
        // Zachowywana w całości (dowolne dane JSON), więc nowa funkcja nie traci
        // swoich właściwości przy zapisie (patrz core/object/objectKinds.js).
        features: z.record(z.string().regex(FEATURE_ID_PATTERN), z.record(z.string(), z.unknown())).optional(),
    }).optional(),
    style: mapObjectStyleSchema,
    order: z.number().int().nonnegative().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
};
/** 18.2: pola properties znane schematowi zapisu (reszta trafia do properties.features). */
export const MAP_OBJECT_PROPERTY_KEYS = Object.freeze(Object.keys(mapObjectCommon.properties.unwrap().shape));

export const legacyPersistedMapObjectSchemaV1 = z.object({
    ...mapObjectCommon,
    geometry: geometryV1Schema,
});
export const persistedMapObjectSchema = z.object({
    ...mapObjectCommon,
    geometry: geometrySchema,
});
const panelPositionSchema = z.object({
    x: finiteNumber.min(0).max(10000),
    y: finiteNumber.min(0).max(10000),
}).nullable().optional();
const uiPreferencesSchema = z.object({
    theme: z.enum(['light', 'dark']),
    panels: z.object({
        objectsOpen: z.boolean(),
        layersOpen: z.boolean(),
        objectsCollapsed: z.boolean().optional(),
        layersCollapsed: z.boolean().optional(),
        objectsWidth: finiteNumber.min(200).max(800),
        layersWidth: finiteNumber.min(220).max(600).optional(),
        objectsHeight: finiteNumber.min(180).max(4000).nullable().optional(),
        layersHeight: finiteNumber.min(180).max(4000).nullable().optional(),
        objectsPosition: panelPositionSchema,
        layersPosition: panelPositionSchema,
        // Faza 1 (dok) — pola opcjonalne. Starszy plik wczytuje się bez nich,
        // a starsza wersja aplikacji je pominie zamiast odrzucić plik.
        dockRightActiveId: z.string().min(1).nullable().optional(),
        dockRightWidth: finiteNumber.min(200).max(800).optional(),
        // 17.8.12 — podział prawego doku (Warstwy nad Obiektami).
        dockRightSplitId: z.string().min(1).nullable().optional(),
        dockRightSplitRatio: finiteNumber.min(0.1).max(0.9).optional(),
        dockBottomActiveId: z.string().min(1).nullable().optional(),
        dockBottomHeight: finiteNumber.min(120).max(800).optional(),
        floatingPanels: z.array(z.string().min(1)).max(16).optional(),
    }),
});
const mapViewSchema = z.object({
    zoom: finiteNumber.min(0).max(30),
    center3857: position2D,
});
const layerPreferenceSchema = z.object({
    id: z.string().min(1),
    visible: z.boolean(),
    opacity: finiteNumber.min(0).max(1),
    order: z.number().int(),
});
const projectStateCommon = {
    projectId: z.string().min(1),
    updatedAt: z.string().min(1),
    ui: uiPreferencesSchema,
    mapView: mapViewSchema,
    basemapId: z.string().min(1).nullable(),
    basemapOptions: z.object({
        archiveMonth: z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/),
        photoOpacity: finiteNumber.min(0.1).max(1),
    }).optional(),
    layers: z.array(layerPreferenceSchema),
};
export const legacyProjectStateSchemaV1 = z.object({
    ...projectStateCommon,
    schemaVersion: z.literal(1),
});
export const projectStateSchema = z.object({
    ...projectStateCommon,
    schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
});
