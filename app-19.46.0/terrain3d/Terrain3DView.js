import { createElement as h, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Focus, PictureInPicture2, RotateCcw, X } from 'lucide-react';
import { DETAIL, MARGINS, areaExtent, buildTerrainGrid, slopeShares } from './terrainGrid.js';
import { projectLines } from './terrain3dService.js';
import { SLOPE_BREAKS, SLOPE_COLORS } from '../terrain/terrainSurface.js';

/**
 * 19.41.0 — okno „Teren 3D”: model obszaru z siatki NMT GUGiK. Mapa zostaje pod spodem bez zmian (okno modalne).
 * Najważniejsze kontrolki w pasku, reszta w „Zaawansowane”. Three.js ładuje się dopiero tutaj (terrainScene.js).
 */
const EXAGGERATIONS = [1, 2, 5, 10];
const nf = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isMobile = () => window.matchMedia?.('(max-width: 760px), (pointer: coarse)').matches ?? false;
const lowMemory = () => (navigator.deviceMemory ?? 8) < 4;

function Pills({ label, options, value, onChange, disabled }) {
    return h('div', { className: 't3d-group', role: 'group', 'aria-label': label },
        h('span', { className: 't3d-group-label' }, label),
        h('div', { className: 't3d-pills' }, options.map(([v, text, title]) => h('button', {
            key: String(v), type: 'button', className: `t3d-pill${value === v ? ' is-selected' : ''}`, 'aria-pressed': value === v, title, disabled: disabled || false,
            onClick: () => onChange(v),
        }, text))));
}

/** Odległość punktu od granicy wielokątów (m) i czy leży wewnątrz. */
function boundaryInfo(geometries, x, y) {
    let best = Infinity; let inside = false;
    for (const g of geometries) {
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : g.type === 'LineString' ? [[g.coordinates]] : [];
        for (const poly of polys) {
            const ring = poly[0];
            if (g.type !== 'LineString') {
                let hit = false;
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]; const [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit; }
                inside = inside || hit;
            }
            for (let i = 1; i < ring.length; i++) {
                const [ax, ay] = ring[i - 1]; const [bx, by] = ring[i]; const dx = bx - ax; const dy = by - ay; const len = dx * dx + dy * dy;
                const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
                best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
            }
        }
    }
    return { dist: best, inside };
}

export function Terrain3DView({ request, objects, onClose }) {
    const mobile = useMemo(() => isMobile(), []);
    const [detail, setDetail] = useState(mobile || lowMemory() ? 'fast' : 'standard');
    const [margin, setMargin] = useState(request.margin ?? (request.kind === 'line' ? 50 : 50));
    const [allowSlowTiles, setAllowSlowTiles] = useState(false);
    const [grid, setGrid] = useState(null);
    const [status, setStatus] = useState({ busy: true, message: 'Przygotowanie…', fraction: 0, error: null });
    const [exaggeration, setExaggeration] = useState(null);
    const [colorMode, setColorMode] = useState('height');
    const [ortho, setOrtho] = useState(false);
    const [orthoState, setOrthoState] = useState(null);
    const [showLines, setShowLines] = useState(true);
    const [maximized, setMaximized] = useState(mobile);
    const [picked, setPicked] = useState(null);
    const [azimuth, setAzimuth] = useState(0);
    const [webglError, setWebglError] = useState(null);
    const [sceneVersion, setSceneVersion] = useState(0);
    const stageRef = useRef(null);
    const sceneRef = useRef(null);
    const dialogRef = useRef(null);
    const sceneModRef = useRef(null);

    const extent = useMemo(() => areaExtent(request.geometries, margin), [request, margin]);
    const lines = useMemo(() => {
        const outline = request.geometries.flatMap((g) => (g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : g.type === 'LineString' ? [g.coordinates] : []))
            .map((coords) => ({ coords, color: 0xe8432e }));
        return showLines ? [...outline, ...projectLines(objects, extent, request.objectId ? [request.objectId] : [])] : outline;
    }, [request, objects, extent, showLines]);

    // Okno modalne: reszta strony nieaktywna, Esc zamyka, fokus w oknie (jak okno raportu PDF).
    useEffect(() => {
        const root = document.getElementById('root');
        const wasInert = root?.inert;
        if (root) root.inert = true;
        const previous = document.activeElement;
        dialogRef.current?.focus();
        const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
        document.addEventListener('keydown', onKey, true);
        return () => { document.removeEventListener('keydown', onKey, true); if (root) root.inert = wasInert; if (previous?.isConnected) previous.focus(); };
    }, [onClose]);

    // Siatka wysokości: po zmianie obszaru, otoczenia, szczegółowości albo zgody na pobranie kafli z GUGiK.
    useEffect(() => {
        const controller = new AbortController();
        setStatus({ busy: true, message: 'Przygotowanie…', fraction: 0, error: null }); setPicked(null);
        buildTerrainGrid(extent, { detail, allowSlowTiles, signal: controller.signal, onProgress: (message, fraction) => setStatus((s) => ({ ...s, message, fraction })) })
            .then((g) => { if (controller.signal.aborted) return; setGrid(g); setStatus({ busy: false, message: '', fraction: 1, error: null }); })
            .catch((error) => { if (controller.signal.aborted || error?.name === 'AbortError') return; setStatus({ busy: false, message: '', fraction: 0, error: error?.message || String(error) }); });
        return () => controller.abort();
    }, [extent, detail, allowSlowTiles]);

    // Scena Three.js: tworzona dla każdej nowej siatki, zwalniana przy zmianie i zamknięciu.
    useEffect(() => {
        if (!grid || !stageRef.current) return undefined;
        let disposed = false; let scene = null;
        (async () => {
            const mod = sceneModRef.current ?? await import('./terrainScene.js');
            sceneModRef.current = mod;
            if (disposed) return;
            if (!mod.webglAvailable()) { setWebglError('Przeglądarka albo urządzenie nie obsługuje WebGL — użyj profilu terenu 2D.'); return; }
            const ex = exaggeration ?? mod.defaultExaggeration(grid);
            scene = mod.createTerrainScene(stageRef.current, grid, { exaggeration: ex, colorMode, lines, antialias: !mobile, pixelRatio: mobile ? 1 : window.devicePixelRatio, onChange: ({ azimuth: a }) => setAzimuth(a) });
            sceneRef.current = scene;
            stageRef.current.__terrain3d = scene; // diagnostyka: liczba klatek, pamięć GPU
            setSceneVersion((v) => v + 1);
            if (exaggeration == null) setExaggeration(ex);
        })().catch((error) => setWebglError(error?.message || String(error)));
        return () => { disposed = true; scene?.dispose(); if (sceneRef.current === scene) sceneRef.current = null; setOrthoState(null); };
    }, [grid, lines]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { if (exaggeration != null) sceneRef.current?.setExaggeration(exaggeration); }, [exaggeration]);
    useEffect(() => { sceneRef.current?.setColorMode(colorMode); }, [colorMode]);

    // Ortofotomapa: obraz WMS przez proxy portalu, dokładnie w zasięgu siatki (EPSG:2180).
    useEffect(() => {
        const scene = sceneRef.current;
        if (!grid || !scene) return undefined;
        if (!ortho) { scene.setOrtho(null); setOrthoState(null); return undefined; }
        let cancelled = false;
        const [x0, , x1] = grid.extent; const w = x1 - x0; const hgt = grid.extent[3] - grid.extent[1];
        const max = mobile ? 1024 : 2048; const scale = Math.min(1, max / Math.max(w * 2, hgt * 2));
        const width = Math.max(64, Math.round(w * 2 * scale)); const height = Math.max(64, Math.round(hgt * 2 * scale));
        const q = new URLSearchParams({ source: 'orthophoto', SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: 'Raster', STYLES: '', SRS: 'EPSG:2180', BBOX: grid.extent.join(','), WIDTH: String(width), HEIGHT: String(height), FORMAT: 'image/jpeg' });
        setOrthoState('loading');
        const img = new Image();
        img.onload = () => { if (cancelled || sceneRef.current !== scene) return; scene.setOrtho(img); setOrthoState('ready'); };
        img.onerror = () => { if (!cancelled) setOrthoState('error'); };
        img.src = `./api/wms.php?${q}`;
        return () => { cancelled = true; };
    }, [ortho, sceneVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    // Klik (bez przeciągania) → punkt: wysokość, spadek, odległość od granicy.
    const down = useRef(null);
    const onPointerDown = (e) => { down.current = [e.clientX, e.clientY]; };
    const onPointerMove = (e) => { const d = down.current; if (d && picked && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4) setPicked(null); };
    const onPointerUp = (e) => {
        const d = down.current; down.current = null;
        if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 4 || !sceneRef.current || !grid) return;
        const hit = sceneRef.current.pick(e.clientX, e.clientY);
        if (!hit) { setPicked(null); sceneRef.current.setMarker(null); return; }
        sceneRef.current.setMarker(hit.local);
        const fc = Math.round((hit.x - grid.extent[0]) / grid.stepX); const fr = Math.round((grid.extent[3] - hit.y) / grid.stepY);
        const slope = grid.slopes[Math.max(0, Math.min(grid.rows - 1, fr)) * grid.cols + Math.max(0, Math.min(grid.cols - 1, fc))];
        const rect = stageRef.current.getBoundingClientRect();
        setPicked({ ...hit, slope, ...boundaryInfo(request.geometries, hit.x, hit.y), sx: e.clientX - rect.left, sy: e.clientY - rect.top });
    };

    const resetView = () => { setPicked(null); sceneRef.current?.setMarker(null); sceneRef.current?.resetView('sw'); };

    const savePng = useCallback(() => {
        const scene = sceneRef.current; if (!scene || !grid) return;
        const img = scene.snapshot(2);
        const band = 64; const out = document.createElement('canvas'); out.width = img.width; out.height = img.height + band;
        const ctx = out.getContext('2d'); ctx.drawImage(img, 0, 0);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, img.height, out.width, band);
        ctx.fillStyle = '#1c2621'; ctx.font = '600 22px Inter, system-ui, sans-serif';
        ctx.fillText(`Teren 3D — ${request.label}`, 20, img.height + 26);
        ctx.font = '17px Inter, system-ui, sans-serif'; ctx.fillStyle = '#4b5550';
        const w = grid.extent[2] - grid.extent[0]; const hh = grid.extent[3] - grid.extent[1];
        ctx.fillText(`obszar ${nf.format(w)} × ${nf.format(hh)} m · siatka ${nf1.format(grid.step)} m · przewyższenie pionowe ${exaggeration}× · kolory: ${ortho ? 'ortofotomapa' : colorMode === 'slope' ? 'nachylenie' : 'wysokość'} · ${grid.sourceLabel} (${grid.datum}) · ${new Date().toLocaleDateString('pl-PL')}`, 20, img.height + 52);
        img.width = 0; img.height = 0; // zwolnienie tymczasowego płótna
        out.toBlob((blob) => {
            out.width = 0; out.height = 0;
            if (!blob) return;
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `teren-3d-${String(request.label).replace(/[^\p{L}\p{N}.-]+/gu, '_')}-${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }, 'image/png');
    }, [grid, exaggeration, colorMode, ortho, request.label]);

    const span = Math.max(extent[2] - extent[0], extent[3] - extent[1]);
    const detailOptions = Object.entries(DETAIL).map(([k, d]) => [k, d.label, k === 'detailed' && (mobile || span > 1500) ? 'Niedostępna na telefonie i dla obszaru powyżej 1,5 km' : null]);
    const shares = grid ? slopeShares(grid) : null;

    return h('div', { className: 't3d-backdrop', onPointerDown: (e) => { if (e.target === e.currentTarget) onClose(); } },
        h('div', { className: `t3d-window${maximized ? ' is-max' : ''}`, ref: dialogRef, tabIndex: -1, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 't3d-title' },
            h('header', { className: 't3d-head' },
                h('div', { className: 't3d-head-text' }, h('strong', { id: 't3d-title' }, `Teren 3D — ${request.label}`),
                    h('span', null, `otoczenie ${margin} m · obszar ${nf.format(extent[2] - extent[0])} × ${nf.format(extent[3] - extent[1])} m`)),
                !mobile && h('button', { type: 'button', className: 't3d-icon', 'aria-label': maximized ? 'Przywróć rozmiar okna' : 'Maksymalizuj', title: maximized ? 'Przywróć' : 'Maksymalizuj', onClick: () => setMaximized((m) => !m) }, h(maximized ? PictureInPicture2 : Focus, { size: 17, 'aria-hidden': true })),
                h('button', { type: 'button', className: 't3d-icon', 'aria-label': 'Zapisz obraz PNG', title: 'Zapisz obraz PNG', disabled: !grid || status.busy, onClick: savePng }, h(Download, { size: 17, 'aria-hidden': true })),
                h('button', { type: 'button', className: 't3d-icon', 'aria-label': 'Zamknij widok 3D', title: 'Zamknij (Esc)', onClick: onClose }, h(X, { size: 18, 'aria-hidden': true }))),
            h('div', { className: 't3d-toolbar' },
                h('button', { type: 'button', className: 't3d-btn', onClick: resetView, disabled: !grid }, h(RotateCcw, { size: 14, 'aria-hidden': true }), 'Widok domyślny'),
                h(Pills, { label: 'Przewyższenie', options: EXAGGERATIONS.map((v) => [v, `${v}×`]), value: exaggeration, onChange: setExaggeration, disabled: !grid }),
                h(Pills, { label: 'Kolory', options: [['height', 'Wysokość'], ['slope', 'Nachylenie']], value: colorMode, onChange: setColorMode, disabled: ortho }),
                h(Pills, { label: 'Szczegółowość', options: detailOptions, value: detail, onChange: (v) => { if (v === 'detailed' && (mobile || span > 1500)) return; setDetail(v); } }),
                h(Pills, { label: 'Otoczenie', options: MARGINS.map((m) => [m, `${m} m`]), value: margin, onChange: setMargin })),
            h('div', { className: 't3d-stage', ref: stageRef, onPointerDown, onPointerMove, onPointerUp, onWheel: () => { if (picked) setPicked(null); } },
                status.busy ? h('div', { className: 't3d-progress', role: 'status' },
                    h('span', null, status.message),
                    h('span', { className: 't3d-bar' }, h('span', { style: { width: `${Math.round((status.fraction ?? 0) * 100)}%` } })),
                    h('small', null, allowSlowTiles ? 'Kafle NMT 1 m pobierane z GUGiK — pierwsze pobranie bywa długie, kolejne otwarcia są natychmiastowe.' : 'Pierwsze otwarcie terenu trwa kilkanaście sekund; kolejne korzystają z pamięci serwera.')) : null,
                status.error ? h('div', { className: 't3d-error', role: 'alert' }, status.error) : null,
                webglError ? h('div', { className: 't3d-error', role: 'alert' }, webglError) : null,
                grid && !status.busy ? h('div', { className: 't3d-compass', title: 'Północ', style: { transform: `rotate(${(-azimuth * 180) / Math.PI}deg)` } }, h('span', null, 'N')) : null,
                grid && !status.busy ? h('div', { className: 't3d-legend' },
                    ortho ? h('span', null, orthoState === 'loading' ? 'Ortofotomapa: wczytywanie…' : orthoState === 'error' ? 'Ortofotomapa niedostępna' : 'Ortofotomapa GUGiK')
                        : colorMode === 'height'
                            ? h(Fragment, null, h('span', { className: 't3d-ramp' }), h('span', { className: 't3d-ramp-labels' }, h('span', null, `${nf1.format(grid.min)} m`), h('span', null, `${nf1.format(grid.max)} m n.p.m.`)))
                            : h('span', { className: 't3d-classes' }, ['0–2%', '2–5%', '5–10%', '10–15%', '> 15%'].map((l, i) => h('span', { key: l }, h('i', { style: { background: `rgb(${SLOPE_COLORS[i].join(',')})` } }), l, shares ? ` ${nf.format(shares.shares[i] * 100)}%` : ''))),
                    h('span', { className: 't3d-legend-meta' }, `Przewyższenie pionowe ${exaggeration ?? 1}× · siatka ${nf1.format(grid.step)} m`),
                    h('span', { className: 't3d-legend-meta' }, `${grid.sourceLabel} · ${grid.datum}`)) : null,
                picked ? h('div', { className: `t3d-tip${picked.sx > (stageRef.current?.clientWidth ?? 0) - 230 ? ' is-left' : ''}`, style: { left: picked.sx, top: picked.sy } },
                    h('strong', null, `${nf2.format(picked.height)} m n.p.m.`),
                    h('span', null, `spadek ≈ ${nf1.format(picked.slope)}%`),
                    h('span', null, picked.inside ? `w granicy, ${nf1.format(picked.dist)} m od krawędzi` : `${nf1.format(picked.dist)} m od granicy`),
                    h('small', null, `X ${nf1.format(picked.x)} · Y ${nf1.format(picked.y)} (PL-1992) · ${grid.datum}`)) : null),
            h('details', { className: 't3d-more' },
                h('summary', null, 'Zaawansowane'),
                h('div', { className: 't3d-more-body' },
                    h('label', { className: 't3d-check' }, h('input', { type: 'checkbox', checked: ortho, disabled: !grid, onChange: (e) => setOrtho(e.target.checked) }), 'Ortofotomapa na powierzchni'),
                    h('label', { className: 't3d-check' }, h('input', { type: 'checkbox', checked: showLines, onChange: (e) => setShowLines(e.target.checked) }), 'Linie i obrysy z projektu (profile, wieloboki)'),
                    grid?.source === 'points' && !allowSlowTiles ? h('div', { className: 't3d-hint' },
                        h('span', null, `Model z siatki ${grid.cols} × ${grid.rows} punktów (krok ${nf1.format(grid.step)} m). Dokładniejszy model z kafli NMT 1 m wymaga pobrania ${grid.missingTiles} ${grid.missingTiles === 1 ? 'kafla' : 'kafli'} z GUGiK — usługa odpowiada wolno (nawet kilka minut).`),
                        h('button', { type: 'button', className: 't3d-btn', disabled: status.busy, onClick: () => setAllowSlowTiles(true) }, 'Pobierz kafle NMT 1 m')) : null,
                    grid ? h('p', { className: 't3d-hint' }, `Źródło: ${grid.sourceLabel}; wysokości ${grid.datum}. Model i odczyty pochodzą z jednego źródła. Profil 2D korzysta z usługi punktowej GUGiK — w testach różniła się od kafli NMT o ok. 0,3 m. ${grid.holes ? `Braki danych: ${grid.holes} węzłów (szare). ` : ''}Trójkątów: ${nf.format((grid.cols - 1) * (grid.rows - 1) * 2)}.`) : null))));
}
