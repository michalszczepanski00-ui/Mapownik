import { useEffect, useState } from 'react';

/**
 * 19.56.0 — udziały stref planu ogólnego i klas gruntu w granicy działki (api/parcel_shares.php).
 * Serwer liczy je z obrazu usługi WMS rysowanego własnym stylem (kolor na oznaczenie) w masce granicy działki.
 */
const cache = new Map();

export function fetchParcelShares(kind, parcel) {
    const key = `${kind}|${parcel.id ?? ''}|${String(parcel.wkt).length}`;
    if (!cache.has(key)) {
        const request = fetch('./api/parcel_shares.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, wkt: parcel.wkt, parcelId: parcel.id ?? '' }),
        }).then(async (response) => {
            const body = await response.json().catch(() => null);
            if (!response.ok || !body?.ok) throw new Error(body?.error || `Udziały: HTTP ${response.status}`);
            return body;
        });
        request.catch(() => cache.delete(key));
        cache.set(key, request);
    }
    return cache.get(key);
}

/** { status: 'idle' | 'loading' | 'ready' | 'error', data, error } */
export function useParcelShares(kind, parcel, enabled) {
    const [state, setState] = useState({ status: 'idle', data: null, error: null });
    const id = parcel?.id ?? null; const wkt = parcel?.wkt ?? null;
    useEffect(() => {
        if (!enabled || !kind || !wkt) { setState({ status: 'idle', data: null, error: null }); return undefined; }
        let alive = true;
        setState({ status: 'loading', data: null, error: null });
        fetchParcelShares(kind, { id, wkt })
            .then((data) => { if (alive) setState({ status: 'ready', data, error: null }); })
            .catch((error) => { if (alive) setState({ status: 'error', data: null, error: error instanceof Error ? error.message : String(error) }); });
        return () => { alive = false; };
    }, [kind, id, wkt, enabled]);
    return state;
}

/** Powierzchnia: od 0,01 ha w hektarach (2 miejsca), mniejsza w m². */
export function areaLabel(squareMeters) {
    const n = Number(squareMeters);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 100) return `${(n / 10000).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
    return `${Math.round(n).toLocaleString('pl-PL')} m²`;
}
export const pctLabel = (share) => (share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`);

/** Pozycje od 0,5% udziału (drobne paski na styku konturów to niedokładność granic w ewidencji). */
export function significantItems(data, parcelAreaSqm) {
    const total = Number(parcelAreaSqm) > 0 ? Number(parcelAreaSqm) : Number(data?.areaM2) || 0;
    return (data?.items ?? []).filter((item) => item.share >= 0.005).map((item) => ({ ...item, areaM2: item.share * total }));
}

/** Klasy I–III gruntów rolnych (R, Ł, Ps; także w użytkach zabudowanych, np. Br-RIIIa). */
export function isHighClass(code) {
    return /(?:^|-)(?:R|Ł|Ps)(?:I|II|III|IIIa|IIIb)$/u.test(String(code ?? '').trim());
}

/** Rodzaje stref planistycznych planu ogólnego (ustawa o planowaniu i zagospodarowaniu przestrzennym). */
export const POG_ZONE_NAMES = Object.freeze({
    SW: 'strefa wielofunkcyjna z zabudową mieszkaniową wielorodzinną',
    SJ: 'strefa wielofunkcyjna z zabudową mieszkaniową jednorodzinną',
    SZ: 'strefa wielofunkcyjna z zabudową zagrodową',
    SU: 'strefa usługowa',
    SH: 'strefa handlu wielkopowierzchniowego',
    SP: 'strefa gospodarcza',
    SR: 'strefa produkcji rolniczej',
    SI: 'strefa infrastrukturalna',
    SN: 'strefa zieleni i rekreacji',
    SC: 'strefa cmentarzy',
    SG: 'strefa górnictwa',
    SO: 'strefa otwarta',
    SK: 'strefa komunikacyjna',
});

/** „teren zabudowy mieszkaniowej jednorodzinnej,teren usług” → „tereny zabudowy mieszkaniowej jednorodzinnej, usług” — bez powtórzeń „teren”. */
export function profileLabel(text) {
    const parts = String(text ?? '').split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return '';
    const stripped = parts.map((part) => part.replace(/^teren(?:y)?\s+/i, ''));
    return parts.every((part) => /^teren/i.test(part)) ? `tereny ${stripped.join(', ')}` : parts.join(', ');
}

/** Data „2025/11/28” albo „2025-11-28” → „28.11.2025”. */
export function dateLabel(value) {
    const m = String(value ?? '').match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value ?? '');
}
