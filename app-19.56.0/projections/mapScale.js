/**
 * Przeliczenie poziomu przybliżenia mapy na mianownik skali.
 *
 * Po co: katalog opisuje widoczność warstw poziomem zoomu (`minZoom: 17`),
 * a to liczba, która nic nie znaczy dla osoby patrzącej na mapę. „Widoczna
 * od 1:2 000" znaczy.
 *
 * Widok jest w EPSG:3857, więc rozdzielczość to standardowa drabina
 * Web Mercatora. Rozdzielczość rzeczywista na gruncie jest mniejsza
 * o cos(szerokości) — bez tej poprawki skala dla Polski wychodziłaby
 * zawyżona o ponad połowę.
 *
 * Szerokość jest przyjęta na sztywno jako środek Polski. Między Tatrami
 * a Bałtykiem daje to rozrzut około 7%, który i tak znika przy zaokrągleniu
 * do skali kartograficznej — a w zamian funkcja jest czysta i nie potrzebuje
 * dostępu do widoku mapy.
 */

/** Rozdzielczość Web Mercatora na równiku przy zoomie 0 [m/px]. */
const EQUATOR_RESOLUTION = 156543.03392804097;

/** Środek Polski — 52°N. */
const REFERENCE_LATITUDE_RAD = (52 * Math.PI) / 180;

/** Znormalizowany piksel OGC: 0,28 mm. */
const OGC_PIXEL_METERS = 0.00028;

/**
 * Rozdzielczość na gruncie [m/px] dla danego poziomu przybliżenia.
 *
 * 19.0.0: opcjonalna szerokość geograficzna (w stopniach). Bez niej funkcja liczy
 * dla 52°N jak dotąd (panel warstw nie ma dostępu do widoku), a pasek skali i pasek
 * stanu podają szerokość środka mapy, więc podziałka zgadza się z pomiarem na mapie
 * także w Bieszczadach i na Pomorzu.
 */
export function groundResolutionForZoom(zoom, latitudeDeg) {
    if (!Number.isFinite(zoom))
        return null;
    const latitudeRad = Number.isFinite(latitudeDeg) ? (latitudeDeg * Math.PI) / 180 : REFERENCE_LATITUDE_RAD;
    return (EQUATOR_RESOLUTION / 2 ** zoom) * Math.cos(latitudeRad);
}

/** Mianownik skali dla danego poziomu przybliżenia (bez zaokrąglania). */
export function scaleDenominatorForZoom(zoom, latitudeDeg) {
    const resolution = groundResolutionForZoom(zoom, latitudeDeg);
    return resolution === null ? null : resolution / OGC_PIXEL_METERS;
}

/**
 * Ta sama skala, zaokrąglona do dwóch cyfr znaczących W DÓŁ.
 *
 * W dół, bo mianownik maleje wraz z przybliżaniem: zaokrąglenie w górę
 * obiecywałoby, że warstwa jest już widoczna przy skali, przy której jeszcze
 * jej nie ma. Dwie cyfry znaczące, bo i tak dokładniejszy wynik zjada
 * przyjęta na sztywno szerokość geograficzna.
 */
export function niceScaleDenominator(zoom, latitudeDeg) {
    const exact = scaleDenominatorForZoom(zoom, latitudeDeg);
    if (exact === null || exact <= 0)
        return null;
    const magnitude = 10 ** (Math.floor(Math.log10(exact)) - 1);
    return Math.floor(exact / magnitude) * magnitude;
}

/** „~1:2 600" — ze spacją nierozdzielającą jako separatorem tysięcy. */
// 17.8.11: jeden formatter zamiast toLocaleString() przy każdym wywołaniu
// (każde tworzyło nowy Intl.NumberFormat — dziesiątki razy na render panelu).
const PL_INTEGER = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
export function formatScale(denominator, { approximate = true } = {}) {
    if (!Number.isFinite(denominator))
        return null;
    const digits = PL_INTEGER.format(Math.round(denominator)).replace(/\u00a0/g, '\u202f');
    return `${approximate ? '~' : ''}1:${digits}`;
}

/**
 * 19.0.0: podziałka liniowa. Wybiera „okrągłą" długość
 * (1; 2; 2,5 albo 5 razy potęga 10) tak, by odcinek nie przekroczył `maxWidthPx`, i zwraca jego szerokość w pikselach.
 * Zwraca null, gdy poziom przybliżenia jest nieznany.
 */
const SCALE_BAR_STEPS = [1, 2, 2.5, 5];
export function scaleBarForZoom(zoom, latitudeDeg, maxWidthPx = 56) {
    const resolution = groundResolutionForZoom(zoom, latitudeDeg);
    if (resolution === null || !(resolution > 0))
        return null;
    const maxMeters = resolution * maxWidthPx;
    const magnitude = 10 ** Math.floor(Math.log10(maxMeters));
    let meters = magnitude;
    for (const step of SCALE_BAR_STEPS) {
        if (step * magnitude <= maxMeters)
            meters = step * magnitude;
    }
    return { meters, widthPx: Math.round(meters / resolution), label: formatScaleBarLength(meters) };
}

const PL_DECIMAL = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
/** „50 cm", „200 m", „2 km" — jednostka dobrana do długości. */
export function formatScaleBarLength(meters) {
    if (!Number.isFinite(meters))
        return '';
    if (meters >= 1000)
        return `${PL_DECIMAL.format(meters / 1000)} km`;
    if (meters >= 1)
        return `${PL_DECIMAL.format(meters)} m`;
    return `${PL_DECIMAL.format(meters * 100)} cm`;
}
