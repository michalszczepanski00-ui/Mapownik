const clean = (value) => Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
/** Independent left/right owners update only their own insets. */
export function mergeOcclusion(current, patch) {
    const next = { left: 0, right: 0, bottom: 0, ...current };
    for (const key of ['left', 'right', 'bottom']) if (patch && Object.hasOwn(patch, key)) next[key] = clean(patch[key]);
    return next;
}
export function fitPaddingWithOcclusion(padding, hidden = {}, size) {
    const [top, right, bottom, left] = padding;
    const l = clean(hidden.left), r = clean(hidden.right), b = clean(hidden.bottom);
    const width = size?.[0]; const height = size?.[1];
    const budget = Number.isFinite(width) ? Math.max(0, width - left - right - Math.min(160, width * 0.3)) : l + r;
    const ratio = l + r > 0 ? Math.min(1, budget / (l + r)) : 0;
    const bottomBudget = Number.isFinite(height) ? Math.max(0, height - top - bottom - Math.min(120, height * 0.3)) : b;
    return [top, right + Math.round(r * ratio), bottom + Math.min(b, bottomBudget), left + Math.round(l * ratio)];
}
