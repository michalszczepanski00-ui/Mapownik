/**
 * 18.11.1: jedno miejsce formatowania odległości i powierzchni.
 * Wcześniej każdy panel miał własną funkcję (6 wariantów: same m², „tys. m²”,
 * ha w nawiasie, ha) i pomiar pokazywał np. „397 322 m” albo
 * „26 582 329 990 m²”.
 *
 * Zasady:
 *  - odległość: < 10 m z dokładnością 0,1 m; do 1 km w metrach; dalej w km
 *    (2 miejsca do 10 km, 1 do 100 km, potem całe km);
 *  - powierzchnia: do 1 ha w m²; do 100 km² w ha (2 miejsca, od 100 ha jedno);
 *    dalej w km²;
 *  - działka: zawsze w ha z 4 miejscami (jak w EGiB) i m² w nawiasie.
 */
const nf = (digits) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const N0 = nf(0);
const N1 = nf(1);
const N2 = nf(2);
const N4 = nf(4);

const valid = (value) => value != null && value !== '' && Number.isFinite(Number(value));

export function formatLength(meters, { empty = '—' } = {}) {
    if (!valid(meters)) return empty;
    const n = Math.abs(Number(meters));
    if (n === 0) return '0 m';
    if (n < 10) return `${N1.format(n)} m`;
    if (n < 1000) return `${N0.format(n)} m`;
    const km = n / 1000;
    if (km < 10) return `${N2.format(km)} km`;
    if (km < 100) return `${N1.format(km)} km`;
    return `${N0.format(km)} km`;
}

export function formatArea(squareMeters, { empty = '—' } = {}) {
    if (!valid(squareMeters)) return empty;
    const n = Math.abs(Number(squareMeters));
    if (n < 10000) return `${N0.format(n)} m²`;
    const ha = n / 10000;
    if (ha < 100) return `${N2.format(ha)} ha`;
    if (ha < 10000) return `${N1.format(ha)} ha`;
    const km2 = n / 1e6;
    return `${(km2 < 1000 ? N1 : N0).format(km2)} km²`;
}

/** Powierzchnia działki ewidencyjnej: ha z 4 miejscami + m² (np. „1,2345 ha (12 345 m²)”). */
export function formatParcelArea(squareMeters, { empty = '—' } = {}) {
    if (!valid(squareMeters)) return empty;
    const n = Math.abs(Number(squareMeters));
    return `${N4.format(n / 10000)} ha (${N0.format(n)} m²)`;
}
