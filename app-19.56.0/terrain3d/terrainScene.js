import * as THREE from 'three';
import { OrbitControls } from 'three-orbit-controls';
import { SLOPE_BREAKS, SLOPE_COLORS } from '../terrain/terrainSurface.js';

/**
 * 19.41.0 — scena „Teren 3D” (Three.js 0.170). Tylko renderowanie: siatkę, wysokości i spadki liczy terrainGrid.js.
 * Układ sceny: x = wschód, y = północ (metry od środka obszaru, EPSG:2180), z = wysokość ponad minimum obszaru.
 * Przewyższenie = skala osi Z grupy terenu (bez przebudowy siatki). Rysowanie wyłącznie na żądanie (brak pętli).
 */
const HYPSO = [[0, [46, 125, 50]], [0.25, [124, 179, 66]], [0.5, [220, 210, 110]], [0.75, [196, 140, 80]], [1, [140, 90, 60]]];
const MISSING = [190, 190, 190];

function hypsoColor(t) {
    for (let i = 1; i < HYPSO.length; i++) {
        if (t <= HYPSO[i][0]) {
            const [t0, c0] = HYPSO[i - 1]; const [t1, c1] = HYPSO[i]; const k = (t - t0) / (t1 - t0 || 1);
            return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
        }
    }
    return HYPSO.at(-1)[1];
}
export const slopeColor = (s) => SLOPE_COLORS[SLOPE_BREAKS.filter((b) => s >= b).length];
export const HYPSO_STOPS = HYPSO;

export function webglAvailable() {
    try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/**
 * Tworzy scenę w kontenerze. grid — wynik buildTerrainGrid; opts: { exaggeration, colorMode: 'height'|'slope', lines: [{ coords: [[x,y]…] (2180), color }],
 * onChange(state) — po każdej klatce (azymut kamery), pixelRatio, antialias }.
 */
export function createTerrainScene(container, grid, opts = {}) {
    const cx = (grid.extent[0] + grid.extent[2]) / 2; const cy = (grid.extent[1] + grid.extent[3]) / 2;
    const zBase = Number.isFinite(grid.min) ? grid.min : 0;
    const relief = Math.max(0.5, (grid.max ?? zBase) - zBase);
    const span = Math.max(grid.extent[2] - grid.extent[0], grid.extent[3] - grid.extent[1]);
    const state = { exaggeration: opts.exaggeration ?? 1, colorMode: opts.colorMode ?? 'height', disposed: false, pending: false, marker: null, ortho: null };

    const renderer = new THREE.WebGLRenderer({ antialias: opts.antialias ?? true, preserveDrawingBuffer: false, powerPreference: 'default' });
    renderer.setPixelRatio(Math.min(opts.pixelRatio ?? window.devicePixelRatio ?? 1, 1.5));
    renderer.setClearColor(0xeef2f0, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.className = 't3d-canvas';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, span / 2000, span * 30);
    camera.up.set(0, 0, 1);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f86, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-1, 1, 1.2); // z północnego zachodu, jak cieniowanie NMT
    scene.add(sun);

    // ---- siatka terenu
    const { cols, rows, stepX, stepY, values, slopes } = grid;
    const positions = new Float32Array(cols * rows * 3);
    const uvs = new Float32Array(cols * rows * 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c; const v = values[i];
        positions[i * 3] = grid.extent[0] + c * stepX - cx;
        positions[i * 3 + 1] = grid.extent[3] - r * stepY - cy;
        positions[i * 3 + 2] = Number.isFinite(v) ? v - zBase : 0;
        uvs[i * 2] = c / (cols - 1); uvs[i * 2 + 1] = 1 - r / (rows - 1);
    }
    const IndexArray = cols * rows > 65535 ? Uint32Array : Uint16Array;
    const index = new IndexArray((cols - 1) * (rows - 1) * 6);
    let k = 0;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c; const b = a + 1; const d = a + cols; const e = d + 1;
        index[k++] = a; index[k++] = d; index[k++] = b; index[k++] = b; index[k++] = d; index[k++] = e;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeVertexNormals();
    const colors = new Uint8Array(cols * rows * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new THREE.Mesh(geometry, material);
    const terrain = new THREE.Group();
    terrain.add(mesh);
    scene.add(terrain);

    function paint() {
        for (let i = 0; i < cols * rows; i++) {
            const v = values[i];
            const rgb = !Number.isFinite(v) ? MISSING : state.colorMode === 'slope' ? slopeColor(slopes[i]) : hypsoColor((v - zBase) / relief);
            colors[i * 3] = rgb[0]; colors[i * 3 + 1] = rgb[1]; colors[i * 3 + 2] = rgb[2];
        }
        geometry.attributes.color.needsUpdate = true;
    }
    paint();

    // ---- linie na powierzchni (granica, profile): próbkowanie co pół kroku siatki, wysokość z siatki + 0,3 m
    const lineObjects = [];
    const zAt = (x, y) => {
        const fc = (x - grid.extent[0]) / stepX; const fr = (grid.extent[3] - y) / stepY;
        const c0 = Math.max(0, Math.min(cols - 2, Math.floor(fc))); const r0 = Math.max(0, Math.min(rows - 2, Math.floor(fr)));
        const ax = Math.max(0, Math.min(1, fc - c0)); const ay = Math.max(0, Math.min(1, fr - r0));
        const p = (rr, cc) => positions[(rr * cols + cc) * 3 + 2];
        return p(r0, c0) * (1 - ax) * (1 - ay) + p(r0, c0 + 1) * ax * (1 - ay) + p(r0 + 1, c0) * (1 - ax) * ay + p(r0 + 1, c0 + 1) * ax * ay;
    };
    for (const line of opts.lines ?? []) {
        const pts = [];
        const step = Math.min(stepX, stepY) / 2;
        for (let i = 1; i < line.coords.length; i++) {
            const [x0, y0] = line.coords[i - 1]; const [x1, y1] = line.coords[i];
            const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
            for (let j = i === 1 ? 0 : 1; j <= n; j++) { const x = x0 + ((x1 - x0) * j) / n; const y = y0 + ((y1 - y0) * j) / n; pts.push(new THREE.Vector3(x - cx, y - cy, zAt(x, y) + 0.3)); }
        }
        if (pts.length < 2) continue;
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const obj = new THREE.Line(g, new THREE.LineBasicMaterial({ color: line.color ?? 0xe8432e, depthTest: true }));
        obj.renderOrder = 2;
        terrain.add(obj); lineObjects.push(obj);
    }

    // ---- znacznik punktu
    const markerGeom = new THREE.SphereGeometry(1, 16, 12);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x1d4ed8 });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.visible = false;
    scene.add(marker);
    const placeMarker = () => {
        if (!state.marker) { marker.visible = false; return; }
        const [lx, ly, lz] = state.marker;
        marker.position.set(lx, ly, lz * state.exaggeration);
        marker.scale.setScalar(Math.max(0.6, span / 220));
        marker.visible = true;
    };

    // ---- kamera i sterowanie
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; // bezwładność wymagałaby stałej pętli rysowania
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = span / 50; controls.maxDistance = span * 6;

    function requestRender() {
        if (state.pending || state.disposed) return;
        state.pending = true;
        requestAnimationFrame(() => {
            state.pending = false;
            if (state.disposed) return;
            renderer.render(scene, camera);
            opts.onChange?.({ azimuth: controls.getAzimuthalAngle() });
        });
    }
    controls.addEventListener('change', requestRender);

    function resetView(kind = 'sw', zoom = 0.85) {
        const zMid = (relief * state.exaggeration) / 2;
        controls.target.set(0, 0, zMid);
        // Odległość, przy której cały obszar mieści się w kadrze (pole widzenia 40°, zapas na proporcje okna).
        const aspect = Math.max(0.35, camera.aspect || 1);
        const dist = ((span * 0.62) / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, aspect)) * zoom;
        if (kind === 'top') camera.position.set(0, -0.0001 * span, zMid + dist);
        else { const el = (35 * Math.PI) / 180; camera.position.set(-Math.cos(el) * dist * Math.SQRT1_2, -Math.cos(el) * dist * Math.SQRT1_2, zMid + Math.sin(el) * dist); }
        camera.updateProjectionMatrix();
        controls.update();
        requestRender();
    }

    function resize() {
        const w = Math.max(1, container.clientWidth); const h = Math.max(1, container.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        requestRender();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    function setExaggeration(value) {
        const zMidOld = (relief * state.exaggeration) / 2;
        state.exaggeration = value;
        terrain.scale.z = value;
        const zMid = (relief * value) / 2;
        controls.target.z += zMid - zMidOld; camera.position.z += zMid - zMidOld;
        controls.update(); placeMarker(); requestRender();
    }
    setExaggeration(state.exaggeration);
    resetView('sw');

    const raycaster = new THREE.Raycaster();
    /** Punkt terenu pod kursorem: { x, y } (2180), height (m n.p.m.), local [x, y, z] — albo null. */
    function pick(clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (!hit) return null;
        const local = terrain.worldToLocal(hit.point.clone());
        return { x: local.x + cx, y: local.y + cy, height: local.z + zBase, local: [local.x, local.y, local.z] };
    }
    function setMarker(local) { state.marker = local; placeMarker(); requestRender(); }

    function setColorMode(mode) { state.colorMode = mode; if (!state.ortho) paint(); requestRender(); }

    /** Ortofotomapa jako tekstura (obraz dokładnie w zasięgu siatki, EPSG:2180) albo null — powrót do kolorów. */
    function setOrtho(image) {
        if (state.ortho) { state.ortho.dispose(); state.ortho = null; }
        if (image) {
            const tex = new THREE.Texture(image);
            tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); tex.needsUpdate = true;
            state.ortho = tex; material.map = tex; material.vertexColors = false;
        } else { material.map = null; material.vertexColors = true; paint(); }
        material.needsUpdate = true;
        requestRender();
    }

    /** Obraz bieżącego widoku (canvas 2D) w zadanej skali — do PNG i raportu. */
    function snapshot(scale = 2) {
        const w = Math.max(1, container.clientWidth); const h = Math.max(1, container.clientHeight);
        const prev = renderer.getPixelRatio();
        renderer.setPixelRatio(scale); renderer.setSize(w, h, false);
        renderer.render(scene, camera);
        const out = document.createElement('canvas'); out.width = renderer.domElement.width; out.height = renderer.domElement.height;
        out.getContext('2d').drawImage(renderer.domElement, 0, 0);
        renderer.setPixelRatio(prev); renderer.setSize(w, h, false); requestRender();
        return out;
    }

    function dispose() {
        if (state.disposed) return;
        state.disposed = true;
        ro.disconnect();
        controls.removeEventListener('change', requestRender);
        controls.dispose();
        geometry.dispose(); material.dispose(); state.ortho?.dispose();
        for (const l of lineObjects) { l.geometry.dispose(); l.material.dispose(); }
        markerGeom.dispose(); markerMat.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
    }

    return { setExaggeration, setColorMode, setOrtho, resetView, pick, setMarker, snapshot, requestRender, dispose, renderer, mesh, camera, info: () => renderer.info, zBase, relief, span, center: [cx, cy], triangles: index.length / 3 };
}

/** Przewyższenie domyślne: 1× przy wyraźnej rzeźbie, więcej na terenie płaskim. */
export function defaultExaggeration(grid) {
    const span = Math.max(grid.extent[2] - grid.extent[0], grid.extent[3] - grid.extent[1]);
    const ratio = (grid.max - grid.min) / span;
    return ratio > 0.08 ? 1 : ratio > 0.03 ? 2 : ratio > 0.01 ? 5 : 10;
}
