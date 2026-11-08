import { formatLength } from '../core/units.js';
export function formatDistance(value) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    if (n === 0) return '0 m';
    if (n < 1) return '< 1 m';
    return formatLength(n);
}
