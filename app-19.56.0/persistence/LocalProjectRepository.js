import { mapownikDatabase } from './database.js';
import { legacyPersistedMapObjectSchemaV1, legacyProjectStateSchemaV1, persistedMapObjectSchema, projectStateSchema, } from './projectSchemas.js';
import { migrateMapObjectV1, migrateProjectStateV1 } from './projectMigration.js';
import { LOCAL_PROJECT_ID, LOCAL_PROJECT_NAME, PROJECT_SCHEMA_VERSION, } from './projectTypes.js';
import { t } from '../i18n/index.js';
function objectKey(projectId, objectId) {
    return `${projectId}::${objectId}`;
}
function nowIso() {
    return new Date().toISOString();
}
function createProject(projectId, timestamp = nowIso()) {
    return {
        id: projectId,
        name: LOCAL_PROJECT_NAME,
        schemaVersion: PROJECT_SCHEMA_VERSION,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}
export class LocalProjectRepository {
    constructor(db = mapownikDatabase) {
        this.db = db;
    }
    async ensureProject(projectId = LOCAL_PROJECT_ID) {
        return this.db.transaction('rw', this.db.projects, async ({ projects }) => {
            const existing = await projects.get(projectId);
            if (existing)
                return existing;
            const project = createProject(projectId);
            await projects.put(project);
            return project;
        });
    }
    async loadProject(projectId = LOCAL_PROJECT_ID) {
        let meta = await this.ensureProject(projectId);
        if (meta.schemaVersion > PROJECT_SCHEMA_VERSION) {
            throw new Error(t('persistence.projektUzywaNowszegoSchematuNiz', { schemaVersion: meta.schemaVersion, PROJECT_SCHEMA_VERSION }));
        }
        const [rows, rawState] = await Promise.all([
            this.db.objects.where('projectId').equals(projectId).toArray(),
            this.db.states.get(projectId),
        ]);
        if (meta.schemaVersion === 1) {
            const migrated = await this.migrateV1Project(meta, rows, rawState);
            meta = migrated.meta;
            return migrated;
        }
        const issues = [];
        const objects = [];
        for (const row of rows) {
            const parsed = persistedMapObjectSchema.safeParse(row.object);
            if (parsed.success)
                objects.push(parsed.data);
            else
                issues.push(t('persistence.pominietoUszkodzonyObiekt', { objectId: row.objectId }));
        }
        let state = null;
        if (rawState) {
            const parsed = projectStateSchema.safeParse(rawState);
            if (parsed.success)
                state = parsed.data;
            else
                issues.push(t('persistence.pominietoNiezgodnyZapisUstawienProjektu'));
        }
        return { meta, objects, state, issues };
    }
    async upsertObject(projectId, object) {
        const parsed = persistedMapObjectSchema.parse(object);
        const row = {
            key: objectKey(projectId, parsed.id),
            projectId,
            objectId: parsed.id,
            updatedAt: parsed.updatedAt,
            object: parsed,
        };
        const timestamp = nowIso();
        await this.db.transaction('rw', this.db.objects, this.db.projects, async (scope) => {
            await scope.objects.put(row);
            await this.touchProjectInScope(scope, projectId, timestamp);
        });
    }
    async upsertObjects(projectId, objects) {
        if (objects.length === 0)
            return;
        const rows = objects.map((object) => {
            const parsed = persistedMapObjectSchema.parse(object);
            return {
                key: objectKey(projectId, parsed.id),
                projectId,
                objectId: parsed.id,
                updatedAt: parsed.updatedAt,
                object: parsed,
            };
        });
        const timestamp = nowIso();
        await this.db.transaction('rw', this.db.objects, this.db.projects, async (scope) => {
            await scope.objects.bulkPut(rows);
            await this.touchProjectInScope(scope, projectId, timestamp);
        });
    }
    /**
     * Persists the latest object mutations as one atomic batch. A clear, removals,
     * upserts and the project timestamp either all commit or all roll back.
     */
    async applyObjectChanges(projectId, changes) {
        var _a, _b;
        const clear = Boolean(changes === null || changes === void 0 ? void 0 : changes.clear);
        const removals = [...new Set((_a = changes === null || changes === void 0 ? void 0 : changes.removals) !== null && _a !== void 0 ? _a : [])];
        const rows = ((_b = changes === null || changes === void 0 ? void 0 : changes.upserts) !== null && _b !== void 0 ? _b : []).map((object) => {
            const parsed = persistedMapObjectSchema.parse(object);
            return {
                key: objectKey(projectId, parsed.id),
                projectId,
                objectId: parsed.id,
                updatedAt: parsed.updatedAt,
                object: parsed,
            };
        });
        if (!clear && removals.length === 0 && rows.length === 0)
            return;
        const timestamp = nowIso();
        await this.db.transaction('rw', this.db.objects, this.db.projects, async (scope) => {
            if (clear)
                await scope.objects.where('projectId').equals(projectId).delete();
            for (const objectId of removals)
                await scope.objects.delete(objectKey(projectId, objectId));
            if (rows.length)
                await scope.objects.bulkPut(rows);
            await this.touchProjectInScope(scope, projectId, timestamp);
        });
    }
    async removeObject(projectId, objectId) {
        const timestamp = nowIso();
        await this.db.transaction('rw', this.db.objects, this.db.projects, async (scope) => {
            await scope.objects.delete(objectKey(projectId, objectId));
            await this.touchProjectInScope(scope, projectId, timestamp);
        });
    }
    async clearObjects(projectId) {
        const timestamp = nowIso();
        await this.db.transaction('rw', this.db.objects, this.db.projects, async (scope) => {
            await scope.objects.where('projectId').equals(projectId).delete();
            await this.touchProjectInScope(scope, projectId, timestamp);
        });
    }
    async saveState(state) {
        const parsed = projectStateSchema.parse(state);
        await this.db.transaction('rw', this.db.states, this.db.projects, async (scope) => {
            await scope.states.put(parsed);
            await this.touchProjectInScope(scope, parsed.projectId, parsed.updatedAt);
        });
    }
    /** Replaces a complete project in one transaction after all input validates. */
    async replaceProject(projectId, payload) {
        const timestamp = nowIso();
        const objects = payload.objects.map((object) => persistedMapObjectSchema.parse(object));
        const ids = new Set();
        for (const object of objects) {
            if (ids.has(object.id))
                throw new Error(t('persistence.plikProjektuZawieraPowtorzoneId', { id: object.id }));
            ids.add(object.id);
        }
        const state = payload.state
            ? projectStateSchema.parse({ ...payload.state, projectId, updatedAt: timestamp })
            : null;
        const rows = objects.map((object) => ({
            key: objectKey(projectId, object.id),
            projectId,
            objectId: object.id,
            updatedAt: object.updatedAt,
            object,
        }));
        await this.db.transaction('rw', this.db.projects, this.db.objects, this.db.states, async (scope) => {
            var _a;
            const existing = await scope.projects.get(projectId);
            await scope.objects.where('projectId').equals(projectId).delete();
            if (rows.length)
                await scope.objects.bulkPut(rows);
            if (state)
                await scope.states.put(state);
            else
                await scope.states.delete(projectId);
            await scope.projects.put({
                id: projectId,
                name: String(payload.name || (existing === null || existing === void 0 ? void 0 : existing.name) || LOCAL_PROJECT_NAME).trim() || LOCAL_PROJECT_NAME,
                schemaVersion: PROJECT_SCHEMA_VERSION,
                createdAt: (_a = existing === null || existing === void 0 ? void 0 : existing.createdAt) !== null && _a !== void 0 ? _a : timestamp,
                updatedAt: timestamp,
            });
        });
        return this.loadProject(projectId);
    }
    async migrateV1Project(meta, rows, rawState) {
        const issues = [];
        const objects = [];
        for (const row of rows) {
            const parsed = legacyPersistedMapObjectSchemaV1.safeParse(row.object);
            if (parsed.success)
                objects.push(migrateMapObjectV1(parsed.data));
            else
                issues.push(t('persistence.pominietoUszkodzonyObiektPodczasMigracji', { objectId: row.objectId }));
        }
        let state = null;
        if (rawState) {
            const parsed = legacyProjectStateSchemaV1.safeParse(rawState);
            if (parsed.success)
                state = migrateProjectStateV1(parsed.data);
            else
                issues.push(t('persistence.pominietoNiezgodnyZapisUstawienPodczas'));
        }
        const now = nowIso();
        const migratedMeta = {
            ...meta,
            schemaVersion: PROJECT_SCHEMA_VERSION,
            updatedAt: now,
        };
        const migratedRows = objects.map((object) => ({
            key: objectKey(meta.id, object.id),
            projectId: meta.id,
            objectId: object.id,
            updatedAt: object.updatedAt,
            object,
        }));
        await this.db.transaction('rw', this.db.projects, this.db.objects, this.db.states, async (scope) => {
            await scope.objects.where('projectId').equals(meta.id).delete();
            if (migratedRows.length)
                await scope.objects.bulkPut(migratedRows);
            if (state)
                await scope.states.put(state);
            else
                await scope.states.delete(meta.id);
            await scope.projects.put(migratedMeta);
        });
        issues.push(t('persistence.projektZostalAutomatycznieZmigrowanyZ'));
        return { meta: migratedMeta, objects, state, issues };
    }
    async touchProject(projectId, timestamp = nowIso()) {
        await this.db.transaction('rw', this.db.projects, async (scope) => {
            await this.touchProjectInScope(scope, projectId, timestamp);
        });
    }
    async touchProjectInScope(scope, projectId, timestamp) {
        const existing = await scope.projects.get(projectId);
        const project = existing !== null && existing !== void 0 ? existing : createProject(projectId, timestamp);
        if (existing && project.updatedAt === timestamp)
            return;
        await scope.projects.put({
            ...project,
            schemaVersion: PROJECT_SCHEMA_VERSION,
            updatedAt: timestamp,
        });
    }
}
export const localProjectRepository = new LocalProjectRepository();
