import { createElement as h, useEffect, useMemo, useState } from 'react';
import { Bookmark, Download, LoaderCircle, Navigation, RotateCw, ScanSearch, Share2, X } from 'lucide-react';
import { reportDialog } from '../components/reportDialogStore.js';
import { useService, useServiceSnapshot } from '../services/AppServicesContext.js';
import { normalizeLayer } from '../components/IdentifyPanel.js';
import { ParcelCard } from '../components/ParcelCard.js';
import { MobileSheet } from './MobileSheet.js';
import { screeningCategory, screeningQuality, QUALITY_LABELS } from '../../analysis/screeningQuality.js';
import { formatParcelArea, formatLength } from '../../core/units.js';
import { t, tn } from '../../i18n/index.js';

const EMPTY_IDENTIFY = Object.freeze({ open: false, layers: [] });
const EMPTY_ANALYSIS = Object.freeze({ screeningResults: [], screeningBusy: false });

/** Link do nawigacji (Mapy Google) do środka działki albo wskazanego punktu. */
function navigationUrl(lonLat) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lonLat[1].toFixed(6)},${lonLat[0].toFixed(6)}`;
}

function ActionButton({ icon, label, onClick, primary = false, disabled = false, busy = false }) {
    return h('button', { type: 'button', className: `m-action${primary ? ' is-primary' : ''}`, onClick, disabled },
        h('span', { className: 'm-action-icon', 'aria-hidden': true }, busy ? h(LoaderCircle, { size: 20, className: 'is-spinning' }) : icon),
        h('span', { className: 'm-action-label' }, label));
}

/** Wynik screeningu w karcie — bez przechodzenia do osobnego panelu. */
function ScreeningBlock({ analysis, manager }) {
    const rows = analysis.screeningResults ?? [];
    if (!analysis.screeningBusy && !rows.length && !analysis.screeningError) return null;
    const radius = analysis.screeningContext?.radius ?? analysis.screeningRadiusMeters;
    const failed = rows.filter((row) => row.status === 'error' && row.code !== 'CANCELLED').length;
    return h('section', { className: 'm-screening', 'aria-label': t('mobile.card.screening') },
        h('div', { className: 'm-screening-head' },
            h('strong', null, t('mobile.card.screeningTitle', { radius: formatLength(radius) })),
            analysis.screeningBusy && analysis.screeningProgress
                ? h('span', null, h(LoaderCircle, { size: 13, className: 'is-spinning' }), ` ${analysis.screeningProgress.done}/${analysis.screeningProgress.total}`)
                : null),
        analysis.screeningError ? h('p', { className: 'm-note' }, analysis.screeningError) : null,
        failed >= 2 && !analysis.screeningBusy ? h('div', { className: 'm-inline-warning' },
            h('span', null, tn('analysis.screening.sourcesDown', failed)),
            h('button', { type: 'button', onClick: () => void manager?.retryScreeningFailed() }, h(RotateCw, { size: 14 }), t('identify.retryOne'))) : null,
        h('ul', { className: 'm-screening-list' }, rows.map((row) => {
            const value = row.code === 'CANCELLED' ? 'Nie sprawdzono' : row.status === 'error' ? t('analysis.screening.error')
                : screeningQuality(row) === 'incomplete' ? t('analysis.screening.incomplete')
                : row.approximate ? (row.featureCount ? t('analysis.screening.sampledHit') : t('analysis.screening.undecided'))
                        : row.collision ? t('analysis.screening.collision')
                        : row.nearestDistanceMeters == null ? t('mobile.card.noneWithin', { radius: formatLength(radius) }) : formatLength(row.nearestDistanceMeters);
            const tone = ['unknown', 'unavailable'].includes(screeningCategory(row)) ? 'muted' : row.collision ? 'danger' : (row.nearestDistanceMeters != null || (row.approximate && row.featureCount)) ? 'warning' : 'ok';
            return h('li', { key: row.sourceId, className: `m-screening-row is-${tone}` }, h('span', null, row.title, h('small', { className: 'data-quality' }, QUALITY_LABELS[screeningQuality(row)])), h('strong', null, value));
        })));
}

/**
 * 18.14.0 — karta działki na telefonie (jak karta miejsca w Mapach Google).
 * Pasek: numer, obręb, powierzchnia i najważniejsze znaczniki. Pół ekranu:
 * akcje (Screening, Zapisz, Nawiguj, Udostępnij) i wynik screeningu w tej
 * samej karcie. 19.53.0: wyniki w grupach karty działki (ParcelCard bez nagłówka), szczegóły rozwijane w wierszach.
 */
export function MobileParcelCard() {
    const tools = useService('tools');
    const identify = useService('identify');
    const parcels = useService('parcels');
    const analysisManager = useService('analysis');
    const toasts = useService('featureContext')?.toasts;
    const snapshot = useServiceSnapshot('identify', EMPTY_IDENTIFY);
    const analysis = useServiceSnapshot('analysis', EMPTY_ANALYSIS);
    const [snap, setSnap] = useState('peek');
    const [savedId, setSavedId] = useState(null);
    const key = Array.isArray(snapshot.coordinate2180) ? snapshot.coordinate2180.join(',') : '';

    // Nowe wskazanie → karta wraca do paska.
    useEffect(() => { setSnap('peek'); setSavedId(null); }, [key]);
    const layers = useMemo(() => (snapshot.layers ?? []).map(normalizeLayer), [snapshot.layers]);
    if (!snapshot.open) return null;

    const parcel = snapshot.parcel;
    const busy = snapshot.parcelBusy;
    const title = parcel?.parcel ? t('mobile.card.parcel', { number: parcel.parcel })
        : busy ? t('mobile.card.loading') : t('mobile.card.place');
    const subtitle = parcel
        ? [parcel.region, parcel.commune].filter(Boolean).join(' · ') + (Number.isFinite(snapshot.parcelAreaSqm) ? ` · ${formatParcelArea(snapshot.parcelAreaSqm).split(' (')[0]}` : '')
        : snapshot.parcelError ? t('mobile.card.noParcel') : '';
    const target = snapshot.parcelCenterLonLat ?? snapshot.coordinateLonLat;

    const ensureSaved = () => {
        if (!parcel?.wkt || !parcels) return null;
        const id = parcels.addParcel(parcel);
        setSavedId(id);
        return id;
    };
    const onScreening = () => {
        try {
            ensureSaved();
            setSnap('half');
            window.setTimeout(() => void analysisManager?.runParcelScreening(), 0);
        } catch (error) { toasts?.show?.({ tone: 'danger', message: error instanceof Error ? error.message : String(error) }); }
    };
    const onSave = () => {
        try { ensureSaved(); }
        catch (error) { toasts?.show?.({ tone: 'danger', message: error instanceof Error ? error.message : String(error) }); }
    };
    const onShare = async () => {
        if (!target) return;
        const text = parcel?.id ? `${t('mobile.card.parcel', { number: parcel.parcel })} (${parcel.id})` : t('mobile.card.place');
        const url = `https://www.google.com/maps/search/?api=1&query=${target[1].toFixed(6)},${target[0].toFixed(6)}`;
        try {
            if (navigator.share) await navigator.share({ title: text, text, url });
            else { await navigator.clipboard.writeText(`${text}\n${url}`); toasts?.show?.({ tone: 'success', message: t('mobile.card.copied') }); }
        } catch { /* anulowane udostępnianie */ }
    };

    return h(MobileSheet, {
        snap, onSnap: setSnap, onClose: () => identify?.close(),
        label: title,
        className: 'm-parcel-card',
        peekHeight: 192, // 19.0.0: było 156 — rząd MPZP / Plan ogólny / Natura 2000 był widoczny w 20 z 48 px
        header: h('div', null, h('div', { className: 'm-card-head' },
            h('div', { className: 'm-card-title' },
                h('strong', null, title),
                subtitle ? h('span', null, subtitle) : null),
            h('button', { type: 'button', className: 'm-icon-button', 'aria-label': t('identify.close'), onClick: () => identify?.close() }, h(X, { size: 20 }))),
            h('div', { className: 'm-peek-actions' },
                h('button', { type: 'button', disabled: !parcel?.wkt, onClick: onSave }, savedId ? '✓ W projekcie' : '+ Do projektu'),
                h('button', { type: 'button', disabled: !parcel?.wkt || analysis.screeningBusy, onClick: onScreening }, 'Analizuj'),
                h('button', { type: 'button', disabled: !parcel?.wkt, onClick: () => { try { ensureSaved(); identify?.close(); void tools?.activate('core.buffer'); } catch (error) { toasts?.show?.({ tone: 'danger', message: String(error) }); } } }, 'Bufor'))),
    },
        // 19.53.0: te same grupy wyników co na komputerze (Planowanie · Ograniczenia · Grunt, „W okolicy”,
        // „Szczegóły i źródła”, stan źródeł) — w pasku arkusza widać Planowanie.
        h('div', { className: 'm-card-groups' }, h(ParcelCard, { snapshot, manager: identify, layers, headless: true })),
        h('div', { className: 'm-actions', role: 'group', 'aria-label': t('mobile.card.actions') },
            h(ActionButton, { primary: true, icon: h(ScanSearch, { size: 20 }), label: t('mobile.card.screeningAction'), onClick: onScreening, disabled: !parcel?.wkt || analysis.screeningBusy, busy: analysis.screeningBusy }),
            h(ActionButton, { icon: h(Bookmark, { size: 20 }), label: savedId ? t('mobile.card.savedShort') : t('mobile.card.save'), onClick: onSave, disabled: !parcel?.wkt }),
            h(ActionButton, { icon: h(Navigation, { size: 20 }), label: t('mobile.card.navigate'), onClick: () => target && window.open(navigationUrl(target), '_blank', 'noopener'), disabled: !target }),
            h(ActionButton, { icon: h(Share2, { size: 20 }), label: t('mobile.card.share'), onClick: onShare, disabled: !target }),
            // 19.36.0: raport działki PDF.
            h(ActionButton, { icon: h(Download, { size: 20 }), label: 'Raport PDF', onClick: () => parcel?.wkt && reportDialog.open(parcel), disabled: !parcel?.wkt })),
        h(ScreeningBlock, { analysis, manager: analysisManager }));
}
