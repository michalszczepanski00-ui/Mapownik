function assertProvider(provider) {
    if (!provider || typeof provider !== 'object') throw new Error('Provider analizy musi być obiektem.');
    if (!provider.id || typeof provider.id !== 'string') throw new Error('Provider analizy wymaga tekstowego ID.');
    if (!provider.title || typeof provider.title !== 'string') throw new Error(`Provider ${provider.id} wymaga nazwy.`);
    if (typeof provider.load !== 'function') throw new Error(`Provider ${provider.id} wymaga metody load().`);
}

/**
 * Rejestr źródeł danych analitycznych. UI i AnalysisManager nie znają sposobu
 * pozyskania danych (plik lokalny, API, baza serwerowa, provider testowy).
 */
export class AnalysisProviderRegistry {
    constructor() {
        this.providers = new Map();
    }
    register(provider) {
        assertProvider(provider);
        if (this.providers.has(provider.id)) throw new Error(`Provider analizy ${provider.id} jest już zarejestrowany.`);
        this.providers.set(provider.id, provider);
        return provider;
    }
    unregister(id) {
        return this.providers.delete(id);
    }
    get(id) {
        const provider = this.providers.get(id);
        if (!provider) throw new Error(`Nieznane źródło analityczne: ${id}`);
        return provider;
    }
    list() {
        return [...this.providers.values()].map((provider) => ({
            id: provider.id,
            title: provider.title,
            description: provider.description ?? '',
            status: provider.status ?? 'ready',
            testData: Boolean(provider.testData),
            kind: provider.kind === 'screening' ? 'screening' : 'precise',
        }));
    }
    clear() {
        this.providers.clear();
    }
}
