import { t } from '../i18n/index.js';
class CreateObjectCommand {
    constructor(manager, input) {
        this.label = t('commands.dodajObiekt');
        this.created = null;
        this.manager = manager;
        this.input = input;
    }
    execute() {
        if (!this.created) {
            const id = this.manager.add(this.input);
            this.created = this.manager.getObject(id);
            return;
        }
        this.manager.restoreObjectSnapshot(this.created);
    }
    undo() {
        if (!this.created)
            return;
        this.manager.remove(this.created.id);
    }
    get id() {
        var _a, _b;
        return (_b = (_a = this.created) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
    }
}
class DeleteObjectCommand {
    constructor(manager, id) {
        this.label = t('commands.usunObiekt');
        this.manager = manager;
        this.before = manager.getObject(id);
        this.wasSelected = manager.getSnapshot().selectedId === id;
    }
    execute() {
        this.manager.remove(this.before.id);
    }
    undo() {
        this.manager.restoreObjectSnapshot(this.before);
        if (this.wasSelected)
            this.manager.select(this.before.id);
    }
}
class DeleteObjectsCommand {
    constructor(manager, ids) {
        this.label = t('commands.usunObiekty');
        this.manager = manager;
        this.before = [...new Set(ids)].map((id) => manager.getObject(id));
        this.selectedId = manager.getSnapshot().selectedId;
    }
    execute() {
        for (const object of this.before)
            this.manager.remove(object.id);
    }
    undo() {
        for (const object of [...this.before].sort((left, right) => left.order - right.order))
            this.manager.restoreObjectSnapshot(object);
        if (this.selectedId && this.before.some((object) => object.id === this.selectedId))
            this.manager.select(this.selectedId);
    }
}
class UpdateObjectsCommand {
    constructor(manager, ids, label, applyFirst) {
        this.after = null;
        this.manager = manager;
        this.label = label;
        this.before = [...new Set(ids)].map((id) => manager.getObject(id));
        this.applyFirst = applyFirst;
    }
    execute() {
        if (!this.after) {
            for (const object of this.before)
                this.applyFirst(object.id);
            this.after = this.before.map((object) => this.manager.getObject(object.id));
            return;
        }
        for (const object of this.after)
            this.manager.restoreObjectSnapshot(object);
    }
    undo() {
        for (const object of this.before)
            this.manager.restoreObjectSnapshot(object);
    }
}
class CreateObjectsCommand {
    constructor(manager, inputs, label) {
        this.created = null;
        this.manager = manager;
        this.inputs = inputs;
        this.label = label;
    }
    execute() {
        if (!this.created) {
            this.created = this.inputs.map((input) => {
                const id = this.manager.add(input);
                return this.manager.getObject(id);
            });
            return;
        }
        for (const object of this.created)
            this.manager.restoreObjectSnapshot(object);
    }
    undo() {
        var _a;
        for (const object of (_a = this.created) !== null && _a !== void 0 ? _a : [])
            this.manager.remove(object.id);
    }
    get ids() {
        var _a;
        return ((_a = this.created) !== null && _a !== void 0 ? _a : []).map((object) => object.id);
    }
}
class MoveObjectCommand {
    constructor(manager, id, direction) {
        this.manager = manager;
        this.id = id;
        this.direction = direction;
        this.label = direction === 'up' ? t('commands.przeniesObiektWyzej') : t('commands.przeniesObiektNizej');
    }
    execute() {
        this.manager.move(this.id, this.direction);
    }
    undo() {
        this.manager.move(this.id, this.direction === 'up' ? 'down' : 'up');
    }
}
/**
 * Przeniesienie obiektu o kilka pozycji jako JEDNA operacja historii.
 *
 * Wcześniej panel Obiekty wołał `commands.move()` w pętli, więc przeciągnięcie
 * wiersza o dwadzieścia pozycji zostawiało dwadzieścia wpisów w historii —
 * cofnięcie jednego gestu wymagało dwudziestu Ctrl+Z, a przy limicie historii
 * jedno przeciągnięcie potrafiło wypchnąć z niej wszystko inne.
 *
 * `ObjectManager.move` zamienia sąsiadów miejscami, więc operacja jest
 * dokładnie odwracalna: tyle samo zamian w przeciwną stronę. Dzięki temu
 * cofnięcie korzysta z tej samej, zwalidowanej ścieżki co wykonanie, zamiast
 * odtwarzać zapamiętane wartości `order`.
 */
class MoveObjectToCommand {
    constructor(manager, id, steps, direction) {
        this.manager = manager;
        this.id = id;
        this.steps = steps;
        this.direction = direction;
        this.label = t('commands.zmienKolejnoscObiektu');
    }
    execute() {
        for (let step = 0; step < this.steps; step += 1)
            this.manager.move(this.id, this.direction);
    }
    undo() {
        const back = this.direction === 'up' ? 'down' : 'up';
        for (let step = 0; step < this.steps; step += 1)
            this.manager.move(this.id, back);
    }
}
function geometryPositions(geometry) {
    if (geometry.type === 'Point') return [geometry.coordinates];
    if (geometry.type === 'LineString') return geometry.coordinates;
    if (geometry.type === 'Polygon') return geometry.coordinates.flat();
    return geometry.coordinates.flat(2);
}
function geometryCenter(geometry) {
    const positions = geometryPositions(geometry);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of positions) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return [(minX + maxX) / 2, (minY + maxY) / 2];
}
function rotateGeometry(geometry, angleDeg) {
    if (geometry.type === 'Point') return structuredClone(geometry);
    const angle = Number(angleDeg) * Math.PI / 180;
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-12) return structuredClone(geometry);
    const [cx, cy] = geometryCenter(geometry);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotatePosition = ([x, y]) => {
        const dx = x - cx;
        const dy = y - cy;
        return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
    };
    if (geometry.type === 'LineString')
        return { type: 'LineString', coordinates: geometry.coordinates.map(rotatePosition) };
    if (geometry.type === 'Polygon')
        return { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => ring.map(rotatePosition)) };
    return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(rotatePosition))),
    };
}
function translateGeometry(geometry, deltaX = 10, deltaY = -10) {
    const translatePosition = (position) => [position[0] + deltaX, position[1] + deltaY];
    if (geometry.type === 'Point')
        return { type: 'Point', coordinates: translatePosition(geometry.coordinates) };
    if (geometry.type === 'LineString')
        return { type: 'LineString', coordinates: geometry.coordinates.map(translatePosition) };
    if (geometry.type === 'Polygon')
        return { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => ring.map(translatePosition)) };
    return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(translatePosition))),
    };
}
/**
 * Captures the exact before/after MapObject snapshots. First execution uses the
 * normal ObjectManager mutator so validation/normalization remains centralized;
 * undo/redo restore exact snapshots (including timestamps and style state).
 */
class UpdateObjectCommand {
    constructor(manager, id, label, kind, applyFirst, mergeKey = null) {
        this.after = null;
        this.manager = manager;
        this.id = id;
        this.label = label;
        this.kind = kind;
        this.applyFirst = applyFirst;
        this.mergeKey = mergeKey;
        this.before = manager.getObject(id);
    }
    execute() {
        if (!this.after) {
            this.applyFirst();
            this.after = this.manager.getObject(this.id);
            return;
        }
        this.manager.restoreObjectSnapshot(this.after);
    }
    undo() {
        this.manager.restoreObjectSnapshot(this.before);
    }
    mergeWith(next) {
        if (!(next instanceof UpdateObjectCommand))
            return false;
        if (!this.mergeKey || this.mergeKey !== next.mergeKey || this.kind !== next.kind || this.id !== next.id)
            return false;
        if (!next.after)
            return false;
        this.after = structuredClone(next.after);
        return true;
    }
}
/** High-level object mutations routed through CommandBus. */
export class ObjectCommandService {
    constructor(bus, manager) {
        this.bus = bus;
        this.manager = manager;
    }
    create(input) {
        const command = new CreateObjectCommand(this.manager, structuredClone(input));
        this.bus.execute(command);
        if (!command.id)
            throw new Error('Polecenie utworzenia obiektu nie zwróciło ID.'); // dev: błąd programisty, nie komunikat dla użytkownika
        return command.id;
    }
    remove(id) {
        this.bus.execute(new DeleteObjectCommand(this.manager, id));
    }
    removeMany(ids) {
        if (ids.length)
            this.bus.execute(new DeleteObjectsCommand(this.manager, ids));
    }
    /**
     * Stawia obiekt `id` na pozycji obiektu `targetId` — jednym wpisem historii.
     *
     * Wyliczenie liczby kroków siedzi tutaj, a nie w panelu: kolejność
     * w snapshotcie jest malejąca po `order` (najwyższy obiekt pierwszy), więc
     * przesunięcie do MNIEJSZEGO indeksu to ruch w górę stosu.
     */
    moveTo(id, targetId) {
        if (!id || !targetId || id === targetId)
            return false;
        const ordered = this.manager.getSnapshot().items;
        const from = ordered.findIndex((object) => object.id === id);
        const to = ordered.findIndex((object) => object.id === targetId);
        if (from < 0 || to < 0 || from === to)
            return false;
        this.bus.execute(new MoveObjectToCommand(this.manager, id, Math.abs(from - to), from > to ? 'up' : 'down'));
        return true;
    }
    setVisibility(id, visible) {
        this.bus.execute(new UpdateObjectCommand(this.manager, id, visible ? t('commands.pokazObiekt') : t('commands.ukryjObiekt'), 'visibility', () => this.manager.setVisibility(id, visible)));
    }
    setVisibilityMany(ids, visible) {
        if (ids.length)
            this.bus.execute(new UpdateObjectsCommand(this.manager, ids, visible ? t('commands.pokazObiekty') : t('commands.ukryjObiekty'), (id) => this.manager.setVisibility(id, visible)));
    }
    setName(id, name) {
        this.bus.execute(new UpdateObjectCommand(this.manager, id, t('commands.zmienNazweObiektu'), 'name', () => this.manager.setName(id, name), `name:${id}`));
    }
    setStyle(id, patch, mergeProperty) {
        this.bus.execute(new UpdateObjectCommand(this.manager, id, t('commands.zmienStylObiektu'), 'style', () => this.manager.setStyle(id, patch), mergeProperty ? `style:${id}:${String(mergeProperty)}` : null));
    }
    setProperties(id, patch, mergeProperty) {
        this.bus.execute(new UpdateObjectCommand(this.manager, id, t('commands.zmienWlasciwosciObiektu'), 'properties', () => this.manager.setProperties(id, patch), mergeProperty ? `properties:${id}:${String(mergeProperty)}` : null));
    }
    setCircleRadius(id, radiusMeters) {
        const radius = Number(radiusMeters);
        if (!Number.isFinite(radius) || radius < 0.5 || radius > 50000) throw new Error('Promień musi mieścić się w zakresie 0,5–50 000 m.');
        const object = this.manager.getObject(id);
        if (object.kind !== 'circle' || object.geometry.type !== 'Polygon') return false;
        const center = geometryCenter(object.geometry);
        const ring = Array.from({ length: 73 }, (_, i) => { const angle = i / 72 * 2 * Math.PI; return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]; });
        ring[72] = [...ring[0]];
        this.bus.execute(new UpdateObjectCommand(this.manager, id, 'Zmień promień', 'circle', () => {
            this.manager.setGeometry(id, { type: 'Polygon', coordinates: [ring] });
            this.manager.setProperties(id, { radiusMeters: radius, center2180: center });
        }, `circle:${id}`));
        return true;
    }
    setGeometry(id, geometry) {
        this.bus.execute(new UpdateObjectCommand(this.manager, id, t('commands.zmienGeometrie'), 'geometry', () => this.manager.setGeometry(id, structuredClone(geometry))));
    }
    rotate(id, angleDeg) {
        const angle = Number(angleDeg);
        if (!Number.isFinite(angle) || Math.abs(angle) < 0.001)
            return false;
        const object = this.manager.getObject(id);
        if (object.geometry.type === 'Point')
            return false;
        this.bus.execute(new UpdateObjectCommand(this.manager, id, t('commands.obrocObiekt'), 'geometry', () => this.manager.setGeometry(id, rotateGeometry(object.geometry, angle))));
        return true;
    }
    move(id, direction) {
        this.bus.execute(new MoveObjectCommand(this.manager, id, direction));
    }
    createMany(inputs, label = t('commands.importujObiekty')) {
        if (!inputs.length)
            return [];
        const command = new CreateObjectsCommand(this.manager, structuredClone(inputs), label);
        this.bus.execute(command);
        return command.ids;
    }
    duplicateMany(ids) {
        const inputs = [...new Set(ids)].map((id) => {
            const source = this.manager.getObject(id);
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, order: _order, ...input } = source;
            return {
                ...input,
                name: `${source.name} – kopia`,
                geometry: translateGeometry(source.geometry),
                origin: 'user',
            };
        });
        return this.createMany(inputs, inputs.length === 1 ? t('commands.duplikujObiekt') : t('commands.duplikujObiekty'));
    }
}
