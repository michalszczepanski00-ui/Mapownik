import { assertTransferGeometryLimits } from '../geometry/geometryLimits.js';
import { transform as transformCoordinate } from 'ol/proj.js';
import { DEFAULT_MAP_OBJECT_STYLE, isMapObjectKind } from '../core/index.js';
import { ensureProjectProjectionRegistered, PROJECT_PROJECTION } from '../projections/index.js';
import { LOCAL_PROJECT_ID, PROJECT_SCHEMA_VERSION } from './projectTypes.js';
import { persistedMapObjectSchema, projectStateSchema } from './projectSchemas.js';
import { t } from '../i18n/index.js';
export const MAPOWNIK_FILE_FORMAT = 'mapownik-project';
export const MAPOWNIK_FILE_VERSION = 1;
export const GEOJSON_MAX_BYTES = 25 * 1024 * 1024;
const WGS84 = 'EPSG:4326';
function nowIso() {
    return new Date().toISOString();
}
function newId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        return crypto.randomUUID();
    return `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function firstSchemaIssue(error) {
    const issue = error?.issues?.find((item) => typeof item?.message === 'string' && item.message.trim());
    return issue?.message?.trim() || null;
}
function parseJson(text, label) {
    if (typeof text !== 'string' || !text.trim())
        throw new Error(t('persistence.jestPusty', { label }));
    if (new Blob([text]).size > GEOJSON_MAX_BYTES)
        throw new Error(t('persistence.przekraczaLimit25Mb', { label }));
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(t('persistence.nieZawieraPoprawnegoJson', { label }));
    }
}
function transformGeometry(geometry, source, target) {
    var _a;
    if (source === target)
        return structuredClone(geometry);
    ensureProjectProjectionRegistered();
    const point = (coordinate) => transformCoordinate([coordinate[0], coordinate[1]], source, target);
    if (geometry.type === 'Point')
        return { type: 'Point', coordinates: point(geometry.coordinates) };
    if (geometry.type === 'LineString')
        return { type: 'LineString', coordinates: geometry.coordinates.map(point) };
    if (geometry.type === 'Polygon')
        return { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => ring.map(point)) };
    if (geometry.type === 'MultiPolygon') {
        return {
            type: 'MultiPolygon',
            coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(point))),
        };
    }
    throw new Error(t('persistence.nieobslugiwanyTypGeometrii', { value: (_a = geometry === null || geometry === void 0 ? void 0 : geometry.type) !== null && _a !== void 0 ? _a : t('persistence.none') }));
}
function sourceProjection(collection) {
    var _a, _b;
    const name = (_b = (_a = collection === null || collection === void 0 ? void 0 : collection.crs) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b.name;
    if (!name)
        return WGS84;
    const normalized = String(name).toUpperCase();
    if (normalized.includes('2180'))
        return PROJECT_PROJECTION;
    if (normalized.includes('4326') || normalized.includes('CRS84'))
        return WGS84;
    throw new Error(t('persistence.nieobslugiwanyUkladWspolrzednychGeojson', { name }));
}
function finite(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return fallback;
    return Math.min(max, Math.max(min, number));
}
function importedStyle(value) {
    const style = value && typeof value === 'object' ? value : {};
    return {
        strokeColor: typeof style.strokeColor === 'string' ? style.strokeColor : DEFAULT_MAP_OBJECT_STYLE.strokeColor,
        strokeWidth: finite(style.strokeWidth, DEFAULT_MAP_OBJECT_STYLE.strokeWidth, 1, 12),
        strokeOpacity: finite(style.strokeOpacity, DEFAULT_MAP_OBJECT_STYLE.strokeOpacity, 0, 1),
        strokePattern: ['solid', 'dash-short', 'dash-medium', 'dash-long', 'dots', 'dash-dot', 'double'].includes(style.strokePattern) ? style.strokePattern : DEFAULT_MAP_OBJECT_STYLE.strokePattern,
        fillColor: typeof style.fillColor === 'string' ? style.fillColor : DEFAULT_MAP_OBJECT_STYLE.fillColor,
        fillOpacity: finite(style.fillOpacity, DEFAULT_MAP_OBJECT_STYLE.fillOpacity, 0, 1),
        pointRadius: finite(style.pointRadius, DEFAULT_MAP_OBJECT_STYLE.pointRadius, 2, 20),
    };
}
export function serializeTransferFile(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
export function safeFileStem(value) {
    const normalized = String(value || 'projekt-mapownika')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return normalized || 'projekt-mapownika';
}
export function createmsportalProjectFile(loaded, appVersion = (typeof window !== 'undefined' && window.__MAPOWNIK_DEPLOY_VERSION__) || '19.48.0') {
    var _a, _b, _c, _d, _e;
    const state = loaded.state
        ? projectStateSchema.parse({ ...loaded.state, projectId: LOCAL_PROJECT_ID })
        : null;
    const objects = loaded.objects.map((object, index) => persistedMapObjectSchema.parse({
        ...object,
        order: Number.isInteger(object.order) ? object.order : index,
    }));
    return {
        format: MAPOWNIK_FILE_FORMAT,
        formatVersion: MAPOWNIK_FILE_VERSION,
        app: { name: 'msportal', version: appVersion },
        exportedAt: nowIso(),
        crs: PROJECT_PROJECTION,
        project: {
            name: ((_a = loaded.meta) === null || _a === void 0 ? void 0 : _a.name) || t('persistence.projektLokalny'),
            schemaVersion: PROJECT_SCHEMA_VERSION,
            createdAt: (_c = (_b = loaded.meta) === null || _b === void 0 ? void 0 : _b.createdAt) !== null && _c !== void 0 ? _c : null,
            updatedAt: (_e = (_d = loaded.meta) === null || _d === void 0 ? void 0 : _d.updatedAt) !== null && _e !== void 0 ? _e : null,
        },
        state,
        objects,
    };
}
export function parsemsportalProjectFile(text) {
    var _a;
    const raw = parseJson(text, t('persistence.plikmsportal'));
    if (!raw || typeof raw !== 'object' || raw.format !== MAPOWNIK_FILE_FORMAT)
        throw new Error(t('persistence.toNieJestPlikProjektu'));
    if (raw.formatVersion !== MAPOWNIK_FILE_VERSION)
        throw new Error(t('persistence.nieobslugiwanaWersjaFormatumsportal', { value: (_a = raw.formatVersion) !== null && _a !== void 0 ? _a : t('persistence.none') }));
    if (raw.crs !== PROJECT_PROJECTION)
        throw new Error(t('persistence.projektMusiUzywacUkladu', { PROJECT_PROJECTION }));
    if (!raw.project || typeof raw.project !== 'object')
        throw new Error(t('persistence.plikNieZawieraMetadanychProjektu'));
    if (raw.project.schemaVersion > PROJECT_SCHEMA_VERSION)
        throw new Error(t('persistence.projektUzywaNowszegoSchematuDanych', { schemaVersion: raw.project.schemaVersion }));
    if (!Array.isArray(raw.objects))
        throw new Error(t('persistence.plikNieZawieraListyObiektow'));
    assertTransferGeometryLimits(raw.objects);
    const ids = new Set();
    const objects = raw.objects.map((object, index) => {
        const parsed = persistedMapObjectSchema.safeParse({
            ...object,
            order: Number.isInteger(object === null || object === void 0 ? void 0 : object.order) ? object.order : index,
        });
        if (!parsed.success) {
            const detail = firstSchemaIssue(parsed.error);
            throw new Error(t('persistence.nieprawidlowyObiektProjektuNaPozycji', { position: index + 1, detail: detail ? `: ${detail}` : '.' }));
        }
        if (ids.has(parsed.data.id))
            throw new Error(t('persistence.powtorzoneIdObiektu', { id: parsed.data.id }));
        ids.add(parsed.data.id);
        return parsed.data;
    });
    let state = null;
    if (raw.state) {
        const parsed = projectStateSchema.safeParse({
            ...raw.state,
            projectId: LOCAL_PROJECT_ID,
            schemaVersion: PROJECT_SCHEMA_VERSION,
        });
        if (!parsed.success)
            throw new Error(t('persistence.nieprawidloweUstawieniaProjektuWPliku'));
        state = parsed.data;
    }
    return {
        name: String(raw.project.name || t('persistence.projektLokalny')).trim() || t('persistence.projektLokalny'),
        objects,
        state,
    };
}
export function createGeoJsonFile(objects, targetProjection = WGS84) {
    if (targetProjection !== WGS84 && targetProjection !== PROJECT_PROJECTION)
        throw new Error(t('persistence.nieobslugiwanyUkladEksportu', { targetProjection }));
    const collection = {
        type: 'FeatureCollection',
        name: 'Mapownik – obiekty',
        features: objects.map((object) => ({
            type: 'Feature',
            id: object.id,
            properties: {
                name: object.name,
                visible: object.visible,
                origin: object.origin,
                order: object.order,
                mapownikStyle: { ...object.style },
                mapownikKind: object.kind ?? 'geometry',
                mapownikProperties: object.properties ? { ...object.properties } : undefined,
            },
            geometry: transformGeometry(object.geometry, PROJECT_PROJECTION, targetProjection),
        })),
    };
    if (targetProjection === PROJECT_PROJECTION) {
        collection.crs = { type: 'name', properties: { name: PROJECT_PROJECTION } };
    }
    return collection;
}
export function parseGeoJsonFile(text) {
    const raw = parseJson(text, t('persistence.plikGeojson'));
    if (!raw || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features))
        throw new Error(t('persistence.obslugiwanyJestGeojsonTypuFeaturecollect'));
    assertTransferGeometryLimits(raw.features);
    const projection = sourceProjection(raw);
    const timestamp = nowIso();
    return raw.features.map((feature, index) => {
        var _a;
        if (!feature || feature.type !== 'Feature' || !feature.geometry)
            throw new Error(t('persistence.nieprawidlowyFeatureNaPozycji', { value: index + 1 }));
        const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties : {};
        const object = {
            id: newId(),
            name: String(properties.name || t('persistence.import', { value: index + 1 })).trim() || t('persistence.import', { value: index + 1 }),
            visible: properties.visible !== false,
            origin: 'import',
            kind: isMapObjectKind(properties.mapownikKind) ? properties.mapownikKind : 'geometry',
            properties: properties.mapownikProperties && typeof properties.mapownikProperties === 'object' ? properties.mapownikProperties : undefined,
            style: importedStyle((_a = properties.mapownikStyle) !== null && _a !== void 0 ? _a : properties.style),
            order: index,
            createdAt: timestamp,
            updatedAt: timestamp,
            geometry: transformGeometry(feature.geometry, projection, PROJECT_PROJECTION),
        };
        const parsed = persistedMapObjectSchema.safeParse(object);
        if (!parsed.success) {
            const detail = firstSchemaIssue(parsed.error);
            throw new Error(t('persistence.nieobslugiwanaLubNieprawidlowaGeometriaN', { position: index + 1, detail: detail ? `: ${detail}` : '.' }));
        }
        return parsed.data;
    });
}
