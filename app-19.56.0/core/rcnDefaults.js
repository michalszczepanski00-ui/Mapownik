/**
 * 19.46.0 — wspólne ustawienia cen transakcyjnych (Rejestr Cen Nieruchomości).
 * Karta działki, zakładka Raport (ceny w okolicy), raport PDF „Dla kupującego” i porównanie działek
 * liczą medianę z tych samych parametrów. Wcześniej karta brała 3 lata, raport 5 lat, a porównanie 1 km,
 * więc ta sama działka miała różne „mediany”.
 */
export const RCN_DEFAULTS = Object.freeze({ radius: 500, years: 5, kind: 'grunty' });

/** Najmniejsza liczba transakcji, od której mediana jest wynikiem (tak samo w api/rcn.php: RCN_MIN_MEDIAN_COUNT). */
export const RCN_MIN_MEDIAN_COUNT = 3;

/** Czy mediana z odpowiedzi api/rcn.php jest wiarygodna (starsze odpowiedzi z pamięci serwera nie mają pola medianReliable). */
export function medianReliable(stats) {
    if (!stats || stats.medianPerM2 == null) return false;
    return typeof stats.medianReliable === 'boolean' ? stats.medianReliable : (stats.perM2Count ?? 0) >= RCN_MIN_MEDIAN_COUNT;
}

/** „5 lat”, „3 lata”, „1 rok”. */
export function yearsLabel(years) {
    const n = Number(years);
    return n === 1 ? '1 rok' : n >= 2 && n <= 4 ? `${n} lata` : `${n} lat`;
}

/** „500 m”, „1 km”. */
export function radiusLabel(radius) {
    const n = Number(radius);
    return n >= 1000 ? `${String(n / 1000).replace('.', ',')} km` : `${n} m`;
}
