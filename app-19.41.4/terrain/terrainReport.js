import { paintSurface, SLOPE_COLORS } from './terrainSurface.js';
import { t } from '../i18n/index.js';

const number = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('pl-PL', { maximumFractionDigits: digits }) : '—';
const polygons = (geometry) => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
export function reportExtent(regions) {
    const extent = [Infinity, Infinity, -Infinity, -Infinity];
    for (const region of regions) for (const rings of polygons(region.geometry)) for (const ring of rings) for (const [x, y] of ring) {
        extent[0] = Math.min(extent[0], x); extent[1] = Math.min(extent[1], y);
        extent[2] = Math.max(extent[2], x); extent[3] = Math.max(extent[3], y);
    }
    return extent;
}

export function terrainReportModel(snapshot, now = new Date()) {
    const analysis = snapshot.areaAnalysis, stats = analysis.stats;
    return {
        analysis, stats, extent: reportExtent(analysis.regions), mode: snapshot.surfaceMode || 'combined',
        opacity: (snapshot.surfaceOpacity ?? 65) / 100, contours: Boolean(snapshot.showContours),
        samples: Boolean(snapshot.showAreaSamples), interval: snapshot.contourStep,
        complete: stats.validSamples === stats.sampleCount,
        coverage: stats.sampleCount ? stats.validSamples / stats.sampleCount * 100 : 0,
        date: now.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }),
    };
}

function wrap(context, text, x, y, maxWidth, lineHeight, maxLines = 4) {
    const words = String(text).split(/\s+/), lines = []; let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (context.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    for (let i = 0; i < Math.min(maxLines, lines.length); i++) {
        let textLine = lines[i];
        if (i === maxLines - 1 && lines.length > maxLines) {
            while (textLine && context.measureText(`${textLine}…`).width > maxWidth) textLine = textLine.slice(0, -1);
            textLine += '…';
        }
        context.fillText(textLine, x, y + i * lineHeight);
    }
}

/** 18.18.0 — pasek udziałów klas nachylenia i wynik robót ziemnych pod mapą raportu. */
function drawSlopeAndEarthworks(ctx, snapshot, x, y, width) {
    const summary = snapshot.slopeSummary, works = snapshot.earthworks;
    if (!summary && !works) return;
    if (summary) {
        ctx.fillStyle = '#111827'; ctx.font = '600 17px sans-serif';
        ctx.fillText(t('terrain.report.slopes', { mean: number(summary.meanSlopePercent, 1), p95: number(summary.p95SlopePercent, 1) }), x, y);
        let cursor = x;
        summary.classes.forEach((item, i) => {
            const w = width * item.share;
            if (w <= 0) return;
            ctx.fillStyle = `rgb(${SLOPE_COLORS[i].join(',')})`; ctx.fillRect(cursor, y + 12, Math.max(1, w), 20);
            cursor += w;
        });
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.strokeRect(x, y + 12, width, 20);
        const column = width / summary.classes.length;
        summary.classes.forEach((item, i) => {
            const cx = x + i * column;
            ctx.fillStyle = `rgb(${SLOPE_COLORS[i].join(',')})`; ctx.fillRect(cx, y + 44, 14, 12);
            ctx.fillStyle = '#334155'; ctx.font = '15px sans-serif';
            ctx.fillText(`${t(`terrain.slope.class.${i}`)}: ${number(item.share * 100, item.share < 0.1 ? 1 : 0)}%`, cx + 20, y + 55);
        });
    }
    if (works) {
        ctx.fillStyle = '#111827'; ctx.font = '600 16px sans-serif';
        const mode = works.mode === 'custom' ? t('terrain.earthworks.custom') : t('terrain.earthworks.balanced');
        ctx.fillText(t('terrain.report.earthworks', { level: number(works.level, 2), mode, cut: number(works.cutM3, 0), fill: number(works.fillM3, 0), net: number(works.netM3, 0) }), x, y + (summary ? 90 : 20));
    }
}

/** Fixed-size local report: no WMS downloads or viewport screenshots. */
export function drawTerrainReport(snapshot, tiles, contourResult, {
    createCanvas = () => document.createElement('canvas'), now = new Date(),
} = {}) {
    const model = terrainReportModel(snapshot, now), { analysis, stats, extent } = model;
    const canvas = createCanvas(); canvas.width = 1600; canvas.height = 1132;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111827'; ctx.font = '600 30px sans-serif'; ctx.fillText(t('terrain.report.title'), 40, 48);
    ctx.font = '17px sans-serif'; ctx.fillStyle = '#475569';
    ctx.fillText(`${model.date} · ${analysis.source} · ${analysis.verticalDatum} · EPSG:2180`, 40, 80);
    const names = analysis.selectionMode === 'rectangle' ? t('terrain.area.rectangle') : analysis.parcels.map((p) => p.name).join(', ');
    wrap(ctx, names, 40, 108, 1500, 20, 1);

    // 18.18.0: ramka mapy niższa o 120 px — pod nią spadki terenu i roboty ziemne.
    const frame = { x: 40, y: 136, width: 1080, height: 690 };
    const box = { x: 110, y: 186, width: 960, height: 550 };
    const width = Math.max(0.1, extent[2] - extent[0]), height = Math.max(0.1, extent[3] - extent[1]);
    const scale = Math.min(box.width / width, box.height / height);
    const ox = box.x + (box.width - width * scale) / 2, oy = box.y + (box.height - height * scale) / 2;
    const xy = ([x, y]) => [ox + (x - extent[0]) * scale, oy + (extent[3] - y) * scale];
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
    ctx.save(); ctx.beginPath(); ctx.rect(frame.x + 1, frame.y + 1, frame.width - 2, frame.height - 2); ctx.clip();
    // Coordinate grid, in canonical metric CRS.
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#64748b'; ctx.strokeStyle = '#e2e8f0';
    for (let i = 0; i <= 4; i++) {
        const x = extent[0] + width * i / 4, y = extent[1] + height * i / 4;
        const px = xy([x, extent[1]])[0], py = xy([extent[0], y])[1];
        ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + height * scale); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + width * scale, py); ctx.stroke();
        ctx.fillText(number(x, 0), px - 22, oy + height * scale + 22);
        ctx.fillText(number(y, 0), Math.max(frame.x + 5, ox - 62), py + 4);
    }
    for (const tile of tiles) {
        const image = createCanvas(); image.width = tile.width; image.height = tile.height;
        const imageCtx = image.getContext('2d'), data = imageCtx.createImageData(tile.width, tile.height);
        data.data.set(paintSurface(tile, model.mode, stats.minElevation, stats.maxElevation)); imageCtx.putImageData(data, 0, 0);
        const [x, y] = xy([tile.extent[0], tile.extent[3]]);
        ctx.globalAlpha = model.opacity;
        ctx.drawImage(image, x, y, (tile.extent[2] - tile.extent[0]) * scale, (tile.extent[3] - tile.extent[1]) * scale);
        ctx.globalAlpha = 1; image.width = 1; image.height = 1;
    }
    ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 2;
    for (const region of analysis.regions) for (const rings of polygons(region.geometry)) for (const ring of rings) {
        ctx.beginPath(); ring.forEach((coordinate, i) => { const [x, y] = xy(coordinate); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath(); ctx.stroke();
    }
    if (model.contours && contourResult) {
        ctx.font = '13px sans-serif'; let labels = 0;
        for (const line of contourResult.lines) {
            const major = Math.abs(line.elevation / contourResult.interval / 5 - Math.round(line.elevation / contourResult.interval / 5)) < 1e-5;
            ctx.beginPath(); line.coordinates.forEach((coordinate, i) => { const [x, y] = xy(coordinate); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
            ctx.strokeStyle = '#fff'; ctx.lineWidth = major ? 3 : 2; ctx.stroke();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = major ? 1.3 : 0.7; ctx.stroke();
            if (major && labels < 12 && line.coordinates.length > 10) {
                const [x, y] = xy(line.coordinates[Math.floor(line.coordinates.length / 2)]);
                const label = `${number(line.elevation, 2)} m`;
                ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(label, x, y); ctx.fillStyle = '#111827'; ctx.fillText(label, x, y); labels++;
            }
        }
    }
    if (model.samples) for (const point of analysis.points) {
        const [x, y] = xy(point.coordinate2180); ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = Number.isFinite(point.elevation) ? '#334155' : '#dc2626'; ctx.fill();
    }
    const markers = new Map();
    for (const [label, point, value, color] of [['MIN', stats.minPoint, stats.minElevation, '#2563eb'],
        [t('terrain.surface.meanMarker'), stats.meanPoint, stats.meanPointElevation, '#059669'], ['MAX', stats.maxPoint, stats.maxElevation, '#dc2626']]) {
        if (!point) continue;
        const key = point.join(':'), marker = markers.get(key) ?? { point, value, color, labels: [] };
        marker.labels.push(label); markers.set(key, marker);
    }
    ctx.font = '600 15px sans-serif';
    for (const marker of markers.values()) {
        const [x, y] = xy(marker.point); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = marker.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        const label = `${marker.labels.join(' / ')} ${number(marker.value)} m`;
        const tx = Math.max(frame.x + 10, Math.min(frame.x + frame.width - ctx.measureText(label).width - 10, x + 10));
        const ty = Math.max(frame.y + 25, y - 10);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeText(label, tx, ty); ctx.fillStyle = '#111827'; ctx.fillText(label, tx, ty);
    }
    // North and a metric scale bar.
    ctx.fillStyle = '#111827'; ctx.font = '600 18px sans-serif'; ctx.fillText('N', frame.x + frame.width - 45, frame.y + 35);
    ctx.beginPath(); ctx.moveTo(frame.x + frame.width - 38, frame.y + 44); ctx.lineTo(frame.x + frame.width - 45, frame.y + 70);
    ctx.lineTo(frame.x + frame.width - 31, frame.y + 70); ctx.closePath(); ctx.fill();
    const candidate = width / 5, magnitude = 10 ** Math.floor(Math.log10(candidate));
    const length = (candidate / magnitude >= 5 ? 5 : candidate / magnitude >= 2 ? 2 : 1) * magnitude;
    ctx.lineWidth = 3; ctx.strokeStyle = '#111827'; ctx.beginPath();
    ctx.moveTo(frame.x + 30, frame.y + frame.height - 35); ctx.lineTo(frame.x + 30 + length * scale, frame.y + frame.height - 35); ctx.stroke();
    ctx.font = '14px sans-serif'; ctx.fillText(`${number(length, 2)} m`, frame.x + 30, frame.y + frame.height - 12);
    ctx.restore();

    const x = 1160, maxWidth = 400;
    ctx.fillStyle = '#111827'; ctx.font = '600 22px sans-serif'; ctx.fillText(t('terrain.report.results'), x, 158);
    ctx.font = '17px sans-serif'; ctx.fillStyle = '#475569'; ctx.fillText(t(`terrain.surface.${model.mode}`), x, 192);
    wrap(ctx, model.contours ? model.interval ? t('terrain.report.contours', { interval: number(model.interval, 2) }) : t('terrain.contours.flat') : t('terrain.report.noContours'), x, 220, maxWidth, 21, 2);
    const rows = [[t('terrain.stat.lowest'), `${number(stats.minElevation)} m`], [t('terrain.stat.highest'), `${number(stats.maxElevation)} m`],
        [t('terrain.stat.mean'), `${number(stats.meanElevation)} m`], [t('terrain.stat.relief'), `${number(stats.elevationRange)} m`],
        [t('terrain.stat.planeSlope'), `${number(stats.planeSlopePercent, 2)}%`], [t('terrain.stat.direction'), stats.downhillDirection ?? '—']];
    rows.forEach(([label, value], i) => {
        ctx.font = '17px sans-serif'; ctx.fillStyle = '#475569'; ctx.fillText(label, x, 268 + i * 34);
        ctx.font = '600 19px sans-serif'; ctx.fillStyle = '#111827'; ctx.textAlign = 'right'; ctx.fillText(value, 1560, 268 + i * 34); ctx.textAlign = 'left';
    });
    ctx.font = '600 18px sans-serif'; ctx.fillStyle = model.complete ? '#166534' : '#b91c1c';
    ctx.fillText(model.complete ? t('terrain.progress.complete') : t('terrain.progress.partial'), x, 488);
    ctx.font = '17px sans-serif'; ctx.fillText(`${stats.validSamples}/${stats.sampleCount} · ${number(model.coverage)}%`, x, 518);
    ctx.font = '600 20px sans-serif'; ctx.fillStyle = '#111827'; ctx.fillText(t('terrain.report.legend'), x, 570);
    if (model.mode === 'slope') {
        SLOPE_COLORS.forEach((color, i) => { ctx.fillStyle = `rgb(${color.join(',')})`; ctx.fillRect(x, 594 + i * 30, 26, 18);
            ctx.fillStyle = '#334155'; ctx.font = '17px sans-serif'; ctx.fillText(t(`terrain.slope.class.${i}`), x + 40, 609 + i * 30); });
    } else if (model.mode === 'shade') {
        ctx.font = '16px sans-serif'; ctx.fillStyle = '#475569'; wrap(ctx, t('terrain.surface.shadeHint'), x, 606, maxWidth, 24, 4);
    } else {
        const gradient = ctx.createLinearGradient(x, 0, x + maxWidth, 0);
        ['#2563eb', '#06b6d4', '#22c55e', '#facc15', '#ef4444'].forEach((color, i) => gradient.addColorStop(i / 4, color));
        ctx.fillStyle = gradient; ctx.fillRect(x, 594, maxWidth, 20);
        ctx.font = '16px sans-serif'; ctx.fillStyle = '#475569'; ctx.fillText(`${number(stats.minElevation)} m`, x, 642);
        ctx.textAlign = 'right'; ctx.fillText(`${number(stats.maxElevation)} m`, 1560, 642); ctx.textAlign = 'left';
    }
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#475569';
    const spacing = [...new Set(analysis.spacingRange?.map((value) => number(value, 1)) ?? [])].join('-') || '—';
    wrap(ctx, t('terrain.report.spacing', { spacing }), x, 754, maxWidth, 23, 2);
    wrap(ctx, `${analysis.model} · ${analysis.heightType} · ${analysis.verticalDatum}`, x, 818, maxWidth, 23, 3);
    ctx.font = '15px sans-serif'; ctx.fillText(t('terrain.report.opacity', { opacity: Math.round(model.opacity * 100) }), x, 918);
    drawSlopeAndEarthworks(ctx, snapshot, 40, 856, 1080);
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#475569';
    wrap(ctx, t('terrain.report.note'), 40, 988, 1520, 23, 3);
    if (!model.complete) { ctx.fillStyle = '#b91c1c'; wrap(ctx, t('terrain.report.incomplete', { missing: stats.sampleCount - stats.validSamples }), 40, 1080, 1520, 22, 1); }
    return canvas;
}

/** A4 landscape graphic PDF. JPEG avoids font dependencies and preserves Polish labels. */
export function pdfFromJpeg(jpeg, width, height) {
    const encode = (s) => new TextEncoder().encode(s), parts = [], offsets = [0]; let length = 0;
    const add = (value) => { const data = typeof value === 'string' ? encode(value) : value; parts.push(data); length += data.byteLength; };
    const object = (id, body) => { offsets[id] = length; add(`${id} 0 obj\n${body}\nendobj\n`); };
    add('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4] = length;
    add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`);
    add(jpeg); add('\nendstream\nendobj\n');
    const commands = 'q\n841.89 0 0 595.28 0 0 cm\n/Im0 Do\nQ\n';
    object(5, `<< /Length ${encode(commands).length} >>\nstream\n${commands}endstream`);
    const xref = length;
    add('xref\n0 6\n0000000000 65535 f \n');
    for (let i = 1; i <= 5; i++) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
}

export async function createTerrainReportBlob(snapshot, tiles, contourResult, format) {
    const canvas = drawTerrainReport(snapshot, tiles, contourResult);
    try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, format === 'pdf' ? 'image/jpeg' : 'image/png', 0.94));
        if (!blob) throw new Error(t('terrain.report.error'));
        return format === 'pdf' ? pdfFromJpeg(new Uint8Array(await blob.arrayBuffer()), canvas.width, canvas.height) : blob;
    } finally { canvas.width = 1; canvas.height = 1; }
}
export function downloadTerrainReport(blob, format) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `mapownik-analiza-wysokosci-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}
