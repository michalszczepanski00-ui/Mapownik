// EGiB: WWPPGG_R.OOOO.[AR_NR.]NR_DZ (numer działki może mieć mianownik).
export const PARCEL_ID_PATTERN = /^\d{6}_[1-9]\.\d{4}\.(?:AR_\d+\.)?\d+(?:\/\d+)?$/i;

export function normalizeParcelIdentifier(value) {
    return String(value ?? '').trim().toUpperCase();
}

export function isParcelIdentifier(value) {
    return PARCEL_ID_PATTERN.test(normalizeParcelIdentifier(value));
}

export function isParcelIdentifierCandidate(value) {
    return /^\d{6}_[1-9](?:\.|$)/.test(normalizeParcelIdentifier(value));
}
