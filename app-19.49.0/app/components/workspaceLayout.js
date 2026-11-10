export const WORK_CARD_PREFS_KEY = 'msportal:work-card:v1';
export const WORK_CARD_DEFAULT_WIDTH = 260;
export const WORK_CARD_MIN_WIDTH = 220;
export const WORK_CARD_MAX_WIDTH = 400;
export const WORK_CARD_PREFS_EVENT = 'msportal-work-card-preferences';
export function clampWorkCardWidth(value, viewportWidth = 1366) {
    const max = Math.max(WORK_CARD_MIN_WIDTH, Math.min(WORK_CARD_MAX_WIDTH, Math.floor(viewportWidth * 0.35)));
    const width = Number(value);
    return Math.round(Math.max(WORK_CARD_MIN_WIDTH, Math.min(max, Number.isFinite(width) ? width : WORK_CARD_DEFAULT_WIDTH)));
}
export function readWorkCardPreferences(storage) {
    try {
        const raw = JSON.parse(storage?.getItem(WORK_CARD_PREFS_KEY) || 'null');
        return { width: clampWorkCardWidth(raw?.width ?? WORK_CARD_DEFAULT_WIDTH), collapsed: raw?.collapsed === true };
    } catch { return { width: WORK_CARD_DEFAULT_WIDTH, collapsed: false }; }
}
export function resetWorkCardPreferences(storage) {
    try { storage?.removeItem(WORK_CARD_PREFS_KEY); } catch { /* unavailable storage */ }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(WORK_CARD_PREFS_EVENT));
}
/** Configure the real distance operation; never activate/abort a drawing tool. */
export function prepareDistanceAnalysis(manager) {
    if (!manager) return false;
    const snapshot = manager.getSnapshot();
    if (snapshot.busy || snapshot.screeningBusy) return false;
    const current = snapshot.sources.find((entry) => entry.id === snapshot.sourceId);
    const source = current?.kind !== 'screening' && current ? current : snapshot.sources.find((entry) => entry.kind !== 'screening');
    if (!source || !snapshot.operations.some((operation) => operation.id === 'distance')) return false;
    if (source.id !== snapshot.sourceId) manager.setSourceId(source.id);
    manager.setPanelMode('manual');
    manager.setOperationId('distance');
    manager.setAreaMode(snapshot.selectedObjectId ? 'selected' : 'viewport');
    return true;
}
