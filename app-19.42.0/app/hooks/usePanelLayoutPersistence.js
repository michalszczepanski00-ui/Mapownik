import { useEffect, useRef } from 'react';
import { isNarrowScreen } from './useIsMobile.js';
import {
    closePanel,
    hydratePanels,
    readStoredPanelLayout,
    useAppDispatch,
    useAppSelector,
    writeStoredPanelLayout,
} from '../../store/index.js';

const WRITE_DELAY = 160;

/**
 * Odtwarza geometrię paneli z localStorage przy starcie i zapisuje ją po
 * każdej zmianie (z dławieniem, żeby przeciąganie panelu nie pisało do
 * pamięci trwałej na każdą klatkę).
 *
 * Pierwszy zapis jest celowo pominięty: bez tego hydratacja sama wywołałaby
 * zapis tego, co właśnie odczytano, a przy niedostępnym localStorage —
 * nadpisanie realnych ustawień wartościami domyślnymi.
 */
export function usePanelLayoutPersistence() {
    const dispatch = useAppDispatch();
    const panels = useAppSelector((state) => state.panels);
    const hydrated = useRef(false);

    useEffect(() => {
        const stored = readStoredPanelLayout();
        if (stored) dispatch(hydratePanels(stored));
        // 18.10.3: przy pierwszym uruchomieniu na telefonie panel jest arkuszem od
        // dołu i zasłaniałby paletę narzędzi oraz przełącznik podkładów — zaczynamy
        // ze zwiniętym panelem. Zapisany układ użytkownika ma pierwszeństwo.
        if (isNarrowScreen()) { for (const id of ['layers', 'objects', 'analysis', 'export', 'orthophoto']) dispatch(closePanel(id)); }
        const timer = window.setTimeout(() => { hydrated.current = true; }, 0);
        return () => window.clearTimeout(timer);
    }, [dispatch]);

    useEffect(() => {
        if (!hydrated.current) return undefined;
        const timer = window.setTimeout(() => writeStoredPanelLayout(panels), WRITE_DELAY);
        return () => window.clearTimeout(timer);
    }, [panels]);
}
