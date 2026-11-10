import { useIsMobile } from './hooks/useIsMobile.js';
import { MobileShell } from './mobile/MobileShell.js';
import { createElement as h, useEffect, useMemo, useRef } from 'react';
import { Focus } from 'lucide-react';
import { IconButton } from './components/IconButton.js';
import * as Tooltip from '@radix-ui/react-tooltip';
import { MapTopBar } from './components/AppBar.js';
import { BasemapSwitcher } from './components/BasemapSwitcher.js';
import { DialogHost } from './components/DialogHost.js';
import { ReportPdfHost } from './components/ReportPdfDialog.js';
import { Terrain3DHost } from '../terrain3d/terrain3dService.js';
import { Dock } from './components/Dock.js';
import { FloatingPanels } from './components/FloatingPanels.js';
import { ToolDock } from './components/ToolDock.js';
import { MapToolHint } from './components/MapToolHint.js';
import { MapLegend } from './components/MapLegend.js';
import { WorkspaceCard } from './components/WorkspaceCard.js';
import { MapStage } from './components/MapStage.js';
import { ContextBar } from './components/ContextBar.js';
import { CommandOverlays } from './components/CommandPalette.js';
import { ToastHost } from './components/ToastHost.js';
import { useShellCommands } from './hooks/useShellCommands.js';
import { RightPanelDock } from './components/RightPanelDock.js';
import { ServiceHub } from './services/ServiceHub.js';
import { AppServicesProvider, useService, useServiceSnapshot } from './services/AppServicesContext.js';
import { ContextualPanelBridges } from './panels/ContextualPanelBridges.js';
import { registerBuiltInPanels } from './panels/registerBuiltInPanels.js';
import { t } from '../i18n/index.js';
import { useWorkspaceGeometryGuard } from './hooks/useDockGeometry.js';
import { usePanelLayoutPersistence } from './hooks/usePanelLayoutPersistence.js';
import { PANEL_DEFS, PANEL_MODE, UI_PREFS_STORAGE_KEY, closePanel, hydrateUiPrefs, openPanel, selectPanelMode, selectPanelOpen, setPanelMode, setSystemTheme, setMapOnly, useAppDispatch, useAppSelector } from '../store/index.js';
import { appDialogs } from '../core/index.js';
import { downloadText } from '../core/index.js';

const EMPTY_RASTER_EXPORT = Object.freeze({ selecting: false });

registerBuiltInPanels();

function useThemeAttribute(theme) {
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        return () => {
            if (document.documentElement.dataset.theme === theme) delete document.documentElement.dataset.theme;
        };
    }, [theme]);
}

/**
 * 18.0 — podpisy narzędzi i gęstość układu są preferencją stanowiska:
 * zapis w przeglądarce, nie w pliku projektu.
 */
function useUiPrefsPersistence() {
    const dispatch = useAppDispatch();
    const density = useAppSelector((state) => state.ui.density);
    const theme = useAppSelector((state) => state.ui.theme);
    const themeMode = useAppSelector((state) => state.ui.themeMode);
    const fullToolPalette = useAppSelector((state) => state.ui.fullToolPalette);
    const loaded = useRef(false);
    useEffect(() => {
        if (themeMode !== 'system') return undefined;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const update = () => dispatch(setSystemTheme(media.matches ? 'dark' : 'light'));
        update(); media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, [themeMode, dispatch]);
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(UI_PREFS_STORAGE_KEY);
            if (raw) dispatch(hydrateUiPrefs(JSON.parse(raw)));
        } catch { /* brak dostępu do localStorage — zostają wartości domyślne */ }
        loaded.current = true;
    }, [dispatch]);
    useEffect(() => {
        if (!loaded.current) return;
        try { window.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify({ density, theme, themeMode, fullToolPalette })); }
        catch { /* jw. */ }
    }, [density, theme, themeMode, fullToolPalette]);
}

/**
 * Wczytanie projektu z linku `?p=<id>` (przycisk „Udostępnij" w Eksporcie).
 *
 * Link jest odczytywany raz, przy starcie — parametr znika z adresu od razu
 * (`history.replaceState`), więc odświeżenie strony po zaakceptowaniu albo
 * odrzuceniu propozycji nie pyta drugi raz o to samo ani nie próbuje wczytać
 * czegoś, co użytkownik już zdążył zmienić lokalnie.
 *
 * Wczytanie ZASTĘPUJE bieżący lokalny projekt (msportal trzyma jeden projekt
 * na przeglądarkę) — stąd potwierdzenie i automatyczna kopia bezpieczeństwa,
 * dokładnie tak samo jak przy imporcie pliku .mapownik w Eksporcie. Od tego
 * momentu to zwykły lokalny projekt: dalsza edycja nie dotyka udostępnionego
 * zapisu na serwerze, a ponowne „Udostępnij" tworzy NOWY, osobny link.
 */
function useSharedProjectLoader() {
    const transfers = useService('transfers');
    const handledRef = useRef(false);
    useEffect(() => {
        if (handledRef.current || !transfers) return;
        const url = new URL(window.location.href);
        const id = url.searchParams.get('p');
        if (!id) return;
        handledRef.current = true;
        url.searchParams.delete('p');
        window.history.replaceState(null, '', url.toString());
        void (async () => {
            const accepted = await appDialogs.confirm({
                title: t('shared.confirm.title'),
                message: t('shared.confirm.message'),
                hint: t('shared.confirm.hint'),
                confirmLabel: t('shared.confirm.open'),
                tone: 'danger',
            });
            if (!accepted) return;
            try {
                const response = await fetch(`./api/shared_project.php?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    throw new Error(payload?.error || t('shared.invalid', { status: response.status }));
                }
                const text = await response.text();
                await transfers.importProject(text, (backup) => downloadText(backup.text, backup.filename, 'application/json;charset=utf-8'));
            } catch (error) {
                await appDialogs.confirm({
                    title: t('shared.failed'),
                    message: error instanceof Error ? error.message : String(error),
                    confirmLabel: 'OK',
                    cancelLabel: t('dialog.close'),
                });
            }
        })();
    }, [transfers]);
}

const PLACE_CARD_IDS = Object.keys(PANEL_DEFS).filter((id) => PANEL_DEFS[id].placeCard)
    .sort((a, b) => PANEL_DEFS[a].order - PANEL_DEFS[b].order);
const NO_RESULT = Object.freeze({ open: false });

/**
 * 19.10.0 — karta miejsca: na komputerze wynik „Sprawdź” (panel z `placeCard`)
 * jest oknem po lewej pod wyszukiwarką (34-v2.css), a nie zakładką prawego doku.
 * Prawy dok zostaje dla warstw i pozostałych modułów, więc oba widać naraz.
 * Telefon ma własną kartę (MobileParcelCard) i tego nie dotyczy.
 */
function usePlaceCards(mobile) {
    const dispatch = useAppDispatch();
    const modes = useAppSelector((state) => PLACE_CARD_IDS.map((id) => selectPanelMode(state, id)).join(','));
    const identify = useServiceSnapshot('identify', NO_RESULT);
    useEffect(() => {
        if (mobile) return;
        PLACE_CARD_IDS.forEach((id) => {
            if (selectModeOf(modes, id) === PANEL_MODE.floating) return;
            dispatch(setPanelMode(id, PANEL_MODE.floating));
            // Odpięcie otwiera okno — bez wyniku karta ma zostać zamknięta.
            if (!(PANEL_DEFS[id].controlledBy === 'identify' && identify.open)) dispatch(closePanel(id));
        });
    }, [mobile, modes, dispatch, identify.open]);
}
function selectModeOf(modes, id) {
    return modes.split(',')[PLACE_CARD_IDS.indexOf(id)];
}

/**
 * 19.11.0 — zakładki karty miejsca: Działka · Raport · Analizy. Moduły są
 * wzajemnie wykluczającymi się oknami (floatGroup 'place-card'), więc zakładka
 * to po prostu otwarcie modułu; karta pod spodem jest jego własnym panelem.
 */

/**
 * Powłoka aplikacji: rozkłada obszar roboczy i nic poza tym.
 *
 * Obszar roboczy pokazuje mapę pod kartą prawego panelu i stałą szynę ikon.
 * Karta nie rezerwuje pustych pasów nad i pod sobą; mapa zajmuje całą wysokość,
 * a ResizeObserver w MapStage dopasowuje ją do dostępnego obszaru.
 *
 * Panele nie są tu wymienione z nazwy — dok i szyna biorą je z PanelRegistry,
 * a okna odpięte renderuje FloatingPanels. Dodanie modułu nie zmienia tego
 * pliku.
 */
function Terrain3DMount() {
    const objects = useService('objects');
    return h(Terrain3DHost, { objects });
}

function AppShell() {
    const dispatch = useAppDispatch();
    const theme = useAppSelector((state) => state.ui.theme);
    const density = useAppSelector((state) => state.ui.density);
    const mapOnly = useAppSelector((state) => state.ui.mapOnly);
    const mapAreaRef = useRef(null);
    const restoreButtonRef = useRef(null);
    const mapOnlyWasActive = useRef(false);
    const rasterExport = useServiceSnapshot('rasterExport', EMPTY_RASTER_EXPORT);
    const exportSelectionMode = Boolean(rasterExport.selecting);
    // 18.14.0: telefon dostaje własną powłokę (MobileShell) zamiast palety, szyny i pasków.
    const mobile = useIsMobile();

    useThemeAttribute(theme);
    // 18.0: skróty (cofnij, usuń, Escape, narzędzia) są poleceniami w CommandRegistry
    // (features/builtin/coreFeature.js, useShellCommands) — jeden nasłuch klawiatury.
    useShellCommands();
    useUiPrefsPersistence();
    useSharedProjectLoader();
    usePanelLayoutPersistence();
    useWorkspaceGeometryGuard(mapAreaRef);
    usePlaceCards(mobile);

    useEffect(() => {
        if (!mapOnly) {
            if (mapOnlyWasActive.current) document.getElementById('map-only-enter')?.focus();
            mapOnlyWasActive.current = false;
            return undefined;
        }
        mapOnlyWasActive.current = true;
        restoreButtonRef.current?.focus();
        const restoreOnEscape = (event) => {
            if (event.key !== 'Escape' || appDialogs.getSnapshot().request) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            dispatch(setMapOnly(false));
        };
        window.addEventListener('keydown', restoreOnEscape, true);
        return () => window.removeEventListener('keydown', restoreOnEscape, true);
    }, [mapOnly, dispatch]);

    // Tryb zaznaczania prostokąta eksportu chowa całą powłokę, żeby nie
    // zasłaniała kadru. Elementy są montowane warunkowo, a nie tylko ukrywane
    // stylem — dzięki temu nie nasłuchują wtedy na zdarzenia mapy.
    const chrome = !exportSelectionMode && !mapOnly;

    return h('div', { className: `app-shell${mobile ? ' is-mobile' : ' is-v2'}${exportSelectionMode ? ' is-export-selection' : ''}${mapOnly ? ' is-map-only' : ''}${!mobile ? ' is-workspace-1c' : ''}`, 'data-theme': theme, 'data-density': density },
        h(ContextualPanelBridges, null),
        h(CommandOverlays, null),
        h(ToastHost, null),
        // Poza `chrome`: okno dialogowe musi działać także w trybie zaznaczania
        // kadru eksportu, gdzie reszta powłoki jest odmontowana.
        h(DialogHost, null),
        // 19.36.0: okno raportu działki PDF (portal do <body>, jak DialogHost).
        h(ReportPdfHost, null),
        // 19.41.0: okno „Teren 3D” (portal; Three.js ładowany dopiero przy otwarciu).
        h(Terrain3DMount, null),
        // 19.9.0: na komputerze nie ma pasków na całą szerokość — pasek aplikacji
        // (MapTopBar) i pasek kontekstu (w ToolDock) pływają nad mapą. Telefon
        // zachowuje nagłówek z paskiem kontekstu.
        chrome && mobile && h('header', { className: 'top-property-bar m-context-host' },
            h(ContextBar, null)),
        h('main', { className: 'workspace', 'aria-label': t('app.workspace') },
            // Kolumna mapy zachowuje dolny dok, a prawy panel nakłada się na mapę.
            h('div', { className: 'map-column' },
                h('div', { className: 'map-area', ref: mapAreaRef },
                    h(MapStage, { focusMap: exportSelectionMode, mapOnly }),
                    mapOnly && !exportSelectionMode && h('button', { ref: restoreButtonRef, type: 'button', className: 'map-only-exit', 'aria-label': t('mapOnly.exit'), title: t('mapOnly.exitHint'), onClick: () => dispatch(setMapOnly(false)) }, h(Focus, { size: 16 }), h('span', null, t('mapOnly.exit'))),
                    chrome && !mobile && h(MapTopBar, null),
                    chrome && !mobile && h(ToolDock, null),
                    chrome && !mobile && h(MapToolHint, null),
                    chrome && !mobile && h(BasemapSwitcher, null),
                    chrome && !mobile && h(MapLegend, null),
                    chrome && !mobile && h(WorkspaceCard, null),
                    chrome && !mobile && h(FloatingPanels, { excludePlaceCards: true }),
                    chrome && mobile && h(MobileShell, null)),
                chrome && h(Dock, { id: 'bottom' })),
            // Szyna modułów pozostaje przy prawej krawędzi; karta pojawia się
            // po jej lewej stronie, a mapa jest widoczna nad i pod nią.
            chrome && h(RightPanelDock, null)));
}

export function App() {
    const hub = useMemo(() => new ServiceHub(), []);
    return h(AppServicesProvider, { hub },
        h(Tooltip.Provider, { delayDuration: 200, skipDelayDuration: 90 },
            h(AppShell, null)));
}
