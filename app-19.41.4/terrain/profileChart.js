/** Shared chart geometry: drawing and hit testing use the same distance axis. */
export function normalizeElevation(value) {
    if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function profileScale(points, width, height, padding) {
    const valid = points.filter((p) => Number.isFinite(p.elevation) && Number.isFinite(p.distance));
    if (valid.length < 2) return null;
    const minD = points[0].distance;
    const maxD = points.at(-1).distance;
    let minH = Infinity, maxH = -Infinity;
    for (const p of valid) { minH = Math.min(minH, p.elevation); maxH = Math.max(maxH, p.elevation); }
    const spanH = Math.max(1, maxH - minH);
    const xy = (p) => ({
        x: padding.left + ((p.distance - minD) / Math.max(1e-9, maxD - minD)) * (width - padding.left - padding.right),
        y: padding.top + (1 - (p.elevation - minH) / spanH) * (height - padding.top - padding.bottom),
    });
    const segments = []; let current = [];
    for (const p of points) {
        if (!Number.isFinite(p.elevation)) { if (current.length) segments.push(current); current = []; }
        else current.push(xy(p));
    }
    if (current.length) segments.push(current);
    const line = (segment) => segment.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const path = segments.map(line).join(' ');
    const fillPath = segments.filter((s) => s.length > 1).map((s) => `${line(s)} L${s.at(-1).x},${height-padding.bottom} L${s[0].x},${height-padding.bottom} Z`).join(' ');
    return { valid, minD, maxD, minH, maxH, path, fillPath, xy };
}

export function profileIndexAtX(points, x, width, padding) {
    if (!points.length || !Number.isFinite(x)) return null;
    const fraction = Math.max(0, Math.min(1, (x - padding.left) / (width - padding.left - padding.right)));
    const distance = points[0].distance + fraction * (points.at(-1).distance - points[0].distance);
    let low = 0, high = points.length - 1;
    while (low < high) { const mid = (low + high) >> 1; if (points[mid].distance < distance) low = mid + 1; else high = mid; }
    return low > 0 && distance - points[low - 1].distance <= points[low].distance - distance ? low - 1 : low;
}

/** Screen CTM accounts for viewBox, aspect ratio, resizing and browser zoom. */
export function profilePointerX(svg, clientX, clientY) {
    const matrix = svg.getScreenCTM?.();
    if (!matrix) return null;
    try {
        const point = svg.createSVGPoint(); point.x = clientX; point.y = clientY;
        return point.matrixTransform(matrix.inverse()).x;
    } catch { return null; }
}
