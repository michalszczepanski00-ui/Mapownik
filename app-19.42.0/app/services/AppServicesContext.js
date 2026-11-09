import { createContext, createElement, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { ServiceHub } from './ServiceHub.js';

const ServicesContext = createContext(null);

/**
 * Nazwy serwisów publikowanych przez MapRuntime. Spis służy czytelności
 * i jako jedno miejsce, w którym widać, co powłoka ma do dyspozycji.
 */
export const SERVICE = Object.freeze({
    basemaps: 'basemaps',
    objects: 'objects',
    objectCommands: 'objectCommands',
    tools: 'tools',
    commands: 'commands',
    transfers: 'transfers',
    rasterExport: 'rasterExport',
    editing: 'editing',
    measurement: 'measurement',
    buffer: 'buffer',
    search: 'search',
    analysis: 'analysis',
    layers: 'layers',
    identify: 'identify',
    terrainProfile: 'terrainProfile',
    parcels: 'parcels',
    projectSession: 'projectSession',
});

export function AppServicesProvider({ hub, children }) {
    const value = useMemo(() => hub ?? new ServiceHub(), [hub]);
    return createElement(ServicesContext.Provider, { value }, children);
}

export function useServiceHub() {
    const hub = useContext(ServicesContext);
    if (!hub) throw new Error('useServiceHub wymaga AppServicesProvider w drzewie komponentów.');
    return hub;
}

/**
 * Zwraca instancję serwisu albo null, dopóki runtime jej nie opublikuje.
 * Komponent przerenderuje się dokładnie wtedy, gdy ten jeden serwis się zmieni.
 */
export function useService(name) {
    const hub = useServiceHub();
    const getSnapshot = useCallback(() => hub.get(name), [hub, name]);
    return useSyncExternalStore(hub.subscribe, getSnapshot, getSnapshot);
}

/**
 * Serwis + jego własny snapshot w jednym haku.
 *
 * Zastępuje powtarzany w każdym komponencie wzorzec
 * `useSyncExternalStore(manager?.subscribe ?? (() => () => undefined), ...)`,
 * który przy braku menedżera tworzył nową funkcję przy każdym renderze.
 *
 * `fallback` musi być stałą modułową (zamrożoną), a nie literałem w ciele
 * komponentu — inaczej getSnapshot zwracałby przy każdym renderze nowy obiekt.
 */
export function useServiceSnapshot(name, fallback) {
    const service = useService(name);
    const subscribe = useCallback(
        (listener) => (typeof service?.subscribe === 'function' ? service.subscribe(listener) : () => undefined),
        [service],
    );
    const getSnapshot = useCallback(
        () => (typeof service?.getSnapshot === 'function' ? service.getSnapshot() : fallback),
        [service, fallback],
    );
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
