import { t } from '../i18n/index.js';
/* msportal 17.6.4: native IndexedDB adapter with real multi-store transactions.
 *
 * The connection is opened lazily and reopened automatically whenever it is
 * needed again: a single failed or timed-out open attempt, or another tab
 * upgrading the schema, used to leave this module with one permanently
 * rejected/closed promise for the rest of the page's life — every later read
 * or write failed (or hung) the same way, with autosave silently dead and no
 * way to recover short of a full reload. Opening also now passes an explicit
 * version and is bounded by a timeout, so a stuck open (e.g. another tab
 * holding onblocked forever) surfaces as a definite error instead of hanging
 * every caller indefinitely.
 */
function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { var _a; return reject((_a = request.error) !== null && _a !== void 0 ? _a : new Error('IndexedDB request failed.')); };
    });
}
function transactionDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => { var _a; return reject((_a = tx.error) !== null && _a !== void 0 ? _a : new Error('IndexedDB transaction failed.')); };
        tx.onabort = () => { var _a; return reject((_a = tx.error) !== null && _a !== void 0 ? _a : new Error('IndexedDB transaction aborted.')); };
    });
}
class BoundTable {
    constructor(store) {
        this.store = store;
        this.storeName = store.name;
    }
    async get(key) {
        return requestToPromise(this.store.get(key));
    }
    async put(value) {
        return requestToPromise(this.store.put(value));
    }
    async bulkPut(values) {
        return Promise.all(values.map((value) => requestToPromise(this.store.put(value))));
    }
    async delete(key) {
        return requestToPromise(this.store.delete(key));
    }
    where(indexName) {
        return {
            equals: (value) => ({
                toArray: async () => {
                    const source = this.store.indexNames.contains(indexName) ? this.store.index(indexName) : this.store;
                    return requestToPromise(source.getAll(IDBKeyRange.only(value)));
                },
                delete: async () => new Promise((resolve, reject) => {
                    const source = this.store.indexNames.contains(indexName) ? this.store.index(indexName) : this.store;
                    const request = source.openCursor(IDBKeyRange.only(value));
                    request.onerror = () => { var _a; return reject((_a = request.error) !== null && _a !== void 0 ? _a : new Error('IndexedDB cursor failed.')); };
                    request.onsuccess = () => {
                        const cursor = request.result;
                        if (!cursor) {
                            resolve();
                            return;
                        }
                        cursor.delete();
                        cursor.continue();
                    };
                }),
            }),
        };
    }
}
class NativeTable {
    // getDb is a function, not a captured promise: every operation asks for
    // the CURRENT connection, so a reconnect after a failure or a
    // versionchange close is picked up automatically instead of every table
    // staying bound to one dead promise forever.
    constructor(getDb, storeName) {
        this.getDb = getDb;
        this.storeName = storeName;
    }
    bind(tx) {
        return new BoundTable(tx.objectStore(this.storeName));
    }
    async withStore(mode, fn) {
        const db = await this.getDb();
        const tx = db.transaction(this.storeName, mode);
        const done = transactionDone(tx);
        const store = tx.objectStore(this.storeName);
        let result;
        try {
            result = await fn(store, tx);
        }
        catch (error) {
            try {
                tx.abort();
            }
            catch { /* transaction may already be inactive */ }
            try {
                await done;
            }
            catch { /* preserve original error */ }
            throw error;
        }
        await done;
        return result;
    }
    async get(key) {
        return this.withStore('readonly', (store) => requestToPromise(store.get(key)));
    }
    async put(value) {
        return this.withStore('readwrite', (store) => requestToPromise(store.put(value)));
    }
    async bulkPut(values) {
        return this.withStore('readwrite', (store) => Promise.all(values.map((value) => requestToPromise(store.put(value)))));
    }
    async delete(key) {
        return this.withStore('readwrite', (store) => requestToPromise(store.delete(key)));
    }
    where(indexName) {
        return {
            equals: (value) => ({
                toArray: async () => this.withStore('readonly', (store) => {
                    const source = store.indexNames.contains(indexName) ? store.index(indexName) : store;
                    return requestToPromise(source.getAll(IDBKeyRange.only(value)));
                }),
                delete: async () => this.withStore('readwrite', (store) => new Promise((resolve, reject) => {
                    const source = store.indexNames.contains(indexName) ? store.index(indexName) : store;
                    const request = source.openCursor(IDBKeyRange.only(value));
                    request.onerror = () => { var _a; return reject((_a = request.error) !== null && _a !== void 0 ? _a : new Error('IndexedDB cursor failed.')); };
                    request.onsuccess = () => {
                        const cursor = request.result;
                        if (!cursor) {
                            resolve();
                            return;
                        }
                        cursor.delete();
                        cursor.continue();
                    };
                })),
            }),
        };
    }
}
const MAPOWNIK_DB_VERSION = 1;
// Bounds how long a caller waits for the connection before getting a
// definite error. IndexedDB gives no other signal for "another tab is
// holding this open indefinitely" (onblocked has no natural end).
const MAPOWNIK_DB_OPEN_TIMEOUT_MS = 8000;
function timeoutRejection(ms, message) {
    return new Promise((_resolve, reject) => {
        setTimeout(() => {
            const error = new Error(message);
            error.name = 'TimeoutError';
            reject(error);
        }, ms);
    });
}
function requestOpenDatabase(dbName, version, onVersionChange) {
    return new Promise((resolve, reject) => {
        let blocked = false;
        const request = indexedDB.open(dbName, version);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('projects')) {
                const store = db.createObjectStore('projects', { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt');
            }
            if (!db.objectStoreNames.contains('objects')) {
                const store = db.createObjectStore('objects', { keyPath: 'key' });
                store.createIndex('projectId', 'projectId');
                store.createIndex('objectId', 'objectId');
                store.createIndex('updatedAt', 'updatedAt');
            }
            if (!db.objectStoreNames.contains('states')) {
                const store = db.createObjectStore('states', { keyPath: 'projectId' });
                store.createIndex('updatedAt', 'updatedAt');
            }
        };
        // Another tab holds a connection open at an older version. The native
        // request stays pending until that tab closes or drops it — the
        // caller's own timeout (openDatabase() below) is what turns this into
        // a definite outcome instead of an indefinite hang.
        request.onblocked = () => { blocked = true; };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                // Another tab/window wants to upgrade the schema. Close this
                // connection so it doesn't block that upgrade, and let the
                // owner drop its cached promise so the next operation opens a
                // fresh connection instead of reusing (or hanging on) this
                // now-closed one.
                db.close();
                onVersionChange();
            };
            resolve(db);
        };
        request.onerror = () => {
            const error = request.error !== null && request.error !== void 0 ? request.error : new Error(t('persistence.nieUdaloSieOtworzycIndexeddb'));
            if (blocked)
                error.wasBlocked = true;
            reject(error);
        };
    });
}
export class msportalDatabase {
    constructor(dbName = 'mapownik-2') {
        this.dbName = dbName;
        this._dbPromise = null;
        const getDb = () => this.ensureOpen();
        this.projects = new NativeTable(getDb, 'projects');
        this.objects = new NativeTable(getDb, 'objects');
        this.states = new NativeTable(getDb, 'states');
    }
    ensureOpen() {
        if (!this._dbPromise) {
            const onVersionChange = () => {
                if (this._dbPromise === attempt)
                    this._dbPromise = null;
            };
            const attempt = Promise.race([
                requestOpenDatabase(this.dbName, MAPOWNIK_DB_VERSION, onVersionChange),
                timeoutRejection(MAPOWNIK_DB_OPEN_TIMEOUT_MS, t('persistence.otwieranieLokalnejBazyDanychIndexeddb')),
            ]).catch((error) => {
                // A single failed or timed-out attempt must not permanently
                // disable persistence: let the next call try again from
                // scratch rather than staying stuck on this rejected promise.
                if (this._dbPromise === attempt)
                    this._dbPromise = null;
                throw error;
            });
            this._dbPromise = attempt;
        }
        return this._dbPromise;
    }
    async transaction(mode, ...args) {
        const callback = args.at(-1);
        const tableArgs = args.slice(0, -1);
        if (typeof callback !== 'function')
            throw new Error('Brak callbacku transakcji IndexedDB.'); // dev: błąd programisty, nie komunikat dla użytkownika
        if (tableArgs.length === 0)
            throw new Error('Transakcja IndexedDB wymaga co najmniej jednego store.'); // dev: błąd programisty, nie komunikat dla użytkownika
        const tables = tableArgs.map((table) => {
            if (!(table instanceof NativeTable))
                throw new Error('Nieprawidłowy store przekazany do transakcji IndexedDB.'); // dev: błąd programisty, nie komunikat dla użytkownika
            return table;
        });
        const db = await this.ensureOpen();
        const storeNames = [...new Set(tables.map((table) => table.storeName))];
        const tx = db.transaction(storeNames, mode === 'rw' ? 'readwrite' : 'readonly');
        const done = transactionDone(tx);
        const scope = Object.create(null);
        for (const table of tables)
            scope[table.storeName] = table.bind(tx);
        let result;
        try {
            result = await callback(scope, tx);
        }
        catch (error) {
            try {
                tx.abort();
            }
            catch { /* transaction may already be inactive */ }
            try {
                await done;
            }
            catch { /* preserve original error */ }
            throw error;
        }
        await done;
        return result;
    }
    async close() {
        if (!this._dbPromise)
            return;
        const db = await this._dbPromise.catch(() => null);
        db === null || db === void 0 ? void 0 : db.close();
        this._dbPromise = null;
    }
}
export const mapownikDatabase = new msportalDatabase();
